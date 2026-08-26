import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaEnvelopeOpenText, FaArrowRight } from 'react-icons/fa';
import { verifyEmail, resendOtp, clearError } from '../../store/slices/authSlice';
import AlertMessage from '../../components/common/AlertMessage';

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
    <div
      className="flex min-h-screen items-center justify-center bg-cover bg-center px-4 py-8"
      style={{
        backgroundImage:
          'linear-gradient(rgba(243,245,247,0.85), rgba(243,245,247,0.92)), url(https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1600)',
      }}
    >
      <div className="auth-card max-w-md w-full">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-textGray hover:text-primary transition-colors"
        >
          <FaArrowRight size={11} /> رجوع
        </button>

        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <FaEnvelopeOpenText size={24} />
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-extrabold text-textDark">تحقق من بريدك</h1>
        <p className="mb-6 text-center text-xs text-textGray leading-relaxed max-w-xs mx-auto">
          أرسلنا رمز تحقق مكوّن من 6 أرقام إلى <span className="font-bold text-textDark block mt-0.5">{email}</span>
        </p>

        <AlertMessage type="error" message={error} className="mb-4" />
        <AlertMessage type="success" message={resendMsg} className="mb-4" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-center text-xs font-bold text-textGray">أدخل رمز التحقق (OTP)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="------"
              className="w-full rounded-2xl border border-borderGray bg-white p-3.5 text-center text-2xl font-bold tracking-[0.5em] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all text-primary"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || otp.length !== 6}
            className="btn-primary flex w-full items-center justify-center py-3 text-sm font-bold shadow-md shadow-primary/20 transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                جاري التحقق...
              </>
            ) : (
              'تأكيد وتفعيل الحساب'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-textGray">
          لم يصلك الرمز؟{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="font-bold text-secondary disabled:cursor-not-allowed disabled:text-textGray/50 transition-colors"
          >
            {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ثانية` : 'إعادة إرسال الرمز'}
          </button>
        </div>

        <div className="mt-4 text-center text-xs">
          <Link to="/login" className="font-semibold text-primary hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
