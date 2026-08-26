import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  FaBell,
  FaHeadset,
  FaCompass,
  FaCalendarAlt,
  FaUser,
  FaBars,
  FaTimes,
} from 'react-icons/fa';

const navLinks = [
  { to: '/customer/home', label: 'استكشف', icon: FaCompass },
  { to: '/customer/dashboard', label: 'حجوزاتي', icon: FaCalendarAlt },
  { to: '/customer/support', label: 'الدعم', icon: FaHeadset },
  { to: '/customer/profile', label: 'الملف الشخصي', icon: FaUser },
];

export default function CustomerLayout() {
  const { user } = useSelector((state) => state.auth);
  const { unreadCount } = useSelector((state) => state.notifications);
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-borderGray/60 shadow-sm">
        <div className="mx-auto flex max-w-container-max items-center justify-between gap-4 px-4 py-3 lg:px-6">

          {/* Left: Logo / Brand */}
          <NavLink
            to="/customer/home"
            className="flex items-center gap-2.5 text-primary"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-bold text-sm shadow-sm shadow-primary/25">
              ح
            </div>
            <span className="hidden font-bold text-lg text-primary sm:block">
              Harfey <span className="text-secondary">(حرفي)</span>
            </span>
          </NavLink>

          {/* Center: Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-textGray hover:bg-neutral hover:text-textDark'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right: Actions & User */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/customer/notifications')}
              className="relative rounded-xl p-2.5 text-textGray hover:bg-neutral hover:text-primary transition-all duration-150"
              aria-label="الإشعارات"
            >
              <FaBell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emergency text-[10px] font-bold text-white shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/customer/support')}
              className="hidden rounded-xl p-2.5 text-textGray hover:bg-neutral hover:text-primary transition-all duration-150 sm:block"
              title="تواصل مع الإدارة والدعم"
            >
              <FaHeadset size={18} />
            </button>

            <div className="hidden h-6 w-px bg-borderGray sm:block" />

            <button
              type="button"
              onClick={() => navigate('/customer/profile')}
              className="flex items-center gap-2.5 rounded-xl p-1.5 transition-all duration-150 hover:bg-neutral"
            >
              <img
                src={user?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=0F4C75&color=fff&bold=true`}
                alt={user?.name}
                className="h-8 w-8 rounded-full border-2 border-primary/20 object-cover"
              />
              <span className="hidden text-sm font-semibold text-textDark sm:block">
                {user?.name?.split(' ')[0]}
              </span>
            </button>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-xl p-2.5 text-textGray hover:bg-neutral md:hidden"
            >
              {mobileMenuOpen ? <FaTimes size={18} /> : <FaBars size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="border-t border-borderGray/60 bg-white px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-textGray hover:bg-neutral'
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="mx-auto max-w-container-max px-4 py-6 pb-24 lg:pb-8 lg:px-6">
        <Outlet />
      </main>

      {/* Bottom navigation (mobile only) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-borderGray/60 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 py-1 md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[11px] font-medium transition-all ${
                  isActive
                    ? 'text-primary'
                    : 'text-textGray hover:text-primary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                    <Icon size={18} />
                  </div>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
