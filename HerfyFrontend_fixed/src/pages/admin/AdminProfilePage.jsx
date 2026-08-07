import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaCamera, FaSignOutAlt } from 'react-icons/fa';
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
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-primary hover:bg-primary/5"
          aria-label="رجوع"
        >
          <FaArrowRight />
        </button>
        <h1 className="text-2xl font-bold text-primary">الإعدادات الشخصية</h1>
      </div>

      <div className="card mb-6 flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <img
            src={user?.profileImage || getDefaultAvatar(user?.name)}
            alt={user?.name}
            className="h-24 w-24 rounded-full object-cover"
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow"
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
          <p className="text-lg font-bold text-textDark">{user?.name}</p>
          <p className="text-sm text-textGray">مدير النظام</p>
        </div>
      </div>

      {savedMsg && <AlertMessage type="success" message={savedMsg} />}
      {error && <AlertMessage type="error" message={typeof error === 'string' ? error : error.msg} />}

      <form onSubmit={handleSave} className="card mb-6 space-y-4">
        <h2 className="text-lg font-bold text-textDark">بيانات الحساب</h2>
        <div>
          <label className="mb-1 block text-sm font-bold text-textDark">الاسم</label>
          <input
            value={account.name}
            onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))}
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-textDark">رقم الهاتف</label>
          <input
            value={account.phone}
            onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))}
            className="input-field"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-textDark">البريد الإلكتروني</label>
          <input value={user?.email || ''} disabled className="input-field bg-neutral text-textGray" />
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full">
          {isLoading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </form>

      <div className="mb-6">
        <ChangePasswordCard />
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-emergency px-4 py-3 text-sm font-bold text-emergency hover:bg-emergency/5"
      >
        <FaSignOutAlt /> تسجيل الخروج
      </button>
    </div>
  );
}
