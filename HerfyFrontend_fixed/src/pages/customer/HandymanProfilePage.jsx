import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaHeart,
  FaShareAlt,
  FaPhone,
  FaComments,
  FaStar,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaCheckCircle,
  FaAward,
  FaRocket,
  FaBriefcase,
} from 'react-icons/fa';
import { handymanService, reviewService, orderService } from '../../services/api';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatPrice, formatDate, getDefaultAvatar } from '../../utils/helpers';

const TABS = [
  { key: 'about', label: 'نبذة عن الحرفي' },
  { key: 'reviews', label: 'التقييمات والآراء' },
  { key: 'gallery', label: 'معرض الأعمال' },
];

export default function HandymanProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const [handyman, setHandyman] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatNotice, setChatNotice] = useState('');
  const [checkingChat, setCheckingChat] = useState(false);
  const [activeTab, setActiveTab] = useState('about');

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, reviewsRes] = await Promise.all([
          handymanService.getById(id),
          reviewService.getHandymanReviews(id),
        ]);
        setHandyman(profileRes.data);
        setReviews(reviewsRes.data.data || []);
      } catch {
        setHandyman(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleMessageClick = async () => {
    if (!user?._id) {
      navigate('/login');
      return;
    }
    setChatNotice('');
    setCheckingChat(true);
    try {
      const res = await orderService.getCustomerOrders(user._id, { limit: 50 });
      const orders = res.data.data || res.data.orders || res.data || [];
      const activeOrder = orders.find(
        (o) =>
          (o.handymanId?._id || o.handymanId) === id &&
          !['completed', 'cancelled'].includes(o.status)
      );
      if (activeOrder) {
        navigate(`/chat/${activeOrder._id}`);
      } else {
        setChatNotice('يمكنك مراسلة الحرفي بعد إرسال طلب خدمة له — تفتح نافذة المحادثة فوراً عند إنشاء الطلب.');
      }
    } catch {
      setChatNotice('تعذر التحقق من طلباتك حالياً، حاول مرة أخرى.');
    } finally {
      setCheckingChat(false);
    }
  };

  if (loading) return <LoadingSpinner text="جاري تحميل بيانات الحرفي..." />;
  if (!handyman) return <div className="card text-center py-12 text-emergency">لم يتم العثور على الحرفي المطلوب</div>;

  const gallery = Array.isArray(handyman.gallery) ? handyman.gallery : [];

  const avgRating = handyman.rating ? handyman.rating.toFixed(1) : reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '—';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
          >
            <FaArrowRight size={13} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-textDark">ملف الحرفي</h1>
            <p className="text-xs text-textGray mt-0.5">{handyman.profession}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-textGray hover:text-emergency transition-colors shadow-sm">
            <FaHeart size={14} />
          </button>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-textGray hover:text-primary transition-colors shadow-sm">
            <FaShareAlt size={14} />
          </button>
        </div>
      </div>

      {/* Main Profile Info Card */}
      <div className="card relative overflow-hidden">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative shrink-0 mx-auto sm:mx-0">
            <img
              src={handyman.profileImage || getDefaultAvatar(handyman.name)}
              alt={handyman.name}
              className="h-24 w-24 rounded-3xl border-3 border-primary/20 object-cover shadow-sm"
            />
            {handyman.verified && (
              <FaCheckCircle className="absolute -bottom-1 -right-1 text-tertiary bg-white rounded-full" size={22} />
            )}
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-right">
            <div className="mb-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-extrabold text-textDark truncate">{handyman.name}</h2>
              {handyman.verified && <VerifiedBadge />}
            </div>
            <p className="text-xs font-bold text-secondary mb-2">{handyman.profession}</p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-textGray">
              <span className="flex items-center gap-1 font-bold text-textDark">
                <FaStar className="text-secondary" size={13} />
                {avgRating} <span className="font-normal text-textGray">({reviews.length} تقييم)</span>
              </span>
              {handyman.address && (
                <span className="flex items-center gap-1 truncate">
                  <FaMapMarkerAlt className="text-primary/70" size={12} /> {handyman.address}
                </span>
              )}
              <span className="flex items-center gap-1 font-semibold text-textDark">
                <FaMoneyBillWave className="text-tertiary" size={12} />
                {formatPrice(handyman.price)} / ساعة
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex sm:flex-col gap-2 shrink-0 justify-center">
            <a
              href={`tel:${handyman.phone}`}
              className="btn-primary text-xs py-2.5 px-4 flex-1 sm:flex-none"
            >
              <FaPhone size={11} /> اتصال
            </a>
            <button
              type="button"
              onClick={handleMessageClick}
              disabled={checkingChat}
              className="btn-outline text-xs py-2.5 px-4 flex-1 sm:flex-none"
            >
              <FaComments size={13} /> {checkingChat ? '...' : 'راسل'}
            </button>
          </div>
        </div>

        {chatNotice && (
          <div className="mt-4 rounded-xl bg-primary/5 border border-primary/15 p-3 text-xs text-primary leading-relaxed">
            {chatNotice}
          </div>
        )}
      </div>

      {/* Mini Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: FaCheckCircle, color: 'text-tertiary', value: handyman.completedOrders ?? 0, label: 'مهمة منجزة' },
          { icon: FaAward, color: 'text-secondary', value: `${handyman.experienceYears || 0} سنوات`, label: 'خبرة عملية' },
          { icon: FaBriefcase, color: handyman.isAvailable ? 'text-tertiary' : 'text-textGray', value: handyman.isAvailable ? 'متاح الآن' : 'مشغول', label: 'حالة العمل' },
        ].map(({ icon: Icon, color, value, label }) => (
          <div key={label} className="card text-center p-4">
            <Icon className={`mx-auto mb-1.5 ${color}`} size={20} />
            <p className="font-extrabold text-sm text-textDark">{value}</p>
            <p className="text-[11px] text-textGray mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral pb-2 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-primary text-white shadow-sm'
                : 'text-textGray hover:bg-neutral hover:text-textDark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: About */}
      {activeTab === 'about' && (
        <section className="card space-y-2 animate-fade-in">
          <h3 className="font-bold text-sm text-textDark">نبذة عن الحرفي والخبرات</h3>
          <p className="text-xs leading-relaxed text-textGray whitespace-pre-wrap">
            {handyman.bio || 'لم يقم الحرفي بإضافة نبذة تعريفية بعد.'}
          </p>
        </section>
      )}

      {/* Tab 2: Reviews */}
      {activeTab === 'reviews' && (
        <section className="space-y-3 animate-fade-in">
          {reviews.length === 0 ? (
            <div className="card py-10 text-center text-xs text-textGray">لا توجد تقييمات مسجلة بعد</div>
          ) : (
            reviews.map((r) => (
              <div key={r._id} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={getDefaultAvatar(r.customerId?.name)} alt="" className="h-7 w-7 rounded-full" />
                    <span className="text-xs font-bold text-textDark">{r.customerId?.name || 'عميل'}</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-bold text-secondary">
                    <FaStar size={11} /> {r.rating}
                  </span>
                </div>
                {r.comment && <p className="text-xs text-textDark leading-relaxed">{r.comment}</p>}
                <p className="text-[10px] text-textGray">{formatDate(r.createdAt)}</p>
              </div>
            ))
          )}
        </section>
      )}

      {/* Tab 3: Gallery */}
      {activeTab === 'gallery' && (
        <section className="animate-fade-in">
          {gallery.length === 0 ? (
            <div className="card py-10 text-center text-xs text-textGray">لا توجد صور أعمال سابقة مضافة</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gallery.map((img, i) => (
                <img key={i} src={img} alt="" className="h-32 w-full rounded-2xl object-cover border border-neutral shadow-sm hover:scale-105 transition-transform" />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Bottom Sticky Request Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-borderGray/60 bg-white/95 backdrop-blur-md p-4 shadow-lg md:static md:rounded-2xl md:border md:shadow-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-textGray font-medium">سعر الخدمة التقديري</p>
            <p className="text-lg font-extrabold text-primary">{formatPrice(handyman.price)} <span className="text-xs font-normal text-textGray">/ ساعة</span></p>
          </div>
          <Link
            to={`/customer/create-order/${id}`}
            className="btn-secondary flex items-center gap-2 py-3 px-6 text-sm font-bold shadow-md shadow-secondary/25 active:scale-95"
          >
            <FaRocket size={14} /> اطلب الخدمة الآن
          </Link>
        </div>
      </div>
    </div>
  );
}
