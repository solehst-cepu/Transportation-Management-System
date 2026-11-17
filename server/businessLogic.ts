import crypto from 'crypto';
import {
  Booking,
  Driver,
  ExpenseCategory,
  MaintenancePlan,
  SessionUser,
  Vehicle,
  VehicleHistory,
} from '../shared/types.ts';
import { DatabaseSnapshot } from './sheetsStore.ts';

export function formatWibDate(isoDate = new Date().toISOString()): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoDate));
}

export function getTodayWibIsoDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export function intervalsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const sA = new Date(startA).getTime();
  const eA = new Date(endA).getTime();
  const sB = new Date(startB).getTime();
  const eB = new Date(endB).getTime();
  if (Number.isNaN(sA) || Number.isNaN(eA) || Number.isNaN(sB) || Number.isNaN(eB)) return false;
  return sA < eB && sB < eA;
}

export function getVehicleBlockReasons(
  db: DatabaseSnapshot,
  vehicle: Vehicle,
  departureAt?: string,
  returnAt?: string,
  excludeBookingId?: string
): string[] {
  const reasons: string[] = [];

  if (vehicle.admin_status !== 'aktif') {
    reasons.push('Status administratif kendaraan tidak aktif.');
  }
  if (vehicle.eligibility_status === 'tidak_layak') {
    reasons.push('Kendaraan berstatus Tidak Layak Operasional.');
  }
  if (vehicle.eligibility_status === 'belum_diverifikasi') {
    reasons.push('Kelayakan kendaraan belum diverifikasi oleh GA.');
  }
  if (vehicle.safety_blocked) {
    reasons.push(vehicle.safety_block_reason || 'Kendaraan diblokir keselamatan akibat temuan inspeksi.');
  }

  // Active repairs block vehicle
  const activeRepairs = db.REPAIRS.filter(
    (r) =>
      r.vehicle_id === vehicle.vehicle_id &&
      r.blocks_vehicle &&
      r.status !== 'Ditutup'
  );
  if (activeRepairs.length > 0) {
    reasons.push(`Kendaraan sedang dalam proses perbaikan (${activeRepairs[0].repair_number}: ${activeRepairs[0].status}).`);
  }

  // Active maintenance in progress
  const activeMaint = db.MAINTENANCE_PLANS.filter(
    (m) => m.vehicle_id === vehicle.vehicle_id && m.status === 'Dalam Pengerjaan'
  );
  if (activeMaint.length > 0) {
    reasons.push(`Kendaraan sedang dalam perawatan (${activeMaint[0].maintenance_type}).`);
  }

  // Schedule overlap check
  if (departureAt && returnAt) {
    const conflicts = db.BOOKINGS.filter(
      (b) =>
        b.booking_id !== excludeBookingId &&
        b.booking_kind === 'INTERNAL' &&
        ['Dijadwalkan', 'Dalam Perjalanan'].includes(b.status) &&
        b.allocated_vehicle_ids.includes(vehicle.vehicle_id) &&
        intervalsOverlap(departureAt, returnAt, b.departure_at, b.return_at)
    );
    if (conflicts.length > 0) {
      reasons.push(
        `Bentrok jadwal dengan pemesanan ${conflicts[0].booking_number} (${conflicts[0].activity_name}).`
      );
    }
  }

  return reasons;
}

export function getDriverBlockReasons(
  db: DatabaseSnapshot,
  driver: Driver,
  requiredVehicleTypeIds: string[],
  departureAt?: string,
  returnAt?: string,
  excludeBookingId?: string
): string[] {
  const reasons: string[] = [];

  if (driver.active_status !== 'aktif') {
    reasons.push('Pengemudi berstatus tidak aktif.');
  }

  const today = getTodayWibIsoDate();
  if (driver.sim_expiry && driver.sim_expiry < today) {
    reasons.push(`SIM ${driver.sim_type} telah kedaluwarsa (${driver.sim_expiry}).`);
  }

  if (requiredVehicleTypeIds.length > 0) {
    const incompatible = requiredVehicleTypeIds.some(
      (vtId) => !driver.eligible_vehicle_type_ids.includes(vtId)
    );
    if (incompatible) {
      reasons.push('Kompetensi/SIM pengemudi belum mencakup jenis kendaraan yang dipilih.');
    }
  }

  if (departureAt && returnAt) {
    const conflicts = db.BOOKINGS.filter(
      (b) =>
        b.booking_id !== excludeBookingId &&
        b.booking_kind === 'INTERNAL' &&
        ['Dijadwalkan', 'Dalam Perjalanan'].includes(b.status) &&
        b.allocated_driver_ids.includes(driver.driver_id) &&
        intervalsOverlap(departureAt, returnAt, b.departure_at, b.return_at)
    );
    if (conflicts.length > 0) {
      reasons.push(
        `Jadwal pengemudi bentrok dengan ${conflicts[0].booking_number} (${conflicts[0].activity_name}).`
      );
    }
  }

  return reasons;
}

export function computeMaintenanceStatusAndReminder(
  plan: MaintenancePlan,
  currentVehicleOdometer: number
): { status: MaintenancePlan['status']; reminder_stage: MaintenancePlan['reminder_stage'] } {
  if (plan.status === 'Dalam Pengerjaan') {
    return { status: 'Dalam Pengerjaan', reminder_stage: plan.reminder_stage };
  }

  const today = new Date(getTodayWibIsoDate()).getTime();
  let daysDiff = Number.POSITIVE_INFINITY;
  if (plan.next_target_date) {
    daysDiff = Math.ceil((new Date(plan.next_target_date).getTime() - today) / (1000 * 60 * 60 * 24));
  }

  let kmDiff = Number.POSITIVE_INFINITY;
  if (plan.next_target_km > 0 && currentVehicleOdometer > 0) {
    kmDiff = plan.next_target_km - currentVehicleOdometer;
  }

  const isDateBasis = plan.schedule_basis === 'Tanggal' || plan.schedule_basis === 'Kombinasi';
  const isKmBasis = plan.schedule_basis === 'Kilometer' || plan.schedule_basis === 'Kombinasi';

  const overdueByDate = isDateBasis && daysDiff < 0;
  const overdueByKm = isKmBasis && kmDiff < 0;
  if (overdueByDate || overdueByKm) {
    return { status: 'Terlambat', reminder_stage: 'Terlambat' };
  }

  const dueByDate = isDateBasis && daysDiff === 0;
  const dueByKm = isKmBasis && kmDiff <= 100;
  if (dueByDate || dueByKm) {
    return { status: 'Jatuh Tempo', reminder_stage: 'Jatuh Tempo' };
  }

  if ((isDateBasis && daysDiff <= 7) || (isKmBasis && kmDiff <= 500)) {
    return { status: 'Mendekati Jadwal', reminder_stage: '7 Hari' };
  }
  if ((isDateBasis && daysDiff <= 14) || (isKmBasis && kmDiff <= 1000)) {
    return { status: 'Mendekati Jadwal', reminder_stage: '14 Hari' };
  }
  if ((isDateBasis && daysDiff <= 30) || (isKmBasis && kmDiff <= 1500)) {
    return { status: 'Mendekati Jadwal', reminder_stage: '30 Hari' };
  }

  return { status: 'Terjadwal', reminder_stage: 'Aman' };
}

export function appendVehicleHistory(
  db: DatabaseSnapshot,
  params: {
    vehicle_id: string;
    activity_type: VehicleHistory['activity_type'];
    actor: Pick<SessionUser, 'name' | 'email'>;
    summary: string;
    reference_id?: string;
  }
) {
  db.VEHICLE_HISTORY.unshift({
    history_id: crypto.randomUUID(),
    vehicle_id: params.vehicle_id,
    occurred_at: new Date().toISOString(),
    activity_type: params.activity_type,
    actor_name: params.actor.name,
    actor_email: params.actor.email,
    summary: params.summary,
    reference_id: params.reference_id || '',
  });
}

export function appendAuditLog(
  db: DatabaseSnapshot,
  actor: SessionUser,
  action: string,
  entity_type: string,
  entity_id: string,
  summary: string
) {
  db.AUDIT_LOGS.unshift({
    log_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor_email: actor.email,
    actor_name: actor.name,
    actor_role: actor.role,
    action,
    entity_type,
    entity_id,
    summary,
  });
}

export function upsertLinkedExpense(
  db: DatabaseSnapshot,
  params: {
    vehicle_id: string;
    expense_date: string;
    category: ExpenseCategory;
    description: string;
    vendor_name: string;
    amount: number;
    reference_type: 'REPAIR' | 'MAINTENANCE';
    reference_id: string;
    receipt_url?: string;
    notes?: string;
    actor_email: string;
  }
) {
  if (!params.amount || params.amount <= 0) return;

  const existing = db.EXPENSES.find(
    (e) => e.reference_type === params.reference_type && e.reference_id === params.reference_id
  );
  const now = new Date().toISOString();

  if (existing) {
    existing.amount = params.amount;
    existing.expense_date = params.expense_date;
    existing.vendor_name = params.vendor_name;
    existing.description = params.description;
    if (params.receipt_url) existing.receipt_url = params.receipt_url;
    if (params.notes) existing.notes = params.notes;
    return;
  }

  db.EXPENSES.unshift({
    expense_id: crypto.randomUUID(),
    vehicle_id: params.vehicle_id,
    expense_date: params.expense_date,
    category: params.category,
    description: params.description,
    vendor_name: params.vendor_name,
    amount: params.amount,
    reference_type: params.reference_type,
    reference_id: params.reference_id,
    receipt_url: params.receipt_url || '',
    notes: params.notes || '',
    created_by: params.actor_email,
    created_at: now,
  });
}

export function pushNotification(
  db: DatabaseSnapshot,
  params: {
    recipient_email: string;
    recipient_role: 'ADMIN' | 'USER' | 'ALL_ADMINS';
    title: string;
    message: string;
    link: string;
    severity?: 'info' | 'warning' | 'critical' | 'success';
  }
) {
  db.NOTIFICATIONS.unshift({
    notification_id: crypto.randomUUID(),
    recipient_email: params.recipient_email,
    recipient_role: params.recipient_role,
    title: params.title,
    message: params.message,
    link: params.link,
    severity: params.severity || 'info',
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export function computeDynamicVehicleUsageStatus(db: DatabaseSnapshot, vehicleId: string): Vehicle['usage_status'] {
  const nowMs = Date.now();
  const active = db.BOOKINGS.filter(
    (b: Booking) =>
      b.booking_kind === 'INTERNAL' &&
      b.allocated_vehicle_ids.includes(vehicleId) &&
      ['Dijadwalkan', 'Dalam Perjalanan'].includes(b.status)
  );

  for (const b of active) {
    const start = new Date(b.departure_at).getTime();
    const end = new Date(b.return_at).getTime();
    if (b.status === 'Dalam Perjalanan' || (nowMs >= start && nowMs <= end)) {
      return 'dalam_perjalanan';
    }
  }
  if (active.length > 0) {
    return 'dijadwalkan';
  }
  return 'tersedia';
}

export function nextSequentialCode(prefix: string, existingCodes: string[]): string {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let maxNum = 0;
  for (const code of existingCodes) {
    const match = code.match(pattern);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}
