import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaThLarge,
  FaUsers,
  FaLayerGroup,
  FaShieldAlt,
  FaChartLine,
  FaQuestionCircle,
  FaCog,
  FaBell,
  FaSearch,
  FaFlag,
  FaHistory,
  FaSignOutAlt,
  FaWallet,
} from 'react-icons/fa';
import { logoutUser } from '../../store/slices/authSlice';

const sidebarLinks = [
  { to: '/admin/dashboard', label: 'نظرة عامة', icon: FaThLarge },
  { to: '/admin/users', label: 'المستخدمون', icon: FaUsers },
  { to: '/admin/verifications', label: 'التحققات', icon: FaShieldAlt },
  { to: '/admin/reports', label: 'البلاغات', icon: FaFlag },
  { to: '/admin/wallets', label: 'المحافظ', icon: FaWallet },
  { to: '/admin/reference-data', label: 'المدن والتخصصات', icon: FaLayerGroup },
  { to: '/admin/analytics', label: 'التحليلات', icon: FaChartLine },
  { to: '/admin/audit-log', label: 'سجل النشاط', icon: FaHistory },
];

export default function AdminLayout() {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-neutral">
      <div className="mx-auto flex max-w-[1400px]">
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
              <input
                type="search"
                placeholder="البحث في البيانات..."
                className="input-field pr-10"
              />
            </div>
            <div className="flex items-center gap-4">
              <button type="button" className="rounded-full p-2 text-primary">
                <FaBell size={18} />
              </button>
              <button type="button" className="rounded-full p-2 text-primary">
                <FaQuestionCircle size={18} />
              </button>
              <div className="flex items-center gap-3">
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'A')}&background=0F4C75&color=fff`}
                  alt={user?.name}
                  className="h-10 w-10 rounded-full"
                />
                <div>
                  <p className="text-sm font-bold text-textDark">{user?.name}</p>
                  <p className="text-xs text-textGray">مدير النظام</p>
                </div>
              </div>
            </div>
          </header>
          <Outlet />
        </main>

        <aside className="hidden w-64 shrink-0 border-r border-borderGray bg-white p-4 lg:block">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-primary">Harfey Admin</h2>
            <p className="text-xs uppercase tracking-wider text-textGray">إدارة المنصة</p>
          </div>
          <nav className="space-y-1">
            {sidebarLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/admin/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
                    isActive
                      ? 'border-l-4 border-primary bg-primary/5 text-primary'
                      : 'text-textGray hover:bg-neutral'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="btn-secondary mt-6 w-full text-sm">
            نشر تنبيه عام
          </button>
          <div className="mt-auto space-y-2 pt-8">
            <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-sm text-textGray">
              <FaQuestionCircle /> الدعم الفني
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-sm text-textGray">
              <FaCog /> الإعدادات
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-emergency hover:bg-emergency/5 rounded-lg"
            >
              <FaSignOutAlt /> تسجيل الخروج
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
