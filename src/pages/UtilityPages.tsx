import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  CheckCheck,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Share2,
  Trash2,
  Unlink,
  UserCircle2,
} from 'lucide-react';
import { StorageDiagnostics, useAuth } from '../context/AuthContext.tsx';
import { ApiError, apiRequest } from '../lib/api.ts';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog.tsx';
import { formatDateTimeWib } from '../lib/utils.ts';
import { AppSettings, AuditLog, Department, NotificationItem } from '../../shared/types.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { Input, Label, Select } from '../components/ui/input.tsx';
import { useToast } from '../components/ui/toast.tsx';

export function NotificationsPage() {
  const { refreshNotificationsCount } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = useCallback(async () => {
    const res = await apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
    setItems(res.notifications);
    await refreshNotificationsCount();
  }, [refreshNotificationsCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
    await load();
  };

  const markAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    await load();
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">Peringatan operasional, persetujuan, dan pemeliharaan</div>
        <Button size="sm" variant="outline" onClick={() => void markAllRead()}>
          <CheckCheck className="h-3.5 w-3.5" />
          Tandai Semua Dibaca
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Belum ada notifikasi.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.notification_id}
                className={`p-4 flex items-start justify-between gap-4 ${
                  n.is_read ? 'bg-white' : 'bg-blue-50/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Bell className={`h-4 w-4 mt-0.5 shrink-0 ${n.severity === 'critical' ? 'text-red-600' : 'text-[#1755CE]'}`} />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{n.message}</div>
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {formatDateTimeWib(n.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {n.link && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={n.link}>Buka</Link>
                    </Button>
                  )}
                  {!n.is_read && (
                    <Button size="sm" variant="ghost" onClick={() => void markRead(n.notification_id)}>
                      Dibaca
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshSession } = useAuth();
  const { notify } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState({
    name: user?.name || '',
    department_id: user?.department_id || '',
    position: user?.position || '',
    phone: user?.phone || '',
  });

  useEffect(() => {
    Promise.all([
      apiRequest<{ departments: Department[] }>('/api/departments'),
      apiRequest<{ profile: { name: string; department_id?: string; position?: string; phone?: string } }>('/api/users/me'),
    ])
      .then(([dRes, pRes]) => {
        setDepartments(dRes.departments);
        setForm({
          name: pRes.profile.name || '',
          department_id: pRes.profile.department_id || '',
          position: pRes.profile.position || '',
          phone: pRes.profile.phone || '',
        });
      })
      .catch((err) => {
        notify(err instanceof Error ? err.message : 'Gagal memuat profil pengguna.', 'error');
      });
  }, [notify]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/users/me', { method: 'PUT', body: JSON.stringify(form) });
    await refreshSession();
    notify('Profil Anda berhasil diperbarui.', 'success');
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-[#1755CE]" />
            Profil Pengguna Sekolah
          </CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Nama Lengkap</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Unit / Departemen</Label>
              <Select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              >
                <option value="">Pilih Unit</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.department_code} — {d.department_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Jabatan / Posisi</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div>
              <Label>Nomor Telepon / WhatsApp</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Simpan Profil</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type ConfirmActionType =
  | null
  | { type: 'provision' }
  | { type: 'connect' }
  | { type: 'sync'; direction: 'push' | 'pull' }
  | { type: 'disconnect' };

export function SettingsPage() {
  const { reauthorizeGoogleWorkspace, refreshSession } = useAuth();
  const { notify } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storage, setStorage] = useState<StorageDiagnostics | null>(null);
  const [sheetKeys, setSheetKeys] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [newSheetTitle, setNewSheetTitle] = useState('LVBMS Database - Sekolah Lazuardi');
  const [existingSheetInput, setExistingSheetInput] = useState('');
  const [connectMode, setConnectMode] = useState<'push' | 'pull'>('push');
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [authorizingGoogle, setAuthorizingGoogle] = useState(false);
  const [sharingDomain, setSharingDomain] = useState(false);
  const [deleteAuditTarget, setDeleteAuditTarget] = useState<AuditLog | null>(null);
  const [deletingAudit, setDeletingAudit] = useState(false);

  const loadAll = useCallback(async () => {
    const [sRes, aRes, gsRes] = await Promise.all([
      apiRequest<{ settings: AppSettings; storage: StorageDiagnostics }>('/api/settings'),
      apiRequest<{ auditLogs: AuditLog[] }>('/api/audit-logs'),
      apiRequest<{ diagnostics: StorageDiagnostics; sheetKeys: string[] }>('/api/integrations/google-sheets'),
    ]);
    setSettings(sRes.settings);
    setStorage(gsRes.diagnostics || sRes.storage);
    setSheetKeys(gsRes.sheetKeys || []);
    setAuditLogs(aRes.auditLogs);
  }, []);

  useEffect(() => {
    loadAll().catch((err) => {
      notify(err instanceof Error ? err.message : 'Gagal memuat pengaturan sistem.', 'error');
    });
  }, [loadAll, notify]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    notify('Pengaturan sistem LVBMS disimpan.', 'success');
  };

  const handleConfirmDeleteAuditLog = async () => {
    if (!deleteAuditTarget) return;
    setDeletingAudit(true);
    try {
      const doDelete = () =>
        apiRequest(`/api/audit-logs/${deleteAuditTarget.log_id}`, { method: 'DELETE' });
      try {
        await doDelete();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'GOOGLE_SHEETS_REAUTH_REQUIRED') {
          const token = await reauthorizeGoogleWorkspace();
          if (!token) throw err;
          await doDelete();
        } else {
          throw err;
        }
      }
      notify('Log audit sistem dihapus.', 'success');
      setDeleteAuditTarget(null);
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus log audit.', 'error');
    } finally {
      setDeletingAudit(false);
    }
  };

  const handleAuthorizeGoogle = async () => {
    setAuthorizingGoogle(true);
    try {
      const token = await reauthorizeGoogleWorkspace();
      if (!token) {
        notify('Otorisasi selesai, namun token akses Google tidak diterima. Silakan coba lagi.', 'error');
        return;
      }
      await loadAll();
      notify('Otorisasi Google Sheets & Drive berhasil aktif.', 'success');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Gagal melakukan otorisasi Google Workspace.',
        'error'
      );
    } finally {
      setAuthorizingGoogle(false);
    }
  };

  const runWithGoogleOAuth = async <T,>(
    fn: (extraHeaders?: Record<string, string>) => Promise<T>
  ): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const shouldReauth =
        (err instanceof ApiError && err.status === 400 && /Token Google OAuth/i.test(msg)) ||
        /invalid credentials|unauthenticated|insufficient authentication/i.test(msg);
      if (!shouldReauth) throw err;
      const freshToken = await reauthorizeGoogleWorkspace();
      if (!freshToken) {
        throw new Error('Otorisasi Google Sheets & Drive dibatalkan atau token tidak diterima.');
      }
      return await fn({ 'X-Google-Access-Token': freshToken });
    }
  };

  const handleShareDomain = async () => {
    setSharingDomain(true);
    try {
      const res = await runWithGoogleOAuth((headers) =>
        apiRequest<{
          shared: boolean;
          domain: string;
          note?: string;
          diagnostics: StorageDiagnostics;
        }>('/api/integrations/google-sheets/share-domain', {
          method: 'POST',
          headers,
        })
      );
      setStorage(res.diagnostics);
      if (res.shared) {
        notify(`Google Sheet berhasil dibagikan dengan izin edit ke domain @${res.domain}.`, 'success');
      } else {
        notify(
          `Pembagian otomatis ke @${res.domain} dibatasi (${res.note || 'kebijakan domain'}). Gunakan Service Account untuk Vercel.`,
          'warning'
        );
      }
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal membagikan sheet ke domain.', 'error');
    } finally {
      setSharingDomain(false);
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmAction) return;
    setBusyAction(true);
    try {
      if (confirmAction.type === 'provision') {
        const res = await runWithGoogleOAuth((headers) =>
          apiRequest<{
            connection: { title: string; spreadsheetId: string };
            sheetCount: number;
            diagnostics: StorageDiagnostics;
          }>('/api/integrations/google-sheets/provision', {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: newSheetTitle }),
          })
        );
        setStorage(res.diagnostics);
        notify(
          `Database Google Sheet "${res.connection.title}" berhasil dibuat (${res.sheetCount} tab sheet).`,
          'success'
        );
      } else if (confirmAction.type === 'connect') {
        const res = await runWithGoogleOAuth((headers) =>
          apiRequest<{
            connection: { title: string };
            mode: 'push' | 'pull';
            diagnostics: StorageDiagnostics;
          }>('/api/integrations/google-sheets/connect', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              spreadsheetIdOrUrl: existingSheetInput,
              mode: connectMode,
            }),
          })
        );
        setStorage(res.diagnostics);
        setExistingSheetInput('');
        notify(
          `Berhasil terhubung ke "${res.connection.title}" (${res.mode === 'push' ? 'Push Data Aplikasi' : 'Pull Data dari Sheet'}).`,
          'success'
        );
      } else if (confirmAction.type === 'sync') {
        const direction = confirmAction.direction;
        const res = await runWithGoogleOAuth((headers) =>
          apiRequest<{ diagnostics: StorageDiagnostics }>('/api/integrations/google-sheets/sync', {
            method: 'POST',
            headers,
            body: JSON.stringify({ direction }),
          })
        );
        setStorage(res.diagnostics);
        notify(
          direction === 'push'
            ? 'Seluruh data aplikasi berhasil disinkronkan ke Google Sheets.'
            : 'Data terbaru berhasil dimuat dari Google Sheets.',
          'success'
        );
      } else if (confirmAction.type === 'disconnect') {
        const res = await apiRequest<{ diagnostics: StorageDiagnostics }>(
          '/api/integrations/google-sheets/disconnect',
          { method: 'POST' }
        );
        setStorage(res.diagnostics);
        notify('Koneksi database Google Sheets diputuskan. Sistem kembali ke ledger lokal.', 'info');
      }
      setConfirmAction(null);
      await loadAll();
      await refreshSession();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Operasi Google Sheets gagal dijalankan.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} disalin ke clipboard.`, 'success');
    } catch {
      notify('Gagal menyalin ke clipboard.', 'error');
    }
  };

  if (!settings) return <div className="p-8 text-sm text-slate-500">Memuat pengaturan...</div>;

  const oauthSheet = storage?.oauthSheet || null;
  const isOAuthConnected = storage?.connectionMode === 'oauth' && Boolean(oauthSheet);
  const isServiceAccount = storage?.connectionMode === 'service_account';

  return (
    <div className="space-y-6">
      {/* Google Sheets Database Integration Card */}
      <Card className="border-blue-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-5 w-5 text-[#1755CE]" />
                Database Google Sheets (20 Tabel Terintegrasi)
              </CardTitle>
              <CardDescription>
                Buat spreadsheet database baru di Google Drive sekolah atau hubungkan ke Google Sheet yang sudah ada.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {storage?.googleSheetsConnected ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isServiceAccount ? 'Terhubung (Service Account)' : 'Terhubung ke Google Sheets'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Belum Terhubung ke Sheet (Ledger Lokal)
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleAuthorizeGoogle()}
                disabled={authorizingGoogle}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${authorizingGoogle ? 'animate-spin' : ''}`} />
                {storage?.hasActiveOAuthToken ? 'OAuth Google Aktif' : 'Otorisasi Google Sheets'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">
          {/* Active connection banner */}
          {isOAuthConnected && oauthSheet && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-emerald-900">
                    Spreadsheet Aktif: {oauthSheet.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-200 text-slate-800">
                      ID: {oauthSheet.spreadsheetId}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyText(oauthSheet.spreadsheetId, 'Spreadsheet ID')}
                      className="inline-flex items-center gap-1 text-[#1755CE] hover:underline font-medium"
                    >
                      <Copy className="h-3 w-3" />
                      Salin ID
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Dihubungkan oleh <span className="font-medium text-slate-700">{oauthSheet.connectedBy}</span> •
                    Sinkronisasi terakhir: <span className="tabular-nums">{formatDateTimeWib(oauthSheet.lastSyncAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" asChild>
                    <a href={oauthSheet.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buka Google Sheet
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleShareDomain()}
                    disabled={sharingDomain}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {sharingDomain
                      ? 'Membagikan...'
                      : oauthSheet.domainShared
                        ? 'Dibagikan ke @lazuardi.sch.id'
                        : 'Bagikan ke @lazuardi.sch.id'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmAction({ type: 'sync', direction: 'push' })}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Push ke Sheet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmAction({ type: 'sync', direction: 'pull' })}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Pull dari Sheet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setConfirmAction({ type: 'disconnect' })}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Putuskan
                  </Button>
                </div>
              </div>

              {(!storage?.hasActiveOAuthToken || oauthSheet.lastAuthExpired) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Sesi token Google OAuth belum aktif atau kedaluwarsa. Otorisasi ulang Google atau konfigurasikan Service Account agar penyimpanan selalu sinkron tanpa token user.
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleAuthorizeGoogle()}
                    disabled={authorizingGoogle}
                  >
                    Otorisasi Ulang Google
                  </Button>
                </div>
              )}

              <div className="rounded-lg bg-white border border-emerald-200/80 p-3.5 text-[11px] text-slate-600 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    Wajib untuk Deployment Vercel Multi-User (Service Account):
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        `GOOGLE_SHEETS_SPREADSHEET_ID=${oauthSheet.spreadsheetId}\nGOOGLE_SERVICE_ACCOUNT_EMAIL=\nGOOGLE_PRIVATE_KEY=`,
                        'Template Env Vercel'
                      )
                    }
                    className="inline-flex items-center gap-1 text-[#1755CE] hover:underline font-medium"
                  >
                    <Copy className="h-3 w-3" />
                    Salin 3 Variabel Env Vercel
                  </button>
                </div>
                <p className="leading-relaxed">
                  Pada Vercel Serverless, tanpa Service Account setiap container berjalan terpisah dan token OAuth hilang setelah refresh halaman. Tambahkan 3 Environment Variables berikut di <strong>Vercel → Project Settings → Environment Variables</strong> lalu bagikan Sheet di atas (Editor) ke email Service Account:
                </p>
                <div className="rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-800 space-y-0.5 overflow-x-auto">
                  <div>GOOGLE_SHEETS_SPREADSHEET_ID={oauthSheet.spreadsheetId}</div>
                  <div>GOOGLE_SERVICE_ACCOUNT_EMAIL=...gserviceaccount.com</div>
                  <div>GOOGLE_PRIVATE_KEY=&quot;-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n&quot;</div>
                </div>
              </div>
            </div>
          )}

          {!isOAuthConnected && !isServiceAccount && storage?.isVercel && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Mengapa Data Booking Tidak Tersimpan di Vercel Saat Ini?</span>
              </div>
              <p className="leading-relaxed">
                Aplikasi di Vercel saat ini belum terhubung ke Google Sheets Service Account (berjalan pada memori sementara <code className="font-mono">/tmp</code> per container). Buat/hubungkan Google Sheet di bawah, bagikan ke email Service Account sebagai <strong>Editor</strong>, lalu isi <code className="font-mono">GOOGLE_SHEETS_SPREADSHEET_ID</code>, <code className="font-mono">GOOGLE_SERVICE_ACCOUNT_EMAIL</code>, dan <code className="font-mono">GOOGLE_PRIVATE_KEY</code> di Vercel Environment Variables agar data booking dari User langsung tersimpan &amp; masuk ke Admin.
              </p>
            </div>
          )}

          {isServiceAccount && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-950">
              Sistem berjalan menggunakan koneksi <strong>Service Account Google Sheets API v4</strong> ({storage?.spreadsheetIdMasked}). Seluruh transaksi dari User maupun Admin otomatis tersinkron ke Google Sheets secara real-time.
            </div>
          )}

          {/* Provision / Connect forms */}
          {!isServiceAccount && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Create new database sheet */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-[#1755CE]/10 text-[#1755CE] flex items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Buat Database Google Sheet Baru
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Otomatis membuat spreadsheet dengan {sheetKeys.length || 20} tab tabel & header biru Lazuardi.
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Nama Spreadsheet</Label>
                  <Input
                    value={newSheetTitle}
                    onChange={(e) => setNewSheetTitle(e.target.value)}
                    placeholder="LVBMS Database - Sekolah Lazuardi"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setConfirmAction({ type: 'provision' })}
                    disabled={!newSheetTitle.trim()}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Buat & Hubungkan Google Sheet
                  </Button>
                </div>
              </div>

              {/* Connect existing spreadsheet */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Link2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Hubungkan ke Google Sheet yang Sudah Ada
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Tempel URL atau Spreadsheet ID Google Sheets Anda.
                    </div>
                  </div>
                </div>
                <div>
                  <Label>URL atau Spreadsheet ID</Label>
                  <Input
                    value={existingSheetInput}
                    onChange={(e) => setExistingSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-[11px] text-slate-600">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="connectMode"
                        checked={connectMode === 'push'}
                        onChange={() => setConnectMode('push')}
                      />
                      <span>Push (Isi Sheet dari App)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="connectMode"
                        checked={connectMode === 'pull'}
                        onChange={() => setConnectMode('pull')}
                      />
                      <span>Pull (Baca dari Sheet)</span>
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmAction({ type: 'connect' })}
                    disabled={!existingSheetInput.trim()}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Hubungkan Sheet
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Pengaturan Aplikasi, Approval, Inspeksi & Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Nama Institusi Sekolah</Label>
                <Input
                  value={settings.school_name}
                  onChange={(e) => setSettings({ ...settings, school_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Lead Time Pengajuan (Jam)</Label>
                  <Input
                    type="number"
                    value={settings.booking_lead_time_hours}
                    onChange={(e) =>
                      setSettings({ ...settings, booking_lead_time_hours: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Maksimal Hari ke Depan</Label>
                  <Input
                    type="number"
                    value={settings.max_booking_days_ahead}
                    onChange={(e) =>
                      setSettings({ ...settings, max_booking_days_ahead: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Peringatan Dokumen (Hari)</Label>
                  <Input
                    type="number"
                    value={settings.doc_expiry_warning_days}
                    onChange={(e) =>
                      setSettings({ ...settings, doc_expiry_warning_days: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_block_on_critical_inspection}
                    onChange={(e) =>
                      setSettings({ ...settings, auto_block_on_critical_inspection: e.target.checked })
                    }
                  />
                  <span>Blokir kendaraan otomatis bila item kritis inspeksi rusak</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notify_admin_on_new_booking}
                    onChange={(e) =>
                      setSettings({ ...settings, notify_admin_on_new_booking: e.target.checked })
                    }
                  />
                  <span>Kirim notifikasi ke Admin GA setiap pengajuan baru masuk</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notify_user_on_status_change}
                    onChange={(e) =>
                      setSettings({ ...settings, notify_user_on_status_change: e.target.checked })
                    }
                  />
                  <span>Beritahu pemohon saat status booking atau alokasi berubah</span>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit">Simpan Pengaturan</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-[#1755CE]" />
              Integrasi Database & Autentikasi
            </CardTitle>
            <CardDescription>Status koneksi environment backend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
              <span className="text-slate-500">Storage Engine</span>
              <span className="font-semibold text-slate-900 text-right">{storage?.engine}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
              <span className="text-slate-500">Google Sheets Database</span>
              <span className="font-semibold text-slate-900 text-right">
                {storage?.googleSheetsConnected ? `Terhubung (${storage.spreadsheetIdMasked})` : 'Belum terhubung'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
              <span className="text-slate-500">Google Drive Storage</span>
              <span className="font-semibold text-slate-900 text-right">
                {storage?.googleDriveConnected ? 'Terhubung (Google Drive)' : 'Server Uploads Fallback'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
              <span className="text-slate-500">Google Workspace SSO</span>
              <span className="font-semibold text-slate-900 text-right">
                {storage?.googleOAuthConfigured ? 'Aktif (@lazuardi.sch.id)' : 'Menunggu Client ID'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#1755CE]" />
            Audit Logs Sistem ({auditLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
              <tr>
                <th className="p-3">Waktu (WIB)</th>
                <th className="p-3">Aktor</th>
                <th className="p-3">Aksi</th>
                <th className="p-3">Entitas</th>
                <th className="p-3">Ringkasan</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log.log_id} className="hover:bg-slate-50">
                  <td className="p-3 tabular-nums whitespace-nowrap">{formatDateTimeWib(log.timestamp)}</td>
                  <td className="p-3">{log.actor_email} ({log.actor_role})</td>
                  <td className="p-3 font-mono text-[#1755CE]">{log.action}</td>
                  <td className="p-3 font-mono">{log.entity_type}</td>
                  <td className="p-3">{log.summary}</td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteAuditTarget(log)}
                      title="Hapus Log Audit"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={Boolean(deleteAuditTarget)}
        onOpenChange={(open) => !open && setDeleteAuditTarget(null)}
        title="Hapus Log Audit Sistem"
        itemName={deleteAuditTarget ? `${deleteAuditTarget.action} — ${deleteAuditTarget.summary}` : ''}
        loading={deletingAudit}
        onConfirm={handleConfirmDeleteAuditLog}
      />

      {/* Explicit Confirmation Dialog for Mutating Google Sheets Actions */}
      <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && !busyAction && setConfirmAction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#1755CE]" />
              {confirmAction?.type === 'provision' && 'Konfirmasi Pembuatan Database Google Sheet'}
              {confirmAction?.type === 'connect' && 'Konfirmasi Koneksi Google Sheet'}
              {confirmAction?.type === 'sync' &&
                (confirmAction.direction === 'push'
                  ? 'Konfirmasi Push Data ke Google Sheet'
                  : 'Konfirmasi Pull Data dari Google Sheet')}
              {confirmAction?.type === 'disconnect' && 'Konfirmasi Putuskan Koneksi Google Sheet'}
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan memodifikasi integrasi atau data pada Google Workspace Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs text-slate-600">
            {confirmAction?.type === 'provision' && (
              <>
                <p>
                  Sistem akan membuat spreadsheet baru berjudul{' '}
                  <strong className="text-slate-900">"{newSheetTitle}"</strong> di Google Drive akun Anda dan mengisi seluruh data LVBMS saat ini ke dalam{' '}
                  <strong className="text-slate-900">{sheetKeys.length || 20} tab sheet</strong>:
                </p>
                <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-50 border border-slate-200 p-2.5 font-mono text-[11px] text-slate-700 grid grid-cols-2 gap-1">
                  {sheetKeys.map((k) => (
                    <span key={k}>{k}</span>
                  ))}
                </div>
              </>
            )}

            {confirmAction?.type === 'connect' && (
              <>
                <p>
                  Target Spreadsheet:{' '}
                  <span className="font-mono text-slate-900 break-all">{existingSheetInput}</span>
                </p>
                <p>
                  Mode yang dipilih:{' '}
                  <strong className="text-slate-900">
                    {connectMode === 'push'
                      ? 'Push — Membuat tab yang belum ada dan menimpa isi tab dengan data aplikasi saat ini.'
                      : 'Pull — Membaca seluruh data dari Google Sheet tersebut untuk menggantikan cache aplikasi saat ini.'}
                  </strong>
                </p>
              </>
            )}

            {confirmAction?.type === 'sync' && (
              <p>
                {confirmAction.direction === 'push'
                  ? `Seluruh 20 tab pada "${oauthSheet?.title}" akan diperbarui menggunakan data terbaru dari aplikasi LVBMS.`
                  : `Data aplikasi LVBMS akan dimuat ulang dari "${oauthSheet?.title}". Pastikan tidak ada perubahan lokal yang belum tersimpan.`}
              </p>
            )}

            {confirmAction?.type === 'disconnect' && (
              <p>
                Koneksi ke Google Sheet <strong className="text-slate-900">"{oauthSheet?.title}"</strong> akan diputuskan dari konfigurasi aktif (file di Google Drive Anda tidak dihapus). Aplikasi akan menggunakan Server Persistent File Ledger hingga Anda menghubungkan ulang.
              </p>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={busyAction}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant={confirmAction?.type === 'disconnect' ? 'destructive' : 'default'}
              onClick={() => void handleExecuteConfirmedAction()}
              disabled={busyAction}
            >
              {busyAction
                ? 'Memproses...'
                : confirmAction?.type === 'provision'
                  ? 'Ya, Buat Database Google Sheet'
                  : confirmAction?.type === 'connect'
                    ? 'Ya, Hubungkan Sheet'
                    : confirmAction?.type === 'sync'
                      ? confirmAction.direction === 'push'
                        ? 'Ya, Push ke Sheet'
                        : 'Ya, Pull dari Sheet'
                      : 'Ya, Putuskan Koneksi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
