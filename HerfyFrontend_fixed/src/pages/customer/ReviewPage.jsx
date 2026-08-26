import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaArrowRight, FaPaperPlane, FaShieldAlt } from 'react-icons/fa';
import { reviewService } from '../../services/api';
import { fetchOrderById } from '../../store/slices/orderSlice';
import StarRating from '../../components/common/StarRating';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';
import AlertMessage from '../../components/common/AlertMessage';

const RATING_LABELS = ['', 'سيء 😞', 'مقبول 😐', 'جيد 🙂', 'جيد جداً 😊', 'ممتاز ومتميز 🌟'];

export default function ReviewPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading: orderLoading } = useSelector((state) => state.orders);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dispatch(fetchOrderById(orderId));
  }, [dispatch, orderId]);

  const handyman = currentOrder?.handymanId || {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await reviewService.create({ orderId, rating, comment });
      navigate('/customer/dashboard');
    } catch (err) {
      setError(err.response?.data?.msg || 'فشل إرسال التقييم');
    } finally {
      setLoading(false);
    }
  };

  if (orderLoading && !currentOrder) {
    return <LoadingSpinner text="جاري تحميل بيانات التقييم..." />;
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
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
          <h1 className="text-2xl font-extrabold text-textDark">تقييم الخدمة</h1>
          <p className="text-xs text-textGray mt-0.5">شاركنا رأيك حول أداء الحرفي</p>
        </div>
      </div>

      {/* Main Review Card */}
      <div className="card overflow-hidden p-0 shadow-[var(--shadow-card)]">
        <div className="h-20 bg-gradient-to-l from-primary to-primary/85" />
        <div className="px-6 pb-6 pt-0">
          <img
            src={handyman.profileImage || getDefaultAvatar(handyman.name)}
            alt=""
            className="relative -mt-10 mx-auto h-20 w-20 rounded-3xl border-3 border-white object-cover shadow-md"
          />
          <div className="mt-3 text-center">
            <h2 className="font-extrabold text-textDark text-lg">{handyman.name || 'الحرفي'}</h2>
            <p className="text-xs font-semibold text-secondary mt-0.5">{currentOrder?.profession || 'خدمة صيانة'}</p>
          </div>

          <hr className="my-5 border-neutral" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-center font-bold text-textDark text-sm">
              كيف كانت جودة تنفيذ العمل؟
            </p>

            <div className="flex justify-center py-1">
              <StarRating value={rating} onChange={setRating} size={34} />
            </div>
            <p className="text-center text-secondary font-bold text-xs">
              {RATING_LABELS[rating]}
            </p>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-textDark">شاركنا رأيك بالتفصيل (اختياري)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="input-field resize-none text-xs"
                placeholder="اكتب تعليقك حول دقة المواعيد، المعاملة، وجودة العمل..."
              />
            </div>

            {error && <AlertMessage type="error" message={error} />}

            <button
              type="submit"
              disabled={loading}
              className="btn-secondary w-full py-3 text-sm font-bold shadow-md shadow-secondary/20 transition-all hover:-translate-y-0.5"
            >
              <FaPaperPlane size={12} /> {loading ? 'جاري إرسال التقييم...' : 'إرسال التقييم'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full text-center text-xs font-semibold text-textGray hover:text-textDark py-1"
            >
              إلغاء
            </button>
          </form>
        </div>
      </div>

      {/* Privacy note */}
      <div className="flex gap-3 rounded-2xl bg-primary/5 border border-primary/15 p-4">
        <FaShieldAlt className="shrink-0 text-primary mt-0.5" size={18} />
        <div>
          <p className="font-bold text-primary text-xs">تقييمك موثوق ومحمي</p>
          <p className="text-[11px] text-textGray mt-0.5 leading-relaxed">
            تساعد التقييمات الصادقة في رفع جودة الخدمات داخل المنصة ومكافأة الحرفيين الملتزمين.
          </p>
        </div>
      </div>
    </div>
  );
}
