import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
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
} from 'react-icons/fa';
import { handymanService } from '../../services/api';
import { fetchCurrentLocation } from '../../store/slices/locationSlice';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LocationPermissionModal from '../../components/common/LocationPermissionModal';
import LocationLabel from '../../components/common/LocationLabel';
import { haversineDistance, formatDistance, getHandymanImage, formatPrice } from '../../utils/helpers';
import { PROFESSIONS } from '../../utlis/constants';

const SERVICE_ICONS = {
  سباك: FaWrench,
  كهربائي: FaBolt,
  نجار: FaHammer,
  دهان: FaPaintRoller,
  ميكانيكي: FaTools,
  سمكري: FaWrench,
};

const FILTERS = [
  { key: 'distance', label: 'الأقرب', icon: FaMapMarkerAlt },
  { key: 'rating', label: 'الأعلى تقييماً', icon: FaStar },
  { key: 'price', label: 'الأقل سعراً', icon: FaStar },
];

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير';
  return 'مساء الخير';
};

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [handymen, setHandymen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('distance');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [dismissedModal, setDismissedModal] = useState(false);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { latitude, longitude, status: locationStatus } = useSelector((state) => state.location);
  const location = latitude != null ? { latitude, longitude } : null;
  // Only nag the customer with our own modal if geolocation truly failed —
  // while it's still loading (the very first time), just show a spinner.
  const showLocationModal = locationStatus === 'denied' && !dismissedModal;

  const loadHandymen = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const params = {
        lat: location.latitude,
        lng: location.longitude,
        sort: sort === 'distance' ? undefined : sort,
      };
      const { data } = await handymanService.getNearby(params);
      let list = data.handymen || [];

      list = list.map((h, i) => {
        const coords = h.location?.coordinates || [0, 0];
        const dist =
          h.distance ??
          haversineDistance(location.latitude, location.longitude, coords[1], coords[0]);
        return { ...h, distance: dist, imageIndex: i };
      });

      if (sort === 'distance') list.sort((a, b) => a.distance - b.distance);
      if (sort === 'price') list.sort((a, b) => a.price - b.price);

      setHandymen(list);
    } catch {
      setHandymen([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    if (!location) return;
    loadHandymen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude, sort]);

  const filtered = handymen.filter(
    (h) =>
      !search ||
      h.name?.includes(search) ||
      h.profession?.includes(search)
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

      <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-l from-primary to-primary/80 px-6 py-8 text-white sm:px-10">
        <div className="mb-1 flex items-center justify-between">
          <button type="button" onClick={() => navigate(-1)} className="text-white/80 hover:text-white">
            <FaArrowRight size={16} />
          </button>
          <Link
            to="/customer/map"
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
          >
            <FaMap size={11} /> عرض على الخريطة
          </Link>
        </div>
        <p className="mb-1 text-sm text-white/80">
          {greeting()}{user?.name ? `، ${user.name.split(' ')[0]}` : ''}
        </p>
        <h1 className="mb-5 text-xl font-bold sm:text-2xl">ماذا تحتاج اليوم؟</h1>
        <form onSubmit={(e) => e.preventDefault()} className="relative mx-auto max-w-xl">
          <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-textGray" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن سباك، كهربائي، نجار..."
            className="w-full rounded-full border-0 py-3 pr-11 pl-4 text-textDark shadow-lg focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </form>
      </div>

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-textDark">الخدمات الشائعة</h2>
          <button type="button" className="text-sm text-primary">عرض الكل ←</button>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PROFESSIONS.map((prof) => {
            const Icon = SERVICE_ICONS[prof] || FaWrench;
            return (
              <button
                key={prof}
                type="button"
                onClick={() => setSearch(prof)}
                className="card flex flex-col items-center gap-2 py-4 transition hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon size={20} />
                </div>
                <span className="text-xs font-medium">{prof}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-4">
        <h1 className="mb-1 text-2xl font-bold text-primary">أقرب الحرفيين منك</h1>
        <p className="mb-4 text-sm text-textGray">
          بناءً على موقعك الحالي في{' '}
          {location ? (
            <LocationLabel lat={location.latitude} lng={location.longitude} icon={false} className="font-medium text-textDark" />
          ) : (
            'منطقتك'
          )}
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                sort === key
                  ? 'bg-primary text-white'
                  : 'border border-borderGray bg-white text-textGray'
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {loading || locationStatus === 'loading' ? (
          <LoadingSpinner text="جاري البحث عن الحرفيين..." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((handyman, i) => (
              <div key={handyman.id || handyman._id} className="card overflow-hidden p-0 transition hover:shadow-md">
                <div className="relative h-40">
                  <img
                    src={getHandymanImage(handyman.imageIndex ?? i)}
                    alt={handyman.name}
                    className="h-full w-full object-cover"
                  />
                  {handyman.verified && (
                    <div className="absolute right-2 top-2">
                      <VerifiedBadge />
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-bold">
                    <FaStar className="text-secondary" size={10} />
                    {handyman.rating?.toFixed(1) || '4.5'}
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-primary">{handyman.name}</h3>
                      <p className="text-sm text-textGray">{handyman.profession}</p>
                    </div>
                    <span className="text-xs text-textGray">
                      {formatDistance(handyman.distance)} بعيد
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-textDark">
                      {formatPrice(handyman.price)} <span className="text-xs font-normal text-textGray">/ الساعة</span>
                    </span>
                    <Link
                      to={`/customer/handyman/${handyman.id || handyman._id}`}
                      className="rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-white hover:bg-secondary/90"
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
