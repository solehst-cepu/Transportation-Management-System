import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FileEdit,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils.ts';

type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function resolveTone(status: string): SemanticTone {
  const s = status.toLowerCase();
  if (
    s.includes('layak operasional') ||
    s === 'layak' ||
    s === 'aktif' ||
    s === 'tersedia' ||
    s === 'disetujui' ||
    s === 'dijadwalkan' ||
    s === 'dipesan' ||
    s === 'selesai' ||
    s === 'ditutup' ||
    s === 'aman' ||
    s === 'reviewed' ||
    s === 'baik'
  ) {
    return 'success';
  }
  if (
    s.includes('tidak layak') ||
    s === 'ditolak' ||
    s === 'rusak' ||
    s === 'kritis' ||
    s === 'terlambat' ||
    s.includes('blokir') ||
    s === 'nonaktif' ||
    s === 'tidak_aktif'
  ) {
    return 'danger';
  }
  if (
    s.includes('revisi') ||
    s.includes('catatan') ||
    s.includes('perhatian') ||
    s.includes('mendekati') ||
    s.includes('jatuh tempo') ||
    s.includes('menunggu') ||
    s.includes('suku cadang') ||
    s === 'tinggi'
  ) {
    return 'warning';
  }
  if (
    s.includes('perjalanan') ||
    s.includes('review') ||
    s.includes('pencarian') ||
    s.includes('penawaran') ||
    s.includes('perbaikan') ||
    s.includes('pengerjaan') ||
    s === 'diajukan' ||
    s === 'terjadwal' ||
    s === 'diproses perbaikan' ||
    s === 'submitted'
  ) {
    return 'info';
  }
  return 'neutral';
}

const TONE_CLASSES: Record<SemanticTone, string> = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  danger: 'text-red-700 bg-red-50 border-red-200',
  info: 'text-[#1755CE] bg-blue-50 border-blue-200',
  neutral: 'text-slate-600 bg-slate-100 border-slate-200',
};

function getToneIcon(status: string, tone: SemanticTone) {
  const s = status.toLowerCase();
  if (s.includes('perjalanan')) return <Truck className="h-3.5 w-3.5 shrink-0" />;
  if (s.includes('blokir')) return <ShieldAlert className="h-3.5 w-3.5 shrink-0" />;
  if (s.includes('revisi') || s === 'draft') return <FileEdit className="h-3.5 w-3.5 shrink-0" />;
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
  if (tone === 'danger') return s === 'nonaktif' || s === 'tidak_aktif' ? <Ban className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />;
  if (tone === 'warning') return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  return <Clock className="h-3.5 w-3.5 shrink-0" />;
}

const LABEL_MAP: Record<string, string> = {
  layak: 'Layak Operasional',
  layak_dengan_catatan: 'Layak dgn Catatan',
  tidak_layak: 'Tidak Layak',
  belum_diverifikasi: 'Belum Diverifikasi',
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
  tidak_aktif: 'Tidak Aktif',
  tersedia: 'Tersedia',
  dijadwalkan: 'Dijadwalkan',
  dalam_perjalanan: 'Dalam Perjalanan',
};

export function StatusLabel({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const display = LABEL_MAP[status] || status;
  const tone = resolveTone(display);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0',
        TONE_CLASSES[tone],
        className
      )}
    >
      {getToneIcon(display, tone)}
      <span>{display}</span>
    </span>
  );
}
