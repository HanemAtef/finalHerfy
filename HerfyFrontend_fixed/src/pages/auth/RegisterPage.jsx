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
  FaCity,
  FaArrowRight,
  FaIdCard,
  FaCertificate,
  FaCamera,
  FaFileUpload,
  FaUserPlus,
} from 'react-icons/fa';
import { registerUser, clearError } from '../../store/slices/authSlice';
import { PROFESSIONS } from '../../utlis/constants';
import { referenceService } from '../../services/api';
import useCurrentLocation from '../../hooks/useCurrentLocation';
import AlertMessage from '../../components/common/AlertMessage';

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

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الملف يجب أن لا يتجاوز 5 ميجابايت');
      e.target.value = '';
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('الملف يجب أن يكون صورة (JPG, PNG, GIF) أو PDF');
      e.target.value = '';
      return;
    }

    setFiles({ ...files, [field]: file });

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreviews({ ...filePreviews, [field]: reader.result });
      };
      reader.readAsDataURL(file);
    } else {
      // For PDF, show icon
      setFilePreviews({ ...filePreviews, [field]: 'pdf' });
    }
  };

  const removeFile = (field) => {
    setFiles({ ...files, [field]: null });
    setFilePreviews({ ...filePreviews, [field]: null });
    // Reset the input
    const input = document.getElementById(field);
    if (input) input.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agreed) {
      alert('يرجى الموافقة على الشروط والأحكام');
      return;
    }

    // Validate handyman files
    if (role === 'handyman' && !files.nationalId) {
      alert('يرجى رفع صورة البطاقة الشخصية');
      return;
    }

    setUploading(true);

    // Create FormData for file upload
    const formData = new FormData();
    
    // Add text fields
    formData.append('name', form.name);
    formData.append('email', form.email);
    formData.append('phone', form.phone);
    formData.append('password', form.password);
    formData.append('role', role);
    formData.append('city', form.city || '');
    formData.append('address', form.address || '');
    
    // Add location
    if (location) {
      formData.append('location[type]', 'Point');
      formData.append('location[coordinates][0]', location.longitude);
      formData.append('location[coordinates][1]', location.latitude);
    }

    // Add handyman fields
    if (role === 'handyman') {
      formData.append('profession', form.profession);
      formData.append('price', form.price);
      formData.append('experienceYears', form.experienceYears || 0);
      formData.append('bio', form.bio || '');
      
      // Add files
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

    dispatch(registerUser(formData));
  };

  // Check if form is valid for handyman
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
    { icon: FaHeadset, text: 'دعم فني مخصص على مدار الساعة' },
    { icon: FaCreditCard, text: 'نظام دفع آمن وموثوق' },
  ];

  return (
    <div className="flex min-h-screen">
      <div className="register-page">
        <div className="register-card">
          <Link to="/" className="register-back" tabIndex={0}>
            <FaArrowRight aria-hidden="true" /> رجوع للرئيسية
          </Link>

          <div className="register-hero">
            <div className="register-hero-main">
              <div className="register-logo" aria-hidden="true">
                <FaUserPlus size={20} />
              </div>
              <div className="register-header">
                <h1>إنشاء حساب جديد</h1>
                <p>انضم إلى Harfey (حرفي) وابدأ في دقائق</p>
              </div>
            </div>

            <div className="register-role-tabs" role="tablist" aria-label="نوع الحساب">
              <button
                type="button"
                role="tab"
                aria-selected={role === 'customer'}
                onClick={() => setRole('customer')}
              >
                <FaUser aria-hidden="true" /> عميل
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={role === 'handyman'}
                onClick={() => setRole('handyman')}
                className={role === 'handyman' ? 'is-handyman' : ''}
              >
                <FaHardHat aria-hidden="true" /> حرفي
              </button>
            </div>
          </div>

          <AlertMessage type="error" message={error} className="mb-3" />

          <form onSubmit={handleSubmit} className="register-form" aria-label="نموذج إنشاء حساب">
            <div className="register-grid">
              <div className="register-field">
                <label htmlFor="register-name">الاسم الكامل</label>
                <div className="register-input-wrap">
                  <span className="register-input-icon" aria-hidden="true"><FaUser /></span>
                  <input
                    id="register-name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="الاسم الثلاثي"
                    className="register-input"
                    required
                    aria-required="true"
                    aria-label="الاسم الكامل"
                  />
                </div>
              </div>

              <div className="register-field">
                <label htmlFor="register-phone">رقم الجوال</label>
                <div className="register-input-wrap">
                  <span className="register-input-icon" aria-hidden="true"><FaPhone /></span>
                  <input
                    id="register-phone"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="0512345678"
                    className="register-input"
                    required
                    aria-required="true"
                    aria-label="رقم الجوال"
                  />
                </div>
              </div>

              <div className="register-field">
                <label htmlFor="register-email">البريد الإلكتروني</label>
                <div className="register-input-wrap">
                  <span className="register-input-icon" aria-hidden="true"><FaEnvelope /></span>
                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="example@domain.com"
                    className="register-input"
                    required
                    autoComplete="email"
                    aria-required="true"
                    aria-label="البريد الإلكتروني"
                  />
                </div>
              </div>

              <div className="register-field">
                <label htmlFor="register-password">كلمة المرور</label>
                <div className="register-input-wrap">
                  <span className="register-input-icon" aria-hidden="true"><FaLock /></span>
                  <input
                    id="register-password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="register-input"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    aria-required="true"
                    aria-label="كلمة المرور"
                  />
                </div>
              </div>
            </div>

            {role === 'handyman' && (
              <div className="register-section">
                <h3 className="register-section-title">معلومات الحرفي والمرفقات</h3>

                <div className="register-grid register-grid--3">
                  <div className="register-field">
                    <label htmlFor="register-profession">المهنة</label>
                    <div className="register-input-wrap">
                      <span className="register-input-icon" aria-hidden="true"><FaHardHat /></span>
                      <select
                        id="register-profession"
                        name="profession"
                        value={form.profession}
                        onChange={handleChange}
                        className="register-input"
                        required
                        aria-required="true"
                        aria-label="المهنة"
                      >
                        <option value="">اختر المهنة</option>
                        {professions.map((p) => (
                          <option key={p._id} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="register-field">
                    <label htmlFor="register-price">السعر (ج.م/س)</label>
                    <div className="register-input-wrap">
                      <span className="register-input-icon" aria-hidden="true"><FaCreditCard /></span>
                      <input
                        id="register-price"
                        name="price"
                        type="number"
                        value={form.price}
                        onChange={handleChange}
                        className="register-input"
                        required
                        min={0}
                        step={0.5}
                        placeholder="0"
                        aria-label="السعر بالساعة"
                      />
                    </div>
                  </div>

                  <div className="register-field">
                    <label htmlFor="register-experience">سنوات الخبرة</label>
                    <div className="register-input-wrap">
                      <span className="register-input-icon" aria-hidden="true"><FaCertificate /></span>
                      <input
                        id="register-experience"
                        name="experienceYears"
                        type="number"
                        value={form.experienceYears}
                        onChange={handleChange}
                        className="register-input"
                        min={0}
                        placeholder="0"
                        aria-label="سنوات الخبرة"
                      />
                    </div>
                  </div>

                  <div className="register-field register-grid-span-2">
                    <label htmlFor="register-address">العنوان</label>
                    <div className="register-input-wrap">
                      <span className="register-input-icon" aria-hidden="true"><FaCity /></span>
                      <input
                        id="register-address"
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                        className="register-input"
                        placeholder="العنوان بالتفصيل"
                        aria-label="العنوان"
                      />
                    </div>
                  </div>

                  <div className="register-field">
                    <label htmlFor="register-bio">نبذة تعريفية</label>
                    <div className="register-input-wrap">
                      <span className="register-input-icon" aria-hidden="true"><FaUser /></span>
                      <input
                        id="register-bio"
                        name="bio"
                        value={form.bio}
                        onChange={handleChange}
                        className="register-input"
                        placeholder="نبذة قصيرة عنك"
                        aria-label="نبذة تعريفية"
                      />
                    </div>
                  </div>

                  <div className="register-field">
                    <label className="text-emergency">
                      <FaIdCard className="inline mr-1" aria-hidden="true" /> البطاقة الشخصية *
                    </label>
                    <input
                      id="nationalId"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'nationalId')}
                      className="hidden"
                      accept="image/*,application/pdf"
                      required={role === 'handyman'}
                    />
                    <label htmlFor="nationalId" className="register-upload">
                      <FaFileUpload aria-hidden="true" /> {files.nationalId ? 'تغيير الملف' : 'رفع الملف'}
                    </label>
                  </div>

                  <div className="register-field">
                    <label>
                      <FaCertificate className="inline mr-1" aria-hidden="true" /> شهادة الخبرة
                    </label>
                    <input
                      id="certificate"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'certificate')}
                      className="hidden"
                      accept="image/*,application/pdf"
                    />
                    <label htmlFor="certificate" className="register-upload">
                      <FaFileUpload aria-hidden="true" /> {files.certificate ? 'تغيير الملف' : 'رفع الملف'}
                    </label>
                  </div>

                  <div className="register-field">
                    <label>
                      <FaCamera className="inline mr-1" aria-hidden="true" /> الصورة الشخصية
                    </label>
                    <input
                      id="profileImage"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'profileImage')}
                      className="hidden"
                      accept="image/*"
                    />
                    <label htmlFor="profileImage" className="register-upload">
                      <FaCamera aria-hidden="true" /> {files.profileImage ? 'تغيير الصورة' : 'رفع صورة'}
                    </label>
                  </div>
                </div>

                {!isHandymanFormValid() && (
                  <p className="mt-2 text-center text-xs text-emergency" role="alert">
                    * أكمل الحقول المطلوبة وارفع البطاقة الشخصية
                  </p>
                )}
              </div>
            )}

            <div className="register-actions">
              <label className="flex max-w-sm items-start gap-2 text-xs leading-relaxed text-textGray">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-borderGray text-primary focus:ring-primary"
                  required
                  aria-label="الموافقة على الشروط والأحكام"
                />
                <span>
                  أوافق على <span className="font-semibold text-primary">الشروط والأحكام</span> و{' '}
                  <span className="font-semibold text-primary">سياسة الخصوصية</span>
                </span>
              </label>

              <div className="register-actions-main">
                <button
                  type="submit"
                  disabled={isLoading || uploading || !agreed || (role === 'handyman' && !isHandymanFormValid())}
                  className="register-btn"
                  aria-busy={isLoading || uploading}
                  aria-label={isLoading || uploading ? 'جاري إنشاء الحساب' : 'إنشاء الحساب'}
                >
                  {(isLoading || uploading) ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                      جاري التسجيل...
                    </>
                  ) : (
                    'إنشاء الحساب'
                  )}
                </button>

                <p className="register-footer">
                  لديك حساب؟{' '}
                  <Link to="/login" className="font-bold text-primary transition-colors hover:text-secondary hover:underline" tabIndex={0}>
                    سجل دخول
                  </Link>
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div
        className="register-sidebar auth-fade-in"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d5?w=1200)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="register-sidebar-overlay" aria-hidden="true" />
        <div className="register-sidebar-content">
          <div className="register-logo mb-6 h-14 w-14">
            <FaHardHat size={22} aria-hidden="true" />
          </div>
          <h2 className="mb-3 text-4xl font-bold leading-tight">انضم إلى حرفي</h2>
          <p className="mb-8 max-w-md text-base text-white/85">
            المنصة الرائدة لربط الحرفيين الماهرين بأصحاب المنازل بثقة وأمان
          </p>
          <ul className="space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="register-feature">
                <Icon className="shrink-0 text-secondary" size={18} aria-hidden="true" />
                <span className="text-sm font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}