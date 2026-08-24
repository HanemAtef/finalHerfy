import { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

// orderId is passed so the return_url carries it for the success page
export default function CheckoutForm({ orderId, amount, penaltyMode }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    let submitError;
    try {
      ({ error: submitError } = await elements.submit());
    } catch (submitException) {
      setError(submitException.message || 'The payment form could not be initialized.');
      setLoading(false);
      return;
    }
    if (submitError) {
      setError(submitError.message);
      setLoading(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/success?orderId=${orderId}${penaltyMode ? '&penalty=1' : ''}`,
      },
    });

    // confirmPayment only returns here on error — success redirects automatically
    if (confirmError) {
      setError(confirmError.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {amount != null && (
        <p className="text-center text-lg font-bold text-primary">
          المبلغ المطلوب: {amount} ج.م
        </p>
      )}
      <PaymentElement
        onLoadError={({ error: loadError }) => {
          setError(loadError?.message || 'The payment form could not be initialized.');
        }}
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50"
      >
        {loading ? 'جاري الدفع...' : 'ادفع الآن'}
      </button>
    </form>
  );
}
