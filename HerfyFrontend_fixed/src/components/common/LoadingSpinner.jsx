export default function LoadingSpinner({ fullScreen = false, text = 'جاري التحميل...' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 animate-fade-in ${
        fullScreen ? 'min-h-screen' : 'py-12'
      }`}
    >
      <div className="relative flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary/20 border-t-primary" />
        <div className="absolute h-5 w-5 rounded-full bg-primary/10" />
      </div>
      {text && <p className="text-xs font-semibold text-textGray tracking-wide">{text}</p>}
    </div>
  );
}
