import { useRef, useEffect } from "react";
import tt from "@tomtom-international/web-sdk-maps";
import "@tomtom-international/web-sdk-maps/dist/maps.css";

export default function TrackingMap({
  customerLocation,
  handymanLocation,
  center,
  zoom = 13,
  className = "h-full w-full",
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  // ✅ تهيئة الخريطة
  useEffect(() => {
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
    if (!apiKey || !mapRef.current) return;

    // ✅ استخدام موقع افتراضي
    const defaultCenter =
      center ||
      (customerLocation?.latitude && customerLocation?.longitude
        ? [customerLocation.longitude, customerLocation.latitude]
        : [31.2357, 30.0444]);

    mapInstance.current = tt.map({
      key: apiKey,
      container: mapRef.current,
      center: defaultCenter,
      zoom,
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // ✅ تحديث الماركرز
  useEffect(() => {
    if (!mapInstance.current) return;

    // ✅ مسح الماركرز القديمة
    markersRef.current.forEach((m) => {
      try {
        m.remove();
      } catch (e) {}
    });
    markersRef.current = [];

    // ✅ إضافة موقع العميل (مع التحقق القوي)
    if (
      customerLocation &&
      typeof customerLocation.latitude === "number" &&
      typeof customerLocation.longitude === "number"
    ) {
      try {
        const marker = new tt.Marker({ color: "#0F4C75" })
          .setLngLat([customerLocation.longitude, customerLocation.latitude])
          .addTo(mapInstance.current);
        markersRef.current.push(marker);
      } catch (error) {
        console.warn("Could not add customer marker:", error);
      }
    }

    // ✅ إضافة موقع الحرفي (مع التحقق القوي)
    if (
      handymanLocation &&
      typeof handymanLocation.latitude === "number" &&
      typeof handymanLocation.longitude === "number"
    ) {
      try {
        const marker = new tt.Marker({ color: "#28A745" })
          .setLngLat([handymanLocation.longitude, handymanLocation.latitude])
          .addTo(mapInstance.current);
        markersRef.current.push(marker);
      } catch (error) {
        console.warn("Could not add handyman marker:", error);
      }
    }

    // ✅ تعديل حدود الخريطة
    if (
      customerLocation &&
      handymanLocation &&
      typeof customerLocation.latitude === "number" &&
      typeof customerLocation.longitude === "number" &&
      typeof handymanLocation.latitude === "number" &&
      typeof handymanLocation.longitude === "number"
    ) {
      try {
        const bounds = new tt.LngLatBounds();
        bounds.extend([customerLocation.longitude, customerLocation.latitude]);
        bounds.extend([handymanLocation.longitude, handymanLocation.latitude]);
        mapInstance.current.fitBounds(bounds, { padding: 60 });
      } catch (error) {
        console.warn("Could not fit bounds:", error);
      }
    }
  }, [customerLocation, handymanLocation]);

  if (!import.meta.env.VITE_TOMTOM_API_KEY) {
    return (
      <div
        className={`flex items-center justify-center bg-neutral ${className}`}
      >
        <div className="text-center p-6">
          <p className="text-primary font-bold mb-2">خريطة التتبع</p>
          <p className="text-sm text-textGray">
            أضف VITE_TOMTOM_API_KEY في ملف .env
          </p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}
