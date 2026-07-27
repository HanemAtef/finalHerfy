import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, pendingRes] = await Promise.all([
          adminService.getStats(),
          adminService.getPendingVerification(),
        ]);
        setStats(statsRes.data);
        setPending((pendingRes.data.data || pendingRes.data || []).slice(0, 5));
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
    },
    {
      icon: FaMoneyBillWave,
      label: 'إيرادات اليوم',
      value: `${stats?.totalRevenue?.toLocaleString('ar-EG') || '0'} ر.س`,
      change: '+18%',
    },
    {
      icon: FaHardHat,
      label: 'الحرفيون النشطون',
      value: stats?.totalHandymen?.toLocaleString('ar-EG') || '0',
      change: '+0%',
    },
    {
      icon: FaUsers,
      label: 'إجمالي المستخدمين',
      value: stats?.totalUsers?.toLocaleString('ar-EG') || '0',
      change: '+12%',
    },
  ];

  const months = ['يوليو', 'يونيو', 'مايو', 'أبريل', 'مارس', 'فبراير', 'يناير'];
  const chartData = [90, 55, 75, 65, 70, 45, 60];
  const highlightIndex = 2;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-primary">نظرة عامة</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ icon: Icon, label, value, change, urgent }) => (
          <div key={label} className="card">
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
            {change && <p className="text-xs text-tertiary">{change}</p>}
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-textDark">نمو المنصة</h3>
            <select className="rounded-lg border border-borderGray px-3 py-1 text-sm">
              <option>آخر 30 يوم</option>
            </select>
          </div>
          <div className="flex h-48 items-end justify-between gap-2">
            {chartData.map((h, i) => (
              <div key={months[i]} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-lg ${i === highlightIndex ? 'bg-primary' : 'bg-primary/20'}`}
                  style={{ height: `${h}%` }}
                />
                <span className="text-xs text-textGray">{months[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-4 font-bold text-textDark">آخر النشاطات</h3>
          <div className="space-y-3">
            {[
              'مستخدم جديد مسجل',
              'حجز سباكة مكتمل',
              'طلب استرداد معالج',
              'طلب تحقق جديد',
            ].map((text, i) => (
              <div key={text} className="flex items-start gap-3 text-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p>{text}</p>
                  <p className="text-xs text-textGray">منذ {5 + i * 10} دقائق</p>
                </div>
              </div>
            ))}
          </div>
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
