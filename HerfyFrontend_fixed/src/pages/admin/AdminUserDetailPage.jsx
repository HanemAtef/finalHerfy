import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowRight,
  FaStar,
  FaWallet,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaImages,
  FaPhoneAlt,
  FaEnvelope,
  FaMapMarkerAlt,
  FaBriefcase,
} from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import { ORDER_STATUS_LABELS, ROLE_LABELS, formatDate, formatPrice, getDefaultAvatar } from '../../utils/helpers';

const STATUS_BADGE = {
  completed: 'bg-tertiary/10 text-tertiary',
  cancelled: 'bg-emergency/10 text-emergency',
  disputed: 'bg-secondary/10 text-secondary',
};

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    adminService
      .getUserDetail(userId)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.msg || 'تعذر تحميل بيانات المستخدم'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <LoadingSpinner />;

  if (error || !data) {
    return (
      <div className="card py-16 text-center text-textGray">
        <p className="mb-4">{error || 'المستخدم غير موجود'}</p>
        <button type="button" onClick={() => navigate('/admin/users')} className="btn-secondary">
          الرجوع لقائمة المستخدمين
        </button>
      </div>
    );
  }

  const { user, handymanProfile, stats, orders, reviews } = data;
  const isHandyman = user.role === 'handyman';

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="rounded-full p-2 text-primary hover:bg-primary/5"
          aria-label="رجوع"
        >
          <FaArrowRight />
        </button>
        <h1 className="text-2xl font-bold text-primary">ملف {isHandyman ? 'الحرفي' : 'العميل'}</h1>
      </div>

      {/* Profile header */}
      <div className="card mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img
            src={user.profileImage || getDefaultAvatar(user.name)}
            alt={user.name}
            className="h-16 w-16 rounded-full object-cover"
          />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-textDark">{user.name}</p>
              {handymanProfile?.verified && <VerifiedBadge />}
            </div>
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {ROLE_LABELS[user.role] || user.role}
            </span>
            {isHandyman && handymanProfile?.profession && (
              <span className="mr-2 mt-1 inline-flex items-center gap-1 rounded-full bg-neutral px-2 py-0.5 text-xs text-textGray">
                <FaBriefcase size={10} /> {handymanProfile.profession}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-textGray">
          {user.email && (
            <span className="flex items-center gap-2">
              <FaEnvelope className="text-primary" /> {user.email}
            </span>
          )}
          {user.phone && (
            <span className="flex items-center gap-2">
              <FaPhoneAlt className="text-primary" /> {user.phone}
            </span>
          )}
          {user.location?.address && (
            <span className="flex items-center gap-2">
              <FaMapMarkerAlt className="text-primary" /> {user.location.address}
            </span>
          )}
        </div>
      </div>

      {user.isBanned && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">
          <FaExclamationTriangle /> هذا الحساب محظور حالياً{user.banReason ? `: ${user.banReason}` : ''}
        </div>
      )}

      {isHandyman && handymanProfile?.bio && (
        <div className="card mb-6">
          <h2 className="mb-2 text-sm font-bold text-textDark">نبذة عن الحرفي</h2>
          <p className="text-sm text-textGray">{handymanProfile.bio}</p>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-primary">{stats.totalOrders ?? 0}</p>
          <p className="text-xs text-textGray">إجمالي الطلبات</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-tertiary">{stats.completedOrders ?? 0}</p>
          <p className="text-xs text-textGray">طلبات مكتملة</p>
        </div>
        {isHandyman ? (
          <>
            <div className="card text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-bold text-secondary">
                <FaStar size={16} /> {(stats.rating || 0).toFixed(1)}
              </p>
              <p className="text-xs text-textGray">متوسط التقييم</p>
            </div>
            <div className="card text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-bold text-primary">
                <FaWallet size={16} /> {formatPrice(stats.walletBalance || 0)}
              </p>
              <p className="text-xs text-textGray">رصيد المحفظة</p>
            </div>
          </>
        ) : (
          <>
            <div className="card text-center">
              <p className="text-2xl font-bold text-emergency">{stats.cancelledOrders ?? 0}</p>
              <p className="text-xs text-textGray">طلبات ملغاة</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-textDark">{formatDate(user.createdAt)}</p>
              <p className="text-xs text-textGray">تاريخ الانضمام</p>
            </div>
          </>
        )}
      </div>

      {/* Portfolio / gallery — the handyman's showcased work */}
      {isHandyman && (
        <div className="card mb-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-textDark">
            <FaImages className="text-primary" /> معرض الأعمال
          </h2>
          {!stats.gallery || stats.gallery.length === 0 ? (
            <p className="py-6 text-center text-sm text-textGray">لم يقم الحرفي برفع أي صور لأعماله بعد</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.gallery.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="aspect-square overflow-hidden rounded-lg border border-borderGray"
                >
                  <img src={url} alt={`عمل ${i + 1}`} className="h-full w-full object-cover transition hover:scale-105" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reviews */}
      {isHandyman && reviews?.length > 0 && (
        <div className="card mb-6">
          <h2 className="mb-4 text-sm font-bold text-textDark">آخر التقييمات</h2>
          <div className="space-y-3">
            {reviews.slice(0, 5).map((r) => (
              <div key={r._id} className="border-b border-borderGray pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-textDark">{r.customerId?.name || 'عميل'}</span>
                  <span className="flex items-center gap-1 text-xs text-secondary">
                    <FaStar size={11} /> {r.rating}
                  </span>
                </div>
                {r.comment && <p className="mt-1 text-sm text-textGray">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order history */}
      <div className="card">
        <h2 className="mb-4 text-sm font-bold text-textDark">سجل الطلبات على المنصة</h2>
        {!orders || orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-textGray">لا يوجد طلبات بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borderGray text-textGray">
                  <th className="pb-2 text-right">الخدمة</th>
                  <th className="pb-2 text-right">{isHandyman ? 'العميل' : 'الحرفي'}</th>
                  <th className="pb-2 text-right">السعر</th>
                  <th className="pb-2 text-right">التاريخ</th>
                  <th className="pb-2 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id} className="border-b border-borderGray last:border-0">
                    <td className="py-2 text-textDark">{o.serviceType}</td>
                    <td className="py-2 text-textGray">
                      {isHandyman ? o.customerId?.name || '—' : o.handymanId?.name || '—'}
                    </td>
                    <td className="py-2 text-textDark">{formatPrice(o.finalPrice ?? o.price ?? 0)}</td>
                    <td className="py-2 text-textGray">{formatDate(o.createdAt)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] || 'bg-neutral text-textGray'}`}>
                        {ORDER_STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="عمل الحرفي" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
