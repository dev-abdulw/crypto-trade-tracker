import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { d, formatPct, formatUsdt, type Value } from '../lib/money';

export const inputClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-border hover:bg-card',
  danger: 'border border-loss/40 text-loss hover:bg-loss/10',
  ghost: 'text-muted hover:text-fg',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="text-xs text-loss">{error}</span>
      ) : (
        hint && <span className="text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      {children}
    </section>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-border bg-card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function pnlColor(v: Value | null | undefined): string {
  if (v === null || v === undefined) return 'text-muted';
  const n = d(v);
  return n.gt(0) ? 'text-profit' : n.lt(0) ? 'text-loss' : 'text-muted';
}

/** Signed USDT amount colored green/red, with optional percent. */
export function Pnl({
  value,
  pct,
  className = '',
}: {
  value: Value | null | undefined;
  pct?: Value | null;
  className?: string;
}) {
  return (
    <span className={`${pnlColor(value)} ${className}`}>
      {formatUsdt(value, { sign: true })}
      {pct !== undefined && pct !== null && (
        <span className="ml-1 text-xs opacity-80">({formatPct(pct)})</span>
      )}
    </span>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{children}</div>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <p className="text-sm text-loss">{message}</p>;
}

export function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        status === 'open' ? 'bg-accent/15 text-accent' : 'bg-border text-muted'
      }`}
    >
      {status}
    </span>
  );
}
