import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  ShieldAlert,
  Truck,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeWib, formatDateWib, formatIdr } from '../lib/utils.ts';
import { Inspection, MaintenancePlan, Repair, Vehicle } from '../../shared/types.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';

interface FleetDashboardResponse {
  fleetStats: {
    totalVehicles: number;
    activeVehicles: number;
    availableVehicles: number;
    inUseVehicles: number;
    inRepairVehicles: number;
    inMaintenanceVehicles: number;
    unfitVehicles: number;
    inactiveVehicles: number;
    pendingInspections: number;
    upcomingMaintenance: number;
    expiringDocsCount: number;
    currentMonthCost: number;
  };
  charts: {
    monthlyCosts: { month: string; total: number }[];
    vehicleUsage: { name: string; trips: number }[];
  };
  lists: {
    unfitVehicles: Vehicle[];
    activeRepairs: Repair[];
    upcomingMaintenance: (MaintenancePlan & { vehicle_name: string; plate_number: string })[];
    recentInspections: Inspection[];
    expiringDocs: Vehicle[];
  };
}

export function FleetDashboardPage() {
  const [data, setData] = useState<FleetDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    apiRequest<FleetDashboardResponse>('/api/dashboard/summary')
      .then(setData)
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat dashboard armada.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Memuat dashboard armada...</div>;
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {errorMsg || 'Data dashboard armada tidak tersedia.'}
      </div>
    );
  }

  const cards = [
    { label: 'Total Kendaraan', val: data.fleetStats.totalVehicles, to: '/transportation/vehicles', tone: 'text-slate-900' },
    { label: 'Kendaraan Aktif', val: data.fleetStats.activeVehicles, to: '/transportation/vehicles', tone: 'text-[#1755CE]' },
    { label: 'Kendaraan Tersedia', val: data.fleetStats.availableVehicles, to: '/transportation/vehicles', tone: 'text-emerald-700' },
    { label: 'Sedang Digunakan', val: data.fleetStats.inUseVehicles, to: '/bookings/calendar', tone: 'text-[#1755CE]' },
    { label: 'Dalam Perbaikan', val: data.fleetStats.inRepairVehicles, to: '/transportation/repairs', tone: 'text-amber-600' },
    { label: 'Dalam Perawatan', val: data.fleetStats.inMaintenanceVehicles, to: '/transportation/maintenance', tone: 'text-amber-600' },
    { label: 'Tidak Layak Operasional', val: data.fleetStats.unfitVehicles, to: '/transportation/vehicles', tone: 'text-red-600' },
    { label: 'Tidak Aktif', val: data.fleetStats.inactiveVehicles, to: '/transportation/vehicles', tone: 'text-slate-500' },
    { label: 'Inspeksi Belum Dilakukan', val: data.fleetStats.pendingInspections, to: '/transportation/inspections', tone: 'text-amber-700' },
    { label: 'Jadwal Servis Mendatang', val: data.fleetStats.upcomingMaintenance, to: '/transportation/maintenance', tone: 'text-[#1755CE]' },
    { label: 'Dokumen Mendekati Exp', val: data.fleetStats.expiringDocsCount, to: '/transportation/vehicles', tone: 'text-red-600' },
    { label: 'Biaya Bulan Berjalan', val: formatIdr(data.fleetStats.currentMonthCost), to: '/transportation/costs', tone: 'text-slate-900' },
  ];

  return (
    <div className="space-y-6">
      {/* 12 Clickable KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="block">
            <Card className="hover:border-[#1755CE] transition-colors h-full">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-slate-500 leading-snug">{c.label}</div>
                <div className={`mt-2 text-lg font-bold tabular-nums ${c.tone}`}>{c.val}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Biaya Perawatan per Bulan</CardTitle>
            <CardDescription>Pengeluaran operasional armada sekolah (6 bulan terakhir)</CardDescription>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.monthlyCosts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000000)}jt`} />
                <Tooltip formatter={(val) => formatIdr(Number(val || 0))} />
                <Bar dataKey="total" name="Biaya" fill="#1755CE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grafik Penggunaan Kendaraan</CardTitle>
            <CardDescription>Frekuensi perjalanan terjadwal & selesai per nomor polisi</CardDescription>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.vehicleUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="trips" name="Perjalanan" fill="#0F766E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Operational Watchlists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Kendaraan Masalah Aktif & Tidak Layak
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {data.lists.unfitVehicles.length === 0 ? (
              <div className="p-5 text-xs text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Seluruh kendaraan aktif berstatus layak operasional.
              </div>
            ) : (
              data.lists.unfitVehicles.map((v) => (
                <Link
                  key={v.vehicle_id}
                  to={`/transportation/vehicles/${v.vehicle_id}`}
                  className="p-4 flex items-center justify-between hover:bg-slate-50"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {v.plate_number} — {v.vehicle_name}
                    </div>
                    <div className="text-xs text-red-700 mt-0.5">{v.safety_block_reason || v.condition_notes}</div>
                  </div>
                  <StatusLabel status={v.eligibility_status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-[#1755CE]" />
              Perbaikan Belum Selesai ({data.lists.activeRepairs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {data.lists.activeRepairs.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">Tidak ada pekerjaan perbaikan aktif.</div>
            ) : (
              data.lists.activeRepairs.map((r) => (
                <Link
                  key={r.repair_id}
                  to="/transportation/repairs"
                  className="p-4 flex items-center justify-between hover:bg-slate-50"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {r.repair_number} · {r.workshop_name || 'Bengkel'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate max-w-md">{r.diagnosis}</div>
                  </div>
                  <StatusLabel status={r.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              Jadwal Servis Berikutnya
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {data.lists.upcomingMaintenance.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">Semua rencana servis berkala masih aman.</div>
            ) : (
              data.lists.upcomingMaintenance.map((m) => (
                <Link
                  key={m.maintenance_plan_id}
                  to="/transportation/maintenance"
                  className="p-4 flex items-center justify-between hover:bg-slate-50"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {m.plate_number} — {m.maintenance_type}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      Target: {formatDateWib(m.next_target_date)} / {m.next_target_km.toLocaleString('id-ID')} km
                    </div>
                  </div>
                  <StatusLabel status={m.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ClipboardCheck className="h-4 w-4 text-[#1755CE]" />
              Inspeksi Terbaru & Dokumen Jatuh Tempo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {data.lists.expiringDocs.map((v) => (
              <Link
                key={`doc-${v.vehicle_id}`}
                to={`/transportation/vehicles/${v.vehicle_id}`}
                className="p-4 flex items-center justify-between bg-amber-50/40 hover:bg-amber-50"
              >
                <div className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Dokumen {v.plate_number} Mendekati Kedaluwarsa
                    </div>
                    <div className="text-[11px] text-slate-600 tabular-nums">
                      Pajak: {v.tax_due_date || '-'} · KIR: {v.kir_expiry || '-'}
                    </div>
                  </div>
                </div>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </Link>
            ))}
            {data.lists.recentInspections.slice(0, 4).map((ins) => (
              <Link
                key={ins.inspection_id}
                to="/transportation/inspections"
                className="p-4 flex items-center justify-between hover:bg-slate-50"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {ins.inspection_number} · {ins.plate_number} ({ins.inspection_type})
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {formatDateTimeWib(ins.inspected_at)} · {ins.inspector_name}
                  </div>
                </div>
                <StatusLabel status={ins.result} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
