import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaUsers, FaStar, FaExclamationTriangle, FaDownload, FaTrash, FaArrowRight, FaSearch } from 'react-icons/fa';
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
  const [exporting, setExporting] = useState(false);

  const [pendingReportsCount, setPendingReportsCount] = useState(null);
  const [avgRating, setAvgRating] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Derived directly from the URL (not local state) so repeated header
  // searches — which navigate to this same route with new ?q=/?role=
  // params without remounting the component — are picked up immediately.
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
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate(-1)} className="mt-1 text-primary">
            <FaArrowRight size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary">إدارة المستخدمين</h1>
            <p className="text-sm text-textGray">عرض وإدارة جميع مستخدمي المنصة</p>
          </div>
        </div>
        <button type="button" onClick={handleExport} disabled={exporting} className="btn-outline flex items-center gap-2 text-sm disabled:opacity-50">
          <FaDownload /> {exporting ? 'جارٍ التصدير...' : 'تصدير CSV'}
        </button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: FaExclamationTriangle, label: 'بلاغات معلقة', value: stats.reports, sub: 'عرض التفاصيل', border: 'border-emergency', iconColor: 'text-emergency', subColor: 'text-emergency', onClick: () => navigate('/admin/reports') },
          { icon: FaStar, label: 'متوسط التقييم', value: stats.avgRating, sub: 'من كل التقييمات', border: 'border-tertiary', iconColor: 'text-tertiary', subColor: 'text-secondary', onClick: () => navigate('/admin/analytics') },
          { icon: FaUsers, label: 'الحرفيون النشطون', value: stats.handymen, sub: 'من إجمالي المستخدمين', border: 'border-secondary', iconColor: 'text-secondary', subColor: 'text-tertiary', onClick: () => handleFilterChange('handyman') },
          { icon: FaUsers, label: 'إجمالي المستخدمين', value: stats.total, sub: 'كل الأدوار', border: 'border-primary', iconColor: 'text-primary', subColor: 'text-tertiary', onClick: () => handleFilterChange('all') },
        ].map(({ icon: Icon, label, value, sub, border, iconColor, subColor, onClick }) => (
          <button
            type="button"
            key={label}
            onClick={onClick}
            className={`card border-t-4 text-right transition hover:shadow-md ${border}`}
          >
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-neutral">
              <Icon className={iconColor} size={18} />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-textGray">{label}</p>
            <p className={`mt-1 text-xs ${subColor}`}>{sub}</p>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'الكل' },
              { key: 'handyman', label: 'حرفيون' },
              { key: 'customer', label: 'عملاء' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleFilterChange(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  filter === key ? 'bg-primary text-white' : 'border border-borderGray text-textGray'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" size={13} />
            <input
              type="search"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ابحث بالاسم أو الإيميل..."
              className="input-field pr-9 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-textGray">لا يوجد مستخدمون مطابقون</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borderGray text-textGray">
                  <th className="pb-3 text-right">المستخدم</th>
                  <th className="pb-3 text-right">الدور</th>
                  <th className="pb-3 text-right">تاريخ الانضمام</th>
                  <th className="pb-3 text-right">إجمالي المهام</th>
                  <th className="pb-3 text-right">التقييم</th>
                  <th className="pb-3 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((user) => (
                  <tr
                    key={user._id}
                    onClick={() => navigate(`/admin/users/${user._id}`)}
                    className="cursor-pointer border-b border-borderGray last:border-0 hover:bg-neutral/60"
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <img src={getDefaultAvatar(user.name)} alt="" className="h-9 w-9 rounded-full" />
                        <div>
                          <p className="font-medium hover:text-primary hover:underline">{user.name}</p>
                          <p className="text-xs text-textGray">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="py-3 text-textGray">
                      {new Date(user.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-3 text-textDark">{user.totalTasks ?? user.completedOrders ?? '—'}</td>
                    <td className="py-3 text-secondary">
                      {user.rating ? `★ ${user.rating.toFixed(1)}` : '—'}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleBan(user._id, !user.isBanned)}
                          title={user.banReason || ''}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            user.isBanned ? 'bg-borderGray' : 'bg-tertiary'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              user.isBanned ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'delete', userId: user._id })}
                          className="text-emergency hover:opacity-70"
                          title="حذف الحساب"
                        >
                          <FaTrash size={13} />
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-textGray">
            <span>
              عرض {pageStart + 1}-{Math.min(filtered.length, pageStart + PAGE_SIZE)} من أصل {filtered.length} مستخدم
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-borderGray px-3 py-1.5 disabled:opacity-50"
              >
                ‹
              </button>
              <span className="px-2 font-bold text-textDark">{currentPage} / {totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-borderGray px-3 py-1.5 disabled:opacity-50"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <ReasonModal
          title={modal.type === 'ban' ? 'سبب حظر الحساب' : 'سبب حذف الحساب نهائياً'}
          confirmLabel={modal.type === 'ban' ? 'حظر' : 'حذف'}
          danger
          onConfirm={modal.type === 'ban' ? handleBanConfirm : handleDeleteConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
