import { useState } from 'react';

// Small confirmation modal that collects a required text reason before
// calling onConfirm — used everywhere an admin action needs to leave an
// audit trail (reject / suspend / ban / delete).
export default function ReasonModal({ title, confirmLabel = 'تأكيد', danger = false, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-3 text-lg font-bold text-textDark">{title}</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="اكتب السبب..."
          className="input-field w-full resize-none"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">
            إلغاء
          </button>
          <button
            type="button"
            disabled={!reason.trim() || submitting}
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              danger ? 'bg-emergency' : 'bg-primary'
            }`}
          >
            {submitting ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
