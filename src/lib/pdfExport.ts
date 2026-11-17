import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Booking, Expense, Inspection, Vehicle } from '../../shared/types.ts';
import { formatDateTimeWib, formatDateWib, formatIdr } from './utils.ts';

export interface EnrichedBookingForPdf extends Booking {
  department_name?: string;
  requested_vehicle_type_name?: string;
  allocated_vehicles_summary?: { vehicle_name: string; plate_number: string }[];
  allocated_drivers_summary?: { full_name: string; phone: string }[];
  selected_vendor_name?: string;
}

export function exportBookingSlipPdf(booking: EnrichedBookingForPdf) {
  const doc = new jsPDF();

  doc.setFillColor(23, 85, 206);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('SEKOLAH LAZUARDI', 14, 12);
  doc.setFontSize(10);
  doc.text('Bukti Pemesanan Kendaraan & Transportasi (LVBMS)', 14, 19);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(`Nomor Pengajuan: ${booking.booking_number}`, 14, 38);
  doc.setFontSize(10);
  doc.text(`Status Saat Ini: ${booking.status}`, 14, 44);
  doc.text(`Jenis Layanan: ${booking.booking_kind === 'INTERNAL' ? 'Kendaraan Operasional Sekolah' : 'Sewa Bus / Kendaraan Eksternal'}`, 14, 50);

  const rows: [string, string][] = [
    ['Pemohon', `${booking.requester_name} (${booking.requester_email})`],
    ['Unit / Departemen', booking.department_name || '-'],
    ['Nama Kegiatan', booking.activity_name],
    ['Tujuan Penggunaan', booking.purpose || '-'],
    ['Lokasi Keberangkatan', booking.departure_location || '-'],
    ['Lokasi Tujuan', booking.destination_location || '-'],
    ['Waktu Berangkat', formatDateTimeWib(booking.departure_at)],
    ['Waktu Kembali', formatDateTimeWib(booking.return_at)],
    ['Jumlah Penumpang', `${booking.passenger_count} orang`],
    ['Penanggung Jawab / Kontak', `${booking.pic_name} (${booking.contact_phone || '-'})`],
  ];

  if (booking.booking_kind === 'INTERNAL') {
    const vehText =
      booking.allocated_vehicles_summary && booking.allocated_vehicles_summary.length > 0
        ? booking.allocated_vehicles_summary.map((v) => `${v.vehicle_name} (${v.plate_number})`).join(', ')
        : 'Belum dialokasikan';
    const drvText =
      booking.allocated_drivers_summary && booking.allocated_drivers_summary.length > 0
        ? booking.allocated_drivers_summary.map((d) => `${d.full_name} (${d.phone})`).join(', ')
        : booking.needs_driver
        ? 'Menunggu penugasan pengemudi'
        : 'Tanpa pengemudi sekolah';
    rows.push(['Kendaraan Dialokasikan', vehText]);
    rows.push(['Pengemudi Bertugas', drvText]);
  } else {
    rows.push(['Jenis & Jumlah Unit Sewa', `${booking.external_unit_count} x ${booking.external_vehicle_type}`]);
    rows.push(['Vendor Terpilih', booking.selected_vendor_name || 'Belum ditetapkan']);
  }

  autoTable(doc, {
    startY: 56,
    head: [['Informasi Pemesanan', 'Detail']],
    body: rows,
    headStyles: { fillColor: [23, 85, 206] },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 160;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak pada ${formatDateTimeWib(new Date().toISOString())} · Disetujui oleh: ${booking.approved_by || 'General Affairs'}`, 14, finalY + 12);

  doc.save(`${booking.booking_number}_Bukti_Pemesanan.pdf`);
}

export function exportInspectionPdf(inspection: Inspection, vehicleName: string) {
  const doc = new jsPDF();
  doc.setFillColor(23, 85, 206);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('LAPORAN INSPEKSI KENDARAAN SEKOLAH LAZUARDI', 14, 12);
  doc.setFontSize(9);
  doc.text(`No. Inspeksi: ${inspection.inspection_number} · Tanggal: ${formatDateTimeWib(inspection.inspected_at)}`, 14, 19);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`Kendaraan: ${vehicleName} (${inspection.plate_number})`, 14, 35);
  doc.text(`Jenis: ${inspection.inspection_type} · Pemeriksa: ${inspection.inspector_name} · Odometer: ${inspection.odometer.toLocaleString('id-ID')} km`, 14, 41);
  doc.text(`Hasil Evaluasi: ${inspection.result}${inspection.triggered_block ? ' [BLOKIR OPERASIONAL AKTIF]' : ''}`, 14, 47);

  autoTable(doc, {
    startY: 53,
    head: [['Kategori', 'Item Pemeriksaan', 'Kritis', 'Hasil', 'Catatan']],
    body: inspection.items.map((item) => [
      item.category,
      item.label,
      item.is_critical ? 'Ya' : 'Tidak',
      item.value,
      item.notes || '-',
    ]),
    headStyles: { fillColor: [23, 85, 206] },
    styles: { fontSize: 8, cellPadding: 2.5 },
  });

  doc.save(`${inspection.inspection_number}_${inspection.plate_number.replace(/\s+/g, '_')}.pdf`);
}

export function exportExpensesExcel(expenses: Expense[], vehicles: Vehicle[]) {
  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const rows = expenses.map((e) => {
    const v = vehMap.get(e.vehicle_id);
    return {
      Tanggal: e.expense_date,
      'No. Polisi': v?.plate_number || '-',
      Kendaraan: v?.vehicle_name || '-',
      Kategori: e.category,
      Deskripsi: e.description,
      'Bengkel / Vendor': e.vendor_name,
      'Nominal (IDR)': Number(e.amount || 0),
      Sumber: e.reference_type,
      Catatan: e.notes,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Biaya Operasional');
  XLSX.writeFile(wb, `LVBMS_Biaya_Operasional_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportExpensesPdf(expenses: Expense[], vehicles: Vehicle[]) {
  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const doc = new jsPDF('landscape');
  doc.setFillColor(23, 85, 206);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('LAPORAN BIAYA OPERASIONAL ARMADA — SEKOLAH LAZUARDI', 14, 14);

  autoTable(doc, {
    startY: 28,
    head: [['Tanggal', 'Kendaraan', 'Kategori', 'Deskripsi', 'Vendor/Bengkel', 'Jumlah']],
    body: expenses.map((e) => {
      const v = vehMap.get(e.vehicle_id);
      return [
        formatDateWib(e.expense_date),
        v ? `${v.plate_number} — ${v.vehicle_name}` : '-',
        e.category,
        e.description,
        e.vendor_name || '-',
        formatIdr(e.amount),
      ];
    }),
    headStyles: { fillColor: [23, 85, 206] },
    styles: { fontSize: 8 },
  });

  doc.save(`LVBMS_Laporan_Biaya_${new Date().toISOString().slice(0, 10)}.pdf`);
}
