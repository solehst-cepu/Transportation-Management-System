import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { formatDateWib, formatIdr } from '../lib/utils.ts';
import { MaintenancePlan, Vehicle } from '../../shared/types.ts';
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

interface EnrichedMaintenance extends MaintenancePlan {
  current_odometer: number;
}

export function MaintenancePage() {
  const { notify } = useToast();
  const [plans, setPlans] = useState<EnrichedMaintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    vehicle_id: '',
    maintenance_type: 'Servis berkala' as MaintenancePlan['maintenance_type'],
    schedule_basis: 'Kombinasi' as MaintenancePlan['schedule_basis'],
    interval_months: 6,
    interval_km: 10000,
    next_target_date: '',
    next_target_km: 0,
    notes: '',
  });

  const [completeOpen, setCompleteOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<EnrichedMaintenance | null>(null);
  const [completeForm, setCompleteForm] = useState({
    actual_date: new Date().toISOString().slice(0, 10),
    actual_odometer: 0,
    cost: 0,
    vendor_name: '',
    work_summary: '',
    notes: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, vRes] = await Promise.all([
        apiRequest<{ maintenancePlans: EnrichedMaintenance[] }>('/api/maintenance-plans'),
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
      ]);
      setPlans(mRes.maintenancePlans);
      setVehicles(vRes.vehicles);
      if (vRes.vehicles[0]) {
        setCreateForm((p) => ({
          ...p,
          vehicle_id: p.vehicle_id || vRes.vehicles[0].vehicle_id,
          next_target_km: vRes.vehicles[0].last_odometer + 10000,
        }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/maintenance-plans', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      notify('Rencana perawatan berkala ditambahkan.', 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menambah jadwal.', 'error');
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlan) return;
    try {
      await apiRequest(`/api/maintenance-plans/${activePlan.maintenance_plan_id}/complete`, {
        method: 'POST',
        body: JSON.stringify(completeForm),
      });
      notify('Servis selesai dicatat, biaya disinkronkan & jadwal berikutnya dihitung otomatis.', 'success');
      setCompleteOpen(false);
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan realisasi servis.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Pengingat aktif otomatis pada 30 hari, 14 hari, 7 hari, jatuh tempo, dan terlambat.
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Rencana Servis
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat jadwal perawatan...</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Kendaraan</th>
                  <th className="px-4 py-3 font-medium">Jenis Perawatan</th>
                  <th className="px-4 py-3 font-medium">Basis & Interval</th>
                  <th className="px-4 py-3 font-medium">Target Berikutnya</th>
                  <th className="px-4 py-3 font-medium">Pengingat</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((p) => {
                  const veh = vehMap.get(p.vehicle_id);
                  return (
                    <tr key={p.maintenance_plan_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold text-slate-900">{veh?.plate_number}</div>
                        <div className="text-slate-500">{veh?.vehicle_name}</div>
                        <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                          Odo aktual: {p.current_odometer.toLocaleString('id-ID')} km
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-900">
                        <div>{p.maintenance_type}</div>
                        <div className="text-[11px] text-slate-500">
                          Terakhir: {formatDateWib(p.last_service_date)} · {formatIdr(p.last_cost)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                        <div>{p.schedule_basis}</div>
                        <div className="text-[11px] text-slate-400">
                          {p.interval_months} bln / {p.interval_km.toLocaleString('id-ID')} km
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono tabular-nums">
                        <div>{formatDateWib(p.next_target_date)}</div>
                        <div className="text-slate-500">{p.next_target_km.toLocaleString('id-ID')} km</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={p.reminder_stage} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActivePlan(p);
                            setCompleteForm({
                              actual_date: new Date().toISOString().slice(0, 10),
                              actual_odometer: p.current_odometer,
                              cost: p.last_cost || 0,
                              vendor_name: p.last_vendor || '',
                              work_summary: p.maintenance_type,
                              notes: '',
                            });
                            setCompleteOpen(true);
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Catat Servis Selesai
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create Plan Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[#1755CE]" />
              Tambah Rencana Perawatan Berkala
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <Label>Kendaraan</Label>
              <Select
                value={createForm.vehicle_id}
                onChange={(e) => setCreateForm({ ...createForm, vehicle_id: e.target.value })}
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
                <Label>Jenis Perawatan</Label>
                <Select
                  value={createForm.maintenance_type}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      maintenance_type: e.target.value as MaintenancePlan['maintenance_type'],
                    })
                  }
                >
                  {[
                    'Ganti oli mesin',
                    'Filter oli',
                    'Filter udara',
                    'Pemeriksaan rem',
                    'Pemeriksaan aki',
                    'Servis AC',
                    'Rotasi/ganti ban',
                    'Servis berkala',
                    'Pemeriksaan umum',
                    'Perawatan lainnya',
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Basis Jadwal</Label>
                <Select
                  value={createForm.schedule_basis}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      schedule_basis: e.target.value as MaintenancePlan['schedule_basis'],
                    })
                  }
                >
                  <option value="Kombinasi">Kombinasi (Tanggal & KM)</option>
                  <option value="Tanggal">Tanggal</option>
                  <option value="Kilometer">Kilometer</option>
                </Select>
              </div>
              <div>
                <Label>Interval (Bulan)</Label>
                <Input
                  type="number"
                  value={createForm.interval_months}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, interval_months: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Interval (KM)</Label>
                <Input
                  type="number"
                  value={createForm.interval_km}
                  onChange={(e) => setCreateForm({ ...createForm, interval_km: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Target Tanggal Berikutnya</Label>
                <Input
                  type="date"
                  value={createForm.next_target_date}
                  onChange={(e) => setCreateForm({ ...createForm, next_target_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Target Kilometer Berikutnya</Label>
                <Input
                  type="number"
                  value={createForm.next_target_km}
                  onChange={(e) => setCreateForm({ ...createForm, next_target_km: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Catatan</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Rencana</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Complete Service Modal */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Realisasi Servis Berkala — {activePlan?.maintenance_type}</DialogTitle>
            <DialogDescription>
              Menyimpan realisasi akan memperbarui odometer kendaraan, menghitung jadwal berikutnya, dan mencatat biaya.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleComplete} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tanggal Aktual</Label>
                <Input
                  type="date"
                  value={completeForm.actual_date}
                  onChange={(e) => setCompleteForm({ ...completeForm, actual_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Odometer Aktual (km)</Label>
                <Input
                  type="number"
                  value={completeForm.actual_odometer}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, actual_odometer: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div>
                <Label>Bengkel / Vendor</Label>
                <Input
                  value={completeForm.vendor_name}
                  onChange={(e) => setCompleteForm({ ...completeForm, vendor_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Biaya Servis (IDR)</Label>
                <Input
                  type="number"
                  value={completeForm.cost}
                  onChange={(e) => setCompleteForm({ ...completeForm, cost: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Ringkasan Pekerjaan</Label>
              <Input
                value={completeForm.work_summary}
                onChange={(e) => setCompleteForm({ ...completeForm, work_summary: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Catatan</Label>
              <Textarea
                value={completeForm.notes}
                onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan & Hitung Jadwal Berikutnya</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
