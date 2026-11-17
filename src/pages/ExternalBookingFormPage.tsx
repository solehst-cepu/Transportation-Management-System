import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bus, Info } from 'lucide-react';
import { StorageDiagnostics, useAuth } from '../context/AuthContext.tsx';
import { ApiError, apiRequest } from '../lib/api.ts';
import { Department, VehicleType } from '../../shared/types.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { Button } from '../components/ui/button.tsx';
import { useToast } from '../components/ui/toast.tsx';

export function ExternalBookingFormPage() {
  const { user, config, reauthorizeGoogleWorkspace } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [externalVehicleTypes, setExternalVehicleTypes] = useState<VehicleType[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    department_id: user?.department_id || '',
    activity_name: '',
    purpose: '',
    departure_at: '',
    return_at: '',
    departure_location: 'Kampus Lazuardi Cinere',
    destination_location: '',
    student_count: 30,
    companion_count: 4,
    external_vehicle_type: '',
    external_unit_count: 1,
    facilities_needed: 'AC, Sabuk Pengaman Tiap Kursi, APAR, P3K, Mic',
    special_requirements: '',
    estimated_budget: 5000000,
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
        const rentalTypes = vtRes.vehicleTypes.filter(
          (t) => t.active_status === 'aktif' && (t.category === 'Eksternal' || t.category === 'Keduanya')
        );
        setDepartments(dRes.departments);
        setExternalVehicleTypes(rentalTypes);
        setForm((prev) => ({
          ...prev,
          department_id: prev.department_id || dRes.departments[0]?.department_id || '',
          external_vehicle_type:
            prev.external_vehicle_type || rentalTypes[0]?.name || 'Big Bus',
          pic_name: prev.pic_name || user?.name || '',
          contact_phone: prev.contact_phone || user?.phone || '',
        }));
      })
      .catch((err) => {
        notify(err instanceof Error ? err.message : 'Gagal memuat data referensi.', 'error');
      });
  }, [notify, user?.name, user?.phone]);

  const totalPassengers = Number(form.student_count || 0) + Number(form.companion_count || 0);

  const durationText = (() => {
    if (!form.departure_at || !form.return_at) return '-';
    const diffMs = new Date(form.return_at).getTime() - new Date(form.departure_at).getTime();
    if (diffMs <= 0) return 'Waktu kembali harus lebih akhir';
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `${hours} jam`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days} hari ${remHours} jam`;
  })();

  const submitForm = async (saveAsDraft: boolean) => {
    setSubmitting(true);
    const sendRequest = (extraHeaders?: Record<string, string>) =>
      apiRequest<{ booking: { booking_number: string }; storage?: StorageDiagnostics }>(
        '/api/bookings/external',
        {
          method: 'POST',
          headers: extraHeaders,
          body: JSON.stringify({
            ...form,
            passenger_count: totalPassengers,
            save_as_draft: saveAsDraft,
          }),
        }
      );

    try {
      let res: { booking: { booking_number: string }; storage?: StorageDiagnostics };
      try {
        res = await sendRequest();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'GOOGLE_SHEETS_REAUTH_REQUIRED') {
          const freshToken = await reauthorizeGoogleWorkspace();
          if (!freshToken) {
            throw new Error(
              'Otorisasi Google Sheets dibatalkan. Permohonan sewa belum disimpan ke database.'
            );
          }
          res = await sendRequest({ 'X-Google-Access-Token': freshToken });
        } else {
          throw err;
        }
      }

      if (res.storage?.isEphemeralServerless) {
        notify(
          `Permohonan ${res.booking.booking_number} hanya tersimpan sementara di memori container Vercel (/tmp). Minta Admin GA mengaktifkan Google Sheets Service Account di Vercel agar data tersimpan permanen.`,
          'warning'
        );
      } else {
        notify(
          saveAsDraft
            ? `Draft ${res.booking.booking_number} tersimpan.`
            : `Permohonan sewa eksternal ${res.booking.booking_number} dikirim ke General Affairs.`,
          'success'
        );
      }
      navigate(
        user?.role === 'ADMIN'
          ? saveAsDraft
            ? '/bookings'
            : '/bookings/approval'
          : '/bookings/my'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal mengirim permohonan sewa.', 'error');
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
      {config?.storage.isEphemeralServerless && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Peringatan Penyimpanan Vercel: </span>
            Database Google Sheets terpusat belum dikonfigurasi pada server Vercel ini. Data yang
            dikirim belum dapat tersinkron antar akun User &amp; Admin sebelum Admin GA mengatur
            Environment Variables Google Sheets Service Account.
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 flex items-start gap-3 text-xs text-slate-700">
        <Info className="h-4 w-4 text-[#1755CE] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-900">Penyewaan Bus / Kendaraan Eksternal: </span>
          Pengajuan yang disetujui GA akan masuk ke tahap pencarian &amp; perbandingan penawaran vendor
          berdasarkan kelayakan dokumen, uji KIR, fasilitas keselamatan, dan biaya.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-[#1755CE]" />
            <span>Formulir Sewa Bus / Kendaraan Eksternal</span>
          </CardTitle>
          <CardDescription>
            Pemohon: {user?.name} ({user?.email}) · Durasi terhitung: {durationText}
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
                  <option value="">Pilih Unit</option>
                  {departments.map((d) => (
                    <option key={d.department_id} value={d.department_id}>
                      {d.department_code} — {d.department_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Nama Kegiatan</Label>
                <Input
                  value={form.activity_name}
                  onChange={(e) => setForm({ ...form, activity_name: e.target.value })}
                  placeholder="Contoh: Field Trip Kelas 5 / Outing Tahunan"
                  required
                />
              </div>
            </div>

            <div>
              <Label>Tujuan Kegiatan</Label>
              <Textarea
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Ringkasan tujuan edukatif atau agenda kegiatan..."
                required
              />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Lokasi Penjemputan</Label>
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
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Jumlah Siswa / Peserta</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.student_count}
                  onChange={(e) => setForm({ ...form, student_count: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Jumlah Pendamping</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.companion_count}
                  onChange={(e) => setForm({ ...form, companion_count: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Total Penumpang</Label>
                <Input value={`${totalPassengers} orang`} disabled className="font-semibold tabular-nums" />
              </div>
              <div>
                <Label>Estimasi Anggaran (IDR)</Label>
                <Input
                  type="number"
                  min={0}
                  step={50000}
                  value={form.estimated_budget}
                  onChange={(e) => setForm({ ...form, estimated_budget: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Jenis Kendaraan Sewa</Label>
                <Select
                  value={form.external_vehicle_type}
                  onChange={(e) => setForm({ ...form, external_vehicle_type: e.target.value })}
                  required
                >
                  {externalVehicleTypes.length === 0 ? (
                    <option value={form.external_vehicle_type || 'Big Bus'}>
                      {form.external_vehicle_type || 'Big Bus'}
                    </option>
                  ) : (
                    externalVehicleTypes.map((t) => (
                      <option key={t.vehicle_type_id} value={t.name}>
                        {t.name} ({t.default_capacity} kursi)
                      </option>
                    ))
                  )}
                </Select>
              </div>
              <div>
                <Label>Jumlah Kendaraan (Unit)</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={form.external_unit_count}
                  onChange={(e) => setForm({ ...form, external_unit_count: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Fasilitas yang Dibutuhkan</Label>
                <Input
                  value={form.facilities_needed}
                  onChange={(e) => setForm({ ...form, facilities_needed: e.target.value })}
                />
              </div>
              <div>
                <Label>Kebutuhan Khusus</Label>
                <Input
                  value={form.special_requirements}
                  onChange={(e) => setForm({ ...form, special_requirements: e.target.value })}
                  placeholder="Contoh: Kursi roda, bagasi alat musik, dll"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  required
                />
              </div>
            </div>

            <div>
              <Label>Catatan Tambahan</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                {submitting ? 'Mengirim...' : 'Ajukan Permohonan Sewa ke GA'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
