import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { createPaymentIntent, fetchOrderById } from '../../store/slices/orderSlice';
import CheckoutForm from '../../components/stripe/CheckoutForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { FaArrowRight } from 'react-icons/fa';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
// Never construct a rejected promise or call loadStripe with an undefined key.
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
      console.log('[PaymentPage] MOUNT', window.location.pathname);
      console.log('[Stripe] publishable key configured:', Boolean(stripePublishableKey));

      if (!stripePublishableKey) {
        if (active) {
          setIntentError('Stripe publishable key is missing.');
          setIntentLoading(false);
        }
        return;
      }

      console.log('[PaymentPage] fetching order', orderId, window.location.pathname);
      const orderResult = await dispatch(fetchOrderById(orderId));
      if (!active) return;

      if (!fetchOrderById.fulfilled.match(orderResult)) {
        setIntentError(orderResult.payload?.msg || 'Failed to load the order.');
        setIntentLoading(false);
        return;
      }

      const order = orderResult.payload.order || orderResult.payload;
      if (order.status !== 'completed') {
        setIntentError('Payment is available only after the order is completed.');
        setIntentLoading(false);
        return;
      }

      console.log('[PaymentPage] creating payment intent', orderId, window.location.pathname);
      const intentResult = await dispatch(createPaymentIntent(orderId));
      console.log('[PaymentPage] payment intent result', intentResult.type, intentResult.payload);
      if (!active) return;

      if (createPaymentIntent.fulfilled.match(intentResult) && intentResult.payload?.clientSecret) {
        setClientSecret(intentResult.payload.clientSecret);
      } else {
        setIntentError(intentResult.payload?.msg || 'Failed to initialize payment.');
      }
      setIntentLoading(false);
    };

    preparePayment();
    return () => {
      active = false;
      console.log('[PaymentPage] UNMOUNT', window.location.pathname);
    };
  }, [dispatch, orderId]);

  const amount = currentOrder?.totalPrice || currentOrder?.price;

  if (intentLoading) {
    return <div className="flex min-h-screen items-center justify-center"><LoadingSpinner /></div>;
  }

  if (intentError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-600">{intentError}</p>
        <button type="button" onClick={() => navigate(-1)} className="text-blue-600 underline">Back</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary"><FaArrowRight size={20} /></button>
        <h1 className="text-xl font-bold text-primary">Electronic payment</h1>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <div className="rounded-2xl bg-white p-6 shadow">
        {clientSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm orderId={orderId} amount={amount} />
          </Elements>
        )}
      </div>
    </div>
  );
}
