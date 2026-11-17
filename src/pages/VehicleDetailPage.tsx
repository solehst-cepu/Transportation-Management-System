import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, ShieldCheck, Truck } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeWib, formatDateWib, formatIdr } from '../lib/utils.ts';
import {
  Booking,
  Expense,
  Inspection,
  MaintenancePlan,
  Repair,
  Vehicle,
  VehicleHistory,
} from '../../shared/types.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Label, Select, Textarea } from '../components/ui/input.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { useToast } from '../components/ui/toast.tsx';

interface VehicleDetailResponse {
  vehicle: Vehicle;
  inspections: Inspection[];
  repairs: Repair[];
  maintenancePlans: MaintenancePlan[];
  bookings: Booking[];
  expenses: Expense[];
  history: VehicleHistory[];
  totalCost: number;
}

const TABS = [
  'Overview',
  'Data Teknis',
  'Dokumen',
  'Inspeksi',
  'Perbaikan',
  'Perawatan',
  'Riwayat Penggunaan',
  'Biaya Kendaraan',
] as const;

type DetailTab = (typeof TABS)[number];

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const [data, setData] = useState<VehicleDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('Overview');
  const [loading, setLoading] = useState(true);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyForm, setVerifyForm] = useState<{
    eligibility_status: Vehicle['eligibility_status'];
    release_safety_block: boolean;
    notes: string;
  }>({
    eligibility_status: 'layak',
    release_safety_block: true,
    notes: '',
  });

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiRequest<VehicleDetailResponse>(`/api/vehicles/${id}/detail`);
      setData(res);
      setVerifyForm({
        eligibility_status: res.vehicle.eligibility_status === 'tidak_layak' ? 'layak' : res.vehicle.eligibility_status,
        release_safety_block: res.vehicle.safety_blocked,
        notes: res.vehicle.condition_notes || '',
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await apiRequest(`/api/vehicles/${id}/verify-eligibility`, {
        method: 'POST',
        body: JSON.stringify(verifyForm),
      });
      notify('Status kelayakan kendaraan berhasil diverifikasi.', 'success');
      setVerifyOpen(false);
      await loadDetail();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memverifikasi kelayakan.', 'error');
    }
  };

  if (loading || !data) {
    return <div className="p-8 text-sm text-slate-500">Memuat profil kendaraan...</div>;
  }

  const { vehicle } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/transportation/vehicles">
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Master Kendaraan
          </Link>
        </Button>

        <Button size="sm" onClick={() => setVerifyOpen(true)}>
          <ShieldCheck className="h-4 w-4" />
          Verifikasi Kelayakan / Lepas Blokir
        </Button>
      </div>

      {/* Top Identity Header Card */}
      <Card>
        <CardContent className="p-5 flex flex-col md:flex-row gap-5 items-start">
          <div className="w-full md:w-56 h-36 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 flex items-center justify-center">
            {vehicle.photo_url ? (
              <img
                src={vehicle.photo_url}
                alt={vehicle.vehicle_name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <Truck className="h-8 w-8 text-slate-400" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-mono font-semibold text-[#1755CE]">
                  {vehicle.vehicle_code} · {vehicle.plate_number}
                </div>
                <h2 className="text-xl font-bold text-slate-900 font-display">{vehicle.vehicle_name}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusLabel status={vehicle.admin_status} />
                <StatusLabel status={vehicle.eligibility_status} />
                <StatusLabel status={vehicle.usage_status} />
              </div>
            </div>

            {vehicle.safety_blocked && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Blokir Operasional Aktif: </span>
                  {vehicle.safety_block_reason}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
              <div>
                <div className="text-slate-500">Odometer Terakhir</div>
                <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {vehicle.last_odometer.toLocaleString('id-ID')} km
                </div>
              </div>
              <div>
                <div className="text-slate-500">Jadwal Servis Berikutnya</div>
                <div className="font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatDateWib(vehicle.next_service_date)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Total Pemakaian</div>
                <div className="font-semibold text-slate-900 tabular-nums mt-0.5">
                  {data.bookings.length} trip
                </div>
              </div>
              <div>
                <div className="text-slate-500">Total Biaya Perawatan</div>
                <div className="font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatIdr(data.totalCost)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 8-Tab Navigation */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === t ? 'bg-white text-[#1755CE] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Kondisi & Ringkasan Operasional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Lokasi Parkir</span>
                <span className="font-medium text-slate-900">{vehicle.parking_location || '-'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Kapasitas Penumpang</span>
                <span className="font-medium text-slate-900 tabular-nums">{vehicle.passenger_capacity} kursi</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Servis Terakhir</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatDateWib(vehicle.last_service_date)} ({vehicle.last_service_odometer.toLocaleString('id-ID')} km)
                </span>
              </div>
              <div className="pt-1">
                <div className="text-slate-500 mb-1">Catatan Kondisi</div>
                <div className="text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {vehicle.condition_notes || 'Belum ada catatan tambahan.'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline Aktivitas Terkini</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {data.history.length === 0 ? (
                <div className="p-5 text-xs text-slate-500">Belum ada riwayat aktivitas.</div>
              ) : (
                data.history.map((h) => (
                  <div key={h.history_id} className="p-3.5 text-xs">
                    <div className="font-semibold text-slate-900">{h.activity_type}</div>
                    <div className="text-slate-600 mt-0.5">{h.summary}</div>
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {formatDateTimeWib(h.occurred_at)} · {h.actor_name}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Data Teknis' && (
        <Card>
          <CardHeader>
            <CardTitle>Spesifikasi Teknis & Kepemilikan Aset</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              ['Merek / Model', `${vehicle.brand} ${vehicle.model}`],
              ['Tahun Pembuatan / Registrasi', `${vehicle.manufacture_year} / ${vehicle.registration_year}`],
              ['Warna', vehicle.color],
              ['Nomor Rangka', vehicle.chassis_number || '-'],
              ['Nomor Mesin', vehicle.engine_number || '-'],
              ['Bahan Bakar / Transmisi', `${vehicle.fuel_type} · ${vehicle.transmission}`],
              ['Kapasitas Mesin', `${vehicle.engine_capacity_cc} cc`],
              ['Status Kepemilikan', vehicle.ownership_status],
              ['Nomor Aset Sekolah', vehicle.school_asset_number || '-'],
              ['Tanggal & Nilai Perolehan', `${formatDateWib(vehicle.purchase_date)} · ${formatIdr(vehicle.purchase_price)}`],
            ].map(([label, val]) => (
              <div key={label} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div className="text-slate-500">{label}</div>
                <div className="font-semibold text-slate-900 mt-0.5">{val}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === 'Dokumen' && (
        <Card>
          <CardHeader>
            <CardTitle>Dokumen Legalitas & Asuransi Kendaraan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {[
              ['Nomor STNK', vehicle.stnk_number || '-'],
              ['Masa Berlaku STNK', formatDateWib(vehicle.stnk_expiry)],
              ['Jatuh Tempo Pajak Tahunan', formatDateWib(vehicle.tax_due_date)],
              ['Masa Berlaku Uji KIR', vehicle.kir_expiry ? formatDateWib(vehicle.kir_expiry) : 'Tidak wajib KIR'],
              ['Nomor Polis Asuransi', vehicle.insurance_policy_number || '-'],
              ['Masa Berlaku Asuransi', formatDateWib(vehicle.insurance_expiry)],
            ].map(([label, val]) => (
              <div key={label} className="p-3.5 rounded-lg border border-slate-200 flex justify-between items-center">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{val}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === 'Inspeksi' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">No. Inspeksi</th>
                  <th className="p-3.5">Tanggal</th>
                  <th className="p-3.5">Jenis</th>
                  <th className="p-3.5">Pemeriksa</th>
                  <th className="p-3.5">Odometer</th>
                  <th className="p-3.5">Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.inspections.map((i) => (
                  <tr key={i.inspection_id}>
                    <td className="p-3.5 font-mono font-medium">{i.inspection_number}</td>
                    <td className="p-3.5 tabular-nums">{formatDateTimeWib(i.inspected_at)}</td>
                    <td className="p-3.5">{i.inspection_type}</td>
                    <td className="p-3.5">{i.inspector_name}</td>
                    <td className="p-3.5 font-mono tabular-nums">{i.odometer.toLocaleString('id-ID')} km</td>
                    <td className="p-3.5"><StatusLabel status={i.result} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'Perbaikan' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">No. Perbaikan</th>
                  <th className="p-3.5">Bengkel</th>
                  <th className="p-3.5">Diagnosis</th>
                  <th className="p-3.5">Estimasi / Realisasi</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.repairs.map((r) => (
                  <tr key={r.repair_id}>
                    <td className="p-3.5 font-mono font-medium">{r.repair_number}</td>
                    <td className="p-3.5">{r.workshop_name}</td>
                    <td className="p-3.5 max-w-sm">{r.diagnosis}</td>
                    <td className="p-3.5 tabular-nums">
                      {formatIdr(r.estimated_cost)} / {formatIdr(r.actual_cost)}
                    </td>
                    <td className="p-3.5"><StatusLabel status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'Perawatan' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">Jenis Perawatan</th>
                  <th className="p-3.5">Basis</th>
                  <th className="p-3.5">Servis Terakhir</th>
                  <th className="p-3.5">Target Berikutnya</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.maintenancePlans.map((m) => (
                  <tr key={m.maintenance_plan_id}>
                    <td className="p-3.5 font-medium">{m.maintenance_type}</td>
                    <td className="p-3.5">{m.schedule_basis}</td>
                    <td className="p-3.5 tabular-nums">
                      {formatDateWib(m.last_service_date)} ({m.last_service_odometer.toLocaleString('id-ID')} km)
                    </td>
                    <td className="p-3.5 tabular-nums">
                      {formatDateWib(m.next_target_date)} / {m.next_target_km.toLocaleString('id-ID')} km
                    </td>
                    <td className="p-3.5"><StatusLabel status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'Riwayat Penggunaan' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">No. Pengajuan</th>
                  <th className="p-3.5">Kegiatan</th>
                  <th className="p-3.5">Pemohon</th>
                  <th className="p-3.5">Jadwal</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.bookings.map((b) => (
                  <tr key={b.booking_id}>
                    <td className="p-3.5 font-mono">{b.booking_number}</td>
                    <td className="p-3.5 font-medium">{b.activity_name}</td>
                    <td className="p-3.5">{b.requester_name}</td>
                    <td className="p-3.5 tabular-nums">
                      {formatDateTimeWib(b.departure_at)} — {formatDateTimeWib(b.return_at)}
                    </td>
                    <td className="p-3.5"><StatusLabel status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'Biaya Kendaraan' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">Tanggal</th>
                  <th className="p-3.5">Kategori</th>
                  <th className="p-3.5">Deskripsi</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.expenses.map((e) => (
                  <tr key={e.expense_id}>
                    <td className="p-3.5 tabular-nums">{formatDateWib(e.expense_date)}</td>
                    <td className="p-3.5">{e.category}</td>
                    <td className="p-3.5">{e.description}</td>
                    <td className="p-3.5">{e.vendor_name}</td>
                    <td className="p-3.5 text-right font-mono font-semibold tabular-nums">
                      {formatIdr(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Verify Eligibility Modal */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verifikasi Kelayakan {vehicle.plate_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div>
              <Label>Status Kelayakan Operasional</Label>
              <Select
                value={verifyForm.eligibility_status}
                onChange={(e) =>
                  setVerifyForm({
                    ...verifyForm,
                    eligibility_status: e.target.value as Vehicle['eligibility_status'],
                  })
                }
              >
                <option value="layak">Layak Operasional</option>
                <option value="layak_dengan_catatan">Layak dengan Catatan</option>
                <option value="tidak_layak">Tidak Layak Operasional</option>
                <option value="belum_diverifikasi">Belum Diverifikasi</option>
              </Select>
            </div>

            {vehicle.safety_blocked && (
              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyForm.release_safety_block}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, release_safety_block: e.target.checked })
                  }
                />
                <span>Lepas blokir keselamatan operasional (hanya jika perbaikan selesai)</span>
              </label>
            )}

            <div>
              <Label>Catatan Verifikasi GA</Label>
              <Textarea
                value={verifyForm.notes}
                onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setVerifyOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Verifikasi</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
