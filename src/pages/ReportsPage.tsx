import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeWib, formatIdr } from '../lib/utils.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';

interface IntegratedReportData {
  byDepartment: {
    department_id: string;
    department_code: string;
    department_name: string;
    internal_count: number;
    external_count: number;
    total_passengers: number;
  }[];
  vehicleUtilization: {
    vehicle_id: string;
    plate_number: string;
    vehicle_name: string;
    total_bookings: number;
    total_expense: number;
    eligibility_status: string;
    last_odometer: number;
  }[];
  externalRentalSummary: {
    booking_id: string;
    booking_number: string;
    activity_name: string;
    department_name: string;
    departure_at: string;
    status: string;
    vendor_name: string;
    estimated_budget: number;
    realized_cost: number;
  }[];
  costByCategory: { category: string; total: number }[];
  totalOperationalCost: number;
}

export function ReportsPage() {
  const [data, setData] = useState<IntegratedReportData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    apiRequest<IntegratedReportData>('/api/reports/integrated')
      .then(setData)
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Gagal menyusun laporan.'));
  }, []);

  if (errorMsg) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{errorMsg}</div>;
  }

  if (!data) {
    return <div className="p-8 text-sm text-slate-500">Menyusun laporan terintegrasi...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Pemesanan per Unit / Departemen */}
      <Card>
        <CardHeader>
          <CardTitle>Laporan Pemesanan & Kebutuhan Transportasi per Unit</CardTitle>
          <CardDescription>Rekapitulasi pengajuan kendaraan internal & sewa eksternal per departemen</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-3.5">Kode</th>
                <th className="p-3.5">Unit / Departemen</th>
                <th className="p-3.5 text-right">Booking Internal</th>
                <th className="p-3.5 text-right">Sewa Eksternal</th>
                <th className="p-3.5 text-right">Total Penumpang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.byDepartment.map((d) => (
                <tr key={d.department_id}>
                  <td className="p-3.5 font-mono font-semibold text-[#1755CE]">{d.department_code}</td>
                  <td className="p-3.5 font-medium text-slate-900">{d.department_name}</td>
                  <td className="p-3.5 text-right tabular-nums">{d.internal_count}</td>
                  <td className="p-3.5 text-right tabular-nums">{d.external_count}</td>
                  <td className="p-3.5 text-right tabular-nums">{d.total_passengers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Utilisasi & Biaya Armada */}
      <Card>
        <CardHeader>
          <CardTitle>Laporan Utilisasi & Biaya Kendaraan Sekolah</CardTitle>
          <CardDescription>
            Total Akumulasi Biaya Operasional Armada: <span className="font-semibold text-slate-900">{formatIdr(data.totalOperationalCost)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-3.5">No. Polisi</th>
                <th className="p-3.5">Kendaraan</th>
                <th className="p-3.5 text-right">Odometer</th>
                <th className="p-3.5 text-right">Jumlah Trip</th>
                <th className="p-3.5">Kelayakan</th>
                <th className="p-3.5 text-right">Total Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.vehicleUtilization.map((v) => (
                <tr key={v.vehicle_id}>
                  <td className="p-3.5 font-mono font-semibold">{v.plate_number}</td>
                  <td className="p-3.5 font-medium">{v.vehicle_name}</td>
                  <td className="p-3.5 text-right font-mono tabular-nums">{v.last_odometer.toLocaleString('id-ID')} km</td>
                  <td className="p-3.5 text-right tabular-nums">{v.total_bookings}</td>
                  <td className="p-3.5"><StatusLabel status={v.eligibility_status} /></td>
                  <td className="p-3.5 text-right font-mono font-semibold tabular-nums">{formatIdr(v.total_expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Penyewaan Eksternal & Biaya Kategori */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>Laporan Penyewaan Kendaraan Eksternal</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">Nomor</th>
                  <th className="p-3.5">Kegiatan & Unit</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5 text-right">Anggaran / Realisasi</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.externalRentalSummary.map((r) => (
                  <tr key={r.booking_id}>
                    <td className="p-3.5 font-mono">{r.booking_number}</td>
                    <td className="p-3.5">
                      <div className="font-medium text-slate-900">{r.activity_name}</div>
                      <div className="text-slate-500">{r.department_name} · {formatDateTimeWib(r.departure_at)}</div>
                    </td>
                    <td className="p-3.5">{r.vendor_name}</td>
                    <td className="p-3.5 text-right font-mono tabular-nums">
                      <div>Est: {formatIdr(r.estimated_budget)}</div>
                      <div className="font-semibold">Real: {formatIdr(r.realized_cost)}</div>
                    </td>
                    <td className="p-3.5"><StatusLabel status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Biaya Berdasarkan Kategori</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {data.costByCategory.map((c) => (
              <div key={c.category} className="p-3.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{c.category}</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">{formatIdr(c.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
