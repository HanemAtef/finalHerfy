import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  FaSearch,
  FaMapMarkerAlt,
  FaStar,
  FaWrench,
  FaBolt,
  FaHammer,
  FaPaintRoller,
  FaTools,
  FaArrowRight,
  FaMap,
  FaSnowflake,
  FaTv,
  FaFireAlt,
  FaDoorOpen,
  FaSatelliteDish,
  FaVideo,
  FaThLarge,
  FaBrush,
  FaShieldAlt,
  FaBroom,
  FaFilter,
} from "react-icons/fa";
import { handymanService } from "../../services/api";
import { fetchCurrentLocation } from "../../store/slices/locationSlice";
import VerifiedBadge from "../../components/common/VerifiedBadge";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import LocationPermissionModal from "../../components/common/LocationPermissionModal";
import LocationLabel from "../../components/common/LocationLabel";
import {
  haversineDistance,
  formatDistance,
  getDefaultAvatar,
  formatPrice,
} from "../../utils/helpers";
import { PROFESSIONS } from "../../utils/constants";

const SERVICE_ICONS = {
  سباك: FaWrench,
  كهربائي: FaBolt,
  نجار: FaHammer,
  نقاش: FaPaintRoller,
  'فني تكييف': FaSnowflake,
  'أجهزة منزلية': FaTv,
  حداد: FaFireAlt,
  'ألوميتال وزجاج': FaDoorOpen,
  'دش وستالايت': FaSatelliteDish,
  'كاميرات وشبكات': FaVideo,
  'سيراميك وأرضيات': FaThLarge,
  'جبس بورد وديكور': FaBrush,
  'عزل وأسطح': FaShieldAlt,
  'تنظيف وصيانة': FaBroom,
  ميكانيكي: FaTools,
  سمكري: FaWrench,
};

const FILTERS = [
  { key: "distance", label: "الأقرب", icon: FaMapMarkerAlt },
  { key: "rating", label: "الأعلى تقييماً", icon: FaStar },
  { key: "price", label: "الأقل سعراً", icon: FaStar },
];

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 17) return "مساء الخير";
  return "مساء الخير";
};

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [handymen, setHandymen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("distance");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [dismissedModal, setDismissedModal] = useState(false);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const {
    latitude,
    longitude,
    status: locationStatus,
  } = useSelector((state) => state.location);
  const location = latitude != null ? { latitude, longitude } : null;
  const showLocationModal = locationStatus === "denied" && !dismissedModal;

  const loadHandymen = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const params = {
        lat: location.latitude,
        lng: location.longitude,
        sort: sort === "distance" ? undefined : sort,
      };
      const { data } = await handymanService.getNearby(params);
      let list = data.handymen || [];

      list = list.map((h, i) => {
        const coords = h.location?.coordinates || [0, 0];
        const dist =
          h.distance ??
          haversineDistance(
            location.latitude,
            location.longitude,
            coords[1],
            coords[0],
          );
        return { ...h, distance: dist, imageIndex: i };
      });

      if (sort === "distance") list.sort((a, b) => a.distance - b.distance);
      if (sort === "price") list.sort((a, b) => a.price - b.price);

      setHandymen(list);
    } catch {
      setHandymen([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    if (!location) return;
    loadHandymen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude, sort]);

  const filtered = handymen.filter(
    (h) =>
      !search || h.name?.includes(search) || h.profession?.includes(search),
  );

  const handleAllowLocation = () => {
    dispatch(fetchCurrentLocation());
  };

  return (
    <>
      {showLocationModal && (
        <LocationPermissionModal
          onAllow={handleAllowLocation}
          onDismiss={() => setDismissedModal(true)}
        />
      )}

      {/* Hero Banner */}
      <div className="mb-8 overflow-hidden rounded-2xl bg-primary px-6 py-8 text-white sm:px-10 relative">
        {/* Subtle decorative element */}
        <div className="absolute left-0 bottom-0 w-64 h-64 rounded-full bg-white/5 -translate-x-1/2 translate-y-1/2 pointer-events-none" />
        <div className="absolute right-0 top-0 w-48 h-48 rounded-full bg-white/5 translate-x-1/4 -translate-y-1/4 pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/80 hover:bg-white/25 hover:text-white transition-all"
            >
              <FaArrowRight size={14} />
            </button>
            <Link
              to="/customer/map"
              className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold hover:bg-white/25 transition-all"
            >
              <FaMap size={11} /> عرض على الخريطة
            </Link>
          </div>

          <p className="mb-1 text-sm font-medium text-white/75">
            {greeting()}{user?.name ? `، ${user.name.split(" ")[0]}` : ""}
          </p>
          <h1 className="mb-5 text-2xl font-bold sm:text-3xl">
            ماذا تحتاج اليوم؟
          </h1>

          <form
            onSubmit={(e) => e.preventDefault()}
            className="relative mx-auto max-w-xl"
          >
            <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-textGray" size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن سباك، كهربائي، نجار..."
              className="w-full rounded-2xl border-0 py-3.5 pr-12 pl-5 text-textDark shadow-xl focus:outline-none focus:ring-2 focus:ring-secondary/60 text-sm font-medium"
            />
          </form>
        </div>
      </div>

      {/* Popular Services */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-textDark">الخدمات الشائعة</h2>
          <button type="button" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            عرض الكل ←
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PROFESSIONS.map((prof) => {
            const Icon = SERVICE_ICONS[prof] || FaWrench;
            const isActive = search === prof;
            return (
              <button
                key={prof}
                type="button"
                onClick={() => setSearch(prof === search ? "" : prof)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all duration-200 ${
                  isActive
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-neutral bg-white hover:border-primary/30 hover:shadow-sm"
                }`}
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                  isActive ? "bg-primary text-white" : "bg-primary/10 text-primary"
                }`}>
                  <Icon size={18} />
                </div>
                <span className={`text-xs font-semibold leading-tight ${isActive ? "text-primary" : "text-textDark"}`}>
                  {prof}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Nearby Handymen */}
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-textDark">
              أقرب الحرفيين منك
            </h2>
            <p className="mt-0.5 text-sm text-textGray">
              بناءً على موقعك الحالي{" "}
              {location ? (
                <>في <LocationLabel
                  lat={location.latitude}
                  lng={location.longitude}
                  icon={false}
                  className="font-medium text-textDark"
                /></>
              ) : (
                "في منطقتك"
              )}
            </p>
          </div>

          {/* Sort filters */}
          <div className="flex items-center gap-2">
            <FaFilter size={12} className="text-textGray" />
            <div className="flex gap-1.5">
              {FILTERS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    sort === key
                      ? "bg-primary text-white shadow-sm"
                      : "border border-borderGray bg-white text-textGray hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  <Icon size={10} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading || locationStatus === "loading" ? (
          <div className="py-8">
            <LoadingSpinner text="جاري البحث عن الحرفيين..." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state py-16">
            <div className="empty-state-icon">🔍</div>
            <p className="empty-state-title">لا توجد نتائج</p>
            <p className="empty-state-desc">جرب البحث بكلمة مختلفة أو اختر خدمة أخرى</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((handyman) => (
              <div
                key={handyman.id || handyman._id}
                className="group overflow-hidden rounded-2xl border border-neutral bg-white shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
              >
                {/* Image area */}
                <div className="relative h-44 overflow-hidden bg-neutral/50">
                  <img
                    src={handyman.profileImage || getDefaultAvatar(handyman.name)}
                    alt={handyman.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                  {handyman.verified && (
                    <div className="absolute right-2.5 top-2.5">
                      <VerifiedBadge />
                    </div>
                  )}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold shadow-sm">
                    <FaStar className="text-secondary" size={10} />
                    {handyman.rating ? Number(handyman.rating).toFixed(1) : "0.0"}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-textDark truncate">
                        {handyman.name}
                      </h3>
                      <p className="text-xs text-textGray mt-0.5">
                        {handyman.profession}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 shrink-0 text-xs text-textGray">
                      <FaMapMarkerAlt size={10} className="text-primary/60" />
                      {formatDistance(handyman.distance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-textDark text-sm">
                        {formatPrice(handyman.price)}
                      </span>
                      <span className="text-xs font-normal text-textGray">
                        {" "}/ الساعة
                      </span>
                    </div>
                    <Link
                      to={`/customer/handyman/${handyman.id || handyman._id}`}
                      className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-white hover:bg-secondary/90 transition-all active:scale-95"
                    >
                      حجز الآن
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
