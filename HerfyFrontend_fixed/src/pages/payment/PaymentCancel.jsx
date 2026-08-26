import { Link } from 'react-router-dom';
import { FaTimesCircle } from 'react-icons/fa';

export default function PaymentCancel() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="card max-w-md w-full text-center space-y-5 p-8 shadow-[var(--shadow-card)]">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-amber-50 text-secondary shadow-2xs">
          <FaTimesCircle size={36} />
        </div>
        <h1 className="text-xl font-extrabold text-textDark">تم إلغاء عملية الدفع</h1>
        <p className="text-xs text-textGray leading-relaxed">
          لم يتم خصم أي مبالغ من بطاقتك. يمكنك استكمال الدفع في أي وقت.
        </p>
        <div className="pt-2">
          <Link to="/customer/home" className="btn-primary w-full py-2.5 text-xs font-bold block">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
