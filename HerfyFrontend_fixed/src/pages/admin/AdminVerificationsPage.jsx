import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck, FaTimes, FaInfoCircle, FaFilter, FaBan, FaArrowRight } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReasonModal from '../../components/common/ReasonModal';
import { getDefaultAvatar } from '../../utils/helpers';

export default function AdminVerificationsPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'reject'|'suspend', userId }

  useEffect(() => {
    adminService
      .getPendingVerification()
      .then((res) => setPending(res.data.data || res.data || []))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, []);

  const handleVerify = async (handymanId) => {
    await adminService.approveHandyman(handymanId, { reason: '' });
    setPending((prev) => prev.filter((p) => p.userId !== handymanId));
  };

  const handleReject = async (reason) => {
    await adminService.rejectHandyman(modal.userId, { reason });
    setPending((prev) => prev.filter((p) => p.userId !== modal.userId));
  };

  const handleSuspend = async (reason) => {
    await adminService.suspendHandyman(modal.userId, { suspended: true, reason });
    setPending((prev) => prev.filter((p) => p.userId !== modal.userId));
  };

  const stats = [
    { label: 'متوسط وقت الرد', value: '4.2 س', color: 'text-primary' },
    { label: 'تم توثيقه اليوم', value: '18', color: 'text-tertiary' },
    { label: 'قيد المراجعة', value: pending.length, color: 'text-secondary' },
    { label: 'إجمالي الطلبات', value: '124', color: 'text-primary' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={18} />
        </button>
        <h1 className="text-2xl font-bold text-primary">طلبات توثيق الحرفيين</h1>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="card">
            <p className="text-sm text-textGray">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-textDark">الطلبات المعلقة</h3>
          <button type="button" className="flex items-center gap-2 text-sm text-textGray">
            <FaFilter /> تصفية
          </button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : pending.length === 0 ? (
          <p className="py-8 text-center text-textGray">لا توجد طلبات معلقة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borderGray text-textGray">
                  <th className="pb-3 text-right">الحرفي</th>
                  <th className="pb-3 text-right">التخصص</th>
                  <th className="pb-3 text-right">المهام المكتملة</th>
                  <th className="pb-3 text-right">التقييم</th>
                  <th className="pb-3 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.userId} className="border-b border-borderGray last:border-0">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <img src={getDefaultAvatar(item.name)} alt="" className="h-10 w-10 rounded-full" />
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs text-textGray">{item.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="rounded-full bg-neutral px-3 py-1 text-xs">{item.profession}</span>
                    </td>
                    <td className="py-4">{item.completedOrders}</td>
                    <td className="py-4">{item.rating?.toFixed(1)}</td>
                    <td className="py-4">
                      <div className="flex gap-2">
                        <button type="button" className="rounded-lg border border-borderGray px-3 py-1 text-xs">
                          عرض الوثائق
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerify(item.userId)}
                          className="flex items-center gap-1 rounded-lg bg-tertiary px-3 py-1 text-xs text-white"
                        >
                          <FaCheck size={10} /> قبول
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'reject', userId: item.userId })}
                          className="flex items-center gap-1 rounded-lg bg-emergency px-3 py-1 text-xs text-white"
                        >
                          <FaTimes size={10} /> رفض
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'suspend', userId: item.userId })}
                          className="flex items-center gap-1 rounded-lg border border-borderGray px-3 py-1 text-xs text-textGray"
                        >
                          <FaBan size={10} /> تعليق
                        </button>
                        <FaInfoCircle className="text-textGray cursor-pointer mt-1" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-bold">المهن الأكثر طلباً</h3>
          {[
            { name: 'كهربائي', pct: 45 },
            { name: 'سباك', pct: 32 },
            { name: 'فني تكييف', pct: 23 },
          ].map(({ name, pct }) => (
            <div key={name} className="mb-3">
              <div className="mb-1 flex justify-between text-sm">
                <span>{name}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-neutral">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card bg-primary text-white">
          <h3 className="mb-2 font-bold">كفاءة المراجعة</h3>
          <p className="mb-4 text-sm opacity-80">أداء فريق المراجعة هذا الشهر</p>
          <p className="text-3xl font-bold">1,402</p>
          <p className="text-sm opacity-80">طلبات منجزة</p>
        </div>
      </div>

      {modal && (
        <ReasonModal
          title={modal.type === 'reject' ? 'سبب رفض طلب التوثيق' : 'سبب تعليق الحساب'}
          confirmLabel={modal.type === 'reject' ? 'رفض' : 'تعليق'}
          danger
          onConfirm={modal.type === 'reject' ? handleReject : handleSuspend}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
