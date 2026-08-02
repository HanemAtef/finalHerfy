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
} from 'react-icons/fa';
import { registerUser, clearError } from '../../store/slices/authSlice';
import { PROFESSIONS } from '../../utlis/constants';
import { referenceService } from '../../services/api';
import useCurrentLocation from '../../hooks/useCurrentLocation';
import LoadingSpinner from '../../components/common/LoadingSpinner';
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

  // Cities & professions
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
      <div className="flex flex-1 flex-col justify-center bg-neutral/30 px-6 py-12 lg:px-16 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-xl rounded-3xl bg-white/95 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
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

          <AlertMessage type="error" message={error} className="mb-6" />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold">الاسم الكامل</label>
              <div className="relative">
                <FaUser className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input 
                  name="name" 
                  value={form.name} 
                  onChange={handleChange} 
                  placeholder="أدخل اسمك الثلاثي" 
                  className="input-field pr-10" 
                  required 
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold">رقم الجوال</label>
              <div className="relative">
                <FaPhone className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input 
                  name="phone" 
                  value={form.phone} 
                  onChange={handleChange} 
                  placeholder="0512345678" 
                  className="input-field pr-10" 
                  required 
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold">البريد الإلكتروني</label>
              <div className="relative">
                <FaEnvelope className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input 
                  name="email" 
                  type="email" 
                  value={form.email} 
                  onChange={handleChange} 
                  placeholder="example@domain.com" 
                  className="input-field pr-10" 
                  required 
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold">كلمة المرور</label>
              <div className="relative">
                <FaLock className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input 
                  name="password" 
                  type="password" 
                  value={form.password} 
                  onChange={handleChange} 
                  className="input-field pr-10" 
                  required 
                  minLength={6} 
                />
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
            </div>

            {/* Handyman Specific Fields */}
            {role === 'handyman' && (
              <>
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-4 text-lg font-bold text-secondary">معلومات الحرفي</h3>
                  
                  <div>
                    <label className="mb-1 block text-sm font-bold">المهنة</label>
                    <select 
                      name="profession" 
                      value={form.profession} 
                      onChange={handleChange} 
                      className="input-field" 
                      required
                    >
                      <option value="">اختر المهنة</option>
                      {professions.map((p) => (
                        <option key={p._id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold">السعر (ج.م/ساعة)</label>
                    <input 
                      name="price" 
                      type="number" 
                      value={form.price} 
                      onChange={handleChange} 
                      className="input-field" 
                      required 
                      min={0} 
                      step={0.5}
                    />
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold">سنوات الخبرة</label>
                    <input 
                      name="experienceYears" 
                      type="number" 
                      value={form.experienceYears} 
                      onChange={handleChange} 
                      className="input-field" 
                      min={0} 
                      placeholder="0"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold">نبذة تعريفية</label>
                    <textarea 
                      name="bio" 
                      value={form.bio} 
                      onChange={handleChange} 
                      className="input-field" 
                      rows="3" 
                      placeholder="اكتب عن نفسك وخبراتك..."
                    />
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold">العنوان</label>
                    <input 
                      name="address" 
                      value={form.address} 
                      onChange={handleChange} 
                      className="input-field" 
                      placeholder="العنوان بالتفصيل"
                    />
                  </div>
                </div>

                {/* File Uploads */}
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-4 text-lg font-bold text-secondary">المرفقات</h3>
                  
                  {/* National ID */}
                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold text-red-600">
                      <FaIdCard className="inline mr-1" /> صورة البطاقة الشخصية *
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
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
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 transition-colors hover:border-secondary hover:bg-secondary/5"
                        >
                          <FaFileUpload /> {files.nationalId ? 'تغيير الملف' : 'اختر ملف'}
                        </label>
                      </div>
                      {files.nationalId && (
                        <button
                          type="button"
                          onClick={() => removeFile('nationalId')}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {filePreviews.nationalId && filePreviews.nationalId !== 'pdf' && (
                      <div className="mt-2">
                        <img 
                          src={filePreviews.nationalId} 
                          alt="National ID" 
                          className="max-h-32 rounded-lg border"
                        />
                      </div>
                    )}
                    {filePreviews.nationalId === 'pdf' && (
                      <div className="mt-2 text-sm text-gray-500">
                        📄 ملف PDF مرفوع
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-400">صورة أو PDF (حجم أقصى 5 ميجابايت)</p>
                  </div>

                  {/* Certificate */}
                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold">
                      <FaCertificate className="inline mr-1" /> شهادة الخبرة (اختياري)
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          id="certificate"
                          type="file"
                          onChange={(e) => handleFileChange(e, 'certificate')}
                          className="hidden"
                          accept="image/*,application/pdf"
                        />
                        <label
                          htmlFor="certificate"
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 transition-colors hover:border-secondary hover:bg-secondary/5"
                        >
                          <FaFileUpload /> {files.certificate ? 'تغيير الملف' : 'اختر ملف'}
                        </label>
                      </div>
                      {files.certificate && (
                        <button
                          type="button"
                          onClick={() => removeFile('certificate')}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {filePreviews.certificate && filePreviews.certificate !== 'pdf' && (
                      <div className="mt-2">
                        <img 
                          src={filePreviews.certificate} 
                          alt="Certificate" 
                          className="max-h-32 rounded-lg border"
                        />
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-400">صورة أو PDF (حجم أقصى 5 ميجابايت)</p>
                  </div>

                  {/* Profile Image */}
                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-bold">
                      <FaCamera className="inline mr-1" /> الصورة الشخصية (اختياري)
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          id="profileImage"
                          type="file"
                          onChange={(e) => handleFileChange(e, 'profileImage')}
                          className="hidden"
                          accept="image/*"
                        />
                        <label
                          htmlFor="profileImage"
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 transition-colors hover:border-secondary hover:bg-secondary/5"
                        >
                          <FaCamera /> {files.profileImage ? 'تغيير الصورة' : 'اختر صورة'}
                        </label>
                      </div>
                      {files.profileImage && (
                        <button
                          type="button"
                          onClick={() => removeFile('profileImage')}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {filePreviews.profileImage && filePreviews.profileImage !== 'pdf' && (
                      <div className="mt-2">
                        <img 
                          src={filePreviews.profileImage} 
                          alt="Profile" 
                          className="h-20 w-20 rounded-full border-2 border-secondary object-cover"
                        />
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-400">صورة (حجم أقصى 5 ميجابايت)</p>
                  </div>
                </div>
              </>
            )}

            {/* Terms */}
            <label className="flex items-start gap-2 text-sm text-textGray">
              <input 
                type="checkbox" 
                checked={agreed} 
                onChange={(e) => setAgreed(e.target.checked)} 
                className="mt-1 rounded" 
                required 
              />
              <span>
                أوافق على{' '}
                <span className="text-primary">الشروط والأحكام</span> و{' '}
                <span className="text-primary">سياسة الخصوصية</span> الخاصة بمنصة حرفي
              </span>
            </label>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={isLoading || uploading || !agreed || (role === 'handyman' && !isHandymanFormValid())} 
              className="btn-secondary flex w-full items-center justify-center gap-2 py-4 text-base shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              {(isLoading || uploading) ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  جاري التسجيل...
                </>
              ) : (
                'إنشاء الحساب'
              )}
            </button>

            {role === 'handyman' && !isHandymanFormValid() && (
              <p className="text-xs text-red-500 text-center">
                * يرجى ملء جميع الحقول المطلوبة ورفع البطاقة الشخصية
              </p>
            )}
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