export type UserRole = 'ADMIN' | 'USER';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  adminRole?: string;
  department_id?: string;
  position?: string;
  phone?: string;
  picture?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'Super Admin' | 'GA Admin' | 'Fleet Manager';
  status: 'aktif' | 'nonaktif';
  created_at: string;
  last_login: string;
}

export interface SchoolUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  position: string;
  phone: string;
  status: 'aktif' | 'nonaktif';
  created_at: string;
  last_login: string;
}

export interface Department {
  department_id: string;
  department_code: string;
  department_name: string;
  category: 'Akademik' | 'Operasional' | 'Manajemen' | 'Lainnya';
  person_in_charge: string;
  email: string;
  phone: string;
  active_status: 'aktif' | 'nonaktif';
}

export interface VehicleType {
  vehicle_type_id: string;
  code: string;
  name: string;
  category: 'Internal' | 'Eksternal' | 'Keduanya';
  default_capacity: number;
  required_sim: string;
  description: string;
  active_status: 'aktif' | 'nonaktif';
}

export type VehicleAdminStatus = 'aktif' | 'tidak_aktif';
export type VehicleEligibilityStatus =
  | 'layak'
  | 'layak_dengan_catatan'
  | 'tidak_layak'
  | 'belum_diverifikasi';
export type VehicleUsageStatus = 'tersedia' | 'dijadwalkan' | 'dalam_perjalanan';

export interface Vehicle {
  vehicle_id: string;
  vehicle_code: string;
  vehicle_name: string;
  plate_number: string;
  brand: string;
  model: string;
  vehicle_type_id: string;
  manufacture_year: number;
  registration_year: number;
  color: string;
  chassis_number: string;
  engine_number: string;
  fuel_type: 'Bensin' | 'Solar' | 'Hybrid' | 'Listrik';
  transmission: 'Manual' | 'Otomatis';
  engine_capacity_cc: number;
  passenger_capacity: number;
  photo_url: string;
  managing_department_id: string;
  parking_location: string;
  // Ownership
  ownership_status: 'Milik Sekolah' | 'Hibah' | 'Sewa Jangka Panjang';
  purchase_date: string;
  purchase_price: number;
  school_asset_number: string;
  asset_notes: string;
  // Documents
  stnk_number: string;
  stnk_expiry: string;
  tax_due_date: string;
  kir_expiry: string;
  insurance_policy_number: string;
  insurance_expiry: string;
  drive_document_ref: string;
  // Operational
  last_odometer: number;
  last_service_date: string;
  last_service_odometer: number;
  next_service_date: string;
  service_interval_km: number;
  service_interval_months: number;
  primary_driver_id: string;
  condition_notes: string;
  // Three separated statuses (NEVER merged!)
  admin_status: VehicleAdminStatus;
  eligibility_status: VehicleEligibilityStatus;
  usage_status: VehicleUsageStatus;
  // Safety lock metadata
  safety_blocked: boolean;
  safety_block_reason: string;
  updated_at: string;
}

export interface Driver {
  driver_id: string;
  full_name: string;
  internal_id: string;
  phone: string;
  sim_type: 'SIM A' | 'SIM A Umum' | 'SIM B1' | 'SIM B1 Umum' | 'SIM B2' | 'SIM B2 Umum';
  sim_expiry: string;
  eligible_vehicle_type_ids: string[];
  active_status: 'aktif' | 'nonaktif';
  notes: string;
}

export interface Vendor {
  vendor_id: string;
  company_name: string;
  pic_name: string;
  phone: string;
  email: string;
  address: string;
  service_types: string[];
  active_status: 'aktif' | 'nonaktif';
  notes: string;
}

export interface VendorService {
  service_id: string;
  vendor_id: string;
  vehicle_type: string;
  seat_capacity: number;
  base_rate: number;
  facilities: string;
  notes: string;
}

export type InternalBookingStatus =
  | 'Draft'
  | 'Diajukan'
  | 'Dalam Review GA'
  | 'Perlu Revisi'
  | 'Disetujui'
  | 'Dijadwalkan'
  | 'Dalam Perjalanan'
  | 'Selesai'
  | 'Ditolak'
  | 'Dibatalkan';

export type ExternalBookingStatus =
  | 'Draft'
  | 'Diajukan'
  | 'Dalam Review GA'
  | 'Perlu Revisi'
  | 'Disetujui'
  | 'Pencarian Vendor'
  | 'Menunggu Penawaran'
  | 'Penawaran Diterima'
  | 'Vendor Dipilih'
  | 'Dipesan'
  | 'Dalam Perjalanan'
  | 'Selesai'
  | 'Ditolak'
  | 'Dibatalkan';

export type BookingStatus = InternalBookingStatus | ExternalBookingStatus;

export interface BookingApprovalTrace {
  actor_email: string;
  actor_name: string;
  timestamp: string;
  from_status: string;
  to_status: string;
  notes: string;
}

export interface Booking {
  booking_id: string;
  booking_number: string;
  booking_kind: 'INTERNAL' | 'EXTERNAL';
  submitted_at: string;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  department_id: string;
  activity_name: string;
  purpose: string;
  departure_location: string;
  destination_location: string;
  departure_at: string;
  return_at: string;
  // Internal specific
  passenger_count: number;
  requested_vehicle_type_id: string;
  needs_driver: boolean;
  pic_name: string;
  contact_phone: string;
  // External specific
  student_count: number;
  companion_count: number;
  external_vehicle_type: string;
  external_unit_count: number;
  facilities_needed: string;
  special_requirements: string;
  estimated_budget: number;
  // Common & workflow
  notes: string;
  status: BookingStatus;
  rejection_reason: string;
  revision_notes: string;
  // Allocation (multi-vehicle & driver supported)
  allocated_vehicle_ids: string[];
  allocated_driver_ids: string[];
  selected_quote_id: string;
  selected_vendor_id: string;
  // Audit trail
  approved_by: string;
  approved_at: string;
  approval_history: BookingApprovalTrace[];
  updated_at: string;
}

export interface VendorQuote {
  quote_id: string;
  booking_id: string;
  vendor_id: string;
  vehicle_type: string;
  capacity: number;
  unit_count: number;
  vehicle_year: number;
  rental_price: number;
  extra_cost: number;
  total_cost: number;
  facilities: string;
  valid_until: string;
  notes: string;
  // Verification checklist
  verify_vehicle_docs: boolean;
  verify_kir: boolean;
  verify_vehicle_condition: boolean;
  verify_driver_qualification: boolean;
  verify_safety_equipment: boolean;
  verify_school_policy: boolean;
  is_selected: boolean;
  created_at: string;
}

export type InspectionCategory =
  | 'A. Mesin'
  | 'B. Rem'
  | 'C. Ban'
  | 'D. Kelistrikan'
  | 'E. Interior'
  | 'F. Keselamatan'
  | 'G. Eksterior';

export type InspectionItemValue = 'Baik' | 'Perlu Perhatian' | 'Rusak' | 'Tidak Berlaku';

export interface InspectionTemplateItem {
  item_id: string;
  category: InspectionCategory;
  label: string;
  is_critical: boolean;
  order: number;
}

export interface InspectionTemplate {
  template_id: string;
  name: string;
  items: InspectionTemplateItem[];
  updated_at: string;
}

export interface InspectionItemResult {
  item_id: string;
  category: InspectionCategory;
  label: string;
  is_critical: boolean;
  value: InspectionItemValue;
  notes: string;
  photo_url: string;
  recommendation: string;
}

export interface Inspection {
  inspection_id: string;
  inspection_number: string;
  vehicle_id: string;
  plate_number: string;
  inspected_at: string;
  inspection_type:
    | 'Harian'
    | 'Mingguan'
    | 'Bulanan'
    | 'Sebelum Perjalanan'
    | 'Setelah Perjalanan'
    | 'Khusus';
  inspector_name: string;
  inspector_email: string;
  odometer: number;
  location: string;
  general_notes: string;
  photo_url: string;
  items: InspectionItemResult[];
  result: 'Layak Operasional' | 'Layak dengan Catatan' | 'Tidak Layak Operasional';
  status: 'Draft' | 'Submitted' | 'Reviewed';
  triggered_block: boolean;
  reviewed_by: string;
  reviewed_at: string;
}

export interface DamageReport {
  damage_report_id: string;
  report_number: string;
  vehicle_id: string;
  incident_date: string;
  reporter_name: string;
  reporter_email: string;
  source:
    | 'Hasil Inspeksi'
    | 'Laporan Pengemudi'
    | 'Laporan Administrator'
    | 'Kerusakan Saat Perjalanan'
    | 'Laporan Khusus';
  inspection_id: string;
  odometer: number;
  vehicle_part: string;
  description: string;
  priority: 'Rendah' | 'Sedang' | 'Tinggi' | 'Kritis';
  operational_impact: 'Masih Bisa Beroperasi' | 'Perlu Pembatasan' | 'Tidak Layak / Blokir';
  photo_url: string;
  notes: string;
  status: 'Terbuka' | 'Diproses Perbaikan' | 'Selesai';
  created_at: string;
}

export type RepairStatus =
  | 'Dilaporkan'
  | 'Dalam Pemeriksaan'
  | 'Menunggu Persetujuan GA'
  | 'Disetujui untuk Perbaikan'
  | 'Dalam Perbaikan'
  | 'Menunggu Suku Cadang'
  | 'Selesai Diperbaiki'
  | 'Verifikasi Hasil Perbaikan'
  | 'Ditutup';

export interface Repair {
  repair_id: string;
  repair_number: string;
  vehicle_id: string;
  damage_report_id: string;
  workshop_name: string;
  workshop_pic: string;
  entry_date: string;
  target_completion_date: string;
  actual_completion_date: string;
  diagnosis: string;
  work_details: string;
  spare_parts: string;
  estimated_cost: number;
  actual_cost: number;
  receipt_url: string;
  status: RepairStatus;
  pic_admin: string;
  approved_by: string;
  approved_at: string;
  verified_by: string;
  verified_at: string;
  blocks_vehicle: boolean;
  notes: string;
  change_log: { timestamp: string; actor: string; action: string; notes: string }[];
}

export type MaintenanceStatus =
  | 'Terjadwal'
  | 'Mendekati Jadwal'
  | 'Jatuh Tempo'
  | 'Terlambat'
  | 'Dalam Pengerjaan'
  | 'Selesai';

export interface MaintenancePlan {
  maintenance_plan_id: string;
  vehicle_id: string;
  maintenance_type:
    | 'Ganti oli mesin'
    | 'Filter oli'
    | 'Filter udara'
    | 'Pemeriksaan rem'
    | 'Pemeriksaan aki'
    | 'Servis AC'
    | 'Rotasi/ganti ban'
    | 'Servis berkala'
    | 'Pemeriksaan umum'
    | 'Perawatan lainnya';
  schedule_basis: 'Tanggal' | 'Kilometer' | 'Kombinasi';
  interval_months: number;
  interval_days: number;
  interval_km: number;
  last_service_date: string;
  last_service_odometer: number;
  next_target_date: string;
  next_target_km: number;
  status: MaintenanceStatus;
  reminder_stage: 'Aman' | '30 Hari' | '14 Hari' | '7 Hari' | 'Jatuh Tempo' | 'Terlambat';
  last_vendor: string;
  last_cost: number;
  notes: string;
  updated_at: string;
}

export type ExpenseCategory =
  | 'Servis berkala'
  | 'Perbaikan'
  | 'Suku cadang'
  | 'Pajak kendaraan'
  | 'KIR'
  | 'Asuransi'
  | 'Biaya operasional lainnya';

export interface Expense {
  expense_id: string;
  vehicle_id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  vendor_name: string;
  amount: number;
  reference_type: 'REPAIR' | 'MAINTENANCE' | 'MANUAL';
  reference_id: string;
  receipt_url: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface VehicleHistory {
  history_id: string;
  vehicle_id: string;
  occurred_at: string;
  activity_type:
    | 'Pendaftaran'
    | 'Master Data'
    | 'Penggunaan'
    | 'Inspeksi'
    | 'Kerusakan'
    | 'Persetujuan Perbaikan'
    | 'Pelaksanaan Perbaikan'
    | 'Servis Berkala'
    | 'Suku Cadang'
    | 'Dokumen'
    | 'Kelayakan'
    | 'Blokir/Pelepasan';
  actor_name: string;
  actor_email: string;
  summary: string;
  reference_id: string;
}

export interface NotificationItem {
  notification_id: string;
  recipient_email: string;
  recipient_role: 'ADMIN' | 'USER' | 'ALL_ADMINS';
  title: string;
  message: string;
  link: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  is_read: boolean;
  created_at: string;
}

export interface AppSettings {
  school_name: string;
  workspace_domain: string;
  timezone: string;
  booking_lead_time_hours: number;
  max_booking_days_ahead: number;
  auto_block_on_critical_inspection: boolean;
  require_post_trip_inspection: boolean;
  reminder_days_before: number[];
  doc_expiry_warning_days: number;
  notify_admin_on_new_booking: boolean;
  notify_user_on_status_change: boolean;
  updated_at: string;
}

export interface AuditLog {
  log_id: string;
  timestamp: string;
  actor_email: string;
  actor_name: string;
  actor_role: UserRole;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
}

export const INITIAL_INSPECTION_TEMPLATE_ITEMS: InspectionTemplateItem[] = [
  // A. Mesin
  { item_id: 'mesin-oli', category: 'A. Mesin', label: 'Oli mesin', is_critical: true, order: 1 },
  { item_id: 'mesin-coolant', category: 'A. Mesin', label: 'Air radiator / coolant', is_critical: true, order: 2 },
  { item_id: 'mesin-kebocoran', category: 'A. Mesin', label: 'Kebocoran cairan / oli', is_critical: true, order: 3 },
  { item_id: 'mesin-aki', category: 'A. Mesin', label: 'Aki / tegangan baterai', is_critical: false, order: 4 },
  { item_id: 'mesin-suara', category: 'A. Mesin', label: 'Suara mesin', is_critical: false, order: 5 },
  // B. Rem
  { item_id: 'rem-utama', category: 'B. Rem', label: 'Rem utama', is_critical: true, order: 6 },
  { item_id: 'rem-parkir', category: 'B. Rem', label: 'Rem parkir', is_critical: true, order: 7 },
  { item_id: 'rem-minyak', category: 'B. Rem', label: 'Minyak rem', is_critical: true, order: 8 },
  // C. Ban
  { item_id: 'ban-depan', category: 'C. Ban', label: 'Ban depan', is_critical: true, order: 9 },
  { item_id: 'ban-belakang', category: 'C. Ban', label: 'Ban belakang', is_critical: true, order: 10 },
  { item_id: 'ban-tekanan', category: 'C. Ban', label: 'Tekanan ban', is_critical: false, order: 11 },
  { item_id: 'ban-cadangan', category: 'C. Ban', label: 'Ban cadangan', is_critical: false, order: 12 },
  { item_id: 'ban-kaki', category: 'C. Ban', label: 'Kondisi kaki-kaki & suspensi', is_critical: true, order: 13 },
  // D. Kelistrikan
  { item_id: 'listrik-lampu-utama', category: 'D. Kelistrikan', label: 'Lampu utama', is_critical: true, order: 14 },
  { item_id: 'listrik-lampu-rem', category: 'D. Kelistrikan', label: 'Lampu rem', is_critical: true, order: 15 },
  { item_id: 'listrik-sein', category: 'D. Kelistrikan', label: 'Lampu sein', is_critical: true, order: 16 },
  { item_id: 'listrik-hazard', category: 'D. Kelistrikan', label: 'Lampu hazard', is_critical: false, order: 17 },
  { item_id: 'listrik-klakson', category: 'D. Kelistrikan', label: 'Klakson', is_critical: false, order: 18 },
  { item_id: 'listrik-wiper', category: 'D. Kelistrikan', label: 'Wiper', is_critical: false, order: 19 },
  // E. Interior
  { item_id: 'int-ac', category: 'E. Interior', label: 'AC & sirkulasi udara', is_critical: false, order: 20 },
  { item_id: 'int-sabuk', category: 'E. Interior', label: 'Sabuk pengaman', is_critical: true, order: 21 },
  { item_id: 'int-jok', category: 'E. Interior', label: 'Jok penumpang', is_critical: false, order: 22 },
  { item_id: 'int-kebersihan', category: 'E. Interior', label: 'Kebersihan kabin', is_critical: false, order: 23 },
  { item_id: 'int-pintu', category: 'E. Interior', label: 'Pintu & kunci', is_critical: true, order: 24 },
  { item_id: 'int-jendela', category: 'E. Interior', label: 'Jendela', is_critical: false, order: 25 },
  // F. Keselamatan
  { item_id: 'safe-apar', category: 'F. Keselamatan', label: 'APAR', is_critical: true, order: 26 },
  { item_id: 'safe-p3k', category: 'F. Keselamatan', label: 'Kotak P3K', is_critical: false, order: 27 },
  { item_id: 'safe-segitiga', category: 'F. Keselamatan', label: 'Segitiga pengaman', is_critical: false, order: 28 },
  { item_id: 'safe-dongkrak', category: 'F. Keselamatan', label: 'Dongkrak', is_critical: false, order: 29 },
  { item_id: 'safe-kunci-roda', category: 'F. Keselamatan', label: 'Kunci roda', is_critical: false, order: 30 },
  // G. Eksterior
  { item_id: 'ext-body', category: 'G. Eksterior', label: 'Body kendaraan', is_critical: false, order: 31 },
  { item_id: 'ext-kaca', category: 'G. Eksterior', label: 'Kaca depan & belakang', is_critical: true, order: 32 },
  { item_id: 'ext-spion', category: 'G. Eksterior', label: 'Spion kiri & kanan', is_critical: true, order: 33 },
  { item_id: 'ext-kebersihan', category: 'G. Eksterior', label: 'Kebersihan eksterior', is_critical: false, order: 34 },
];
