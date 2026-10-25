import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose, children }: {
  open: boolean; title: string; description?: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => Promise<void> | void; onClose: () => void; children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      {children}
      <div className="actions">
        <Button size="md" onClick={onClose} data-autofocus>Cancel</Button>
        <Button size="md" variant={danger ? 'danger' : 'primary'} loading={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
