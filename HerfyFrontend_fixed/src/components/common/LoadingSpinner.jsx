export default function LoadingSpinner({ fullScreen = false, text = 'جاري التحميل...' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        fullScreen ? 'min-h-screen' : 'py-12'
      }`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-textGray">{text}</p>
    </div>
  );
}
