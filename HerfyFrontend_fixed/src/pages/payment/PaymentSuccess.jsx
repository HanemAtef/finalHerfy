import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');

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
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      {status === 'loading' && <p>Verifying payment...</p>}
      {status === 'succeeded' && (
        <>
          <h1 className="text-2xl font-bold text-green-600">Payment Successful!</h1>
          <p className="text-gray-600">Thank you for your purchase.</p>
        </>
      )}
      {(status === 'failed' || status === 'unknown') && (
        <>
          <h1 className="text-2xl font-bold text-red-600">Payment Failed</h1>
          <p className="text-gray-600">Something went wrong. Please try again.</p>
        </>
      )}
      <Link to="/customer/home" className="text-blue-600 underline">Back to Home</Link>
    </div>
  );
}
