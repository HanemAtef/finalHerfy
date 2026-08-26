import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaEnvelope, FaKey, FaLock, FaArrowRight, FaCheckCircle } from 'react-icons/fa';
import { forgotPassword, resetPassword, clearError } from '../../store/slices/authSlice';
import AlertMessage from '../../components/common/AlertMessage';

export default function ForgotPasswordPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useSelector((state) => state.auth);

  const [step, setStep] = useState('request'); // 'request' | 'reset' | 'done'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    const result = await dispatch(forgotPassword({ email }));
    if (forgotPassword.fulfilled.match(result)) {
      setStep('reset');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    const result = await dispatch(resetPassword({ email, otp, newPassword }));
    if (resetPassword.fulfilled.match(result)) {
      setStep('done');
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
        <Link
          to="/login"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-textGray hover:text-primary transition-colors"
        >
          <FaArrowRight size={11} /> العودة لتسجيل الدخول
        </Link>

        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            {step === 'done' ? <FaCheckCircle size={24} className="text-tertiary" /> : <FaKey size={24} />}
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-extrabold text-textDark">
          {step === 'done' ? 'تمت استعادة الحساب!' : 'استعادة كلمة المرور'}
        </h1>
        <p className="mb-6 text-center text-xs text-textGray leading-relaxed max-w-xs mx-auto">
          {step === 'request' && 'أدخل بريدك الإلكتروني المسجل وسنرسل لك رمز تحقق سريع.'}
          {step === 'reset' && 'أدخل رمز التحقق (OTP) المكوّن من 6 أرقام وكلمة المرور الجديدة.'}
          {step === 'done' && 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.'}
        </p>

        <AlertMessage type="error" message={error} className="mb-4" />

        {step === 'request' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-textDark">البريد الإلكتروني</label>
              <div className="relative">
                <FaEnvelope className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray" size={13} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@harfey.com"
                  className="input-field pr-10 text-sm"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 text-sm font-bold shadow-md shadow-primary/20"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  جاري إرسال الرمز...
                </>
              ) : (
                'إرسال رمز التحقق'
              )}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-textDark">رمز التحقق (OTP)</label>
              <div className="relative">
                <FaKey className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray" size={13} />
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="input-field pr-10 text-sm tracking-widest text-center font-bold"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-textDark">كلمة المرور الجديدة</label>
              <div className="relative">
                <FaLock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray" size={13} />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pr-10 text-sm"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 text-sm font-bold shadow-md shadow-primary/20"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  جاري التحديث...
                </>
              ) : (
                'تعيين كلمة المرور الجديدة'
              )}
            </button>
            <button
              type="button"
              onClick={() => setStep('request')}
              className="w-full text-center text-xs font-semibold text-textGray hover:text-primary pt-1"
            >
              لم يصلك الرمز؟ إعادة الإرسال
            </button>
          </form>
        )}

        {step === 'done' && (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary w-full py-3 text-sm font-bold"
          >
            الذهاب لتسجيل الدخول
          </button>
        )}
      </div>
    </div>
  );
}
