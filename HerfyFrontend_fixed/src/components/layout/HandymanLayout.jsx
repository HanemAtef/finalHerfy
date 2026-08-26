import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaBell,
  FaClipboardList,
  FaMoneyBillWave,
  FaCog,
  FaFlag,
  FaSignOutAlt,
  FaHeadset,
  FaTachometerAlt,
  FaBars,
  FaTimes,
} from 'react-icons/fa';
import { useState } from 'react';
import { logoutUser } from '../../store/slices/authSlice';
import { getDefaultAvatar } from '../../utils/helpers';

const sidebarLinks = [
  { to: '/handyman/dashboard', label: 'لوحة التحكم', icon: FaTachometerAlt },
  { to: '/handyman/orders', label: 'جميع الطلبات', icon: FaClipboardList },
  { to: '/handyman/support', label: 'الدعم والتواصل', icon: FaHeadset },
  { to: '/handyman/reports', label: 'البلاغات', icon: FaFlag },
  { to: '/handyman/profile', label: 'الإعدادات', icon: FaCog },
];

export default function HandymanLayout() {
  const { user } = useSelector((state) => state.auth);
  const { unreadCount } = useSelector((state) => state.notifications);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral">
      {/* Top header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-borderGray/60 shadow-sm">
        <div className="mx-auto flex max-w-container-max items-center justify-between px-4 py-3 lg:px-6">
          {/* Left: Brand + panel label */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl p-2 text-textGray hover:bg-neutral lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <FaTimes size={18} /> : <FaBars size={18} />}
            </button>
            <NavLink to="/handyman/dashboard" className="flex items-center gap-2.5 text-primary">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-bold text-sm shadow-sm shadow-primary/25">
                ح
              </div>
              <div className="hidden sm:block">
                <span className="font-bold text-base text-primary">Harfey <span className="text-secondary">(حرفي)</span></span>
                <p className="text-[11px] text-textGray leading-none mt-0.5">لوحة تحكم الحرفي</p>
              </div>
            </NavLink>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/handyman/notifications')}
              className="relative rounded-xl p-2.5 text-textGray hover:bg-neutral hover:text-primary transition-all"
            >
              <FaBell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emergency text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/handyman/support')}
              className="hidden rounded-xl p-2.5 text-textGray hover:bg-neutral hover:text-primary transition-all sm:block"
              title="الدعم والتواصل"
            >
              <FaHeadset size={18} />
            </button>
            <div className="hidden h-6 w-px bg-borderGray sm:block" />
            <button
              type="button"
              onClick={() => navigate('/handyman/profile')}
              className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-neutral transition-all"
            >
              <img
                src={user?.profileImage || getDefaultAvatar(user?.name || 'H')}
                alt={user?.name}
                className="h-8 w-8 rounded-full border-2 border-primary/20 object-cover"
              />
              <span className="hidden text-sm font-semibold text-textDark sm:block">{user?.name?.split(' ')[0]}</span>
            </button>
            <button
              type="button"
              onClick={() => dispatch(logoutUser())}
              className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-emergency hover:bg-emergency/10 sm:flex transition-all"
            >
              <FaSignOutAlt size={14} />
              <span className="hidden md:block">خروج</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-container-max gap-0 lg:gap-6 px-0 py-0 lg:px-6 lg:py-6">
        {/* Sidebar — desktop */}
        <aside className={`
          fixed inset-y-0 right-0 z-30 flex w-64 flex-col bg-white border-l border-borderGray/60 shadow-xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-[calc(100vh-65px)] lg:translate-x-0 lg:rounded-2xl lg:border lg:shadow-[var(--shadow-card)]
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          lg:translate-x-0
        `}
          style={{ top: '65px' }}
        >
          {/* Sidebar user card */}
          <NavLink
            to="/handyman/profile"
            className="flex flex-col items-center gap-2 border-b border-borderGray/60 p-5 text-center hover:bg-neutral/50 transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <img
              src={user?.profileImage || getDefaultAvatar(user?.name || 'H')}
              alt={user?.name}
              className="h-14 w-14 rounded-full border-2 border-primary/20 object-cover shadow-sm"
            />
            <div>
              <h3 className="font-bold text-textDark text-sm">{user?.name}</h3>
              <p className="text-xs text-textGray mt-0.5">حرفي محترف</p>
            </div>
          </NavLink>

          {/* Nav links */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {sidebarLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  isActive
                    ? 'sidebar-item-active'
                    : 'sidebar-item'
                }
              >
                <Icon size={16} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="border-t border-borderGray/60 p-3">
            <button
              type="button"
              onClick={() => dispatch(logoutUser())}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-emergency hover:bg-emergency/10 transition-all"
            >
              <FaSignOutAlt size={16} />
              تسجيل الخروج
            </button>
          </div>
        </aside>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
