import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs';
import path from 'path';
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import {
  AdminUser,
  AppSettings,
  AuditLog,
  Booking,
  DamageReport,
  Department,
  Driver,
  Expense,
  INITIAL_INSPECTION_TEMPLATE_ITEMS,
  Inspection,
  InspectionTemplate,
  MaintenancePlan,
  NotificationItem,
  Repair,
  SchoolUser,
  Vehicle,
  VehicleHistory,
  VehicleType,
  Vendor,
  VendorQuote,
  VendorService,
} from '../shared/types.ts';

export interface DatabaseSnapshot {
  ADMIN_USERS: AdminUser[];
  USERS: SchoolUser[];
  DEPARTMENTS: Department[];
  VEHICLE_TYPES: VehicleType[];
  VEHICLES: Vehicle[];
  DRIVERS: Driver[];
  VENDORS: Vendor[];
  VENDOR_SERVICES: VendorService[];
  BOOKINGS: Booking[];
  VENDOR_QUOTES: VendorQuote[];
  INSPECTION_TEMPLATES: InspectionTemplate[];
  INSPECTIONS: Inspection[];
  DAMAGE_REPORTS: DamageReport[];
  REPAIRS: Repair[];
  MAINTENANCE_PLANS: MaintenancePlan[];
  EXPENSES: Expense[];
  VEHICLE_HISTORY: VehicleHistory[];
  NOTIFICATIONS: NotificationItem[];
  SETTINGS: AppSettings[];
  AUDIT_LOGS: AuditLog[];
}

export type SheetKey = keyof DatabaseSnapshot;

export const SHEET_KEYS: SheetKey[] = [
  'ADMIN_USERS',
  'USERS',
  'DEPARTMENTS',
  'VEHICLE_TYPES',
  'VEHICLES',
  'DRIVERS',
  'VENDORS',
  'VENDOR_SERVICES',
  'BOOKINGS',
  'VENDOR_QUOTES',
  'INSPECTION_TEMPLATES',
  'INSPECTIONS',
  'DAMAGE_REPORTS',
  'REPAIRS',
  'MAINTENANCE_PLANS',
  'EXPENSES',
  'VEHICLE_HISTORY',
  'NOTIFICATIONS',
  'SETTINGS',
  'AUDIT_LOGS',
];

const oauthTokenStorage = new AsyncLocalStorage<string | null>();

export function runWithGoogleOAuthToken<T>(token: string | null, fn: () => T): T {
  return oauthTokenStorage.run(token, fn);
}

export interface ConnectedSheetMeta {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  connectedAt: string;
  connectedBy: string;
  lastSyncAt: string;
  lastAuthExpired?: boolean;
}

function nowWibIso(): string {
  return new Date().toISOString();
}

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function createInitialSeed(): DatabaseSnapshot {
  const initialAdminsEnv = (process.env.INITIAL_ADMIN_EMAILS || 'soleh.st@lazuardi.sch.id')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const now = nowWibIso();

  const deptTK = 'dept-tk-001';
  const deptSD = 'dept-sd-002';
  const deptSMP = 'dept-smp-003';
  const deptGA = 'dept-ga-004';
  const deptFin = 'dept-fin-005';
  const deptHRD = 'dept-hrd-006';
  const deptIT = 'dept-it-007';
  const deptMgmt = 'dept-mgmt-008';

  const typeMPV = 'vtype-mpv-001';
  const typeVan = 'vtype-van-002';
  const typeMedBus = 'vtype-mbus-003';
  const typeBigBus = 'vtype-bbus-004';

  const drv1 = 'drv-001';
  const drv2 = 'drv-002';
  const drv3 = 'drv-003';

  const veh1 = 'veh-001';
  const veh2 = 'veh-002';
  const veh3 = 'veh-003';
  const veh4 = 'veh-004';

  const vendor1 = 'vnd-001';
  const vendor2 = 'vnd-002';

  const booking1 = 'bkg-001';
  const booking2 = 'bkg-002';
  const booking3 = 'bkg-003';

  return {
    ADMIN_USERS: initialAdminsEnv.map((email, idx) => ({
      id: `adm-${idx + 1}`,
      name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      email,
      role: idx === 0 ? 'Super Admin' : 'GA Admin',
      status: 'aktif',
      created_at: now,
      last_login: now,
    })),
    USERS: [
      {
        id: 'usr-001',
        name: 'Nadia Putri, S.Pd',
        email: 'nadia.putri@lazuardi.sch.id',
        department_id: deptSD,
        position: 'Koordinator Kesiswaan Elementary',
        phone: '0812-8834-2100',
        status: 'aktif',
        created_at: now,
        last_login: now,
      },
      {
        id: 'usr-002',
        name: 'Rizky Pratama, M.Pd',
        email: 'rizky.pratama@lazuardi.sch.id',
        department_id: deptSMP,
        position: 'Wakil Kepala SMP Bidang Kesiswaan',
        phone: '0813-9901-4420',
        status: 'aktif',
        created_at: now,
        last_login: now,
      },
    ],
    DEPARTMENTS: [
      {
        department_id: deptTK,
        department_code: 'TK',
        department_name: 'Taman Kanak-Kanak (TK)',
        category: 'Akademik',
        person_in_charge: 'Ibu Ratna Sari',
        email: 'tk@lazuardi.sch.id',
        phone: '021-7540101',
        active_status: 'aktif',
      },
      {
        department_id: deptSD,
        department_code: 'SD',
        department_name: 'Elementary (SD)',
        category: 'Akademik',
        person_in_charge: 'Bapak Hendra Wijaya',
        email: 'elementary@lazuardi.sch.id',
        phone: '021-7540102',
        active_status: 'aktif',
      },
      {
        department_id: deptSMP,
        department_code: 'SMP',
        department_name: 'Junior High (SMP)',
        category: 'Akademik',
        person_in_charge: 'Bapak Rizky Pratama',
        email: 'juniorhigh@lazuardi.sch.id',
        phone: '021-7540103',
        active_status: 'aktif',
      },
      {
        department_id: deptGA,
        department_code: 'GA',
        department_name: 'General Affairs (GA)',
        category: 'Operasional',
        person_in_charge: 'Bagian Umum & Transportasi',
        email: 'ga@lazuardi.sch.id',
        phone: '021-7540104',
        active_status: 'aktif',
      },
      {
        department_id: deptFin,
        department_code: 'FIN',
        department_name: 'Finance & Accounting',
        category: 'Operasional',
        person_in_charge: 'Ibu Amelia Hartono',
        email: 'finance@lazuardi.sch.id',
        phone: '021-7540105',
        active_status: 'aktif',
      },
      {
        department_id: deptHRD,
        department_code: 'HRD',
        department_name: 'Human Resources (HRD)',
        category: 'Operasional',
        person_in_charge: 'Ibu Dewi Lestari',
        email: 'hrd@lazuardi.sch.id',
        phone: '021-7540106',
        active_status: 'aktif',
      },
      {
        department_id: deptIT,
        department_code: 'IT',
        department_name: 'Information Technology (IT)',
        category: 'Operasional',
        person_in_charge: 'Bapak Dimas Saputra',
        email: 'it@lazuardi.sch.id',
        phone: '021-7540107',
        active_status: 'aktif',
      },
      {
        department_id: deptMgmt,
        department_code: 'MGT',
        department_name: 'Manajemen Sekolah',
        category: 'Manajemen',
        person_in_charge: 'Direktur Pendidikan',
        email: 'management@lazuardi.sch.id',
        phone: '021-7540108',
        active_status: 'aktif',
      },
    ],
    VEHICLE_TYPES: [
      // Kendaraan Operasional Sekolah (Internal)
      {
        vehicle_type_id: typeMPV,
        code: 'MPV',
        name: 'MPV Operasional (7 Seat)',
        category: 'Internal',
        default_capacity: 7,
        required_sim: 'SIM A',
        description: 'Kendaraan operasional harian sekolah untuk kunjungan dinas dan logistik ringan.',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: typeVan,
        code: 'VAN',
        name: 'Minibus / Hiace Commuter (14 Seat)',
        category: 'Internal',
        default_capacity: 14,
        required_sim: 'SIM A Umum',
        description: 'Minibus sekolah untuk lomba, kunjungan edukatif, dan antar-jemput.',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: typeMedBus,
        code: 'MBUS',
        name: 'Medium Bus Sekolah (30 Seat)',
        category: 'Internal',
        default_capacity: 30,
        required_sim: 'SIM B1 Umum',
        description: 'Bus sedang operasional milik sekolah untuk field trip kelas.',
        active_status: 'aktif',
      },
      // Kendaraan Sewa / Bus Eksternal (Eksternal)
      {
        vehicle_type_id: typeBigBus,
        code: 'SEWA-BBUS',
        name: 'Big Bus',
        category: 'Eksternal',
        default_capacity: 50,
        required_sim: 'SIM B2 Umum',
        description: 'Bus besar sewa eksternal (45–59 kursi) untuk studi wisata tingkat atau acara besar.',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: 'vtype-ext-mbus-005',
        code: 'SEWA-MBUS',
        name: 'Medium Bus',
        category: 'Eksternal',
        default_capacity: 30,
        required_sim: 'SIM B1 Umum',
        description: 'Bus sedang sewa eksternal (25–33 kursi) untuk rombongan menengah.',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: 'vtype-ext-mini-006',
        code: 'SEWA-MINI',
        name: 'Minibus',
        category: 'Eksternal',
        default_capacity: 19,
        required_sim: 'SIM B1 Umum',
        description: 'Minibus sewa eksternal (Elf Long / 16–20 kursi).',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: 'vtype-ext-hiace-007',
        code: 'SEWA-HIACE',
        name: 'Hiace/sejenis',
        category: 'Eksternal',
        default_capacity: 14,
        required_sim: 'SIM A Umum',
        description: 'Toyota Hiace Commuter/Premio atau sejenis sewa eksternal (10–14 kursi).',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: 'vtype-ext-mpv-008',
        code: 'SEWA-MPV',
        name: 'Mobil penumpang',
        category: 'Eksternal',
        default_capacity: 7,
        required_sim: 'SIM A',
        description: 'Mobil MPV / sedan sewa eksternal untuk tamu atau tim kecil.',
        active_status: 'aktif',
      },
      {
        vehicle_type_id: 'vtype-ext-other-009',
        code: 'SEWA-LAIN',
        name: 'Lainnya',
        category: 'Eksternal',
        default_capacity: 10,
        required_sim: 'SIM A',
        description: 'Jenis kendaraan sewa eksternal khusus lainnya sesuai kebutuhan kegiatan.',
        active_status: 'aktif',
      },
    ],
    DRIVERS: [
      {
        driver_id: drv1,
        full_name: 'Ahmad Subagyo',
        internal_id: 'DRV-LZ-01',
        phone: '0812-3401-9910',
        sim_type: 'SIM B1 Umum',
        sim_expiry: daysFromNowIso(420),
        eligible_vehicle_type_ids: [typeMPV, typeVan, typeMedBus],
        active_status: 'aktif',
        notes: 'Pengemudi senior operasional bus dan MPV.',
      },
      {
        driver_id: drv2,
        full_name: 'Budi Santoso',
        internal_id: 'DRV-LZ-02',
        phone: '0813-8820-4511',
        sim_type: 'SIM A Umum',
        sim_expiry: daysFromNowIso(280),
        eligible_vehicle_type_ids: [typeMPV, typeVan],
        active_status: 'aktif',
        notes: 'Pengemudi utama Hiace Commuter dan Innova.',
      },
      {
        driver_id: drv3,
        full_name: 'Slamet Riyadi',
        internal_id: 'DRV-LZ-03',
        phone: '0815-1102-7732',
        sim_type: 'SIM A',
        sim_expiry: daysFromNowIso(150),
        eligible_vehicle_type_ids: [typeMPV],
        active_status: 'aktif',
        notes: 'Pengemudi operasional tamu dan dinas manajemen.',
      },
    ],
    VEHICLES: [
      {
        vehicle_id: veh1,
        vehicle_code: 'LZ-OPR-01',
        vehicle_name: 'Toyota Innova Zenix 2.0 G',
        plate_number: 'B 1842 LZD',
        brand: 'Toyota',
        model: 'Innova Zenix',
        vehicle_type_id: typeMPV,
        manufacture_year: 2024,
        registration_year: 2024,
        color: 'Putih Mutiara',
        chassis_number: 'MHFAB12G0R0018421',
        engine_number: 'M20A-FXS-09214',
        fuel_type: 'Bensin',
        transmission: 'Otomatis',
        engine_capacity_cc: 1987,
        passenger_capacity: 7,
        photo_url: '/src/assets/images/fleet_innova_mpv_1794808757672.jpg',
        managing_department_id: deptGA,
        parking_location: 'Area Parkir Utama Blok A1',
        ownership_status: 'Milik Sekolah',
        purchase_date: '2024-02-15',
        purchase_price: 445000000,
        school_asset_number: 'AST-LZ-2024-010',
        asset_notes: 'Kendaraan operasional utama dinas sekolah.',
        stnk_number: 'STNK-1842-LZD',
        stnk_expiry: daysFromNowIso(310),
        tax_due_date: daysFromNowIso(65),
        kir_expiry: '',
        insurance_policy_number: 'POL-ALLRISK-88412',
        insurance_expiry: daysFromNowIso(190),
        drive_document_ref: '',
        last_odometer: 24350,
        last_service_date: monthsAgoIso(2),
        last_service_odometer: 20000,
        next_service_date: daysFromNowIso(25),
        service_interval_km: 10000,
        service_interval_months: 6,
        primary_driver_id: drv3,
        condition_notes: 'Kondisi prima, servis rutin resmi.',
        admin_status: 'aktif',
        eligibility_status: 'layak',
        usage_status: 'tersedia',
        safety_blocked: false,
        safety_block_reason: '',
        updated_at: now,
      },
      {
        vehicle_id: veh2,
        vehicle_code: 'LZ-OPR-02',
        vehicle_name: 'Toyota Hiace Commuter',
        plate_number: 'B 7291 LZD',
        brand: 'Toyota',
        model: 'Hiace Commuter',
        vehicle_type_id: typeVan,
        manufacture_year: 2023,
        registration_year: 2023,
        color: 'Putih',
        chassis_number: 'JTFSS22P0N0072910',
        engine_number: '1GD-FTV-44108',
        fuel_type: 'Solar',
        transmission: 'Manual',
        engine_capacity_cc: 2755,
        passenger_capacity: 14,
        photo_url: '/src/assets/images/fleet_hiace_commuter_1794808756691.jpg',
        managing_department_id: deptGA,
        parking_location: 'Area Parkir Utama Blok B2',
        ownership_status: 'Milik Sekolah',
        purchase_date: '2023-05-10',
        purchase_price: 560000000,
        school_asset_number: 'AST-LZ-2023-022',
        asset_notes: 'Armada rombongan lomba siswa & studi lapangan.',
        stnk_number: 'STNK-7291-LZD',
        stnk_expiry: daysFromNowIso(210),
        tax_due_date: daysFromNowIso(21),
        kir_expiry: daysFromNowIso(28),
        insurance_policy_number: 'POL-ALLRISK-77319',
        insurance_expiry: daysFromNowIso(120),
        drive_document_ref: '',
        last_odometer: 48620,
        last_service_date: monthsAgoIso(4),
        last_service_odometer: 40000,
        next_service_date: daysFromNowIso(12),
        service_interval_km: 10000,
        service_interval_months: 6,
        primary_driver_id: drv2,
        condition_notes: 'Siap operasional, mendekati jadwal servis 50.000 km.',
        admin_status: 'aktif',
        eligibility_status: 'layak',
        usage_status: 'tersedia',
        safety_blocked: false,
        safety_block_reason: '',
        updated_at: now,
      },
      {
        vehicle_id: veh3,
        vehicle_code: 'LZ-BUS-01',
        vehicle_name: 'Isuzu Elf NMR Medium School Bus',
        plate_number: 'B 7033 LZD',
        brand: 'Isuzu',
        model: 'Elf NMR 71 Bus',
        vehicle_type_id: typeMedBus,
        manufacture_year: 2022,
        registration_year: 2022,
        color: 'Biru Lazuardi / Putih',
        chassis_number: 'MHCNMR71HN007033',
        engine_number: '4HG1-T-88120',
        fuel_type: 'Solar',
        transmission: 'Manual',
        engine_capacity_cc: 4570,
        passenger_capacity: 30,
        photo_url: '/src/assets/images/fleet_school_bus_1794808757647.jpg',
        managing_department_id: deptGA,
        parking_location: 'Garasi Bus Timur',
        ownership_status: 'Milik Sekolah',
        purchase_date: '2022-07-20',
        purchase_price: 890000000,
        school_asset_number: 'AST-LZ-2022-005',
        asset_notes: 'Bus antar-jemput dan field trip sekolah.',
        stnk_number: 'STNK-7033-LZD',
        stnk_expiry: daysFromNowIso(450),
        tax_due_date: daysFromNowIso(95),
        kir_expiry: daysFromNowIso(55),
        insurance_policy_number: 'POL-BUS-55201',
        insurance_expiry: daysFromNowIso(240),
        drive_document_ref: '',
        last_odometer: 67200,
        last_service_date: monthsAgoIso(3),
        last_service_odometer: 60000,
        next_service_date: daysFromNowIso(45),
        service_interval_km: 7500,
        service_interval_months: 4,
        primary_driver_id: drv1,
        condition_notes: 'Dalam pengecekan sistem pengereman dan ganti kampas rem.',
        admin_status: 'aktif',
        eligibility_status: 'layak_dengan_catatan',
        usage_status: 'tersedia',
        safety_blocked: false,
        safety_block_reason: '',
        updated_at: now,
      },
      {
        vehicle_id: veh4,
        vehicle_code: 'LZ-OPR-03',
        vehicle_name: 'Toyota Avanza Veloz 1.5 Q',
        plate_number: 'B 2190 LZD',
        brand: 'Toyota',
        model: 'Veloz 1.5 Q',
        vehicle_type_id: typeMPV,
        manufacture_year: 2023,
        registration_year: 2023,
        color: 'Putih',
        chassis_number: 'MHFAA8BY2P0021904',
        engine_number: '2NR-VE-33091',
        fuel_type: 'Bensin',
        transmission: 'Otomatis',
        engine_capacity_cc: 1496,
        passenger_capacity: 7,
        photo_url: '/src/assets/images/fleet_innova_mpv_1794808757672.jpg',
        managing_department_id: deptGA,
        parking_location: 'Area Parkir Utama Blok A2',
        ownership_status: 'Milik Sekolah',
        purchase_date: '2023-01-12',
        purchase_price: 315000000,
        school_asset_number: 'AST-LZ-2023-008',
        asset_notes: 'Operasional harian unit TK & SD.',
        stnk_number: 'STNK-2190-LZD',
        stnk_expiry: daysFromNowIso(180),
        tax_due_date: daysFromNowIso(18),
        kir_expiry: '',
        insurance_policy_number: 'POL-ALLRISK-61204',
        insurance_expiry: daysFromNowIso(180),
        drive_document_ref: '',
        last_odometer: 39140,
        last_service_date: monthsAgoIso(5),
        last_service_odometer: 30000,
        next_service_date: daysFromNowIso(-4),
        service_interval_km: 10000,
        service_interval_months: 6,
        primary_driver_id: '',
        condition_notes: 'Menunggu penggantian kondensor AC di bengkel rekanan.',
        admin_status: 'aktif',
        eligibility_status: 'tidak_layak',
        usage_status: 'tersedia',
        safety_blocked: true,
        safety_block_reason: 'Dalam perbaikan AC & servis rem berkala (RPR-2026-001)',
        updated_at: now,
      },
    ],
    VENDORS: [
      {
        vendor_id: vendor1,
        company_name: 'PT Panorama Transportasi Nusantara',
        pic_name: 'Bapak Hendra Kusuma',
        phone: '021-78890123',
        email: 'charter@panoramatrans.co.id',
        address: 'Jl. TB Simatupang Kav. 38, Jakarta Selatan',
        service_types: ['Big Bus', 'Medium Bus', 'Hiace'],
        active_status: 'aktif',
        notes: 'Vendor rekanan bersertifikat Dishub & asuransi perjalanan.',
      },
      {
        vendor_id: vendor2,
        company_name: 'PO Blue Star Pariwisata',
        pic_name: 'Ibu Karina Putri',
        phone: '021-74102930',
        email: 'sales@bluestarbus.co.id',
        address: 'Jl. Raya Ciputat No. 112, Tangerang Selatan',
        service_types: ['Big Bus', 'Medium Bus'],
        active_status: 'aktif',
        notes: 'Menyediakan unit tahun muda 2023–2025.',
      },
    ],
    VENDOR_SERVICES: [
      {
        service_id: 'vs-001',
        vendor_id: vendor1,
        vehicle_type: 'Big Bus 50 Seat Executive',
        seat_capacity: 50,
        base_rate: 4800000,
        facilities: 'AC, Reclining Seat, Mic, Bagasi Luas, P3K, APAR',
        notes: 'Tarif dalam kota Jabodetabek per 12 jam.',
      },
      {
        service_id: 'vs-002',
        vendor_id: vendor2,
        vehicle_type: 'Big Bus 59 Seat SHD',
        seat_capacity: 59,
        base_rate: 5250000,
        facilities: 'AC, LED TV, Dispenser, Charger USB, Sabuk Pengaman Tiap Kursi',
        notes: 'Sudah termasuk BBM dan pengemudi.',
      },
    ],
    BOOKINGS: [
      {
        booking_id: booking1,
        booking_number: 'BKG-INT-2026-001',
        booking_kind: 'INTERNAL',
        submitted_at: now,
        requester_id: 'usr-001',
        requester_name: 'Nadia Putri, S.Pd',
        requester_email: 'nadia.putri@lazuardi.sch.id',
        department_id: deptSD,
        activity_name: 'Olimpiade Sains Nasional Tingkat Kota',
        purpose: 'Mengantar tim siswa dan guru pendamping ke lokasi lomba OSN.',
        departure_location: 'Kampus Lazuardi Cinere',
        destination_location: 'SMPN 19 Jakarta Selatan',
        departure_at: `${daysFromNowIso(2)}T07:00`,
        return_at: `${daysFromNowIso(2)}T15:30`,
        passenger_count: 11,
        requested_vehicle_type_id: typeVan,
        needs_driver: true,
        pic_name: 'Nadia Putri, S.Pd',
        contact_phone: '0812-8834-2100',
        student_count: 0,
        companion_count: 0,
        external_vehicle_type: '',
        external_unit_count: 0,
        facilities_needed: '',
        special_requirements: '',
        estimated_budget: 0,
        notes: 'Mohon kendaraan tiba 15 menit sebelum keberangkatan.',
        status: 'Dijadwalkan',
        rejection_reason: '',
        revision_notes: '',
        allocated_vehicle_ids: [veh2],
        allocated_driver_ids: [drv2],
        selected_quote_id: '',
        selected_vendor_id: '',
        approved_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        approved_at: now,
        approval_history: [
          {
            actor_email: 'nadia.putri@lazuardi.sch.id',
            actor_name: 'Nadia Putri, S.Pd',
            timestamp: now,
            from_status: 'Draft',
            to_status: 'Diajukan',
            notes: 'Pengajuan kendaraan untuk tim OSN.',
          },
          {
            actor_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
            actor_name: 'Administrator GA',
            timestamp: now,
            from_status: 'Diajukan',
            to_status: 'Dijadwalkan',
            notes: 'Disetujui dan dialokasikan Toyota Hiace B 7291 LZD + Budi Santoso.',
          },
        ],
        updated_at: now,
      },
      {
        booking_id: booking2,
        booking_number: 'BKG-INT-2026-002',
        booking_kind: 'INTERNAL',
        submitted_at: now,
        requester_id: 'usr-002',
        requester_name: 'Rizky Pratama, M.Pd',
        requester_email: 'rizky.pratama@lazuardi.sch.id',
        department_id: deptSMP,
        activity_name: 'Rapat Koordinasi Kurikulum Dinas Pendidikan',
        purpose: 'Perjalanan dinas kepala sekolah & wakil kurikulum.',
        departure_location: 'Kampus Lazuardi Cinere',
        destination_location: 'Kantor Dinas Pendidikan Kota Depok',
        departure_at: `${daysFromNowIso(4)}T08:30`,
        return_at: `${daysFromNowIso(4)}T14:00`,
        passenger_count: 4,
        requested_vehicle_type_id: typeMPV,
        needs_driver: true,
        pic_name: 'Rizky Pratama, M.Pd',
        contact_phone: '0813-9901-4420',
        student_count: 0,
        companion_count: 0,
        external_vehicle_type: '',
        external_unit_count: 0,
        facilities_needed: '',
        special_requirements: '',
        estimated_budget: 0,
        notes: 'Butuh ruang bagasi untuk berkas akreditasi.',
        status: 'Diajukan',
        rejection_reason: '',
        revision_notes: '',
        allocated_vehicle_ids: [],
        allocated_driver_ids: [],
        selected_quote_id: '',
        selected_vendor_id: '',
        approved_by: '',
        approved_at: '',
        approval_history: [
          {
            actor_email: 'rizky.pratama@lazuardi.sch.id',
            actor_name: 'Rizky Pratama, M.Pd',
            timestamp: now,
            from_status: 'Draft',
            to_status: 'Diajukan',
            notes: 'Menunggu review General Affairs.',
          },
        ],
        updated_at: now,
      },
      {
        booking_id: booking3,
        booking_number: 'BKG-EXT-2026-001',
        booking_kind: 'EXTERNAL',
        submitted_at: now,
        requester_id: 'usr-001',
        requester_name: 'Nadia Putri, S.Pd',
        requester_email: 'nadia.putri@lazuardi.sch.id',
        department_id: deptSD,
        activity_name: 'Field Trip Kelas 5 — Museum Geologi & Observatorium',
        purpose: 'Kegiatan pembelajaran luar kelas tingkat SD.',
        departure_location: 'Kampus Lazuardi Cinere',
        destination_location: 'Museum Geologi Bandung',
        departure_at: `${daysFromNowIso(14)}T06:00`,
        return_at: `${daysFromNowIso(14)}T18:30`,
        passenger_count: 96,
        requested_vehicle_type_id: typeBigBus,
        needs_driver: true,
        pic_name: 'Nadia Putri, S.Pd',
        contact_phone: '0812-8834-2100',
        student_count: 88,
        companion_count: 8,
        external_vehicle_type: 'Big Bus',
        external_unit_count: 2,
        facilities_needed: 'AC, Sabuk pengaman tiap kursi, Mic pemandu, Bagasi luas',
        special_requirements: 'Wajib lolos cek KIR aktif dan sabuk pengaman berfungsi baik.',
        estimated_budget: 11000000,
        notes: 'Berangkat tepat pukul 06.00 WIB.',
        status: 'Penawaran Diterima',
        rejection_reason: '',
        revision_notes: '',
        allocated_vehicle_ids: [],
        allocated_driver_ids: [],
        selected_quote_id: '',
        selected_vendor_id: '',
        approved_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        approved_at: now,
        approval_history: [
          {
            actor_email: 'nadia.putri@lazuardi.sch.id',
            actor_name: 'Nadia Putri, S.Pd',
            timestamp: now,
            from_status: 'Draft',
            to_status: 'Diajukan',
            notes: 'Permohonan sewa 2 unit Big Bus untuk 96 peserta.',
          },
          {
            actor_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
            actor_name: 'Administrator GA',
            timestamp: now,
            from_status: 'Diajukan',
            to_status: 'Penawaran Diterima',
            notes: 'Dua penawaran vendor telah dicatat untuk perbandingan.',
          },
        ],
        updated_at: now,
      },
    ],
    VENDOR_QUOTES: [
      {
        quote_id: 'qte-001',
        booking_id: booking3,
        vendor_id: vendor1,
        vehicle_type: 'Big Bus 50 Seat Executive',
        capacity: 50,
        unit_count: 2,
        vehicle_year: 2024,
        rental_price: 9600000,
        extra_cost: 600000,
        total_cost: 10200000,
        facilities: 'AC, Reclining Seat, Sabuk Pengaman 50 titik, APAR, P3K, Mic',
        valid_until: daysFromNowIso(7),
        notes: 'Sudah termasuk tol Cipularang dan parkir museum.',
        verify_vehicle_docs: true,
        verify_kir: true,
        verify_vehicle_condition: true,
        verify_driver_qualification: true,
        verify_safety_equipment: true,
        verify_school_policy: true,
        is_selected: false,
        created_at: now,
      },
      {
        quote_id: 'qte-002',
        booking_id: booking3,
        vendor_id: vendor2,
        vehicle_type: 'Big Bus 59 Seat SHD',
        capacity: 59,
        unit_count: 2,
        vehicle_year: 2022,
        rental_price: 9200000,
        extra_cost: 750000,
        total_cost: 9950000,
        facilities: 'AC, TV LED, Dispenser, Charger USB',
        valid_until: daysFromNowIso(5),
        notes: 'Belum termasuk tol dan tips pengemudi.',
        verify_vehicle_docs: true,
        verify_kir: true,
        verify_vehicle_condition: false,
        verify_driver_qualification: true,
        verify_safety_equipment: false,
        verify_school_policy: false,
        is_selected: false,
        created_at: now,
      },
    ],
    INSPECTION_TEMPLATES: [
      {
        template_id: 'tpl-default-001',
        name: 'Standar Inspeksi Keselamatan Armada Lazuardi',
        items: INITIAL_INSPECTION_TEMPLATE_ITEMS,
        updated_at: now,
      },
    ],
    INSPECTIONS: [
      {
        inspection_id: 'ins-001',
        inspection_number: 'INS-2026-001',
        vehicle_id: veh1,
        plate_number: 'B 1842 LZD',
        inspected_at: now,
        inspection_type: 'Mingguan',
        inspector_name: 'Slamet Riyadi',
        inspector_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        odometer: 24350,
        location: 'Kampus Lazuardi Cinere',
        general_notes: 'Semua fungsi keselamatan dan mesin berjalan normal.',
        photo_url: '/src/assets/images/fleet_innova_mpv_1794808757672.jpg',
        items: INITIAL_INSPECTION_TEMPLATE_ITEMS.map((item) => ({
          item_id: item.item_id,
          category: item.category,
          label: item.label,
          is_critical: item.is_critical,
          value: 'Baik',
          notes: '',
          photo_url: '',
          recommendation: '',
        })),
        result: 'Layak Operasional',
        status: 'Reviewed',
        triggered_block: false,
        reviewed_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        reviewed_at: now,
      },
    ],
    DAMAGE_REPORTS: [
      {
        damage_report_id: 'dmg-001',
        report_number: 'DMG-2026-001',
        vehicle_id: veh4,
        incident_date: monthsAgoIso(0),
        reporter_name: 'Budi Santoso',
        reporter_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        source: 'Laporan Pengemudi',
        inspection_id: '',
        odometer: 39140,
        vehicle_part: 'Sistem AC & Rem Depan',
        description: 'AC tidak dingin saat siang dan terdengar bunyi gesekan halus saat pengereman.',
        priority: 'Tinggi',
        operational_impact: 'Tidak Layak / Blokir',
        photo_url: '',
        notes: 'Segera dibawa ke bengkel resmi untuk pengecekan kampas rem dan kondensor.',
        status: 'Diproses Perbaikan',
        created_at: now,
      },
    ],
    REPAIRS: [
      {
        repair_id: 'rpr-001',
        repair_number: 'RPR-2026-001',
        vehicle_id: veh4,
        damage_report_id: 'dmg-001',
        workshop_name: 'Auto2000 Cinere',
        workshop_pic: 'Pak Wahyu (Service Advisor)',
        entry_date: daysFromNowIso(-2),
        target_completion_date: daysFromNowIso(2),
        actual_completion_date: '',
        diagnosis: 'Kampas rem depan menipis (< 2mm) dan kebocoran pada seal kondensor AC.',
        work_details: 'Penggantian kampas rem depan set, flushing freon, dan ganti seal kondensor.',
        spare_parts: 'Brake Pad Set Front Genuine, Seal O-Ring Kondensor, Freon R134a',
        estimated_cost: 2850000,
        actual_cost: 0,
        receipt_url: '',
        status: 'Dalam Perbaikan',
        pic_admin: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        approved_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        approved_at: now,
        verified_by: '',
        verified_at: '',
        blocks_vehicle: true,
        notes: 'Unit diblokir otomatis hingga verifikasi perbaikan selesai oleh GA.',
        change_log: [
          {
            timestamp: now,
            actor: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
            action: 'Disetujui & Masuk Bengkel',
            notes: 'Estimasi biaya Rp 2.850.000 disetujui GA.',
          },
        ],
      },
    ],
    MAINTENANCE_PLANS: [
      {
        maintenance_plan_id: 'mnt-001',
        vehicle_id: veh1,
        maintenance_type: 'Servis berkala',
        schedule_basis: 'Kombinasi',
        interval_months: 6,
        interval_days: 180,
        interval_km: 10000,
        last_service_date: monthsAgoIso(2),
        last_service_odometer: 20000,
        next_target_date: daysFromNowIso(25),
        next_target_km: 30000,
        status: 'Mendekati Jadwal',
        reminder_stage: '30 Hari',
        last_vendor: 'Auto2000 Cinere',
        last_cost: 1950000,
        notes: 'Servis 30.000 km termasuk ganti oli dan filter oli.',
        updated_at: now,
      },
      {
        maintenance_plan_id: 'mnt-002',
        vehicle_id: veh2,
        maintenance_type: 'Ganti oli mesin',
        schedule_basis: 'Kombinasi',
        interval_months: 6,
        interval_days: 180,
        interval_km: 10000,
        last_service_date: monthsAgoIso(4),
        last_service_odometer: 40000,
        next_target_date: daysFromNowIso(12),
        next_target_km: 50000,
        status: 'Mendekati Jadwal',
        reminder_stage: '14 Hari',
        last_vendor: 'Auto2000 Cinere',
        last_cost: 2450000,
        notes: 'Segera jadwalkan sebelum perjalanan field trip bulan depan.',
        updated_at: now,
      },
      {
        maintenance_plan_id: 'mnt-003',
        vehicle_id: veh4,
        maintenance_type: 'Pemeriksaan rem',
        schedule_basis: 'Tanggal',
        interval_months: 6,
        interval_days: 180,
        interval_km: 10000,
        last_service_date: monthsAgoIso(6),
        last_service_odometer: 30000,
        next_target_date: daysFromNowIso(-4),
        next_target_km: 40000,
        status: 'Terlambat',
        reminder_stage: 'Terlambat',
        last_vendor: 'Auto2000 Cinere',
        last_cost: 1200000,
        notes: 'Ditangani bersamaan dengan perbaikan RPR-2026-001.',
        updated_at: now,
      },
    ],
    EXPENSES: [
      {
        expense_id: 'exp-001',
        vehicle_id: veh1,
        expense_date: monthsAgoIso(2),
        category: 'Servis berkala',
        description: 'Servis berkala 20.000 km Innova Zenix',
        vendor_name: 'Auto2000 Cinere',
        amount: 1950000,
        reference_type: 'MAINTENANCE',
        reference_id: 'mnt-hist-001',
        receipt_url: '',
        notes: 'Ganti oli mesin, filter oli, balancing.',
        created_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        created_at: now,
      },
      {
        expense_id: 'exp-002',
        vehicle_id: veh2,
        expense_date: monthsAgoIso(1),
        category: 'KIR',
        description: 'Perpanjangan Uji KIR Semesteran Hiace Commuter',
        vendor_name: 'Dishub Kota Depok',
        amount: 450000,
        reference_type: 'MANUAL',
        reference_id: '',
        receipt_url: '',
        notes: 'Lulus uji emisi & pengereman.',
        created_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        created_at: now,
      },
      {
        expense_id: 'exp-003',
        vehicle_id: veh3,
        expense_date: monthsAgoIso(0),
        category: 'Pajak kendaraan',
        description: 'Pembayaran PKB & SWDKLLJ Tahunan Medium Bus',
        vendor_name: 'Samsat Cinere',
        amount: 3420000,
        reference_type: 'MANUAL',
        reference_id: '',
        receipt_url: '',
        notes: 'Masa berlaku STNK diperpanjang.',
        created_by: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        created_at: now,
      },
    ],
    VEHICLE_HISTORY: [
      {
        history_id: 'hst-001',
        vehicle_id: veh1,
        occurred_at: now,
        activity_type: 'Inspeksi',
        actor_name: 'Slamet Riyadi',
        actor_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        summary: 'Inspeksi Mingguan (INS-2026-001) — Hasil: Layak Operasional',
        reference_id: 'ins-001',
      },
      {
        history_id: 'hst-002',
        vehicle_id: veh2,
        occurred_at: now,
        activity_type: 'Penggunaan',
        actor_name: 'Administrator GA',
        actor_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        summary: 'Dijadwalkan untuk BKG-INT-2026-001 (Olimpiade Sains Nasional Tingkat Kota)',
        reference_id: booking1,
      },
      {
        history_id: 'hst-003',
        vehicle_id: veh4,
        occurred_at: now,
        activity_type: 'Blokir/Pelepasan',
        actor_name: 'Administrator GA',
        actor_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        summary: 'Blokir operasional aktif karena perbaikan RPR-2026-001 (Rem & AC)',
        reference_id: 'rpr-001',
      },
    ],
    NOTIFICATIONS: [
      {
        notification_id: 'ntf-001',
        recipient_email: 'ALL_ADMINS',
        recipient_role: 'ALL_ADMINS',
        title: 'Pengajuan Kendaraan Baru Menunggu Review',
        message: 'BKG-INT-2026-002 oleh Rizky Pratama, M.Pd (Junior High) menunggu persetujuan GA.',
        link: '/bookings/approval',
        severity: 'info',
        is_read: false,
        created_at: now,
      },
      {
        notification_id: 'ntf-002',
        recipient_email: 'ALL_ADMINS',
        recipient_role: 'ALL_ADMINS',
        title: 'Unit B 2190 LZD Diblokir Sementara',
        message: 'Toyota Avanza Veloz 1.5 Q berstatus Tidak Layak selama perbaikan RPR-2026-001.',
        link: '/transportation/repairs',
        severity: 'warning',
        is_read: false,
        created_at: now,
      },
      {
        notification_id: 'ntf-003',
        recipient_email: 'nadia.putri@lazuardi.sch.id',
        recipient_role: 'USER',
        title: 'Permintaan BKG-INT-2026-001 Dijadwalkan',
        message: 'Unit Toyota Hiace Commuter (B 7291 LZD) dengan pengemudi Budi Santoso telah dialokasikan.',
        link: '/bookings/my',
        severity: 'success',
        is_read: false,
        created_at: now,
      },
    ],
    SETTINGS: [
      {
        school_name: 'Sekolah Lazuardi Global Compassionate School',
        workspace_domain: process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id',
        timezone: 'Asia/Jakarta',
        booking_lead_time_hours: 12,
        max_booking_days_ahead: 90,
        auto_block_on_critical_inspection: true,
        require_post_trip_inspection: true,
        reminder_days_before: [30, 14, 7],
        doc_expiry_warning_days: 30,
        notify_admin_on_new_booking: true,
        notify_user_on_status_change: true,
        updated_at: now,
      },
    ],
    AUDIT_LOGS: [
      {
        log_id: 'aud-001',
        timestamp: now,
        actor_email: initialAdminsEnv[0] || 'soleh.st@lazuardi.sch.id',
        actor_name: 'Sistem Inisialisasi',
        actor_role: 'ADMIN',
        action: 'SYSTEM_BOOTSTRAP',
        entity_type: 'SYSTEM',
        entity_id: 'lvbms-core',
        summary: 'Inisialisasi master data dan konfigurasi LVBMS Sekolah Lazuardi.',
      },
    ],
  };
}

class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.queue;
    this.queue = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class LvbmsDataStore {
  private mutex = new AsyncMutex();
  private cache: DatabaseSnapshot | null = null;
  private cacheTimestamp = 0;
  private readonly cacheTtlMs = 25_000;
  private sheetsEnsured = false;

  private get sheetsConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY
    );
  }

  private getConnectionMetaPaths(): string[] {
    return [
      path.resolve(process.cwd(), '.data', 'google-sheets-connection.json'),
      '/tmp/google-sheets-connection.json',
    ];
  }

  public getConnectedSheetMeta(): ConnectedSheetMeta | null {
    for (const p of this.getConnectionMetaPaths()) {
      try {
        if (fs.existsSync(p)) {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as ConnectedSheetMeta;
          if (parsed?.spreadsheetId) return parsed;
        }
      } catch {
        // Ignore invalid metadata file
      }
    }
    return null;
  }

  private saveConnectedSheetMeta(meta: ConnectedSheetMeta) {
    const payload = JSON.stringify(meta, null, 2);
    for (const p of this.getConnectionMetaPaths()) {
      try {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(p, payload, 'utf8');
        return;
      } catch {
        // Try fallback path
      }
    }
  }

  private deleteConnectedSheetMeta() {
    for (const p of this.getConnectionMetaPaths()) {
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch {
        // Ignore
      }
    }
  }

  public getActiveOAuthToken(): string | null {
    return oauthTokenStorage.getStore() || null;
  }

  private getOAuthClient(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return auth;
  }

  private isGoogleAuthError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err || '');
    const code = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
    return (
      code === 401 ||
      code === 403 ||
      /invalid_grant|invalid credentials|unauthenticated|insufficient authentication scopes/i.test(msg)
    );
  }

  private getActiveSheetsTarget():
    | { mode: 'service_account'; spreadsheetId: string; sheets: sheets_v4.Sheets }
    | { mode: 'oauth'; spreadsheetId: string; sheets: sheets_v4.Sheets }
    | null {
    if (this.sheetsConfigured) {
      return {
        mode: 'service_account',
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID!,
        sheets: google.sheets({ version: 'v4', auth: this.getServiceAuth() }),
      };
    }
    const meta = this.getConnectedSheetMeta();
    const token = this.getActiveOAuthToken();
    if (meta?.spreadsheetId && token) {
      return {
        mode: 'oauth',
        spreadsheetId: meta.spreadsheetId,
        sheets: google.sheets({ version: 'v4', auth: this.getOAuthClient(token) }),
      };
    }
    return null;
  }

  public getStorageDiagnostics() {
    const connectedMeta = this.getConnectedSheetMeta();
    const hasActiveOAuthToken = Boolean(this.getActiveOAuthToken());
    const activeSpreadsheetId = this.sheetsConfigured
      ? process.env.GOOGLE_SHEETS_SPREADSHEET_ID!
      : connectedMeta?.spreadsheetId || null;

    const engine = this.sheetsConfigured
      ? 'Google Sheets API v4 (Service Account)'
      : connectedMeta
        ? 'Google Sheets API v4 (Google Workspace OAuth)'
        : 'Server Persistent File Ledger';

    return {
      engine,
      connectionMode: this.sheetsConfigured
        ? ('service_account' as const)
        : connectedMeta
          ? ('oauth' as const)
          : ('local' as const),
      googleSheetsConnected: Boolean(this.sheetsConfigured || connectedMeta),
      googleDriveConnected: Boolean(
        (process.env.GOOGLE_DRIVE_FOLDER_ID &&
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
          process.env.GOOGLE_PRIVATE_KEY) ||
          hasActiveOAuthToken
      ),
      googleOAuthConfigured: Boolean(
        process.env.GOOGLE_CLIENT_ID ||
          process.env.VITE_GOOGLE_CLIENT_ID ||
          fs.existsSync(path.resolve(process.cwd(), 'firebase-applet-config.json'))
      ),
      spreadsheetIdMasked: activeSpreadsheetId
        ? `${activeSpreadsheetId.slice(0, 6)}...${activeSpreadsheetId.slice(-4)}`
        : null,
      oauthSheet: connectedMeta,
      hasActiveOAuthToken,
      timezone: 'Asia/Jakarta',
    };
  }

  private getServiceAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
    const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    return new google.auth.JWT({
      email,
      key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });
  }

  private getLocalStorePath(): string {
    const preferred = path.resolve(process.cwd(), '.data', 'lvbms-db.json');
    try {
      const dir = path.dirname(preferred);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return preferred;
    } catch {
      return '/tmp/lvbms-db.json';
    }
  }

  private writeLocalMirror(snapshot: DatabaseSnapshot) {
    const filePath = this.getLocalStorePath();
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  private readLocalSnapshotOrSeed(): DatabaseSnapshot {
    const filePath = this.getLocalStorePath();
    if (!fs.existsSync(filePath)) {
      const seed = createInitialSeed();
      this.writeLocalMirror(seed);
      return seed;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSnapshot;
    if (this.normalizeVehicleTypes(parsed)) {
      this.writeLocalMirror(parsed);
    }
    return parsed;
  }

  private async ensureGoogleSheetsInitialized(sheets: sheets_v4.Sheets, spreadsheetId: string) {
    if (this.sheetsEnsured) return;

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTitles = new Set(
      (meta.data.sheets || []).map((s) => s.properties?.title || '').filter(Boolean)
    );

    const missing = SHEET_KEYS.filter((k) => !existingTitles.has(k));
    if (missing.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missing.map((title) => ({
            addSheet: { properties: { title } },
          })),
        },
      });
    }

    // Check if ADMIN_USERS is empty; if so, seed all tabs cleanly
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'ADMIN_USERS!A1:B2',
    });

    if (!check.data.values || check.data.values.length === 0) {
      const seed = createInitialSeed();
      await this.writeAllSheets(sheets, spreadsheetId, seed);
    }

    this.sheetsEnsured = true;
  }

  private serializeTable<T extends object>(rows: T[]): string[][] {
    if (rows.length === 0) {
      return [['__EMPTY__']];
    }
    const headers = Object.keys(rows[0]);
    const body = rows.map((row) =>
      headers.map((h) => {
        const val = (row as Record<string, unknown>)[h];
        if (val === undefined || val === null) return '';
        if (typeof val === 'object' || typeof val === 'boolean' || typeof val === 'number') {
          return JSON.stringify(val);
        }
        return String(val);
      })
    );
    return [headers, ...body];
  }

  private deserializeTable<T>(values: string[][] | null | undefined): T[] {
    if (!values || values.length === 0) return [];
    const headers = values[0];
    if (!headers || headers.length === 0 || headers[0] === '__EMPTY__') return [];
    const rows: T[] = [];
    for (let i = 1; i < values.length; i++) {
      const rowValues = values[i];
      if (!rowValues || rowValues.length === 0) continue;
      const obj: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        const raw = rowValues[idx] ?? '';
        if (raw === '') {
          obj[header] = '';
        } else if (
          raw === 'true' ||
          raw === 'false' ||
          raw.startsWith('[') ||
          raw.startsWith('{') ||
          (!Number.isNaN(Number(raw)) && raw.trim() !== '' && !/^0\d+/.test(raw))
        ) {
          try {
            obj[header] = JSON.parse(raw);
          } catch {
            obj[header] = raw;
          }
        } else {
          obj[header] = raw;
        }
      });
      rows.push(obj as T);
    }
    return rows;
  }

  private async writeAllSheets(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    snapshot: DatabaseSnapshot
  ) {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: {
        ranges: SHEET_KEYS.map((k) => `${k}!A1:ZZ`),
      },
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: SHEET_KEYS.map((key) => ({
          range: `${key}!A1`,
          values: this.serializeTable(snapshot[key] as object[]),
        })),
      },
    });
  }

  private normalizeVehicleTypes(snapshot: DatabaseSnapshot): boolean {
    let changed = false;
    const seedTypes = createInitialSeed().VEHICLE_TYPES;

    // Upgrade legacy seed school types from 'Keduanya' to 'Internal'
    for (const vt of snapshot.VEHICLE_TYPES) {
      if (
        ['vtype-mpv-001', 'vtype-van-002', 'vtype-mbus-003'].includes(vt.vehicle_type_id) &&
        vt.category === 'Keduanya'
      ) {
        vt.category = 'Internal';
        changed = true;
      }
      if (vt.vehicle_type_id === 'vtype-bbus-004' && vt.code === 'BBUS') {
        vt.code = 'SEWA-BBUS';
        vt.name = 'Big Bus';
        vt.category = 'Eksternal';
        changed = true;
      }
    }

    // Ensure standard external rental vehicle types exist if not yet present
    const existingIds = new Set(snapshot.VEHICLE_TYPES.map((t) => t.vehicle_type_id));
    const existingExtNames = new Set(
      snapshot.VEHICLE_TYPES.filter((t) => t.category === 'Eksternal').map((t) => t.name.toLowerCase())
    );
    for (const st of seedTypes) {
      if (st.category === 'Eksternal' && !existingIds.has(st.vehicle_type_id) && !existingExtNames.has(st.name.toLowerCase())) {
        snapshot.VEHICLE_TYPES.push(st);
        changed = true;
      }
    }
    return changed;
  }

  private async formatSheetHeaders(sheets: sheets_v4.Sheets, spreadsheetId: string) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetInfos = meta.data.sheets || [];
      const requests: sheets_v4.Schema$Request[] = [];
      for (const s of sheetInfos) {
        const sheetId = s.properties?.sheetId;
        const title = s.properties?.title || '';
        if (sheetId === undefined || sheetId === null || !SHEET_KEYS.includes(title as SheetKey)) continue;
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        });
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.09, green: 0.333, blue: 0.808 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        });
      }
      if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests },
        });
      }
    } catch {
      // Non-fatal: formatting is cosmetic; data integrity takes priority
    }
  }

  private extractSpreadsheetId(input: string): string {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch?.[1]) return urlMatch[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
    throw new Error('Format URL atau Spreadsheet ID Google Sheets tidak valid.');
  }

  private async readFromGoogleSheets(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    fallbackSeed?: DatabaseSnapshot
  ): Promise<DatabaseSnapshot> {
    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: SHEET_KEYS.map((k) => `${k}!A1:ZZ`),
    });

    const base = fallbackSeed || createInitialSeed();
    const result = { ...base };
    (batch.data.valueRanges || []).forEach((vr, idx) => {
      const key = SHEET_KEYS[idx];
      const parsed = this.deserializeTable(vr.values as string[][] | undefined);
      if (key === 'SETTINGS' && parsed.length === 0) {
        result[key] = base.SETTINGS;
      } else if (key === 'INSPECTION_TEMPLATES' && parsed.length === 0) {
        result[key] = base.INSPECTION_TEMPLATES;
      } else if (key === 'ADMIN_USERS' && parsed.length === 0) {
        result[key] = base.ADMIN_USERS;
      } else {
        (result as Record<string, unknown[]>)[key] = parsed;
      }
    });
    return result;
  }

  public async provisionNewSpreadsheet(
    oauthToken: string,
    title: string,
    actorEmail: string
  ): Promise<{ connection: ConnectedSheetMeta; sheetCount: number }> {
    return this.mutex.runExclusive(async () => {
      const auth = this.getOAuthClient(oauthToken);
      const sheets = google.sheets({ version: 'v4', auth });
      const snapshot = this.cache ? structuredClone(this.cache) : this.readLocalSnapshotOrSeed();

      const cleanTitle = title.trim() || `LVBMS Database - Sekolah Lazuardi`;
      const created = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: cleanTitle,
            locale: 'id_ID',
            timeZone: 'Asia/Jakarta',
          },
          sheets: SHEET_KEYS.map((sheetTitle) => ({
            properties: {
              title: sheetTitle,
              gridProperties: { frozenRowCount: 1 },
            },
          })),
        },
      });

      const spreadsheetId = created.data.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error('Google Sheets tidak mengembalikan Spreadsheet ID.');
      }
      const spreadsheetUrl =
        created.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      await this.writeAllSheets(sheets, spreadsheetId, snapshot);
      await this.formatSheetHeaders(sheets, spreadsheetId);

      const now = nowWibIso();
      const connection: ConnectedSheetMeta = {
        spreadsheetId,
        spreadsheetUrl,
        title: created.data.properties?.title || cleanTitle,
        connectedAt: now,
        connectedBy: actorEmail,
        lastSyncAt: now,
        lastAuthExpired: false,
      };
      this.saveConnectedSheetMeta(connection);
      this.writeLocalMirror(snapshot);
      this.sheetsEnsured = true;
      this.cache = snapshot;
      this.cacheTimestamp = Date.now();

      return { connection, sheetCount: SHEET_KEYS.length };
    });
  }

  public async connectExistingSpreadsheet(
    oauthToken: string,
    spreadsheetIdOrUrl: string,
    mode: 'push' | 'pull',
    actorEmail: string
  ): Promise<{ connection: ConnectedSheetMeta; mode: 'push' | 'pull' }> {
    return this.mutex.runExclusive(async () => {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetIdOrUrl);
      const auth = this.getOAuthClient(oauthToken);
      const sheets = google.sheets({ version: 'v4', auth });

      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const title = meta.data.properties?.title || 'LVBMS Google Sheet';
      const spreadsheetUrl =
        meta.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      const existingTitles = new Set(
        (meta.data.sheets || []).map((s) => s.properties?.title || '').filter(Boolean)
      );
      const missing = SHEET_KEYS.filter((k) => !existingTitles.has(k));
      if (missing.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: missing.map((t) => ({
              addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } },
            })),
          },
        });
      }

      const localBase = this.cache ? structuredClone(this.cache) : this.readLocalSnapshotOrSeed();
      let finalSnapshot: DatabaseSnapshot;

      if (mode === 'push') {
        finalSnapshot = localBase;
        await this.writeAllSheets(sheets, spreadsheetId, finalSnapshot);
        await this.formatSheetHeaders(sheets, spreadsheetId);
      } else {
        finalSnapshot = await this.readFromGoogleSheets(sheets, spreadsheetId, localBase);
        if (this.normalizeVehicleTypes(finalSnapshot) || missing.length > 0) {
          await this.writeAllSheets(sheets, spreadsheetId, finalSnapshot);
          await this.formatSheetHeaders(sheets, spreadsheetId);
        }
      }

      const now = nowWibIso();
      const connection: ConnectedSheetMeta = {
        spreadsheetId,
        spreadsheetUrl,
        title,
        connectedAt: now,
        connectedBy: actorEmail,
        lastSyncAt: now,
        lastAuthExpired: false,
      };
      this.saveConnectedSheetMeta(connection);
      this.writeLocalMirror(finalSnapshot);
      this.sheetsEnsured = true;
      this.cache = finalSnapshot;
      this.cacheTimestamp = Date.now();

      return { connection, mode };
    });
  }

  public async syncConnectedSpreadsheet(
    oauthToken: string,
    direction: 'push' | 'pull'
  ): Promise<ConnectedSheetMeta> {
    return this.mutex.runExclusive(async () => {
      const meta = this.getConnectedSheetMeta();
      if (!meta?.spreadsheetId) {
        throw new Error('Belum ada Google Spreadsheet yang terhubung.');
      }
      const auth = this.getOAuthClient(oauthToken);
      const sheets = google.sheets({ version: 'v4', auth });

      this.sheetsEnsured = false;
      await this.ensureGoogleSheetsInitialized(sheets, meta.spreadsheetId);

      if (direction === 'push') {
        const snapshot = this.cache ? structuredClone(this.cache) : this.readLocalSnapshotOrSeed();
        await this.writeAllSheets(sheets, meta.spreadsheetId, snapshot);
        await this.formatSheetHeaders(sheets, meta.spreadsheetId);
        this.writeLocalMirror(snapshot);
        this.cache = snapshot;
        this.cacheTimestamp = Date.now();
      } else {
        const localBase = this.cache ? structuredClone(this.cache) : this.readLocalSnapshotOrSeed();
        const pulled = await this.readFromGoogleSheets(sheets, meta.spreadsheetId, localBase);
        if (this.normalizeVehicleTypes(pulled)) {
          await this.writeAllSheets(sheets, meta.spreadsheetId, pulled);
        }
        this.writeLocalMirror(pulled);
        this.cache = pulled;
        this.cacheTimestamp = Date.now();
      }

      const updatedMeta: ConnectedSheetMeta = {
        ...meta,
        lastSyncAt: nowWibIso(),
        lastAuthExpired: false,
      };
      this.saveConnectedSheetMeta(updatedMeta);
      return updatedMeta;
    });
  }

  public disconnectOAuthSpreadsheet() {
    this.deleteConnectedSheetMeta();
    this.sheetsEnsured = false;
  }

  private async readSnapshotRaw(): Promise<DatabaseSnapshot> {
    const target = this.getActiveSheetsTarget();
    if (target) {
      try {
        await this.ensureGoogleSheetsInitialized(target.sheets, target.spreadsheetId);
        const result = await this.readFromGoogleSheets(target.sheets, target.spreadsheetId);
        if (this.normalizeVehicleTypes(result)) {
          await this.writeKeysToStorage(result, ['VEHICLE_TYPES']);
        }
        if (target.mode === 'oauth') {
          this.writeLocalMirror(result);
          const meta = this.getConnectedSheetMeta();
          if (meta?.lastAuthExpired) {
            this.saveConnectedSheetMeta({ ...meta, lastAuthExpired: false });
          }
        }
        return result;
      } catch (err) {
        if (target.mode === 'oauth' && this.isGoogleAuthError(err)) {
          const meta = this.getConnectedSheetMeta();
          if (meta && !meta.lastAuthExpired) {
            this.saveConnectedSheetMeta({ ...meta, lastAuthExpired: true });
          }
          return this.readLocalSnapshotOrSeed();
        }
        throw err;
      }
    }

    return this.readLocalSnapshotOrSeed();
  }

  private async writeKeysToStorage(snapshot: DatabaseSnapshot, changedKeys: SheetKey[]) {
    // Always keep local mirror up to date for resilience when Service Account env is absent
    this.writeLocalMirror(snapshot);

    const target = this.getActiveSheetsTarget();
    if (target) {
      try {
        await this.ensureGoogleSheetsInitialized(target.sheets, target.spreadsheetId);

        await target.sheets.spreadsheets.values.batchClear({
          spreadsheetId: target.spreadsheetId,
          requestBody: {
            ranges: changedKeys.map((k) => `${k}!A1:ZZ`),
          },
        });

        await target.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: target.spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: changedKeys.map((key) => ({
              range: `${key}!A1`,
              values: this.serializeTable(snapshot[key] as object[]),
            })),
          },
        });

        if (target.mode === 'oauth') {
          const meta = this.getConnectedSheetMeta();
          if (meta) {
            this.saveConnectedSheetMeta({
              ...meta,
              lastSyncAt: nowWibIso(),
              lastAuthExpired: false,
            });
          }
        }
      } catch (err) {
        if (target.mode === 'oauth' && this.isGoogleAuthError(err)) {
          const meta = this.getConnectedSheetMeta();
          if (meta && !meta.lastAuthExpired) {
            this.saveConnectedSheetMeta({ ...meta, lastAuthExpired: true });
          }
        } else {
          throw err;
        }
      }
    }

    this.cache = snapshot;
    this.cacheTimestamp = Date.now();
  }

  public async getSnapshot(forceRefresh = false): Promise<DatabaseSnapshot> {
    if (!forceRefresh && this.cache && Date.now() - this.cacheTimestamp < this.cacheTtlMs) {
      return structuredClone(this.cache);
    }
    const data = await this.readSnapshotRaw();
    this.cache = data;
    this.cacheTimestamp = Date.now();
    return structuredClone(data);
  }

  public async mutate<T>(
    changedKeys: SheetKey[],
    fn: (db: DatabaseSnapshot) => Promise<T> | T
  ): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const db = await this.getSnapshot(true);
      const result = await fn(db);
      await this.writeKeysToStorage(db, changedKeys);
      return result;
    });
  }

  private async ensureOAuthDriveFolder(drive: drive_v3.Drive): Promise<string | undefined> {
    try {
      const search = await drive.files.list({
        q: "name='LVBMS_Lazuardi_Uploads' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
        spaces: 'drive',
      });
      if (search.data.files && search.data.files[0]?.id) {
        return search.data.files[0].id;
      }
      const folder = await drive.files.create({
        requestBody: {
          name: 'LVBMS_Lazuardi_Uploads',
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      return folder.data.id || undefined;
    } catch {
      return undefined;
    }
  }

  public async uploadFileToDriveOrStore(
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<{ url: string; driveFileId: string | null; storage: 'google_drive' | 'server_uploads' }> {
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');

    const serviceAccountDrive = Boolean(
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY
    );
    const oauthToken = this.getActiveOAuthToken();

    if (serviceAccountDrive || oauthToken) {
      try {
        const drive: drive_v3.Drive = serviceAccountDrive
          ? google.drive({ version: 'v3', auth: this.getServiceAuth() })
          : google.drive({ version: 'v3', auth: this.getOAuthClient(oauthToken!) });

        const parentFolderId = serviceAccountDrive
          ? process.env.GOOGLE_DRIVE_FOLDER_ID!
          : await this.ensureOAuthDriveFolder(drive);

        const created = await drive.files.create({
          requestBody: {
            name: `${Date.now()}_${fileName}`,
            ...(parentFolderId ? { parents: [parentFolderId] } : {}),
          },
          media: {
            mimeType,
            body: Readable.from(buffer),
          },
          fields: 'id, webViewLink, webContentLink',
        });

        const fileId = created.data.id || '';
        if (fileId) {
          try {
            await drive.permissions.create({
              fileId,
              requestBody: { role: 'reader', type: 'anyone' },
            });
          } catch {
            // Ignore if org policy restricts public link sharing
          }
        }

        return {
          url: created.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
          driveFileId: fileId,
          storage: 'google_drive',
        };
      } catch {
        // Fallback to server upload folder if OAuth Drive upload fails
      }
    }

    // Fallback server upload storage (never localStorage)
    const uploadDir = path.resolve(process.cwd(), '.data', 'uploads');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch {
      // ignore
    }
    const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const target = fs.existsSync(uploadDir)
      ? path.join(uploadDir, safeName)
      : path.join('/tmp', safeName);
    fs.writeFileSync(target, buffer);

    return {
      url: `/api/uploads/${safeName}`,
      driveFileId: null,
      storage: 'server_uploads',
    };
  }
}

export const dbStore = new LvbmsDataStore();
