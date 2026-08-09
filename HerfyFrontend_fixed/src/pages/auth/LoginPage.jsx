import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaUser, FaLock, FaSignInAlt, FaUserCog, FaHeadset, FaShieldAlt, FaMoneyCheckAlt, FaArrowRight } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import { loginUser, clearError } from '../../store/slices/authSlice';
import AlertMessage from '../../components/common/AlertMessage';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error, isAuthenticated, user, pendingVerificationEmail } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  useEffect(() => {
    if (pendingVerificationEmail) {
      navigate('/verify-email', { state: { email: pendingVerificationEmail } });
    }
  }, [pendingVerificationEmail, navigate]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(loginUser({ email, password }));
  };

  return (
    <div
      className="relative min-h-screen bg-cover bg-center"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url(https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1600)',
      }}
    >
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-xl font-bold text-primary">
          Harfey (حرفي)
        </Link>
      </header>

      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-3xl bg-white/90 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md border border-white/20 transition-all duration-300">
          <Link to="/" className="mb-4 flex items-center gap-2 text-sm text-textGray hover:text-primary">
            <FaArrowRight /> رجوع
          </Link>

          <div className="mb-6 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white">
              <FaUserCog size={24} />
            </div>
          </div>

          <h1 className="mb-2 text-center text-2xl font-bold text-textDark">أهلاً بك مجدداً</h1>
          <p className="mb-8 text-center text-sm text-textGray">
            سجل دخولك للوصول إلى أفضل الحرفيين
          </p>

          <AlertMessage type="error" message={error} className="mb-6" />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-textDark">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <FaUser className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
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

            <div>
              <label className="mb-2 block text-sm font-bold text-textDark">كلمة المرور</label>
              <div className="relative">
                <FaLock className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pr-10"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-textGray">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-borderGray text-primary"
                />
                تذكرني
              </label>
              <Link to="/forgot-password" className="text-textGray hover:text-primary">
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary flex w-full items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-0.5 transition-all">
              {isLoading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  جاري تسجيل الدخول...
                </>
              ) : (
                <><FaSignInAlt /> تسجيل الدخول</>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-textGray">
            ليس لديك حساب؟{' '}
            <Link to="/register" className="font-bold text-primary hover:underline">
              إنشاء حساب جديد
            </Link>
          </p>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-borderGray" />
            <span className="text-xs text-textGray">أو تابع عبر</span>
            <div className="h-px flex-1 bg-borderGray" />
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-borderGray bg-white py-3 text-sm font-medium text-textDark transition-colors hover:bg-neutral"
          >
            متابعة باستخدام Google <FcGoogle size={20} />
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-6 pb-4 text-xs text-textGray">
        <span className="flex items-center gap-1"><FaShieldAlt /> منصة موثوقة</span>
        <span className="flex items-center gap-1"><FaHeadset /> دعم فني 24/7</span>
        <span className="flex items-center gap-1"><FaMoneyCheckAlt /> دفع آمن</span>
      </div>

      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-4 pb-8 opacity-40">
        {['Partner 01', 'Partner 02', 'Partner 03', 'Partner 04'].map((p) => (
          <span key={p} className="rounded-md bg-textGray/20 px-6 py-2 text-xs font-semibold text-textGray">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
