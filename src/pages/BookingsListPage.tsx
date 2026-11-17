import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bus,
  Car,
  CheckCircle2,
  Download,
  Eye,
  FileEdit,
  Plus,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { EnrichedBookingForPdf, exportBookingSlipPdf } from '../lib/pdfExport.ts';
import { formatDateTimeWib, formatIdr } from '../lib/utils.ts';
import {
  BookingStatus,
  Driver,
  Vehicle,
  Vendor,
  VendorQuote,
} from '../../shared/types.ts';
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

type ApprovalTab =
  | 'Semua Pengajuan'
  | 'Perlu Review'
  | 'Perlu Revisi'
  | 'Internal'
  | 'Eksternal'
  | 'Disetujui'
  | 'Ditolak'
  | 'Selesai';

const APPROVAL_TABS: ApprovalTab[] = [
  'Semua Pengajuan',
  'Perlu Review',
  'Perlu Revisi',
  'Internal',
  'Eksternal',
  'Disetujui',
  'Ditolak',
  'Selesai',
];

interface AllocatableVehicle extends Vehicle {
  booking_blockers: string[];
  is_allocatable: boolean;
}

interface AllocatableDriver extends Driver {
  booking_blockers: string[];
  is_allocatable: boolean;
}

export function BookingsListPage({
  mode = 'all',
}: {
  mode?: 'approval' | 'all' | 'my' | 'history';
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [bookings, setBookings] = useState<EnrichedBookingForPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ApprovalTab>(
    mode === 'approval' ? 'Perlu Review' : 'Semua Pengajuan'
  );

  // Detail & action modals
  const [selectedBooking, setSelectedBooking] = useState<EnrichedBookingForPdf | null>(null);
  const [quotes, setQuotes] = useState<(VendorQuote & { vendor_name?: string })[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  // Rejection / Revision / Transition modal
  const [transitionDialog, setTransitionDialog] = useState<{
    open: boolean;
    booking: EnrichedBookingForPdf | null;
    targetStatus: BookingStatus;
    notes: string;
    rejectionReason: string;
  }>({ open: false, booking: null, targetStatus: 'Disetujui', notes: '', rejectionReason: '' });

  // Vehicle & Driver Allocation modal (Admin)
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocVehicles, setAllocVehicles] = useState<AllocatableVehicle[]>([]);
  const [allocDrivers, setAllocDrivers] = useState<AllocatableDriver[]>([]);
  const [pickedVehicleIds, setPickedVehicleIds] = useState<string[]>([]);
  const [pickedDriverIds, setPickedDriverIds] = useState<string[]>([]);
  const [allocNotes, setAllocNotes] = useState('');

  // External Vendor Quote Modal (Admin)
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [quoteForm, setQuoteForm] = useState({
    vendor_id: '',
    vehicle_type: 'Big Bus',
    capacity: 50,
    unit_count: 1,
    vehicle_year: 2024,
    rental_price: 4500000,
    extra_cost: 0,
    facilities: 'AC, Sabuk Pengaman Tiap Kursi, APAR, P3K',
    valid_until: '',
    notes: '',
    verify_vehicle_docs: true,
    verify_kir: true,
    verify_vehicle_condition: true,
    verify_driver_qualification: true,
    verify_safety_equipment: true,
    verify_school_policy: true,
  });

  // User revision modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    activity_name: '',
    purpose: '',
    departure_location: '',
    destination_location: '',
    departure_at: '',
    return_at: '',
    passenger_count: 1,
    notes: '',
  });

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ bookings: EnrichedBookingForPdf[] }>('/api/bookings');
      setBookings(res.bookings);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memuat pengajuan.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const openDetail = async (b: EnrichedBookingForPdf) => {
    try {
      const res = await apiRequest<{
        booking: EnrichedBookingForPdf;
        quotes: (VendorQuote & { vendor_name?: string })[];
      }>(`/api/bookings/${b.booking_id}`);
      setSelectedBooking(res.booking);
      setQuotes(res.quotes || []);
      setDetailOpen(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memuat detail.', 'error');
    }
  };

  const openAllocationModal = async (b: EnrichedBookingForPdf) => {
    try {
      const q = new URLSearchParams({
        departure_at: b.departure_at,
        return_at: b.return_at,
        exclude_booking_id: b.booking_id,
      });
      const [vRes, dRes] = await Promise.all([
        apiRequest<{ vehicles: AllocatableVehicle[] }>(`/api/vehicles?${q.toString()}`),
        apiRequest<{ drivers: AllocatableDriver[] }>(`/api/drivers?${q.toString()}`),
      ]);
      setSelectedBooking(b);
      setAllocVehicles(vRes.vehicles);
      setAllocDrivers(dRes.drivers);
      setPickedVehicleIds(b.allocated_vehicle_ids || []);
      setPickedDriverIds(b.allocated_driver_ids || []);
      setAllocNotes('');
      setAllocOpen(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memuat ketersediaan armada.', 'error');
    }
  };

  const openQuoteModal = async (b: EnrichedBookingForPdf) => {
    try {
      const vRes = await apiRequest<{ vendors: Vendor[] }>('/api/vendors');
      const activeVendors = vRes.vendors.filter((v) => v.active_status === 'aktif');
      setVendors(activeVendors);
      setSelectedBooking(b);
      setQuoteForm((prev) => ({
        ...prev,
        vendor_id: activeVendors[0]?.vendor_id || '',
        vehicle_type: b.external_vehicle_type || 'Big Bus',
        unit_count: b.external_unit_count || 1,
      }));
      setQuoteModalOpen(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memuat daftar vendor.', 'error');
    }
  };

  const handleConfirmAllocation = async () => {
    if (!selectedBooking) return;
    try {
      const res = await apiRequest<{ booking: EnrichedBookingForPdf }>(
        `/api/bookings/${selectedBooking.booking_id}/allocate`,
        {
          method: 'POST',
          body: JSON.stringify({
            vehicle_ids: pickedVehicleIds,
            driver_ids: pickedDriverIds,
            notes: allocNotes,
          }),
        }
      );
      notify(`Alokasi untuk ${res.booking.booking_number} berhasil disimpan.`, 'success');
      setAllocOpen(false);
      setSelectedBooking(res.booking);
      await loadBookings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal mengalokasikan unit.', 'error');
    }
  };

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionDialog.booking) return;
    try {
      const res = await apiRequest<{ booking: EnrichedBookingForPdf }>(
        `/api/bookings/${transitionDialog.booking.booking_id}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({
            target_status: transitionDialog.targetStatus,
            notes: transitionDialog.notes,
            rejection_reason: transitionDialog.rejectionReason,
          }),
        }
      );
      notify(`Status ${res.booking.booking_number} diubah menjadi ${res.booking.status}.`, 'success');
      setTransitionDialog((prev) => ({ ...prev, open: false }));
      setSelectedBooking(res.booking);
      await loadBookings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memproses status.', 'error');
    }
  };

  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    try {
      await apiRequest(`/api/bookings/${selectedBooking.booking_id}/quotes`, {
        method: 'POST',
        body: JSON.stringify(quoteForm),
      });
      notify('Penawaran vendor berhasil dicatat.', 'success');
      setQuoteModalOpen(false);
      await openDetail(selectedBooking);
      await loadBookings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal mencatat penawaran.', 'error');
    }
  };

  const handleSelectVendor = async (quoteId: string, confirmBooked: boolean) => {
    if (!selectedBooking) return;
    try {
      const res = await apiRequest<{ booking: EnrichedBookingForPdf }>(
        `/api/bookings/${selectedBooking.booking_id}/select-vendor`,
        {
          method: 'POST',
          body: JSON.stringify({ quote_id: quoteId, confirm_booked: confirmBooked }),
        }
      );
      notify(`Vendor berhasil ditetapkan (${res.booking.status}).`, 'success');
      await openDetail(res.booking);
      await loadBookings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memilih vendor.', 'error');
    }
  };

  const openEditBooking = (b: EnrichedBookingForPdf) => {
    setSelectedBooking(b);
    setEditForm({
      activity_name: b.activity_name,
      purpose: b.purpose,
      departure_location: b.departure_location,
      destination_location: b.destination_location,
      departure_at: b.departure_at,
      return_at: b.return_at,
      passenger_count: b.passenger_count,
      notes: b.notes,
    });
    setEditModalOpen(true);
  };

  const handleSaveUserEdit = async (resubmit: boolean) => {
    if (!selectedBooking) return;
    try {
      await apiRequest(`/api/bookings/${selectedBooking.booking_id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editForm, resubmit }),
      });
      notify(resubmit ? 'Pengajuan dikirim ulang ke GA.' : 'Perubahan draft tersimpan.', 'success');
      setEditModalOpen(false);
      setDetailOpen(false);
      await loadBookings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui pengajuan.', 'error');
    }
  };

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (mode === 'history' && !['Selesai', 'Ditolak', 'Dibatalkan'].includes(b.status)) {
        return false;
      }
      if (mode === 'approval' || activeTab !== 'Semua Pengajuan') {
        if (activeTab === 'Perlu Review' && !['Diajukan', 'Dalam Review GA'].includes(b.status)) {
          return false;
        }
        if (activeTab === 'Perlu Revisi' && b.status !== 'Perlu Revisi') return false;
        if (activeTab === 'Internal' && b.booking_kind !== 'INTERNAL') return false;
        if (activeTab === 'Eksternal' && b.booking_kind !== 'EXTERNAL') return false;
        if (
          activeTab === 'Disetujui' &&
          !['Disetujui', 'Dijadwalkan', 'Vendor Dipilih', 'Dipesan', 'Dalam Perjalanan'].includes(b.status)
        ) {
          return false;
        }
        if (activeTab === 'Ditolak' && !['Ditolak', 'Dibatalkan'].includes(b.status)) return false;
        if (activeTab === 'Selesai' && b.status !== 'Selesai') return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          b.booking_number.toLowerCase().includes(q) ||
          b.activity_name.toLowerCase().includes(q) ||
          b.requester_name.toLowerCase().includes(q) ||
          (b.department_name || '').toLowerCase().includes(q) ||
          b.destination_location.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [bookings, activeTab, mode, search]);

  return (
    <div className="space-y-5">
      {/* Filter & Tabs Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {mode !== 'history' && (
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg">
            {APPROVAL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab
                    ? 'bg-white text-[#1755CE] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        <div className="relative w-full lg:w-72 ml-auto">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Cari no, kegiatan, pemohon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat daftar pengajuan...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Tidak ada pengajuan kendaraan yang sesuai filter saat ini.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nomor</th>
                  <th className="px-4 py-3 font-medium">Kegiatan & Rute</th>
                  <th className="px-4 py-3 font-medium">Pemohon & Unit</th>
                  <th className="px-4 py-3 font-medium">Jadwal (WIB)</th>
                  <th className="px-4 py-3 font-medium">Alokasi / Vendor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((b) => (
                  <tr key={b.booking_id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                      <div>{b.booking_number}</div>
                      <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                        {b.booking_kind === 'INTERNAL' ? 'Internal' : 'Eksternal'}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-900 truncate">{b.activity_name}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {b.departure_location} → {b.destination_location}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-slate-800">{b.requester_name}</div>
                      <div className="text-[11px] text-slate-500">{b.department_name || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      <div>{formatDateTimeWib(b.departure_at)}</div>
                      <div className="text-[11px] text-slate-400">s/d {formatDateTimeWib(b.return_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {b.booking_kind === 'INTERNAL' ? (
                        b.allocated_vehicles_summary && b.allocated_vehicles_summary.length > 0 ? (
                          <div>
                            <div className="font-medium">
                              {b.allocated_vehicles_summary.map((v) => v.plate_number).join(', ')}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {b.allocated_drivers_summary?.map((d) => d.full_name).join(', ') || 'Tanpa sopir'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Belum dialokasikan</span>
                        )
                      ) : (
                        <span>{b.selected_vendor_name || `${b.external_unit_count} x ${b.external_vehicle_type}`}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => void openDetail(b)}>
                          <Eye className="h-3.5 w-3.5" />
                          Detail
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exportBookingSlipPdf(b)}
                          title="Unduh Bukti Pemesanan PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Booking Detail & Workflow Drawer/Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          {selectedBooking && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-[#1755CE]">
                    {selectedBooking.booking_number}
                  </span>
                  <StatusLabel status={selectedBooking.status} />
                </div>
                <DialogTitle className="mt-1">{selectedBooking.activity_name}</DialogTitle>
                <DialogDescription>
                  {selectedBooking.requester_name} ({selectedBooking.requester_email}) ·{' '}
                  {selectedBooking.department_name}
                </DialogDescription>
              </DialogHeader>

              {selectedBooking.rejection_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <span className="font-semibold">Alasan Penolakan: </span>
                  {selectedBooking.rejection_reason}
                </div>
              )}

              {selectedBooking.revision_notes && selectedBooking.status === 'Perlu Revisi' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <span className="font-semibold">Catatan Revisi GA: </span>
                  {selectedBooking.revision_notes}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div>
                  <span className="text-slate-500">Keberangkatan:</span>{' '}
                  <span className="font-medium text-slate-900">{formatDateTimeWib(selectedBooking.departure_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Kembali:</span>{' '}
                  <span className="font-medium text-slate-900">{formatDateTimeWib(selectedBooking.return_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Rute:</span>{' '}
                  <span className="font-medium text-slate-900">
                    {selectedBooking.departure_location} → {selectedBooking.destination_location}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Penumpang:</span>{' '}
                  <span className="font-medium text-slate-900 tabular-nums">
                    {selectedBooking.passenger_count} orang
                    {selectedBooking.booking_kind === 'EXTERNAL'
                      ? ` (${selectedBooking.student_count} siswa + ${selectedBooking.companion_count} pendamping)`
                      : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">PIC / Kontak:</span>{' '}
                  <span className="font-medium text-slate-900">
                    {selectedBooking.pic_name} ({selectedBooking.contact_phone})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Kebutuhan Unit:</span>{' '}
                  <span className="font-medium text-slate-900">
                    {selectedBooking.booking_kind === 'INTERNAL'
                      ? selectedBooking.requested_vehicle_type_name
                      : `${selectedBooking.external_unit_count} x ${selectedBooking.external_vehicle_type}`}
                  </span>
                </div>
                {selectedBooking.allocated_vehicles_summary &&
                  selectedBooking.allocated_vehicles_summary.length > 0 && (
                    <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                      <span className="text-slate-500">Unit & Pengemudi Dialokasikan: </span>
                      <span className="font-semibold text-slate-900">
                        {selectedBooking.allocated_vehicles_summary
                          .map((v) => `${v.vehicle_name} (${v.plate_number})`)
                          .join(', ')}
                      </span>
                      {selectedBooking.allocated_drivers_summary &&
                        selectedBooking.allocated_drivers_summary.length > 0 && (
                          <span className="text-slate-700">
                            {' '}
                            · Pengemudi:{' '}
                            {selectedBooking.allocated_drivers_summary
                              .map((d) => `${d.full_name} (${d.phone})`)
                              .join(', ')}
                          </span>
                        )}
                    </div>
                  )}
              </div>

              {/* Admin Action Toolbar */}
              {isAdmin && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-700">Aksi Administrator General Affairs</div>
                  <div className="flex flex-wrap gap-2">
                    {['Diajukan', 'Dalam Review GA'].includes(selectedBooking.status) && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            setTransitionDialog({
                              open: true,
                              booking: selectedBooking,
                              targetStatus: 'Disetujui',
                              notes: 'Kebutuhan transportasi disetujui oleh GA.',
                              rejectionReason: '',
                            })
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Setujui Pengajuan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setTransitionDialog({
                              open: true,
                              booking: selectedBooking,
                              targetStatus: 'Perlu Revisi',
                              notes: '',
                              rejectionReason: '',
                            })
                          }
                        >
                          <FileEdit className="h-3.5 w-3.5" />
                          Minta Revisi
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            setTransitionDialog({
                              open: true,
                              booking: selectedBooking,
                              targetStatus: 'Ditolak',
                              notes: '',
                              rejectionReason: '',
                            })
                          }
                        >
                          Tolak
                        </Button>
                      </>
                    )}

                    {selectedBooking.booking_kind === 'INTERNAL' &&
                      !['Ditolak', 'Dibatalkan', 'Selesai', 'Draft'].includes(selectedBooking.status) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void openAllocationModal(selectedBooking)}
                        >
                          <Car className="h-3.5 w-3.5" />
                          {selectedBooking.allocated_vehicle_ids.length > 0
                            ? 'Ubah Alokasi Unit & Pengemudi'
                            : 'Tentukan Kendaraan & Pengemudi'}
                        </Button>
                      )}

                    {selectedBooking.booking_kind === 'EXTERNAL' &&
                      !['Ditolak', 'Dibatalkan', 'Selesai', 'Draft'].includes(selectedBooking.status) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void openQuoteModal(selectedBooking)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Catat Penawaran Vendor
                        </Button>
                      )}

                    {['Dijadwalkan', 'Dipesan'].includes(selectedBooking.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTransitionDialog({
                            open: true,
                            booking: selectedBooking,
                            targetStatus: 'Dalam Perjalanan',
                            notes: 'Kendaraan telah berangkat.',
                            rejectionReason: '',
                          })
                        }
                      >
                        Mulai Perjalanan
                      </Button>
                    )}

                    {['Dijadwalkan', 'Dipesan', 'Dalam Perjalanan'].includes(selectedBooking.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTransitionDialog({
                            open: true,
                            booking: selectedBooking,
                            targetStatus: 'Selesai',
                            notes: 'Perjalanan selesai.',
                            rejectionReason: '',
                          })
                        }
                      >
                        Tandai Selesai
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* User Owner Actions */}
              {!isAdmin && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  {['Draft', 'Perlu Revisi'].includes(selectedBooking.status) && (
                    <Button size="sm" onClick={() => openEditBooking(selectedBooking)}>
                      <FileEdit className="h-3.5 w-3.5" />
                      Revisi & Kirim Ulang
                    </Button>
                  )}
                  {!['Dalam Perjalanan', 'Selesai', 'Ditolak', 'Dibatalkan'].includes(
                    selectedBooking.status
                  ) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setTransitionDialog({
                          open: true,
                          booking: selectedBooking,
                          targetStatus: 'Dibatalkan',
                          notes: 'Dibatalkan oleh pemohon.',
                          rejectionReason: '',
                        })
                      }
                    >
                      Batalkan Pengajuan
                    </Button>
                  )}
                </div>
              )}

              {/* External Vendor Quotes Comparison Table (Admin Only) */}
              {isAdmin && selectedBooking.booking_kind === 'EXTERNAL' && (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Bus className="h-4 w-4 text-[#1755CE]" />
                      Perbandingan Penawaran Vendor ({quotes.length})
                    </h4>
                  </div>
                  {quotes.length === 0 ? (
                    <div className="text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg p-4 text-center">
                      Belum ada penawaran vendor tercatat. Gunakan tombol &ldquo;Catat Penawaran Vendor&rdquo;.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <tr>
                            <th className="p-2.5">Vendor & Unit</th>
                            <th className="p-2.5">Tahun / Kapasitas</th>
                            <th className="p-2.5">Total Biaya</th>
                            <th className="p-2.5">Verifikasi Keselamatan</th>
                            <th className="p-2.5 text-right">Pilih</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {quotes.map((q) => {
                            const verifiedAll =
                              q.verify_vehicle_docs &&
                              q.verify_vehicle_condition &&
                              q.verify_driver_qualification &&
                              q.verify_safety_equipment &&
                              q.verify_school_policy;
                            return (
                              <tr key={q.quote_id} className={q.is_selected ? 'bg-blue-50/60' : ''}>
                                <td className="p-2.5">
                                  <div className="font-semibold text-slate-900">{q.vendor_name}</div>
                                  <div className="text-slate-500">
                                    {q.unit_count} x {q.vehicle_type}
                                  </div>
                                  <div className="text-[11px] text-slate-400">{q.facilities}</div>
                                </td>
                                <td className="p-2.5 tabular-nums">
                                  {q.vehicle_year} · {q.capacity} kursi
                                </td>
                                <td className="p-2.5 font-semibold tabular-nums">
                                  {formatIdr(q.total_cost)}
                                </td>
                                <td className="p-2.5">
                                  {verifiedAll ? (
                                    <span className="text-emerald-700 font-medium">
                                      Lengkap (Dokumen, KIR, Pengemudi, Keselamatan)
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 font-medium">
                                      Verifikasi belum lengkap
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right space-x-1">
                                  {q.is_selected ? (
                                    <StatusLabel status={selectedBooking.status} />
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!verifiedAll}
                                      onClick={() => void handleSelectVendor(q.quote_id, true)}
                                    >
                                      Pilih & Pesan
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Approval Audit History */}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Riwayat Proses & Persetujuan</div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {selectedBooking.approval_history.map((h, i) => (
                    <div key={i} className="text-xs border-l-2 border-slate-200 pl-3 py-0.5">
                      <div className="font-medium text-slate-900">
                        {h.from_status} → {h.to_status}
                      </div>
                      <div className="text-slate-600">{h.notes}</div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {formatDateTimeWib(h.timestamp)} · {h.actor_name} ({h.actor_email})
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => exportBookingSlipPdf(selectedBooking)}>
                  <Download className="h-3.5 w-3.5" />
                  Unduh Bukti Pemesanan (PDF)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transition Confirmation Dialog */}
      <Dialog
        open={transitionDialog.open}
        onOpenChange={(o) => setTransitionDialog((p) => ({ ...p, open: o }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi Status: {transitionDialog.targetStatus}</DialogTitle>
            <DialogDescription>{transitionDialog.booking?.booking_number}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransitionSubmit} className="space-y-4">
            {transitionDialog.targetStatus === 'Ditolak' ? (
              <div>
                <Label>Alasan Penolakan (Wajib Diisi)</Label>
                <Textarea
                  value={transitionDialog.rejectionReason}
                  onChange={(e) =>
                    setTransitionDialog((p) => ({ ...p, rejectionReason: e.target.value }))
                  }
                  required
                  placeholder="Jelaskan alasan penolakan agar pemohon memahami tindak lanjutnya..."
                />
              </div>
            ) : (
              <div>
                <Label>Catatan</Label>
                <Textarea
                  value={transitionDialog.notes}
                  onChange={(e) => setTransitionDialog((p) => ({ ...p, notes: e.target.value }))}
                  required={transitionDialog.targetStatus === 'Perlu Revisi'}
                  placeholder="Catatan tambahan..."
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransitionDialog((p) => ({ ...p, open: false }))}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant={transitionDialog.targetStatus === 'Ditolak' ? 'destructive' : 'default'}
              >
                Konfirmasi
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Multi-Vehicle & Driver Allocation Modal (Integrated with TMS Blockers!) */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Alokasi Kendaraan & Pengemudi — {selectedBooking?.booking_number}</DialogTitle>
            <DialogDescription>
              Jadwal: {formatDateTimeWib(selectedBooking?.departure_at)} s/d{' '}
              {formatDateTimeWib(selectedBooking?.return_at)} · Kebutuhan:{' '}
              {selectedBooking?.passenger_count} penumpang
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <Label className="flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5 text-[#1755CE]" />
                Pilih Kendaraan Operasional Sekolah (Multi-unit didukung)
              </Label>
              <div className="space-y-2 max-h-60 overflow-y-auto border border-slate-200 rounded-lg p-2">
                {allocVehicles.map((v) => {
                  const checked = pickedVehicleIds.includes(v.vehicle_id);
                  return (
                    <label
                      key={v.vehicle_id}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-xs transition-colors ${
                        !v.is_allocatable
                          ? 'bg-red-50/50 border-red-200 opacity-75 cursor-not-allowed'
                          : checked
                          ? 'bg-blue-50 border-[#1755CE] cursor-pointer'
                          : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!v.is_allocatable}
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPickedVehicleIds([...pickedVehicleIds, v.vehicle_id]);
                          } else {
                            setPickedVehicleIds(pickedVehicleIds.filter((id) => id !== v.vehicle_id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {v.plate_number} — {v.vehicle_name} ({v.passenger_capacity} kursi)
                          </span>
                          <StatusLabel status={v.safety_blocked ? 'Diblokir' : v.eligibility_status} />
                        </div>
                        {!v.is_allocatable && (
                          <div className="mt-1 text-red-700 flex items-start gap-1">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{v.booking_blockers.join(' ')}</span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[#1755CE]" />
                Pilih Pengemudi {selectedBooking?.needs_driver ? '(Wajib)' : '(Opsional)'}
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2">
                {allocDrivers.map((d) => {
                  const checked = pickedDriverIds.includes(d.driver_id);
                  return (
                    <label
                      key={d.driver_id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                        !d.is_allocatable
                          ? 'bg-amber-50/60 border-amber-200 opacity-75 cursor-not-allowed'
                          : checked
                          ? 'bg-blue-50 border-[#1755CE] cursor-pointer'
                          : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!d.is_allocatable}
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPickedDriverIds([...pickedDriverIds, d.driver_id]);
                          } else {
                            setPickedDriverIds(pickedDriverIds.filter((id) => id !== d.driver_id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">
                          {d.full_name} · {d.sim_type} (Berlaku s/d {d.sim_expiry})
                        </div>
                        {!d.is_allocatable && (
                          <div className="text-amber-800 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>{d.booking_blockers.join(' ')}</span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Catatan Penugasan</Label>
              <Input
                value={allocNotes}
                onChange={(e) => setAllocNotes(e.target.value)}
                placeholder="Instruksi titik kumpul atau pengisian BBM..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setAllocOpen(false)}>
                Batal
              </Button>
              <Button type="button" onClick={() => void handleConfirmAllocation()}>
                Simpan Alokasi & Jadwalkan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* External Vendor Quote Modal */}
      <Dialog open={quoteModalOpen} onOpenChange={setQuoteModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Catat Penawaran Vendor — {selectedBooking?.booking_number}</DialogTitle>
            <DialogDescription>
              Lengkapi harga sewa, fasilitas, dan checklist verifikasi keselamatan vendor.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddQuote} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Vendor Transportasi</Label>
                <Select
                  value={quoteForm.vendor_id}
                  onChange={(e) => setQuoteForm({ ...quoteForm, vendor_id: e.target.value })}
                  required
                >
                  {vendors.map((v) => (
                    <option key={v.vendor_id} value={v.vendor_id}>
                      {v.company_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Jenis Unit Ditawarkan</Label>
                <Input
                  value={quoteForm.vehicle_type}
                  onChange={(e) => setQuoteForm({ ...quoteForm, vehicle_type: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Kapasitas Kursi</Label>
                <Input
                  type="number"
                  value={quoteForm.capacity}
                  onChange={(e) => setQuoteForm({ ...quoteForm, capacity: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Tahun Kendaraan</Label>
                <Input
                  type="number"
                  value={quoteForm.vehicle_year}
                  onChange={(e) => setQuoteForm({ ...quoteForm, vehicle_year: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Harga Sewa (IDR)</Label>
                <Input
                  type="number"
                  value={quoteForm.rental_price}
                  onChange={(e) => setQuoteForm({ ...quoteForm, rental_price: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Biaya Tambahan / Tol / Parkir (IDR)</Label>
                <Input
                  type="number"
                  value={quoteForm.extra_cost}
                  onChange={(e) => setQuoteForm({ ...quoteForm, extra_cost: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label>Fasilitas</Label>
              <Input
                value={quoteForm.facilities}
                onChange={(e) => setQuoteForm({ ...quoteForm, facilities: e.target.value })}
              />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
              <div className="text-xs font-semibold text-slate-800">Checklist Verifikasi Kelayakan Vendor</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  ['verify_vehicle_docs', 'Dokumen STNK & Izin Angkutan Sah'],
                  ['verify_kir', 'Uji KIR Masih Berlaku'],
                  ['verify_vehicle_condition', 'Kondisi Fisik Unit Layak'],
                  ['verify_driver_qualification', 'Kualifikasi & SIM Pengemudi Sesuai'],
                  ['verify_safety_equipment', 'Kelengkapan Keselamatan (APAR, P3K, Sabuk)'],
                  ['verify_school_policy', 'Memenuhi Kebijakan Keselamatan Sekolah'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(quoteForm[key as keyof typeof quoteForm])}
                      onChange={(e) =>
                        setQuoteForm({ ...quoteForm, [key]: e.target.checked })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setQuoteModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Penawaran</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* User Edit / Revision Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Revisi Pengajuan {selectedBooking?.booking_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nama Kegiatan</Label>
              <Input
                value={editForm.activity_name}
                onChange={(e) => setEditForm({ ...editForm, activity_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Tujuan</Label>
              <Textarea
                value={editForm.purpose}
                onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Lokasi Berangkat</Label>
                <Input
                  value={editForm.departure_location}
                  onChange={(e) => setEditForm({ ...editForm, departure_location: e.target.value })}
                />
              </div>
              <div>
                <Label>Lokasi Tujuan</Label>
                <Input
                  value={editForm.destination_location}
                  onChange={(e) => setEditForm({ ...editForm, destination_location: e.target.value })}
                />
              </div>
              <div>
                <Label>Waktu Berangkat</Label>
                <Input
                  type="datetime-local"
                  value={editForm.departure_at}
                  onChange={(e) => setEditForm({ ...editForm, departure_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Waktu Kembali</Label>
                <Input
                  type="datetime-local"
                  value={editForm.return_at}
                  onChange={(e) => setEditForm({ ...editForm, return_at: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => void handleSaveUserEdit(false)}>
                Simpan Draft
              </Button>
              <Button onClick={() => void handleSaveUserEdit(true)}>Kirim Ulang ke GA</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
