import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaWallet, FaCheckCircle, FaHistory, FaTimes, FaMoneyBillWave, FaCreditCard } from 'react-icons/fa';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up">
        <div className="mb-4 flex items-center justify-between pb-2 border-b border-neutral">
          <h2 className="font-bold text-textDark text-base">سجل التحويلات — {handyman.userId?.name}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-1 text-textGray hover:bg-neutral">
            <FaTimes size={16} />
          </button>
        </div>
        {loading ? (
          <LoadingSpinner text="جاري تحميل السجل..." />
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-xs text-textGray">لا توجد تحويلات سابقة مسجلة لهذا الحرفي</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {history.map((h) => (
              <div key={h._id} className="flex justify-between items-center rounded-2xl bg-neutral/50 border border-neutral p-3 text-xs">
                <div>
                  <p className="font-extrabold text-tertiary text-sm">{formatPrice(h.amount)}</p>
                  <p className="text-textDark font-medium mt-0.5">{h.note || 'تحويل أرباح دفع إلكتروني'}</p>
                  <p className="text-[10px] text-textGray mt-0.5">المسؤول: {h.processedBy?.name || 'الأدمن'}</p>
                </div>
                <p className="text-[11px] text-textGray font-mono">{formatDate(h.createdAt)}</p>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">محافظ الحرفيين والعمولات</h1>
          <p className="text-xs text-textGray mt-0.5">متابعة عمولات الكاش المستحقة ومستحقات الدفع الإلكتروني</p>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="stat-card border-r-4 border-r-secondary">
          <div className="flex items-center justify-between">
            <span className="stat-label">عمولات كاش مستحقة للمنصة</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <FaMoneyBillWave size={15} />
            </div>
          </div>
          <p className="stat-value text-secondary">{formatPrice(totalCommission)}</p>
          <p className="text-[11px] text-textGray mt-0.5">مبالغ واجب تحصيلها من الحرفيين</p>
        </div>

        <div className="stat-card border-r-4 border-r-tertiary">
          <div className="flex items-center justify-between">
            <span className="stat-label">مستحقات دفع إلكتروني للحرفيين</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary">
              <FaCreditCard size={15} />
            </div>
          </div>
          <p className="stat-value text-tertiary">{formatPrice(totalEarnings)}</p>
          <p className="text-[11px] text-textGray mt-0.5">مبالغ واجب تحويلها للحرفيين</p>
        </div>
      </div>

      {/* Wallets List */}
      <div className="card space-y-4">
        <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">تفاصيل المحافظ</h2>

        {loading ? (
          <LoadingSpinner text="جاري تحميل أرصدة المحافظ..." />
        ) : wallets.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">💳</div>
            <p className="empty-state-title">لا توجد أرصدة أو عمولات معلقة حالياً</p>
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map((w) => (
              <div key={w._id} className="rounded-2xl border border-neutral p-4 bg-white transition-all hover:shadow-sm space-y-3">
                <div className="flex items-center gap-3 pb-2 border-b border-neutral/70">
                  <img src={getDefaultAvatar(w.userId?.name)} alt="" className="h-10 w-10 rounded-2xl object-cover border border-borderGray" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-textDark text-sm truncate">{w.userId?.name || 'حرفي'}</p>
                    <p className="text-xs text-textGray mt-0.5 font-mono" dir="ltr">{w.userId?.phone} • {w.profession}</p>
                  </div>
                  {w.isSuspended && (
                    <span className="badge-status bg-red-50 text-emergency border border-red-200 text-[11px] font-bold">معلّق</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setHistoryHandyman(w)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline bg-neutral px-2.5 py-1 rounded-xl"
                  >
                    <FaHistory size={11} /> السجل
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {w.walletBalance > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-secondary/5 border border-secondary/20 p-3">
                      <div>
                        <p className="text-[11px] text-textGray">عمولة كاش مستحقة</p>
                        <p className="font-extrabold text-secondary text-sm">{formatPrice(w.walletBalance)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSettle(w._id)}
                        disabled={actionId === w._id + '_settle'}
                        className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-secondary/90 disabled:opacity-50 transition"
                      >
                        {actionId === w._id + '_settle' ? '...' : 'تسوية النقدية'}
                      </button>
                    </div>
                  )}

                  {w.pendingEarnings > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-tertiary/5 border border-tertiary/20 p-3">
                      <div>
                        <p className="text-[11px] text-textGray">مستحقات دفع إلكتروني</p>
                        <p className="font-extrabold text-tertiary text-sm">{formatPrice(w.pendingEarnings)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePayout(w._id)}
                        disabled={actionId === w._id + '_payout'}
                        className="rounded-xl bg-tertiary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-tertiary/90 disabled:opacity-50 transition"
                      >
                        {actionId === w._id + '_payout' ? '...' : 'تحويل المستحقات'}
                      </button>
                    </div>
                  )}
                </div>

                {w.totalPaidOut > 0 && (
                  <p className="text-[11px] text-textGray pt-1">
                    إجمالي ما تم تحويله سابقاً: <span className="font-bold text-textDark">{formatPrice(w.totalPaidOut)}</span>
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
