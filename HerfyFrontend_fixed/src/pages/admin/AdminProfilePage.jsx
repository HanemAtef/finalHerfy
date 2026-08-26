import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaCamera, FaSignOutAlt, FaShieldAlt } from 'react-icons/fa';
import { logoutUser, updateProfile } from '../../store/slices/authSlice';
import { uploadService } from '../../services/api';
import { getDefaultAvatar } from '../../utils/helpers';
import ChangePasswordCard from '../../components/common/ChangePasswordCard';
import AlertMessage from '../../components/common/AlertMessage';

export default function AdminProfilePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isLoading, error } = useSelector((state) => state.auth);

  const avatarInputRef = useRef(null);
  const [account, setAccount] = useState({ name: '', phone: '' });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (user) setAccount({ name: user.name || '', phone: user.phone || '' });
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSavedMsg('');
    const result = await dispatch(updateProfile(account));
    if (updateProfile.fulfilled.match(result)) {
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

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
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
          <h1 className="text-2xl font-extrabold text-textDark">الملف الشخصي للمسؤول</h1>
          <p className="text-xs text-textGray mt-0.5">إدارة بيانات حساب المدير وتعديل كلمة المرور</p>
        </div>
      </div>

      {/* Avatar Profile Card */}
      <div className="card flex flex-col items-center gap-3 text-center relative overflow-hidden">
        <div className="relative">
          <img
            src={user?.profileImage || getDefaultAvatar(user?.name)}
            alt={user?.name}
            className="h-24 w-24 rounded-3xl object-cover border-3 border-primary/20 shadow-sm"
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-md hover:bg-primary/90 transition-transform active:scale-95"
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
          <h2 className="text-lg font-extrabold text-textDark">{user?.name}</h2>
          <span className="badge-status bg-primary/10 text-primary text-xs font-bold mt-1 inline-flex items-center gap-1">
            <FaShieldAlt size={10} /> مدير النظام (Admin)
          </span>
        </div>
      </div>

      {savedMsg && <AlertMessage type="success" message={savedMsg} />}
      {error && <AlertMessage type="error" message={typeof error === 'string' ? error : error.msg} />}

      {/* Account Info Form */}
      <form onSubmit={handleSave} className="card space-y-4">
        <h3 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">البيانات الأساسية</h3>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">الاسم الكامل</label>
          <input
            value={account.name}
            onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))}
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">رقم الهاتف</label>
          <input
            value={account.phone}
            onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))}
            className="input-field"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">البريد الإلكتروني</label>
          <input value={user?.email || ''} disabled className="input-field bg-neutral text-textGray cursor-not-allowed" />
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 text-xs font-bold shadow-sm">
          {isLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
        </button>
      </form>

      {/* Password Card */}
      <ChangePasswordCard />

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emergency/30 bg-emergency/5 px-4 py-3 text-xs font-bold text-emergency hover:bg-emergency hover:text-white transition-all shadow-sm"
      >
        <FaSignOutAlt size={14} /> تسجيل الخروج من لوحة الإدارة
      </button>
    </div>
  );
}
