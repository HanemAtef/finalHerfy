import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSignOutAlt, FaCamera, FaTrash, FaPlus, FaArrowRight, FaFlag } from 'react-icons/fa';
import { logoutUser, updateProfile } from '../../store/slices/authSlice';
import { updateHandymanProfile, getHandymanById } from '../../store/slices/handymanSlice';
import { uploadService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';

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
  const [profile, setProfile] = useState({ bio: '', price: '', experienceYears: '', isAvailable: true });
  const [gallery, setGallery] = useState([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (user?._id) dispatch(getHandymanById(user._id));
  }, [dispatch, user?._id]);

  useEffect(() => {
    if (user) setAccount({ name: user.name || '', phone: user.phone || '' });
  }, [user]);

  useEffect(() => {
    if (selectedHandyman) {
      setProfile({
        bio: selectedHandyman.bio || '',
        price: selectedHandyman.price || '',
        experienceYears: selectedHandyman.experienceYears || '',
        isAvailable: selectedHandyman.isAvailable ?? true,
      });
      setGallery(selectedHandyman.gallery || []);
    }
  }, [selectedHandyman]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSavedMsg('');
    const accountResult = await dispatch(updateProfile(account));
    const profileResult = await dispatch(
      updateHandymanProfile({
        id: user._id,
        data: {
          bio: profile.bio,
          price: Number(profile.price) || 0,
          isAvailable: profile.isAvailable,
          gallery,
        },
      })
    );
    if (updateProfile.fulfilled.match(accountResult) && updateHandymanProfile.fulfilled.match(profileResult)) {
      setSavedMsg('تم حفظ التغييرات بنجاح');
      setTimeout(() => setSavedMsg(''), 3000);
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

  if (handymanLoading && !selectedHandyman) return <LoadingSpinner />;

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-2 text-primary hover:bg-primary/5"
            aria-label="رجوع"
          >
            <FaArrowRight />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-textDark">إعدادات الحساب</h1>
            <p className="text-sm text-textGray">إدارة ملفك الشخصي كحرفي</p>
          </div>
        </div>
        <button type="submit" disabled={authLoading || handymanLoading} className="btn-primary text-sm">
          {authLoading || handymanLoading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>

      {savedMsg && (
        <div className="rounded-lg bg-tertiary/10 px-4 py-3 text-sm text-tertiary">{savedMsg}</div>
      )}
      {(authError || handymanError) && (
        <div className="rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">
          {authError || handymanError}
        </div>
      )}

      <div className="card flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <img
            src={user?.profileImage || getDefaultAvatar(user?.name)}
            alt=""
            className="h-20 w-20 rounded-full object-cover"
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow"
          >
            <FaCamera size={12} />
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
          <h3 className="font-bold text-textDark">{user?.name}</h3>
          <p className="text-sm text-textGray">{selectedHandyman?.profession}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="font-bold text-textDark">بيانات الحساب</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-bold">الاسم الكامل</label>
            <input
              value={account.name}
              onChange={(e) => setAccount({ ...account, name: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold">رقم الهاتف</label>
            <input
              value={account.phone}
              onChange={(e) => setAccount({ ...account, phone: e.target.value })}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="font-bold text-textDark">بيانات الحرفة</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-bold">السعر بالساعة (ج.م)</label>
            <input
              type="number"
              min="0"
              value={profile.price}
              onChange={(e) => setProfile({ ...profile, price: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-borderGray px-4">
            <span className="text-sm font-bold">متاح لاستقبال الطلبات</span>
            <button
              type="button"
              onClick={() => setProfile({ ...profile, isAvailable: !profile.isAvailable })}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                profile.isAvailable ? 'bg-tertiary' : 'bg-borderGray'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                  profile.isAvailable ? 'right-1' : 'right-6'
                }`}
              />
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold">نبذة عنك</label>
          <textarea
            rows={4}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            className="input-field resize-none"
            placeholder="اكتب نبذة مختصرة عن خبرتك ومهاراتك..."
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-textDark">معرض الأعمال</h3>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={galleryUploading}
            className="btn-outline flex items-center gap-2 text-sm"
          >
            <FaPlus size={12} /> {galleryUploading ? 'جاري الرفع...' : 'إضافة صور'}
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
          <p className="text-sm text-textGray">لا توجد صور بعد. أضف صورًا لأعمالك السابقة لجذب المزيد من العملاء.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {gallery.map((img) => (
              <div key={img} className="group relative">
                <img src={img} alt="" className="h-24 w-full rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removeGalleryImage(img)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emergency text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <FaTrash size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <button
          type="button"
          onClick={() => navigate('/handyman/reports')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-borderGray py-3 font-bold text-textDark"
        >
          <FaFlag /> بلاغاتي
        </button>
      </div>

      <div className="card">
        <button
          type="button"
          onClick={() => dispatch(logoutUser())}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emergency py-3 font-bold text-emergency"
        >
          <FaSignOutAlt /> تسجيل الخروج
        </button>
      </div>
    </form>
  );
}
