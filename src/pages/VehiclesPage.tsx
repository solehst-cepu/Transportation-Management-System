import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, Search, ShieldAlert, Truck, Upload } from 'lucide-react';
import { apiRequest, uploadAssetFile } from '../lib/api.ts';
import { Department, Driver, Vehicle, VehicleType } from '../../shared/types.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { useToast } from '../components/ui/toast.tsx';

const PHOTO_PRESETS = [
  { label: 'MPV Operasional (Innova)', url: '/src/assets/images/fleet_innova_mpv_1794808757672.jpg' },
  { label: 'Van Commuter (Hiace)', url: '/src/assets/images/fleet_hiace_commuter_1794808756691.jpg' },
  { label: 'Medium Bus Sekolah', url: '/src/assets/images/fleet_school_bus_1794808757647.jpg' },
];

export function VehiclesPage() {
  const { notify } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vehicle>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, vtRes, dRes, drvRes] = await Promise.all([
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
        apiRequest<{ vehicleTypes: VehicleType[] }>('/api/vehicle-types'),
        apiRequest<{ departments: Department[] }>('/api/departments'),
        apiRequest<{ drivers: Driver[] }>('/api/drivers'),
      ]);
      setVehicles(vRes.vehicles);
      setVehicleTypes(vtRes.vehicleTypes.filter((t) => t.category !== 'Eksternal'));
      setDepartments(dRes.departments);
      setDrivers(drvRes.drivers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      vehicle_code: `LZ-OPR-${String(vehicles.length + 1).padStart(2, '0')}`,
      vehicle_name: '',
      plate_number: '',
      brand: 'Toyota',
      model: '',
      vehicle_type_id: vehicleTypes[0]?.vehicle_type_id || '',
      manufacture_year: 2024,
      registration_year: 2024,
      color: 'Putih',
      fuel_type: 'Bensin',
      transmission: 'Otomatis',
      engine_capacity_cc: 1500,
      passenger_capacity: 7,
      photo_url: PHOTO_PRESETS[0].url,
      managing_department_id: departments[0]?.department_id || '',
      parking_location: 'Kampus Lazuardi Cinere',
      ownership_status: 'Milik Sekolah',
      admin_status: 'aktif',
      eligibility_status: 'layak',
      last_odometer: 0,
      service_interval_km: 10000,
      service_interval_months: 6,
    });
    setModalOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditingId(v.vehicle_id);
    setForm(v);
    setModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadAssetFile(file);
      setForm((prev) => ({ ...prev, photo_url: uploaded.url }));
      notify('Foto kendaraan berhasil diunggah.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal mengunggah foto.', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiRequest(`/api/vehicles/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        notify('Data kendaraan berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/api/vehicles', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        notify('Kendaraan operasional baru berhasil ditambahkan.', 'success');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan kendaraan.', 'error');
    }
  };

  const filtered = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      v.plate_number.toLowerCase().includes(q) ||
      v.vehicle_name.toLowerCase().includes(q) ||
      v.vehicle_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Cari no. polisi, kode, nama unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tambah Kendaraan Sekolah
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat master kendaraan...</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Unit Armada</th>
                  <th className="px-4 py-3 font-medium">No. Polisi & Kode</th>
                  <th className="px-4 py-3 font-medium">Odometer</th>
                  <th className="px-4 py-3 font-medium">Status Admin</th>
                  <th className="px-4 py-3 font-medium">Kelayakan</th>
                  <th className="px-4 py-3 font-medium">Penggunaan</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v) => (
                  <tr key={v.vehicle_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-16 rounded-md overflow-hidden border border-slate-200 bg-slate-100 shrink-0 flex items-center justify-center">
                          {v.photo_url ? (
                            <img
                              src={v.photo_url}
                              alt={v.vehicle_name}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Truck className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{v.vehicle_name}</div>
                          <div className="text-xs text-slate-500">
                            {v.brand} {v.model} · {v.manufacture_year} · {v.passenger_capacity} kursi
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold text-slate-900">{v.plate_number}</div>
                      <div className="text-[11px] text-slate-500">{v.vehicle_code}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {Number(v.last_odometer || 0).toLocaleString('id-ID')} km
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={v.admin_status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusLabel status={v.eligibility_status} />
                        {v.safety_blocked && (
                          <div className="text-[11px] text-red-700 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3 shrink-0" />
                            <span>Diblokir</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={v.usage_status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/transportation/vehicles/${v.vehicle_id}`}>
                          <Eye className="h-3.5 w-3.5" />
                          Detail
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Master Kendaraan' : 'Tambah Kendaraan Operasional Sekolah'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Kode Kendaraan</Label>
                <Input
                  value={form.vehicle_code || ''}
                  onChange={(e) => setForm({ ...form, vehicle_code: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Nomor Polisi</Label>
                <Input
                  value={form.plate_number || ''}
                  onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div>
                <Label>Nama Kendaraan</Label>
                <Input
                  value={form.vehicle_name || ''}
                  onChange={(e) => setForm({ ...form, vehicle_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Merek</Label>
                <Input
                  value={form.brand || ''}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </div>
              <div>
                <Label>Model</Label>
                <Input
                  value={form.model || ''}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
              <div>
                <Label>Jenis Kendaraan</Label>
                <Select
                  value={form.vehicle_type_id || ''}
                  onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}
                >
                  {vehicleTypes
                    .filter((vt) => vt.active_status === 'aktif' || vt.vehicle_type_id === form.vehicle_type_id)
                    .map((vt) => (
                      <option key={vt.vehicle_type_id} value={vt.vehicle_type_id}>
                        {vt.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <Label>Tahun Pembuatan</Label>
                <Input
                  type="number"
                  value={form.manufacture_year || 2024}
                  onChange={(e) => setForm({ ...form, manufacture_year: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Kapasitas Penumpang</Label>
                <Input
                  type="number"
                  value={form.passenger_capacity || 7}
                  onChange={(e) => setForm({ ...form, passenger_capacity: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Bahan Bakar</Label>
                <Select
                  value={form.fuel_type || 'Bensin'}
                  onChange={(e) => setForm({ ...form, fuel_type: e.target.value as Vehicle['fuel_type'] })}
                >
                  <option value="Bensin">Bensin</option>
                  <option value="Solar">Solar</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Listrik">Listrik</option>
                </Select>
              </div>
              <div>
                <Label>Transmisi</Label>
                <Select
                  value={form.transmission || 'Otomatis'}
                  onChange={(e) => setForm({ ...form, transmission: e.target.value as Vehicle['transmission'] })}
                >
                  <option value="Otomatis">Otomatis</option>
                  <option value="Manual">Manual</option>
                </Select>
              </div>
              <div>
                <Label>Odometer Terakhir (km)</Label>
                <Input
                  type="number"
                  value={form.last_odometer || 0}
                  onChange={(e) => setForm({ ...form, last_odometer: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Pengemudi Utama</Label>
                <Select
                  value={form.primary_driver_id || ''}
                  onChange={(e) => setForm({ ...form, primary_driver_id: e.target.value })}
                >
                  <option value="">Tidak ada pengemudi tetap</option>
                  {drivers.map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
              <div>
                <Label>Nomor STNK</Label>
                <Input
                  value={form.stnk_number || ''}
                  onChange={(e) => setForm({ ...form, stnk_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Masa Berlaku STNK</Label>
                <Input
                  type="date"
                  value={form.stnk_expiry || ''}
                  onChange={(e) => setForm({ ...form, stnk_expiry: e.target.value })}
                />
              </div>
              <div>
                <Label>Jatuh Tempo Pajak</Label>
                <Input
                  type="date"
                  value={form.tax_due_date || ''}
                  onChange={(e) => setForm({ ...form, tax_due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Masa Berlaku KIR (Jika Ada)</Label>
                <Input
                  type="date"
                  value={form.kir_expiry || ''}
                  onChange={(e) => setForm({ ...form, kir_expiry: e.target.value })}
                />
              </div>
              <div>
                <Label>Masa Berlaku Asuransi</Label>
                <Input
                  type="date"
                  value={form.insurance_expiry || ''}
                  onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })}
                />
              </div>
              <div>
                <Label>Status Administratif</Label>
                <Select
                  value={form.admin_status || 'aktif'}
                  onChange={(e) => setForm({ ...form, admin_status: e.target.value as Vehicle['admin_status'] })}
                >
                  <option value="aktif">Aktif</option>
                  <option value="tidak_aktif">Tidak Aktif</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <Label>Pilih Foto Standar / Unggah Foto</Label>
                <Select
                  value={form.photo_url || ''}
                  onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
                >
                  {PHOTO_PRESETS.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Unggah Foto Baru (Drive / Server)</Label>
                <label className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
                  <Upload className="h-4 w-4" />
                  <span>Pilih File Foto...</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>

            <div>
              <Label>Catatan Kondisi Kendaraan</Label>
              <Textarea
                value={form.condition_notes || ''}
                onChange={(e) => setForm({ ...form, condition_notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Kendaraan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
