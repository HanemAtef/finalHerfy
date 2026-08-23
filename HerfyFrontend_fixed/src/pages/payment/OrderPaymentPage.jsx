import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { createPaymentIntent, fetchOrderById } from '../../store/slices/orderSlice';
import CheckoutForm from '../../components/stripe/CheckoutForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { FaArrowRight } from 'react-icons/fa';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function OrderPaymentPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading, error } = useSelector((state) => state.orders);

  const [clientSecret, setClientSecret] = useState(null);
  const [intentError, setIntentError] = useState(null);
  const [intentLoading, setIntentLoading] = useState(true);

  // Ensure currentOrder is loaded — customer may land here directly via URL
  useEffect(() => {
    if (!currentOrder || currentOrder._id !== orderId) {
      dispatch(fetchOrderById(orderId));
    }
  }, [dispatch, orderId, currentOrder]);

  useEffect(() => {
    setIntentLoading(true);
    dispatch(createPaymentIntent(orderId)).then((result) => {
      if (createPaymentIntent.fulfilled.match(result)) {
        setClientSecret(result.payload.clientSecret);
      } else {
        setIntentError(result.payload?.msg || 'فشل تهيئة الدفع');
      }
      setIntentLoading(false);
    });
  }, [dispatch, orderId]);

  const amount = currentOrder?.totalPrice || currentOrder?.price;

  if (intentLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (intentError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-600">{intentError}</p>
        <button onClick={() => navigate(-1)} className="text-blue-600 underline">
          رجوع
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={20} />
        </button>
        <h1 className="text-xl font-bold text-primary">الدفع الإلكتروني</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow">
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm orderId={orderId} amount={amount} />
        </Elements>
      </div>
    </div>
  );
}
