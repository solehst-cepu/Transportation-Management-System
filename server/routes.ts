import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, Response } from 'express';
import {
  AuthedRequest,
  clearGoogleOAuthTokenForRequest,
  clearSessionCookies,
  getFirebaseAppletConfig,
  getGoogleOAuthTokenFromRequest,
  getSessionFromRequest,
  requireAuth,
  requireCsrf,
  requireRole,
  resolveAndRegisterGoogleUser,
  setSessionCookies,
  verifyGoogleSsoAndResolveUser,
} from './auth.ts';
import {
  appendAuditLog,
  appendVehicleHistory,
  computeDynamicVehicleUsageStatus,
  computeMaintenanceStatusAndReminder,
  getDriverBlockReasons,
  getTodayWibIsoDate,
  getVehicleBlockReasons,
  nextSequentialCode,
  pushNotification,
  upsertLinkedExpense,
} from './businessLogic.ts';
import { dbStore, runWithGoogleOAuthToken, SHEET_KEYS, SheetsSyncError } from './sheetsStore.ts';
import {
  Booking,
  BookingStatus,
  INITIAL_INSPECTION_TEMPLATE_ITEMS,
  Inspection,
  InspectionItemResult,
  MaintenancePlan,
  Repair,
  RepairStatus,
  UserRole,
  Vehicle,
} from '../shared/types.ts';

export const apiRouter = Router();

apiRouter.use(requireCsrf);

// Bind request Google Workspace OAuth access token into AsyncLocalStorage for dual-mode Sheets/Drive persistence
apiRouter.use((req, _res, next) => {
  const oauthToken = getGoogleOAuthTokenFromRequest(req);
  runWithGoogleOAuthToken(oauthToken, next);
});

// Public health & storage diagnostics
apiRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    diagnostics: dbStore.getStorageDiagnostics(),
  });
});

// Serve uploaded fallback files
apiRouter.get('/uploads/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const candidate1 = path.resolve(process.cwd(), '.data', 'uploads', safeName);
  const candidate2 = path.join('/tmp', safeName);
  const target = fs.existsSync(candidate1) ? candidate1 : fs.existsSync(candidate2) ? candidate2 : null;
  if (!target) {
    res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    return;
  }
  res.sendFile(target);
});

// Auth configuration
apiRouter.get('/auth/config', (req, res) => {
  const gisClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || null;
  const firebaseCfg = getFirebaseAppletConfig();
  const firebaseGoogleAuthEnabled = Boolean(firebaseCfg?.apiKey && firebaseCfg?.projectId);
  const isVercel = process.env.VERCEL === '1';
  const sessionUser = getSessionFromRequest(req);
  res.json({
    googleClientId: gisClientId,
    firebaseGoogleAuthEnabled,
    firebaseProjectId: firebaseCfg?.projectId || null,
    allowedDomain: process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id',
    previewAuthEnabled: !gisClientId && !isVercel,
    authenticated: Boolean(sessionUser),
    storage: dbStore.getStorageDiagnostics(),
  });
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({
    user: req.sessionUser,
    storage: dbStore.getStorageDiagnostics(),
    settings: db.SETTINGS[0] || null,
  });
});

// Real Google Identity Services / Firebase Google SSO login
apiRouter.post('/auth/google', async (req, res) => {
  try {
    const { credential, idToken, firebaseIdToken, oauthAccessToken, loginScope } = req.body as {
      credential?: string;
      idToken?: string;
      firebaseIdToken?: string;
      oauthAccessToken?: string;
      loginScope?: UserRole;
    };
    const token = credential || idToken;
    if (!token && !firebaseIdToken) {
      res.status(400).json({ error: 'Token Google SSO wajib dikirim.' });
      return;
    }
    const user = await runWithGoogleOAuthToken(
      oauthAccessToken || getGoogleOAuthTokenFromRequest(req),
      () =>
        verifyGoogleSsoAndResolveUser({
          credential: token,
          firebaseIdToken,
          oauthAccessToken,
          loginScope,
        })
    );
    const { csrfToken, sessionToken } = setSessionCookies(req, res, user, oauthAccessToken);
    const db = await dbStore.getSnapshot();
    res.json({
      user,
      csrfToken,
      sessionToken,
      settings: db.SETTINGS[0] || null,
      storage: dbStore.getStorageDiagnostics(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verifikasi Google SSO gagal.';
    const status = msg.startsWith('Akses') ? 403 : 401;
    res.status(status).json({ error: msg });
  }
});

// Sandbox/Preview-only login when GOOGLE_CLIENT_ID is not yet provisioned (disabled automatically in Vercel or when GOOGLE_CLIENT_ID exists)
apiRouter.post('/auth/preview-session', async (req, res) => {
  if (process.env.GOOGLE_CLIENT_ID || process.env.VERCEL === '1') {
    res.status(403).json({
      error: 'Preview session dinonaktifkan karena Google SSO aktif pada lingkungan produksi.',
    });
    return;
  }

  try {
    const { email, name, role } = req.body as {
      email?: string;
      name?: string;
      role?: UserRole;
    };
    const allowedDomain = (process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id').toLowerCase();
    const targetEmail = (email || `soleh.st@${allowedDomain}`).trim().toLowerCase();
    const targetName = (name || targetEmail.split('@')[0]).trim();

    const user = await resolveAndRegisterGoogleUser({
      email: targetEmail,
      name: targetName,
      hostedDomain: allowedDomain,
      allowedDomain,
      strictDomainCheck: false,
      requestedRole: role,
    });
    const { csrfToken, sessionToken } = setSessionCookies(req, res, user);
    res.json({ user, csrfToken, sessionToken });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal membuat sesi preview.',
    });
  }
});

apiRouter.post('/auth/logout', (req, res) => {
  clearGoogleOAuthTokenForRequest(req);
  clearSessionCookies(req, res);
  res.json({ ok: true });
});

// File upload (Google Drive API v3 when configured, else server upload folder)
apiRouter.post('/uploads', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { fileName, mimeType, base64Data } = req.body as {
      fileName: string;
      mimeType: string;
      base64Data: string;
    };
    if (!fileName || !base64Data) {
      res.status(400).json({ error: 'Nama file dan konten wajib disertakan.' });
      return;
    }
    const result = await dbStore.uploadFileToDriveOrStore(
      fileName,
      mimeType || 'application/octet-stream',
      base64Data
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengunggah berkas.',
    });
  }
});

// Dashboard summary (strictly role-scoped)
apiRouter.get('/dashboard/summary', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  const db = await dbStore.getSnapshot();
  const settings = db.SETTINGS[0];
  const today = getTodayWibIsoDate();

  if (user.role === 'USER') {
    const userEmailNorm = user.email.trim().toLowerCase();
    const myBookings = db.BOOKINGS.filter(
      (b) => String(b.requester_email || '').trim().toLowerCase() === userEmailNorm
    );
    const myNotifications = db.NOTIFICATIONS.filter(
      (n) => String(n.recipient_email || '').trim().toLowerCase() === userEmailNorm
    );

    res.json({
      role: 'USER',
      stats: {
        totalBookings: myBookings.length,
        pendingReview: myBookings.filter((b) =>
          ['Diajukan', 'Dalam Review GA', 'Pencarian Vendor', 'Menunggu Penawaran'].includes(b.status)
        ).length,
        needsRevision: myBookings.filter((b) => b.status === 'Perlu Revisi').length,
        scheduledOrBooked: myBookings.filter((b) =>
          ['Dijadwalkan', 'Dipesan', 'Dalam Perjalanan'].includes(b.status)
        ).length,
        completed: myBookings.filter((b) => b.status === 'Selesai').length,
      },
      recentBookings: myBookings.slice(0, 8),
      unreadNotifications: myNotifications.filter((n) => !n.is_read).length,
    });
    return;
  }

  // ADMIN full summary
  const vehiclesWithUsage = db.VEHICLES.map((v) => ({
    ...v,
    usage_status: computeDynamicVehicleUsageStatus(db, v.vehicle_id),
  }));

  const docThresholdDays = settings?.doc_expiry_warning_days ?? 30;
  const docThresholdDate = new Date();
  docThresholdDate.setDate(docThresholdDate.getDate() + docThresholdDays);
  const thresholdStr = docThresholdDate.toISOString().slice(0, 10);

  const expiringDocs = vehiclesWithUsage.filter(
    (v) =>
      v.admin_status === 'aktif' &&
      ((v.stnk_expiry && v.stnk_expiry <= thresholdStr) ||
        (v.tax_due_date && v.tax_due_date <= thresholdStr) ||
        (v.kir_expiry && v.kir_expiry <= thresholdStr) ||
        (v.insurance_expiry && v.insurance_expiry <= thresholdStr))
  );

  const computedMaintenance = db.MAINTENANCE_PLANS.map((m) => {
    const veh = vehiclesWithUsage.find((v) => v.vehicle_id === m.vehicle_id);
    const calc = computeMaintenanceStatusAndReminder(m, veh?.last_odometer || 0);
    return { ...m, ...calc, vehicle_name: veh?.vehicle_name || '', plate_number: veh?.plate_number || '' };
  });

  const currentMonth = today.slice(0, 7);
  const currentMonthCost = db.EXPENSES.filter((e) => e.expense_date.startsWith(currentMonth)).reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  // Monthly cost trend (last 6 months)
  const monthlyCostsMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    monthlyCostsMap.set(ym, 0);
  }
  for (const exp of db.EXPENSES) {
    const ym = (exp.expense_date || '').slice(0, 7);
    if (monthlyCostsMap.has(ym)) {
      monthlyCostsMap.set(ym, (monthlyCostsMap.get(ym) || 0) + Number(exp.amount || 0));
    }
  }

  // Vehicle usage chart
  const vehicleUsageChart = vehiclesWithUsage.map((v) => {
    const tripCount = db.BOOKINGS.filter(
      (b) =>
        b.allocated_vehicle_ids.includes(v.vehicle_id) &&
        ['Dijadwalkan', 'Dalam Perjalanan', 'Selesai'].includes(b.status)
    ).length;
    const totalCost = db.EXPENSES.filter((e) => e.vehicle_id === v.vehicle_id).reduce(
      (s, e) => s + Number(e.amount || 0),
      0
    );
    return {
      name: v.plate_number,
      vehicle_name: v.vehicle_name,
      trips: tripCount,
      cost: totalCost,
    };
  });

  const activeRepairs = db.REPAIRS.filter((r) => r.status !== 'Ditutup');
  const vehiclesWithoutRecentInspection = vehiclesWithUsage.filter((v) => {
    if (v.admin_status !== 'aktif') return false;
    const latest = db.INSPECTIONS.find((i) => i.vehicle_id === v.vehicle_id && i.status !== 'Draft');
    if (!latest) return true;
    const diffDays = (Date.now() - new Date(latest.inspected_at).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 14;
  });

  res.json({
    role: 'ADMIN',
    bookingStats: {
      total: db.BOOKINGS.length,
      pendingReview: db.BOOKINGS.filter((b) => ['Diajukan', 'Dalam Review GA'].includes(b.status)).length,
      needsRevision: db.BOOKINGS.filter((b) => b.status === 'Perlu Revisi').length,
      scheduled: db.BOOKINGS.filter((b) => ['Dijadwalkan', 'Dipesan', 'Dalam Perjalanan'].includes(b.status)).length,
      externalActive: db.BOOKINGS.filter(
        (b) =>
          b.booking_kind === 'EXTERNAL' &&
          !['Selesai', 'Ditolak', 'Dibatalkan', 'Draft'].includes(b.status)
      ).length,
      completed: db.BOOKINGS.filter((b) => b.status === 'Selesai').length,
    },
    fleetStats: {
      totalVehicles: vehiclesWithUsage.length,
      activeVehicles: vehiclesWithUsage.filter((v) => v.admin_status === 'aktif').length,
      availableVehicles: vehiclesWithUsage.filter(
        (v) =>
          v.admin_status === 'aktif' &&
          !v.safety_blocked &&
          v.eligibility_status !== 'tidak_layak' &&
          v.usage_status === 'tersedia'
      ).length,
      inUseVehicles: vehiclesWithUsage.filter((v) => v.usage_status === 'dalam_perjalanan' || v.usage_status === 'dijadwalkan').length,
      inRepairVehicles: activeRepairs.length,
      inMaintenanceVehicles: computedMaintenance.filter((m) => m.status === 'Dalam Pengerjaan').length,
      unfitVehicles: vehiclesWithUsage.filter((v) => v.eligibility_status === 'tidak_layak' || v.safety_blocked).length,
      inactiveVehicles: vehiclesWithUsage.filter((v) => v.admin_status === 'tidak_aktif').length,
      pendingInspections: vehiclesWithoutRecentInspection.length,
      upcomingMaintenance: computedMaintenance.filter((m) =>
        ['Mendekati Jadwal', 'Jatuh Tempo', 'Terlambat'].includes(m.status)
      ).length,
      expiringDocsCount: expiringDocs.length,
      currentMonthCost,
    },
    charts: {
      monthlyCosts: Array.from(monthlyCostsMap.entries()).map(([month, total]) => ({
        month,
        total,
      })),
      vehicleUsage: vehicleUsageChart,
    },
    lists: {
      unfitVehicles: vehiclesWithUsage.filter(
        (v) => v.eligibility_status === 'tidak_layak' || v.safety_blocked
      ),
      activeRepairs,
      upcomingMaintenance: computedMaintenance.filter((m) => m.status !== 'Terjadwal').slice(0, 6),
      recentInspections: db.INSPECTIONS.slice(0, 6),
      expiringDocs,
      recentBookings: db.BOOKINGS.slice(0, 8),
      recentActivity: db.VEHICLE_HISTORY.slice(0, 8),
    },
  });
});

// ========================
// USER PROFILE
// ========================
apiRouter.get('/users/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const user = req.sessionUser!;
  const schoolUser = db.USERS.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
  res.json({ profile: schoolUser || user });
});

apiRouter.put('/users/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  const { name, department_id, position, phone } = req.body as {
    name?: string;
    department_id?: string;
    position?: string;
    phone?: string;
  };
  const updated = await dbStore.mutate(['USERS', 'AUDIT_LOGS'], (db) => {
    const found = db.USERS.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
    if (found) {
      if (name) found.name = name;
      if (department_id !== undefined) found.department_id = department_id;
      if (position !== undefined) found.position = position;
      if (phone !== undefined) found.phone = phone;
      appendAuditLog(db, user, 'UPDATE_PROFILE', 'USERS', found.id, `Memperbarui profil ${found.email}`);
      return found;
    }
    return user;
  });
  res.json({ profile: updated });
});

// ========================
// MASTER DEPARTMENTS (Read allowed for authenticated users, write ADMIN only)
// ========================
apiRouter.get('/departments', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const rows =
    req.sessionUser!.role === 'ADMIN'
      ? db.DEPARTMENTS
      : db.DEPARTMENTS.filter((d) => d.active_status === 'aktif');
  res.json({ departments: rows });
});

apiRouter.post('/departments', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const created = await dbStore.mutate(['DEPARTMENTS', 'AUDIT_LOGS'], (db) => {
    const item = {
      department_id: crypto.randomUUID(),
      department_code: String(req.body.department_code || '').toUpperCase(),
      department_name: String(req.body.department_name || ''),
      category: req.body.category || 'Akademik',
      person_in_charge: String(req.body.person_in_charge || ''),
      email: String(req.body.email || ''),
      phone: String(req.body.phone || ''),
      active_status: req.body.active_status || 'aktif',
    };
    db.DEPARTMENTS.push(item);
    appendAuditLog(db, req.sessionUser!, 'CREATE', 'DEPARTMENTS', item.department_id, `Tambah unit ${item.department_name}`);
    return item;
  });
  res.status(201).json({ department: created });
});

apiRouter.put('/departments/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['DEPARTMENTS', 'AUDIT_LOGS'], (db) => {
    const idx = db.DEPARTMENTS.findIndex((d) => d.department_id === req.params.id);
    if (idx === -1) return null;
    db.DEPARTMENTS[idx] = { ...db.DEPARTMENTS[idx], ...req.body, department_id: req.params.id };
    appendAuditLog(
      db,
      req.sessionUser!,
      'UPDATE',
      'DEPARTMENTS',
      req.params.id,
      `Perbarui unit ${db.DEPARTMENTS[idx].department_name}`
    );
    return db.DEPARTMENTS[idx];
  });
  if (!updated) {
    res.status(404).json({ error: 'Unit/Departemen tidak ditemukan.' });
    return;
  }
  res.json({ department: updated });
});

apiRouter.delete('/departments/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await dbStore.mutate(
      ['DEPARTMENTS', 'AUDIT_LOGS'],
      (db) => {
        const dept = db.DEPARTMENTS.find((d) => d.department_id === req.params.id);
        if (!dept) return null;
        const hasHistory =
          db.BOOKINGS.some((b) => b.department_id === req.params.id) ||
          db.USERS.some((u) => u.department_id === req.params.id);
        if (hasHistory && !force) {
          dept.active_status = 'nonaktif';
          appendAuditLog(
            db,
            req.sessionUser!,
            'SOFT_DELETE',
            'DEPARTMENTS',
            dept.department_id,
            `Nonaktifkan unit ${dept.department_name} (memiliki riwayat transaksi)`
          );
          return { softDeleted: true, hasHistory: true, department: dept };
        }
        db.DEPARTMENTS = db.DEPARTMENTS.filter((d) => d.department_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'DEPARTMENTS',
          req.params.id,
          `Hapus${force && hasHistory ? ' permanen' : ''} unit ${dept.department_name}`
        );
        return { softDeleted: false, hasHistory };
      },
      { requireRemoteSync: true }
    );
    if (!result) {
      res.status(404).json({ error: 'Unit tidak ditemukan.' });
      return;
    }
    res.json(result);
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus unit.');
  }
});

// ========================
// VEHICLE TYPES
// ========================
apiRouter.get('/vehicle-types', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const rows =
    req.sessionUser!.role === 'ADMIN'
      ? db.VEHICLE_TYPES
      : db.VEHICLE_TYPES.filter((t) => t.active_status === 'aktif');
  res.json({ vehicleTypes: rows });
});

apiRouter.post('/vehicle-types', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const created = await dbStore.mutate(['VEHICLE_TYPES', 'AUDIT_LOGS'], (db) => {
      const code = String(req.body.code || '').trim().toUpperCase();
      const name = String(req.body.name || '').trim();
      if (!code || !name) {
        throw new Error('Kode dan nama jenis kendaraan wajib diisi.');
      }
      if (db.VEHICLE_TYPES.some((t) => t.code.toUpperCase() === code)) {
        throw new Error(`Kode jenis kendaraan "${code}" sudah terdaftar.`);
      }
      const item = {
        vehicle_type_id: crypto.randomUUID(),
        code,
        name,
        category: req.body.category === 'Eksternal' ? ('Eksternal' as const) : ('Internal' as const),
        default_capacity: Number(req.body.default_capacity || 7),
        required_sim: String(req.body.required_sim || 'SIM A'),
        description: String(req.body.description || ''),
        active_status: req.body.active_status === 'nonaktif' ? ('nonaktif' as const) : ('aktif' as const),
      };
      db.VEHICLE_TYPES.push(item);
      appendAuditLog(db, req.sessionUser!, 'CREATE', 'VEHICLE_TYPES', item.vehicle_type_id, `Tambah jenis kendaraan ${item.name} (${item.category})`);
      return item;
    });
    res.status(201).json({ vehicleType: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menambah jenis kendaraan.' });
  }
});

apiRouter.put('/vehicle-types/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const updated = await dbStore.mutate(['VEHICLE_TYPES', 'AUDIT_LOGS'], (db) => {
      const idx = db.VEHICLE_TYPES.findIndex((t) => t.vehicle_type_id === req.params.id);
      if (idx === -1) return null;
      const nextCode = req.body.code !== undefined ? String(req.body.code).trim().toUpperCase() : db.VEHICLE_TYPES[idx].code;
      if (
        nextCode &&
        db.VEHICLE_TYPES.some((t) => t.vehicle_type_id !== req.params.id && t.code.toUpperCase() === nextCode)
      ) {
        throw new Error(`Kode jenis kendaraan "${nextCode}" sudah digunakan.`);
      }
      db.VEHICLE_TYPES[idx] = {
        ...db.VEHICLE_TYPES[idx],
        ...req.body,
        code: nextCode,
        vehicle_type_id: req.params.id,
      };
      appendAuditLog(
        db,
        req.sessionUser!,
        'UPDATE',
        'VEHICLE_TYPES',
        req.params.id,
        `Perbarui jenis kendaraan ${db.VEHICLE_TYPES[idx].name}`
      );
      return db.VEHICLE_TYPES[idx];
    });
    if (!updated) {
      res.status(404).json({ error: 'Jenis kendaraan tidak ditemukan.' });
      return;
    }
    res.json({ vehicleType: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui jenis kendaraan.' });
  }
});

apiRouter.delete('/vehicle-types/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await dbStore.mutate(
      ['VEHICLE_TYPES', 'AUDIT_LOGS'],
      (db) => {
        const vt = db.VEHICLE_TYPES.find((t) => t.vehicle_type_id === req.params.id);
        if (!vt) return null;
        const hasHistory =
          db.VEHICLES.some((v) => v.vehicle_type_id === req.params.id) ||
          db.BOOKINGS.some((b) => b.requested_vehicle_type_id === req.params.id) ||
          db.DRIVERS.some((d) => d.eligible_vehicle_type_ids.includes(req.params.id));
        if (hasHistory && !force) {
          vt.active_status = 'nonaktif';
          appendAuditLog(
            db,
            req.sessionUser!,
            'SOFT_DELETE',
            'VEHICLE_TYPES',
            vt.vehicle_type_id,
            `Nonaktifkan jenis kendaraan ${vt.name} (memiliki riwayat transaksi)`
          );
          return { softDeleted: true, hasHistory: true, vehicleType: vt };
        }
        db.VEHICLE_TYPES = db.VEHICLE_TYPES.filter((t) => t.vehicle_type_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'VEHICLE_TYPES',
          req.params.id,
          `Hapus${force && hasHistory ? ' permanen' : ''} jenis kendaraan ${vt.name}`
        );
        return { softDeleted: false, hasHistory };
      },
      { requireRemoteSync: true }
    );
    if (!result) {
      res.status(404).json({ error: 'Jenis kendaraan tidak ditemukan.' });
      return;
    }
    res.json(result);
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus jenis kendaraan.');
  }
});

// ========================
// VEHICLES (ADMIN ONLY — strict school asset boundary)
// ========================
apiRouter.get('/vehicles', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const { departure_at, return_at, exclude_booking_id } = req.query as {
    departure_at?: string;
    return_at?: string;
    exclude_booking_id?: string;
  };
  const vehicles = db.VEHICLES.map((v) => {
    const blockers = getVehicleBlockReasons(db, v, departure_at, return_at, exclude_booking_id);
    return {
      ...v,
      usage_status: computeDynamicVehicleUsageStatus(db, v.vehicle_id),
      booking_blockers: blockers,
      is_allocatable: blockers.length === 0,
    };
  });
  res.json({ vehicles });
});

apiRouter.get('/vehicles/:id/detail', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const vehicle = db.VEHICLES.find((v) => v.vehicle_id === req.params.id);
  if (!vehicle) {
    res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
    return;
  }
  const usage_status = computeDynamicVehicleUsageStatus(db, vehicle.vehicle_id);
  const inspections = db.INSPECTIONS.filter((i) => i.vehicle_id === vehicle.vehicle_id);
  const damageReports = db.DAMAGE_REPORTS.filter((d) => d.vehicle_id === vehicle.vehicle_id);
  const repairs = db.REPAIRS.filter((r) => r.vehicle_id === vehicle.vehicle_id);
  const maintenancePlans = db.MAINTENANCE_PLANS.filter((m) => m.vehicle_id === vehicle.vehicle_id).map((m) => ({
    ...m,
    ...computeMaintenanceStatusAndReminder(m, vehicle.last_odometer),
  }));
  const bookings = db.BOOKINGS.filter((b) => b.allocated_vehicle_ids.includes(vehicle.vehicle_id));
  const expenses = db.EXPENSES.filter((e) => e.vehicle_id === vehicle.vehicle_id);
  const history = db.VEHICLE_HISTORY.filter((h) => h.vehicle_id === vehicle.vehicle_id);
  const totalCost = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  res.json({
    vehicle: { ...vehicle, usage_status },
    inspections,
    damageReports,
    repairs,
    maintenancePlans,
    bookings,
    expenses,
    history,
    totalCost,
  });
});

apiRouter.post('/vehicles', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const now = new Date().toISOString();
  const created = await dbStore.mutate(['VEHICLES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'], (db) => {
    const v: Vehicle = {
      vehicle_id: crypto.randomUUID(),
      vehicle_code: req.body.vehicle_code || `LZ-OPR-${String(db.VEHICLES.length + 1).padStart(2, '0')}`,
      vehicle_name: String(req.body.vehicle_name || ''),
      plate_number: String(req.body.plate_number || '').toUpperCase(),
      brand: String(req.body.brand || ''),
      model: String(req.body.model || ''),
      vehicle_type_id: String(req.body.vehicle_type_id || ''),
      manufacture_year: Number(req.body.manufacture_year || new Date().getFullYear()),
      registration_year: Number(req.body.registration_year || new Date().getFullYear()),
      color: String(req.body.color || ''),
      chassis_number: String(req.body.chassis_number || ''),
      engine_number: String(req.body.engine_number || ''),
      fuel_type: req.body.fuel_type || 'Bensin',
      transmission: req.body.transmission || 'Otomatis',
      engine_capacity_cc: Number(req.body.engine_capacity_cc || 1500),
      passenger_capacity: Number(req.body.passenger_capacity || 7),
      photo_url: String(req.body.photo_url || '/src/assets/images/fleet_innova_mpv_1794808757672.jpg'),
      managing_department_id: String(req.body.managing_department_id || ''),
      parking_location: String(req.body.parking_location || ''),
      ownership_status: req.body.ownership_status || 'Milik Sekolah',
      purchase_date: String(req.body.purchase_date || ''),
      purchase_price: Number(req.body.purchase_price || 0),
      school_asset_number: String(req.body.school_asset_number || ''),
      asset_notes: String(req.body.asset_notes || ''),
      stnk_number: String(req.body.stnk_number || ''),
      stnk_expiry: String(req.body.stnk_expiry || ''),
      tax_due_date: String(req.body.tax_due_date || ''),
      kir_expiry: String(req.body.kir_expiry || ''),
      insurance_policy_number: String(req.body.insurance_policy_number || ''),
      insurance_expiry: String(req.body.insurance_expiry || ''),
      drive_document_ref: String(req.body.drive_document_ref || ''),
      last_odometer: Number(req.body.last_odometer || 0),
      last_service_date: String(req.body.last_service_date || ''),
      last_service_odometer: Number(req.body.last_service_odometer || 0),
      next_service_date: String(req.body.next_service_date || ''),
      service_interval_km: Number(req.body.service_interval_km || 10000),
      service_interval_months: Number(req.body.service_interval_months || 6),
      primary_driver_id: String(req.body.primary_driver_id || ''),
      condition_notes: String(req.body.condition_notes || ''),
      admin_status: req.body.admin_status || 'aktif',
      eligibility_status: req.body.eligibility_status || 'belum_diverifikasi',
      usage_status: 'tersedia',
      safety_blocked: Boolean(req.body.safety_blocked),
      safety_block_reason: String(req.body.safety_block_reason || ''),
      updated_at: now,
    };
    db.VEHICLES.push(v);
    appendVehicleHistory(db, {
      vehicle_id: v.vehicle_id,
      activity_type: 'Pendaftaran',
      actor: req.sessionUser!,
      summary: `Pendaftaran kendaraan baru: ${v.vehicle_name} (${v.plate_number})`,
      reference_id: v.vehicle_id,
    });
    appendAuditLog(db, req.sessionUser!, 'CREATE', 'VEHICLES', v.vehicle_id, `Tambah kendaraan ${v.plate_number}`);
    return v;
  });
  res.status(201).json({ vehicle: created });
});

apiRouter.put('/vehicles/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['VEHICLES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'], (db) => {
    const idx = db.VEHICLES.findIndex((v) => v.vehicle_id === req.params.id);
    if (idx === -1) return null;
    const prev = db.VEHICLES[idx];
    const next: Vehicle = {
      ...prev,
      ...req.body,
      vehicle_id: req.params.id,
      updated_at: new Date().toISOString(),
    };
    db.VEHICLES[idx] = next;
    appendVehicleHistory(db, {
      vehicle_id: next.vehicle_id,
      activity_type: prev.eligibility_status !== next.eligibility_status ? 'Kelayakan' : 'Master Data',
      actor: req.sessionUser!,
      summary: `Pembaruan data kendaraan ${next.plate_number}${prev.eligibility_status !== next.eligibility_status ? ` (Kelayakan: ${next.eligibility_status})` : ''}`,
      reference_id: next.vehicle_id,
    });
    appendAuditLog(db, req.sessionUser!, 'UPDATE', 'VEHICLES', next.vehicle_id, `Update kendaraan ${next.plate_number}`);
    return next;
  });
  if (!updated) {
    res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
    return;
  }
  res.json({ vehicle: updated });
});

apiRouter.post('/vehicles/:id/verify-eligibility', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const { eligibility_status, release_safety_block, notes } = req.body as {
    eligibility_status: Vehicle['eligibility_status'];
    release_safety_block?: boolean;
    notes?: string;
  };
  try {
    const updated = await dbStore.mutate(['VEHICLES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'], (db) => {
      const vehicle = db.VEHICLES.find((v) => v.vehicle_id === req.params.id);
      if (!vehicle) throw new Error('Kendaraan tidak ditemukan.');

      // Cannot release safety block while an unverified/open blocking repair is still active
      if (release_safety_block) {
        const unfinishedRepair = db.REPAIRS.find(
          (r) =>
            r.vehicle_id === vehicle.vehicle_id &&
            r.blocks_vehicle &&
            !['Selesai Diperbaiki', 'Verifikasi Hasil Perbaikan', 'Ditutup'].includes(r.status)
        );
        if (unfinishedRepair) {
          throw new Error(
            `Blokir belum dapat dilepas karena perbaikan ${unfinishedRepair.repair_number} masih berstatus "${unfinishedRepair.status}".`
          );
        }
        vehicle.safety_blocked = false;
        vehicle.safety_block_reason = '';
      }

      vehicle.eligibility_status = eligibility_status;
      if (notes) vehicle.condition_notes = notes;
      vehicle.updated_at = new Date().toISOString();

      appendVehicleHistory(db, {
        vehicle_id: vehicle.vehicle_id,
        activity_type: release_safety_block ? 'Blokir/Pelepasan' : 'Kelayakan',
        actor: req.sessionUser!,
        summary: `Verifikasi kelayakan: ${eligibility_status}${release_safety_block ? ' (Blokir keselamatan dilepas)' : ''}. ${notes || ''}`,
        reference_id: vehicle.vehicle_id,
      });
      appendAuditLog(
        db,
        req.sessionUser!,
        'VERIFY_ELIGIBILITY',
        'VEHICLES',
        vehicle.vehicle_id,
        `Verifikasi kelayakan ${vehicle.plate_number} -> ${eligibility_status}`
      );
      return vehicle;
    });
    res.json({ vehicle: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memverifikasi kelayakan.' });
  }
});

apiRouter.delete('/vehicles/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await dbStore.mutate(
      ['VEHICLES', 'AUDIT_LOGS'],
      (db) => {
        const vehicle = db.VEHICLES.find((v) => v.vehicle_id === req.params.id);
        if (!vehicle) return null;
        const hasHistory =
          db.BOOKINGS.some((b) => b.allocated_vehicle_ids.includes(vehicle.vehicle_id)) ||
          db.INSPECTIONS.some((i) => i.vehicle_id === vehicle.vehicle_id) ||
          db.REPAIRS.some((r) => r.vehicle_id === vehicle.vehicle_id) ||
          db.EXPENSES.some((e) => e.vehicle_id === vehicle.vehicle_id);
        if (hasHistory && !force) {
          vehicle.admin_status = 'tidak_aktif';
          vehicle.updated_at = new Date().toISOString();
          appendAuditLog(
            db,
            req.sessionUser!,
            'SOFT_DELETE',
            'VEHICLES',
            vehicle.vehicle_id,
            `Nonaktifkan kendaraan ${vehicle.plate_number} (memiliki riwayat transaksi)`
          );
          return { softDeleted: true, hasHistory: true, vehicle };
        }
        db.VEHICLES = db.VEHICLES.filter((v) => v.vehicle_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'VEHICLES',
          req.params.id,
          `Hapus${force && hasHistory ? ' permanen' : ''} kendaraan ${vehicle.plate_number}`
        );
        return { softDeleted: false, hasHistory };
      },
      { requireRemoteSync: true }
    );
    if (!result) {
      res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
      return;
    }
    res.json(result);
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus kendaraan.');
  }
});

// ========================
// DRIVERS (ADMIN ONLY)
// ========================
apiRouter.get('/drivers', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const { departure_at, return_at, vehicle_type_ids, exclude_booking_id } = req.query as {
    departure_at?: string;
    return_at?: string;
    vehicle_type_ids?: string;
    exclude_booking_id?: string;
  };
  const vtList = vehicle_type_ids ? vehicle_type_ids.split(',').filter(Boolean) : [];
  const drivers = db.DRIVERS.map((d) => {
    const blockers = getDriverBlockReasons(db, d, vtList, departure_at, return_at, exclude_booking_id);
    return {
      ...d,
      booking_blockers: blockers,
      is_allocatable: blockers.length === 0,
    };
  });
  res.json({ drivers });
});

apiRouter.post('/drivers', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const created = await dbStore.mutate(['DRIVERS', 'AUDIT_LOGS'], (db) => {
    const driver = {
      driver_id: crypto.randomUUID(),
      full_name: String(req.body.full_name || ''),
      internal_id: String(req.body.internal_id || `DRV-LZ-${String(db.DRIVERS.length + 1).padStart(2, '0')}`),
      phone: String(req.body.phone || ''),
      sim_type: req.body.sim_type || 'SIM A',
      sim_expiry: String(req.body.sim_expiry || ''),
      eligible_vehicle_type_ids: Array.isArray(req.body.eligible_vehicle_type_ids)
        ? req.body.eligible_vehicle_type_ids
        : [],
      active_status: req.body.active_status || 'aktif',
      notes: String(req.body.notes || ''),
    };
    db.DRIVERS.push(driver);
    appendAuditLog(db, req.sessionUser!, 'CREATE', 'DRIVERS', driver.driver_id, `Tambah pengemudi ${driver.full_name}`);
    return driver;
  });
  res.status(201).json({ driver: created });
});

apiRouter.put('/drivers/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['DRIVERS', 'AUDIT_LOGS'], (db) => {
    const idx = db.DRIVERS.findIndex((d) => d.driver_id === req.params.id);
    if (idx === -1) return null;
    db.DRIVERS[idx] = { ...db.DRIVERS[idx], ...req.body, driver_id: req.params.id };
    appendAuditLog(db, req.sessionUser!, 'UPDATE', 'DRIVERS', req.params.id, `Perbarui pengemudi ${db.DRIVERS[idx].full_name}`);
    return db.DRIVERS[idx];
  });
  if (!updated) {
    res.status(404).json({ error: 'Pengemudi tidak ditemukan.' });
    return;
  }
  res.json({ driver: updated });
});

apiRouter.delete('/drivers/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await dbStore.mutate(
      ['DRIVERS', 'AUDIT_LOGS'],
      (db) => {
        const drv = db.DRIVERS.find((d) => d.driver_id === req.params.id);
        if (!drv) return null;
        const hasHistory = db.BOOKINGS.some((b) => b.allocated_driver_ids.includes(drv.driver_id));
        if (hasHistory && !force) {
          drv.active_status = 'nonaktif';
          appendAuditLog(
            db,
            req.sessionUser!,
            'SOFT_DELETE',
            'DRIVERS',
            drv.driver_id,
            `Nonaktifkan pengemudi ${drv.full_name} (memiliki riwayat transaksi)`
          );
          return { softDeleted: true, hasHistory: true, driver: drv };
        }
        db.DRIVERS = db.DRIVERS.filter((d) => d.driver_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'DRIVERS',
          req.params.id,
          `Hapus${force && hasHistory ? ' permanen' : ''} pengemudi ${drv.full_name}`
        );
        return { softDeleted: false, hasHistory };
      },
      { requireRemoteSync: true }
    );
    if (!result) {
      res.status(404).json({ error: 'Pengemudi tidak ditemukan.' });
      return;
    }
    res.json(result);
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus pengemudi.');
  }
});

// ========================
// VENDORS & VENDOR SERVICES (ADMIN ONLY)
// ========================
apiRouter.get('/vendors', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ vendors: db.VENDORS, vendorServices: db.VENDOR_SERVICES });
});

apiRouter.post('/vendors', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const created = await dbStore.mutate(['VENDORS', 'AUDIT_LOGS'], (db) => {
    const vendor = {
      vendor_id: crypto.randomUUID(),
      company_name: String(req.body.company_name || ''),
      pic_name: String(req.body.pic_name || ''),
      phone: String(req.body.phone || ''),
      email: String(req.body.email || ''),
      address: String(req.body.address || ''),
      service_types: Array.isArray(req.body.service_types) ? req.body.service_types : [],
      active_status: req.body.active_status || 'aktif',
      notes: String(req.body.notes || ''),
    };
    db.VENDORS.push(vendor);
    appendAuditLog(db, req.sessionUser!, 'CREATE', 'VENDORS', vendor.vendor_id, `Tambah vendor ${vendor.company_name}`);
    return vendor;
  });
  res.status(201).json({ vendor: created });
});

apiRouter.put('/vendors/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['VENDORS', 'AUDIT_LOGS'], (db) => {
    const idx = db.VENDORS.findIndex((v) => v.vendor_id === req.params.id);
    if (idx === -1) return null;
    db.VENDORS[idx] = { ...db.VENDORS[idx], ...req.body, vendor_id: req.params.id };
    appendAuditLog(db, req.sessionUser!, 'UPDATE', 'VENDORS', req.params.id, `Perbarui vendor ${db.VENDORS[idx].company_name}`);
    return db.VENDORS[idx];
  });
  if (!updated) {
    res.status(404).json({ error: 'Vendor tidak ditemukan.' });
    return;
  }
  res.json({ vendor: updated });
});

apiRouter.delete('/vendors/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await dbStore.mutate(
      ['VENDORS', 'VENDOR_SERVICES', 'AUDIT_LOGS'],
      (db) => {
        const vendor = db.VENDORS.find((v) => v.vendor_id === req.params.id);
        if (!vendor) return null;
        const hasHistory =
          db.VENDOR_QUOTES.some((q) => q.vendor_id === vendor.vendor_id) ||
          db.BOOKINGS.some((b) => b.selected_vendor_id === vendor.vendor_id);
        if (hasHistory && !force) {
          vendor.active_status = 'nonaktif';
          appendAuditLog(
            db,
            req.sessionUser!,
            'SOFT_DELETE',
            'VENDORS',
            vendor.vendor_id,
            `Nonaktifkan vendor ${vendor.company_name} (memiliki riwayat transaksi)`
          );
          return { softDeleted: true, hasHistory: true, vendor };
        }
        db.VENDORS = db.VENDORS.filter((v) => v.vendor_id !== req.params.id);
        db.VENDOR_SERVICES = db.VENDOR_SERVICES.filter((s) => s.vendor_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'VENDORS',
          req.params.id,
          `Hapus${force && hasHistory ? ' permanen' : ''} vendor ${vendor.company_name}`
        );
        return { softDeleted: false, hasHistory };
      },
      { requireRemoteSync: true }
    );
    if (!result) {
      res.status(404).json({ error: 'Vendor tidak ditemukan.' });
      return;
    }
    res.json(result);
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus vendor.');
  }
});

apiRouter.post('/vendor-services', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const created = await dbStore.mutate(['VENDOR_SERVICES', 'AUDIT_LOGS'], (db) => {
    const svc = {
      service_id: crypto.randomUUID(),
      vendor_id: String(req.body.vendor_id || ''),
      vehicle_type: String(req.body.vehicle_type || ''),
      seat_capacity: Number(req.body.seat_capacity || 30),
      base_rate: Number(req.body.base_rate || 0),
      facilities: String(req.body.facilities || ''),
      notes: String(req.body.notes || ''),
    };
    db.VENDOR_SERVICES.push(svc);
    appendAuditLog(db, req.sessionUser!, 'CREATE', 'VENDOR_SERVICES', svc.service_id, `Tambah layanan vendor ${svc.vehicle_type}`);
    return svc;
  });
  res.status(201).json({ vendorService: created });
});

apiRouter.delete('/vendor-services/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await dbStore.mutate(
      ['VENDOR_SERVICES', 'AUDIT_LOGS'],
      (db) => {
        const svc = db.VENDOR_SERVICES.find((s) => s.service_id === req.params.id);
        if (!svc) return false;
        db.VENDOR_SERVICES = db.VENDOR_SERVICES.filter((s) => s.service_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'VENDOR_SERVICES',
          req.params.id,
          `Hapus layanan vendor ${svc.vehicle_type}`
        );
        return true;
      },
      { requireRemoteSync: true }
    );
    if (!deleted) {
      res.status(404).json({ error: 'Layanan vendor tidak ditemukan.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus layanan vendor.');
  }
});

// ========================
// ADMIN USERS (ADMIN ONLY)
// ========================
apiRouter.get('/admin-users', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ adminUsers: db.ADMIN_USERS, schoolUsers: db.USERS });
});

apiRouter.post('/admin-users', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const allowedDomain = (process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id').toLowerCase();
    const created = await dbStore.mutate(['ADMIN_USERS', 'AUDIT_LOGS'], (db) => {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) throw new Error('Email Administrator tidak valid.');
      if (!email.endsWith(`@${allowedDomain}`)) {
        throw new Error(`Email Administrator wajib menggunakan akun Google Workspace @${allowedDomain}.`);
      }
      if (db.ADMIN_USERS.some((a) => a.email.toLowerCase() === email)) {
        throw new Error('Email sudah terdaftar sebagai Administrator.');
      }
      const admin = {
        id: crypto.randomUUID(),
        name: String(req.body.name || email.split('@')[0]),
        email,
        role: req.body.role || 'GA Admin',
        status: 'aktif' as const,
        created_at: new Date().toISOString(),
        last_login: '',
      };
      db.ADMIN_USERS.push(admin);
      appendAuditLog(db, req.sessionUser!, 'CREATE', 'ADMIN_USERS', admin.id, `Daftarkan Administrator ${admin.email}`);
      return admin;
    });
    res.status(201).json({ adminUser: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menambah Administrator.' });
  }
});

apiRouter.put('/admin-users/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const allowedDomain = (process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id').toLowerCase();
    if (req.body.email) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!email.endsWith(`@${allowedDomain}`)) {
        res.status(400).json({
          error: `Email Administrator wajib menggunakan akun Google Workspace @${allowedDomain}.`,
        });
        return;
      }
    }
    const updated = await dbStore.mutate(['ADMIN_USERS', 'AUDIT_LOGS'], (db) => {
      const idx = db.ADMIN_USERS.findIndex((a) => a.id === req.params.id);
      if (idx === -1) return null;
      db.ADMIN_USERS[idx] = { ...db.ADMIN_USERS[idx], ...req.body, id: req.params.id };
      appendAuditLog(db, req.sessionUser!, 'UPDATE', 'ADMIN_USERS', req.params.id, `Perbarui Administrator ${db.ADMIN_USERS[idx].email}`);
      return db.ADMIN_USERS[idx];
    });
    if (!updated) {
      res.status(404).json({ error: 'Administrator tidak ditemukan.' });
      return;
    }
    res.json({ adminUser: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui Administrator.' });
  }
});

apiRouter.delete('/admin-users/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await dbStore.mutate(
      ['ADMIN_USERS', 'AUDIT_LOGS'],
      (db) => {
        const target = db.ADMIN_USERS.find((a) => a.id === req.params.id);
        if (!target) return null;
        if (target.email.trim().toLowerCase() === req.sessionUser!.email.trim().toLowerCase()) {
          throw new Error('Anda tidak dapat menghapus akun Administrator yang sedang Anda gunakan.');
        }
        if (target.role === 'Super Admin' && target.status === 'aktif') {
          const otherActiveSuperAdmins = db.ADMIN_USERS.filter(
            (a) => a.id !== target.id && a.role === 'Super Admin' && a.status === 'aktif'
          );
          if (otherActiveSuperAdmins.length === 0) {
            throw new Error('Tidak dapat menghapus Super Admin aktif terakhir.');
          }
        }
        db.ADMIN_USERS = db.ADMIN_USERS.filter((a) => a.id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'ADMIN_USERS',
          req.params.id,
          `Hapus akun Administrator ${target.email} (${target.role})`
        );
        return target;
      },
      { requireRemoteSync: true }
    );
    if (!deleted) {
      res.status(404).json({ error: 'Administrator tidak ditemukan.' });
      return;
    }
    res.json({ ok: true, deleted });
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus akun Administrator.');
  }
});

// ========================
// BOOKINGS (INTERNAL & EXTERNAL)
// ========================
function sanitizeBookingForUser(db: Awaited<ReturnType<typeof dbStore.getSnapshot>>, b: Booking) {
  const allocatedVehiclesSummary = b.allocated_vehicle_ids
    .map((vid) => db.VEHICLES.find((v) => v.vehicle_id === vid))
    .filter(Boolean)
    .map((v) => ({
      vehicle_id: v!.vehicle_id,
      vehicle_name: v!.vehicle_name,
      plate_number: v!.plate_number,
      color: v!.color,
      passenger_capacity: v!.passenger_capacity,
    }));
  const allocatedDriversSummary = b.allocated_driver_ids
    .map((did) => db.DRIVERS.find((d) => d.driver_id === did))
    .filter(Boolean)
    .map((d) => ({
      driver_id: d!.driver_id,
      full_name: d!.full_name,
      phone: d!.phone,
    }));
  const selectedVendor = b.selected_vendor_id
    ? db.VENDORS.find((v) => v.vendor_id === b.selected_vendor_id)
    : null;
  const dept = db.DEPARTMENTS.find((d) => d.department_id === b.department_id);
  const vtype = db.VEHICLE_TYPES.find((t) => t.vehicle_type_id === b.requested_vehicle_type_id);

  return {
    ...b,
    department_name: dept?.department_name || '',
    requested_vehicle_type_name: vtype?.name || b.external_vehicle_type || '',
    allocated_vehicles_summary: allocatedVehiclesSummary,
    allocated_drivers_summary: allocatedDriversSummary,
    selected_vendor_name: selectedVendor?.company_name || '',
  };
}

function sendMutationError(res: Response, err: unknown, fallback: string) {
  if (err instanceof SheetsSyncError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

apiRouter.get('/bookings', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const user = req.sessionUser!;
  const userEmailNorm = user.email.trim().toLowerCase();
  const rows =
    user.role === 'ADMIN'
      ? db.BOOKINGS
      : db.BOOKINGS.filter(
          (b) => String(b.requester_email || '').trim().toLowerCase() === userEmailNorm
        );

  res.json({
    bookings: rows.map((b) => sanitizeBookingForUser(db, b)),
    storage: dbStore.getStorageDiagnostics(),
  });
});

apiRouter.get('/bookings/calendar', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const events = db.BOOKINGS.filter((b) =>
    ['Disetujui', 'Dijadwalkan', 'Dipesan', 'Dalam Perjalanan', 'Selesai'].includes(b.status)
  ).map((b) => sanitizeBookingForUser(db, b));
  res.json({ events });
});

apiRouter.get('/bookings/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const user = req.sessionUser!;
  const booking = db.BOOKINGS.find((b) => b.booking_id === req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    return;
  }
  if (
    user.role !== 'ADMIN' &&
    String(booking.requester_email || '').trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    res.status(403).json({ error: 'Anda tidak berhak melihat pengajuan pengguna lain.' });
    return;
  }

  const quotes =
    user.role === 'ADMIN'
      ? db.VENDOR_QUOTES.filter((q) => q.booking_id === booking.booking_id).map((q) => ({
          ...q,
          vendor_name: db.VENDORS.find((v) => v.vendor_id === q.vendor_id)?.company_name || '',
        }))
      : [];

  res.json({
    booking: sanitizeBookingForUser(db, booking),
    quotes,
  });
});

apiRouter.post('/bookings/internal', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  const now = new Date().toISOString();
  const isDraft = Boolean(req.body.save_as_draft);
  const initialStatus: BookingStatus = isDraft ? 'Draft' : 'Diajukan';

  try {
    if (!req.body.activity_name || !req.body.departure_at || !req.body.return_at) {
      throw new Error('Nama kegiatan, tanggal berangkat, dan tanggal kembali wajib diisi.');
    }
    if (new Date(req.body.return_at) <= new Date(req.body.departure_at)) {
      throw new Error('Waktu kembali harus lebih akhir daripada waktu keberangkatan.');
    }

    const created = await dbStore.mutate(
      ['BOOKINGS', 'NOTIFICATIONS', 'AUDIT_LOGS'],
      (db) => {
        const bookingNumber = nextSequentialCode(
          'BKG-INT',
          db.BOOKINGS.filter((b) => b.booking_kind === 'INTERNAL').map((b) => b.booking_number)
        );
      const booking: Booking = {
        booking_id: crypto.randomUUID(),
        booking_number: bookingNumber,
        booking_kind: 'INTERNAL',
        submitted_at: now,
        requester_id: user.id,
        requester_name: user.name,
        requester_email: user.email,
        department_id: String(req.body.department_id || user.department_id || ''),
        activity_name: String(req.body.activity_name),
        purpose: String(req.body.purpose || ''),
        departure_location: String(req.body.departure_location || ''),
        destination_location: String(req.body.destination_location || ''),
        departure_at: String(req.body.departure_at),
        return_at: String(req.body.return_at),
        passenger_count: Number(req.body.passenger_count || 1),
        requested_vehicle_type_id: String(req.body.requested_vehicle_type_id || ''),
        needs_driver: Boolean(req.body.needs_driver),
        pic_name: String(req.body.pic_name || user.name),
        contact_phone: String(req.body.contact_phone || user.phone || ''),
        student_count: 0,
        companion_count: 0,
        external_vehicle_type: '',
        external_unit_count: 0,
        facilities_needed: '',
        special_requirements: '',
        estimated_budget: 0,
        notes: String(req.body.notes || ''),
        status: initialStatus,
        rejection_reason: '',
        revision_notes: '',
        allocated_vehicle_ids: [],
        allocated_driver_ids: [],
        selected_quote_id: '',
        selected_vendor_id: '',
        approved_by: '',
        approved_at: '',
        approval_history: [
          {
            actor_email: user.email,
            actor_name: user.name,
            timestamp: now,
            from_status: 'Baru',
            to_status: initialStatus,
            notes: isDraft ? 'Disimpan sebagai draft.' : 'Pengajuan kendaraan sekolah dikirim ke GA.',
          },
        ],
        updated_at: now,
      };
      db.BOOKINGS.unshift(booking);

      if (!isDraft) {
        pushNotification(db, {
          recipient_email: 'ALL_ADMINS',
          recipient_role: 'ALL_ADMINS',
          title: 'Pengajuan Kendaraan Sekolah Baru',
          message: `${booking.booking_number} — ${booking.activity_name} oleh ${user.name}.`,
          link: '/bookings/approval',
          severity: 'info',
        });
      }
      appendAuditLog(
        db,
        user,
        'CREATE_INTERNAL_BOOKING',
        'BOOKINGS',
        booking.booking_id,
        `Buat pengajuan internal ${booking.booking_number} (${initialStatus})`
      );
        return booking;
      },
      { requireRemoteSync: true }
    );

    res.status(201).json({
      booking: created,
      storage: dbStore.getStorageDiagnostics(),
    });
  } catch (err) {
    sendMutationError(res, err, 'Gagal membuat pengajuan.');
  }
});

apiRouter.post('/bookings/external', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  const now = new Date().toISOString();
  const isDraft = Boolean(req.body.save_as_draft);
  const initialStatus: BookingStatus = isDraft ? 'Draft' : 'Diajukan';

  try {
    if (!req.body.activity_name || !req.body.departure_at || !req.body.return_at) {
      throw new Error('Nama kegiatan, tanggal berangkat, dan tanggal kembali wajib diisi.');
    }
    if (new Date(req.body.return_at) <= new Date(req.body.departure_at)) {
      throw new Error('Waktu kembali harus lebih akhir daripada waktu keberangkatan.');
    }

    const created = await dbStore.mutate(
      ['BOOKINGS', 'NOTIFICATIONS', 'AUDIT_LOGS'],
      (db) => {
        const bookingNumber = nextSequentialCode(
          'BKG-EXT',
          db.BOOKINGS.filter((b) => b.booking_kind === 'EXTERNAL').map((b) => b.booking_number)
        );
      const students = Number(req.body.student_count || 0);
      const companions = Number(req.body.companion_count || 0);
      const booking: Booking = {
        booking_id: crypto.randomUUID(),
        booking_number: bookingNumber,
        booking_kind: 'EXTERNAL',
        submitted_at: now,
        requester_id: user.id,
        requester_name: user.name,
        requester_email: user.email,
        department_id: String(req.body.department_id || user.department_id || ''),
        activity_name: String(req.body.activity_name),
        purpose: String(req.body.purpose || ''),
        departure_location: String(req.body.departure_location || ''),
        destination_location: String(req.body.destination_location || ''),
        departure_at: String(req.body.departure_at),
        return_at: String(req.body.return_at),
        passenger_count: students + companions || Number(req.body.passenger_count || 1),
        requested_vehicle_type_id: '',
        needs_driver: true,
        pic_name: String(req.body.pic_name || user.name),
        contact_phone: String(req.body.contact_phone || user.phone || ''),
        student_count: students,
        companion_count: companions,
        external_vehicle_type: String(req.body.external_vehicle_type || 'Big Bus'),
        external_unit_count: Number(req.body.external_unit_count || 1),
        facilities_needed: String(req.body.facilities_needed || ''),
        special_requirements: String(req.body.special_requirements || ''),
        estimated_budget: Number(req.body.estimated_budget || 0),
        notes: String(req.body.notes || ''),
        status: initialStatus,
        rejection_reason: '',
        revision_notes: '',
        allocated_vehicle_ids: [],
        allocated_driver_ids: [],
        selected_quote_id: '',
        selected_vendor_id: '',
        approved_by: '',
        approved_at: '',
        approval_history: [
          {
            actor_email: user.email,
            actor_name: user.name,
            timestamp: now,
            from_status: 'Baru',
            to_status: initialStatus,
            notes: isDraft ? 'Disimpan sebagai draft.' : 'Pengajuan sewa bus / kendaraan eksternal dikirim ke GA.',
          },
        ],
        updated_at: now,
      };
      db.BOOKINGS.unshift(booking);

      if (!isDraft) {
        pushNotification(db, {
          recipient_email: 'ALL_ADMINS',
          recipient_role: 'ALL_ADMINS',
          title: 'Pengajuan Sewa Bus / Eksternal Baru',
          message: `${booking.booking_number} — ${booking.activity_name} (${booking.external_unit_count} ${booking.external_vehicle_type}).`,
          link: '/bookings/approval',
          severity: 'info',
        });
      }
      appendAuditLog(
        db,
        user,
        'CREATE_EXTERNAL_BOOKING',
        'BOOKINGS',
        booking.booking_id,
        `Buat pengajuan eksternal ${booking.booking_number} (${initialStatus})`
      );
        return booking;
      },
      { requireRemoteSync: true }
    );

    res.status(201).json({
      booking: created,
      storage: dbStore.getStorageDiagnostics(),
    });
  } catch (err) {
    sendMutationError(res, err, 'Gagal membuat pengajuan eksternal.');
  }
});

// Edit booking (owner only when Draft/Perlu Revisi, or Admin anytime before Selesai)
apiRouter.put('/bookings/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  try {
    const updated = await dbStore.mutate(
      ['BOOKINGS', 'NOTIFICATIONS', 'AUDIT_LOGS'],
      (db) => {
        const idx = db.BOOKINGS.findIndex((b) => b.booking_id === req.params.id);
        if (idx === -1) throw new Error('Pengajuan tidak ditemukan.');
        const existing = db.BOOKINGS[idx];

        if (user.role !== 'ADMIN') {
          if (
            String(existing.requester_email || '').trim().toLowerCase() !==
            user.email.trim().toLowerCase()
          ) {
            throw new Error('Tidak memiliki izin mengubah pengajuan ini.');
          }
          if (!['Draft', 'Perlu Revisi'].includes(existing.status)) {
            throw new Error('Pengajuan hanya dapat direvisi saat berstatus Draft atau Perlu Revisi.');
          }
        }

        const { resubmit: resubmitFlag, ...bodyPatch } = (req.body || {}) as Record<string, unknown>;
        const resubmit = Boolean(resubmitFlag);
        const nextStatus: BookingStatus = resubmit ? 'Diajukan' : existing.status;
        const now = new Date().toISOString();

        const merged: Booking = {
          ...existing,
          ...bodyPatch,
          booking_id: existing.booking_id,
          booking_number: existing.booking_number,
          requester_id: existing.requester_id,
          requester_email: existing.requester_email,
          status: nextStatus,
          updated_at: now,
        };
        if (resubmit) {
          merged.approval_history = [
            ...existing.approval_history,
            {
              actor_email: user.email,
              actor_name: user.name,
              timestamp: now,
              from_status: existing.status,
              to_status: 'Diajukan',
              notes: 'Pengajuan direvisi dan dikirim ulang ke GA.',
            },
          ];
          pushNotification(db, {
            recipient_email: 'ALL_ADMINS',
            recipient_role: 'ALL_ADMINS',
            title: `Revisi Pengajuan ${merged.booking_number}`,
            message: `${user.name} telah memperbarui pengajuan ${merged.activity_name}.`,
            link: '/bookings/approval',
            severity: 'info',
          });
        }

        db.BOOKINGS[idx] = merged;
        appendAuditLog(
          db,
          user,
          'UPDATE_BOOKING',
          'BOOKINGS',
          merged.booking_id,
          `Update pengajuan ${merged.booking_number}`
        );
        return sanitizeBookingForUser(db, merged);
      },
      { requireRemoteSync: true }
    );
    res.json({ booking: updated });
  } catch (err) {
    sendMutationError(res, err, 'Gagal memperbarui pengajuan.');
  }
});

// Status workflow transitions
apiRouter.post('/bookings/:id/transition', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  const { target_status, notes, rejection_reason } = req.body as {
    target_status: BookingStatus;
    notes?: string;
    rejection_reason?: string;
  };

  try {
    const updated = await dbStore.mutate(
      ['BOOKINGS', 'NOTIFICATIONS', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const booking = db.BOOKINGS.find((b) => b.booking_id === req.params.id);
        if (!booking) throw new Error('Pengajuan tidak ditemukan.');

        if (user.role !== 'ADMIN') {
          if (
            String(booking.requester_email || '').trim().toLowerCase() !==
            user.email.trim().toLowerCase()
          ) {
            throw new Error('Akses ditolak.');
          }
          const userAllowed =
            (target_status === 'Diajukan' && ['Draft', 'Perlu Revisi'].includes(booking.status)) ||
            (target_status === 'Dibatalkan' &&
              !['Dalam Perjalanan', 'Selesai', 'Ditolak', 'Dibatalkan'].includes(booking.status));
          if (!userAllowed) {
            throw new Error(
              'User hanya dapat mengajukan ulang atau membatalkan sebelum perjalanan dimulai.'
            );
          }
        }

        if (target_status === 'Ditolak' && (!rejection_reason || !rejection_reason.trim())) {
          throw new Error('Alasan penolakan wajib dicantumkan.');
        }
        if (target_status === 'Dijadwalkan' && booking.allocated_vehicle_ids.length === 0) {
          throw new Error('Status Dijadwalkan memerlukan alokasi kendaraan terlebih dahulu.');
        }

        const now = new Date().toISOString();
        const prevStatus = booking.status;
        booking.status = target_status;
        booking.updated_at = now;

        if (target_status === 'Ditolak') {
          booking.rejection_reason = rejection_reason || '';
        }
        if (target_status === 'Perlu Revisi') {
          booking.revision_notes = notes || '';
        }
        if (target_status === 'Disetujui') {
          booking.approved_by = user.email;
          booking.approved_at = now;
        }

        booking.approval_history.push({
          actor_email: user.email,
          actor_name: user.name,
          timestamp: now,
          from_status: prevStatus,
          to_status: target_status,
          notes: notes || rejection_reason || `Perubahan status ke ${target_status}`,
        });

        if (target_status === 'Selesai' && booking.allocated_vehicle_ids.length > 0) {
          for (const vid of booking.allocated_vehicle_ids) {
            appendVehicleHistory(db, {
              vehicle_id: vid,
              activity_type: 'Penggunaan',
              actor: user,
              summary: `Perjalanan selesai: ${booking.booking_number} — ${booking.activity_name} (${booking.destination_location})`,
              reference_id: booking.booking_id,
            });
          }
        }

        if (user.role === 'ADMIN') {
          pushNotification(db, {
            recipient_email: booking.requester_email,
            recipient_role: 'USER',
            title: `Pembaruan Status ${booking.booking_number}: ${target_status}`,
            message:
              rejection_reason ||
              notes ||
              `Pengajuan "${booking.activity_name}" kini berstatus ${target_status}.`,
            link: '/bookings/my',
            severity:
              target_status === 'Ditolak'
                ? 'critical'
                : target_status === 'Disetujui' || target_status === 'Selesai'
                  ? 'success'
                  : 'info',
          });
        } else {
          pushNotification(db, {
            recipient_email: 'ALL_ADMINS',
            recipient_role: 'ALL_ADMINS',
            title: `${booking.booking_number} -> ${target_status}`,
            message: `${user.name} mengubah status ${booking.activity_name} menjadi ${target_status}.`,
            link: '/bookings/approval',
            severity: target_status === 'Dibatalkan' ? 'warning' : 'info',
          });
        }

        appendAuditLog(
          db,
          user,
          'BOOKING_TRANSITION',
          'BOOKINGS',
          booking.booking_id,
          `${booking.booking_number}: ${prevStatus} -> ${target_status}`
        );
        return sanitizeBookingForUser(db, booking);
      },
      { requireRemoteSync: true }
    );
    res.json({ booking: updated });
  } catch (err) {
    sendMutationError(res, err, 'Gagal mengubah status.');
  }
});

// Transactional Vehicle & Driver Allocation (Concurrency locked + strict TMS integration)
apiRouter.post('/bookings/:id/allocate', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const { vehicle_ids, driver_ids, notes } = req.body as {
    vehicle_ids: string[];
    driver_ids: string[];
    notes?: string;
  };

  try {
    if (!Array.isArray(vehicle_ids) || vehicle_ids.length === 0) {
      throw new Error('Pilih minimal satu kendaraan operasional sekolah untuk dialokasikan.');
    }

    const updated = await dbStore.mutate(
      ['BOOKINGS', 'NOTIFICATIONS', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const booking = db.BOOKINGS.find((b) => b.booking_id === req.params.id);
        if (!booking) throw new Error('Pengajuan tidak ditemukan.');
        if (booking.booking_kind !== 'INTERNAL') {
          throw new Error('Alokasi kendaraan sekolah hanya berlaku untuk pemesanan kendaraan internal.');
        }

        const selectedVehicleTypeIds: string[] = [];
        let totalAllocatedSeats = 0;

        for (const vid of vehicle_ids) {
          const vehicle = db.VEHICLES.find((v) => v.vehicle_id === vid);
          if (!vehicle) throw new Error(`Kendaraan ${vid} tidak ditemukan.`);

          const blockers = getVehicleBlockReasons(
            db,
            vehicle,
            booking.departure_at,
            booking.return_at,
            booking.booking_id
          );
          if (blockers.length > 0) {
            throw new Error(`Kendaraan ${vehicle.plate_number} (${vehicle.vehicle_name}) tidak dapat dialokasikan: ${blockers.join(' ')}`);
          }
          selectedVehicleTypeIds.push(vehicle.vehicle_type_id);
          totalAllocatedSeats += Number(vehicle.passenger_capacity || 0);
        }

        if (booking.needs_driver && (!Array.isArray(driver_ids) || driver_ids.length === 0)) {
          throw new Error('Pemesanan ini membutuhkan pengemudi. Silakan pilih pengemudi.');
        }

        for (const did of driver_ids || []) {
          const driver = db.DRIVERS.find((d) => d.driver_id === did);
          if (!driver) throw new Error(`Pengemudi ${did} tidak ditemukan.`);

          const dBlockers = getDriverBlockReasons(
            db,
            driver,
            selectedVehicleTypeIds,
            booking.departure_at,
            booking.return_at,
            booking.booking_id
          );
          if (dBlockers.length > 0) {
            throw new Error(`Pengemudi ${driver.full_name} tidak dapat dialokasikan: ${dBlockers.join(' ')}`);
          }
        }

        const now = new Date().toISOString();
        const prevStatus = booking.status;
        booking.allocated_vehicle_ids = vehicle_ids;
        booking.allocated_driver_ids = driver_ids || [];
        booking.status = 'Dijadwalkan';
        booking.approved_by = booking.approved_by || req.sessionUser!.email;
        booking.approved_at = booking.approved_at || now;
        booking.updated_at = now;

        const vehicleLabels = vehicle_ids
          .map((id) => db.VEHICLES.find((v) => v.vehicle_id === id))
          .filter(Boolean)
          .map((v) => `${v!.vehicle_name} (${v!.plate_number})`)
          .join(', ');
        const driverLabels = (driver_ids || [])
          .map((id) => db.DRIVERS.find((d) => d.driver_id === id)?.full_name)
          .filter(Boolean)
          .join(', ');

        booking.approval_history.push({
          actor_email: req.sessionUser!.email,
          actor_name: req.sessionUser!.name,
          timestamp: now,
          from_status: prevStatus,
          to_status: 'Dijadwalkan',
          notes:
            notes ||
            `Alokasi kendaraan: ${vehicleLabels}${driverLabels ? ` | Pengemudi: ${driverLabels}` : ''}${
              totalAllocatedSeats < booking.passenger_count ? ' (Catatan: kapasitas perlu perhatian)' : ''
            }`,
        });

        for (const vid of vehicle_ids) {
          appendVehicleHistory(db, {
            vehicle_id: vid,
            activity_type: 'Penggunaan',
            actor: req.sessionUser!,
            summary: `Dijadwalkan untuk ${booking.booking_number}: ${booking.activity_name} (${booking.departure_at})`,
            reference_id: booking.booking_id,
          });
        }

        pushNotification(db, {
          recipient_email: booking.requester_email,
          recipient_role: 'USER',
          title: `Kendaraan Dijadwalkan (${booking.booking_number})`,
          message: `Unit ${vehicleLabels}${driverLabels ? ` dengan pengemudi ${driverLabels}` : ''} telah dialokasikan untuk ${booking.activity_name}.`,
          link: '/bookings/my',
          severity: 'success',
        });

        appendAuditLog(
          db,
          req.sessionUser!,
          'ALLOCATE_VEHICLE',
          'BOOKINGS',
          booking.booking_id,
          `Alokasi ${booking.booking_number}: ${vehicleLabels}`
        );

        return sanitizeBookingForUser(db, booking);
      },
      { requireRemoteSync: true }
    );

    res.json({ booking: updated });
  } catch (err) {
    sendMutationError(res, err, 'Gagal mengalokasikan kendaraan.');
  }
});

// External Vendor Quotes & Selection
apiRouter.post('/bookings/:id/quotes', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const result = await dbStore.mutate(
      ['VENDOR_QUOTES', 'BOOKINGS', 'AUDIT_LOGS'],
      (db) => {
        const booking = db.BOOKINGS.find((b) => b.booking_id === req.params.id);
        if (!booking) throw new Error('Pengajuan tidak ditemukan.');
        if (booking.booking_kind !== 'EXTERNAL') throw new Error('Penawaran vendor hanya untuk pemesanan eksternal.');

        const rentalPrice = Number(req.body.rental_price || 0);
        const extraCost = Number(req.body.extra_cost || 0);
        const now = new Date().toISOString();

        const quote = {
          quote_id: crypto.randomUUID(),
          booking_id: booking.booking_id,
          vendor_id: String(req.body.vendor_id || ''),
          vehicle_type: String(req.body.vehicle_type || booking.external_vehicle_type),
          capacity: Number(req.body.capacity || 45),
          unit_count: Number(req.body.unit_count || booking.external_unit_count || 1),
          vehicle_year: Number(req.body.vehicle_year || new Date().getFullYear()),
          rental_price: rentalPrice,
          extra_cost: extraCost,
          total_cost: rentalPrice + extraCost,
          facilities: String(req.body.facilities || ''),
          valid_until: String(req.body.valid_until || ''),
          notes: String(req.body.notes || ''),
          verify_vehicle_docs: Boolean(req.body.verify_vehicle_docs),
          verify_kir: Boolean(req.body.verify_kir),
          verify_vehicle_condition: Boolean(req.body.verify_vehicle_condition),
          verify_driver_qualification: Boolean(req.body.verify_driver_qualification),
          verify_safety_equipment: Boolean(req.body.verify_safety_equipment),
          verify_school_policy: Boolean(req.body.verify_school_policy),
          is_selected: false,
          created_at: now,
        };
        db.VENDOR_QUOTES.push(quote);

        if (['Disetujui', 'Pencarian Vendor', 'Menunggu Penawaran'].includes(booking.status)) {
          const prev = booking.status;
          booking.status = 'Penawaran Diterima';
          booking.updated_at = now;
          booking.approval_history.push({
            actor_email: req.sessionUser!.email,
            actor_name: req.sessionUser!.name,
            timestamp: now,
            from_status: prev,
            to_status: 'Penawaran Diterima',
            notes: `Mencatat penawaran vendor (${quote.vehicle_type}).`,
          });
        }

        appendAuditLog(db, req.sessionUser!, 'ADD_VENDOR_QUOTE', 'VENDOR_QUOTES', quote.quote_id, `Catat penawaran untuk ${booking.booking_number}`);
        return quote;
      },
      { requireRemoteSync: true }
    );
    res.status(201).json({ quote: result });
  } catch (err) {
    sendMutationError(res, err, 'Gagal mencatat penawaran vendor.');
  }
});

apiRouter.post('/bookings/:id/select-vendor', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const { quote_id, confirm_booked, notes } = req.body as {
    quote_id: string;
    confirm_booked?: boolean;
    notes?: string;
  };
  try {
    const updated = await dbStore.mutate(
      ['VENDOR_QUOTES', 'BOOKINGS', 'NOTIFICATIONS', 'AUDIT_LOGS'],
      (db) => {
        const booking = db.BOOKINGS.find((b) => b.booking_id === req.params.id);
        if (!booking) throw new Error('Pengajuan tidak ditemukan.');
        const quote = db.VENDOR_QUOTES.find((q) => q.quote_id === quote_id && q.booking_id === booking.booking_id);
        if (!quote) throw new Error('Penawaran vendor tidak ditemukan.');

        // Enforce mandatory safety & document verification before selecting vendor
        if (
          !quote.verify_vehicle_docs ||
          !quote.verify_vehicle_condition ||
          !quote.verify_driver_qualification ||
          !quote.verify_safety_equipment ||
          !quote.verify_school_policy
        ) {
          throw new Error(
            'Semua poin verifikasi dokumen, kondisi unit, kualifikasi pengemudi, keselamatan, dan kebijakan sekolah harus dicentang sebelum memilih vendor.'
          );
        }

        for (const q of db.VENDOR_QUOTES) {
          if (q.booking_id === booking.booking_id) {
            q.is_selected = q.quote_id === quote.quote_id;
          }
        }

        const vendor = db.VENDORS.find((v) => v.vendor_id === quote.vendor_id);
        const now = new Date().toISOString();
        const prevStatus = booking.status;
        const nextStatus: BookingStatus = confirm_booked ? 'Dipesan' : 'Vendor Dipilih';

        booking.selected_quote_id = quote.quote_id;
        booking.selected_vendor_id = quote.vendor_id;
        booking.status = nextStatus;
        booking.updated_at = now;
        booking.approval_history.push({
          actor_email: req.sessionUser!.email,
          actor_name: req.sessionUser!.name,
          timestamp: now,
          from_status: prevStatus,
          to_status: nextStatus,
          notes:
            notes ||
            `Memilih vendor ${vendor?.company_name || quote.vendor_id} (${quote.vehicle_type} — Rp ${quote.total_cost.toLocaleString('id-ID')})`,
        });

        pushNotification(db, {
          recipient_email: booking.requester_email,
          recipient_role: 'USER',
          title: `Vendor ${nextStatus} (${booking.booking_number})`,
          message: `Vendor ${vendor?.company_name || ''} telah ditetapkan untuk ${booking.activity_name}.`,
          link: '/bookings/my',
          severity: 'success',
        });

        appendAuditLog(
          db,
          req.sessionUser!,
          'SELECT_VENDOR',
          'BOOKINGS',
          booking.booking_id,
          `Pilih vendor ${vendor?.company_name || quote.vendor_id} untuk ${booking.booking_number}`
        );
        return sanitizeBookingForUser(db, booking);
      },
      { requireRemoteSync: true }
    );
    res.json({ booking: updated });
  } catch (err) {
    sendMutationError(res, err, 'Gagal memilih vendor.');
  }
});

// Delete incoming order / booking log (Admin & Super Admin only)
apiRouter.delete('/bookings/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await dbStore.mutate(
      ['BOOKINGS', 'VENDOR_QUOTES', 'AUDIT_LOGS'],
      (db) => {
        const booking = db.BOOKINGS.find((b) => b.booking_id === req.params.id);
        if (!booking) return null;
        db.BOOKINGS = db.BOOKINGS.filter((b) => b.booking_id !== req.params.id);
        db.VENDOR_QUOTES = db.VENDOR_QUOTES.filter((q) => q.booking_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'BOOKINGS',
          booking.booking_id,
          `Hapus log order ${booking.booking_number} — ${booking.activity_name} (${booking.requester_email})`
        );
        return {
          booking_id: booking.booking_id,
          booking_number: booking.booking_number,
        };
      },
      { requireRemoteSync: true }
    );
    if (!deleted) {
      res.status(404).json({ error: 'Log order / pengajuan tidak ditemukan.' });
      return;
    }
    res.json({ ok: true, ...deleted });
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus log order.');
  }
});

// ========================
// INSPECTIONS & TEMPLATES (ADMIN ONLY)
// ========================
apiRouter.get('/inspection-templates', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({
    template: db.INSPECTION_TEMPLATES[0] || {
      template_id: 'tpl-default-001',
      name: 'Standar Inspeksi Armada Lazuardi',
      items: INITIAL_INSPECTION_TEMPLATE_ITEMS,
      updated_at: new Date().toISOString(),
    },
  });
});

apiRouter.put('/inspection-templates', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['INSPECTION_TEMPLATES', 'AUDIT_LOGS'], (db) => {
    const tpl = {
      template_id: db.INSPECTION_TEMPLATES[0]?.template_id || 'tpl-default-001',
      name: String(req.body.name || 'Standar Inspeksi Keselamatan Armada Lazuardi'),
      items: Array.isArray(req.body.items) ? req.body.items : INITIAL_INSPECTION_TEMPLATE_ITEMS,
      updated_at: new Date().toISOString(),
    };
    db.INSPECTION_TEMPLATES = [tpl];
    appendAuditLog(db, req.sessionUser!, 'UPDATE_TEMPLATE', 'INSPECTION_TEMPLATES', tpl.template_id, 'Perbarui template inspeksi kendaraan');
    return tpl;
  });
  res.json({ template: updated });
});

apiRouter.get('/inspections', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ inspections: db.INSPECTIONS });
});

function evaluateInspectionOutcome(items: InspectionItemResult[]): {
  result: Inspection['result'];
  criticalBroken: InspectionItemResult[];
} {
  const criticalBroken = items.filter((i) => i.is_critical && i.value === 'Rusak');
  const anyBrokenOrAttention = items.some((i) => i.value === 'Rusak' || i.value === 'Perlu Perhatian');

  if (criticalBroken.length > 0) {
    return { result: 'Tidak Layak Operasional', criticalBroken };
  }
  if (anyBrokenOrAttention) {
    return { result: 'Layak dengan Catatan', criticalBroken: [] };
  }
  return { result: 'Layak Operasional', criticalBroken: [] };
}

apiRouter.post('/inspections', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const isDraft = Boolean(req.body.save_as_draft);
  const createDamageIfCritical = Boolean(req.body.create_damage_report);

  try {
    const created = await dbStore.mutate(
      ['INSPECTIONS', 'VEHICLES', 'DAMAGE_REPORTS', 'NOTIFICATIONS', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const vehicle = db.VEHICLES.find((v) => v.vehicle_id === req.body.vehicle_id);
        if (!vehicle) throw new Error('Kendaraan wajib dipilih.');

        const items: InspectionItemResult[] = Array.isArray(req.body.items) ? req.body.items : [];
        const { result, criticalBroken } = evaluateInspectionOutcome(items);
        const now = new Date().toISOString();
        const insNumber = nextSequentialCode(
          'INS',
          db.INSPECTIONS.map((i) => i.inspection_number)
        );

        const triggeredBlock = !isDraft && criticalBroken.length > 0;
        const inspection: Inspection = {
          inspection_id: crypto.randomUUID(),
          inspection_number: insNumber,
          vehicle_id: vehicle.vehicle_id,
          plate_number: vehicle.plate_number,
          inspected_at: req.body.inspected_at || now,
          inspection_type: req.body.inspection_type || 'Harian',
          inspector_name: String(req.body.inspector_name || req.sessionUser!.name),
          inspector_email: req.sessionUser!.email,
          odometer: Number(req.body.odometer || vehicle.last_odometer),
          location: String(req.body.location || 'Kampus Lazuardi'),
          general_notes: String(req.body.general_notes || ''),
          photo_url: String(req.body.photo_url || ''),
          items,
          result,
          status: isDraft ? 'Draft' : 'Submitted',
          triggered_block: triggeredBlock,
          reviewed_by: '',
          reviewed_at: '',
        };
        db.INSPECTIONS.unshift(inspection);

        if (!isDraft) {
          if (inspection.odometer > vehicle.last_odometer) {
            vehicle.last_odometer = inspection.odometer;
          }

          if (triggeredBlock) {
            const brokenNames = criticalBroken.map((c) => c.label).join(', ');
            vehicle.safety_blocked = true;
            vehicle.safety_block_reason = `Temuan kritis pada ${inspection.inspection_number}: ${brokenNames}`;
            vehicle.eligibility_status = 'tidak_layak';
            vehicle.updated_at = now;

            pushNotification(db, {
              recipient_email: 'ALL_ADMINS',
              recipient_role: 'ALL_ADMINS',
              title: `BLOKIR KESELAMATAN: ${vehicle.plate_number}`,
              message: `Inspeksi ${inspection.inspection_number} menemukan item kritis rusak (${brokenNames}). Unit otomatis diblokir dari booking.`,
              link: `/transportation/vehicles/${vehicle.vehicle_id}`,
              severity: 'critical',
            });

            appendVehicleHistory(db, {
              vehicle_id: vehicle.vehicle_id,
              activity_type: 'Blokir/Pelepasan',
              actor: req.sessionUser!,
              summary: `Blokir otomatis akibat inspeksi ${inspection.inspection_number} (Item kritis rusak: ${brokenNames})`,
              reference_id: inspection.inspection_id,
            });

            if (createDamageIfCritical) {
              const dmgNumber = nextSequentialCode(
                'DMG',
                db.DAMAGE_REPORTS.map((d) => d.report_number)
              );
              db.DAMAGE_REPORTS.unshift({
                damage_report_id: crypto.randomUUID(),
                report_number: dmgNumber,
                vehicle_id: vehicle.vehicle_id,
                incident_date: getTodayWibIsoDate(),
                reporter_name: inspection.inspector_name,
                reporter_email: inspection.inspector_email,
                source: 'Hasil Inspeksi',
                inspection_id: inspection.inspection_id,
                odometer: inspection.odometer,
                vehicle_part: brokenNames,
                description: `Temuan item kritis rusak saat ${inspection.inspection_type}: ${brokenNames}. ${inspection.general_notes}`,
                priority: 'Kritis',
                operational_impact: 'Tidak Layak / Blokir',
                photo_url: inspection.photo_url,
                notes: 'Dibuat otomatis dari hasil inspeksi.',
                status: 'Terbuka',
                created_at: now,
              });
            }
          } else {
            vehicle.eligibility_status =
              result === 'Layak Operasional' ? 'layak' : 'layak_dengan_catatan';
            vehicle.updated_at = now;
          }

          appendVehicleHistory(db, {
            vehicle_id: vehicle.vehicle_id,
            activity_type: 'Inspeksi',
            actor: req.sessionUser!,
            summary: `Inspeksi ${inspection.inspection_type} (${inspection.inspection_number}) — Hasil: ${result}`,
            reference_id: inspection.inspection_id,
          });
        }

        appendAuditLog(
          db,
          req.sessionUser!,
          isDraft ? 'SAVE_INSPECTION_DRAFT' : 'SUBMIT_INSPECTION',
          'INSPECTIONS',
          inspection.inspection_id,
          `${inspection.inspection_number} (${vehicle.plate_number}): ${result}`
        );
        return inspection;
      }
    );

    res.status(201).json({ inspection: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan inspeksi.' });
  }
});

apiRouter.post('/inspections/:id/review', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['INSPECTIONS', 'AUDIT_LOGS'], (db) => {
    const ins = db.INSPECTIONS.find((i) => i.inspection_id === req.params.id);
    if (!ins) return null;
    ins.status = 'Reviewed';
    ins.reviewed_by = req.sessionUser!.email;
    ins.reviewed_at = new Date().toISOString();
    appendAuditLog(db, req.sessionUser!, 'REVIEW_INSPECTION', 'INSPECTIONS', ins.inspection_id, `Review inspeksi ${ins.inspection_number}`);
    return ins;
  });
  if (!updated) {
    res.status(404).json({ error: 'Inspeksi tidak ditemukan.' });
    return;
  }
  res.json({ inspection: updated });
});

// ========================
// DAMAGE REPORTS & REPAIRS (ADMIN ONLY)
// ========================
apiRouter.get('/damage-reports', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ damageReports: db.DAMAGE_REPORTS });
});

apiRouter.post('/damage-reports', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const created = await dbStore.mutate(
      ['DAMAGE_REPORTS', 'VEHICLES', 'VEHICLE_HISTORY', 'NOTIFICATIONS', 'AUDIT_LOGS'],
      (db) => {
        const vehicle = db.VEHICLES.find((v) => v.vehicle_id === req.body.vehicle_id);
        if (!vehicle) throw new Error('Kendaraan wajib dipilih.');
        const now = new Date().toISOString();
        const reportNumber = nextSequentialCode(
          'DMG',
          db.DAMAGE_REPORTS.map((d) => d.report_number)
        );
        const dmg = {
          damage_report_id: crypto.randomUUID(),
          report_number: reportNumber,
          vehicle_id: vehicle.vehicle_id,
          incident_date: String(req.body.incident_date || getTodayWibIsoDate()),
          reporter_name: String(req.body.reporter_name || req.sessionUser!.name),
          reporter_email: req.sessionUser!.email,
          source: req.body.source || 'Laporan Administrator',
          inspection_id: String(req.body.inspection_id || ''),
          odometer: Number(req.body.odometer || vehicle.last_odometer),
          vehicle_part: String(req.body.vehicle_part || ''),
          description: String(req.body.description || ''),
          priority: req.body.priority || 'Sedang',
          operational_impact: req.body.operational_impact || 'Perlu Pembatasan',
          photo_url: String(req.body.photo_url || ''),
          notes: String(req.body.notes || ''),
          status: 'Terbuka' as const,
          created_at: now,
        };
        db.DAMAGE_REPORTS.unshift(dmg);

        if (dmg.priority === 'Kritis' || dmg.operational_impact === 'Tidak Layak / Blokir') {
          vehicle.safety_blocked = true;
          vehicle.safety_block_reason = `Laporan kerusakan ${dmg.report_number}: ${dmg.vehicle_part}`;
          vehicle.eligibility_status = 'tidak_layak';
          vehicle.updated_at = now;
        }

        appendVehicleHistory(db, {
          vehicle_id: vehicle.vehicle_id,
          activity_type: 'Kerusakan',
          actor: req.sessionUser!,
          summary: `Laporan kerusakan ${dmg.report_number} (${dmg.priority}): ${dmg.vehicle_part}`,
          reference_id: dmg.damage_report_id,
        });

        pushNotification(db, {
          recipient_email: 'ALL_ADMINS',
          recipient_role: 'ALL_ADMINS',
          title: `Laporan Kerusakan ${dmg.report_number} (${vehicle.plate_number})`,
          message: `${dmg.vehicle_part} — Prioritas ${dmg.priority}.`,
          link: '/transportation/repairs',
          severity: dmg.priority === 'Kritis' ? 'critical' : 'warning',
        });

        appendAuditLog(db, req.sessionUser!, 'CREATE_DAMAGE_REPORT', 'DAMAGE_REPORTS', dmg.damage_report_id, `Buat ${dmg.report_number}`);
        return dmg;
      }
    );
    res.status(201).json({ damageReport: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal membuat laporan kerusakan.' });
  }
});

apiRouter.get('/repairs', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ repairs: db.REPAIRS });
});

apiRouter.post('/repairs', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const created = await dbStore.mutate(
      ['REPAIRS', 'DAMAGE_REPORTS', 'VEHICLES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const vehicle = db.VEHICLES.find((v) => v.vehicle_id === req.body.vehicle_id);
        if (!vehicle) throw new Error('Kendaraan wajib dipilih.');
        const now = new Date().toISOString();
        const repairNumber = nextSequentialCode(
          'RPR',
          db.REPAIRS.map((r) => r.repair_number)
        );
        const blocksVehicle = req.body.blocks_vehicle !== false;
        const initialStatus: RepairStatus = req.body.status || 'Menunggu Persetujuan GA';

        const repair: Repair = {
          repair_id: crypto.randomUUID(),
          repair_number: repairNumber,
          vehicle_id: vehicle.vehicle_id,
          damage_report_id: String(req.body.damage_report_id || ''),
          workshop_name: String(req.body.workshop_name || ''),
          workshop_pic: String(req.body.workshop_pic || ''),
          entry_date: String(req.body.entry_date || getTodayWibIsoDate()),
          target_completion_date: String(req.body.target_completion_date || ''),
          actual_completion_date: '',
          diagnosis: String(req.body.diagnosis || ''),
          work_details: String(req.body.work_details || ''),
          spare_parts: String(req.body.spare_parts || ''),
          estimated_cost: Number(req.body.estimated_cost || 0),
          actual_cost: Number(req.body.actual_cost || 0),
          receipt_url: String(req.body.receipt_url || ''),
          status: initialStatus,
          pic_admin: req.sessionUser!.email,
          approved_by: '',
          approved_at: '',
          verified_by: '',
          verified_at: '',
          blocks_vehicle: blocksVehicle,
          notes: String(req.body.notes || ''),
          change_log: [
            {
              timestamp: now,
              actor: req.sessionUser!.email,
              action: `Pekerjaan perbaikan dibuat (${initialStatus})`,
              notes: String(req.body.diagnosis || ''),
            },
          ],
        };
        db.REPAIRS.unshift(repair);

        if (repair.damage_report_id) {
          const dmg = db.DAMAGE_REPORTS.find((d) => d.damage_report_id === repair.damage_report_id);
          if (dmg) dmg.status = 'Diproses Perbaikan';
        }

        if (blocksVehicle) {
          vehicle.safety_blocked = true;
          vehicle.safety_block_reason = `Sedang dalam perbaikan ${repair.repair_number}`;
          vehicle.eligibility_status = 'tidak_layak';
          vehicle.updated_at = now;
        }

        appendVehicleHistory(db, {
          vehicle_id: vehicle.vehicle_id,
          activity_type: 'Pelaksanaan Perbaikan',
          actor: req.sessionUser!,
          summary: `Dibuka perbaikan ${repair.repair_number} di ${repair.workshop_name || 'Bengkel'}`,
          reference_id: repair.repair_id,
        });
        appendAuditLog(db, req.sessionUser!, 'CREATE_REPAIR', 'REPAIRS', repair.repair_id, `Buat perbaikan ${repair.repair_number}`);
        return repair;
      }
    );
    res.status(201).json({ repair: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal membuat pekerjaan perbaikan.' });
  }
});

apiRouter.post('/repairs/:id/transition', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const updated = await dbStore.mutate(
      ['REPAIRS', 'EXPENSES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const repair = db.REPAIRS.find((r) => r.repair_id === req.params.id);
        if (!repair) throw new Error('Data perbaikan tidak ditemukan.');

        const now = new Date().toISOString();
        const nextStatus: RepairStatus = req.body.status || repair.status;
        const prevStatus = repair.status;

        if (req.body.workshop_name !== undefined) repair.workshop_name = String(req.body.workshop_name);
        if (req.body.workshop_pic !== undefined) repair.workshop_pic = String(req.body.workshop_pic);
        if (req.body.diagnosis !== undefined) repair.diagnosis = String(req.body.diagnosis);
        if (req.body.work_details !== undefined) repair.work_details = String(req.body.work_details);
        if (req.body.spare_parts !== undefined) repair.spare_parts = String(req.body.spare_parts);
        if (req.body.estimated_cost !== undefined) repair.estimated_cost = Number(req.body.estimated_cost);
        if (req.body.actual_cost !== undefined) repair.actual_cost = Number(req.body.actual_cost);
        if (req.body.actual_completion_date !== undefined) repair.actual_completion_date = String(req.body.actual_completion_date);
        if (req.body.receipt_url !== undefined) repair.receipt_url = String(req.body.receipt_url);
        if (req.body.notes !== undefined) repair.notes = String(req.body.notes);

        repair.status = nextStatus;
        if (nextStatus === 'Disetujui untuk Perbaikan' && !repair.approved_by) {
          repair.approved_by = req.sessionUser!.email;
          repair.approved_at = now;
        }
        if (nextStatus === 'Selesai Diperbaiki' && !repair.actual_completion_date) {
          repair.actual_completion_date = getTodayWibIsoDate();
        }

        repair.change_log.unshift({
          timestamp: now,
          actor: req.sessionUser!.email,
          action: `${prevStatus} -> ${nextStatus}`,
          notes: String(req.body.log_notes || req.body.notes || ''),
        });

        // Prevent duplicate expense by referencing repair_id
        if (repair.actual_cost > 0) {
          upsertLinkedExpense(db, {
            vehicle_id: repair.vehicle_id,
            expense_date: repair.actual_completion_date || getTodayWibIsoDate(),
            category: 'Perbaikan',
            description: `Perbaikan ${repair.repair_number}: ${repair.work_details || repair.diagnosis}`,
            vendor_name: repair.workshop_name || 'Bengkel Rekanan',
            amount: repair.actual_cost,
            reference_type: 'REPAIR',
            reference_id: repair.repair_id,
            receipt_url: repair.receipt_url,
            notes: repair.spare_parts ? `Suku cadang: ${repair.spare_parts}` : '',
            actor_email: req.sessionUser!.email,
          });
        }

        appendVehicleHistory(db, {
          vehicle_id: repair.vehicle_id,
          activity_type:
            nextStatus === 'Disetujui untuk Perbaikan' ? 'Persetujuan Perbaikan' : 'Pelaksanaan Perbaikan',
          actor: req.sessionUser!,
          summary: `Perbaikan ${repair.repair_number}: ${prevStatus} -> ${nextStatus}`,
          reference_id: repair.repair_id,
        });
        appendAuditLog(db, req.sessionUser!, 'UPDATE_REPAIR', 'REPAIRS', repair.repair_id, `${repair.repair_number}: ${nextStatus}`);
        return repair;
      }
    );
    res.json({ repair: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui status perbaikan.' });
  }
});

// Explicit final repair verification to lift vehicle block
apiRouter.post('/repairs/:id/verify', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const { eligibility_status, verification_notes } = req.body as {
    eligibility_status: 'layak' | 'layak_dengan_catatan' | 'tidak_layak';
    verification_notes?: string;
  };
  try {
    const updated = await dbStore.mutate(
      ['REPAIRS', 'DAMAGE_REPORTS', 'VEHICLES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const repair = db.REPAIRS.find((r) => r.repair_id === req.params.id);
        if (!repair) throw new Error('Data perbaikan tidak ditemukan.');

        const now = new Date().toISOString();
        repair.status = 'Ditutup';
        repair.verified_by = req.sessionUser!.email;
        repair.verified_at = now;
        repair.blocks_vehicle = eligibility_status === 'tidak_layak';
        repair.change_log.unshift({
          timestamp: now,
          actor: req.sessionUser!.email,
          action: 'Verifikasi Hasil Perbaikan & Ditutup',
          notes: verification_notes || `Kelayakan kendaraan ditetapkan: ${eligibility_status}`,
        });

        if (repair.damage_report_id) {
          const dmg = db.DAMAGE_REPORTS.find((d) => d.damage_report_id === repair.damage_report_id);
          if (dmg) dmg.status = 'Selesai';
        }

        const vehicle = db.VEHICLES.find((v) => v.vehicle_id === repair.vehicle_id);
        if (vehicle) {
          vehicle.eligibility_status = eligibility_status;
          vehicle.safety_blocked = eligibility_status === 'tidak_layak';
          vehicle.safety_block_reason =
            eligibility_status === 'tidak_layak' ? 'Hasil verifikasi perbaikan menyatakan masih tidak layak.' : '';
          vehicle.condition_notes = verification_notes || vehicle.condition_notes;
          vehicle.updated_at = now;

          appendVehicleHistory(db, {
            vehicle_id: vehicle.vehicle_id,
            activity_type: 'Blokir/Pelepasan',
            actor: req.sessionUser!,
            summary: `Verifikasi perbaikan ${repair.repair_number} selesai. Status kelayakan: ${eligibility_status}.`,
            reference_id: repair.repair_id,
          });
        }

        appendAuditLog(
          db,
          req.sessionUser!,
          'VERIFY_REPAIR',
          'REPAIRS',
          repair.repair_id,
          `Verifikasi akhir ${repair.repair_number} (${eligibility_status})`
        );
        return repair;
      }
    );
    res.json({ repair: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memverifikasi perbaikan.' });
  }
});

// ========================
// PREVENTIVE MAINTENANCE (ADMIN ONLY)
// ========================
apiRouter.get('/maintenance-plans', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const plans = db.MAINTENANCE_PLANS.map((m) => {
    const veh = db.VEHICLES.find((v) => v.vehicle_id === m.vehicle_id);
    const calc = computeMaintenanceStatusAndReminder(m, veh?.last_odometer || 0);
    return {
      ...m,
      ...calc,
      current_odometer: veh?.last_odometer || 0,
    };
  });
  res.json({ maintenancePlans: plans });
});

apiRouter.post('/maintenance-plans', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const created = await dbStore.mutate(['MAINTENANCE_PLANS', 'AUDIT_LOGS'], (db) => {
    const veh = db.VEHICLES.find((v) => v.vehicle_id === req.body.vehicle_id);
    const plan: MaintenancePlan = {
      maintenance_plan_id: crypto.randomUUID(),
      vehicle_id: String(req.body.vehicle_id || ''),
      maintenance_type: req.body.maintenance_type || 'Servis berkala',
      schedule_basis: req.body.schedule_basis || 'Kombinasi',
      interval_months: Number(req.body.interval_months || 6),
      interval_days: Number(req.body.interval_days || 180),
      interval_km: Number(req.body.interval_km || 10000),
      last_service_date: String(req.body.last_service_date || veh?.last_service_date || getTodayWibIsoDate()),
      last_service_odometer: Number(req.body.last_service_odometer || veh?.last_odometer || 0),
      next_target_date: String(req.body.next_target_date || ''),
      next_target_km: Number(req.body.next_target_km || 0),
      status: req.body.status || 'Terjadwal',
      reminder_stage: 'Aman',
      last_vendor: String(req.body.last_vendor || ''),
      last_cost: Number(req.body.last_cost || 0),
      notes: String(req.body.notes || ''),
      updated_at: new Date().toISOString(),
    };
    const calc = computeMaintenanceStatusAndReminder(plan, veh?.last_odometer || 0);
    plan.status = calc.status;
    plan.reminder_stage = calc.reminder_stage;
    db.MAINTENANCE_PLANS.unshift(plan);
    appendAuditLog(db, req.sessionUser!, 'CREATE_MAINTENANCE_PLAN', 'MAINTENANCE_PLANS', plan.maintenance_plan_id, `Buat rencana ${plan.maintenance_type}`);
    return plan;
  });
  res.status(201).json({ maintenancePlan: created });
});

apiRouter.post('/maintenance-plans/:id/complete', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const updated = await dbStore.mutate(
      ['MAINTENANCE_PLANS', 'VEHICLES', 'EXPENSES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const plan = db.MAINTENANCE_PLANS.find((m) => m.maintenance_plan_id === req.params.id);
        if (!plan) throw new Error('Rencana perawatan tidak ditemukan.');

        const actualDate = String(req.body.actual_date || getTodayWibIsoDate());
        const actualOdometer = Number(req.body.actual_odometer || 0);
        const cost = Number(req.body.cost || 0);
        const vendor = String(req.body.vendor_name || '');
        const workSummary = String(req.body.work_summary || plan.maintenance_type);

        // Compute next schedule
        const nextDateObj = new Date(actualDate);
        if (plan.interval_months > 0) {
          nextDateObj.setMonth(nextDateObj.getMonth() + plan.interval_months);
        } else if (plan.interval_days > 0) {
          nextDateObj.setDate(nextDateObj.getDate() + plan.interval_days);
        }
        const nextDate = nextDateObj.toISOString().slice(0, 10);
        const nextKm = plan.interval_km > 0 ? actualOdometer + plan.interval_km : plan.next_target_km;

        plan.last_service_date = actualDate;
        plan.last_service_odometer = actualOdometer;
        plan.next_target_date = nextDate;
        plan.next_target_km = nextKm;
        plan.last_vendor = vendor;
        plan.last_cost = cost;
        plan.status = 'Terjadwal';
        plan.reminder_stage = 'Aman';
        plan.notes = String(req.body.notes || plan.notes);
        plan.updated_at = new Date().toISOString();

        const vehicle = db.VEHICLES.find((v) => v.vehicle_id === plan.vehicle_id);
        if (vehicle) {
          if (actualOdometer > vehicle.last_odometer) vehicle.last_odometer = actualOdometer;
          vehicle.last_service_date = actualDate;
          vehicle.last_service_odometer = actualOdometer;
          vehicle.next_service_date = nextDate;
          vehicle.updated_at = new Date().toISOString();
        }

        if (cost > 0) {
          upsertLinkedExpense(db, {
            vehicle_id: plan.vehicle_id,
            expense_date: actualDate,
            category: 'Servis berkala',
            description: `${plan.maintenance_type}: ${workSummary}`,
            vendor_name: vendor || 'Bengkel Rekanan',
            amount: cost,
            reference_type: 'MAINTENANCE',
            reference_id: `${plan.maintenance_plan_id}_${actualDate}`,
            receipt_url: String(req.body.receipt_url || ''),
            notes: `Odometer: ${actualOdometer.toLocaleString('id-ID')} km`,
            actor_email: req.sessionUser!.email,
          });
        }

        appendVehicleHistory(db, {
          vehicle_id: plan.vehicle_id,
          activity_type: 'Servis Berkala',
          actor: req.sessionUser!,
          summary: `${plan.maintenance_type} selesai (${actualOdometer.toLocaleString('id-ID')} km) di ${vendor || 'Bengkel'} — Biaya Rp ${cost.toLocaleString('id-ID')}. Jadwal berikutnya: ${nextDate}`,
          reference_id: plan.maintenance_plan_id,
        });
        appendAuditLog(
          db,
          req.sessionUser!,
          'COMPLETE_MAINTENANCE',
          'MAINTENANCE_PLANS',
          plan.maintenance_plan_id,
          `Selesai ${plan.maintenance_type}`
        );
        return plan;
      }
    );
    res.json({ maintenancePlan: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyelesaikan servis berkala.' });
  }
});

// ========================
// EXPENSES & VEHICLE HISTORY (ADMIN ONLY)
// ========================
apiRouter.get('/expenses', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ expenses: db.EXPENSES });
});

apiRouter.post('/expenses', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const created = await dbStore.mutate(['EXPENSES', 'VEHICLE_HISTORY', 'AUDIT_LOGS'], (db) => {
    const now = new Date().toISOString();
    const exp = {
      expense_id: crypto.randomUUID(),
      vehicle_id: String(req.body.vehicle_id || ''),
      expense_date: String(req.body.expense_date || getTodayWibIsoDate()),
      category: req.body.category || 'Biaya operasional lainnya',
      description: String(req.body.description || ''),
      vendor_name: String(req.body.vendor_name || ''),
      amount: Number(req.body.amount || 0),
      reference_type: 'MANUAL' as const,
      reference_id: String(req.body.reference_id || ''),
      receipt_url: String(req.body.receipt_url || ''),
      notes: String(req.body.notes || ''),
      created_by: req.sessionUser!.email,
      created_at: now,
    };
    db.EXPENSES.unshift(exp);
    if (exp.vehicle_id) {
      appendVehicleHistory(db, {
        vehicle_id: exp.vehicle_id,
        activity_type: ['Pajak kendaraan', 'KIR', 'Asuransi'].includes(exp.category) ? 'Dokumen' : 'Servis Berkala',
        actor: req.sessionUser!,
        summary: `Pencatatan biaya ${exp.category}: ${exp.description} (Rp ${exp.amount.toLocaleString('id-ID')})`,
        reference_id: exp.expense_id,
      });
    }
    appendAuditLog(db, req.sessionUser!, 'CREATE_EXPENSE', 'EXPENSES', exp.expense_id, `Catat biaya ${exp.category} Rp ${exp.amount}`);
    return exp;
  });
  res.status(201).json({ expense: created });
});

apiRouter.delete('/expenses/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await dbStore.mutate(
      ['EXPENSES', 'AUDIT_LOGS'],
      (db) => {
        const exp = db.EXPENSES.find((e) => e.expense_id === req.params.id);
        if (!exp) return false;
        db.EXPENSES = db.EXPENSES.filter((e) => e.expense_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE_EXPENSE',
          'EXPENSES',
          req.params.id,
          `Hapus catatan biaya ${exp.category} (${exp.description})`
        );
        return true;
      },
      { requireRemoteSync: true }
    );
    if (!deleted) {
      res.status(404).json({ error: 'Catatan biaya tidak ditemukan.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus catatan biaya.');
  }
});

apiRouter.get('/vehicle-history', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const { vehicle_id } = req.query as { vehicle_id?: string };
  const rows = vehicle_id
    ? db.VEHICLE_HISTORY.filter((h) => h.vehicle_id === vehicle_id)
    : db.VEHICLE_HISTORY;
  res.json({ history: rows });
});

apiRouter.delete('/vehicle-history/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await dbStore.mutate(
      ['VEHICLE_HISTORY', 'AUDIT_LOGS'],
      (db) => {
        const item = db.VEHICLE_HISTORY.find((h) => h.history_id === req.params.id);
        if (!item) return false;
        db.VEHICLE_HISTORY = db.VEHICLE_HISTORY.filter((h) => h.history_id !== req.params.id);
        appendAuditLog(
          db,
          req.sessionUser!,
          'DELETE',
          'VEHICLE_HISTORY',
          req.params.id,
          `Hapus log riwayat kendaraan (${item.activity_type}: ${item.summary})`
        );
        return true;
      },
      { requireRemoteSync: true }
    );
    if (!deleted) {
      res.status(404).json({ error: 'Log riwayat kendaraan tidak ditemukan.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus log riwayat kendaraan.');
  }
});

// ========================
// INTEGRATED REPORTS (ADMIN ONLY)
// ========================
apiRouter.get('/reports/integrated', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();

  const byDepartment = db.DEPARTMENTS.map((dept) => {
    const deptBookings = db.BOOKINGS.filter((b) => b.department_id === dept.department_id);
    return {
      department_id: dept.department_id,
      department_code: dept.department_code,
      department_name: dept.department_name,
      internal_count: deptBookings.filter((b) => b.booking_kind === 'INTERNAL').length,
      external_count: deptBookings.filter((b) => b.booking_kind === 'EXTERNAL').length,
      total_passengers: deptBookings.reduce((s, b) => s + Number(b.passenger_count || 0), 0),
    };
  });

  const vehicleUtilization = db.VEHICLES.map((v) => {
    const bookings = db.BOOKINGS.filter(
      (b) =>
        b.allocated_vehicle_ids.includes(v.vehicle_id) &&
        ['Dijadwalkan', 'Dalam Perjalanan', 'Selesai'].includes(b.status)
    );
    const totalExpense = db.EXPENSES.filter((e) => e.vehicle_id === v.vehicle_id).reduce(
      (s, e) => s + Number(e.amount || 0),
      0
    );
    return {
      vehicle_id: v.vehicle_id,
      plate_number: v.plate_number,
      vehicle_name: v.vehicle_name,
      total_bookings: bookings.length,
      total_expense: totalExpense,
      eligibility_status: v.eligibility_status,
      last_odometer: v.last_odometer,
    };
  });

  const externalRentalSummary = db.BOOKINGS.filter((b) => b.booking_kind === 'EXTERNAL').map((b) => {
    const selectedQuote = db.VENDOR_QUOTES.find((q) => q.quote_id === b.selected_quote_id);
    const vendor = db.VENDORS.find((v) => v.vendor_id === b.selected_vendor_id);
    const dept = db.DEPARTMENTS.find((d) => d.department_id === b.department_id);
    return {
      booking_id: b.booking_id,
      booking_number: b.booking_number,
      activity_name: b.activity_name,
      department_name: dept?.department_name || '',
      departure_at: b.departure_at,
      status: b.status,
      vendor_name: vendor?.company_name || '-',
      estimated_budget: b.estimated_budget,
      realized_cost: selectedQuote?.total_cost || 0,
    };
  });

  const costByCategory = new Map<string, number>();
  for (const exp of db.EXPENSES) {
    costByCategory.set(exp.category, (costByCategory.get(exp.category) || 0) + Number(exp.amount || 0));
  }

  res.json({
    byDepartment,
    vehicleUtilization,
    externalRentalSummary,
    costByCategory: Array.from(costByCategory.entries()).map(([category, total]) => ({ category, total })),
    totalOperationalCost: db.EXPENSES.reduce((s, e) => s + Number(e.amount || 0), 0),
  });
});

// ========================
// NOTIFICATIONS
// ========================
apiRouter.get('/notifications', requireAuth, async (req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  const user = req.sessionUser!;
  const rows = db.NOTIFICATIONS.filter((n) => {
    if (user.role === 'ADMIN') {
      return n.recipient_role === 'ALL_ADMINS' || n.recipient_email.toLowerCase() === user.email.toLowerCase();
    }
    return n.recipient_email.toLowerCase() === user.email.toLowerCase();
  });
  res.json({ notifications: rows });
});

apiRouter.post('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res: Response) => {
  await dbStore.mutate(['NOTIFICATIONS'], (db) => {
    const found = db.NOTIFICATIONS.find((n) => n.notification_id === req.params.id);
    if (found) found.is_read = true;
  });
  res.json({ ok: true });
});

apiRouter.post('/notifications/read-all', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = req.sessionUser!;
  await dbStore.mutate(['NOTIFICATIONS'], (db) => {
    for (const n of db.NOTIFICATIONS) {
      if (
        (user.role === 'ADMIN' && n.recipient_role === 'ALL_ADMINS') ||
        n.recipient_email.toLowerCase() === user.email.toLowerCase()
      ) {
        n.is_read = true;
      }
    }
  });
  res.json({ ok: true });
});

// ========================
// SETTINGS & AUDIT LOGS (ADMIN ONLY)
// ========================
apiRouter.get('/settings', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({
    settings: db.SETTINGS[0] || null,
    storage: dbStore.getStorageDiagnostics(),
  });
});

apiRouter.put('/settings', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  const updated = await dbStore.mutate(['SETTINGS', 'AUDIT_LOGS'], (db) => {
    const next = {
      ...(db.SETTINGS[0] || {}),
      ...req.body,
      updated_at: new Date().toISOString(),
    };
    db.SETTINGS = [next];
    appendAuditLog(db, req.sessionUser!, 'UPDATE_SETTINGS', 'SETTINGS', 'app-settings', 'Memperbarui konfigurasi aplikasi LVBMS');
    return next;
  });
  res.json({ settings: updated });
});

apiRouter.get('/audit-logs', requireAuth, requireRole('ADMIN'), async (_req: AuthedRequest, res: Response) => {
  const db = await dbStore.getSnapshot();
  res.json({ auditLogs: db.AUDIT_LOGS.slice(0, 200) });
});

apiRouter.delete('/audit-logs/:id', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await dbStore.mutate(
      ['AUDIT_LOGS'],
      (db) => {
        const exists = db.AUDIT_LOGS.some((l) => l.log_id === req.params.id);
        if (!exists) return false;
        db.AUDIT_LOGS = db.AUDIT_LOGS.filter((l) => l.log_id !== req.params.id);
        return true;
      },
      { requireRemoteSync: true }
    );
    if (!deleted) {
      res.status(404).json({ error: 'Log audit tidak ditemukan.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    sendMutationError(res, err, 'Gagal menghapus log audit.');
  }
});

// ========================
// GOOGLE SHEETS DATABASE INTEGRATION (ADMIN ONLY)
// ========================
apiRouter.get('/integrations/google-sheets', requireAuth, requireRole('ADMIN'), (_req: AuthedRequest, res: Response) => {
  res.json({
    diagnostics: dbStore.getStorageDiagnostics(),
    sheetKeys: SHEET_KEYS,
  });
});

apiRouter.post(
  '/integrations/google-sheets/provision',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthedRequest, res: Response) => {
    const oauthToken = getGoogleOAuthTokenFromRequest(req);
    if (!oauthToken) {
      res.status(400).json({
        error: 'Token Google OAuth (Sheets & Drive) belum tersedia di sesi ini. Silakan otorisasi Google Workspace terlebih dahulu.',
        needsGoogleReauth: true,
      });
      return;
    }

    try {
      const title = String(req.body?.title || 'LVBMS Database - Sekolah Lazuardi');
      const result = await dbStore.provisionNewSpreadsheet(oauthToken, title, req.sessionUser!.email);
      await dbStore.mutate(['AUDIT_LOGS'], (db) => {
        appendAuditLog(
          db,
          req.sessionUser!,
          'PROVISION_GOOGLE_SHEET',
          'SYSTEM',
          result.connection.spreadsheetId,
          `Membuat & menghubungkan database Google Sheets "${result.connection.title}" (${result.sheetCount} sheet)`
        );
      });
      res.json({
        ...result,
        diagnostics: dbStore.getStorageDiagnostics(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat database Google Sheets.';
      res.status(400).json({ error: msg });
    }
  }
);

apiRouter.post(
  '/integrations/google-sheets/connect',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthedRequest, res: Response) => {
    const oauthToken = getGoogleOAuthTokenFromRequest(req);
    if (!oauthToken) {
      res.status(400).json({
        error: 'Token Google OAuth (Sheets & Drive) belum tersedia di sesi ini. Silakan otorisasi Google Workspace terlebih dahulu.',
        needsGoogleReauth: true,
      });
      return;
    }

    try {
      const spreadsheetIdOrUrl = String(req.body?.spreadsheetIdOrUrl || '').trim();
      const mode = req.body?.mode === 'pull' ? 'pull' : 'push';
      if (!spreadsheetIdOrUrl) {
        res.status(400).json({ error: 'URL atau Spreadsheet ID wajib diisi.' });
        return;
      }
      const result = await dbStore.connectExistingSpreadsheet(
        oauthToken,
        spreadsheetIdOrUrl,
        mode,
        req.sessionUser!.email
      );
      await dbStore.mutate(['AUDIT_LOGS'], (db) => {
        appendAuditLog(
          db,
          req.sessionUser!,
          'CONNECT_GOOGLE_SHEET',
          'SYSTEM',
          result.connection.spreadsheetId,
          `Menghubungkan Google Sheet "${result.connection.title}" (mode: ${mode})`
        );
      });
      res.json({
        ...result,
        diagnostics: dbStore.getStorageDiagnostics(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungkan ke Google Spreadsheet.';
      res.status(400).json({ error: msg });
    }
  }
);

apiRouter.post(
  '/integrations/google-sheets/sync',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthedRequest, res: Response) => {
    const oauthToken = getGoogleOAuthTokenFromRequest(req);
    if (!oauthToken) {
      res.status(400).json({
        error: 'Token Google OAuth (Sheets & Drive) belum tersedia atau kedaluwarsa. Silakan otorisasi ulang Google Workspace.',
        needsGoogleReauth: true,
      });
      return;
    }

    try {
      const direction = req.body?.direction === 'pull' ? 'pull' : 'push';
      const connection = await dbStore.syncConnectedSpreadsheet(oauthToken, direction);
      await dbStore.mutate(['AUDIT_LOGS'], (db) => {
        appendAuditLog(
          db,
          req.sessionUser!,
          'SYNC_GOOGLE_SHEET',
          'SYSTEM',
          connection.spreadsheetId,
          `Sinkronisasi database Google Sheets (${direction.toUpperCase()})`
        );
      });
      res.json({
        connection,
        diagnostics: dbStore.getStorageDiagnostics(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal melakukan sinkronisasi Google Sheets.';
      res.status(400).json({ error: msg });
    }
  }
);

apiRouter.post(
  '/integrations/google-sheets/share-domain',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthedRequest, res: Response) => {
    const oauthToken = getGoogleOAuthTokenFromRequest(req);
    if (!oauthToken) {
      res.status(400).json({
        error: 'Token Google OAuth (Sheets & Drive) belum tersedia. Silakan otorisasi Google Workspace terlebih dahulu.',
        needsGoogleReauth: true,
      });
      return;
    }

    try {
      const shareResult = await dbStore.shareConnectedSpreadsheetWithDomain(oauthToken);
      await dbStore.mutate(['AUDIT_LOGS'], (db) => {
        appendAuditLog(
          db,
          req.sessionUser!,
          'SHARE_GOOGLE_SHEET_DOMAIN',
          'SYSTEM',
          shareResult.connection.spreadsheetId,
          shareResult.shared
            ? `Membagikan akses tulis Google Sheet ke domain @${shareResult.domain}`
            : `Percobaan berbagi ke @${shareResult.domain}: ${shareResult.note || 'dibatasi kebijakan domain'}`
        );
      });
      res.json({
        ...shareResult,
        diagnostics: dbStore.getStorageDiagnostics(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membagikan Google Sheet ke domain sekolah.';
      res.status(400).json({ error: msg });
    }
  }
);

apiRouter.post(
  '/integrations/google-sheets/disconnect',
  requireAuth,
  requireRole('ADMIN'),
  async (req: AuthedRequest, res: Response) => {
    const prev = dbStore.getConnectedSheetMeta();
    dbStore.disconnectOAuthSpreadsheet();
    if (prev) {
      await dbStore.mutate(['AUDIT_LOGS'], (db) => {
        appendAuditLog(
          db,
          req.sessionUser!,
          'DISCONNECT_GOOGLE_SHEET',
          'SYSTEM',
          prev.spreadsheetId,
          `Memutuskan koneksi database Google Sheets "${prev.title}"`
        );
      });
    }
    res.json({
      ok: true,
      diagnostics: dbStore.getStorageDiagnostics(),
    });
  }
);
