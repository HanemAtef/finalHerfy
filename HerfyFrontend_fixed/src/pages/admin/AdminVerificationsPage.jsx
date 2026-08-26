import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck, FaTimes, FaInfoCircle, FaBan, FaArrowRight, FaShieldAlt, FaFileAlt } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReasonModal from '../../components/common/ReasonModal';
import { getDefaultAvatar } from '../../utils/helpers';

export default function AdminVerificationsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [modal, setModal] = useState(null); // { type: 'reject'|'suspend', id, name }
  const [docsModal, setDocsModal] = useState(null);
  const [detailsModal, setDetailsModal] = useState(null);
  const [stats, setStats] = useState(null);
  const [craftsmen, setCraftsmen] = useState([]);
  const [byProfession, setByProfession] = useState([]);

  const loadRequests = (status = statusFilter) => {
    setLoading(true);
    adminService
      .getPendingVerification({ status })
      .then((res) => setRequests(res.data.data || res.data || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequests(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    adminService.getStats().then((res) => setStats(res.data)).catch(() => {});
    adminService.getCraftsmenAnalytics().then((res) => setCraftsmen(res.data.data || [])).catch(() => {});
    adminService.getJobsAnalytics().then((res) => setByProfession(res.data.byProfession || [])).catch(() => {});
  }, []);

  const handleOpenDocs = async (item) => {
    const targetUserId = item.userId?._id || item.userId || item._id || item.handymanId;
    setDocsModal({
      ...item,
      loading: true,
    });

    try {
      const res = await adminService.getUserDocuments(targetUserId);
      const docs = res.data.documents || [];
      const nationalIdDoc = docs.find((d) => d.type === 'national_id')?.url || item.nationalId || '';
      const certDoc = docs.find((d) => d.type === 'certificate')?.url || item.certificate || '';
      const profileImg = item.profileImage || docs.find((d) => d.type === 'profile_image')?.url || '';

      setDocsModal({
        ...item,
        nationalId: nationalIdDoc,
        certificate: certDoc,
        profileImage: profileImg,
        documents: docs,
        loading: false,
      });
    } catch {
      // Fallback: try getUserDetail
      try {
        const detailRes = await adminService.getUserDetail(targetUserId);
        const data = detailRes.data?.data || {};
        const docs = data.documents || data.user?.documents || [];
        const nationalIdDoc = data.handymanProfile?.nationalId || data.user?.nationalId || docs.find((d) => d.type === 'national_id')?.url || item.nationalId || '';
        const certDoc = data.handymanProfile?.certificate || docs.find((d) => d.type === 'certificate')?.url || item.certificate || '';
        const profileImg = data.handymanProfile?.profileImage || data.user?.profileImage || item.profileImage || '';

        setDocsModal({
          ...item,
          nationalId: nationalIdDoc,
          certificate: certDoc,
          profileImage: profileImg,
          documents: docs,
          loading: false,
        });
      } catch {
        setDocsModal({
          ...item,
          loading: false,
        });
      }
    }
  };

  const handleVerify = async (id) => {
    try {
      await adminService.approveHandyman(id, { note: 'تمت الموافقة على الحساب' });
      setRequests((prev) =>
        statusFilter === 'pending'
          ? prev.filter((p) => p._id !== id && p.handymanId !== id)
          : prev.map((p) => (p._id === id || p.handymanId === id ? { ...p, status: 'approved', registrationStatus: 'approved' } : p))
      );
      adminService.getStats().then((res) => setStats(res.data)).catch(() => {});
    } catch (err) {
      alert(err.response?.data?.msg || 'فشلت الموافقة على الطلب');
    }
  };

  const handleReject = async (reason) => {
    try {
      await adminService.rejectHandyman(modal.id, { reason });
      setRequests((prev) =>
        statusFilter === 'pending'
          ? prev.filter((p) => p._id !== modal.id && p.handymanId !== modal.id)
          : prev.map((p) => (p._id === modal.id || p.handymanId === modal.id ? { ...p, status: 'rejected', registrationStatus: 'rejected', adminNote: reason } : p))
      );
      setModal(null);
    } catch (err) {
      alert(err.response?.data?.msg || 'فشل رفض الطلب');
    }
  };

  const handleSuspend = async (reason) => {
    await adminService.suspendHandyman(modal.userId, { suspended: true, reason });
    setCraftsmen((prev) =>
      prev.map((c) => (c.userId === modal.userId ? { ...c, isSuspended: true } : c))
    );
    setModal(null);
  };

  const handleUnsuspend = async (userId) => {
    await adminService.suspendHandyman(userId, { suspended: false });
    setCraftsmen((prev) =>
      prev.map((c) => (c.userId === userId ? { ...c, isSuspended: false } : c))
    );
  };

  const pendingCount = requests.filter((r) => r.status === 'pending' || r.registrationStatus === 'pending').length;
  const verifiedCount = craftsmen.filter((c) => c.verified).length;

  const statCards = [
    { label: 'طلبات التسجيل المعلقة', value: statusFilter === 'pending' ? requests.length : pendingCount, color: 'border-r-secondary', textColor: 'text-secondary' },
    { label: 'الحرفيون الموثقون', value: verifiedCount, color: 'border-r-tertiary', textColor: 'text-tertiary' },
    { label: 'إجمالي الحرفيين', value: stats?.totalHandymen ?? '—', color: 'border-r-primary', textColor: 'text-primary' },
    { label: 'إجمالي الطلبات', value: stats?.totalOrders ?? '—', color: 'border-r-blue-500', textColor: 'text-textDark' },
  ];

  const professionTotal = byProfession.reduce((sum, p) => sum + p.count, 0);
  const topProfessions = byProfession.slice(0, 3).map((p) => ({
    name: p._id || 'غير محدد',
    pct: professionTotal ? Math.round((p.count / professionTotal) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">طلبات التسجيل والتوثيق</h1>
          <p className="text-xs text-textGray mt-0.5">مراجعة وثائق الحرفيين الجدد وتفعيل أو تعليق الحسابات</p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(({ label, value, color, textColor }) => (
          <div key={label} className={`stat-card border-r-4 ${color}`}>
            <span className="stat-label">{label}</span>
            <p className={`stat-value ${textColor}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Registration Requests Card */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral">
          <div>
            <h2 className="font-bold text-textDark text-sm">طلبات التسجيل الجديدة</h2>
            <p className="text-xs text-textGray mt-0.5">تحقق من الهوية وشهادات الخبرة قبل التفعيل</p>
          </div>
          
          {/* Filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: 'pending', label: 'المعلقة' },
              { key: 'approved', label: 'المقبولة' },
              { key: 'rejected', label: 'المرفوضة' },
              { key: 'all', label: 'الكل' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-borderGray bg-white text-textGray hover:border-primary/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingSpinner text="جاري تحميل الطلبات..." />
        ) : requests.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">📄</div>
            <p className="empty-state-title">لا توجد طلبات في هذا القسم</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">الحرفي</th>
                  <th className="table-th">البريد الإلكتروني</th>
                  <th className="table-th">الهاتف</th>
                  <th className="table-th">التخصص</th>
                  <th className="table-th">تاريخ التقديم</th>
                  <th className="table-th">الحالة</th>
                  <th className="table-th text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => {
                  const id = item._id || item.handymanId || item.userId?._id || item.userId;
                  const name = item.name || item.userId?.name || '—';
                  const email = item.email || item.userId?.email || '—';
                  const phone = item.phone || item.userId?.phone || '—';
                  const profession = item.profession || '—';
                  const date = item.createdAt || item.registeredAt ? new Date(item.createdAt || item.registeredAt).toLocaleDateString('ar-EG') : '—';
                  const status = item.status || item.registrationStatus || 'pending';

                  return (
                    <tr key={id} className="table-tr">
                      <td className="table-td">
                        <div className="flex items-center gap-2.5">
                          <img src={item.profileImage || getDefaultAvatar(name)} alt="" className="h-8 w-8 rounded-full border border-borderGray object-cover" />
                          <span className="font-bold text-xs text-textDark">{name}</span>
                        </div>
                      </td>
                      <td className="table-td text-xs text-textGray">{email}</td>
                      <td className="table-td text-xs text-textDark font-mono" dir="ltr">{phone}</td>
                      <td className="table-td">
                        <span className="badge-status bg-primary/10 text-primary font-bold text-[11px]">
                          {profession}
                        </span>
                      </td>
                      <td className="table-td text-xs text-textGray">{date}</td>
                      <td className="table-td">
                        {status === 'approved' ? (
                          <span className="badge-status bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                            مقبول ✓
                          </span>
                        ) : status === 'rejected' ? (
                          <span className="badge-status bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold" title={item.adminNote}>
                            مرفوض ✗
                          </span>
                        ) : (
                          <span className="badge-status bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                            قيد المراجعة
                          </span>
                        )}
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDocs(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-borderGray bg-white px-2 py-1 text-[11px] font-bold text-textDark hover:bg-neutral transition"
                          >
                            <FaFileAlt size={10} /> الوثائق
                          </button>
                          
                          {status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleVerify(id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-tertiary px-2 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90 transition"
                            >
                              <FaCheck size={9} /> قبول
                            </button>
                          )}

                          {status !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() => setModal({ type: 'reject', id, name })}
                              className="inline-flex items-center gap-1 rounded-lg bg-emergency px-2 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90 transition"
                            >
                              <FaTimes size={9} /> رفض
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setDetailsModal(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-textGray hover:text-primary transition"
                            title="التفاصيل الكاملة"
                          >
                            <FaInfoCircle size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Craftsmen Management Card */}
      <div className="card space-y-4">
        <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">قائمة الحرفيين المسجلين وإدارة التعليق</h2>

        {craftsmen.length === 0 ? (
          <p className="py-6 text-center text-xs text-textGray">لا يوجد حرفيون معتمدون بعد</p>
        ) : (
          <div className="table-wrapper">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">الحرفي</th>
                  <th className="table-th">التخصص</th>
                  <th className="table-th">التقييم</th>
                  <th className="table-th">حالة الحساب</th>
                  <th className="table-th text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {craftsmen.map((c) => (
                  <tr key={c.userId} className="table-tr">
                    <td className="table-td">
                      <div className="flex items-center gap-2.5">
                        <img src={getDefaultAvatar(c.name || '')} alt="" className="h-8 w-8 rounded-full border border-borderGray" />
                        <div>
                          <p className="font-bold text-xs text-textDark">{c.name || '—'}</p>
                          <p className="text-[11px] text-textGray">{c.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-td">
                      <span className="badge-status bg-neutral text-textDark text-[11px] font-semibold">{c.profession}</span>
                    </td>
                    <td className="table-td text-xs font-bold text-secondary">{c.rating?.toFixed(1) ?? '—'}</td>
                    <td className="table-td">
                      {c.isSuspended ? (
                        <span className="badge-status bg-red-50 text-emergency border border-red-200 text-[11px] font-bold">معلق ⛔</span>
                      ) : (
                        <span className="badge-status bg-emerald-50 text-tertiary border border-emerald-200 text-[11px] font-bold">نشط ✓</span>
                      )}
                    </td>
                    <td className="table-td text-center">
                      {c.isSuspended ? (
                        <button
                          type="button"
                          onClick={() => handleUnsuspend(c.userId)}
                          className="inline-flex items-center gap-1 rounded-lg bg-tertiary px-2.5 py-1 text-xs font-bold text-white shadow-sm"
                        >
                          <FaCheck size={9} /> إلغاء التعليق
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'suspend', userId: c.userId })}
                          className="inline-flex items-center gap-1 rounded-lg border border-borderGray px-2.5 py-1 text-xs font-semibold text-textGray hover:border-emergency hover:text-emergency transition"
                        >
                          <FaBan size={9} /> تعليق الحساب
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

      {/* Analytics Summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="font-bold text-textDark text-sm">المهن الأكثر طلباً</h3>
          {topProfessions.length === 0 ? (
            <p className="py-4 text-center text-xs text-textGray">لا توجد بيانات كافية بعد</p>
          ) : (
            topProfessions.map(({ name, pct }) => (
              <div key={name} className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span>{name}</span>
                  <span className="text-primary">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-neutral">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card bg-primary text-white flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm mb-1">إجمالي الخدمات المكتملة</h3>
            <p className="text-xs opacity-80">الطلبات المنفذة بنجاح من قبل حرفيي المنصة</p>
          </div>
          <div className="py-2">
            <p className="text-3xl font-extrabold">{stats?.completedOrders?.toLocaleString('ar-EG') ?? '—'}</p>
            <p className="text-xs opacity-80 mt-0.5">طلب تم إنجازه بالكامل</p>
          </div>
        </div>
      </div>

      {modal && (
        <ReasonModal
          title={modal.type === 'reject' ? 'سبب رفض طلب التوثيق' : 'سبب تعليق الحساب'}
          confirmLabel={modal.type === 'reject' ? 'رفض الطلب' : 'تأكيد التعليق'}
          danger
          onConfirm={modal.type === 'reject' ? handleReject : handleSuspend}
          onClose={() => setModal(null)}
        />
      )}

      {/* Details Modal */}
      {detailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up">
            <div className="mb-4 flex items-center justify-between pb-2 border-b border-neutral">
              <h3 className="text-base font-bold text-textDark">
                بيانات {detailsModal.userId?.name || 'الحرفي'}
              </h3>
              <button type="button" onClick={() => setDetailsModal(null)} className="rounded-xl p-1 text-textGray hover:bg-neutral">
                <FaTimes size={15} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <img
                src={detailsModal.profileImage || detailsModal.userId?.profileImage || getDefaultAvatar(detailsModal.userId?.name || '')}
                alt=""
                className="h-12 w-12 rounded-2xl object-cover border border-borderGray"
              />
              <div>
                <p className="font-bold text-textDark text-sm">{detailsModal.userId?.name || '—'}</p>
                <p className="text-xs text-textGray">{detailsModal.userId?.email || '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs bg-neutral/40 p-4 rounded-2xl border border-neutral">
              <div>
                <p className="text-textGray">رقم الهاتف</p>
                <p className="font-bold text-textDark mt-0.5" dir="ltr">{detailsModal.userId?.phone || '—'}</p>
              </div>
              <div>
                <p className="text-textGray">التخصص</p>
                <p className="font-bold text-primary mt-0.5">{detailsModal.profession || '—'}</p>
              </div>
              <div>
                <p className="text-textGray">سنوات الخبرة</p>
                <p className="font-bold text-textDark mt-0.5">
                  {detailsModal.experienceYears != null ? `${detailsModal.experienceYears} سنة` : '—'}
                </p>
              </div>
              <div>
                <p className="text-textGray">السعر بالساعة</p>
                <p className="font-bold text-secondary mt-0.5">
                  {detailsModal.price != null ? `${detailsModal.price} ج.م` : '—'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-textGray">العنوان</p>
                <p className="font-bold text-textDark mt-0.5">{detailsModal.address || '—'}</p>
              </div>
            </div>

            {detailsModal.bio && (
              <div className="mt-3">
                <p className="text-textGray text-xs mb-1">النبذة التعريفية:</p>
                <p className="text-xs text-textDark bg-white p-3 rounded-xl border border-neutral leading-relaxed">{detailsModal.bio}</p>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = detailsModal;
                  setDetailsModal(null);
                  handleOpenDocs(target);
                }}
                className="btn-primary text-xs py-2 px-4"
              >
                عرض الوثائق الرسمية
              </button>
              <button type="button" onClick={() => setDetailsModal(null)} className="btn-outline text-xs py-2 px-4">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Docs Modal */}
      {docsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between pb-2 border-b border-neutral">
              <div>
                <h3 className="text-base font-bold text-textDark">
                  مستندات ووثائق {docsModal.name || docsModal.userId?.name || 'الحرفي'}
                </h3>
                <p className="text-xs text-textGray">
                  {docsModal.profession || 'حرفي'} • {docsModal.email || docsModal.userId?.email}
                </p>
              </div>
              <button type="button" onClick={() => setDocsModal(null)} className="rounded-xl p-1 text-textGray hover:bg-neutral">
                <FaTimes size={15} />
              </button>
            </div>

            {docsModal.loading ? (
              <div className="py-12">
                <LoadingSpinner text="جاري جلب أحدث الوثائق من الخادم..." />
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: 'بطاقة الرقم القومي (National ID)', url: docsModal.nationalId },
                  { label: 'شهادة الخبرة / المؤهل الفني', url: docsModal.certificate },
                  { label: 'الصورة الشخصية الرسمية', url: docsModal.profileImage },
                ].map(({ label, url }) => (
                  <div key={label} className="bg-neutral/40 p-3.5 rounded-2xl border border-neutral">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-textDark">{label}</p>
                      {url && (
                        <span className="badge-status bg-primary/10 text-primary text-[10px] font-bold">
                          {/\.pdf($|\?)/i.test(url) ? 'PDF' : 'صورة'}
                        </span>
                      )}
                    </div>
                    {!url ? (
                      <p className="text-xs text-textGray py-1">لم يتم إرفاق ملف</p>
                    ) : /\.pdf($|\?)/i.test(url) ? (
                      <div className="pt-1">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5 font-bold"
                        >
                          <FaFileAlt size={11} /> فتح وقراءة ملف PDF ↗
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-borderGray bg-white">
                          <img
                            src={url}
                            alt={label}
                            className="max-h-56 w-full object-contain hover:scale-102 transition-transform duration-200"
                          />
                        </a>
                        <div className="flex justify-end">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                          >
                            عرض بالحجم الكامل ↗
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setDocsModal(null)} className="btn-outline text-xs py-2 px-5">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
