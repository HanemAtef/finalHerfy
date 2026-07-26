import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaStar, FaExclamationTriangle, FaDownload, FaTrash, FaArrowRight } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReasonModal from '../../components/common/ReasonModal';
import { ROLE_LABELS, getDefaultAvatar } from '../../utils/helpers';

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'ban'|'delete', userId }
  const [exporting, setExporting] = useState(false);

  const [pendingReportsCount, setPendingReportsCount] = useState(null);
  const [avgRating, setAvgRating] = useState(null);

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
    if (filter === 'all') return true;
    return u.role === filter;
  });

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
          { icon: FaExclamationTriangle, label: 'بلاغات معلقة', value: stats.reports, sub: 'عرض التفاصيل', border: 'border-emergency', iconColor: 'text-emergency', subColor: 'text-emergency' },
          { icon: FaStar, label: 'متوسط التقييم', value: stats.avgRating, sub: 'من كل التقييمات', border: 'border-tertiary', iconColor: 'text-tertiary', subColor: 'text-secondary' },
          { icon: FaUsers, label: 'الحرفيون النشطون', value: stats.handymen, sub: 'من إجمالي المستخدمين', border: 'border-secondary', iconColor: 'text-secondary', subColor: 'text-tertiary' },
          { icon: FaUsers, label: 'إجمالي المستخدمين', value: stats.total, sub: 'كل الأدوار', border: 'border-primary', iconColor: 'text-primary', subColor: 'text-tertiary' },
        ].map(({ icon: Icon, label, value, sub, border, iconColor, subColor }) => (
          <div key={label} className={`card border-t-4 ${border}`}>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-neutral">
              <Icon className={iconColor} size={18} />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-textGray">{label}</p>
            <p className={`mt-1 text-xs ${subColor}`}>{sub}</p>
          </div>
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
                onClick={() => setFilter(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  filter === key ? 'bg-primary text-white' : 'border border-borderGray text-textGray'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
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
                {filtered.slice(0, 10).map((user) => (
                  <tr key={user._id} className="border-b border-borderGray last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <img src={getDefaultAvatar(user.name)} alt="" className="h-9 w-9 rounded-full" />
                        <div>
                          <p className="font-medium">{user.name}</p>
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
                      <div className="flex items-center gap-2">
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

        {!loading && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-textGray">
            <span>
              عرض 1-{Math.min(filtered.length, 10)} من أصل {filtered.length} مستخدم
            </span>
            <div className="flex items-center gap-1">
              <button type="button" className="rounded-lg border border-borderGray px-3 py-1.5">›</button>
              <button type="button" className="rounded-lg px-3 py-1.5 text-textGray">…</button>
              <button type="button" className="rounded-lg border border-borderGray px-3 py-1.5">3</button>
              <button type="button" className="rounded-lg border border-borderGray px-3 py-1.5">2</button>
              <button type="button" className="rounded-lg bg-primary px-3 py-1.5 font-bold text-white">1</button>
              <button type="button" className="rounded-lg border border-borderGray px-3 py-1.5">‹</button>
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
