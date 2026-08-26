import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { FaTimes, FaCreditCard, FaExclamationTriangle, FaShieldAlt } from 'react-icons/fa';
import { penaltyService } from '../../services/api';
import CheckoutForm from '../stripe/CheckoutForm';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export default function PenaltySettlementModal({ penaltyAmount, penaltyCount, onClose }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initPayment = async () => {
      setError(null);
      setLoading(true);
      try {
        const { data } = await penaltyService.createPaymentIntent();
        setClientSecret(data.clientSecret);
      } catch (err) {
        setError(err.response?.data?.msg || 'فشل تهيئة بوابة الدفع. يرجى المحاولة مرة أخرى.');
      } finally {
        setLoading(false);
      }
    };

    initPayment();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emergency/10 text-emergency">
              <FaExclamationTriangle size={16} />
            </div>
            <h2 className="text-lg font-bold text-textDark">تسوية الغرامة بالبطاقة البنكية</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-textGray hover:bg-neutral hover:text-textDark transition-all"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Penalty summary */}
        <div className="mb-5 rounded-2xl bg-emergency/5 border border-emergency/20 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-textGray">إجمالي قيمة الغرامة المستحقة</span>
            <span className="text-lg font-extrabold text-emergency">{penaltyAmount} ج.م</span>
          </div>
          <div className="flex items-center justify-between text-xs text-textGray">
            <span>عدد المخالفات المسجلة</span>
            <span className="font-bold text-textDark bg-white px-2 py-0.5 rounded-md border border-neutral">{penaltyCount} مخالفة</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-emergency/10 border border-emergency/20 px-4 py-3 text-sm text-emergency font-medium">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mb-4 flex flex-col items-center justify-center py-6 gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-textGray font-medium">جاري تهيئة الدفع الإلكتروني الآمن (Stripe)...</span>
          </div>
        )}

        {/* Stripe payment form */}
        {!loading && clientSecret && stripePromise && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-textGray bg-neutral/30 p-2.5 rounded-xl">
              <FaCreditCard className="text-primary" size={14} />
              <span>الدفع بالبطاقة الإلكترونية (Visa / MasterCard / Meeza)</span>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <CheckoutForm orderId="penalty" amount={penaltyAmount} penaltyMode />
            </Elements>
          </div>
        )}

        {!loading && !stripePromise && !error && (
          <div className="text-xs text-emergency p-3 rounded-xl bg-emergency/10 border border-emergency/20">
            مفتاح بوابة الدفع (Stripe) غير مهيأ في إعدادات البيئة.
          </div>
        )}

        {/* Footer note */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-textGray">
          <FaShieldAlt className="text-tertiary" size={13} />
          <span>الدفع آمن ومحمي بالكامل بتشفير SSL عبر بوابة Stripe.</span>
        </div>
      </div>
    </div>
  );
}
