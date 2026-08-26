import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaUsers,
  FaStar,
  FaExclamationTriangle,
  FaDownload,
  FaTrash,
  FaArrowRight,
  FaSearch,
  FaHardHat,
  FaUserCheck,
  FaFileAlt,
  FaTimes,
  FaShieldAlt,
  FaImages,
} from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReasonModal from '../../components/common/ReasonModal';
import { ROLE_LABELS, getDefaultAvatar } from '../../utils/helpers';

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'ban'|'delete', userId }
  const [docsModal, setDocsModal] = useState(null); // { user, documents, loading, error }
  const [lightbox, setLightbox] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [pendingReportsCount, setPendingReportsCount] = useState(null);
  const [avgRating, setAvgRating] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filter = searchParams.get('role') || 'all';
  const search = searchParams.get('q') || '';

  useEffect(() => {
    adminService
      .getUsers()
      .then((res) => setUsers(res.data.data || res.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
    adminService.getReports({ status: 'pending' }).then((res) => setPendingReportsCount((res.data.data || []).length)).catch(() => {});
    adminService.getReviewsAnalytics().then((res) => setAvgRating(res.data.averageRating)).catch(() => {});
  }, []);

  const filtered = users.filter((u) => {
    if (filter !== 'all' && u.role !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const handleFilterChange = (key) => {
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key === 'all') next.delete('role');
      else next.set('role', key);
      return next;
    });
  };

  const handleSearchChange = (value) => {
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('q', value);
      else next.delete('q');
      return next;
    }, { replace: true });
  };

  const handleBan = async (userId, isBanned) => {
    if (isBanned) {
      setModal({ type: 'ban', userId });
      return;
    }
    await adminService.banUserWithReason(userId, { isBanned: false });
    setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, isBanned: false, banReason: null } : u)));
  };

  const handleBanConfirm = async (reason) => {
    await adminService.banUserWithReason(modal.userId, { isBanned: true, reason });
    setUsers((prev) => prev.map((u) => (u._id === modal.userId ? { ...u, isBanned: true, banReason: reason } : u)));
  };

  const handleDeleteConfirm = async (reason) => {
    await adminService.deleteUser(modal.userId, reason);
    setUsers((prev) => prev.filter((u) => u._id !== modal.userId));
  };

  const handleViewDocs = async (targetUser) => {
    setDocsModal({
      user: targetUser,
      documents: targetUser.documents || [],
      loading: true,
      error: '',
    });

    try {
      const res = await adminService.getUserDocuments(targetUser._id);
      const docs = res.data.documents || res.data.data?.documents || [];
      setDocsModal({
        user: targetUser,
        documents: docs,
        loading: false,
        error: '',
      });
    } catch (err) {
      console.error('Failed to load user documents:', err);
      // Fallback: try getUserDetail
      try {
        const detailRes = await adminService.getUserDetail(targetUser._id);
        const detailDocs = detailRes.data.data?.documents || detailRes.data.data?.user?.documents || [];
        setDocsModal({
          user: targetUser,
          documents: detailDocs,
          loading: false,
          error: '',
        });
      } catch (fallbackErr) {
        setDocsModal({
          user: targetUser,
          documents: targetUser.documents || [],
          loading: false,
          error: 'تعذر تحميل أحدث الوثائق من الخادم',
        });
      }
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminService.exportCSV('users');
    } finally {
      setExporting(false);
    }
  };

  const stats = {
    total: users.length,
    handymen: users.filter((u) => u.role === 'handyman').length,
    avgRating: avgRating != null ? avgRating.toFixed(1) : '—',
    reports: pendingReportsCount ?? '—',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
          >
            <FaArrowRight size={13} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-textDark">إدارة المستخدمين</h1>
            <p className="text-xs text-textGray mt-0.5">عرض وتعديل حسابات العملاء والحرفيين وتفعيل الحظر</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="btn-outline text-xs py-2.5 px-4 shadow-sm disabled:opacity-50"
        >
          <FaDownload size={12} /> {exporting ? 'جارٍ التصدير...' : 'تصدير كملف CSV'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: FaExclamationTriangle, label: 'بلاغات معلقة', value: stats.reports, sub: 'عرض البلاغات', border: 'border-r-emergency', iconColor: 'text-emergency', onClick: () => navigate('/admin/reports') },
          { icon: FaStar, label: 'متوسط التقييم', value: stats.avgRating, sub: 'كافة التقييمات', border: 'border-r-secondary', iconColor: 'text-secondary', onClick: () => navigate('/admin/analytics') },
          { icon: FaHardHat, label: 'الحرفيون النشطون', value: stats.handymen, sub: 'تصفية الحرفيين', border: 'border-r-primary', iconColor: 'text-primary', onClick: () => handleFilterChange('handyman') },
          { icon: FaUsers, label: 'إجمالي المستخدمين', value: stats.total, sub: 'كل الحسابات', border: 'border-r-tertiary', iconColor: 'text-tertiary', onClick: () => handleFilterChange('all') },
        ].map(({ icon: Icon, label, value, sub, border, iconColor, onClick }) => (
          <button
            type="button"
            key={label}
            onClick={onClick}
            className={`stat-card text-right transition-all hover:shadow-md hover:-translate-y-0.5 border-r-4 ${border}`}
          >
            <div className="flex items-center justify-between">
              <span className="stat-label">{label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral text-textDark">
                <Icon className={iconColor} size={15} />
              </div>
            </div>
            <p className="stat-value">{value}</p>
            <p className="text-[11px] text-textGray mt-0.5 font-medium">{sub}</p>
          </button>
        ))}
      </div>

      {/* Users Table Card */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral">
          {/* Role Filter Tabs */}
          <div className="flex gap-1.5">
            {[
              { key: 'all', label: 'الكل' },
              { key: 'handyman', label: 'الحرفيون' },
              { key: 'customer', label: 'العملاء' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleFilterChange(key)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  filter === key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-borderGray bg-white text-textGray hover:border-primary/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <FaSearch className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray" size={13} />
            <input
              type="search"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ابحث بالاسم أو البريد..."
              className="input-field pr-9 text-xs py-2"
            />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner text="جاري تحميل المستخدمين..." />
        ) : filtered.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">👥</div>
            <p className="empty-state-title">لا يوجد مستخدمون مطابقون</p>
            <p className="empty-state-desc">جرب تعديل معايير البحث أو تصفية الأدوار</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">المستخدم</th>
                  <th className="table-th">الدور</th>
                  <th className="table-th">تاريخ الانضمام</th>
                  <th className="table-th">المهام</th>
                  <th className="table-th">التقييم</th>
                  <th className="table-th text-center">حالة الحساب / الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((u) => (
                  <tr
                    key={u._id}
                    onClick={() => navigate(`/admin/users/${u._id}`)}
                    className="table-tr cursor-pointer"
                  >
                    <td className="table-td">
                      <div className="flex items-center gap-2.5">
                        <img src={getDefaultAvatar(u.name)} alt="" className="h-8 w-8 rounded-full border border-borderGray" />
                        <div>
                          <p className="font-bold text-xs text-textDark hover:text-primary transition-colors">{u.name}</p>
                          <p className="text-[11px] text-textGray">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-td">
                      <span className={`badge-status text-[11px] font-bold ${u.role === 'handyman' ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="table-td text-xs text-textGray">
                      {new Date(u.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="table-td text-xs font-bold text-textDark">
                      {u.totalTasks ?? u.completedOrders ?? '—'}
                    </td>
                    <td className="table-td text-xs font-bold text-secondary">
                      {u.rating ? `★ ${u.rating.toFixed(1)}` : '—'}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleViewDocs(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-borderGray bg-white px-2 py-1 text-[11px] font-bold text-textDark hover:bg-neutral transition shadow-2xs"
                          title="عرض الوثائق والمستندات"
                        >
                          <FaFileAlt size={10} className="text-primary" /> الوثائق
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBan(u._id, !u.isBanned)}
                          title={u.banReason ? `سبب الحظر: ${u.banReason}` : u.isBanned ? 'إلغاء الحظر' : 'حظر المستخدم'}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            u.isBanned ? 'bg-borderGray' : 'bg-tertiary'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                              u.isBanned ? 'right-0.5' : 'right-5.5'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'delete', userId: u._id })}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-emergency hover:bg-red-100 transition-colors"
                          title="حذف الحساب نهائياً"
                        >
                          <FaTrash size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-textGray pt-2">
            <span>
              عرض <strong className="text-textDark">{pageStart + 1}</strong> إلى <strong className="text-textDark">{Math.min(filtered.length, pageStart + PAGE_SIZE)}</strong> من أصل <strong className="text-textDark">{filtered.length}</strong> مستخدم
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-xl border border-borderGray px-3 py-1.5 text-xs font-bold text-textDark hover:bg-neutral disabled:opacity-40"
              >
                السابق
              </button>
              <span className="px-3 font-extrabold text-textDark">{currentPage} / {totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-borderGray px-3 py-1.5 text-xs font-bold text-textDark hover:bg-neutral disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <ReasonModal
          title={modal.type === 'ban' ? 'سبب حظر هذا الحساب' : 'سبب حذف الحساب نهائياً'}
          confirmLabel={modal.type === 'ban' ? 'تأكيد الحظر' : 'تأكيد الحذف'}
          danger
          onConfirm={modal.type === 'ban' ? handleBanConfirm : handleDeleteConfirm}
          onClose={() => setModal(null)}
        />
      )}

      {/* User Documents Modal */}
      {docsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between pb-3 border-b border-neutral">
              <div>
                <h3 className="text-base font-bold text-textDark">
                  وثائق ومستندات {docsModal.user?.name || 'المستخدم'}
                </h3>
                <p className="text-xs text-textGray">
                  {docsModal.user?.role === 'handyman' ? 'حساب حرفي' : 'حساب عميل'} • {docsModal.user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocsModal(null)}
                className="rounded-xl p-1.5 text-textGray hover:bg-neutral transition"
              >
                <FaTimes size={15} />
              </button>
            </div>

            {docsModal.loading ? (
              <div className="py-12">
                <LoadingSpinner text="جاري جلب وثائق المستخدم من الخادم..." />
              </div>
            ) : docsModal.error ? (
              <div className="py-8 text-center text-xs text-emergency">
                <p className="font-bold mb-2">{docsModal.error}</p>
                <button
                  type="button"
                  onClick={() => handleViewDocs(docsModal.user)}
                  className="btn-outline text-xs py-1.5 px-4"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : !docsModal.documents || docsModal.documents.length === 0 ? (
              <div className="empty-state py-10">
                <div className="empty-state-icon">📄</div>
                <p className="empty-state-title">لا توجد وثائق مرفوعة</p>
                <p className="empty-state-desc">لم يقم هذا المستخدم برفع أي وثائق رسمية أو بطاقة رقم قومي بعد</p>
              </div>
            ) : (
              <div className="space-y-4">
                {docsModal.documents.map((doc, idx) => {
                  const url = doc.url || doc;
                  const isPdf = typeof url === 'string' && /\.pdf($|\?)/i.test(url);
                  const label = doc.originalName || (doc.type === 'national_id' ? 'بطاقة الرقم القومي (National ID)' : doc.type === 'certificate' ? 'شهادة الخبرة' : `وثيقة رسمية #${idx + 1}`);

                  return (
                    <div key={idx} className="rounded-2xl border border-borderGray bg-neutral/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-textDark">{label}</p>
                          {doc.uploadedAt && (
                            <p className="text-[10px] text-textGray mt-0.5">
                              تاريخ الرفع: {new Date(doc.uploadedAt).toLocaleDateString('ar-EG')}
                            </p>
                          )}
                        </div>
                        <span className="badge-status bg-primary/10 text-primary text-[10px] font-bold">
                          {isPdf ? 'PDF' : 'صورة'}
                        </span>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-borderGray bg-white max-h-60 flex items-center justify-center p-2">
                        {isPdf ? (
                          <div className="py-6 flex flex-col items-center gap-2 text-center">
                            <FaFileAlt className="text-primary" size={36} />
                            <p className="text-xs font-bold text-textDark">مستند بصيغة PDF</p>
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={label}
                            className="max-h-52 w-full object-contain cursor-pointer"
                            onClick={() => setLightbox(url)}
                          />
                        )}
                      </div>

                      <div className="flex gap-2">
                        {isPdf ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary flex-1 text-xs py-2 text-center flex items-center justify-center gap-1.5"
                          >
                            <FaFileAlt size={11} /> فتح وقراءة PDF ↗
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setLightbox(url)}
                            className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                          >
                            <FaImages size={11} /> تكبير الصورة
                          </button>
                        )}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline text-xs py-2 px-3 flex items-center justify-center"
                          title="فتح في تبويب جديد"
                        >
                          🔗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDocsModal(null)}
                className="btn-outline text-xs py-2 px-5"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for large preview */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-xs cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="معاينة الوثيقة"
            className="max-h-[90vh] max-w-[90vw] rounded-3xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
