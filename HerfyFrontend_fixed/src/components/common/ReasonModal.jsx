import { useState } from 'react';
import { FaTimes, FaExclamationTriangle } from 'react-icons/fa';

// Modal that collects a required text reason before calling onConfirm
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {danger && (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emergency/10 text-emergency">
                <FaExclamationTriangle size={15} />
              </div>
            )}
            <h3 className="text-base font-bold text-textDark">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-textGray hover:bg-neutral hover:text-textDark transition-all"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="اكتب السبب بوضوح هنا..."
          className="input-field w-full resize-none text-sm mb-4"
          autoFocus
        />

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline text-sm py-2 px-4"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={!reason.trim() || submitting}
            onClick={handleConfirm}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              danger
                ? 'bg-emergency hover:bg-emergency/90 shadow-emergency/20'
                : 'bg-primary hover:bg-primary/90 shadow-primary/20'
            }`}
          >
            {submitting ? 'جارِ التنفيذ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
