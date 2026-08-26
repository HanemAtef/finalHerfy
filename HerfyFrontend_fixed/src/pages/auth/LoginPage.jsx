import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const { isLoading, error, isAuthenticated, user, pendingVerificationEmail } = useSelector((state) => state.auth);
  const [infoMsg, setInfoMsg] = useState(location.state?.infoMessage || null);

  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  useEffect(() => {
    if (location.state?.infoMessage) {
      setInfoMsg(location.state.infoMessage);
    }
  }, [location.state]);

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
      className="relative min-h-screen bg-cover bg-center flex flex-col justify-between"
      style={{
        backgroundImage:
          'linear-gradient(rgba(243,245,247,0.85), rgba(243,245,247,0.92)), url(https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1600)',
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-primary font-bold text-lg"
          aria-label="الصفحة الرئيسية — حرفي"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white font-bold text-sm">
            ح
          </div>
          <span>Harfey <span className="text-secondary">(حرفي)</span></span>
        </Link>
      </header>

      {/* Main Card */}
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="auth-card max-w-md w-full">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-textGray transition-colors hover:text-primary"
            tabIndex={0}
          >
            <FaArrowRight size={11} aria-hidden="true" /> العودة للرئيسية
          </Link>

          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm" aria-hidden="true">
              <FaUserCog size={26} />
            </div>
          </div>

          <h1 className="mb-1 text-center text-2xl font-extrabold text-textDark">تسجيل الدخول</h1>
          <p className="mb-6 text-center text-xs text-textGray">
            أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى حسابك
          </p>

          {infoMsg && (
            <AlertMessage type="info" message={infoMsg} className="mb-4" />
          )}

          <AlertMessage type="error" message={error} className="mb-4" />

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="نموذج تسجيل الدخول">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold text-textDark">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <FaUser
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"
                  size={13}
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@harfey.com"
                  className="input-field pr-10 text-sm"
                  required
                  autoComplete="email"
                  aria-required="true"
                  aria-label="البريد الإلكتروني"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-bold text-textDark">
                كلمة المرور
              </label>
              <div className="relative">
                <FaLock
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"
                  size={13}
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pr-10 text-sm"
                  required
                  autoComplete="current-password"
                  aria-required="true"
                  aria-label="كلمة المرور"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-textGray font-medium">
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
                className="font-medium text-textGray transition-colors hover:text-primary"
                tabIndex={0}
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-md shadow-primary/20 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
              aria-busy={isLoading}
              aria-label={isLoading ? 'جاري تسجيل الدخول' : 'تسجيل الدخول'}
            >
              {isLoading ? (
                <>
                  <div
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden="true"
                  />
                  جاري تسجيل الدخول...
                </>
              ) : (
                <>
                  <FaSignInAlt size={14} aria-hidden="true" /> دخول
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-textGray">
            ليس لديك حساب؟{' '}
            <Link
              to="/register"
              className="font-bold text-secondary transition-colors hover:underline"
              tabIndex={0}
            >
              إنشاء حساب جديد
            </Link>
          </p>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-borderGray/60" />
            <span className="text-[11px] text-textGray">أو تابع عبر</span>
            <div className="h-px flex-1 bg-borderGray/60" />
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-borderGray/80 bg-white py-2.5 text-xs font-semibold text-textDark transition-all hover:bg-neutral shadow-sm"
            aria-label="متابعة باستخدام Google"
          >
            متابعة باستخدام Google <FcGoogle size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Trust badges footer */}
      <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-6 pb-6 text-xs text-textGray">
        <span className="flex items-center gap-1.5 font-medium">
          <FaShieldAlt className="text-tertiary" size={13} aria-hidden="true" /> منصة موثوقة
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <FaHeadset className="text-primary" size={13} aria-hidden="true" /> دعم فني 24/7
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <FaMoneyCheckAlt className="text-secondary" size={13} aria-hidden="true" /> دفع آمن
        </span>
      </div>
    </div>
  );
}
