import React, { useCallback, useEffect, useState } from 'react';
import { Plus, ShieldCheck, Upload, Wrench } from 'lucide-react';
import { apiRequest, uploadAssetFile } from '../lib/api.ts';
import { formatDateWib, formatIdr } from '../lib/utils.ts';
import { DamageReport, Repair, RepairStatus, Vehicle } from '../../shared/types.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { useToast } from '../components/ui/toast.tsx';

const REPAIR_STAGES: RepairStatus[] = [
  'Dilaporkan',
  'Dalam Pemeriksaan',
  'Menunggu Persetujuan GA',
  'Disetujui untuk Perbaikan',
  'Dalam Perbaikan',
  'Menunggu Suku Cadang',
  'Selesai Diperbaiki',
  'Verifikasi Hasil Perbaikan',
  'Ditutup',
];

export function RepairsPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<'repairs' | 'damages'>('repairs');
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [damages, setDamages] = useState<DamageReport[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [dmgOpen, setDmgOpen] = useState(false);
  const [dmgForm, setDmgForm] = useState({
    vehicle_id: '',
    vehicle_part: '',
    description: '',
    priority: 'Sedang' as DamageReport['priority'],
    operational_impact: 'Perlu Pembatasan' as DamageReport['operational_impact'],
    source: 'Laporan Administrator' as DamageReport['source'],
  });

  const [repairOpen, setRepairOpen] = useState(false);
  const [repairForm, setRepairForm] = useState({
    vehicle_id: '',
    damage_report_id: '',
    workshop_name: '',
    workshop_pic: '',
    target_completion_date: '',
    diagnosis: '',
    work_details: '',
    spare_parts: '',
    estimated_cost: 0,
    blocks_vehicle: true,
  });

  const [updateOpen, setUpdateOpen] = useState(false);
  const [activeRepair, setActiveRepair] = useState<Repair | null>(null);
  const [updateForm, setUpdateForm] = useState({
    status: 'Dalam Perbaikan' as RepairStatus,
    actual_cost: 0,
    work_details: '',
    spare_parts: '',
    receipt_url: '',
    log_notes: '',
  });

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyForm, setVerifyForm] = useState({
    eligibility_status: 'layak' as 'layak' | 'layak_dengan_catatan' | 'tidak_layak',
    verification_notes: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, dRes, vRes] = await Promise.all([
        apiRequest<{ repairs: Repair[] }>('/api/repairs'),
        apiRequest<{ damageReports: DamageReport[] }>('/api/damage-reports'),
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
      ]);
      setRepairs(rRes.repairs);
      setDamages(dRes.damageReports);
      setVehicles(vRes.vehicles);
      if (vRes.vehicles[0]) {
        setDmgForm((p) => ({ ...p, vehicle_id: p.vehicle_id || vRes.vehicles[0].vehicle_id }));
        setRepairForm((p) => ({ ...p, vehicle_id: p.vehicle_id || vRes.vehicles[0].vehicle_id }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));

  const handleCreateDamage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/damage-reports', { method: 'POST', body: JSON.stringify(dmgForm) });
      notify('Laporan kerusakan berhasil dicatat.', 'success');
      setDmgOpen(false);
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal membuat laporan.', 'error');
    }
  };

  const handleCreateRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/repairs', { method: 'POST', body: JSON.stringify(repairForm) });
      notify('Pekerjaan perbaikan dibuat dan unit diblokir selama perbaikan.', 'success');
      setRepairOpen(false);
      setTab('repairs');
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal membuat perbaikan.', 'error');
    }
  };

  const openUpdateModal = (r: Repair) => {
    setActiveRepair(r);
    setUpdateForm({
      status: r.status,
      actual_cost: r.actual_cost,
      work_details: r.work_details,
      spare_parts: r.spare_parts,
      receipt_url: r.receipt_url,
      log_notes: '',
    });
    setUpdateOpen(true);
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const up = await uploadAssetFile(file);
    setUpdateForm((p) => ({ ...p, receipt_url: up.url }));
    notify('Nota/bukti transaksi berhasil diunggah.', 'success');
  };

  const handleUpdateRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRepair) return;
    try {
      await apiRequest(`/api/repairs/${activeRepair.repair_id}/transition`, {
        method: 'POST',
        body: JSON.stringify(updateForm),
      });
      notify('Progres & biaya perbaikan diperbarui.', 'success');
      setUpdateOpen(false);
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui perbaikan.', 'error');
    }
  };

  const handleFinalVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRepair) return;
    try {
      await apiRequest(`/api/repairs/${activeRepair.repair_id}/verify`, {
        method: 'POST',
        body: JSON.stringify(verifyForm),
      });
      notify('Verifikasi akhir disimpan dan kelayakan unit diperbarui.', 'success');
      setVerifyOpen(false);
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memverifikasi perbaikan.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('repairs')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              tab === 'repairs' ? 'bg-white text-[#1755CE] shadow-xs' : 'text-slate-600'
            }`}
          >
            Pekerjaan Perbaikan ({repairs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('damages')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              tab === 'damages' ? 'bg-white text-[#1755CE] shadow-xs' : 'text-slate-600'
            }`}
          >
            Laporan Kerusakan ({damages.length})
          </button>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDmgOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Lapor Kerusakan
          </Button>
          <Button size="sm" onClick={() => setRepairOpen(true)}>
            <Wrench className="h-3.5 w-3.5" />
            Buat Pekerjaan Perbaikan
          </Button>
        </div>
      </div>

      {tab === 'repairs' ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat data perbaikan...</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">No. Perbaikan</th>
                    <th className="px-4 py-3 font-medium">Kendaraan & Bengkel</th>
                    <th className="px-4 py-3 font-medium">Diagnosis & Suku Cadang</th>
                    <th className="px-4 py-3 font-medium">Estimasi / Realisasi</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {repairs.map((r) => {
                    const veh = vehMap.get(r.vehicle_id);
                    return (
                      <tr key={r.repair_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs font-medium tabular-nums">
                          <div>{r.repair_number}</div>
                          <div className="text-[11px] text-slate-400 font-sans">
                            Masuk: {formatDateWib(r.entry_date)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-slate-900">
                            {veh?.plate_number} — {veh?.vehicle_name}
                          </div>
                          <div className="text-slate-500">{r.workshop_name || 'Bengkel'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs max-w-xs">
                          <div className="text-slate-800">{r.diagnosis}</div>
                          {r.spare_parts && (
                            <div className="text-[11px] text-slate-500 mt-0.5">Part: {r.spare_parts}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono tabular-nums">
                          <div>Est: {formatIdr(r.estimated_cost)}</div>
                          <div className="font-semibold text-slate-900">Real: {formatIdr(r.actual_cost)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusLabel status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                          {r.status !== 'Ditutup' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openUpdateModal(r)}>
                                Update Progres
                              </Button>
                              {['Selesai Diperbaiki', 'Verifikasi Hasil Perbaikan'].includes(r.status) && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActiveRepair(r);
                                    setVerifyOpen(true);
                                  }}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Verifikasi Akhir
                                </Button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">No. Laporan</th>
                  <th className="px-4 py-3 font-medium">Kendaraan</th>
                  <th className="px-4 py-3 font-medium">Bagian & Deskripsi</th>
                  <th className="px-4 py-3 font-medium">Prioritas</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Tindak Lanjut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {damages.map((d) => {
                  const veh = vehMap.get(d.vehicle_id);
                  return (
                    <tr key={d.damage_report_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">
                        <div>{d.report_number}</div>
                        <div className="text-[11px] text-slate-400 font-sans">{d.source}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-900">
                        {veh?.plate_number} — {veh?.vehicle_name}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-sm">
                        <div className="font-medium text-slate-900">{d.vehicle_part}</div>
                        <div className="text-slate-600">{d.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={d.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={d.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {d.status === 'Terbuka' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRepairForm((p) => ({
                                ...p,
                                vehicle_id: d.vehicle_id,
                                damage_report_id: d.damage_report_id,
                                diagnosis: d.description,
                              }));
                              setRepairOpen(true);
                            }}
                          >
                            Proses Perbaikan
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Damage Report Modal */}
      <Dialog open={dmgOpen} onOpenChange={setDmgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat Laporan Kerusakan Kendaraan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateDamage} className="space-y-3">
            <div>
              <Label>Kendaraan</Label>
              <Select
                value={dmgForm.vehicle_id}
                onChange={(e) => setDmgForm({ ...dmgForm, vehicle_id: e.target.value })}
              >
                {vehicles.map((v) => (
                  <option key={v.vehicle_id} value={v.vehicle_id}>
                    {v.plate_number} — {v.vehicle_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sumber Laporan</Label>
                <Select
                  value={dmgForm.source}
                  onChange={(e) =>
                    setDmgForm({ ...dmgForm, source: e.target.value as DamageReport['source'] })
                  }
                >
                  <option value="Laporan Administrator">Laporan Administrator</option>
                  <option value="Laporan Pengemudi">Laporan Pengemudi</option>
                  <option value="Kerusakan Saat Perjalanan">Kerusakan Saat Perjalanan</option>
                  <option value="Laporan Khusus">Laporan Khusus</option>
                </Select>
              </div>
              <div>
                <Label>Prioritas</Label>
                <Select
                  value={dmgForm.priority}
                  onChange={(e) =>
                    setDmgForm({ ...dmgForm, priority: e.target.value as DamageReport['priority'] })
                  }
                >
                  <option value="Rendah">Rendah</option>
                  <option value="Sedang">Sedang</option>
                  <option value="Tinggi">Tinggi</option>
                  <option value="Kritis">Kritis</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Bagian Kendaraan</Label>
              <Input
                value={dmgForm.vehicle_part}
                onChange={(e) => setDmgForm({ ...dmgForm, vehicle_part: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Dampak Operasional</Label>
              <Select
                value={dmgForm.operational_impact}
                onChange={(e) =>
                  setDmgForm({
                    ...dmgForm,
                    operational_impact: e.target.value as DamageReport['operational_impact'],
                  })
                }
              >
                <option value="Masih Bisa Beroperasi">Masih Bisa Beroperasi</option>
                <option value="Perlu Pembatasan">Perlu Pembatasan</option>
                <option value="Tidak Layak / Blokir">Tidak Layak / Blokir</option>
              </Select>
            </div>
            <div>
              <Label>Deskripsi Kerusakan</Label>
              <Textarea
                value={dmgForm.description}
                onChange={(e) => setDmgForm({ ...dmgForm, description: e.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDmgOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Laporan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Repair Modal */}
      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Buat Pekerjaan Perbaikan Kendaraan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRepair} className="space-y-3">
            <div>
              <Label>Kendaraan</Label>
              <Select
                value={repairForm.vehicle_id}
                onChange={(e) => setRepairForm({ ...repairForm, vehicle_id: e.target.value })}
              >
                {vehicles.map((v) => (
                  <option key={v.vehicle_id} value={v.vehicle_id}>
                    {v.plate_number} — {v.vehicle_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nama Bengkel</Label>
                <Input
                  value={repairForm.workshop_name}
                  onChange={(e) => setRepairForm({ ...repairForm, workshop_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>PIC Bengkel</Label>
                <Input
                  value={repairForm.workshop_pic}
                  onChange={(e) => setRepairForm({ ...repairForm, workshop_pic: e.target.value })}
                />
              </div>
              <div>
                <Label>Estimasi Biaya (IDR)</Label>
                <Input
                  type="number"
                  value={repairForm.estimated_cost}
                  onChange={(e) =>
                    setRepairForm({ ...repairForm, estimated_cost: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Target Selesai</Label>
                <Input
                  type="date"
                  value={repairForm.target_completion_date}
                  onChange={(e) =>
                    setRepairForm({ ...repairForm, target_completion_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Diagnosis</Label>
              <Textarea
                value={repairForm.diagnosis}
                onChange={(e) => setRepairForm({ ...repairForm, diagnosis: e.target.value })}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={repairForm.blocks_vehicle}
                onChange={(e) => setRepairForm({ ...repairForm, blocks_vehicle: e.target.checked })}
              />
              <span>Blokir unit dari booking selama proses perbaikan berlangsung</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRepairOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan & Mulai Perbaikan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Update Repair Progress Modal */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Progres {activeRepair?.repair_number}</DialogTitle>
            <DialogDescription>
              Memasukkan biaya realisasi akan otomatis tercatat pada modul Biaya Operasional tanpa duplikasi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateRepair} className="space-y-3">
            <div>
              <Label>Tahap Perbaikan</Label>
              <Select
                value={updateForm.status}
                onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value as RepairStatus })}
              >
                {REPAIR_STAGES.filter((s) => s !== 'Ditutup').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Detail Pekerjaan</Label>
              <Textarea
                value={updateForm.work_details}
                onChange={(e) => setUpdateForm({ ...updateForm, work_details: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Suku Cadang</Label>
                <Input
                  value={updateForm.spare_parts}
                  onChange={(e) => setUpdateForm({ ...updateForm, spare_parts: e.target.value })}
                />
              </div>
              <div>
                <Label>Biaya Realisasi (IDR)</Label>
                <Input
                  type="number"
                  value={updateForm.actual_cost}
                  onChange={(e) => setUpdateForm({ ...updateForm, actual_cost: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Unggah Nota / Bukti Transaksi</Label>
              <label className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-600 cursor-pointer">
                <Upload className="h-4 w-4" />
                <span>{updateForm.receipt_url ? 'Nota Terunggah (Ganti?)' : 'Pilih File Nota...'}</span>
                <input type="file" className="hidden" onChange={handleUploadReceipt} />
              </label>
            </div>
            <div>
              <Label>Catatan Progres</Label>
              <Input
                value={updateForm.log_notes}
                onChange={(e) => setUpdateForm({ ...updateForm, log_notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUpdateOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Progres</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Final Verification Modal */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verifikasi Hasil Perbaikan {activeRepair?.repair_number}</DialogTitle>
            <DialogDescription>
              Setelah perbaikan selesai, GA wajib memverifikasi kelayakan operasional sebelum blokir dilepas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFinalVerify} className="space-y-4">
            <div>
              <Label>Keputusan Kelayakan Kendaraan</Label>
              <Select
                value={verifyForm.eligibility_status}
                onChange={(e) =>
                  setVerifyForm({
                    ...verifyForm,
                    eligibility_status: e.target.value as 'layak' | 'layak_dengan_catatan' | 'tidak_layak',
                  })
                }
              >
                <option value="layak">Layak Operasional (Lepas Blokir)</option>
                <option value="layak_dengan_catatan">Layak dengan Catatan (Lepas Blokir)</option>
                <option value="tidak_layak">Masih Tidak Layak (Tetap Diblokir)</option>
              </Select>
            </div>
            <div>
              <Label>Catatan Verifikasi GA</Label>
              <Textarea
                value={verifyForm.verification_notes}
                onChange={(e) => setVerifyForm({ ...verifyForm, verification_notes: e.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setVerifyOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Selesaikan & Tutup Perbaikan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
