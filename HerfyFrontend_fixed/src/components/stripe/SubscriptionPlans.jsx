import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { createSubscription } from '../../services/stripeService';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const PLANS = [
  { id: 'monthly', label: 'Monthly Plan', price: '$9.99/mo' },
  { id: 'yearly',  label: 'Yearly Plan',  price: '$99.99/yr' },
];

function SubscriptionCheckoutForm({ plan, onBack }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message);
      setLoading(false);
      return;
    }

    // For subscriptions, confirmPayment handles 3DS automatically
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/success`,
      },
    });

    if (confirmError) {
      setError(confirmError.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h3 className="font-semibold mb-4">Subscribe — {plan}</h3>
      <PaymentElement />
      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Subscribe'}
      </button>
      <button type="button" onClick={onBack} className="mt-2 w-full text-sm text-gray-500 underline">
        Back to plans
      </button>
    </form>
  );
}

export default function SubscriptionPlans() {
  const [clientSecret, setClientSecret] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSelectPlan = async (plan) => {
    setLoading(true);
    setError(null);
    try {
      // We need a paymentMethodId before creating the subscription.
      // Collect it via a separate PaymentElement or pass a saved one.
      // For simplicity, we create the subscription with setup_future_usage
      // and let the Elements form collect the card inline.
      // Here we pass a placeholder — replace with a real collected PM id
      // if you pre-collect card details before plan selection.
      const { data } = await createSubscription(plan.id, 'pm_card_visa'); // replace with real PM
      setClientSecret(data.clientSecret);
      setSelectedPlan(plan);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initialize subscription');
    } finally {
      setLoading(false);
    }
  };

  if (clientSecret && selectedPlan) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <SubscriptionCheckoutForm
          plan={selectedPlan.label}
          onBack={() => { setClientSecret(null); setSelectedPlan(null); }}
        />
      </Elements>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">Choose a Plan</h2>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="space-y-3">
        {PLANS.map((plan) => (
          <div key={plan.id} className="flex justify-between items-center border p-4 rounded">
            <div>
              <p className="font-medium">{plan.label}</p>
              <p className="text-sm text-gray-500">{plan.price}</p>
            </div>
            <button
              onClick={() => handleSelectPlan(plan)}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? '...' : 'Select'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
