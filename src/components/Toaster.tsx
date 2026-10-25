import { useSyncExternalStore } from 'react';
import { dismissToast, getToasts, subscribeToasts } from '../lib/toast';

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 md:bottom-4 z-40 flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg bg-card ${
            t.kind === 'error' ? 'border-loss/50' : 'border-profit/50'
          }`}
        >
          <span className={t.kind === 'error' ? 'text-loss' : 'text-profit'} aria-hidden>
            {t.kind === 'error' ? '!' : '✓'}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="text-muted hover:text-fg"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
