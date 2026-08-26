import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { FaArrowRight, FaCreditCard, FaPaperPlane, FaUser, FaClock, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { fetchOrderById } from '../../store/slices/orderSlice';
import { reviewService } from '../../services/api';
import StarRating from '../../components/common/StarRating';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LocationLabel from '../../components/common/LocationLabel';
import RescheduleSection from '../../components/common/RescheduleSection';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';
import AlertMessage from '../../components/common/AlertMessage';

const Detail = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 border-b border-neutral last:border-0 gap-1 text-xs">
    <dt className="font-semibold text-textGray">{label}</dt>
    <dd className="font-bold text-textDark text-left sm:text-right">{children || '—'}</dd>
  </div>
);

export default function CustomerOrderDetailsPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [order, setOrder] = useState(null);
  const [review, setReview] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const [orderResult, reviewResult] = await Promise.all([
        dispatch(fetchOrderById(orderId)),
        reviewService.getByOrder(orderId).catch((requestError) => ({ error: requestError })),
      ]);
      if (!active) return;

      if (!fetchOrderById.fulfilled.match(orderResult)) {
        setError(orderResult.payload?.msg || 'تعذر تحميل تفاصيل الطلب.');
      } else {
        setOrder(orderResult.payload.order || orderResult.payload);
        if (!reviewResult.error) setReview(reviewResult.data.review);
        else if (reviewResult.error.response?.status !== 404) {
          setError(reviewResult.error.response?.data?.msg || 'تعذر تحميل التقييم.');
        }
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [dispatch, orderId]);

  const submitReview = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await reviewService.create({ orderId, rating, comment });
      setReview(response.data.review);
      setSuccess('تم إرسال تقييمك بنجاح.');
    } catch (requestError) {
      setError(requestError.response?.data?.msg || 'تعذر إرسال التقييم.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner text="جاري تحميل تفاصيل الطلب..." />;
  if (!order) return <div className="p-6 text-center text-emergency">{error || 'الطلب غير موجود.'}</div>;

  const handyman = order.handymanId || {};
  const coordinates = order.customerLocation?.coordinates;
  const cancellationReason = order.cancellationReason || order.cancelReason || order.cancellationNote || order.reason;
  const canReview = order.status === 'completed';

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
          aria-label="رجوع"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">تفاصيل الطلب</h1>
          <p className="text-xs text-textGray mt-0.5">رقم المرجع: #{order._id.slice(-6)}</p>
        </div>
      </div>

      {error && <AlertMessage type="error" message={error} />}

      {/* Main Order Info Card */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral">
          <div>
            <h2 className="text-base font-bold text-textDark">{order.profession}</h2>
            <p className="text-xs text-textGray mt-0.5">طلب خدمة منزلية</p>
          </div>
          <span className="badge-status bg-primary/10 text-primary border border-primary/20 text-xs px-3 py-1 font-bold">
            {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
        </div>

        <dl className="divide-y divide-neutral">
          <Detail label="وصف العمل">{order.description}</Detail>
          <Detail label="مقدم الخدمة (الحرفي)">{handyman.name || 'حرفي معتمد'}</Detail>
          <Detail label="السعر الإجمالي">
            <span className="font-extrabold text-sm text-primary">
              {formatPrice(order.totalPrice || order.price || order.estimatedPrice || 0)}
            </span>
          </Detail>
          {order.scheduledDate && <Detail label="موعد تقديم الخدمة">{formatDate(order.scheduledDate)}</Detail>}
          {order.expectedDuration && (
            <Detail label="المدة المتوقعة">
              {order.expectedDuration} {order.expectedDuration === 1 ? 'ساعة' : order.expectedDuration === 2 ? 'ساعتان' : 'ساعات'}
            </Detail>
          )}
          <Detail label="تاريخ إنشاء الطلب">{formatDate(order.createdAt)}</Detail>
          {order.status === 'completed' && <Detail label="تاريخ الإكمال">{formatDate(order.completedAt || order.updatedAt)}</Detail>}
          <Detail label="طريقة الدفع">
            {order.paymentMethod === 'card' ? '💳 بطاقة بنكية' : order.paymentMethod === 'cash' ? '💵 نقداً (كاش)' : 'لم تُحدد بعد'}
          </Detail>
          <Detail label="حالة الدفع">
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${order.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {order.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع / معلق'}
            </span>
          </Detail>
          {coordinates?.length === 2 && (
            <Detail label="موقع تقديم الخدمة">
              <LocationLabel lat={coordinates[1]} lng={coordinates[0]} icon={false} fallback="عنوان العميل" />
            </Detail>
          )}
          {order.status === 'cancelled' && (
            <Detail label="سبب الإلغاء">
              <span className="font-bold text-emergency">{cancellationReason || 'لم يُذكر سبب'}</span>
            </Detail>
          )}
        </dl>

        {order.completionImage && (
          <div className="pt-2">
            <p className="text-xs font-bold text-textDark mb-2">إثبات إكمال العمل:</p>
            <img className="max-h-64 w-full rounded-2xl object-cover border border-neutral shadow-sm" src={order.completionImage} alt="إثبات إتمام الخدمة" />
          </div>
        )}

        {/* Reschedule Section */}
        <div id="reschedule-section" className="pt-2">
          <RescheduleSection
            order={order}
            currentUserRole="customer"
            onOrderUpdated={(updated) => setOrder(updated)}
          />
        </div>

        {order.status === 'completed' && order.paymentMethod === 'card' && order.paymentStatus === 'pending' && (
          <Link
            to={`/customer/payment/${order._id}`}
            className="btn-secondary mt-4 flex w-full items-center justify-center gap-2 py-3 shadow-md"
          >
            <FaCreditCard size={14} /> متابعة الدفع الإلكتروني بالبطاقة
          </Link>
        )}
      </section>

      {/* Review Section */}
      <section className="card space-y-3">
        {review ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-textDark">تقييمك لمقدم الخدمة</h2>
              <span className="text-[11px] text-textGray">{formatDate(review.createdAt)}</span>
            </div>
            <StarRating value={review.rating} readonly size={22} />
            {review.comment && (
              <p className="mt-3 text-xs text-textDark leading-relaxed bg-neutral/50 p-3 rounded-xl border border-neutral">
                {review.comment}
              </p>
            )}
          </div>
        ) : !canReview ? (
          <p className="text-xs text-textGray text-center py-2">يمكنك تقييم الحرفي بعد اكتمال تنفيذ الخدمة بالكامل.</p>
        ) : (
          <form onSubmit={submitReview} className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-textDark mb-1">قيّم أداء الحرفي</h2>
              <p className="text-xs text-textGray">شاركنا تجربتك لمساعدة المجتمع في اختيار الحرفي المناسب</p>
            </div>
            <div className="flex justify-center py-2">
              <StarRating value={rating} onChange={setRating} size={28} />
            </div>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="input-field min-h-24 resize-none text-xs"
              placeholder="اكتب تعليقك حول جودة الخدمة ودقة المواعيد..."
            />
            {success && <AlertMessage type="success" message={success} />}
            <button
              type="submit"
              disabled={submitting}
              className="btn-secondary w-full py-2.5 text-xs font-bold shadow-sm"
            >
              <FaPaperPlane size={11} />
              {submitting ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
