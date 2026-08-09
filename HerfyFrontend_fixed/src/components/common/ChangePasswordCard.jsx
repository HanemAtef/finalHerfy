import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { FaLock } from 'react-icons/fa';
import { changePassword as changePasswordThunk } from '../../store/slices/authSlice';

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
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FaLock size={16} />
        </div>
        <div>
          <h3 className="font-bold text-textDark">تغيير كلمة المرور</h3>
          <p className="text-sm text-textGray">أكد هويتك ثم حدّث كلمة المرور الخاصة بك</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-bold">كلمة المرور الحالية</label>
          <input
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            className="input-field"
            placeholder="أدخل كلمة المرور الحالية"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold">كلمة المرور الجديدة</label>
          <input
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            className="input-field"
            placeholder="أدخل كلمة المرور الجديدة"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold">تأكيد كلمة المرور</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            className="input-field"
            placeholder="أعد كتابة كلمة المرور"
          />
        </div>

        <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {message && <p className="text-tertiary">{message}</p>}
            {error && <p className="text-emergency">{error}</p>}
          </div>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="btn-primary text-sm">
            {isSubmitting ? 'جاري التحديث...' : 'تغيير كلمة المرور'}
          </button>
        </div>
      </div>
    </div>
  );
}
