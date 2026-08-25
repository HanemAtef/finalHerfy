import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaWallet, FaCheckCircle, FaHistory, FaTimes } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatPrice, formatDate, getDefaultAvatar } from '../../utils/helpers';

function PayoutHistoryModal({ handyman, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService.getPayoutHistory(handyman._id)
      .then((res) => setHistory(res.data.data || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [handyman._id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-textDark">سجل التحويلات — {handyman.userId?.name}</h2>
          <button type="button" onClick={onClose} className="text-textGray hover:text-emergency">
            <FaTimes />
          </button>
        </div>
        {loading ? <LoadingSpinner /> : history.length === 0 ? (
          <p className="py-6 text-center text-textGray">لا توجد تحويلات سابقة</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {history.map((h) => (
              <div key={h._id} className="flex justify-between rounded-lg border border-borderGray p-3 text-sm">
                <div>
                  <p className="font-bold text-tertiary">{formatPrice(h.amount)}</p>
                  <p className="text-xs text-textGray">{h.note || '—'}</p>
                  <p className="text-xs text-textGray">بواسطة: {h.processedBy?.name}</p>
                </div>
                <p className="text-xs text-textGray">{formatDate(h.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminWalletsPage() {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [historyHandyman, setHistoryHandyman] = useState(null);

  const load = () => {
    setLoading(true);
    adminService.getWallets()
      .then((res) => setWallets(res.data.data || []))
      .catch(() => setWallets([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSettle = async (handymanId) => {
    if (!window.confirm('تأكيد تسوية عمولة الكاش؟ سيتم تصفير المبلغ المستحق وإلغاء أي تعليق.')) return;
    setActionId(handymanId + '_settle');
    try {
      await adminService.settleWallet(handymanId);
      load();
    } finally {
      setActionId(null);
    }
  };

  const handlePayout = async (handymanId) => {
    const note = window.prompt('ملاحظة التحويل (اختياري) — مثال: Instapay 01xxxxxxxxx', '');
    if (note === null) return;
    setActionId(handymanId + '_payout');
    try {
      await adminService.payoutHandyman(handymanId, { note });
      load();
    } finally {
      setActionId(null);
    }
  };

  const totalCommission = wallets.reduce((s, w) => s + (w.walletBalance || 0), 0);
  const totalEarnings   = wallets.reduce((s, w) => s + (w.pendingEarnings || 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary">محافظ الحرفيين</h1>
          <p className="text-sm text-textGray">عمولات الكاش المستحقة + مستحقات الدفع الإلكتروني</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card border-r-4 border-secondary">
          <p className="text-sm text-textGray">عمولات كاش مستحقة على الحرفيين</p>
          <p className="text-2xl font-bold text-secondary">{formatPrice(totalCommission)}</p>
        </div>
        <div className="card border-r-4 border-tertiary">
          <p className="text-sm text-textGray">مستحقات كارت لم تُحوَّل بعد للحرفيين</p>
          <p className="text-2xl font-bold text-tertiary">{formatPrice(totalEarnings)}</p>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingSpinner /> : wallets.length === 0 ? (
          <p className="py-8 text-center text-textGray">
            <FaWallet className="mx-auto mb-2" size={24} /> لا توجد أرصدة معلقة حالياً
          </p>
        ) : (
          <div className="space-y-4">
            {wallets.map((w) => (
              <div key={w._id} className="rounded-xl border border-borderGray p-4">
                <div className="mb-3 flex items-center gap-3">
                  <img src={getDefaultAvatar(w.userId?.name)} alt="" className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <p className="font-bold text-textDark">{w.userId?.name}</p>
                    <p className="text-xs text-textGray">{w.userId?.phone} · {w.profession}</p>
                  </div>
                  {w.isSuspended && (
                    <span className="rounded-full bg-emergency/10 px-3 py-1 text-xs font-bold text-emergency">معلّق</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setHistoryHandyman(w)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <FaHistory size={11} /> السجل
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {w.walletBalance > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-secondary/5 p-3">
                      <div>
                        <p className="text-xs text-textGray">عمولة كاش مستحقة</p>
                        <p className="font-bold text-secondary">{formatPrice(w.walletBalance)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSettle(w._id)}
                        disabled={actionId === w._id + '_settle'}
                        className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <FaCheckCircle size={11} />
                        {actionId === w._id + '_settle' ? '...' : 'تسوية'}
                      </button>
                    </div>
                  )}

                  {w.pendingEarnings > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-tertiary/5 p-3">
                      <div>
                        <p className="text-xs text-textGray">مستحقات كارت للتحويل</p>
                        <p className="font-bold text-tertiary">{formatPrice(w.pendingEarnings)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePayout(w._id)}
                        disabled={actionId === w._id + '_payout'}
                        className="flex items-center gap-1 rounded-lg bg-tertiary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <FaCheckCircle size={11} />
                        {actionId === w._id + '_payout' ? '...' : 'تحويل'}
                      </button>
                    </div>
                  )}
                </div>

                {w.totalPaidOut > 0 && (
                  <p className="mt-2 text-xs text-textGray">
                    إجمالي ما تم تحويله: <span className="font-bold">{formatPrice(w.totalPaidOut)}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {historyHandyman && (
        <PayoutHistoryModal
          handyman={historyHandyman}
          onClose={() => setHistoryHandyman(null)}
        />
      )}
    </div>
  );
}
