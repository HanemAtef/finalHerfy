import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { createPaymentIntent, fetchOrderById } from '../../store/slices/orderSlice';
import CheckoutForm from '../../components/stripe/CheckoutForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { FaArrowRight, FaShieldAlt, FaCreditCard } from 'react-icons/fa';
import { formatPrice } from '../../utils/helpers';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export default function OrderPaymentPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, error } = useSelector((state) => state.orders);
  const [clientSecret, setClientSecret] = useState(null);
  const [intentError, setIntentError] = useState(null);
  const [intentLoading, setIntentLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const preparePayment = async () => {
      if (!stripePublishableKey) {
        if (active) {
          setIntentError('مفتاح الربط مع بوابة Stripe غير مهيأ');
          setIntentLoading(false);
        }
        return;
      }

      const orderResult = await dispatch(fetchOrderById(orderId));
      if (!active) return;

      if (!fetchOrderById.fulfilled.match(orderResult)) {
        setIntentError(orderResult.payload?.msg || 'تعذر تحميل بيانات الطلب');
        setIntentLoading(false);
        return;
      }

      const order = orderResult.payload.order || orderResult.payload;
      if (order.status !== 'completed') {
        setIntentError('الدفع الإلكتروني متاح فقط بعد إكمال الحرفي للطلب بنجاح');
        setIntentLoading(false);
        return;
      }

      const intentResult = await dispatch(createPaymentIntent(orderId));
      if (!active) return;

      if (createPaymentIntent.fulfilled.match(intentResult) && intentResult.payload?.clientSecret) {
        setClientSecret(intentResult.payload.clientSecret);
      } else {
        setIntentError(intentResult.payload?.msg || 'فشل في تهيئة جلسة الدفع الآمن');
      }
      setIntentLoading(false);
    };

    preparePayment();
    return () => {
      active = false;
    };
  }, [dispatch, orderId]);

  const amount = currentOrder?.totalPrice || currentOrder?.price;

  if (intentLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <LoadingSpinner text="جاري تهيئة بوابة الدفع الآمن..." />
      </div>
    );
  }

  if (intentError) {
    return (
      <div className="mx-auto max-w-md p-6 my-12 text-center card space-y-4">
        <div className="h-14 w-14 mx-auto rounded-3xl bg-red-50 text-emergency flex items-center justify-center text-2xl font-bold">
          !
        </div>
        <h2 className="text-lg font-bold text-textDark">تعذر بدء عملية الدفع</h2>
        <p className="text-xs text-textGray leading-relaxed">{intentError}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-primary text-xs py-2 px-5"
        >
          الرجوع للطلب
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6 space-y-6">
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
          <h1 className="text-xl font-extrabold text-textDark">الدفع الإلكتروني الآمن</h1>
          <p className="text-xs text-textGray mt-0.5">تسديد تكلفة الخدمة المنجزة بواسطة البطاقة البنكية</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-emergency">
          {error}
        </div>
      )}

      {/* Order Amount summary */}
      <div className="card bg-gradient-to-r from-primary to-primary/90 text-white flex items-center justify-between p-5">
        <div>
          <span className="text-xs opacity-80 block">المبلغ الإجمالي للدفع</span>
          <span className="text-2xl font-black mt-1 block">{formatPrice(amount || 0)}</span>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
          <FaCreditCard size={22} />
        </div>
      </div>

      {/* Stripe checkout wrapper card */}
      <div className="card shadow-[var(--shadow-card)]">
        {clientSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm orderId={orderId} amount={amount} />
          </Elements>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-textGray">
        <FaShieldAlt className="text-tertiary" />
        <span>جميع المعاملات المالية مشفرة ومحمية بالكامل عبر Stripe</span>
      </div>
    </div>
  );
}
