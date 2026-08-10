import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  FaBell,
  FaComments,
  FaUser,
  FaSearch,
  FaCompass,
  FaCalendarAlt,
} from 'react-icons/fa';

const navLinks = [
  { to: '/customer/home', label: 'استكشف', icon: FaCompass },
  { to: '/customer/dashboard', label: 'حجوزاتي', icon: FaCalendarAlt },
  { to: '/customer/profile', label: 'الملف الشخصي', icon: FaUser },
];

export default function CustomerLayout() {
  const { user } = useSelector((state) => state.auth);
  const { unreadCount } = useSelector((state) => state.notifications);
  const navigate = useNavigate();
  const [headerSearch, setHeaderSearch] = useState('');

  const handleHeaderSearch = (e) => {
    e.preventDefault();
    navigate(`/customer/home${headerSearch ? `?q=${encodeURIComponent(headerSearch)}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-neutral">
      <header className="sticky top-0 z-40 border-b border-borderGray bg-white shadow-sm">
        <div className="mx-auto flex max-w-container-max items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/customer/notifications')}
              className="relative rounded-full p-2 text-primary hover:bg-neutral"
            >
              <FaBell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emergency text-[10px] text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/customer/dashboard')}
              className="rounded-full p-2 text-primary hover:bg-neutral"
              title="المحادثات متاحة من داخل كل طلب"
            >
              <FaComments size={18} />
            </button>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-b-2 border-primary pb-1 text-primary'
                      : 'text-textGray hover:text-primary'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold text-textDark">أهلاً {user?.name?.split(' ')[0]}</p>
              <p className="text-xs text-textGray">القاهرة، مصر</p>
            </div>
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=0F4C75&color=fff`}
              alt={user?.name}
              className="h-10 w-10 rounded-full border-2 border-primary"
            />
          </div>

          <NavLink to="/customer/home" className="text-xl font-bold text-primary md:hidden">
            Harfey (حرفي)
          </NavLink>
        </div>

        <div className="hidden border-t border-borderGray px-4 py-2 lg:block">
          <form onSubmit={handleHeaderSearch} className="mx-auto flex max-w-container-max items-center gap-2">
            {/* <div className="relative flex-1">
              <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
              <input
                type="search"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder="ابحث عن حرفي..."
                className="input-field pr-10"
              />
            </div> */}
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-container-max px-4 py-6 pb-24 lg:pb-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-borderGray bg-white px-4 py-2 md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-textGray'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
