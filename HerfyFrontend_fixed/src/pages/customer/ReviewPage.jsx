import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaArrowRight, FaBell, FaComments, FaPaperPlane, FaShieldAlt } from 'react-icons/fa';
import { reviewService } from '../../services/api';
import { fetchOrderById } from '../../store/slices/orderSlice';
import StarRating from '../../components/common/StarRating';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';

const RATING_LABELS = ['', 'سيء', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز'];

export default function ReviewPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading: orderLoading } = useSelector((state) => state.orders);
  const [rating, setRating] = useState(4);
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
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="text-primary">
            <FaArrowRight size={18} />
          </button>
          <h1 className="font-bold text-primary">تقييم الحرفي</h1>
        </div>
        <div className="flex gap-3 text-primary">
          <FaBell /><FaComments />
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="h-24 bg-primary" />
        <div className="relative px-6 pb-6 pt-0">
          <img
            src={handyman.profileImage || getDefaultAvatar(handyman.name)}
            alt=""
            className="relative -mt-12 mx-auto h-24 w-24 rounded-full border-4 border-white object-cover"
          />
          <div className="mt-4 text-center">
            <h2 className="font-bold text-textDark">{handyman.name || 'الحرفي'}</h2>
            <p className="text-sm text-textGray">{currentOrder?.profession || ''}</p>
          </div>

          <hr className="my-6 border-borderGray" />

          <form onSubmit={handleSubmit}>
            <p className="mb-4 text-center font-bold text-primary">
              كيف كانت تجربتك مع {handyman.name || 'الحرفي'}؟
            </p>
            <div className="mb-2 flex justify-center">
              <StarRating value={rating} onChange={setRating} size={32} />
            </div>
            <p className="mb-6 text-center text-secondary font-medium">{RATING_LABELS[rating]}</p>

            <label className="mb-2 block text-sm text-textGray">شاركنا رأيك - اختياري</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="input-field mb-4 resize-none"
              placeholder="اكتب عن جودة العمل، الالتزام بالمواعيد..."
            />

            {error && <p className="mb-3 text-sm text-emergency">{error}</p>}

            <button type="submit" disabled={loading} className="btn-secondary flex w-full items-center justify-center gap-2">
              <FaPaperPlane /> {loading ? 'جاري الإرسال...' : 'إرسال التقييم'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="mt-3 w-full text-center text-sm text-primary"
            >
              إلغاء
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 flex gap-3 rounded-xl bg-primary/5 p-4">
        <FaShieldAlt className="shrink-0 text-primary mt-1" size={20} />
        <div>
          <p className="font-bold text-primary text-sm">خصوصيتك تهمنا</p>
          <p className="text-xs text-textGray mt-1">
            تقييمك يساعدنا في تحسين الخدمات وسيتم مشاركته مع الحرفي لتحسين أدائه.
          </p>
        </div>
      </div>
    </div>
  );
}
