import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  FaUserCircle,
  FaHardHat,
  FaPhoneAlt,
  FaEnvelope,
  FaTimes,
  FaPaperPlane,
  FaBullhorn,
} from 'react-icons/fa';
import { logoutUser } from '../../store/slices/authSlice';
import { adminService } from '../../services/api';

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
  const { unreadCount } = useSelector((state) => state.notifications);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPool, setSearchPool] = useState({ users: [], services: [] });
  const [supportOpen, setSupportOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', body: '', audience: 'all' });
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null); // { ok: bool, msg: string }
  const searchBoxRef = useRef(null);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  // Loaded once so the header search can match customers/handymen by name
  // and service types by name without a dedicated search endpoint.
  useEffect(() => {
    adminService
      .getUsers()
      .then((res) => setSearchPool((p) => ({ ...p, users: res.data.data || res.data || [] })))
      .catch(() => {});
    adminService
      .getServiceTypes()
      .then((res) => setSearchPool((p) => ({ ...p, services: res.data.data || [] })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { users: [], services: [] };
    const users = searchPool.users
      .filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      .slice(0, 5);
    const services = searchPool.services
      .filter((s) => s.name?.toLowerCase().includes(q))
      .slice(0, 4);
    return { users, services };
  }, [query, searchPool]);

  const hasResults = results.users.length > 0 || results.services.length > 0;

  const goToUser = (u) => {
    setSearchOpen(false);
    setQuery('');
    navigate(`/admin/users?q=${encodeURIComponent(u.name)}`);
  };

  const goToService = () => {
    setSearchOpen(false);
    const q = query.trim();
    setQuery('');
    navigate(`/admin/reference-data?q=${encodeURIComponent(q)}`);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearchOpen(false);
    navigate(`/admin/users?q=${encodeURIComponent(query.trim())}`);
  };

  const openBroadcast = () => {
    setBroadcastResult(null);
    setBroadcastForm({ title: '', body: '', audience: 'all' });
    setBroadcastOpen(true);
  };

  const closeBroadcast = () => {
    setBroadcastOpen(false);
    setBroadcastResult(null);
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.body.trim()) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const res = await adminService.broadcastAnnouncement(broadcastForm);
      setBroadcastResult({
        ok: true,
        msg: `تم إرسال التنبيه إلى ${res.data.recipientCount} مستخدم بنجاح`,
      });
      setBroadcastForm({ title: '', body: '', audience: 'all' });
    } catch (err) {
      setBroadcastResult({
        ok: false,
        msg: err.response?.data?.msg || 'حدث خطأ أثناء إرسال التنبيه',
      });
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral">
      <div className="mx-auto flex max-w-[1400px]">
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div ref={searchBoxRef} className="relative flex-1 max-w-md">
              <form onSubmit={handleSearchSubmit}>
                <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="ابحث باسم عميل، صانع، أو خدمة..."
                  className="input-field pr-10"
                />
              </form>

              {searchOpen && query.trim().length >= 2 && (
                <div className="absolute z-50 mt-2 w-full rounded-xl border border-borderGray bg-white p-2 shadow-lg">
                  {!hasResults ? (
                    <p className="px-3 py-4 text-center text-sm text-textGray">لا توجد نتائج</p>
                  ) : (
                    <>
                      {results.users.length > 0 && (
                        <div className="mb-1">
                          <p className="px-3 pb-1 pt-2 text-xs font-bold text-textGray">المستخدمون</p>
                          {results.users.map((u) => (
                            <button
                              key={u._id}
                              type="button"
                              onClick={() => goToUser(u)}
                              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right hover:bg-neutral"
                            >
                              {u.role === 'handyman' ? (
                                <FaHardHat className="text-secondary" size={14} />
                              ) : (
                                <FaUserCircle className="text-primary" size={14} />
                              )}
                              <span className="flex-1 text-sm">
                                <span className="block font-medium text-textDark">{u.name}</span>
                                <span className="block text-xs text-textGray">{u.email}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {results.services.length > 0 && (
                        <div>
                          <p className="px-3 pb-1 pt-2 text-xs font-bold text-textGray">التخصصات / الخدمات</p>
                          {results.services.map((s) => (
                            <button
                              key={s._id}
                              type="button"
                              onClick={goToService}
                              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right hover:bg-neutral"
                            >
                              <FaLayerGroup className="text-tertiary" size={14} />
                              <span className="text-sm text-textDark">{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/admin/notifications')}
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
                onClick={() => setSupportOpen(true)}
                className="rounded-full p-2 text-primary hover:bg-neutral"
              >
                <FaQuestionCircle size={18} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/profile')}
                className="flex items-center gap-3 rounded-lg p-1 hover:bg-neutral"
              >
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'A')}&background=0F4C75&color=fff`}
                  alt={user?.name}
                  className="h-10 w-10 rounded-full"
                />
                <div className="text-right">
                  <p className="text-sm font-bold text-textDark">{user?.name}</p>
                  <p className="text-xs text-textGray">مدير النظام</p>
                </div>
              </button>
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
          <button
            type="button"
            onClick={openBroadcast}
            className="btn-secondary mt-6 flex w-full items-center justify-center gap-2 text-sm"
          >
            <FaBullhorn size={14} /> نشر تنبيه عام
          </button>
          <div className="mt-auto space-y-2 pt-8">
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-textGray"
            >
              <FaQuestionCircle /> الدعم الفني
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/profile')}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-textGray"
            >
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

      {supportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-textDark">الدعم الفني</h3>
              <button type="button" onClick={() => setSupportOpen(false)} className="text-textGray">
                <FaTimes />
              </button>
            </div>
            <p className="mb-4 text-sm text-textGray">
              لأي مشكلة تقنية أو استفسار بخصوص لوحة تحكم الأدمن، تقدر تتواصل مع فريق الدعم عبر:
            </p>
            <div className="space-y-3 text-sm">
              <a href="mailto:support@herfy.app" className="flex items-center gap-3 rounded-lg border border-borderGray px-3 py-2 hover:bg-neutral">
                <FaEnvelope className="text-primary" /> support@herfy.app
              </a>
              <a href="tel:+201000000000" className="flex items-center gap-3 rounded-lg border border-borderGray px-3 py-2 hover:bg-neutral">
                <FaPhoneAlt className="text-primary" /> +20 100 000 0000
              </a>
            </div>
          </div>
        </div>
      )}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-textDark">نشر تنبيه عام</h3>
              <button type="button" onClick={closeBroadcast} className="text-textGray">
                <FaTimes />
              </button>
            </div>
            <p className="mb-4 text-sm text-textGray">
              هيتبعت إشعار فوري لكل المستخدمين المستهدفين — استخدميها للإعلانات المهمة بس.
            </p>

            {broadcastResult && (
              <div
                className={`mb-4 rounded-lg px-4 py-3 text-sm ${
                  broadcastResult.ok ? 'bg-tertiary/10 text-tertiary' : 'bg-emergency/10 text-emergency'
                }`}
              >
                {broadcastResult.msg}
              </div>
            )}

            <form onSubmit={handleBroadcastSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-bold text-textDark">الفئة المستهدفة</label>
                <div className="flex gap-2">
                  {[
                    { key: 'all', label: 'الكل' },
                    { key: 'customer', label: 'العملاء فقط' },
                    { key: 'handyman', label: 'الحرفيون فقط' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBroadcastForm((f) => ({ ...f, audience: key }))}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                        broadcastForm.audience === key
                          ? 'bg-primary text-white'
                          : 'border border-borderGray text-textGray'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-textDark">العنوان</label>
                <input
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={100}
                  placeholder="مثال: صيانة مجدولة الليلة"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-textDark">نص التنبيه</label>
                <textarea
                  value={broadcastForm.body}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, body: e.target.value }))}
                  maxLength={500}
                  rows={4}
                  placeholder="اكتبي رسالة التنبيه هنا..."
                  className="input-field w-full resize-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeBroadcast} className="btn-outline text-sm">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={broadcastSending || !broadcastForm.title.trim() || !broadcastForm.body.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <FaPaperPlane size={12} /> {broadcastSending ? 'جارِ الإرسال...' : 'نشر التنبيه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
