import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Department, VehicleType } from '../../shared/types.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { Button } from '../components/ui/button.tsx';
import { useToast } from '../components/ui/toast.tsx';

export function InternalBookingFormPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    department_id: user?.department_id || '',
    activity_name: '',
    purpose: '',
    departure_location: 'Kampus Lazuardi Cinere',
    destination_location: '',
    departure_at: '',
    return_at: '',
    passenger_count: 4,
    requested_vehicle_type_id: '',
    needs_driver: true,
    pic_name: user?.name || '',
    contact_phone: user?.phone || '',
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      apiRequest<{ departments: Department[] }>('/api/departments'),
      apiRequest<{ vehicleTypes: VehicleType[] }>('/api/vehicle-types'),
    ])
      .then(([dRes, vtRes]) => {
        setDepartments(dRes.departments);
        setVehicleTypes(vtRes.vehicleTypes.filter((t) => t.category !== 'Eksternal'));
        setForm((prev) => ({
          ...prev,
          department_id: prev.department_id || dRes.departments[0]?.department_id || '',
          requested_vehicle_type_id:
            prev.requested_vehicle_type_id || vtRes.vehicleTypes[0]?.vehicle_type_id || '',
        }));
      })
      .catch((err) => {
        notify(err instanceof Error ? err.message : 'Gagal memuat data referensi.', 'error');
      });
  }, [notify]);

  const submitForm = async (saveAsDraft: boolean) => {
    setSubmitting(true);
    try {
      const res = await apiRequest<{ booking: { booking_number: string } }>('/api/bookings/internal', {
        method: 'POST',
        body: JSON.stringify({ ...form, save_as_draft: saveAsDraft }),
      });
      notify(
        saveAsDraft
          ? `Draft ${res.booking.booking_number} berhasil disimpan.`
          : `Pengajuan ${res.booking.booking_number} berhasil dikirim ke General Affairs.`,
        'success'
      );
      navigate(user?.role === 'ADMIN' ? '/bookings/approval' : '/bookings/my');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal mengirim pengajuan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitForm(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 flex items-start gap-3 text-xs text-slate-700">
        <Info className="h-4 w-4 text-[#1755CE] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-900">Pengajuan Kendaraan Operasional Sekolah: </span>
          Anda cukup memilih jenis kendaraan dan kebutuhan penumpang. General Affairs (GA) akan
          menentukan nomor polisi dan pengemudi berdasarkan ketersediaan, jadwal, dan kelayakan teknis armada.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-[#1755CE]" />
            <span>Formulir Pemesanan Kendaraan Sekolah</span>
          </CardTitle>
          <CardDescription>
            Pemohon otomatis tercatat: {user?.name} ({user?.email}) · Zona Waktu WIB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Unit / Departemen</Label>
                <Select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  required
                >
                  <option value="">Pilih Unit / Departemen</option>
                  {departments.map((d) => (
                    <option key={d.department_id} value={d.department_id}>
                      {d.department_code} — {d.department_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Jenis Kendaraan Dibutuhkan</Label>
                <Select
                  value={form.requested_vehicle_type_id}
                  onChange={(e) => setForm({ ...form, requested_vehicle_type_id: e.target.value })}
                  required
                >
                  <option value="">Pilih Jenis Kendaraan</option>
                  {vehicleTypes.map((vt) => (
                    <option key={vt.vehicle_type_id} value={vt.vehicle_type_id}>
                      {vt.name} (Kapasitas ~{vt.default_capacity} kursi)
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nama Kegiatan</Label>
                <Input
                  value={form.activity_name}
                  onChange={(e) => setForm({ ...form, activity_name: e.target.value })}
                  placeholder="Contoh: Kunjungan Dinas Dinas Pendidikan / Lomba Siswa"
                  required
                />
              </div>
              <div>
                <Label>Jumlah Penumpang</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.passenger_count}
                  onChange={(e) => setForm({ ...form, passenger_count: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div>
              <Label>Tujuan Penggunaan</Label>
              <Textarea
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Jelaskan keperluan perjalanan dinas atau kegiatan sekolah..."
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Lokasi Keberangkatan</Label>
                <Input
                  value={form.departure_location}
                  onChange={(e) => setForm({ ...form, departure_location: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Lokasi Tujuan</Label>
                <Input
                  value={form.destination_location}
                  onChange={(e) => setForm({ ...form, destination_location: e.target.value })}
                  placeholder="Alamat atau nama lokasi tujuan"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tanggal & Jam Berangkat (WIB)</Label>
                <Input
                  type="datetime-local"
                  value={form.departure_at}
                  onChange={(e) => setForm({ ...form, departure_at: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Tanggal & Jam Kembali (WIB)</Label>
                <Input
                  type="datetime-local"
                  value={form.return_at}
                  onChange={(e) => setForm({ ...form, return_at: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Penanggung Jawab Kegiatan</Label>
                <Input
                  value={form.pic_name}
                  onChange={(e) => setForm({ ...form, pic_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Nomor Kontak / WhatsApp</Label>
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="0812-xxxx-xxxx"
                  required
                />
              </div>
              <div>
                <Label>Kebutuhan Pengemudi</Label>
                <Select
                  value={form.needs_driver ? 'yes' : 'no'}
                  onChange={(e) => setForm({ ...form, needs_driver: e.target.value === 'yes' })}
                >
                  <option value="yes">Butuh Pengemudi Sekolah</option>
                  <option value="no">Mengemudi Sendiri (PIC)</option>
                </Select>
              </div>
            </div>

            <div>
              <Label>Catatan Tambahan</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Kebutuhan bagasi, titik jemput tambahan, atau informasi khusus lainnya..."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void submitForm(true)}
              >
                Simpan sebagai Draft
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Mengirim Pengajuan...' : 'Ajukan ke General Affairs'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
