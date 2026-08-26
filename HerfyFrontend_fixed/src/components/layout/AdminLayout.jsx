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
  FaComments,
  FaBars,
} from 'react-icons/fa';
import { logoutUser } from '../../store/slices/authSlice';
import { adminService, supportService } from '../../services/api';
import { connectSocket } from '../../socket/socket';

const sidebarLinks = [
  { to: '/admin/dashboard', label: 'نظرة عامة', icon: FaThLarge },
  { to: '/admin/users', label: 'المستخدمون', icon: FaUsers },
  { to: '/admin/support', label: 'محادثات الدعم', icon: FaComments, isSupport: true },
  { to: '/admin/verifications', label: 'التحققات', icon: FaShieldAlt },
  { to: '/admin/reports', label: 'البلاغات', icon: FaFlag },
  { to: '/admin/wallets', label: 'المحافظ', icon: FaWallet },
  { to: '/admin/reference-data', label: 'التخصصات', icon: FaLayerGroup },
  { to: '/admin/analytics', label: 'التحليلات', icon: FaChartLine },
  { to: '/admin/audit-log', label: 'سجل النشاط', icon: FaHistory },
];

export default function AdminLayout() {
  const { user, token } = useSelector((state) => state.auth);
  const { unreadCount } = useSelector((state) => state.notifications);
  const [supportUnread, setSupportUnread] = useState(0);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPool, setSearchPool] = useState({ users: [], services: [] });
  const [supportOpen, setSupportOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', body: '', audience: 'all' });
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchBoxRef = useRef(null);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  useEffect(() => {
    adminService
      .getUsers()
      .then((res) => setSearchPool((p) => ({ ...p, users: res.data.data || res.data || [] })))
      .catch(() => {});
    adminService
      .getServiceTypes()
      .then((res) => setSearchPool((p) => ({ ...p, services: res.data.data || [] })))
      .catch(() => {});

    supportService
      .getAdminUnreadCount()
      .then((res) => setSupportUnread(res.data.unreadCount || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    const handleUpdate = () => {
      supportService
        .getAdminUnreadCount()
        .then((res) => setSupportUnread(res.data.unreadCount || 0))
        .catch(() => {});
    };
    socket.on('admin_support_update', handleUpdate);
    socket.on('new_support_message', handleUpdate);
    return () => {
      socket.off('admin_support_update', handleUpdate);
      socket.off('new_support_message', handleUpdate);
    };
  }, [token]);

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
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-borderGray/60 shadow-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
          {/* Left: Hamburger + Brand */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-xl p-2 text-textGray hover:bg-neutral lg:hidden"
            >
              <FaBars size={18} />
            </button>
            <div className="flex items-center gap-2.5 text-primary">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-bold text-sm shadow-sm">
                ح
              </div>
              <div className="hidden sm:block">
                <span className="font-bold text-base text-primary">Harfey <span className="text-secondary">(حرفي)</span></span>
                <p className="text-[11px] text-textGray leading-none mt-0.5">لوحة إدارة المنصة</p>
              </div>
            </div>
          </div>

          {/* Center: Search */}
          <div ref={searchBoxRef} className="relative flex-1 max-w-sm hidden sm:block">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" size={14} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="ابحث باسم عميل، حرفي، أو خدمة..."
                  className="input-field pr-9 py-2 text-sm"
                />
              </div>
            </form>

            {searchOpen && query.trim().length >= 2 && (
              <div className="absolute z-50 mt-2 w-full rounded-xl border border-borderGray bg-white p-2 shadow-[var(--shadow-elevated)]">
                {!hasResults ? (
                  <p className="px-3 py-4 text-center text-sm text-textGray">لا توجد نتائج</p>
                ) : (
                  <>
                    {results.users.length > 0 && (
                      <div className="mb-1">
                        <p className="px-3 pb-1 pt-2 text-xs font-bold text-textGray uppercase tracking-wide">المستخدمون</p>
                        {results.users.map((u) => (
                          <button
                            key={u._id}
                            type="button"
                            onClick={() => goToUser(u)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right hover:bg-neutral transition-colors"
                          >
                            {u.role === 'handyman' ? (
                              <FaHardHat className="text-secondary shrink-0" size={14} />
                            ) : (
                              <FaUserCircle className="text-primary shrink-0" size={14} />
                            )}
                            <span className="flex-1 min-w-0">
                              <span className="block font-medium text-textDark text-sm truncate">{u.name}</span>
                              <span className="block text-xs text-textGray truncate">{u.email}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {results.services.length > 0 && (
                      <div>
                        <p className="px-3 pb-1 pt-2 text-xs font-bold text-textGray uppercase tracking-wide">التخصصات</p>
                        {results.services.map((s) => (
                          <button
                            key={s._id}
                            type="button"
                            onClick={goToService}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right hover:bg-neutral transition-colors"
                          >
                            <FaLayerGroup className="text-tertiary shrink-0" size={14} />
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

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/notifications')}
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
              onClick={() => setSupportOpen(true)}
              className="rounded-xl p-2.5 text-textGray hover:bg-neutral hover:text-primary transition-all"
              title="دعم الأدمن"
            >
              <FaQuestionCircle size={18} />
            </button>
            <div className="hidden h-6 w-px bg-borderGray sm:block" />
            <button
              type="button"
              onClick={() => navigate('/admin/profile')}
              className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-neutral transition-all"
            >
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'A')}&background=0F4C75&color=fff&bold=true`}
                alt={user?.name}
                className="h-8 w-8 rounded-full border-2 border-primary/20"
              />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-textDark leading-tight">{user?.name}</p>
                <p className="text-xs text-textGray">مدير النظام</p>
              </div>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside className={`
          fixed right-0 top-[65px] z-30 h-[calc(100vh-65px)] w-64 flex-col bg-white border-l border-borderGray/60 shadow-lg flex transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          lg:sticky lg:translate-x-0 lg:shadow-none lg:border-r-0 lg:border-l
        `}>
          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5 pt-4">
            {sidebarLinks.map(({ to, label, icon: Icon, isSupport }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/admin/dashboard'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-textGray hover:bg-neutral hover:text-textDark'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} className="shrink-0" />
                  <span>{label}</span>
                </div>
                {isSupport && supportUnread > 0 && (
                  <span className="rounded-full bg-emergency px-1.5 py-0.5 text-[11px] font-bold text-white min-w-[20px] text-center">
                    {supportUnread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="border-t border-borderGray/60 p-3 space-y-1">
            <button
              type="button"
              onClick={openBroadcast}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-secondary hover:bg-secondary/10 transition-all"
            >
              <FaBullhorn size={15} />
              نشر تنبيه عام
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/profile')}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-textGray hover:bg-neutral transition-all"
            >
              <FaCog size={15} />
              الإعدادات
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-emergency hover:bg-emergency/10 transition-all"
            >
              <FaSignOutAlt size={15} />
              تسجيل الخروج
            </button>
          </div>
        </aside>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main */}
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Support modal */}
      {supportOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-textDark">الدعم الفني</h3>
              <button type="button" onClick={() => setSupportOpen(false)} className="rounded-lg p-1.5 text-textGray hover:bg-neutral">
                <FaTimes size={16} />
              </button>
            </div>
            <p className="mb-5 text-sm text-textGray">
              لأي مشكلة تقنية أو استفسار بخصوص لوحة تحكم الأدمن، تقدر تتواصل مع فريق الدعم عبر:
            </p>
            <div className="space-y-3 text-sm">
              <a href="mailto:support@herfy.app" className="flex items-center gap-3 rounded-xl border border-borderGray px-4 py-3 hover:bg-neutral transition-colors">
                <FaEnvelope className="text-primary shrink-0" />
                support@herfy.app
              </a>
              <a href="tel:+201000000000" className="flex items-center gap-3 rounded-xl border border-borderGray px-4 py-3 hover:bg-neutral transition-colors">
                <FaPhoneAlt className="text-primary shrink-0" />
                +20 100 000 0000
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast modal */}
      {broadcastOpen && (
        <div className="modal-overlay">
          <div className="modal-card max-w-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-textDark">نشر تنبيه عام</h3>
              <button type="button" onClick={closeBroadcast} className="rounded-lg p-1.5 text-textGray hover:bg-neutral">
                <FaTimes size={16} />
              </button>
            </div>
            <p className="mb-4 text-sm text-textGray">
              هيتبعت إشعار فوري لكل المستخدمين المستهدفين — استخدمها للإعلانات المهمة فقط.
            </p>

            {broadcastResult && (
              <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
                broadcastResult.ok
                  ? 'bg-tertiary/10 text-tertiary border border-tertiary/20'
                  : 'bg-emergency/10 text-emergency border border-emergency/20'
              }`}>
                {broadcastResult.msg}
              </div>
            )}

            <form onSubmit={handleBroadcastSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-textDark">الفئة المستهدفة</label>
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
                      className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                        broadcastForm.audience === key
                          ? 'bg-primary text-white shadow-sm'
                          : 'border border-borderGray text-textGray hover:border-primary/40 hover:text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-textDark">العنوان</label>
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
                <label className="mb-2 block text-sm font-semibold text-textDark">نص التنبيه</label>
                <textarea
                  value={broadcastForm.body}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, body: e.target.value }))}
                  maxLength={500}
                  rows={4}
                  placeholder="اكتب رسالة التنبيه هنا..."
                  className="input-field resize-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeBroadcast} className="btn-outline text-sm py-2 px-4">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={broadcastSending || !broadcastForm.title.trim() || !broadcastForm.body.trim()}
                  className="btn-primary text-sm"
                >
                  <FaPaperPlane size={12} />
                  {broadcastSending ? 'جارِ الإرسال...' : 'نشر التنبيه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
