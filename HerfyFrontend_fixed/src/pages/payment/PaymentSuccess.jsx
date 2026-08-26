import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { useDispatch } from 'react-redux';
import { getMe } from '../../store/slices/authSlice';
import { FaCheckCircle, FaExclamationCircle, FaShieldAlt, FaArrowRight } from 'react-icons/fa';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { penaltyService } from '../../services/api';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.reject(new Error('Stripe publishable key is not configured.'));

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const [status, setStatus] = useState('loading');
  const [penaltySettled, setPenaltySettled] = useState(false);
  const orderId = searchParams.get('orderId');
  const isPenalty = searchParams.get('penalty') === '1';

  useEffect(() => {
    let active = true;
    let retryTimer;

    const clientSecret = searchParams.get('payment_intent_client_secret');
    if (!clientSecret) {
      retryTimer = window.setTimeout(() => {
        if (active) setStatus('unknown');
      }, 0);
      return () => window.clearTimeout(retryTimer);
    }

    const refreshPenalty = async (attempt = 0) => {
      const result = await dispatch(getMe());
      const refreshedUser = result.payload?.user || result.payload;
      const settled = refreshedUser?.penaltyAmount <= 0;

      if (active && settled) setPenaltySettled(true);

      if (active && isPenalty && !settled && attempt < 5) {
        retryTimer = window.setTimeout(() => refreshPenalty(attempt + 1), 1000);
      }
    };

    const verifyPayment = async () => {
      if (!stripePromise) {
        if (active) setStatus('failed');
        return;
      }

      try {
        const stripe = await stripePromise;
        const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
        const succeeded = paymentIntent?.status === 'succeeded';
        if (!active) return;
        setStatus(succeeded ? 'succeeded' : 'failed');
        if (succeeded && isPenalty) {
          try {
            await penaltyService.verifyPaymentIntent(paymentIntent.id);
          } catch (e) {
            console.warn('Direct verify failed, relying on webhook:', e);
          }
          refreshPenalty();
        }
      } catch {
        if (active) setStatus('failed');
      }
    };

    verifyPayment();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, [searchParams, dispatch, isPenalty]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="card max-w-md w-full text-center space-y-5 p-8 shadow-[var(--shadow-card)]">
        {status === 'loading' && (
          <LoadingSpinner text="جاري التحقق من عملية الدفع..." />
        )}

        {status === 'succeeded' && isPenalty && (
          <>
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-emerald-50 text-tertiary shadow-2xs">
              <FaCheckCircle size={36} />
            </div>
            <h1 className="text-xl font-extrabold text-textDark">
              {penaltySettled ? 'تمت تسوية الغرامة بنجاح!' : 'تم تأكيد عملية الدفع'}
            </h1>
            <p className="text-xs text-textGray leading-relaxed">
              {penaltySettled
                ? 'تم استلام دفعتك وتصفير رصيد الغرامات على حسابك. يمكنك الآن طلب خدمات جديدة بحرية.'
                : 'تم استلام الدفعة وجاري المزامنة مع الحساب.'}
            </p>
            <div className="pt-2">
              <Link to="/customer/profile" className="btn-primary w-full py-2.5 text-xs font-bold block">
                العودة إلى الملف الشخصي
              </Link>
            </div>
          </>
        )}

        {status === 'succeeded' && !isPenalty && (
          <>
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-emerald-50 text-tertiary shadow-2xs">
              <FaCheckCircle size={36} />
            </div>
            <h1 className="text-xl font-extrabold text-textDark">تمت عملية الدفع بنجاح!</h1>
            <p className="text-xs text-textGray leading-relaxed">
              شكراً لك! تم استلام المبلغ بنجاح وإغلاق حساب الطلب.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              {orderId && (
                <Link to={`/customer/orders/${orderId}`} className="btn-primary w-full py-2.5 text-xs font-bold block">
                  عرض تفاصيل الطلب المكتمل
                </Link>
              )}
              <Link to="/customer/home" className="btn-outline w-full py-2.5 text-xs font-bold block">
                الرجوع للرئيسية
              </Link>
            </div>
          </>
        )}

        {(status === 'failed' || status === 'unknown') && (
          <>
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-red-50 text-emergency shadow-2xs">
              <FaExclamationCircle size={36} />
            </div>
            <h1 className="text-xl font-extrabold text-textDark">تعذر إتمام الدفع</h1>
            <p className="text-xs text-textGray leading-relaxed">
              حدث خطأ أثناء معالجة البطاقة، يرجى المحاولة مرة أخرى أو استخدام بطاقة أخرى.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              {orderId && !isPenalty && (
                <Link to={`/customer/payment/${orderId}`} className="btn-primary w-full py-2.5 text-xs font-bold block">
                  إعادة المحاولة
                </Link>
              )}
              {isPenalty && (
                <Link to="/customer/profile" className="btn-primary w-full py-2.5 text-xs font-bold block">
                  الرجوع للملف الشخصي
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
