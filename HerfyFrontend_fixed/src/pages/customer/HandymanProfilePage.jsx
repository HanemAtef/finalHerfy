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
import { formatPrice, formatDate, getHandymanImage, getDefaultAvatar } from '../../utils/helpers';

// Matches the reference video's structure for this screen: header card, then
// three pill tabs (نبذة / التقييمات / معرض الأعمال) instead of one long
// scroll — with finalHerfy's own colors/branding, not the video's.
const TABS = [
  { key: 'about', label: 'نبذة' },
  { key: 'reviews', label: 'التقييمات' },
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
        // The API returns { msg, data: [...] } — reading `.reviews` (which
        // doesn't exist) used to silently fall back to the whole response
        // object, so the review list was never actually rendered anywhere.
        setReviews(reviewsRes.data.data || []);
      } catch {
        setHandyman(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Chat is scoped per order (there is no "generic" conversation with a handyman
  // until a request exists). So "راسل" looks for an existing open order between
  // this customer and this handyman and opens that chat — otherwise it explains
  // that messaging opens once an order is placed, instead of doing nothing.
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
        setChatNotice('يمكنك مراسلة الحرفي بعد إنشاء طلب معه — المحادثة تفتح تلقائيًا داخل صفحة تتبع الطلب.');
      }
    } catch {
      setChatNotice('تعذر التحقق من طلباتك حاليًا، حاول مرة أخرى.');
    } finally {
      setCheckingChat(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!handyman) return <p className="text-center text-emergency">لم يتم العثور على الحرفي</p>;

  const gallery = handyman.gallery?.length
    ? handyman.gallery
    : [getHandymanImage(0), getHandymanImage(1), getHandymanImage(2)];

  const avgRating = handyman.rating ? handyman.rating.toFixed(1) : reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '—';

  return (
    <div className="pb-24">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="text-primary">
            <FaArrowRight size={20} />
          </button>
          <h1 className="text-xl font-bold text-primary">تفاصيل الحرفي</h1>
        </div>
        <div className="flex gap-3 text-primary">
          <FaHeart className="cursor-pointer" />
          <FaShareAlt className="cursor-pointer" />
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="relative shrink-0">
            <img
              src={handyman.profileImage || getDefaultAvatar(handyman.name)}
              alt={handyman.name}
              className="h-28 w-28 rounded-full border-4 border-primary/20 object-cover"
            />
            {handyman.verified && (
              <FaCheckCircle className="absolute bottom-1 right-1 text-tertiary" size={20} />
            )}
          </div>
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-textDark">{handyman.name}</h2>
              {handyman.verified && <VerifiedBadge />}
            </div>
            <p className="mb-2 font-medium text-secondary">{handyman.profession}</p>
            <div className="mb-2 flex items-center gap-1 text-sm text-textGray">
              <FaStar className="text-secondary" />
              {avgRating} ({reviews.length} تقييم)
            </div>
            {handyman.city && (
              <div className="mb-2 flex items-center gap-2 text-sm text-textGray">
                <FaMapMarkerAlt className="text-primary" /> {handyman.city}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-textGray">
              <FaMoneyBillWave className="text-secondary" />
              {formatPrice(handyman.price)} / ساعة
            </div>
          </div>
          <div className="flex gap-2">
            <a href={`tel:${handyman.phone}`} className="btn-primary flex items-center gap-2 text-sm">
              <FaPhone /> اتصل
            </a>
            <button
              type="button"
              onClick={handleMessageClick}
              disabled={checkingChat}
              className="btn-outline flex items-center gap-2 text-sm"
            >
              <FaComments /> {checkingChat ? 'جاري التحقق...' : 'راسل'}
            </button>
          </div>
        </div>
        {chatNotice && (
          <p className="mt-4 rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary">{chatNotice}</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { icon: FaCheckCircle, color: 'text-secondary', value: handyman.completedOrders ?? 0, label: 'مهمة مكتملة' },
          { icon: FaAward, color: 'text-secondary', value: `${handyman.experienceYears || 0} سنوات`, label: 'خبرة' },
          { icon: FaBriefcase, color: 'text-tertiary', value: handyman.isAvailable ? 'متاح' : 'غير متاح', label: 'الحالة' },
        ].map(({ icon: Icon, color, value, label }) => (
          <div key={label} className="card text-center">
            <Icon className={`mx-auto mb-2 ${color}`} size={22} />
            <p className="font-bold text-textDark">{value}</p>
            <p className="text-xs text-textGray">{label}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'border border-borderGray text-textGray hover:border-primary hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'about' && (
        <section className="card mb-6">
          <h3 className="mb-3 font-bold text-textDark">نبذة عن الحرفي</h3>
          <p className="text-sm leading-relaxed text-textGray">
            {handyman.bio || 'لم يضف الحرفي نبذة تعريفية بعد.'}
          </p>
        </section>
      )}

      {activeTab === 'reviews' && (
        <section className="mb-6 space-y-3">
          {reviews.length === 0 ? (
            <p className="card py-8 text-center text-sm text-textGray">لا توجد تقييمات بعد</p>
          ) : (
            reviews.map((r) => (
              <div key={r._id} className="card">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={getDefaultAvatar(r.customerId?.name)} alt="" className="h-8 w-8 rounded-full" />
                    <span className="text-sm font-bold text-textDark">{r.customerId?.name || 'عميل'}</span>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-secondary">
                    <FaStar size={12} /> {r.rating}
                  </span>
                </div>
                {r.comment && <p className="text-sm text-textGray">{r.comment}</p>}
                <p className="mt-2 text-xs text-textGray">{formatDate(r.createdAt)}</p>
              </div>
            ))
          )}
        </section>
      )}

      {activeTab === 'gallery' && (
        <section className="mb-6">
          {gallery.length === 0 ? (
            <p className="card py-8 text-center text-sm text-textGray">لا يوجد معرض أعمال بعد</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {gallery.map((img, i) => (
                <img key={i} src={img} alt="" className="h-28 w-full rounded-xl object-cover" />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t border-borderGray bg-white p-4 shadow-lg md:static md:mt-6 md:rounded-xl md:border">
        <div className="mx-auto flex max-w-container-max items-center justify-between">
          <div>
            <p className="text-xs text-textGray">التكلفة التقريبية</p>
            <p className="text-xl font-bold text-textDark">{formatPrice(handyman.price)}/ساعة</p>
          </div>
          <Link
            to={`/customer/create-order/${id}`}
            className="flex items-center gap-2 rounded-xl bg-tertiary px-6 py-3 font-bold text-white hover:bg-tertiary/90"
          >
            <FaRocket /> اطلب الخدمة
          </Link>
        </div>
      </div>
    </div>
  );
}
