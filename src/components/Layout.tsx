import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  Bus,
  CalendarDays,
  Car,
  CheckSquare,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
  ShieldCheck,
  Truck,
  UserCircle2,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { cn } from '../lib/utils.ts';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ADMIN_GROUPS: NavGroup[] = [
  {
    title: 'Dashboard',
    items: [
      { label: 'Dashboard Utama', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Notifikasi', to: '/notifications', icon: Bell },
    ],
  },
  {
    title: 'Vehicle Booking System',
    items: [
      { label: 'Approval Center', to: '/bookings/approval', icon: CheckSquare },
      { label: 'Order Kendaraan Sekolah', to: '/bookings/internal', icon: Car },
      { label: 'Order Bus / Eksternal', to: '/bookings/external', icon: Bus },
      { label: 'Semua Pengajuan', to: '/bookings', icon: FileSpreadsheet },
      { label: 'Kalender Kendaraan', to: '/bookings/calendar', icon: CalendarDays },
      { label: 'Jadwal Pengemudi', to: '/bookings/drivers', icon: Users },
      { label: 'Riwayat Pemesanan', to: '/bookings/history', icon: History },
    ],
  },
  {
    title: 'Transportation Management',
    items: [
      { label: 'Dashboard Armada', to: '/transportation', icon: Activity },
      { label: 'Data Kendaraan', to: '/transportation/vehicles', icon: Truck },
      { label: 'Inspeksi Kendaraan', to: '/transportation/inspections', icon: ClipboardCheck },
      { label: 'Perbaikan Kendaraan', to: '/transportation/repairs', icon: Wrench },
      { label: 'Perawatan Berkala', to: '/transportation/maintenance', icon: CalendarDays },
      { label: 'Riwayat Kendaraan', to: '/transportation/history', icon: History },
      { label: 'Biaya Operasional', to: '/transportation/costs', icon: Wallet },
      { label: 'Laporan Armada', to: '/transportation/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Unit / Departemen', to: '/master/departments', icon: Building2 },
      { label: 'Pengemudi', to: '/master/drivers', icon: Users },
      { label: 'Vendor Transportasi', to: '/master/vendors', icon: Bus },
      { label: 'Jenis Kendaraan', to: '/master/vehicle-types', icon: Database },
      { label: 'Administrator', to: '/master/admins', icon: ShieldCheck },
    ],
  },
  {
    title: 'Reports & Settings',
    items: [
      { label: 'Laporan Terintegrasi', to: '/reports', icon: BarChart3 },
      { label: 'Pengaturan & Audit', to: '/settings', icon: Settings },
    ],
  },
];

const USER_GROUPS: NavGroup[] = [
  {
    title: 'Menu Utama',
    items: [
      { label: 'Dashboard Saya', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Order Kendaraan Sekolah', to: '/bookings/internal', icon: PlusCircle },
      { label: 'Order Bus / Sewa Kendaraan', to: '/bookings/external', icon: Bus },
      { label: 'Pengajuan Saya', to: '/bookings/my', icon: FileSpreadsheet },
      { label: 'Riwayat Pemesanan', to: '/bookings/history', icon: History },
      { label: 'Notifikasi', to: '/notifications', icon: Bell },
      { label: 'Profil Saya', to: '/profile', icon: UserCircle2 },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Utama',
  '/notifications': 'Pusat Notifikasi',
  '/bookings/approval': 'Approval Center — General Affairs',
  '/bookings/internal': 'Order Kendaraan Operasional Sekolah',
  '/bookings/external': 'Order Bus / Sewa Kendaraan Eksternal',
  '/bookings': 'Semua Pengajuan Kendaraan',
  '/bookings/my': 'Pengajuan Saya',
  '/bookings/calendar': 'Kalender Ketersediaan Kendaraan',
  '/bookings/drivers': 'Jadwal Pengemudi',
  '/bookings/history': 'Riwayat Pemesanan',
  '/transportation': 'Dashboard Armada (TMS)',
  '/transportation/vehicles': 'Master Data Kendaraan Sekolah',
  '/transportation/inspections': 'Inspeksi Keselamatan Kendaraan',
  '/transportation/repairs': 'Laporan Kerusakan & Perbaikan',
  '/transportation/maintenance': 'Perawatan Berkala (Preventive)',
  '/transportation/history': 'Riwayat Terintegrasi Kendaraan',
  '/transportation/costs': 'Biaya Operasional Armada',
  '/transportation/reports': 'Laporan Armada & Biaya',
  '/master/departments': 'Master Unit / Departemen Sekolah',
  '/master/drivers': 'Master Pengemudi Sekolah',
  '/master/vendors': 'Master Vendor Transportasi',
  '/master/vehicle-types': 'Master Jenis Kendaraan',
  '/master/admins': 'Pengelolaan Akun Administrator',
  '/reports': 'Laporan Terintegrasi LVBMS',
  '/settings': 'Pengaturan Sistem & Audit Logs',
  '/profile': 'Profil Pengguna Sekolah',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, config, unreadNotifications, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const groups = user?.role === 'ADMIN' ? ADMIN_GROUPS : USER_GROUPS;
  const currentTitle =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith('/transportation/vehicles/')
      ? 'Detail Armada Kendaraan'
      : 'Lazuardi LVBMS');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const renderNavContent = () => (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1755CE] text-white font-display font-bold text-sm">
            LZ
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-sm text-slate-900 tracking-tight">
              LAZUARDI LVBMS
            </div>
            <div className="text-[11px] text-slate-500">
              {user?.role === 'ADMIN' ? 'General Affairs ERP' : 'Portal Transportasi'}
            </div>
          </div>
        </Link>
        <button
          type="button"
          className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/bookings' || item.to === '/transportation'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[#1755CE] text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )
                    }
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.to === '/notifications' && unreadNotifications > 0 && (
                      <span className="tabular-nums text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-600 text-white">
                        {unreadNotifications}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4 shrink-0">
        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-900 truncate">{user?.name}</div>
          <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
          <div className="text-[11px] text-[#1755CE] font-medium mt-0.5">
            {user?.role === 'ADMIN' ? user.adminRole || 'Administrator GA' : 'User Sekolah'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        {renderNavContent()}
      </aside>

      {/* Mobile / Tablet Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-[276px] max-w-[85vw] h-full">
            {renderNavContent()}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate font-display">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Notifikasi"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
                  {unreadNotifications}
                </span>
              )}
            </Link>
            <Link
              to="/bookings/internal"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#1755CE] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1142A3] whitespace-nowrap shrink-0"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Ajukan Kendaraan</span>
            </Link>
          </div>
        </header>

        {config?.storage.isEphemeralServerless && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                {user?.role === 'ADMIN'
                  ? 'Mode Memori Sementara Vercel (/tmp): Atur Environment Variables Google Sheets Service Account di Vercel agar booking User & Admin tersimpan permanen dan tersinkron.'
                  : 'Database Google Sheets belum dikonfigurasi di server Vercel ini. Data sementara pada sesi ini mungkin belum tersinkron ke halaman Admin hingga dikonfigurasi oleh Admin GA.'}
              </span>
            </div>
            {user?.role === 'ADMIN' && (
              <Link
                to="/settings"
                className="font-semibold text-[#1755CE] hover:underline whitespace-nowrap shrink-0"
              >
                Buka Panduan Setup →
              </Link>
            )}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
