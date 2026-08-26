import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { FaLock, FaKey } from 'react-icons/fa';
import { changePassword as changePasswordThunk } from '../../store/slices/authSlice';
import AlertMessage from './AlertMessage';

export default function ChangePasswordCard() {
  const dispatch = useDispatch();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setMessage('');
    setError('');

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('يرجى تعبئة جميع الحقول');
      return;
    }

    if (form.newPassword.length < 6) {
      setError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await dispatch(changePasswordThunk({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }));

      if (changePasswordThunk.fulfilled.match(result)) {
        setMessage('تم تغيير كلمة المرور بنجاح');
        setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setError(result.payload?.msg || 'فشل تغيير كلمة المرور');
      }
    } catch {
      setError('حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FaKey size={18} />
        </div>
        <div>
          <h3 className="font-bold text-textDark text-base">تغيير كلمة المرور</h3>
          <p className="text-xs text-textGray mt-0.5">أدخل كلمة المرور الحالية ثم عيّن كلمة مرور جديدة</p>
        </div>
      </div>

      {message && <AlertMessage type="success" message={message} className="mb-4" />}
      {error && <AlertMessage type="error" message={error} className="mb-4" />}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-bold text-textDark">كلمة المرور الحالية</label>
          <div className="relative">
            <input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              className="input-field"
              placeholder="أدخل كلمة المرور الحالية"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">كلمة المرور الجديدة</label>
          <input
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            className="input-field"
            placeholder="أدخل كلمة المرور الجديدة (6 أحرف فأكثر)"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-textDark">تأكيد كلمة المرور</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            className="input-field"
            placeholder="أعد كتابة كلمة المرور"
          />
        </div>

        <div className="md:col-span-2 flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-primary w-full sm:w-auto"
          >
            <FaLock size={13} />
            {isSubmitting ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
          </button>
        </div>
      </div>
    </div>
  );
}
