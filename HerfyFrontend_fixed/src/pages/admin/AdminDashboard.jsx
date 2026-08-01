import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaUsers,
  FaHardHat,
  FaMoneyBillWave,
  FaShieldAlt,
  FaCheck,
  FaTimes,
} from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';

const ACTION_LABELS = {
  'handyman.approve': 'الموافقة على حرفي',
  'handyman.reject': 'رفض حرفي',
  'handyman.suspend': 'تعليق حرفي',
  'handyman.unsuspend': 'إلغاء تعليق حرفي',
  'handyman.autoVerify': 'توثيق تلقائي لحرفي',
  'user.ban': 'حظر مستخدم',
  'user.unban': 'إلغاء حظر مستخدم',
  'user.delete': 'حذف حساب',
  'report.resolve': 'حل بلاغ',
  'wallet.settle': 'تسوية محفظة',
  'city.create': 'إضافة مدينة',
  'city.update': 'تعديل مدينة',
  'city.delete': 'حذف مدينة',
  'serviceType.create': 'إضافة تخصص',
  'serviceType.update': 'تعديل تخصص',
  'serviceType.delete': 'حذف تخصص',
};

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `منذ ${days} يوم`;
}

function GrowthChart({ data }) {
  const width = 640;
  const height = 220;
  const padLeft = 32;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.users, d.orders)));
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const pointsFor = (key) =>
    data
      .map((d, i) => {
        const x = padLeft + i * stepX;
        const y = padTop + plotH - (d[key] / maxValue) * plotH;
        return `${x},${y}`;
      })
      .join(' ');

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
        {gridSteps.map((g) => {
          const y = padTop + plotH - g * plotH;
          return (
            <g key={g}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#D1D5DB" strokeWidth="1" strokeDasharray="4 4" />
              <text x={padLeft - 6} y={y + 3} fontSize="9" fill="#6B7280" textAnchor="end">
                {Math.round(g * maxValue)}
              </text>
            </g>
          );
        })}
        <polyline points={pointsFor('orders')} fill="none" stroke="#F68B1E" strokeWidth="2.5" />
        <polyline points={pointsFor('users')} fill="none" stroke="#0F4C75" strokeWidth="2.5" />
        {data.map((d, i) => {
          const x = padLeft + i * stepX;
          const yUsers = padTop + plotH - (d.users / maxValue) * plotH;
          const yOrders = padTop + plotH - (d.orders / maxValue) * plotH;
          return (
            <g key={d.month}>
              <circle cx={x} cy={yUsers} r="3" fill="#0F4C75" />
              <circle cx={x} cy={yOrders} r="3" fill="#F68B1E" />
              <text x={x} y={height - 6} fontSize="9" fill="#6B7280" textAnchor="middle">
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-6 text-xs text-textGray">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> مستخدمون جدد</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-secondary" /> طلبات جديدة</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [chart, setChart] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, pendingRes, chartRes, logsRes] = await Promise.all([
          adminService.getStats(),
          adminService.getPendingVerification(),
          adminService.getDashboardChart(),
          adminService.getAuditLogs({ page: 1, limit: 4 }),
        ]);
        setStats(statsRes.data);
        setPending((pendingRes.data.data || pendingRes.data || []).slice(0, 5));
        setChart(chartRes.data?.data || []);
        setActivities(logsRes.data?.data || []);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleVerify = async (handymanId, approve) => {
    if (approve) {
      await adminService.autoVerify(handymanId);
    }
    setPending((prev) => prev.filter((p) => p.userId !== handymanId));
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const statCards = [
    {
      icon: FaShieldAlt,
      label: 'تحققات معلقة',
      value: pending.length,
      urgent: true,
      onClick: () => navigate('/admin/verifications'),
    },
    {
      icon: FaMoneyBillWave,
      label: 'إجمالي الإيرادات',
      value: `${stats?.totalRevenue?.toLocaleString('ar-EG') || '0'} ج.م`,
      onClick: () => navigate('/admin/analytics'),
    },
    {
      icon: FaHardHat,
      label: 'الحرفيون النشطون',
      value: stats?.totalHandymen?.toLocaleString('ar-EG') || '0',
      onClick: () => navigate('/admin/users?role=handyman'),
    },
    {
      icon: FaUsers,
      label: 'إجمالي المستخدمين',
      value: stats?.totalUsers?.toLocaleString('ar-EG') || '0',
      onClick: () => navigate('/admin/users'),
    },
  ];

  const hasChartData = chart.some((c) => c.users > 0 || c.orders > 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-primary">نظرة عامة</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ icon: Icon, label, value, urgent, onClick }) => (
          <button
            type="button"
            key={label}
            onClick={onClick}
            className="card w-full text-right transition hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="mb-3 flex items-center justify-between">
              <Icon className="text-primary" size={24} />
              {urgent && (
                <span className="rounded-full bg-emergency/10 px-2 py-0.5 text-xs font-bold text-emergency">
                  عاجل
                </span>
              )}
            </div>
            <p className="text-sm text-textGray">{label}</p>
            <p className="text-2xl font-bold text-textDark">{value}</p>
          </button>
        ))}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-textDark">نمو المنصة</h3>
            <span className="rounded-lg border border-borderGray px-3 py-1 text-sm text-textGray">
              {new Date().getFullYear()}
            </span>
          </div>
          {!hasChartData ? (
            <p className="py-10 text-center text-textGray">لا توجد بيانات كافية بعد</p>
          ) : (
            <GrowthChart data={chart} />
          )}
        </div>

        <div className="card">
          <h3 className="mb-4 font-bold text-textDark">آخر النشاطات</h3>
          {activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-textGray">لا توجد نشاطات بعد</p>
          ) : (
            <div className="space-y-3">
              {activities.map((log) => (
                <div key={log._id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p>{ACTION_LABELS[log.action] || log.action}</p>
                    <p className="text-xs text-textGray">{timeAgo(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-textDark">طلبات التحقق الأخيرة</h3>
          <Link to="/admin/verifications" className="text-sm text-primary">عرض الكل ←</Link>
        </div>
        {pending.length === 0 ? (
          <p className="py-6 text-center text-textGray">لا توجد طلبات تحقق</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borderGray text-textGray">
                  <th className="pb-3 text-right font-medium">الحرفي</th>
                  <th className="pb-3 text-right font-medium">المهنة</th>
                  <th className="pb-3 text-right font-medium">التقييم</th>
                  <th className="pb-3 text-right font-medium">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.userId} className="border-b border-borderGray last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <img src={getDefaultAvatar(item.name)} alt="" className="h-8 w-8 rounded-full" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-textGray">{item.profession}</td>
                    <td className="py-3">{item.rating?.toFixed(1)}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleVerify(item.userId, true)}
                          className="flex items-center gap-1 rounded-lg bg-tertiary/10 px-3 py-1 text-tertiary"
                        >
                          <FaCheck size={12} /> قبول
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerify(item.userId, false)}
                          className="flex items-center gap-1 rounded-lg bg-emergency/10 px-3 py-1 text-emergency"
                        >
                          <FaTimes size={12} /> رفض
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
