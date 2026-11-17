import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Plus,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { exportInspectionPdf } from '../lib/pdfExport.ts';
import { formatDateTimeWib } from '../lib/utils.ts';
import {
  Inspection,
  InspectionCategory,
  InspectionItemResult,
  InspectionItemValue,
  InspectionTemplate,
  Vehicle,
} from '../../shared/types.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';
import { useToast } from '../components/ui/toast.tsx';

const VALUES: InspectionItemValue[] = ['Baik', 'Perlu Perhatian', 'Rusak', 'Tidak Berlaku'];

export function InspectionsPage() {
  const { user } = useAuth();
  const { notify } = useToast();

  const [tab, setTab] = useState<'history' | 'form' | 'template'>('history');
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    vehicle_id: '',
    inspection_type: 'Harian' as Inspection['inspection_type'],
    inspector_name: user?.name || '',
    odometer: 0,
    location: 'Kampus Lazuardi Cinere',
    general_notes: '',
    create_damage_report: true,
  });
  const [items, setItems] = useState<InspectionItemResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [insRes, vehRes, tplRes] = await Promise.all([
        apiRequest<{ inspections: Inspection[] }>('/api/inspections'),
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
        apiRequest<{ template: InspectionTemplate }>('/api/inspection-templates'),
      ]);
      setInspections(insRes.inspections);
      setVehicles(vehRes.vehicles);
      setTemplate(tplRes.template);
      if (vehRes.vehicles[0]) {
        setForm((p) => ({
          ...p,
          vehicle_id: p.vehicle_id || vehRes.vehicles[0].vehicle_id,
          odometer: p.odometer || vehRes.vehicles[0].last_odometer,
        }));
      }
      setItems(
        tplRes.template.items.map((ti) => ({
          item_id: ti.item_id,
          category: ti.category,
          label: ti.label,
          is_critical: ti.is_critical,
          value: 'Baik',
          notes: '',
          photo_url: '',
          recommendation: '',
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const groupedItems = useMemo(() => {
    const map = new Map<InspectionCategory, InspectionItemResult[]>();
    for (const item of items) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [items]);

  const criticalBrokenCount = items.filter((i) => i.is_critical && i.value === 'Rusak').length;

  const submitInspection = async (saveAsDraft: boolean) => {
    setSubmitting(true);
    try {
      const res = await apiRequest<{ inspection: Inspection }>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          items,
          save_as_draft: saveAsDraft,
        }),
      });
      notify(
        saveAsDraft
          ? `Draft ${res.inspection.inspection_number} disimpan.`
          : res.inspection.triggered_block
          ? `Inspeksi ${res.inspection.inspection_number} selesai — UNIT DIBLOKIR OTOMATIS karena temuan kritis.`
          : `Inspeksi ${res.inspection.inspection_number} berhasil dikirim (${res.inspection.result}).`,
        res.inspection.triggered_block ? 'error' : 'success'
      );
      setTab('history');
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan inspeksi.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (id: string) => {
    await apiRequest(`/api/inspections/${id}/review`, { method: 'POST' });
    notify('Inspeksi ditandai telah direview oleh GA.', 'success');
    await loadAll();
  };

  const handleToggleCriticalTemplate = async (itemId: string) => {
    if (!template) return;
    const nextItems = template.items.map((it) =>
      it.item_id === itemId ? { ...it, is_critical: !it.is_critical } : it
    );
    const updated = await apiRequest<{ template: InspectionTemplate }>('/api/inspection-templates', {
      method: 'PUT',
      body: JSON.stringify({ ...template, items: nextItems }),
    });
    setTemplate(updated.template);
    notify('Template inspeksi diperbarui.', 'success');
  };

  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              tab === 'history' ? 'bg-white text-[#1755CE] shadow-xs' : 'text-slate-600'
            }`}
          >
            Riwayat Inspeksi
          </button>
          <button
            type="button"
            onClick={() => setTab('form')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
              tab === 'form' ? 'bg-white text-[#1755CE] shadow-xs' : 'text-slate-600'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Isi Form Inspeksi
          </button>
          <button
            type="button"
            onClick={() => setTab('template')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
              tab === 'template' ? 'bg-white text-[#1755CE] shadow-xs' : 'text-slate-600'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Template & Item Kritis
          </button>
        </div>
      </div>

      {tab === 'history' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat riwayat inspeksi...</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">No. Inspeksi</th>
                    <th className="px-4 py-3 font-medium">Kendaraan</th>
                    <th className="px-4 py-3 font-medium">Jenis & Pemeriksa</th>
                    <th className="px-4 py-3 font-medium">Odometer</th>
                    <th className="px-4 py-3 font-medium">Hasil</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inspections.map((ins) => {
                    const veh = vehMap.get(ins.vehicle_id);
                    return (
                      <tr key={ins.inspection_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs font-medium tabular-nums">
                          <div>{ins.inspection_number}</div>
                          <div className="text-[11px] text-slate-400 font-sans">
                            {formatDateTimeWib(ins.inspected_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-slate-900">{ins.plate_number}</div>
                          <div className="text-slate-500">{veh?.vehicle_name || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium text-slate-800">{ins.inspection_type}</div>
                          <div className="text-slate-500">{ins.inspector_name}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {ins.odometer.toLocaleString('id-ID')} km
                        </td>
                        <td className="px-4 py-3">
                          <StatusLabel status={ins.result} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusLabel status={ins.status} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                          {ins.status === 'Submitted' && (
                            <Button size="sm" variant="outline" onClick={() => void handleReview(ins.inspection_id)}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Review
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => exportInspectionPdf(ins, veh?.vehicle_name || ins.plate_number)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'form' && (
        <div className="space-y-5 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#1755CE]" />
                Form Inspeksi Keselamatan Kendaraan (Mobile-Ready)
              </CardTitle>
              <CardDescription>
                Item bertanda Kritis yang bernilai &ldquo;Rusak&rdquo; akan otomatis memblokir unit dari alokasi pemesanan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label>Kendaraan Sekolah</Label>
                  <Select
                    value={form.vehicle_id}
                    onChange={(e) => {
                      const v = vehMap.get(e.target.value);
                      setForm({
                        ...form,
                        vehicle_id: e.target.value,
                        odometer: v?.last_odometer || 0,
                      });
                    }}
                  >
                    {vehicles.map((v) => (
                      <option key={v.vehicle_id} value={v.vehicle_id}>
                        {v.plate_number} — {v.vehicle_name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Jenis Inspeksi</Label>
                  <Select
                    value={form.inspection_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        inspection_type: e.target.value as Inspection['inspection_type'],
                      })
                    }
                  >
                    <option value="Harian">Harian</option>
                    <option value="Mingguan">Mingguan</option>
                    <option value="Bulanan">Bulanan</option>
                    <option value="Sebelum Perjalanan">Sebelum Perjalanan</option>
                    <option value="Setelah Perjalanan">Setelah Perjalanan</option>
                    <option value="Khusus">Inspeksi Khusus</option>
                  </Select>
                </div>
                <div>
                  <Label>Odometer Saat Ini (km)</Label>
                  <Input
                    type="number"
                    value={form.odometer}
                    onChange={(e) => setForm({ ...form, odometer: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Nama Pemeriksa</Label>
                  <Input
                    value={form.inspector_name}
                    onChange={(e) => setForm({ ...form, inspector_name: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Lokasi Pemeriksaan</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>

              {criticalBrokenCount > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">
                      Terdeteksi {criticalBrokenCount} item kritis rusak!
                    </span>{' '}
                    Menekan Submit akan otomatis memblokir kendaraan ini dari pemesanan dan memberi peringatan ke seluruh Admin GA.
                  </div>
                </div>
              )}

              <div className="space-y-5 pt-2">
                {groupedItems.map(([category, catItems]) => (
                  <div key={category} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-800">
                      {category}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {catItems.map((it) => (
                        <div key={it.item_id} className="p-4 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                              <span>{it.label}</span>
                              {it.is_critical && (
                                <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                  Kritis
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:flex gap-1.5">
                              {VALUES.map((val) => {
                                const selected = it.value === val;
                                const activeStyle =
                                  val === 'Baik'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : val === 'Perlu Perhatian'
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : val === 'Rusak'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-slate-600 text-white border-slate-600';
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() =>
                                      setItems((prev) =>
                                        prev.map((x) =>
                                          x.item_id === it.item_id ? { ...x, value: val } : x
                                        )
                                      )
                                    }
                                    className={`min-h-[40px] px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                                      selected
                                        ? activeStyle
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    {val}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {(it.value === 'Rusak' || it.value === 'Perlu Perhatian') && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <Input
                                placeholder="Catatan temuan..."
                                value={it.notes}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.item_id === it.item_id ? { ...x, notes: e.target.value } : x
                                    )
                                  )
                                }
                              />
                              <Input
                                placeholder="Rekomendasi tindakan..."
                                value={it.recommendation}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.item_id === it.item_id
                                        ? { ...x, recommendation: e.target.value }
                                        : x
                                    )
                                  )
                                }
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Label>Catatan Umum Inspeksi</Label>
                <Textarea
                  value={form.general_notes}
                  onChange={(e) => setForm({ ...form, general_notes: e.target.value })}
                />
              </div>

              {criticalBrokenCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.create_damage_report}
                    onChange={(e) => setForm({ ...form, create_damage_report: e.target.checked })}
                  />
                  <span>Buat Laporan Kerusakan otomatis dari temuan item kritis ini</span>
                </label>
              )}

              <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => void submitInspection(true)}
                >
                  Save Draft
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitInspection(false)}
                >
                  Submit Hasil Inspeksi
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'template' && template && (
        <Card>
          <CardHeader>
            <CardTitle>Template Checklist Inspeksi ({template.items.length} Item)</CardTitle>
            <CardDescription>
              Tandai item keselamatan yang berstatus Kritis (memicu blokir operasional otomatis jika Rusak).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3.5">Kategori</th>
                  <th className="p-3.5">Item Pemeriksaan</th>
                  <th className="p-3.5">Status Kritis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {template.items.map((it) => (
                  <tr key={it.item_id}>
                    <td className="p-3.5 font-medium text-slate-700">{it.category}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{it.label}</td>
                    <td className="p-3.5">
                      <button
                        type="button"
                        onClick={() => void handleToggleCriticalTemplate(it.item_id)}
                        className={`px-3 py-1 rounded-md border text-xs font-medium cursor-pointer ${
                          it.is_critical
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {it.is_critical ? (
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Item Kritis
                          </span>
                        ) : (
                          'Standar'
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
