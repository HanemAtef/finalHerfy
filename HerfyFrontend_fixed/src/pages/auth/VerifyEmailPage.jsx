import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaEnvelopeOpenText, FaArrowRight } from 'react-icons/fa';
import { verifyEmail, resendOtp, clearError } from '../../store/slices/authSlice';

export default function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const emailFromState = location.state?.email || '';
  const [email] = useState(emailFromState);
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState('');
  const cooldownRef = useRef(null);

  const { isLoading, error, isAuthenticated, user } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(clearError());
    // No email means the user landed here directly — send them back to register.
    if (!emailFromState) {
      navigate('/register');
    }
  }, [dispatch, emailFromState, navigate]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const routes = {
        customer: '/customer/home',
        handyman: '/handyman/dashboard',
        admin: '/admin/dashboard',
      };
      navigate(routes[user.role] || '/');
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(cooldownRef.current);
  }, [resendCooldown]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (otp.trim().length !== 6) return;
    dispatch(verifyEmail({ email, otp: otp.trim() }));
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendMsg('');
    const res = await dispatch(resendOtp({ email }));
    if (!res.error) {
      setResendMsg('تم إرسال رمز جديد إلى بريدك الإلكتروني');
      setResendCooldown(60);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 text-sm text-textGray hover:text-primary"
        >
          <FaArrowRight /> رجوع
        </button>
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white">
            <FaEnvelopeOpenText size={24} />
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-textDark">تحقق من بريدك الإلكتروني</h1>
        <p className="mb-6 text-center text-sm text-textGray">
          أرسلنا رمز تحقق مكوّن من 6 أرقام إلى <span className="font-semibold">{email}</span>
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>
        )}
        {resendMsg && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-center text-sm text-green-600">{resendMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="------"
            className="w-full rounded-lg border border-gray-300 p-3 text-center text-2xl tracking-[0.5em] focus:border-primary focus:outline-none"
          />

          <button
            type="submit"
            disabled={isLoading || otp.length !== 6}
            className="flex w-full items-center justify-center rounded-lg bg-primary py-3 font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'تأكيد'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-textGray">
          لم يصلك الرمز؟{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="font-semibold text-primary disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ثانية` : 'إعادة إرسال الرمز'}
          </button>
        </div>

        <div className="mt-4 text-center text-sm text-textGray">
          <Link to="/login" className="text-primary hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
