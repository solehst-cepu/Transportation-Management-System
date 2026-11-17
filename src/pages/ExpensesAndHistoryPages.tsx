import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { exportExpensesExcel, exportExpensesPdf } from '../lib/pdfExport.ts';
import { formatDateTimeWib, formatDateWib, formatIdr } from '../lib/utils.ts';
import { Expense, ExpenseCategory, Vehicle, VehicleHistory } from '../../shared/types.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { useToast } from '../components/ui/toast.tsx';

export function ExpensesPage() {
  const { notify } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    vehicle_id: '',
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'Pajak kendaraan' as ExpenseCategory,
    description: '',
    vendor_name: '',
    amount: 0,
    notes: '',
  });

  const loadAll = useCallback(async () => {
    const [eRes, vRes] = await Promise.all([
      apiRequest<{ expenses: Expense[] }>('/api/expenses'),
      apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
    ]);
    setExpenses(eRes.expenses);
    setVehicles(vRes.vehicles);
    if (vRes.vehicles[0]) {
      setForm((p) => ({ ...p, vehicle_id: p.vehicle_id || vRes.vehicles[0].vehicle_id }));
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));

  const filtered = useMemo(
    () => expenses.filter((e) => !filterVehicle || e.vehicle_id === filterVehicle),
    [expenses, filterVehicle]
  );

  const totalAmount = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/expenses', { method: 'POST', body: JSON.stringify(form) });
    notify('Catatan biaya operasional disimpan.', 'success');
    setModalOpen(false);
    await loadAll();
  };

  const handleDelete = async (id: string) => {
    await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' });
    notify('Catatan biaya dihapus.', 'info');
    await loadAll();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select
            value={filterVehicle}
            onChange={(e) => setFilterVehicle(e.target.value)}
            className="w-60"
          >
            <option value="">Semua Kendaraan Sekolah</option>
            {vehicles.map((v) => (
              <option key={v.vehicle_id} value={v.vehicle_id}>
                {v.plate_number} — {v.vehicle_name}
              </option>
            ))}
          </Select>
          <div className="text-xs font-medium text-slate-600">
            Total: <span className="font-bold text-slate-900 tabular-nums">{formatIdr(totalAmount)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportExpensesExcel(filtered, vehicles)}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExpensesPdf(filtered, vehicles)}>
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Catat Biaya
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Kendaraan</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Deskripsi & Vendor</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 font-medium text-right">Jumlah</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((exp) => {
                const v = vehMap.get(exp.vehicle_id);
                return (
                  <tr key={exp.expense_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs tabular-nums">{formatDateWib(exp.expense_date)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">
                      {v ? `${v.plate_number} — ${v.vehicle_name}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{exp.category}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-slate-900">{exp.description}</div>
                      <div className="text-slate-500">{exp.vendor_name}</div>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-500">{exp.reference_type}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                      {formatIdr(exp.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {exp.reference_type === 'MANUAL' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDelete(exp.expense_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Catat Biaya Operasional Kendaraan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <Label>Kendaraan</Label>
              <Select
                value={form.vehicle_id}
                onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
              >
                {vehicles.map((v) => (
                  <option key={v.vehicle_id} value={v.vehicle_id}>
                    {v.plate_number} — {v.vehicle_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tanggal</Label>
                <Input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Kategori</Label>
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                >
                  {[
                    'Servis berkala',
                    'Perbaikan',
                    'Suku cadang',
                    'Pajak kendaraan',
                    'KIR',
                    'Asuransi',
                    'Biaya operasional lainnya',
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bengkel / Vendor</Label>
                <Input
                  value={form.vendor_name}
                  onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Nominal (IDR)</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Catatan</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Biaya</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VehicleHistoryPage() {
  const [history, setHistory] = useState<VehicleHistory[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filterVehicle, setFilterVehicle] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest<{ history: VehicleHistory[] }>('/api/vehicle-history'),
      apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
    ])
      .then(([hRes, vRes]) => {
        setHistory(hRes.history);
        setVehicles(vRes.vehicles);
      })
      .catch(() => {
        // Handled globally on 401
      });
  }, []);

  const vehMap = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const rows = history.filter((h) => !filterVehicle || h.vehicle_id === filterVehicle);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Select
          value={filterVehicle}
          onChange={(e) => setFilterVehicle(e.target.value)}
          className="w-72"
        >
          <option value="">Semua Kendaraan Sekolah</option>
          {vehicles.map((v) => (
            <option key={v.vehicle_id} value={v.vehicle_id}>
              {v.plate_number} — {v.vehicle_name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-slate-100">
          {rows.map((h) => {
            const veh = vehMap.get(h.vehicle_id);
            return (
              <div key={h.history_id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {veh ? `${veh.plate_number} (${veh.vehicle_name})` : h.vehicle_id} ·{' '}
                    <span className="text-[#1755CE]">{h.activity_type}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{h.summary}</div>
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {formatDateTimeWib(h.occurred_at)} · {h.actor_name}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
