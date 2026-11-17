import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
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
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeWib, formatIdr } from '../lib/utils.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';
import { Button } from '../components/ui/button.tsx';
import { Booking, Vehicle, VehicleHistory } from '../../shared/types.ts';

interface AdminDashboardData {
  role: 'ADMIN';
  bookingStats: {
    total: number;
    pendingReview: number;
    needsRevision: number;
    scheduled: number;
    externalActive: number;
    completed: number;
  };
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
    vehicleUsage: { name: string; vehicle_name: string; trips: number; cost: number }[];
  };
  lists: {
    unfitVehicles: Vehicle[];
    recentBookings: (Booking & { department_name?: string })[];
    recentActivity: VehicleHistory[];
  };
}

interface UserDashboardData {
  role: 'USER';
  stats: {
    totalBookings: number;
    pendingReview: number;
    needsRevision: number;
    scheduledOrBooked: number;
    completed: number;
  };
  recentBookings: Booking[];
  unreadNotifications: number;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminDashboardData | UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    apiRequest<AdminDashboardData | UserDashboardData>('/api/dashboard/summary')
      .then(setData)
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat ringkasan dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {errorMsg || 'Data dashboard tidak tersedia.'}
      </div>
    );
  }

  if (data.role === 'USER') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Selamat Datang, {user?.name}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Ajukan pemesanan kendaraan dinas sekolah atau sewa bus kegiatan secara terpusat ke General Affairs.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/bookings/internal">
                <Car className="h-4 w-4" />
                Order Kendaraan Sekolah
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/bookings/external">
                <Bus className="h-4 w-4" />
                Order Bus / Eksternal
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/bookings/my" className="block">
            <Card className="hover:border-[#1755CE] transition-colors h-full">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Total Pengajuan Saya</div>
                <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{data.stats.totalBookings}</div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/bookings/my" className="block">
            <Card className="hover:border-[#1755CE] transition-colors h-full">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Menunggu Review GA</div>
                <div className="mt-2 text-2xl font-bold text-[#1755CE] tabular-nums">{data.stats.pendingReview}</div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/bookings/my" className="block">
            <Card className="hover:border-[#1755CE] transition-colors h-full">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Dijadwalkan / Dipesan</div>
                <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">{data.stats.scheduledOrBooked}</div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/bookings/my" className="block">
            <Card className="hover:border-[#1755CE] transition-colors h-full">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Perlu Revisi</div>
                <div className="mt-2 text-2xl font-bold text-amber-600 tabular-nums">{data.stats.needsRevision}</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pengajuan Kendaraan Terbaru</CardTitle>
              <CardDescription>Daftar permintaan pemesanan yang Anda ajukan</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/bookings/my">Lihat Semua</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {data.recentBookings.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada pengajuan kendaraan. Klik &ldquo;Order Kendaraan Sekolah&rdquo; untuk memulai.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">No. Pengajuan</th>
                    <th className="px-5 py-3 font-medium">Kegiatan</th>
                    <th className="px-5 py-3 font-medium">Jenis</th>
                    <th className="px-5 py-3 font-medium">Keberangkatan</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentBookings.map((b) => (
                    <tr key={b.booking_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {b.booking_number}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{b.activity_name}</div>
                        <div className="text-xs text-slate-500">{b.destination_location}</div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">
                        {b.booking_kind === 'INTERNAL' ? 'Kendaraan Sekolah' : 'Sewa Eksternal'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 tabular-nums">
                        {formatDateTimeWib(b.departure_at)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusLabel status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/bookings/approval" className="block">
          <Card className="hover:border-[#1755CE] transition-colors h-full">
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">Menunggu Review GA</div>
                <div className="mt-2 text-2xl font-bold text-[#1755CE] tabular-nums">
                  {data.bookingStats.pendingReview}
                </div>
                <div className="mt-1 text-xs text-slate-500">Approval terpusat</div>
              </div>
              <Clock className="h-5 w-5 text-[#1755CE]" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/transportation/vehicles" className="block">
          <Card className="hover:border-[#1755CE] transition-colors h-full">
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">Armada Siap Operasi</div>
                <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
                  {data.fleetStats.availableVehicles} / {data.fleetStats.activeVehicles}
                </div>
                <div className="mt-1 text-xs text-slate-500">Layak & bebas blokir</div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/transportation/repairs" className="block">
          <Card className="hover:border-[#1755CE] transition-colors h-full">
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">Unit Diblokir / Perbaikan</div>
                <div className="mt-2 text-2xl font-bold text-red-600 tabular-nums">
                  {data.fleetStats.unfitVehicles}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {data.fleetStats.inRepairVehicles} perbaikan aktif
                </div>
              </div>
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/transportation/costs" className="block">
          <Card className="hover:border-[#1755CE] transition-colors h-full">
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">Biaya Perawatan Bulan Ini</div>
                <div className="mt-2 text-xl font-bold text-slate-900 tabular-nums">
                  {formatIdr(data.fleetStats.currentMonthCost)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {data.fleetStats.upcomingMaintenance} servis mendekati jatuh tempo
                </div>
              </div>
              <Wrench className="h-5 w-5 text-slate-600" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Operational Alerts Banner if any unfit vehicles */}
      {data.lists.unfitVehicles.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-900">
                Peringatan Keselamatan Armada ({data.lists.unfitVehicles.length} Unit Diblokir)
              </div>
              <div className="text-xs text-red-800 mt-0.5">
                {data.lists.unfitVehicles
                  .map((v) => `${v.plate_number} (${v.safety_block_reason || 'Tidak Layak'})`)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="bg-white border-red-200 text-red-800 hover:bg-red-100">
            <Link to="/transportation/repairs">Kelola Perbaikan</Link>
          </Button>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Tren Biaya Operasional Armada (6 Bulan)</CardTitle>
            <CardDescription>Akumulasi servis, perbaikan, suku cadang, pajak, KIR, dan asuransi</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.monthlyCosts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000000)}jt`} />
                <Tooltip formatter={(val) => formatIdr(Number(val || 0))} />
                <Bar dataKey="total" name="Biaya Operasional" fill="#1755CE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Utilisasi Kendaraan Operasional</CardTitle>
            <CardDescription>Jumlah perjalanan terjadwal & selesai per unit sekolah</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.vehicleUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="trips" name="Total Pemakaian" fill="#0F766E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Bookings & Fleet Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Antrean Pengajuan Kendaraan Terbaru</CardTitle>
              <CardDescription>Internal sekolah & sewa kendaraan eksternal</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/bookings/approval">
                Approval Center <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">No.</th>
                  <th className="px-5 py-3 font-medium">Kegiatan & Pemohon</th>
                  <th className="px-5 py-3 font-medium">Berangkat</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.lists.recentBookings.map((b) => (
                  <tr key={b.booking_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {b.booking_number}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{b.activity_name}</div>
                      <div className="text-xs text-slate-500">
                        {b.requester_name} · {b.booking_kind === 'INTERNAL' ? 'Internal' : 'Eksternal'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600 tabular-nums">
                      {formatDateTimeWib(b.departure_at)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusLabel status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Aktivitas Armada Terkini</CardTitle>
              <CardDescription>Jejak inspeksi, penggunaan, perbaikan & blokir</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/transportation/history">Semua</Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 p-0">
            {data.lists.recentActivity.map((item) => (
              <div key={item.history_id} className="p-4 flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  {item.activity_type === 'Inspeksi' ? (
                    <ClipboardCheck className="h-4 w-4" />
                  ) : item.activity_type === 'Penggunaan' ? (
                    <Truck className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900">{item.activity_type}</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.summary}</div>
                  <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    {formatDateTimeWib(item.occurred_at)} · {item.actor_name}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
