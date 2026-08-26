import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaSignOutAlt,
  FaCamera,
  FaTrash,
  FaPlus,
  FaArrowRight,
  FaFlag,
  FaTools,
  FaCheckCircle,
  FaUser,
  FaMapMarkerAlt,
  FaCrosshairs,
} from 'react-icons/fa';
import { logoutUser, updateProfile } from '../../store/slices/authSlice';
import { updateHandymanProfile, getHandymanById } from '../../store/slices/handymanSlice';
import { uploadService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';
import ChangePasswordCard from '../../components/common/ChangePasswordCard';
import AlertMessage from '../../components/common/AlertMessage';

export default function HandymanSettingsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, error: authError } = useSelector((state) => state.auth);
  const { selectedHandyman, isLoading: handymanLoading, error: handymanError } = useSelector(
    (state) => state.handymen
  );

  const avatarInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [account, setAccount] = useState({ name: '', phone: '' });
  const [profile, setProfile] = useState({
    bio: '',
    price: '',
    experienceYears: '',
    isAvailable: true,
    address: '',
    latitude: '',
    longitude: '',
  });
  const [gallery, setGallery] = useState([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [locationDetecting, setLocationDetecting] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [locMsg, setLocMsg] = useState('');

  useEffect(() => {
    if (user?._id) dispatch(getHandymanById(user._id));
  }, [dispatch, user?._id]);

  useEffect(() => {
    if (user) setAccount({ name: user.name || '', phone: user.phone || '' });
  }, [user]);

  useEffect(() => {
    if (selectedHandyman) {
      const coords =
        selectedHandyman.location?.coordinates ||
        user?.location?.coordinates ||
        [];

      setProfile({
        bio: selectedHandyman.bio || '',
        price: selectedHandyman.price || '',
        experienceYears: selectedHandyman.experienceYears || '',
        isAvailable: selectedHandyman.isAvailable ?? true,
        address: selectedHandyman.address || user?.address || '',
        longitude: coords[0] !== undefined ? String(coords[0]) : '',
        latitude: coords[1] !== undefined ? String(coords[1]) : '',
      });
      setGallery(selectedHandyman.gallery || []);
    }
  }, [selectedHandyman, user]);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocMsg('المتصفح لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    setLocationDetecting(true);
    setLocMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setProfile((prev) => ({
          ...prev,
          latitude: String(lat),
          longitude: String(lng),
        }));
        setLocationDetecting(false);
        setLocMsg('تم تحديد موقعك الجغرافي بنجاح. لا تنسَ الضغط على "حفظ التغييرات".');
      },
      () => {
        setLocationDetecting(false);
        setLocMsg('تعذر الوصول إلى موقعك. يرجى التأكد من تفعيل الـ GPS والسماح للمتصفح بالوصول.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSavedMsg('');
    setLocMsg('');

    let locationPayload = undefined;
    const latNum = parseFloat(profile.latitude);
    const lngNum = parseFloat(profile.longitude);

    if (
      !isNaN(latNum) &&
      !isNaN(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180
    ) {
      locationPayload = {
        type: 'Point',
        coordinates: [lngNum, latNum],
      };
    }

    const accountResult = await dispatch(
      updateProfile({
        name: account.name,
        phone: account.phone,
        address: profile.address,
        ...(locationPayload ? { location: locationPayload } : {}),
      })
    );

    const profileResult = await dispatch(
      updateHandymanProfile({
        id: user._id,
        data: {
          bio: profile.bio,
          price: Number(profile.price) || 0,
          isAvailable: profile.isAvailable,
          address: profile.address,
          gallery,
          ...(locationPayload ? { location: locationPayload } : {}),
        },
      })
    );

    if (updateProfile.fulfilled.match(accountResult) && updateHandymanProfile.fulfilled.match(profileResult)) {
      setSavedMsg('تم حفظ البيانات والموقع الأساسي بنجاح');
      setTimeout(() => setSavedMsg(''), 3500);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const res = await uploadService.uploadImage(file);
      await dispatch(updateProfile({ profileImage: res.data.url }));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleGalleryChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setGalleryUploading(true);
    try {
      const res = await uploadService.uploadImages(files);
      setGallery((prev) => [...prev, ...res.data.urls]);
    } finally {
      setGalleryUploading(false);
      e.target.value = '';
    }
  };

  const removeGalleryImage = (url) => {
    setGallery((prev) => prev.filter((img) => img !== url));
  };

  if (handymanLoading && !selectedHandyman) return <LoadingSpinner text="جاري تحميل الإعدادات..." />;

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
            aria-label="رجوع"
          >
            <FaArrowRight size={13} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-textDark">إعدادات الحساب والملف</h1>
            <p className="text-xs text-textGray mt-0.5">تعديل بيانات الحرفة، السعر، الموقع الأساسي ومعرض الأعمال</p>
          </div>
        </div>
        <button
          type="submit"
          disabled={authLoading || handymanLoading}
          className="btn-primary text-xs py-2.5 px-6 shadow-sm"
        >
          {authLoading || handymanLoading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>

      {savedMsg && <AlertMessage type="success" message={savedMsg} />}
      {(authError || handymanError) && <AlertMessage type="error" message={authError || handymanError} />}

      {/* Avatar & Info Card */}
      <div className="card flex flex-wrap items-center gap-5">
        <div className="relative h-20 w-20 shrink-0">
          <img
            src={user?.profileImage || getDefaultAvatar(user?.name)}
            alt=""
            className="h-20 w-20 rounded-3xl object-cover border-2 border-primary/20 shadow-sm"
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow hover:bg-primary/90 transition-transform active:scale-95"
            title="تغيير الصورة"
          >
            {avatarUploading ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
            ) : (
              <FaCamera size={11} />
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <h2 className="font-extrabold text-textDark text-lg">{user?.name}</h2>
          <p className="text-xs font-bold text-secondary mt-0.5">{selectedHandyman?.profession || 'حرفي محترف'}</p>
          <p className="text-[11px] text-textGray mt-1">تساعد الصور الواضحة والمعلومات المحدثة في كسب ثقة العملاء</p>
        </div>
      </div>

      {/* Personal Info Card */}
      <div className="card space-y-4">
        <h3 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">المعلومات الشخصية</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-textDark">الاسم الكامل</label>
            <input
              value={account.name}
              onChange={(e) => setAccount({ ...account, name: e.target.value })}
              className="input-field"
              placeholder="اسمك الكامل"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-textDark">رقم الهاتف</label>
            <input
              value={account.phone}
              onChange={(e) => setAccount({ ...account, phone: e.target.value })}
              className="input-field"
              placeholder="01xxxxxxxxx"
            />
          </div>
        </div>
      </div>

      {/* Handyman Base Location Card */}
      <div className="card space-y-4 border-r-4 border-r-primary">
        <div className="flex items-center justify-between pb-1 border-b border-neutral">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FaMapMarkerAlt size={13} />
            </div>
            <div>
              <h3 className="font-bold text-textDark text-sm">الموقع الأساسي للحرفي (Base Location)</h3>
              <p className="text-[11px] text-textGray">هذا هو موقعك الثابت لحساب المسافات وتقدير وقت الوصول للعملاء</p>
            </div>
          </div>
          <button
            type="button"
            onClick={detectLocation}
            disabled={locationDetecting}
            className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
            title="تحديد الموقع الحالي عبر GPS"
          >
            <FaCrosshairs size={12} className={locationDetecting ? 'animate-spin' : ''} />
            <span>{locationDetecting ? 'جاري التحديد...' : 'تحديد موقعي الآن'}</span>
          </button>
        </div>

        {locMsg && (
          <div className="rounded-xl bg-primary/5 border border-primary/15 p-3 text-xs text-primary font-medium">
            {locMsg}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">العنوان بالتفصيل</label>
          <input
            value={profile.address}
            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            className="input-field"
            placeholder="مثال: شارع التحرير، الدقي، الجيزة"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-textDark">خط العرض (Latitude)</label>
            <input
              value={profile.latitude}
              onChange={(e) => setProfile({ ...profile, latitude: e.target.value })}
              className="input-field font-mono text-xs"
              placeholder="30.0444"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-textDark">خط الطول (Longitude)</label>
            <input
              value={profile.longitude}
              onChange={(e) => setProfile({ ...profile, longitude: e.target.value })}
              className="input-field font-mono text-xs"
              placeholder="31.2357"
            />
          </div>
        </div>
      </div>

      {/* Password Card */}
      <ChangePasswordCard />

      {/* Craft & Pricing Card */}
      <div className="card space-y-4">
        <h3 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">تفاصيل الخدمة والأسعار</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-textDark">السعر التقديري بالساعة (ج.م)</label>
            <input
              type="number"
              min="0"
              value={profile.price}
              onChange={(e) => setProfile({ ...profile, price: e.target.value })}
              className="input-field font-bold"
              placeholder="100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-textDark">حالة الاستقبال</label>
            <div className="flex items-center justify-between rounded-xl border border-borderGray bg-neutral/50 p-2.5">
              <span className="text-xs font-bold text-textDark">
                {profile.isAvailable ? '🟢 متاح لاستقبال الطلبات' : '⚪ غير متاح حالياً'}
              </span>
              <button
                type="button"
                onClick={() => setProfile({ ...profile, isAvailable: !profile.isAvailable })}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  profile.isAvailable ? 'bg-tertiary' : 'bg-borderGray'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    profile.isAvailable ? 'right-0.5' : 'right-5.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">نبذة تعريفية وسنوات الخبرة</label>
          <textarea
            rows={3}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            className="input-field resize-none text-xs"
            placeholder="اكتب نبذة مختصرة توضح سنوات خبرتك والمشاريع أو الأعطال التي تجيد التعامل معها..."
          />
        </div>
      </div>

      {/* Gallery Card */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-neutral">
          <div>
            <h3 className="font-bold text-textDark text-sm">معرض الأعمال السابقة</h3>
            <p className="text-[11px] text-textGray mt-0.5">أضف صور أعمالك لجذب المزيد من طلبات الصيانة</p>
          </div>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={galleryUploading}
            className="btn-outline text-xs py-1.5 px-3"
          >
            <FaPlus size={11} /> {galleryUploading ? 'جاري الرفع...' : 'إضافة صور'}
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGalleryChange}
          />
        </div>
        {gallery.length === 0 ? (
          <p className="text-center py-6 text-xs text-textGray">لا توجد صور مضافة بعد. يمكنك رفع حتى 10 صور من أعمالك السابقة.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {gallery.map((img) => (
              <div key={img} className="group relative">
                <img src={img} alt="" className="h-24 w-full rounded-2xl object-cover border border-neutral" />
                <button
                  type="button"
                  onClick={() => removeGalleryImage(img)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emergency text-white opacity-0 transition-opacity group-hover:opacity-100 shadow-sm"
                >
                  <FaTrash size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/handyman/reports')}
          className="btn-outline flex items-center justify-center gap-2 py-3 text-xs font-bold"
        >
          <FaFlag size={13} /> متابعة بلاغاتي والنزاعات
        </button>

        <button
          type="button"
          onClick={() => dispatch(logoutUser())}
          className="btn-emergency flex items-center justify-center gap-2 py-3 text-xs font-bold bg-emergency/10 text-emergency border border-emergency/20 hover:bg-emergency hover:text-white"
        >
          <FaSignOutAlt size={13} /> تسجيل الخروج من الحساب
        </button>
      </div>
    </form>
  );
}
