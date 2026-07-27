import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaWallet, FaCheckCircle } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatPrice, getDefaultAvatar } from '../../utils/helpers';

export default function AdminWalletsPage() {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState(null);

  const load = () => {
    setLoading(true);
    adminService
      .getWallets()
      .then((res) => setWallets(res.data.data || []))
      .catch(() => setWallets([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSettle = async (handymanId) => {
    if (!window.confirm('تأكيد تسوية الرصيد؟ سيتم تصفير المبلغ المستحق وإلغاء أي تعليق على الحساب.')) return;
    setSettlingId(handymanId);
    try {
      await adminService.settleWallet(handymanId);
      setWallets((prev) => prev.filter((w) => w._id !== handymanId));
    } finally {
      setSettlingId(null);
    }
  };

  const totalOwed = wallets.reduce((sum, w) => sum + (w.walletBalance || 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary">محافظ الحرفيين (العمولات المستحقة)</h1>
          <p className="text-sm text-textGray">
            عمولة المنصة على الطلبات المدفوعة كاش — الحرفي يُعلَّق تلقائياً حتى تسوية رصيده
          </p>
        </div>
      </div>

      <div className="mb-6 card border-r-4 border-secondary">
        <p className="text-sm text-textGray">إجمالي العمولات المستحقة حالياً</p>
        <p className="text-2xl font-bold text-secondary">{formatPrice(totalOwed)}</p>
      </div>

      <div className="card">
        {loading ? (
          <LoadingSpinner />
        ) : wallets.length === 0 ? (
          <p className="py-8 text-center text-textGray">
            <FaWallet className="mx-auto mb-2" size={24} /> لا توجد أرصدة مستحقة حالياً
          </p>
        ) : (
          <div className="space-y-3">
            {wallets.map((w) => (
              <div key={w._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borderGray p-4">
                <div className="flex items-center gap-3">
                  <img src={getDefaultAvatar(w.userId?.name)} alt="" className="h-10 w-10 rounded-full" />
                  <div>
                    <p className="font-bold text-textDark">{w.userId?.name}</p>
                    <p className="text-xs text-textGray">{w.userId?.phone} · {w.profession}</p>
                  </div>
                  {w.isSuspended && (
                    <span className="rounded-full bg-emergency/10 px-3 py-1 text-xs font-bold text-emergency">معلّق</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-secondary">{formatPrice(w.walletBalance)}</span>
                  <button
                    type="button"
                    onClick={() => handleSettle(w._id)}
                    disabled={settlingId === w._id}
                    className="flex items-center gap-2 rounded-lg bg-tertiary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <FaCheckCircle size={12} /> {settlingId === w._id ? '...' : 'تسوية الرصيد'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
