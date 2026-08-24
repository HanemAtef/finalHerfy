import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { useDispatch } from 'react-redux';
import { getMe } from '../../store/slices/authSlice';

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
        // The webhook is authoritative. Refresh repeatedly while it settles.
        if (succeeded && isPenalty) refreshPenalty();
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      {status === 'loading' && <p>جاري التحقق من الدفع...</p>}

      {status === 'succeeded' && isPenalty && (
        <>
          <h1 className="text-2xl font-bold text-green-600">
            {penaltySettled ? 'تم تسوية الغرامة بنجاح!' : 'تم الدفع بنجاح'}
          </h1>
          <p className="text-gray-600">
            {penaltySettled
              ? 'تم استلام دفعتك وتمت تسوية الغرامة. يمكنك الآن إنشاء طلب جديد.'
              : 'تم استلام دفعتك، ويجري الآن تأكيد تسوية الغرامة. لن يتم تحديث الرصيد إلا بعد تأكيد الخادم.'}
          </p>
          <Link to="/customer/profile" className="text-blue-600 underline">
            العودة للملف الشخصي
          </Link>
        </>
      )}

      {status === 'succeeded' && !isPenalty && (
        <>
          <h1 className="text-2xl font-bold text-green-600">تم الدفع بنجاح!</h1>
          <p className="text-gray-600">شكراً لك، تم استلام دفعتك.</p>
          {orderId && (
            <Link to={`/customer/tracking/${orderId}`} className="text-blue-600 underline">
              تتبع طلبك
            </Link>
          )}
        </>
      )}

      {(status === 'failed' || status === 'unknown') && (
        <>
          <h1 className="text-2xl font-bold text-red-600">فشل الدفع</h1>
          <p className="text-gray-600">حدث خطأ، يرجى المحاولة مرة أخرى.</p>
          {orderId && !isPenalty && (
            <Link to={`/customer/payment/${orderId}`} className="text-blue-600 underline">
              إعادة المحاولة
            </Link>
          )}
          {isPenalty && (
            <Link to="/customer/profile" className="text-blue-600 underline">
              العودة للملف الشخصي
            </Link>
          )}
        </>
      )}

      <Link to="/customer/home" className="text-gray-500 underline text-sm">
        الرئيسية
      </Link>
    </div>
  );
}
