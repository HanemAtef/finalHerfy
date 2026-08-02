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
} from "react-icons/fa";
import { logoutUser, updateProfile } from "../../store/slices/authSlice";
import { getCustomerOrders } from "../../store/slices/orderSlice";
import { uploadService } from "../../services/api";
import {
  formatDate,
  formatPrice,
  ORDER_STATUS_LABELS,
  getDefaultAvatar,
} from "../../utils/helpers";

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
  const { isLoading, error } = useSelector((state) => state.auth);
  const { orders } = useSelector((state) => state.orders);
  const fileInputRef = useRef(null);
  const { user } = useSelector((state) => state.auth);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

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
      {/* <div>
        {user.map((item) => (
          <h1>{item.penaltyAmount}</h1>
        ))}
      </div> */}
      <aside className="w-full shrink-0 lg:w-64">
        <div className="card mb-4 text-center">
          <div className="relative mx-auto mb-3 h-20 w-20">
            <img
              src={user?.profileImage || getDefaultAvatar(user?.name)}
              alt=""
              className="h-20 w-20 rounded-full object-cover"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow"
              title="تغيير الصورة الشخصية"
            >
              <FaCamera size={12} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <h3 className="font-bold text-textDark">{user?.name}</h3>
          <p className="text-sm text-textGray">عميل مميز</p>
        </div>
        <nav className="card space-y-1 p-2">
          {sidebarItems.map(({ label, icon: Icon, active, to }) =>
            to ? (
              <Link
                key={label}
                to={to}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-textGray hover:bg-neutral"
              >
                <Icon size={16} /> {label}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                  active
                    ? "border-r-4 border-primary bg-primary/5 text-primary font-medium"
                    : "text-textGray"
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => dispatch(logoutUser())}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-emergency"
          >
            <FaSignOutAlt size={16} /> تسجيل الخروج
          </button>
        </nav>
      </aside>

      <form onSubmit={handleSave} className="flex-1">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-full p-2 text-primary hover:bg-primary/5"
              aria-label="رجوع"
            >
              <FaArrowRight />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-textDark">
                إعدادات الملف الشخصي
              </h1>
              <p className="text-sm text-textGray">إدارة معلومات حسابك</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary text-sm"
          >
            {isLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>

        {savedMsg && (
          <div className="mb-4 rounded-lg bg-tertiary/10 px-4 py-3 text-sm text-tertiary">
            {savedMsg}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card lg:col-span-2">
            <div className="grid items-center gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-bold">
                  رقم الهاتف
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">
                  الاسم الكامل
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-bold">
                  البريد الإلكتروني
                </label>
                <input
                  value={user?.email || ""}
                  className="input-field"
                  readOnly
                />
                <p className="mt-1 text-xs text-textGray">
                  لا يمكن تغيير البريد الإلكتروني
                </p>
              </div>
            </div>
          </div>

          <div className="card bg-primary text-white lg:col-span-1">
            <h3 className="font-bold mb-2">ملخص النشاط</h3>
            <p className="text-sm opacity-80 mb-4">
              لقد قمت بإنجاز{" "}
              {orders.filter((o) => o.status === "completed").length} مهمة مع
              حرفينا.
            </p>
         

<div className="space-y-3 text-sm">

  {/* Total Orders */}
  <div className="flex items-center justify-between border-t border-white/20 pt-3">
    <span className="text-gray-300">إجمالي الحجوزات</span>
    <span className="font-bold text-white">{orders.length}</span>
  </div>

  {/* Penalty Count */}
  <div className="flex items-center justify-between border-t border-white/20 pt-3">
    <span className="text-gray-300">عدد المخالفات</span>
    <span
      className={`font-bold ${
        user?.penaltyCount > 0 ? "text-red-400" : "text-green-400"
      }`}
    >
      {user?.penaltyCount || 0}
    </span>
  </div>

  {/* Penalty Amount */}
  <div className="flex items-center justify-between border-t border-white/20 pt-3">
    <span className="text-gray-300">قيمة الغرامات</span>
    <span className="font-bold text-yellow-400">
      {user?.penaltyAmount || 0} EGP
    </span>
  </div>

  {/* Status */}
  <div className="flex items-center justify-between border-t border-white/20 pt-3">
    <span className="text-gray-300">الحالة</span>
    <span className="flex items-center gap-2 font-bold text-green-400">
      <span className="h-2 w-2 rounded-full bg-green-400" />
      عميل نشط
    </span>
  </div>

</div>
          </div>
        </div>

        <div className="card mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">آخر الحجوزات</h3>
            <Link to="/customer/dashboard" className="text-sm text-primary">
              عرض الكل ←
            </Link>
          </div>
          {orders.slice(0, 2).map((order) => (
            <div
              key={order._id}
              className="flex items-center gap-4 border-b border-borderGray py-3 last:border-0"
            >
              <div className="flex-1">
                <p className="font-medium">{order.profession}</p>
                <p className="text-xs text-textGray">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <p className="font-bold">
                {formatPrice(order.totalPrice || order.estimatedPrice)}
              </p>
              <span className="text-xs text-tertiary">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
                {/* <h3>Penalty Count: {user?.penaltyCount}</h3> */}
            </div>
          ))}
          {orders.length === 0 && (
            <p className="py-4 text-center text-sm text-textGray">
              لا توجد حجوزات بعد
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
