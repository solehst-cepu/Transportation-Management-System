import React, { useCallback, useEffect, useState } from 'react';
import { Bus, Car, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ApiError, apiRequest } from '../lib/api.ts';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog.tsx';
import { formatIdr } from '../lib/utils.ts';
import {
  AdminUser,
  Department,
  Driver,
  VehicleType,
  Vendor,
  VendorService,
} from '../../shared/types.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
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

async function deleteWithOAuthRetry<T>(
  url: string,
  reauthorizeGoogleWorkspace: () => Promise<string | null>
): Promise<T> {
  try {
    return await apiRequest<T>(url, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'GOOGLE_SHEETS_REAUTH_REQUIRED') {
      const token = await reauthorizeGoogleWorkspace();
      if (!token) throw err;
      return await apiRequest<T>(url, { method: 'DELETE' });
    }
    throw err;
  }
}

export function DepartmentsPage() {
  const { reauthorizeGoogleWorkspace } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Department>>({});
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await apiRequest<{ departments: Department[] }>('/api/departments');
    setRows(res.departments);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm({ category: 'Akademik', active_status: 'aktif' });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await apiRequest(`/api/departments/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
      notify('Unit diperbarui.', 'success');
    } else {
      await apiRequest('/api/departments', { method: 'POST', body: JSON.stringify(form) });
      notify('Unit baru ditambahkan.', 'success');
    }
    setModalOpen(false);
    await load();
  };

  const handleConfirmDelete = async (force: boolean) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteWithOAuthRetry<{ softDeleted: boolean }>(
        `/api/departments/${deleteTarget.department_id}${force ? '?force=true' : ''}`,
        reauthorizeGoogleWorkspace
      );
      notify(
        res.softDeleted
          ? 'Unit dinonaktifkan karena memiliki riwayat transaksi. Centang "Hapus permanen" jika ingin menghapus baris.'
          : 'Unit berhasil dihapus.',
        res.softDeleted ? 'info' : 'success'
      );
      setDeleteTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus unit.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = rows.filter(
    (d) =>
      !search.trim() ||
      d.department_name.toLowerCase().includes(search.toLowerCase()) ||
      d.department_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="relative w-72">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Cari kode atau nama unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tambah Unit / Departemen
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Kode</th>
                <th className="px-4 py-3 font-medium">Nama Unit / Departemen</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">PIC & Kontak</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => (
                <tr key={d.department_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1755CE]">{d.department_code}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-900">{d.department_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{d.category}</td>
                  <td className="px-4 py-3 text-xs">
                    <div>{d.person_in_charge}</div>
                    <div className="text-slate-500">{d.email} · {d.phone}</div>
                  </td>
                  <td className="px-4 py-3"><StatusLabel status={d.active_status} /></td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditId(d.department_id);
                        setForm(d);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(d)}
                      title="Hapus Unit"
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Unit / Departemen' : 'Tambah Unit / Departemen'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kode Unit</Label>
                <Input
                  value={form.department_code || ''}
                  onChange={(e) => setForm({ ...form, department_code: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div>
                <Label>Kategori</Label>
                <Select
                  value={form.category || 'Akademik'}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Department['category'] })}
                >
                  <option value="Akademik">Akademik</option>
                  <option value="Operasional">Operasional</option>
                  <option value="Manajemen">Manajemen</option>
                  <option value="Lainnya">Lainnya</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nama Unit / Departemen</Label>
              <Input
                value={form.department_name || ''}
                onChange={(e) => setForm({ ...form, department_name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Penanggung Jawab (PIC)</Label>
                <Input
                  value={form.person_in_charge || ''}
                  onChange={(e) => setForm({ ...form, person_in_charge: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.active_status || 'aktif'}
                  onChange={(e) => setForm({ ...form, active_status: e.target.value as 'aktif' | 'nonaktif' })}
                >
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </Select>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telepon</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Unit / Departemen"
        itemName={deleteTarget ? `${deleteTarget.department_code} — ${deleteTarget.department_name}` : ''}
        allowForceDelete
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export function DriversPage() {
  const { reauthorizeGoogleWorkspace } = useAuth();
  const { notify } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Driver>>({ eligible_vehicle_type_ids: [] });
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [dRes, vtRes] = await Promise.all([
      apiRequest<{ drivers: Driver[] }>('/api/drivers'),
      apiRequest<{ vehicleTypes: VehicleType[] }>('/api/vehicle-types'),
    ]);
    setDrivers(dRes.drivers);
    setVehicleTypes(vtRes.vehicleTypes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await apiRequest(`/api/drivers/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
      notify('Data pengemudi diperbarui.', 'success');
    } else {
      await apiRequest('/api/drivers', { method: 'POST', body: JSON.stringify(form) });
      notify('Pengemudi ditambahkan.', 'success');
    }
    setModalOpen(false);
    await load();
  };

  const handleConfirmDelete = async (force: boolean) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteWithOAuthRetry<{ softDeleted: boolean }>(
        `/api/drivers/${deleteTarget.driver_id}${force ? '?force=true' : ''}`,
        reauthorizeGoogleWorkspace
      );
      notify(
        res.softDeleted
          ? 'Pengemudi dinonaktifkan karena memiliki riwayat tugas. Centang "Hapus permanen" jika ingin menghapus baris.'
          : 'Data pengemudi berhasil dihapus.',
        res.softDeleted ? 'info' : 'success'
      );
      setDeleteTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus pengemudi.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const vtMap = new Map(vehicleTypes.map((t) => [t.vehicle_type_id, t.code]));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditId(null);
            setForm({
              sim_type: 'SIM A',
              active_status: 'aktif',
              eligible_vehicle_type_ids: [],
            });
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Tambah Pengemudi
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">ID & Nama Lengkap</th>
                <th className="px-4 py-3 font-medium">Telepon</th>
                <th className="px-4 py-3 font-medium">SIM & Masa Berlaku</th>
                <th className="px-4 py-3 font-medium">Kompetensi Unit</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map((d) => (
                <tr key={d.driver_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs">
                    <div className="font-semibold text-slate-900">{d.full_name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{d.internal_id}</div>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">{d.phone}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    <div className="font-medium text-slate-900">{d.sim_type}</div>
                    <div className="text-slate-500">s/d {d.sim_expiry}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {d.eligible_vehicle_type_ids.map((id) => vtMap.get(id) || id).join(', ') || '-'}
                  </td>
                  <td className="px-4 py-3"><StatusLabel status={d.active_status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditId(d.driver_id);
                        setForm(d);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(d)}
                      title="Hapus Pengemudi"
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Pengemudi' : 'Tambah Pengemudi Sekolah'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nama Lengkap</Label>
                <Input
                  value={form.full_name || ''}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>ID Internal</Label>
                <Input
                  value={form.internal_id || ''}
                  onChange={(e) => setForm({ ...form, internal_id: e.target.value })}
                />
              </div>
              <div>
                <Label>Telepon</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Status Aktif</Label>
                <Select
                  value={form.active_status || 'aktif'}
                  onChange={(e) => setForm({ ...form, active_status: e.target.value as 'aktif' | 'nonaktif' })}
                >
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </Select>
              </div>
              <div>
                <Label>Jenis SIM</Label>
                <Select
                  value={form.sim_type || 'SIM A'}
                  onChange={(e) => setForm({ ...form, sim_type: e.target.value as Driver['sim_type'] })}
                >
                  {['SIM A', 'SIM A Umum', 'SIM B1', 'SIM B1 Umum', 'SIM B2', 'SIM B2 Umum'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Masa Berlaku SIM</Label>
                <Input
                  type="date"
                  value={form.sim_expiry || ''}
                  onChange={(e) => setForm({ ...form, sim_expiry: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Jenis Kendaraan yang Dapat Dikemudikan</Label>
              <div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-lg p-3 text-xs">
                {vehicleTypes.filter((t) => t.category !== 'Eksternal').map((vt) => {
                  const checked = (form.eligible_vehicle_type_ids || []).includes(vt.vehicle_type_id);
                  return (
                    <label key={vt.vehicle_type_id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const cur = form.eligible_vehicle_type_ids || [];
                          setForm({
                            ...form,
                            eligible_vehicle_type_ids: e.target.checked
                              ? [...cur, vt.vehicle_type_id]
                              : cur.filter((x) => x !== vt.vehicle_type_id),
                          });
                        }}
                      />
                      <span>{vt.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Catatan</Label>
              <Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Master Pengemudi"
        itemName={deleteTarget ? `${deleteTarget.full_name} (${deleteTarget.internal_id})` : ''}
        allowForceDelete
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export function VendorsPage() {
  const { reauthorizeGoogleWorkspace } = useAuth();
  const { notify } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [services, setServices] = useState<VendorService[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [svcModalOpen, setSvcModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vendor>>({ service_types: [] });
  const [svcForm, setSvcForm] = useState<Partial<VendorService>>({});
  const [deleteVendorTarget, setDeleteVendorTarget] = useState<Vendor | null>(null);
  const [deleteServiceTarget, setDeleteServiceTarget] = useState<VendorService | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await apiRequest<{ vendors: Vendor[]; vendorServices: VendorService[] }>('/api/vendors');
    setVendors(res.vendors);
    setServices(res.vendorServices);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await apiRequest(`/api/vendors/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiRequest('/api/vendors', { method: 'POST', body: JSON.stringify(form) });
    }
    notify('Data vendor disimpan.', 'success');
    setModalOpen(false);
    await load();
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/vendor-services', { method: 'POST', body: JSON.stringify(svcForm) });
    notify('Layanan armada vendor ditambahkan (terpisah dari aset sekolah).', 'success');
    setSvcModalOpen(false);
    await load();
  };

  const handleConfirmDeleteVendor = async (force: boolean) => {
    if (!deleteVendorTarget) return;
    setDeleting(true);
    try {
      const res = await deleteWithOAuthRetry<{ softDeleted: boolean }>(
        `/api/vendors/${deleteVendorTarget.vendor_id}${force ? '?force=true' : ''}`,
        reauthorizeGoogleWorkspace
      );
      notify(
        res.softDeleted
          ? 'Vendor dinonaktifkan karena memiliki riwayat penawaran/order. Centang "Hapus permanen" jika ingin menghapus baris.'
          : 'Vendor berhasil dihapus.',
        res.softDeleted ? 'info' : 'success'
      );
      setDeleteVendorTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus vendor.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDeleteService = async () => {
    if (!deleteServiceTarget) return;
    setDeleting(true);
    try {
      await deleteWithOAuthRetry<{ ok: boolean }>(
        `/api/vendor-services/${deleteServiceTarget.service_id}`,
        reauthorizeGoogleWorkspace
      );
      notify('Layanan armada vendor dihapus.', 'success');
      setDeleteServiceTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus layanan vendor.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const vendorMap = new Map(vendors.map((v) => [v.vendor_id, v.company_name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="text-xs text-slate-500">
          Vendor transportasi eksternal dikelola terpisah dan tidak dicatat sebagai kendaraan aset sekolah.
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSvcForm({ vendor_id: vendors[0]?.vendor_id || '', seat_capacity: 50, base_rate: 4500000 });
              setSvcModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Layanan Unit Vendor
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditId(null);
              setForm({ active_status: 'aktif', service_types: ['Big Bus', 'Medium Bus'] });
              setModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Vendor
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Perusahaan Vendor Transportasi</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Perusahaan</th>
                <th className="px-4 py-3 font-medium">PIC & Kontak</th>
                <th className="px-4 py-3 font-medium">Layanan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((v) => (
                <tr key={v.vendor_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs">
                    <div className="font-semibold text-slate-900">{v.company_name}</div>
                    <div className="text-slate-500">{v.address}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{v.pic_name}</div>
                    <div className="text-slate-500">{v.phone} · {v.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{v.service_types.join(', ')}</td>
                  <td className="px-4 py-3"><StatusLabel status={v.active_status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditId(v.vendor_id);
                        setForm(v);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteVendorTarget(v)}
                      title="Hapus Vendor"
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

      <Card>
        <CardHeader>
          <CardTitle>Katalog Layanan Armada Vendor (Terpisah dari Aset Sekolah)</CardTitle>
          <CardDescription>Referensi spesifikasi dan tarif awal untuk penyewaan eksternal</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Tipe Unit</th>
                <th className="px-4 py-3 font-medium">Kapasitas</th>
                <th className="px-4 py-3 font-medium">Tarif Dasar</th>
                <th className="px-4 py-3 font-medium">Fasilitas</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((s) => (
                <tr key={s.service_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-medium">{vendorMap.get(s.vendor_id) || '-'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-900">{s.vehicle_type}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{s.seat_capacity} kursi</td>
                  <td className="px-4 py-3 text-xs font-mono tabular-nums">{formatIdr(s.base_rate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{s.facilities}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteServiceTarget(s)}
                      title="Hapus Layanan Vendor"
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Vendor' : 'Tambah Vendor Transportasi'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveVendor} className="space-y-3">
            <div>
              <Label>Nama Perusahaan</Label>
              <Input
                value={form.company_name || ''}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>PIC</Label>
                <Input value={form.pic_name || ''} onChange={(e) => setForm({ ...form, pic_name: e.target.value })} required />
              </div>
              <div>
                <Label>Telepon</Label>
                <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.active_status || 'aktif'}
                  onChange={(e) => setForm({ ...form, active_status: e.target.value as 'aktif' | 'nonaktif' })}
                >
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Alamat</Label>
              <Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Jenis Layanan (pisahkan koma)</Label>
              <Input
                value={(form.service_types || []).join(', ')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    service_types: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={svcModalOpen} onOpenChange={setSvcModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Layanan Armada Vendor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveService} className="space-y-3">
            <div>
              <Label>Perusahaan Vendor</Label>
              <Select
                value={svcForm.vendor_id || ''}
                onChange={(e) => setSvcForm({ ...svcForm, vendor_id: e.target.value })}
              >
                {vendors.map((v) => (
                  <option key={v.vendor_id} value={v.vendor_id}>{v.company_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tipe Unit</Label>
              <Input value={svcForm.vehicle_type || ''} onChange={(e) => setSvcForm({ ...svcForm, vehicle_type: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kapasitas Kursi</Label>
                <Input type="number" value={svcForm.seat_capacity || 50} onChange={(e) => setSvcForm({ ...svcForm, seat_capacity: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Tarif Dasar (IDR)</Label>
                <Input type="number" value={svcForm.base_rate || 0} onChange={(e) => setSvcForm({ ...svcForm, base_rate: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Fasilitas</Label>
              <Input value={svcForm.facilities || ''} onChange={(e) => setSvcForm({ ...svcForm, facilities: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSvcModalOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteVendorTarget)}
        onOpenChange={(open) => !open && setDeleteVendorTarget(null)}
        title="Hapus Master Vendor"
        itemName={deleteVendorTarget?.company_name || ''}
        allowForceDelete
        loading={deleting}
        onConfirm={handleConfirmDeleteVendor}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteServiceTarget)}
        onOpenChange={(open) => !open && setDeleteServiceTarget(null)}
        title="Hapus Layanan Armada Vendor"
        itemName={deleteServiceTarget?.vehicle_type || ''}
        loading={deleting}
        onConfirm={handleConfirmDeleteService}
      />
    </div>
  );
}

export function VehicleTypesPage() {
  const { reauthorizeGoogleWorkspace } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<VehicleType[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'INTERNAL' | 'EKSTERNAL'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<Partial<VehicleType> & { plate_number?: string }>({
    category: 'Internal',
    active_status: 'aktif',
    required_sim: 'SIM A',
    default_capacity: 7,
    plate_number: '',
  });

  const load = useCallback(async () => {
    const res = await apiRequest<{ vehicleTypes: VehicleType[] }>('/api/vehicle-types');
    setRows(res.vehicleTypes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const operationalTypes = rows.filter((t) => t.category !== 'Eksternal');
  const rentalTypes = rows.filter((t) => t.category === 'Eksternal');

  const openCreate = (category: 'Internal' | 'Eksternal') => {
    setEditId(null);
    setForm({
      code:
        category === 'Eksternal'
          ? 'SEWA-'
          : `LZ-OPR-${String(operationalTypes.length + 1).padStart(2, '0')}`,
      name: '',
      category,
      default_capacity: category === 'Eksternal' ? 50 : 7,
      required_sim: category === 'Eksternal' ? 'SIM B2 Umum' : 'SIM A',
      description: '',
      active_status: 'aktif',
      plate_number: '',
    });
    setModalOpen(true);
  };

  const openEdit = (vt: VehicleType) => {
    setEditId(vt.vehicle_type_id);
    setForm({
      ...vt,
      category: vt.category === 'Eksternal' ? 'Eksternal' : 'Internal',
      plate_number: '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await apiRequest(`/api/vehicle-types/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
        notify('Jenis kendaraan diperbarui.', 'success');
      } else {
        await apiRequest('/api/vehicle-types', { method: 'POST', body: JSON.stringify(form) });
        notify('Jenis kendaraan ditambahkan.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan jenis kendaraan.', 'error');
    }
  };

  const toggleStatus = async (vt: VehicleType) => {
    try {
      await apiRequest(`/api/vehicle-types/${vt.vehicle_type_id}`, {
        method: 'PUT',
        body: JSON.stringify({ active_status: vt.active_status === 'aktif' ? 'nonaktif' : 'aktif' }),
      });
      notify('Status jenis kendaraan diperbarui.', 'info');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal mengubah status.', 'error');
    }
  };

  const handleConfirmDelete = async (force: boolean) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteWithOAuthRetry<{ softDeleted: boolean }>(
        `/api/vehicle-types/${deleteTarget.vehicle_type_id}${force ? '?force=true' : ''}`,
        reauthorizeGoogleWorkspace
      );
      notify(
        res.softDeleted
          ? 'Jenis kendaraan dinonaktifkan karena sudah digunakan di armada/pengajuan. Centang "Hapus permanen" jika ingin menghapus baris.'
          : `Jenis kendaraan ${deleteTarget.name} berhasil dihapus.`,
        res.softDeleted ? 'info' : 'success'
      );
      setDeleteTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus jenis kendaraan.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const renderTable = (items: VehicleType[]) => (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
        <tr>
          <th className="px-4 py-3 font-medium">Kode</th>
          <th className="px-4 py-3 font-medium">Nama Jenis Kendaraan</th>
          <th className="px-4 py-3 font-medium">Kapasitas Standar</th>
          <th className="px-4 py-3 font-medium">Syarat SIM</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3 font-medium text-right">Aksi</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-400">
              Belum ada jenis kendaraan pada kategori ini.
            </td>
          </tr>
        ) : (
          items.map((t) => (
            <tr key={t.vehicle_type_id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1755CE]">{t.code}</td>
              <td className="px-4 py-3">
                <div className="text-xs font-semibold text-slate-900">{t.name}</div>
                {t.description && <div className="text-[11px] text-slate-500">{t.description}</div>}
              </td>
              <td className="px-4 py-3 text-xs tabular-nums">{t.default_capacity} kursi</td>
              <td className="px-4 py-3 text-xs">{t.required_sim}</td>
              <td className="px-4 py-3">
                <StatusLabel status={t.active_status} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void toggleStatus(t)}>
                    {t.active_status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(t)}
                    title="Hapus Jenis Kendaraan"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      {/* View Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'ALL' ? 'bg-[#1755CE] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Semua (Terpisah)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('INTERNAL')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'INTERNAL' ? 'bg-[#1755CE] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Operasional Sekolah ({operationalTypes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('EKSTERNAL')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'EKSTERNAL' ? 'bg-[#1755CE] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Kendaraan Sewa / Bus ({rentalTypes.length})
          </button>
        </div>
      </div>

      {/* Section 1: Kendaraan Operasional Sekolah */}
      {(activeTab === 'ALL' || activeTab === 'INTERNAL') && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="h-4 w-4 text-[#1755CE]" />
                Jenis Kendaraan Operasional Sekolah
              </CardTitle>
              <CardDescription>
                Tersinkronisasi otomatis dua arah dengan modul{' '}
                <strong>Transport Management → Data Kendaraan</strong> (unit armada milik sekolah), pengajuan
                kendaraan dinas internal, dan kualifikasi SIM pengemudi.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openCreate('Internal')}>
              <Plus className="h-4 w-4" />
              Tambah Jenis Operasional
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">{renderTable(operationalTypes)}</CardContent>
        </Card>
      )}

      {/* Section 2: Kendaraan Sewa (Bus / Eksternal) */}
      {(activeTab === 'ALL' || activeTab === 'EKSTERNAL') && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bus className="h-4 w-4 text-[#1755CE]" />
                Jenis Kendaraan Sewa (Bus / Eksternal)
              </CardTitle>
              <CardDescription>
                Menjadi sumber pilihan otomatis pada menu <strong>Order Bus / Eksternal</strong>. Item berstatus aktif akan muncul pada formulir pemesanan sewa.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openCreate('Eksternal')}>
              <Plus className="h-4 w-4" />
              Tambah Jenis Sewa / Bus
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">{renderTable(rentalTypes)}</CardContent>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? 'Edit' : 'Tambah'}{' '}
              {form.category === 'Eksternal'
                ? 'Jenis Kendaraan Sewa (Eksternal)'
                : 'Jenis Kendaraan Operasional Sekolah'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            {form.category !== 'Eksternal' && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
                Unit operasional sekolah akan otomatis dibuat / diperbarui pada{' '}
                <strong>Transport Management → Data Kendaraan</strong>.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kode</Label>
                <Input
                  value={form.code || ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder={form.category === 'Eksternal' ? 'SEWA-BBUS' : 'LZ-OPR-04'}
                  required
                />
              </div>
              <div>
                <Label>Kelompok Jenis</Label>
                <Select
                  value={form.category === 'Eksternal' ? 'Eksternal' : 'Internal'}
                  disabled={Boolean(editId)}
                  onChange={(e) => setForm({ ...form, category: e.target.value as 'Internal' | 'Eksternal' })}
                >
                  <option value="Internal">Kendaraan Operasional Sekolah</option>
                  <option value="Eksternal">Kendaraan Sewa (Bus / Eksternal)</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nama Jenis Kendaraan</Label>
              <Input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={
                  form.category === 'Eksternal'
                    ? 'Contoh: Big Bus / Medium Bus'
                    : 'Contoh: Toyota Innova Zenix 2.0 G'
                }
                required
              />
            </div>
            {!editId && form.category !== 'Eksternal' && (
              <div>
                <Label>Nomor Polisi (Opsional)</Label>
                <Input
                  value={form.plate_number || ''}
                  onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
                  placeholder="Contoh: B 1234 LZD (kosongkan jika menyusul)"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kapasitas Default (Kursi)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.default_capacity || 7}
                  onChange={(e) => setForm({ ...form, default_capacity: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Syarat SIM</Label>
                <Select
                  value={form.required_sim || 'SIM A'}
                  onChange={(e) => setForm({ ...form, required_sim: e.target.value })}
                >
                  {['SIM A', 'SIM A Umum', 'SIM B1', 'SIM B1 Umum', 'SIM B2', 'SIM B2 Umum'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Deskripsi singkat kegunaan jenis kendaraan..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Jenis Kendaraan"
        itemName={deleteTarget ? `${deleteTarget.code} — ${deleteTarget.name}` : ''}
        allowForceDelete
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export function AdminUsersPage() {
  const { user, reauthorizeGoogleWorkspace } = useAuth();
  const { notify } = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'GA Admin' as AdminUser['role'] });
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await apiRequest<{ adminUsers: AdminUser[] }>('/api/admin-users');
    setAdmins(res.adminUsers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin-users', { method: 'POST', body: JSON.stringify(form) });
      notify('Akun Administrator ditambahkan.', 'success');
      setModalOpen(false);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menambah administrator.', 'error');
    }
  };

  const toggleStatus = async (a: AdminUser) => {
    await apiRequest(`/api/admin-users/${a.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: a.status === 'aktif' ? 'nonaktif' : 'aktif' }),
    });
    notify('Status administrator diperbarui.', 'info');
    await load();
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWithOAuthRetry<{ ok: boolean }>(
        `/api/admin-users/${deleteTarget.id}`,
        reauthorizeGoogleWorkspace
      );
      notify(`Akun Administrator ${deleteTarget.email} dihapus.`, 'success');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menghapus administrator.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div className="text-xs text-slate-500">
          Hanya akun Google Workspace <span className="font-mono font-medium">@lazuardi.sch.id</span> berstatus aktif pada daftar ini yang memiliki akses Administrator GA melalui Google SSO.
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Daftarkan Administrator
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Email Google</th>
                <th className="px-4 py-3 font-medium">Peran</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((a) => {
                const isSelf = a.email.toLowerCase() === (user?.email || '').toLowerCase();
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">{a.name}</td>
                    <td className="px-4 py-3 text-xs font-mono">{a.email}</td>
                    <td className="px-4 py-3 text-xs">{a.role}</td>
                    <td className="px-4 py-3"><StatusLabel status={a.status} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                      <Button size="sm" variant="outline" onClick={() => void toggleStatus(a)}>
                        {a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSelf}
                        onClick={() => setDeleteTarget(a)}
                        title={isSelf ? 'Akun yang sedang digunakan tidak bisa dihapus' : 'Hapus Administrator'}
                      >
                        <Trash2 className={`h-3.5 w-3.5 ${isSelf ? 'text-slate-300' : 'text-red-600'}`} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Daftarkan Akun Administrator</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div><Label>Nama Lengkap</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div>
              <Label>Email Google Workspace (@lazuardi.sch.id)</Label>
              <Input
                type="email"
                placeholder="nama@lazuardi.sch.id"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Role Administrator</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminUser['role'] })}>
                <option value="GA Admin">GA Admin</option>
                <option value="Fleet Manager">Fleet Manager</option>
                <option value="Super Admin">Super Admin</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Akun Administrator"
        itemName={deleteTarget ? `${deleteTarget.name} (${deleteTarget.email} — ${deleteTarget.role})` : ''}
        description="Akses Administrator untuk akun Google ini akan dihapus permanen dari daftar pengelola."
        loading={deleting}
        onConfirm={handleConfirmDeleteAdmin}
      />
    </div>
  );
}
