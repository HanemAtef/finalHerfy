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
  const [docsModal, setDocsModal] = useState(null); // handyman item whose docs are being viewed
  const [detailsModal, setDetailsModal] = useState(null); // handyman item whose full profile is shown
  const [stats, setStats] = useState(null);
  const [craftsmen, setCraftsmen] = useState([]);
  const [byProfession, setByProfession] = useState([]);

  useEffect(() => {
    adminService
      .getPendingVerification()
      .then((res) => setPending(res.data.data || res.data || []))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));

    adminService.getStats().then((res) => setStats(res.data)).catch(() => {});
    adminService.getCraftsmenAnalytics().then((res) => setCraftsmen(res.data.data || [])).catch(() => {});
    adminService.getJobsAnalytics().then((res) => setByProfession(res.data.byProfession || [])).catch(() => {});
  }, []);

  const handleVerify = async (handymanId) => {
    await adminService.approveHandyman(handymanId, { note: '' });
    setPending((prev) => prev.filter((p) => p._id !== handymanId));
  };

  const handleReject = async (reason) => {
    await adminService.rejectHandyman(modal.handymanId, { reason });
    setPending((prev) => prev.filter((p) => p._id !== modal.handymanId));
  };

  const handleSuspend = async (reason) => {
    await adminService.suspendHandyman(modal.userId, { suspended: true, reason });
    setCraftsmen((prev) =>
      prev.map((c) => (c.userId === modal.userId ? { ...c, isSuspended: true } : c))
    );
  };

  const handleUnsuspend = async (userId) => {
    await adminService.suspendHandyman(userId, { suspended: false });
    setCraftsmen((prev) =>
      prev.map((c) => (c.userId === userId ? { ...c, isSuspended: false } : c))
    );
  };

  const verifiedCount = craftsmen.filter((c) => c.verified).length;

  const statCards = [
    { label: 'قيد المراجعة', value: pending.length, color: 'text-secondary' },
    { label: 'الحرفيون الموثقون', value: verifiedCount, color: 'text-tertiary' },
    { label: 'إجمالي الحرفيين', value: stats?.totalHandymen ?? '—', color: 'text-primary' },
    { label: 'إجمالي الطلبات', value: stats?.totalOrders ?? '—', color: 'text-primary' },
  ];

  const professionTotal = byProfession.reduce((sum, p) => sum + p.count, 0);
  const topProfessions = byProfession.slice(0, 3).map((p) => ({
    name: p._id || 'غير محدد',
    pct: professionTotal ? Math.round((p.count / professionTotal) * 100) : 0,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={18} />
        </button>
        <h1 className="text-2xl font-bold text-primary">طلبات توثيق الحرفيين</h1>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(({ label, value, color }) => (
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
                  <tr key={item._id} className="border-b border-borderGray last:border-0">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <img src={getDefaultAvatar(item.userId?.name || '')} alt="" className="h-10 w-10 rounded-full" />
                        <div>
                          <p className="font-bold">{item.userId?.name || '—'}</p>
                          <p className="text-xs text-textGray">{item.userId?.email || '—'}</p>
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
                        <button
                          type="button"
                          onClick={() => setDocsModal(item)}
                          className="rounded-lg border border-borderGray px-3 py-1 text-xs"
                        >
                          عرض الوثائق
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerify(item._id)}
                          className="flex items-center gap-1 rounded-lg bg-tertiary px-3 py-1 text-xs text-white"
                        >
                          <FaCheck size={10} /> قبول
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'reject', handymanId: item._id })}
                          className="flex items-center gap-1 rounded-lg bg-emergency px-3 py-1 text-xs text-white"
                        >
                          <FaTimes size={10} /> رفض
                        </button>
                        <FaInfoCircle
                          className="text-textGray cursor-pointer mt-1"
                          onClick={() => setDetailsModal(item)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-6">
        <h3 className="mb-4 font-bold text-textDark">إدارة الحرفيين</h3>

        {craftsmen.length === 0 ? (
          <p className="py-8 text-center text-textGray">لا يوجد حرفيون بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borderGray text-textGray">
                  <th className="pb-3 text-right">الحرفي</th>
                  <th className="pb-3 text-right">التخصص</th>
                  <th className="pb-3 text-right">التقييم</th>
                  <th className="pb-3 text-right">الحالة</th>
                  <th className="pb-3 text-right">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {craftsmen.map((c) => (
                  <tr key={c.userId} className="border-b border-borderGray last:border-0">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <img src={getDefaultAvatar(c.name || '')} alt="" className="h-10 w-10 rounded-full" />
                        <div>
                          <p className="font-bold">{c.name || '—'}</p>
                          <p className="text-xs text-textGray">{c.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="rounded-full bg-neutral px-3 py-1 text-xs">{c.profession}</span>
                    </td>
                    <td className="py-4">{c.rating?.toFixed(1) ?? '—'}</td>
                    <td className="py-4">
                      {c.isSuspended ? (
                        <span className="rounded-full bg-emergency/10 px-3 py-1 text-xs text-emergency">معلق</span>
                      ) : (
                        <span className="rounded-full bg-tertiary/10 px-3 py-1 text-xs text-tertiary">نشط</span>
                      )}
                    </td>
                    <td className="py-4">
                      {c.isSuspended ? (
                        <button
                          type="button"
                          onClick={() => handleUnsuspend(c.userId)}
                          className="flex items-center gap-1 rounded-lg bg-tertiary px-3 py-1 text-xs text-white"
                        >
                          <FaCheck size={10} /> إلغاء التعليق
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'suspend', userId: c.userId })}
                          className="flex items-center gap-1 rounded-lg border border-borderGray px-3 py-1 text-xs text-textGray"
                        >
                          <FaBan size={10} /> تعليق
                        </button>
                      )}
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
          {topProfessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-textGray">لا توجد بيانات كافية بعد</p>
          ) : (
            topProfessions.map(({ name, pct }) => (
              <div key={name} className="mb-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span>{name}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-neutral">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="card bg-primary text-white">
          <h3 className="mb-2 font-bold">الطلبات المكتملة</h3>
          <p className="mb-4 text-sm opacity-80">إجمالي الطلبات المكتملة على المنصة</p>
          <p className="text-3xl font-bold">{stats?.completedOrders?.toLocaleString('ar-EG') ?? '—'}</p>
          <p className="text-sm opacity-80">طلب مكتمل</p>
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

      {detailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-textDark">
                بيانات {detailsModal.userId?.name || 'الحرفي'}
              </h3>
              <button type="button" onClick={() => setDetailsModal(null)} className="text-textGray">
                <FaTimes size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <img
                src={detailsModal.profileImage || detailsModal.userId?.profileImage || getDefaultAvatar(detailsModal.userId?.name || '')}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
              <div>
                <p className="font-bold text-textDark">{detailsModal.userId?.name || '—'}</p>
                <p className="text-xs text-textGray">{detailsModal.userId?.email || '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div>
                <p className="text-textGray text-xs">رقم الهاتف</p>
                <p className="font-semibold text-textDark">{detailsModal.userId?.phone || '—'}</p>
              </div>
              <div>
                <p className="text-textGray text-xs">التخصص</p>
                <p className="font-semibold text-textDark">{detailsModal.profession || '—'}</p>
              </div>
              <div>
                <p className="text-textGray text-xs">سنوات الخبرة</p>
                <p className="font-semibold text-textDark">
                  {detailsModal.experienceYears != null ? `${detailsModal.experienceYears} سنة` : '—'}
                </p>
              </div>
              <div>
                <p className="text-textGray text-xs">السعر</p>
                <p className="font-semibold text-textDark">
                  {detailsModal.price != null ? `${detailsModal.price} ج.م` : '—'}
                </p>
              </div>
              <div>
                <p className="text-textGray text-xs">العنوان</p>
                <p className="font-semibold text-textDark">{detailsModal.address || '—'}</p>
              </div>
              <div>
                <p className="text-textGray text-xs">تاريخ التسجيل</p>
                <p className="font-semibold text-textDark">
                  {detailsModal.registeredAt
                    ? new Date(detailsModal.registeredAt).toLocaleDateString('ar-EG')
                    : '—'}
                </p>
              </div>
            </div>

            {detailsModal.bio && (
              <div className="mt-4">
                <p className="text-textGray text-xs mb-1">نبذة عن الحرفي</p>
                <p className="text-sm text-textDark">{detailsModal.bio}</p>
              </div>
            )}

            {detailsModal.gallery?.length > 0 && (
              <div className="mt-4">
                <p className="text-textGray text-xs mb-2">صور من أعمال سابقة</p>
                <div className="grid grid-cols-3 gap-2">
                  {detailsModal.gallery.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="h-20 w-full rounded-lg object-cover border border-borderGray" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDetailsModal(null);
                  setDocsModal(detailsModal);
                }}
                className="rounded-lg border border-borderGray px-3 py-2 text-xs"
              >
                عرض الوثائق
              </button>
              <button type="button" onClick={() => setDetailsModal(null)} className="btn-outline text-sm">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {docsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-textDark">
                وثائق {docsModal.userId?.name || 'الحرفي'}
              </h3>
              <button type="button" onClick={() => setDocsModal(null)} className="text-textGray">
                <FaTimes size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: 'صورة البطاقة الشخصية', url: docsModal.nationalId },
                { label: 'الشهادة / المؤهل', url: docsModal.certificate },
                { label: 'الصورة الشخصية', url: docsModal.profileImage },
              ].map(({ label, url }) => (
                <div key={label}>
                  <p className="mb-1 text-sm font-semibold text-textDark">{label}</p>
                  {!url ? (
                    <p className="text-xs text-textGray">لم يتم إرفاق هذا الملف</p>
                  ) : /\.pdf($|\?)/i.test(url) ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline"
                    >
                      فتح ملف PDF
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={label}
                        className="max-h-64 w-full rounded-lg border border-borderGray object-contain"
                      />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setDocsModal(null)} className="btn-outline text-sm">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
