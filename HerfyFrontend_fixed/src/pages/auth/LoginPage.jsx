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
      <header className="auth-fade-in flex items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="text-xl font-bold text-primary transition-opacity hover:opacity-90"
          aria-label="الصفحة الرئيسية — حرفي"
        >
          Harfey (حرفي)
        </Link>
      </header>

      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-8">
        <div className="auth-card max-w-md">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-2 text-sm text-textGray transition-colors hover:text-primary"
            tabIndex={0}
          >
            <FaArrowRight aria-hidden="true" /> رجوع
          </Link>

          <div className="mb-6 flex justify-center">
            <div className="auth-logo-badge h-14 w-14" aria-hidden="true">
              <FaUserCog size={24} />
            </div>
          </div>

          <h1 className="mb-2 text-center text-2xl font-bold text-textDark">أهلاً بك مجدداً</h1>
          <p className="mb-8 text-center text-sm text-textGray">
            سجل دخولك للوصول إلى أفضل الحرفيين
          </p>

          <AlertMessage type="error" message={error} className="mb-6" />

          <form onSubmit={handleSubmit} className="space-y-5" aria-label="نموذج تسجيل الدخول">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-bold text-textDark">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <FaUser
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@harfey.com"
                  className="auth-input"
                  required
                  autoComplete="email"
                  aria-required="true"
                  aria-label="البريد الإلكتروني"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-bold text-textDark">
                كلمة المرور
              </label>
              <div className="relative">
                <FaLock
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input"
                  required
                  autoComplete="current-password"
                  aria-required="true"
                  aria-label="كلمة المرور"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-textGray">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-borderGray text-primary focus:ring-primary"
                  aria-label="تذكرني"
                />
                تذكرني
              </label>
              <Link
                to="/forgot-password"
                className="text-textGray transition-colors hover:text-primary"
                tabIndex={0}
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary flex w-full items-center justify-center gap-2 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              aria-busy={isLoading}
              aria-label={isLoading ? 'جاري تسجيل الدخول' : 'تسجيل الدخول'}
            >
              {isLoading ? (
                <>
                  <div
                    className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden="true"
                  />
                  جاري تسجيل الدخول...
                </>
              ) : (
                <>
                  <FaSignInAlt aria-hidden="true" /> تسجيل الدخول
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-textGray">
            ليس لديك حساب؟{' '}
            <Link
              to="/register"
              className="font-bold text-primary transition-colors hover:underline"
              tabIndex={0}
            >
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
            aria-label="متابعة باستخدام Google"
          >
            متابعة باستخدام Google <FcGoogle size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="auth-fade-in mx-auto flex max-w-md flex-wrap items-center justify-center gap-6 pb-4 text-xs text-textGray">
        <span className="flex items-center gap-1">
          <FaShieldAlt aria-hidden="true" /> منصة موثوقة
        </span>
        <span className="flex items-center gap-1">
          <FaHeadset aria-hidden="true" /> دعم فني 24/7
        </span>
        <span className="flex items-center gap-1">
          <FaMoneyCheckAlt aria-hidden="true" /> دفع آمن
        </span>
      </div>
    </div>
  );
}
