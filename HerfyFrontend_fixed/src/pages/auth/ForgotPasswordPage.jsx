import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaEnvelope, FaKey, FaLock, FaArrowRight } from 'react-icons/fa';
import { forgotPassword, resetPassword, clearError } from '../../store/slices/authSlice';

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
    <div className="flex min-h-screen items-center justify-center bg-neutral px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <Link to="/login" className="mb-6 flex items-center gap-2 text-sm text-textGray hover:text-primary">
          <FaArrowRight /> العودة لتسجيل الدخول
        </Link>

        <h1 className="mb-2 text-center text-2xl font-bold text-textDark">
          {step === 'done' ? 'تم إعادة تعيين كلمة المرور' : 'استعادة كلمة المرور'}
        </h1>
        <p className="mb-8 text-center text-sm text-textGray">
          {step === 'request' && 'أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق'}
          {step === 'reset' && 'أدخل الرمز الذي وصلك على بريدك الإلكتروني وكلمة المرور الجديدة'}
          {step === 'done' && 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة'}
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">{error}</div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-textDark">البريد الإلكتروني</label>
              <div className="relative">
                <FaEnvelope className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@harfey.com"
                  className="input-field pr-10"
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-textDark">رمز التحقق (OTP)</label>
              <div className="relative">
                <FaKey className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="input-field pr-10"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-textDark">كلمة المرور الجديدة</label>
              <div className="relative">
                <FaLock className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pr-10"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'جاري الحفظ...' : 'إعادة تعيين كلمة المرور'}
            </button>
            <button
              type="button"
              onClick={() => setStep('request')}
              className="w-full text-center text-sm text-textGray hover:text-primary"
            >
              لم يصلك الرمز؟ إعادة الإرسال
            </button>
          </form>
        )}

        {step === 'done' && (
          <button type="button" onClick={() => navigate('/login')} className="btn-primary w-full">
            الذهاب لتسجيل الدخول
          </button>
        )}
      </div>
    </div>
  );
}
