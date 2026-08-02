import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaBell,
  FaComments,
  FaClipboardList,
  FaMoneyBillWave,
  FaCalendarAlt,
  FaCog,
  FaUsers,
  FaFlag,
  FaSignOutAlt,
} from 'react-icons/fa';
import { logoutUser } from '../../store/slices/authSlice';
import { getDefaultAvatar } from '../../utils/helpers';

const sidebarLinks = [
  { to: '/handyman/dashboard', label: 'الطلبات النشطة', icon: FaUsers },
  { to: '/handyman/orders', label: 'جميع الطلبات', icon: FaClipboardList },
  { to: '/handyman/dashboard#earnings', label: 'الأرباح', icon: FaMoneyBillWave },
  { to: '/handyman/dashboard#schedule', label: 'الجدول', icon: FaCalendarAlt },
  { to: '/handyman/reports', label: 'البلاغات', icon: FaFlag },
  { to: '/handyman/profile', label: 'الإعدادات', icon: FaCog },
];

export default function HandymanLayout() {
  const { user } = useSelector((state) => state.auth);
  const { unreadCount } = useSelector((state) => state.notifications);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral">
      <header className="sticky top-0 z-40 border-b border-borderGray bg-white">
        <div className="mx-auto flex max-w-container-max items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/handyman/notifications')}
              className="relative cursor-pointer rounded-full p-2 text-primary transition-all duration-200 hover:scale-110 "
            >
              <FaBell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full bg-emergency" />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/handyman/orders')}
              className="rounded-full cursor-pointer p-2 text-primary transition-all duration-200 hover:scale-110"
              title="المحادثات متاحة من داخل كل طلب"
            >
              <FaComments size={18} />
            </button>
            <span className="hidden h-6 w-px bg-borderGray sm:block" />
            <span className="hidden text-sm font-medium text-textDark sm:block">
              لوحة تحكم الحرفي
            </span>
          </div>
          <NavLink to="/handyman/dashboard" className="text-xl font-bold text-primary">
            Harfey (حرفي)
          </NavLink>
          <button
            type="button"
            onClick={() => dispatch(logoutUser())}
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emergency hover:bg-emergency/10 sm:flex"
          >
            <FaSignOutAlt size={14} /> تسجيل الخروج
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-container-max gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <NavLink to="/handyman/profile" className="card mb-4 block text-center">
            <img
              src={user?.profileImage || getDefaultAvatar(user?.name || 'H')}
              alt={user?.name}
              className="mx-auto mb-3 h-20 w-20 rounded-full object-cover"
            />
            <h3 className="font-bold text-primary">{user?.name}</h3>
            <p className="text-sm text-textGray">حرفي محترف</p>
          </NavLink>
          <nav className="card space-y-1 p-2">
            {sidebarLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${isActive
                    ? 'border-r-4 border-primary bg-primary/5 text-primary'
                    : 'text-textGray hover:bg-neutral'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => dispatch(logoutUser())}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-emergency hover:bg-emergency/5"
            >
              <FaSignOutAlt size={16} />
              تسجيل الخروج
            </button>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
