import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { createSubscription } from '../../services/stripeService';
import { FaCheckCircle, FaCrown, FaArrowRight, FaLock } from 'react-icons/fa';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.reject(new Error('Stripe publishable key is not configured.'));

const PLANS = [
  {
    id: 'monthly',
    label: 'الباقة الشهرية',
    price: '$9.99',
    period: '/شهريًا',
    features: ['عمولة أقل على الطلبات', 'عدد عملاء أكبر', 'دعم فني مباشر'],
  },
  {
    id: 'yearly',
    label: 'الباقة السنوية',
    price: '$99.99',
    period: '/سنويًا',
    badge: 'وفّر شهرين',
    features: ['كل مميزات الباقة الشهرية', 'سعر أقل بالسنة', 'أولوية في الدعم'],
  },
];

function SubscriptionCheckoutForm({ plan, onBack, onSuccess }) {
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

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/success`,
      },
      redirect: 'if_required', // يفضل في نفس الصفحة لو مش محتاج 3DS redirect
    });

    if (confirmError) {
      setError(confirmError.message);
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      onSuccess?.();
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto rounded-2xl bg-white p-6 shadow-card border border-neutral">
      <div className="mb-5 flex items-center gap-2">
        <FaLock className="text-primary" size={16} />
        <h3 className="font-bold text-textDark text-base">إتمام الاشتراك — {plan}</h3>
      </div>

      <PaymentElement />

      {error && (
        <p className="mt-3 text-xs font-medium text-emergency bg-emergency/10 rounded-lg p-2.5">{error}</p>
      )}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="btn-primary w-full mt-5 text-sm py-3 disabled:opacity-50"
      >
        {loading ? 'جاري تنفيذ عملية الدفع...' : 'تأكيد الاشتراك'}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="mt-3 w-full text-xs text-textGray hover:text-textDark underline"
      >
        العودة لاختيار الباقة
      </button>

      <p className="mt-4 text-[11px] text-textGray text-center">
        وضع الاختبار: استخدم رقم الكارت <span className="font-mono font-bold">4242 4242 4242 4242</span>، أي تاريخ مستقبلي، وأي CVC مكوّن من 3 أرقام.
      </p>
    </form>
  );
}

export default function SubscriptionPlans() {
  const [clientSecret, setClientSecret] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [error, setError] = useState(null);
  const [loadingPlanId, setLoadingPlanId] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSelectPlan = async (plan) => {
    setLoadingPlanId(plan.id);
    setError(null);
    try {
      const { data } = await createSubscription(plan.id);
      setClientSecret(data.clientSecret);
      setSelectedPlan(plan);
    } catch (err) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء تجهيز الاشتراك، حاول مرة أخرى');
    } finally {
      setLoadingPlanId(null);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center rounded-2xl bg-white p-8 shadow-card border border-neutral mt-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tertiary/10 text-tertiary">
          <FaCheckCircle size={30} />
        </div>
        <h2 className="text-xl font-bold text-textDark mb-2">تم الاشتراك بنجاح 🎉</h2>
        <p className="text-xs text-textGray">هيتم تفعيل باقتك خلال لحظات.</p>
      </div>
    );
  }

  if (clientSecret && selectedPlan) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <SubscriptionCheckoutForm
          plan={selectedPlan.label}
          onBack={() => {
            setClientSecret(null);
            setSelectedPlan(null);
          }}
          onSuccess={() => setSuccess(true)}
        />
      </Elements>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-600">
          <FaCrown size={24} />
        </div>
        <h2 className="text-2xl font-extrabold text-textDark">اختر باقتك</h2>
        <p className="text-xs text-textGray mt-1">قلل عمولة المنصة وزوّد عدد عملائك النشطين</p>
      </div>

      {error && (
        <p className="text-xs font-medium text-emergency bg-emergency/10 rounded-lg p-3 mb-4 text-center">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="relative flex flex-col rounded-2xl border border-neutral bg-white p-5 shadow-card hover:shadow-lg transition-all"
          >
            {plan.badge && (
              <span className="absolute -top-3 right-4 rounded-full bg-tertiary text-white text-[10px] font-bold px-3 py-1 shadow-sm">
                {plan.badge}
              </span>
            )}
            <p className="font-bold text-textDark text-base">{plan.label}</p>
            <div className="flex items-baseline gap-1 mt-1 mb-4">
              <span className="text-2xl font-extrabold text-primary">{plan.price}</span>
              <span className="text-xs text-textGray">{plan.period}</span>
            </div>
            <ul className="space-y-2 mb-5 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-textDark">
                  <FaCheckCircle className="text-tertiary shrink-0" size={12} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSelectPlan(plan)}
              disabled={loadingPlanId === plan.id}
              className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingPlanId === plan.id ? 'جاري التجهيز...' : (
                <>
                  اشترك الآن <FaArrowRight size={12} />
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}