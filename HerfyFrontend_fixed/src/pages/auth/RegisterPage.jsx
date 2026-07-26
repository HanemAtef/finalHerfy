import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaUser,
  FaEnvelope,
  FaPhone,
  FaLock,
  FaHardHat,
  FaShieldAlt,
  FaHeadset,
  FaCreditCard,
  FaCity,
  FaArrowRight,
} from 'react-icons/fa';
import { registerUser, clearError } from '../../store/slices/authSlice';
import { PROFESSIONS } from '../../utlis/constants';
import { referenceService } from '../../services/api';
import useCurrentLocation from '../../hooks/useCurrentLocation';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(searchParams.get('role') || 'customer');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    profession: '',
    price: '',
    city: '',
  });
  const [agreed, setAgreed] = useState(false);
  const { location } = useCurrentLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error, isAuthenticated, user, pendingVerificationEmail } = useSelector((state) => state.auth);

  // Cities & professions now come from the admin-managed reference data
  // instead of a hardcoded list — PROFESSIONS stays as a fallback in case
  // the endpoint is briefly unreachable.
  const [cities, setCities] = useState([]);
  const [professions, setProfessions] = useState(PROFESSIONS.map((name) => ({ _id: name, name })));

  useEffect(() => {
    referenceService.getCities().then((res) => {
      if (res.data?.data?.length) setCities(res.data.data);
    }).catch(() => {});
    referenceService.getServiceTypes().then((res) => {
      if (res.data?.data?.length) setProfessions(res.data.data);
    }).catch(() => {});
  }, []);

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

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agreed) return;

    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role,
      city: form.city || null,
      location: location
        ? { type: 'Point', coordinates: [location.longitude, location.latitude] }
        : { type: 'Point', coordinates: [31.2357, 30.0444] },
    };

    if (role === 'handyman') {
      payload.profession = form.profession;
      payload.price = Number(form.price);
    }

    dispatch(registerUser(payload));
  };

  const features = [
    { icon: FaShieldAlt, text: 'حماية وضمان لجميع الأطراف' },
    { icon: FaHeadset, text: 'دعم فني مخصص على مدار الساعة' },
    { icon: FaCreditCard, text: 'نظام دفع آمن وموثوق' },
  ];

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center bg-neutral px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-4 flex items-center gap-2 text-sm text-textGray hover:text-primary">
            <FaArrowRight /> رجوع
          </Link>
          <h1 className="mb-2 text-2xl font-bold text-primary">Harfey (حرفي)</h1>
          <p className="mb-8 text-textGray">إنشاء حساب جديد للبدء</p>

          <div className="mb-6 flex rounded-xl bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-colors ${
                role === 'customer' ? 'bg-white text-primary shadow-sm' : 'text-textGray'
              }`}
            >
              <FaUser /> عميل
            </button>
            <button
              type="button"
              onClick={() => setRole('handyman')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-colors ${
                role === 'handyman' ? 'bg-white text-secondary shadow-sm' : 'text-textGray'
              }`}
            >
              <FaHardHat /> حرفي
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-bold">الاسم الكامل</label>
              <div className="relative">
                <FaUser className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input name="name" value={form.name} onChange={handleChange} placeholder="أدخل اسمك الثلاثي" className="input-field pr-10" required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">رقم الجوال</label>
              <div className="relative">
                <FaPhone className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="0512345678" className="input-field pr-10" required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">البريد الإلكتروني</label>
              <div className="relative">
                <FaEnvelope className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="example@domain.com" className="input-field pr-10" required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">كلمة المرور</label>
              <div className="relative">
                <FaLock className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input name="password" type="password" value={form.password} onChange={handleChange} className="input-field pr-10" required minLength={6} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold">المدينة</label>
              <div className="relative">
                <FaCity className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <select name="city" value={form.city} onChange={handleChange} className="input-field pr-10">
                  <option value="">اختر المدينة (اختياري)</option>
                  {cities.map((c) => (
                    <option key={c._id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {role === 'handyman' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-bold">المهنة</label>
                  <select name="profession" value={form.profession} onChange={handleChange} className="input-field" required>
                    <option value="">اختر المهنة</option>
                    {professions.map((p) => (
                      <option key={p._id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold">السعر (ج.م/ساعة)</label>
                  <input name="price" type="number" value={form.price} onChange={handleChange} className="input-field" required min={0} />
                </div>
              </>
            )}

            <label className="flex items-start gap-2 text-sm text-textGray">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 rounded" required />
              <span>
                أوافق على{' '}
                <span className="text-primary">الشروط والأحكام</span> و{' '}
                <span className="text-primary">سياسة الخصوصية</span> الخاصة بمنصة حرفي
              </span>
            </label>

            <button type="submit" disabled={isLoading || !agreed} className="btn-secondary w-full">
              {isLoading ? 'جاري التسجيل...' : 'تسجيل'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-textGray">
            لديك حساب بالفعل؟{' '}
            <Link to="/login" className="font-bold text-primary">تسجيل الدخول</Link>
          </p>

          <p className="mt-8 text-center text-xs text-textGray">
            جميع الحقوق محفوظة © حرفي 2024
          </p>
        </div>
      </div>

      <div
        className="hidden flex-1 flex-col justify-center bg-primary px-12 text-white lg:flex"
        style={{
          backgroundImage:
            'linear-gradient(rgba(15,76,117,0.9), rgba(15,76,117,0.95)), url(https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d5?w=1200)',
          backgroundSize: 'cover',
        }}
      >
        <h2 className="mb-4 text-4xl font-bold">انضم إلى حرفي</h2>
        <p className="mb-8 max-w-md text-white/80">
          المنصة الرائدة في المملكة لربط الحرفيين الماهرين بأصحاب المنازل
        </p>
        <ul className="space-y-4">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <Icon className="text-tertiary" size={20} />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
