import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  FaSignOutAlt,
  FaUser,
  FaCalendarAlt,
  FaHeart,
  FaCog,
  FaCamera,
  FaArrowRight,
  FaFlag,
  FaExclamationTriangle,
  FaCheckCircle,
} from "react-icons/fa";
import { logoutUser, updateProfile } from "../../store/slices/authSlice";
import { getCustomerOrders } from "../../store/slices/orderSlice";
import PenaltySettlementModal from "../../components/customer/PenaltySettlementModal";
import { uploadService } from "../../services/api";
import {
  formatDate,
  formatPrice,
  ORDER_STATUS_LABELS,
  getDefaultAvatar,
} from "../../utils/helpers";
import ChangePasswordCard from "../../components/common/ChangePasswordCard";
import AlertMessage from "../../components/common/AlertMessage";

const sidebarItems = [
  { label: "معلومات الحساب", icon: FaUser, active: true },
  { label: "حجوزاتي", icon: FaCalendarAlt, to: "/customer/dashboard" },
  { label: "بلاغاتي", icon: FaFlag, to: "/customer/reports" },
  { label: "الحرفيين المحفوظين", icon: FaHeart },
  { label: "الإعدادات", icon: FaCog },
];

export default function CustomerProfilePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isLoading, error } = useSelector((state) => state.auth);
  const { orders } = useSelector((state) => state.orders);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({ name: "", phone: "" });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);

  useEffect(() => {
    if (user?._id) dispatch(getCustomerOrders(user._id));
  }, [dispatch, user?._id]);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || "", phone: user.phone || "" });
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSavedMsg("");
    const result = await dispatch(updateProfile(form));
    if (updateProfile.fulfilled.match(result)) {
      setSavedMsg("تم حفظ التغييرات بنجاح");
      setTimeout(() => setSavedMsg(""), 3000);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const res = await uploadService.uploadImage(file);
      await dispatch(updateProfile({ profileImage: res.data.url }));
    } catch {
      // updateProfile/upload error is surfaced through `error` from the auth slice
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar Profile Card */}
      <aside className="w-full shrink-0 lg:w-64 space-y-4">
        <div className="card text-center relative overflow-hidden">
          <div className="relative mx-auto mb-3 h-20 w-20">
            <img
              src={user?.profileImage || getDefaultAvatar(user?.name)}
              alt=""
              className="h-20 w-20 rounded-full object-cover border-2 border-primary/20 shadow-sm"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md hover:bg-primary/90 transition-transform active:scale-95"
              title="تغيير الصورة الشخصية"
            >
              {avatarUploading ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
              ) : (
                <FaCamera size={11} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <h3 className="font-bold text-textDark text-base">{user?.name}</h3>
          <p className="text-xs text-textGray mt-0.5 font-medium">عميل معتمد</p>
        </div>

        <nav className="card p-2 space-y-0.5">
          {sidebarItems.map(({ label, icon: Icon, active, to }) =>
            to ? (
              <Link
                key={label}
                to={to}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-textGray hover:bg-neutral hover:text-textDark transition-all"
              >
                <Icon size={14} className="shrink-0" /> {label}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-textGray hover:bg-neutral hover:text-textDark"
                }`}
              >
                <Icon size={14} className="shrink-0" /> {label}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => dispatch(logoutUser())}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-emergency hover:bg-emergency/10 transition-all mt-1"
          >
            <FaSignOutAlt size={14} /> تسجيل الخروج
          </button>
        </nav>
      </aside>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="flex-1 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
              aria-label="رجوع"
            >
              <FaArrowRight size={13} />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-textDark">
                الملف الشخصي
              </h1>
              <p className="text-xs text-textGray mt-0.5">تعديل بيانات الحساب وتحديث كلمة المرور</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary text-xs py-2.5 px-5 shadow-sm"
          >
            {isLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>

        {savedMsg && <AlertMessage type="success" message={savedMsg} />}
        {error && <AlertMessage type="error" message={error} />}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Account Details Card */}
          <div className="card lg:col-span-2 space-y-4">
            <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">البيانات الأساسية</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-textDark">
                  الاسم الكامل
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="اسمك الكامل"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-textDark">
                  رقم الهاتف
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-field"
                  placeholder="01xxxxxxxxx"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold text-textDark">
                  البريد الإلكتروني
                </label>
                <input
                  value={user?.email || ""}
                  className="input-field bg-neutral text-textGray cursor-not-allowed"
                  readOnly
                />
                <p className="mt-1 text-[11px] text-textGray">
                  البريد الإلكتروني هو المعرف الأساسي لحسابك ولا يمكن تعديله مباشرة
                </p>
              </div>
            </div>
          </div>

          {/* Activity & Stats Card */}
          <div className="card bg-primary text-white lg:col-span-1 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-base">ملخص النشاط</h3>
                <span className="inline-flex items-center gap-1.5 text-xs bg-white/10 px-2.5 py-1 rounded-full text-white/90">
                  <span className="h-2 w-2 rounded-full bg-tertiary" />
                  نشط
                </span>
              </div>

              <p className="text-xs text-white/80 leading-relaxed mb-4">
                أكملت <span className="font-bold text-white">{orders.filter((o) => o.status === "completed").length} طلبات</span> بنجاح على منصة حرفي.
              </p>

              <div className="space-y-2.5 text-xs border-t border-white/15 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/80">إجمالي الحجوزات:</span>
                  <span className="font-bold text-sm">{orders.length}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/80">المخالفات المسجلة:</span>
                  <span className="font-bold">{user?.penaltyCount || 0}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/80">الغرامات المستحقة:</span>
                  <span className={`font-bold ${user?.penaltyAmount > 0 ? 'text-secondary text-sm' : ''}`}>
                    {user?.penaltyAmount || 0} ج.م
                  </span>
                </div>
              </div>
            </div>

            {/* Penalty Warning in Profile */}
            {user?.penaltyAmount > 0 && (
              <div className="mt-4 rounded-2xl bg-secondary/20 p-3 border border-secondary/30">
                <div className="mb-1 flex items-center gap-1.5 text-secondary">
                  <FaExclamationTriangle size={13} />
                  <span className="text-xs font-bold">غرامة مستحقة</span>
                </div>
                <p className="text-[11px] text-white/90 mb-2.5">
                  لديك غرامة بقيمة {user.penaltyAmount} ج.م. يرجى تسويتها لتتمكن من إنشاء طلبات جديدة.
                </p>
                <button
                  type="button"
                  onClick={() => setShowPenaltyModal(true)}
                  className="w-full rounded-xl bg-secondary py-2 text-xs font-bold text-white shadow-sm hover:bg-secondary/90 transition-all"
                >
                  تسوية الغرامة الآن
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Change Password Card */}
        <ChangePasswordCard />

        {/* Recent Bookings in Profile */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-sm text-textDark">آخر الحجوزات</h3>
            <Link to="/customer/dashboard" className="text-xs font-semibold text-primary hover:underline">
              عرض كل الحجوزات ←
            </Link>
          </div>
          {orders.slice(0, 3).map((order) => (
            <div
              key={order._id}
              className="flex items-center justify-between border-b border-neutral py-3 last:border-0 text-xs"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-textDark text-sm truncate">{order.profession}</p>
                <p className="text-textGray mt-0.5">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="text-left shrink-0 pl-3">
                <p className="font-extrabold text-textDark text-sm">
                  {formatPrice(order.totalPrice || order.estimatedPrice)}
                </p>
                <span className="text-[11px] font-semibold text-tertiary">
                  {ORDER_STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="py-6 text-center text-xs text-textGray">
              لا توجد حجوزات مسجلة بعد
            </p>
          )}
        </div>
      </form>

      {/* Penalty Settlement Modal */}
      {showPenaltyModal && user?.penaltyAmount > 0 && (
        <PenaltySettlementModal
          penaltyAmount={user.penaltyAmount}
          penaltyCount={user.penaltyCount}
          onClose={() => setShowPenaltyModal(false)}
        />
      )}
    </div>
  );
}
