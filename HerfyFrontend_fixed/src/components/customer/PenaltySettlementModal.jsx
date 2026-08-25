import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { FaTimes, FaCreditCard, FaMoneyBillWave, FaExclamationTriangle } from 'react-icons/fa';
import { penaltyService } from '../../services/api';
import CheckoutForm from '../stripe/CheckoutForm';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

/**
 * PenaltySettlementModal
 * Lets the customer settle an outstanding penalty via Stripe (card) or Cash.
 *
 * Stripe flow:
 *   1. POST /api/payments/penalty/create-intent → { clientSecret, penaltyAmount }
 *   2. Render <CheckoutForm> inside <Elements> with the clientSecret.
 *   3. On Stripe success → redirect to /payment/success?penalty=1
 *   4. The backend webhook sets penaltyAmount = 0. Frontend refreshes user data.
 *
 * Cash flow:
 *   Display info that admin must confirm. The frontend does NOT zero penaltyAmount.
 */
export default function PenaltySettlementModal({ penaltyAmount, penaltyCount, onClose }) {
  const [method, setMethod] = useState(null); // 'card' | 'cash' | null
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectCard = async () => {
    setMethod('card');
    setError(null);
    setLoading(true);
    try {
      const { data } = await penaltyService.createPaymentIntent();
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err.response?.data?.msg || 'فشل تهيئة الدفع. حاول مرة أخرى.');
      setMethod(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">تسوية الغرامة</h2>
          <button type="button" onClick={onClose} className="text-textGray hover:text-emergency">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Penalty summary */}
        <div className="mb-5 rounded-xl bg-emergency/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-emergency">
            <FaExclamationTriangle />
            <span className="font-bold">لديك غرامة مستحقة</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-textGray">قيمة الغرامة</span>
            <span className="font-bold text-emergency">{penaltyAmount} ج.م</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-textGray">عدد الإلغاءات المخالفة</span>
            <span className="font-bold">{penaltyCount}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mb-4 flex items-center justify-center py-4 text-textGray">
            <span className="animate-pulse">جاري تهيئة الدفع...</span>
          </div>
        )}

        {/* Stripe payment form */}
        {method === 'card' && clientSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm orderId="penalty" amount={penaltyAmount} penaltyMode />
          </Elements>
        )}

        {/* Cash info */}
        {method === 'cash' && (
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/10 p-4 text-sm text-textDark">
              <p className="mb-2 font-bold">التسوية عبر الكاش</p>
              <p className="text-textGray">
                ل تسوية الغرامة عبر الكاش، يرجى التواصل مع الدعم أو زيارة أحد مكاتبنا.
                سيقوم الأدمن بتأكيد استلام المبلغ وتسوية الغرامة في النظام.
              </p>
              <p className="mt-2 text-xs text-textGray">
                ملاحظة: لا يمكن للنظام تصفير الغرامة تلقائيًا للدفع الكاش — يتطلب تأكيد الأدمن.
              </p>
            </div>
            <button type="button" onClick={() => setMethod(null)} className="btn-outline w-full text-sm">
              رجوع
            </button>
          </div>
        )}

        {/* Payment method selection */}
        {method === null && !loading && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSelectCard}
              disabled={!stripePromise}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-borderGray p-4 text-right transition-all hover:border-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <FaCreditCard size={24} className="text-primary" />
              <div className="flex-1">
                <p className="font-bold text-primary">الدفع بالبطاقة (Stripe)</p>
                <p className="text-xs text-textGray">دفع فوري وآمن عبر البطاقة</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMethod('cash')}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-borderGray p-4 text-right transition-all hover:border-secondary hover:bg-secondary/5"
            >
              <FaMoneyBillWave size={24} className="text-secondary" />
              <div className="flex-1">
                <p className="font-bold text-secondary">الدفع الكاش</p>
                <p className="text-xs text-textGray">يتطلب تأكيد الأدمن</p>
              </div>
            </button>
          </div>
        )}

        {/* Footer note */}
        {method === null && (
          <p className="mt-4 text-center text-xs text-textGray">
            بعد تسوية الغرامة، يمكنك إنشاء طلب جديد فورًا.
          </p>
        )}
      </div>
    </div>
  );
}
