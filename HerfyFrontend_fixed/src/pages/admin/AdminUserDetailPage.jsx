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
  FaShieldAlt,
  FaFileAlt,
} from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import { ORDER_STATUS_LABELS, ROLE_LABELS, formatDate, formatPrice, getDefaultAvatar } from '../../utils/helpers';

const STATUS_BADGE = {
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  disputed: 'bg-amber-50 text-amber-700 border border-amber-200',
  'in-progress': 'bg-primary/10 text-primary border border-primary/20',
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

  if (loading) return <LoadingSpinner text="جاري تحميل ملف المستخدم..." />;

  if (error || !data) {
    return (
      <div className="card py-16 text-center text-textGray">
        <p className="mb-4 text-sm font-semibold">{error || 'المستخدم غير موجود'}</p>
        <button type="button" onClick={() => navigate('/admin/users')} className="btn-primary text-xs py-2 px-5">
          الرجوع لقائمة المستخدمين
        </button>
      </div>
    );
  }

  const { user, handymanProfile, stats, orders, reviews } = data;
  const isHandyman = user.role === 'handyman';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
          aria-label="رجوع"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">ملف تفاصيل {isHandyman ? 'الحرفي' : 'العميل'}</h1>
          <p className="text-xs text-textGray mt-0.5">مراجعة كاملة لسجل الطلبات والتقييمات ومعرض الأعمال</p>
        </div>
      </div>

      {/* Profile Card */}
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img
            src={user.profileImage || getDefaultAvatar(user.name)}
            alt={user.name}
            className="h-16 w-16 rounded-3xl object-cover border-2 border-primary/20 shadow-sm"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-textDark">{user.name}</h2>
              {handymanProfile?.verified && <VerifiedBadge />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`badge-status text-[11px] font-bold ${isHandyman ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
              {isHandyman && handymanProfile?.profession && (
                <span className="badge-status bg-neutral text-textDark text-[11px] font-semibold flex items-center gap-1">
                  <FaBriefcase size={9} /> {handymanProfile.profession}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs font-semibold text-textGray bg-neutral/40 p-3 rounded-2xl border border-neutral">
          {user.email && (
            <span className="flex items-center gap-1.5">
              <FaEnvelope className="text-primary" /> {user.email}
            </span>
          )}
          {user.phone && (
            <span className="flex items-center gap-1.5 font-mono" dir="ltr">
              <FaPhoneAlt className="text-primary" /> {user.phone}
            </span>
          )}
          {user.location?.address && (
            <span className="flex items-center gap-1.5">
              <FaMapMarkerAlt className="text-secondary" /> {user.location.address}
            </span>
          )}
        </div>
      </div>

      {user.isBanned && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 border border-red-200 p-4 text-xs font-bold text-emergency shadow-2xs">
          <FaExclamationTriangle size={14} /> هذا الحساب محظور حالياً{user.banReason ? `: ${user.banReason}` : ''}
        </div>
      )}

      {isHandyman && handymanProfile?.bio && (
        <div className="card space-y-2">
          <h3 className="text-xs font-bold text-textDark">نبذة عن الحرفي وخبراته:</h3>
          <p className="text-xs text-textGray leading-relaxed bg-neutral/30 p-3 rounded-xl border border-neutral">{handymanProfile.bio}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="stat-card border-r-4 border-r-primary">
          <span className="stat-label">إجمالي الطلبات</span>
          <p className="stat-value text-primary">{stats.totalOrders ?? 0}</p>
        </div>
        <div className="stat-card border-r-4 border-r-tertiary">
          <span className="stat-label">طلبات مكتملة</span>
          <p className="stat-value text-tertiary">{stats.completedOrders ?? 0}</p>
        </div>
        {isHandyman ? (
          <>
            <div className="stat-card border-r-4 border-r-secondary">
              <span className="stat-label">متوسط التقييم</span>
              <p className="stat-value text-secondary flex items-center gap-1">
                <FaStar size={16} /> {(stats.rating || 0).toFixed(1)}
              </p>
            </div>
            <div className="stat-card border-r-4 border-r-blue-500">
              <span className="stat-label">رصيد المحفظة</span>
              <p className="stat-value text-primary flex items-center gap-1">
                <FaWallet size={16} /> {formatPrice(stats.walletBalance || 0)}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card border-r-4 border-r-emergency">
              <span className="stat-label">طلبات ملغاة</span>
              <p className="stat-value text-emergency">{stats.cancelledOrders ?? 0}</p>
            </div>
            <div className="stat-card border-r-4 border-r-borderGray">
              <span className="stat-label">تاريخ الانضمام</span>
              <p className="stat-value text-textDark text-sm mt-1">{formatDate(user.createdAt)}</p>
            </div>
          </>
        )}
      </div>

      {/* Documents Section (Customer & Handyman KYC/Identity) */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-neutral">
          <h2 className="flex items-center gap-2 font-bold text-textDark text-sm">
            <FaShieldAlt className="text-primary" /> وثائق ومستندات {isHandyman ? 'الحرفي' : 'العميل'}
          </h2>
          <span className="text-xs text-textGray">
            {(data.documents || user.documents || []).length} وثيقة مرفوعة
          </span>
        </div>

        {!(data.documents || user.documents) || (data.documents || user.documents).length === 0 ? (
          <div className="empty-state py-8 bg-neutral/20 rounded-2xl border border-neutral/50">
            <div className="empty-state-icon">📄</div>
            <p className="empty-state-title">لا توجد وثائق مرفوعة لهذا الحساب</p>
            <p className="empty-state-desc">لم يقم المستخدم برفع بطاقة الرقم القومي أو أي مستندات إضافية بعد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data.documents || user.documents).map((doc, idx) => {
              const url = doc.url || doc;
              const isPdf = typeof url === 'string' && /\.pdf($|\?)/i.test(url);
              const label = doc.originalName || (doc.type === 'national_id' ? 'بطاقة الرقم القومي' : doc.type === 'certificate' ? 'شهادة الخبرة' : `وثيقة رسمية #${idx + 1}`);

              return (
                <div key={idx} className="flex flex-col justify-between rounded-2xl border border-borderGray/70 bg-neutral/30 p-3.5 space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-bold text-xs text-textDark line-clamp-1">{label}</span>
                      <span className="badge-status bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                        {isPdf ? 'PDF' : 'صورة'}
                      </span>
                    </div>
                    {doc.uploadedAt && (
                      <p className="text-[10px] text-textGray">
                        رُفعت بتاريخ: {new Date(doc.uploadedAt).toLocaleDateString('ar-EG')}
                      </p>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-borderGray bg-white aspect-video flex items-center justify-center">
                    {isPdf ? (
                      <div className="flex flex-col items-center gap-1.5 p-3 text-center">
                        <FaFileAlt className="text-primary" size={28} />
                        <span className="text-[11px] font-bold text-textDark">مستند PDF رسمي</span>
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt={label}
                        className="h-full w-full object-contain cursor-pointer hover:scale-105 transition-transform duration-200"
                        onClick={() => setLightbox(url)}
                      />
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    {isPdf ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary flex-1 text-[11px] py-1.5 text-center flex items-center justify-center gap-1.5"
                      >
                        <FaFileAlt size={10} /> فتح PDF ↗
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLightbox(url)}
                        className="btn-primary flex-1 text-[11px] py-1.5 flex items-center justify-center gap-1.5"
                      >
                        <FaImages size={10} /> عرض الصورة
                      </button>
                    )}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-outline text-[11px] py-1.5 px-3 flex items-center justify-center"
                      title="فتح الرابط المباشر"
                    >
                      🔗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gallery / Portfolio */}
      {isHandyman && (
        <div className="card space-y-4">
          <h2 className="flex items-center gap-2 font-bold text-textDark text-sm pb-1 border-b border-neutral">
            <FaImages className="text-primary" /> معرض الأعمال السابقة
          </h2>
          {!stats.gallery || stats.gallery.length === 0 ? (
            <p className="py-6 text-center text-xs text-textGray">لم يقم الحرفي برفع أي صور لأعماله بعد</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.gallery.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="aspect-square overflow-hidden rounded-2xl border border-neutral shadow-2xs group"
                >
                  <img src={url} alt={`عمل ${i + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reviews */}
      {isHandyman && reviews?.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">آخر تقييمات العملاء</h2>
          <div className="space-y-3">
            {reviews.slice(0, 5).map((r) => (
              <div key={r._id} className="border-b border-neutral pb-3 last:border-0 last:pb-0 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-textDark">{r.customerId?.name || 'عميل'}</span>
                  <span className="flex items-center gap-1 font-bold text-secondary">
                    <FaStar size={11} /> {r.rating}
                  </span>
                </div>
                {r.comment && <p className="text-textGray leading-relaxed">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders History */}
      <div className="card space-y-4">
        <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">سجل طلبات المستخدم على المنصة</h2>
        {!orders || orders.length === 0 ? (
          <p className="py-6 text-center text-xs text-textGray">لا توجد طلبات مسجلة بعد</p>
        ) : (
          <div className="table-wrapper">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">الخدمة</th>
                  <th className="table-th">{isHandyman ? 'العميل' : 'الحرفي'}</th>
                  <th className="table-th">السعر</th>
                  <th className="table-th">التاريخ</th>
                  <th className="table-th text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id} className="table-tr">
                    <td className="table-td font-bold text-xs text-textDark">{o.serviceType || 'خدمة صيانة'}</td>
                    <td className="table-td text-xs text-textGray">
                      {isHandyman ? o.customerId?.name || '—' : o.handymanId?.name || '—'}
                    </td>
                    <td className="table-td text-xs font-extrabold text-primary">{formatPrice(o.finalPrice ?? o.price ?? 0)}</td>
                    <td className="table-td text-xs text-textGray">{formatDate(o.createdAt)}</td>
                    <td className="table-td text-center">
                      <span className={`badge-status text-[11px] font-bold ${STATUS_BADGE[o.status] || 'bg-neutral text-textDark'}`}>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-xs"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="عمل الحرفي" className="max-h-[90vh] max-w-[90vw] rounded-3xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
