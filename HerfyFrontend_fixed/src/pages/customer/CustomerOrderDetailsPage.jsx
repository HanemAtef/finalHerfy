import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { FaArrowRight, FaCreditCard, FaPaperPlane } from 'react-icons/fa';
import { fetchOrderById } from '../../store/slices/orderSlice';
import { reviewService } from '../../services/api';
import StarRating from '../../components/common/StarRating';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LocationLabel from '../../components/common/LocationLabel';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

const Detail = ({ label, children }) => (
  <div className="border-b border-borderGray py-3 last:border-0">
    <dt className="text-sm text-textGray">{label}</dt>
    <dd className="mt-1 font-medium text-textDark">{children || '—'}</dd>
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
        setError(orderResult.payload?.msg || 'Unable to load order details.');
      } else {
        setOrder(orderResult.payload.order || orderResult.payload);
        if (!reviewResult.error) setReview(reviewResult.data.review);
        else if (reviewResult.error.response?.status !== 404) {
          setError(reviewResult.error.response?.data?.msg || 'Unable to load your review.');
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

  if (loading) return <LoadingSpinner fullScreen />;
  if (!order) return <div className="p-6 text-center text-emergency">{error || 'Order not found.'}</div>;

  const handyman = order.handymanId || {};
  const coordinates = order.customerLocation?.coordinates;
  const cancellationReason = order.cancelReason || order.cancellationReason || order.cancellationNote;
  const canReview = order.status === 'completed';

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary" aria-label="Back"><FaArrowRight size={20} /></button>
        <div><h1 className="text-xl font-bold text-primary">تفاصيل الطلب</h1><p className="text-sm text-textGray">#{order._id.slice(-6)}</p></div>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-emergency">{error}</p>}
      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{order.profession}</h2>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{ORDER_STATUS_LABELS[order.status] || order.status}</span>
        </div>
        <dl>
          <Detail label="الوصف">{order.description}</Detail>
          <Detail label="مقدم الخدمة">{handyman.name}</Detail>
          <Detail label="السعر الإجمالي">{formatPrice(order.totalPrice || order.price || order.estimatedPrice || 0)}</Detail>
          <Detail label="تاريخ الإنشاء">{formatDate(order.createdAt)}</Detail>
          {order.status === 'completed' && <Detail label="تاريخ الإكمال">{formatDate(order.completedAt || order.updatedAt)}</Detail>}
          <Detail label="طريقة الدفع">{order.paymentMethod === 'card' ? 'بطاقة' : order.paymentMethod === 'cash' ? 'نقداً' : 'لم يتم الاختيار'}</Detail>
          <Detail label="حالة الدفع">{order.paymentStatus || 'unpaid'}</Detail>
          {coordinates?.length === 2 && (
            <Detail label="موقع العميل">
              <LocationLabel lat={coordinates[1]} lng={coordinates[0]} icon={false} fallback="تعذر تحديد عنوان الموقع." />
            </Detail>
          )}
          {order.status === 'cancelled' && <Detail label="سبب الإلغاء">{cancellationReason || 'لا يوجد سبب مسجل.'}</Detail>}
        </dl>
        {order.completionImage && <img className="mt-4 max-h-72 w-full rounded-xl object-cover" src={order.completionImage} alt="Completion proof" />}
        {order.status === 'completed' && order.paymentMethod === 'card' && order.paymentStatus === 'pending' && (
          <Link to={`/customer/payment/${order._id}`} className="btn-secondary mt-5 flex w-full items-center justify-center gap-2"><FaCreditCard /> متابعة الدفع</Link>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow">
        {review ? (
          <>
            <h2 className="mb-3 text-lg font-bold text-primary">تقييمك</h2>
            <StarRating value={review.rating} readonly size={24} />
            {review.comment && <p className="mt-3 whitespace-pre-wrap text-textDark">{review.comment}</p>}
            <p className="mt-3 text-sm text-textGray">{formatDate(review.createdAt)}</p>
          </>
        ) : !canReview ? (
          <p className="text-textGray">لا يمكن تقييم طلب لم يكتمل.</p>
        ) : (
          <form onSubmit={submitReview}>
            <h2 className="mb-4 text-lg font-bold text-primary">قيّم مقدم الخدمة</h2>
            <StarRating value={rating} onChange={setRating} size={30} />
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} className="input-field mt-4 min-h-28 resize-y" placeholder="اكتب تعليقك" />
            {success && <p className="mt-3 text-sm text-green-700">{success}</p>}
            <button type="submit" disabled={submitting} className="btn-secondary mt-4 flex w-full items-center justify-center gap-2"><FaPaperPlane />{submitting ? 'جارٍ الإرسال...' : 'إرسال التقييم'}</button>
          </form>
        )}
      </section>
    </main>
  );
}
