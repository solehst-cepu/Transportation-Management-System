import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';

export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemName: string;
  description?: string;
  allowForceDelete?: boolean;
  defaultForce?: boolean;
  loading?: boolean;
  onConfirm: (forceDelete: boolean) => Promise<void> | void;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  itemName,
  description,
  allowForceDelete = false,
  defaultForce = false,
  loading = false,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [forceDelete, setForceDelete] = useState(defaultForce);

  useEffect(() => {
    if (open) {
      setForceDelete(defaultForce);
    }
  }, [open, defaultForce]);

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Tindakan ini dilakukan oleh Administrator / Super Admin dan akan langsung tersimpan ke database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs text-slate-600">
          <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 text-red-900">
            Data yang akan dihapus: <strong className="font-semibold">{itemName}</strong>
          </div>

          {description && <p>{description}</p>}

          {allowForceDelete && (
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={forceDelete}
                onChange={(e) => setForceDelete(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-slate-700">
                <strong className="text-slate-900">Hapus permanen baris data</strong> meskipun sudah terhubung dengan riwayat transaksi. (Jika tidak dicentang, data yang memiliki riwayat akan dinonaktifkan saja).
              </span>
            </label>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onConfirm(forceDelete)}
            disabled={loading}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {loading ? 'Menghapus...' : 'Ya, Hapus Data'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
