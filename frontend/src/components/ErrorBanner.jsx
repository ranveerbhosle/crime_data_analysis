export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-red-500/20 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30"
        >
          Retry
        </button>
      )}
    </div>
  );
}
