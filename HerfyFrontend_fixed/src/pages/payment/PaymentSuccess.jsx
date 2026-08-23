import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const orderId = searchParams.get('orderId');

  useEffect(() => {
    const clientSecret = searchParams.get('payment_intent_client_secret');
    if (!clientSecret) { setStatus('unknown'); return; }

    stripePromise.then((stripe) => {
      stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
        setStatus(paymentIntent?.status === 'succeeded' ? 'succeeded' : 'failed');
      });
    });
  }, [searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      {status === 'loading' && <p>جاري التحقق من الدفع...</p>}

      {status === 'succeeded' && (
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
          {orderId && (
            <Link to={`/customer/payment/${orderId}`} className="text-blue-600 underline">
              إعادة المحاولة
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
