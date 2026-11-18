import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Booking, Expense, ExternalBudgetAttachment, Inspection, Vehicle } from '../../shared/types.ts';
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
    rows.push(['Vendor Terpilih', booking.selected_vendor_name || booking.external_budget_attachment?.vendor_name || 'Belum ditetapkan']);
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

export function exportExternalBudgetAttachmentPdf(
  booking: EnrichedBookingForPdf,
  attachmentInput?: ExternalBudgetAttachment
) {
  const att = attachmentInput || booking.external_budget_attachment;
  if (!att) return;

  const doc = new jsPDF();

  // Official Blue Header
  doc.setFillColor(23, 85, 206);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SEKOLAH LAZUARDI', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('LAMPIRAN PENGAJUAN ANGGARAN SEWA BUS / KENDARAAN EKSTERNAL', 14, 19);
  doc.setFontSize(8.5);
  doc.text(`Nomor Order: ${booking.booking_number}  |  Dicetak: ${formatDateTimeWib(new Date().toISOString())}`, 14, 25);

  // Section 1: Informasi Kegiatan & Pemohon
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('A. INFORMASI KEGIATAN & PEMOHON', 14, 38);

  autoTable(doc, {
    startY: 41,
    body: [
      ['Unit / Departemen', booking.department_name || '-', 'Pemohon / PIC', `${booking.requester_name} (${booking.contact_phone || '-'})`],
      ['Nama Kegiatan', booking.activity_name, 'Tujuan Kegiatan', booking.purpose || '-'],
      ['Rute Perjalanan', `${booking.departure_location} -> ${booking.destination_location}`, 'Peserta', `${booking.passenger_count} orang (${booking.student_count} siswa + ${booking.companion_count} pendamping)`],
      ['Waktu Berangkat', formatDateTimeWib(booking.departure_at), 'Waktu Kembali', formatDateTimeWib(booking.return_at)],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [15, 23, 42] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 33 },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      3: { cellWidth: 55 },
    },
  });

  const afterActivityY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 95;

  // Section 2: Pilihan Kendaraan & Catatan Admin GA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('B. PILIHAN KENDARAAN & CATATAN PENAWARAN VENDOR', 14, afterActivityY + 8);

  autoTable(doc, {
    startY: afterActivityY + 11,
    body: [
      ['Vendor Penyedia', att.vendor_name || booking.selected_vendor_name || '-'],
      ['Pilihan Kendaraan Digunakan', `${att.vehicle_choice} (Kapasitas ${att.vehicle_capacity} kursi · Tahun ${att.vehicle_year})`],
      ['Jumlah Unit Disewa', `${att.unit_count} unit bis / kendaraan`],
      ['Catatan Pilihan & Pertimbangan GA', att.admin_notes || '-'],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.8, textColor: [15, 23, 42] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 55 },
      1: { cellWidth: 125 },
    },
  });

  const afterVehicleY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 140;

  // Section 3: Rincian Anggaran Biaya (sesuai jumlah unit/bis)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`C. RINCIAN PENGAJUAN ANGGARAN BIAYA (${att.unit_count} UNIT / BIS)`, 14, afterVehicleY + 8);

  const unitCount = Math.max(1, Number(att.unit_count || 1));
  const rentalUnit = Number(att.rental_price_per_unit || 0);
  const tollUnit = Number(att.toll_cost_per_unit || 0);
  const parkingUnit = Number(att.parking_cost_per_unit || 0);
  const portalUnit = Number(att.portal_cost_per_unit || 0);
  const lunchUnit = Number(att.lunch_cost_per_unit || 0);

  const totalRental = rentalUnit * unitCount;
  const totalToll = tollUnit * unitCount;
  const totalParking = parkingUnit * unitCount;
  const totalPortal = portalUnit * unitCount;
  const totalLunch = lunchUnit * unitCount;
  const grandTotal = totalRental + totalToll + totalParking + totalPortal + totalLunch;

  autoTable(doc, {
    startY: afterVehicleY + 11,
    head: [['No', 'Komponen Biaya', 'Biaya per Bis / Unit', 'Jumlah Sewa', 'Subtotal (IDR)']],
    body: [
      ['1', `Biaya Sewa Kendaraan (${att.vehicle_choice})`, formatIdr(rentalUnit), `${unitCount} unit`, formatIdr(totalRental)],
      ['2', 'Biaya Tol (PP / Rute Kegiatan)', formatIdr(tollUnit), `${unitCount} unit`, formatIdr(totalToll)],
      ['3', 'Biaya Parkir Lokasi / Wisata', formatIdr(parkingUnit), `${unitCount} unit`, formatIdr(totalParking)],
      ['4', 'Biaya Portal / Retribusi Kawasan', formatIdr(portalUnit), `${unitCount} unit`, formatIdr(totalPortal)],
      ['5', 'Biaya Makan Siang Kru / Pengemudi', formatIdr(lunchUnit), `${unitCount} unit`, formatIdr(totalLunch)],
    ],
    foot: [['', 'TOTAL PENGAJUAN ANGGARAN', '', `${unitCount} unit`, formatIdr(grandTotal)]],
    headStyles: { fillColor: [23, 85, 206], textColor: 255, fontSize: 8.5 },
    footStyles: { fillColor: [239, 246, 255], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9.5 },
    styles: { fontSize: 8.5, cellPadding: 2.8, textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { cellWidth: 66 },
      2: { halign: 'right', cellWidth: 38 },
      3: { halign: 'center', cellWidth: 24 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
    },
  });

  let sigY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 205) + 10;
  if (sigY > 235) {
    doc.addPage();
    sigY = 20;
  }

  // Section 4: Blok Otorisasi Admin & Persetujuan Manajemen
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, sigY, 86, 48, 2, 2, 'FD');
  doc.roundedRect(110, sigY, 86, 48, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Diotorisasi Oleh (General Affairs Admin):', 18, sigY + 6);
  doc.text('Mengetahui / Menyetujui (Atasan / Manajemen):', 114, sigY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    `Tanggal: ${att.authorized_at ? formatDateTimeWib(att.authorized_at) : formatDateTimeWib(new Date().toISOString())}`,
    18,
    sigY + 11
  );
  doc.text('Tanggal: ................................................', 114, sigY + 11);

  if (att.signature_data_url && /^data:image\/(png|jpeg|jpg);base64,/i.test(att.signature_data_url)) {
    try {
      const format = att.signature_data_url.includes('image/jpeg') || att.signature_data_url.includes('image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(att.signature_data_url, format, 22, sigY + 13, 56, 18.6);
    } catch {
      doc.setTextColor(148, 163, 184);
      doc.text('[Tanda tangan digital terlampir]', 22, sigY + 24);
    }
  } else {
    doc.setTextColor(148, 163, 184);
    doc.text('[Belum ada tanda tangan digital]', 22, sigY + 24);
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(18, sigY + 34, 96, sigY + 34);
  doc.line(114, sigY + 34, 192, sigY + 34);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(att.authorized_by_name || 'Administrator GA', 18, sigY + 39);
  doc.text('( ........................................... )', 114, sigY + 39);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${att.authorized_by_role || 'GA Admin'} · ${att.authorized_by_email || ''}`, 18, sigY + 44);
  doc.text('Pimpinan Sekolah / Manajemen Keuangan', 114, sigY + 44);

  doc.save(`${booking.booking_number}_Lampiran_Anggaran_Bus.pdf`);
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
