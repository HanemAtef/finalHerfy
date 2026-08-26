// HerfyFrontend_fixed/src/pages/RegisterPage.jsx
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
  FaMapMarkerAlt,
  FaArrowRight,
  FaIdCard,
  FaCertificate,
  FaCamera,
  FaFileUpload,
  FaUserPlus,
  FaCheck,
} from 'react-icons/fa';
import { registerUser, clearError } from '../../store/slices/authSlice';
import { referenceService } from '../../services/api';
import useCurrentLocation from '../../hooks/useCurrentLocation';
import AlertMessage from '../../components/common/AlertMessage';
import { PROFESSIONS } from '../../utils/constants';

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
    experienceYears: '',
    bio: '',
    address: '',
  });
  
  // ===== File upload states =====
  const [files, setFiles] = useState({
    nationalId: null,
    certificate: null,
    profileImage: null,
  });
  const [filePreviews, setFilePreviews] = useState({
    nationalId: null,
    certificate: null,
    profileImage: null,
  });
  const [uploading, setUploading] = useState(false);
  
  const [agreed, setAgreed] = useState(false);
  const { location } = useCurrentLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error, isAuthenticated, user, pendingVerificationEmail } = useSelector((state) => state.auth);

  // Professions
  const [professions, setProfessions] = useState(PROFESSIONS.map((name) => ({ _id: name, name })));

  useEffect(() => {
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

  // ===== File upload handlers =====
  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الملف يجب أن لا يتجاوز 5 ميجابايت');
      e.target.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('الملف يجب أن يكون صورة (JPG, PNG, GIF) أو PDF');
      e.target.value = '';
      return;
    }

    setFiles({ ...files, [field]: file });

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreviews({ ...filePreviews, [field]: reader.result });
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreviews({ ...filePreviews, [field]: 'pdf' });
    }
  };

  const removeFile = (field) => {
    setFiles({ ...files, [field]: null });
    setFilePreviews({ ...filePreviews, [field]: null });
    const input = document.getElementById(field);
    if (input) input.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agreed) {
      alert('يرجى الموافقة على الشروط والأحكام');
      return;
    }

    if (role === 'handyman' && !files.nationalId) {
      alert('يرجى رفع صورة البطاقة الشخصية للتحقق');
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append('name', form.name);
    formData.append('email', form.email);
    formData.append('phone', form.phone);
    formData.append('password', form.password);
    formData.append('role', role);
    formData.append('address', form.address || '');
    
    if (location) {
      formData.append('location[type]', 'Point');
      formData.append('location[coordinates][0]', location.longitude);
      formData.append('location[coordinates][1]', location.latitude);
    }

    if (role === 'handyman') {
      formData.append('profession', form.profession);
      formData.append('price', form.price);
      formData.append('experienceYears', form.experienceYears || 0);
      formData.append('bio', form.bio || '');
      
      if (files.nationalId) {
        formData.append('nationalId', files.nationalId);
      }
      if (files.certificate) {
        formData.append('certificate', files.certificate);
      }
      if (files.profileImage) {
        formData.append('profileImage', files.profileImage);
      }
    }

    dispatch(registerUser(formData))
      .unwrap()
      .then(() => {
        setUploading(false);
        navigate('/login', {
          state: {
            infoMessage: 'Your registration is pending admin approval. (تم إنشاء حسابك بنجاح وهو في انتظار موافقة الأدمن)',
          },
        });
      })
      .catch(() => {
        setUploading(false);
      });
  };

  const isHandymanFormValid = () => {
    if (role !== 'handyman') return true;
    return (
      form.profession &&
      form.price &&
      form.price > 0 &&
      files.nationalId
    );
  };

  const features = [
    { icon: FaShieldAlt, text: 'حماية وضمان لجميع الأطراف' },
    { icon: FaHeadset, text: 'دعم فني ومساعدة على مدار الساعة' },
    { icon: FaCreditCard, text: 'طرق دفع متنوعة وإلكترونية آمنة' },
  ];

  return (
    <div className="flex min-h-screen bg-[#F3F5F7]">
      {/* Registration Form Side */}
      <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <div className="w-full card space-y-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <FaArrowRight size={11} /> العودة للرئيسية
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-white font-black text-sm">
              ح
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-textDark tracking-tight">إنشاء حساب جديد</h1>
            <p className="text-xs text-textGray mt-1">انضم إلى شبكة منصة حرفي المتكاملة لخدمات الصيانة المنزلية</p>
          </div>

          {/* Account Role Selector */}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral p-1">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                role === 'customer'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-textGray hover:text-textDark'
              }`}
            >
              <FaUser size={13} /> حساب عميل
            </button>
            <button
              type="button"
              onClick={() => setRole('handyman')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                role === 'handyman'
                  ? 'bg-secondary text-white shadow-sm'
                  : 'text-textGray hover:text-textDark'
              }`}
            >
              <FaHardHat size={14} /> حساب فني / حرفي
            </button>
          </div>

          {error && <AlertMessage type="error" message={error} />}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-textDark">الاسم الكامل</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"><FaUser size={12} /></span>
                  <input
                    id="register-name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="الاسم الثلاثي"
                    className="input-field pr-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-textDark">رقم الهاتف</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"><FaPhone size={12} /></span>
                  <input
                    id="register-phone"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="01xxxxxxxxx"
                    className="input-field pr-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-textDark">البريد الإلكتروني</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"><FaEnvelope size={12} /></span>
                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="name@example.com"
                    className="input-field pr-9 text-xs"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-textDark">كلمة المرور</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray"><FaLock size={12} /></span>
                  <input
                    id="register-password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="input-field pr-9 text-xs"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            {/* Handyman Specific Fields & Documents */}
            {role === 'handyman' && (
              <div className="space-y-4 rounded-2xl bg-secondary/5 border border-secondary/20 p-4 animate-fade-in">
                <div className="flex items-center gap-2 pb-2 border-b border-secondary/20">
                  <FaHardHat className="text-secondary" />
                  <h2 className="text-xs font-bold text-textDark">بيانات الحرفة والوثائق الرسمية</h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">التخصص / المهنة *</label>
                    <select
                      id="register-profession"
                      name="profession"
                      value={form.profession}
                      onChange={handleChange}
                      className="input-field text-xs py-2"
                      required
                    >
                      <option value="">اختر المهنة</option>
                      {professions.map((p) => (
                        <option key={p._id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">السعر بالساعة (ج.م) *</label>
                    <input
                      id="register-price"
                      name="price"
                      type="number"
                      value={form.price}
                      onChange={handleChange}
                      className="input-field text-xs py-2 font-bold"
                      required
                      min={1}
                      placeholder="100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">سنوات الخبرة</label>
                    <input
                      id="register-experience"
                      name="experienceYears"
                      type="number"
                      value={form.experienceYears}
                      onChange={handleChange}
                      className="input-field text-xs py-2"
                      min={0}
                      placeholder="3"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">العنوان بالتفصيل</label>
                    <input
                      id="register-address"
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      className="input-field text-xs py-2"
                      placeholder="المدينة، الحي..."
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">نبذة تعريفية</label>
                    <input
                      id="register-bio"
                      name="bio"
                      value={form.bio}
                      onChange={handleChange}
                      className="input-field text-xs py-2"
                      placeholder="نبذة مختصرة عن مهاراتك..."
                    />
                  </div>
                </div>

                {/* Uploads */}
                <div className="grid gap-3 sm:grid-cols-3 pt-1">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-emergency">
                      بطاقة الرقم القومي *
                    </label>
                    <input
                      id="nationalId"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'nationalId')}
                      className="hidden"
                      accept="image/*,application/pdf"
                      required={role === 'handyman'}
                    />
                    <label
                      htmlFor="nationalId"
                      className={`flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-[11px] font-bold transition-all ${
                        files.nationalId
                          ? 'border-tertiary bg-emerald-50 text-tertiary'
                          : 'border-emergency/40 bg-white text-emergency hover:bg-emergency/5'
                      }`}
                    >
                      {files.nationalId ? (
                        <span className="flex items-center gap-1"><FaCheck size={10} /> تم الرفع</span>
                      ) : (
                        <span className="flex items-center gap-1"><FaFileUpload size={12} /> رفع البطاقة</span>
                      )}
                    </label>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">
                      شهادة الخبرة
                    </label>
                    <input
                      id="certificate"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'certificate')}
                      className="hidden"
                      accept="image/*,application/pdf"
                    />
                    <label
                      htmlFor="certificate"
                      className={`flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-[11px] font-bold transition-all ${
                        files.certificate
                          ? 'border-tertiary bg-emerald-50 text-tertiary'
                          : 'border-borderGray bg-white text-textGray hover:border-primary'
                      }`}
                    >
                      {files.certificate ? (
                        <span className="flex items-center gap-1"><FaCheck size={10} /> تم الرفع</span>
                      ) : (
                        <span className="flex items-center gap-1"><FaFileUpload size={12} /> شهادة (اختياري)</span>
                      )}
                    </label>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-textDark">
                      الصورة الشخصية
                    </label>
                    <input
                      id="profileImage"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'profileImage')}
                      className="hidden"
                      accept="image/*"
                    />
                    <label
                      htmlFor="profileImage"
                      className={`flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-[11px] font-bold transition-all ${
                        files.profileImage
                          ? 'border-tertiary bg-emerald-50 text-tertiary'
                          : 'border-borderGray bg-white text-textGray hover:border-primary'
                      }`}
                    >
                      {files.profileImage ? (
                        <span className="flex items-center gap-1"><FaCheck size={10} /> تم الرفع</span>
                      ) : (
                        <span className="flex items-center gap-1"><FaCamera size={12} /> صورة (اختياري)</span>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Terms checkbox */}
            <label className="flex items-start gap-2 text-xs text-textGray pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 rounded border-borderGray text-primary focus:ring-primary h-4 w-4"
                required
              />
              <span>
                أوافق على <span className="font-bold text-primary">الشروط والأحكام</span> و{' '}
                <span className="font-bold text-primary">سياسة الاستخدام</span> لمنصة حرفي
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || uploading || !agreed || (role === 'handyman' && !isHandymanFormValid())}
              className={`w-full py-3 text-xs font-bold rounded-xl text-white shadow-sm transition-all ${
                role === 'handyman' ? 'bg-secondary hover:bg-secondary/90' : 'bg-primary hover:bg-primary/90'
              } disabled:opacity-50`}
            >
              {(isLoading || uploading) ? 'جاري إنشاء وتفعيل الحساب...' : 'إنشاء الحساب الآن'}
            </button>

            <p className="text-center text-xs text-textGray pt-1">
              لديك حساب بالفعل؟{' '}
              <Link to="/login" className="font-bold text-primary hover:underline">
                تسجيل الدخول
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}