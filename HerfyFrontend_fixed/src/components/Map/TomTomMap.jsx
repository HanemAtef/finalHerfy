import { useRef, useEffect, useState } from "react";
import tt from "@tomtom-international/web-sdk-maps";
import "@tomtom-international/web-sdk-maps/dist/maps.css";
import useCurrentLocation from "../../hooks/useCurrentLocation";
import { handymanService } from "../../services/api";
import { formatPrice, getDefaultAvatar } from "../../utils/helpers";

// Browse-nearby-craftsmen map. This component previously wasn't wired into
// any page at all (that's why "the map" appeared to be missing), and had
// two real bugs on top of that: it read `useCurrentLocation()` as if it
// returned the location directly (it returns { location, error, loading }),
// and it called a dead, hardcoded-localhost:3000 service file instead of
// the app's shared, authenticated `handymanService`.
const isValidCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

function TomTomMap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  const [nearbyHandymen, setNearbyHandymen] = useState([]);
  const [loading, setLoading] = useState(true);

  const { location } = useCurrentLocation();

  const validLat = location?.latitude;
  const validLng = location?.longitude;
  const hasValidLocation = isValidCoord(validLat, validLng);

  // Initialize the map once we have a location
  useEffect(() => {
    if (!hasValidLocation || mapInstance.current || !mapRef.current) return;

    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
    if (!apiKey) return;

    mapInstance.current = tt.map({
      key: apiKey,
      container: mapRef.current,
      center: [validLng, validLat],
      zoom: 13,
    });

    new tt.Marker({ color: "#0F4C75" })
      .setLngLat([validLng, validLat])
      .addTo(mapInstance.current);

    const loadHandymen = async () => {
      setLoading(true);
      try {
        const { data } = await handymanService.getNearby({
          lat: validLat,
          lng: validLng,
        });
        setNearbyHandymen(data.handymen || []);
      } catch (error) {
        console.error("Error loading handymen:", error);
        setNearbyHandymen([]);
      } finally {
        setLoading(false);
      }
    };

    loadHandymen();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [hasValidLocation, validLat, validLng]);

  // Update markers whenever nearbyHandymen changes
  useEffect(() => {
    if (!mapInstance.current) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    nearbyHandymen.forEach((handyman) => {
      const coords = handyman.location?.coordinates;
      if (!coords || coords.length < 2) return;
      const [longitude, latitude] = coords;
      if (!isValidCoord(latitude, longitude)) return;
      const id = handyman.id || handyman._id;

      const popup = new tt.Popup({ offset: 30 }).setHTML(`
        <div style="min-width:200px;font-family:inherit;direction:rtl;text-align:right;">
          <h3 style="margin:0 0 6px;color:#0F4C75;">${handyman.name}</h3>
          <p style="margin:2px 0;">${handyman.profession}</p>
          <p style="margin:2px 0;">⭐ ${handyman.rating ?? '—'}</p>
          <p style="margin:2px 0;">${formatPrice(handyman.price)}</p>
          <p style="margin:2px 0;color:${handyman.isAvailable ? '#28A745' : '#EF4444'};">
            ${handyman.isAvailable ? 'متاح الآن' : 'غير متاح'}
          </p>
        </div>
      `);

      const marker = new tt.Marker({ color: "#F68B1E" })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(mapInstance.current);

      markersRef.current.push({ id, marker, popup });
    });
  }, [nearbyHandymen]);

  const flyToHandyman = (handyman) => {
    const coords = handyman.location?.coordinates;
    if (!coords || coords.length < 2 || !mapInstance.current) return;
    const [lng, lat] = coords;
    if (!isValidCoord(lat, lng)) return;
    const id = handyman.id || handyman._id;

    mapInstance.current.flyTo({ center: [lng, lat], zoom: 16 });

    const selected = markersRef.current.find((m) => m.id === id);
    selected?.popup.addTo(mapInstance.current);
  };

  if (!import.meta.env.VITE_TOMTOM_API_KEY) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral p-6 text-center">
        <div>
          <p className="mb-2 font-bold text-primary">خريطة الحرفيين القريبين</p>
          <p className="text-sm text-textGray">أضف VITE_TOMTOM_API_KEY في ملف .env</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col md:flex-row-reverse">
      <div ref={mapRef} className="h-72 w-full md:h-full md:flex-1" />

      <div className="w-full overflow-y-auto border-t border-borderGray bg-white p-4 md:h-full md:w-80 md:border-t-0 md:border-e">
        <h3 className="mb-3 font-bold text-textDark">
          الحرفيون القريبون {!loading && `(${nearbyHandymen.length})`}
        </h3>

        {loading ? (
          <p className="py-6 text-center text-sm text-textGray">جاري تحميل الحرفيين القريبين...</p>
        ) : nearbyHandymen.length === 0 ? (
          <p className="py-6 text-center text-sm text-textGray">لا يوجد حرفيون قريبون حالياً</p>
        ) : (
          <div className="space-y-3">
            {nearbyHandymen.map((handyman) => (
              <button
                key={handyman.id || handyman._id}
                type="button"
                onClick={() => flyToHandyman(handyman)}
                className="flex w-full items-center gap-3 rounded-xl border border-borderGray p-3 text-right transition hover:border-primary hover:shadow-sm"
              >
                <img src={getDefaultAvatar(handyman.name)} alt="" className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-textDark">{handyman.name}</p>
                  <p className="truncate text-xs text-textGray">{handyman.profession} · {formatPrice(handyman.price)}</p>
                </div>
                <span className={`h-2 w-2 shrink-0 rounded-full ${handyman.isAvailable ? 'bg-tertiary' : 'bg-borderGray'}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TomTomMap;
