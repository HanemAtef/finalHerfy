/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0F4C75',      // أزرق داكن – عناوين، أزرار رئيسية
        secondary: '#F68B1E',    // برتقالي – أزرار ثانوية، أسعار
        tertiary: '#28A745',     // أخضر – علامة موثوق، نجاح
        emergency: '#EF4444',    // أحمر – طوارئ، أخطاء
        neutral: '#F8F9FA',      // رمادي فاتح – خلفيات بطاقات
        textDark: '#1F2937',     // رمادي غامق – نصوص أساسية
        textGray: '#6B7280',     // رمادي – نصوص ثانوية
        borderGray: '#D1D5DB',   // رمادي – حدود
        white: '#FFFFFF',        // أبيض – خلفيات
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'sans-serif'], // ✅ خط عربي
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '24px',
      },
      maxWidth: {
        'container-max': '1280px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(15, 76, 117, 0.08)',
      },
    },
  },
  plugins: [],
}