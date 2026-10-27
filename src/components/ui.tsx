import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { d, formatPct, formatUsdt, type Value } from '../lib/money';

export const inputClass =
  'w-full rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/15 disabled:opacity-60';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Primary (gold) button look, for links styled as buttons. */
export const primaryLinkClass =
  'inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-accent-strong to-accent px-3.5 py-2 text-sm font-medium text-on-accent shadow-[0_6px_20px_-8px_rgb(212_175_106/0.6)] transition-all hover:brightness-110 active:scale-[0.98]';

/** Secondary button look, for links styled as buttons. */
export const secondaryLinkClass =
  'inline-flex items-center gap-1.5 rounded-xl border border-border bg-card-2/60 px-3.5 py-2 text-sm font-medium transition-all hover:border-accent/40';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-accent-strong to-accent text-on-accent shadow-[0_6px_20px_-8px_rgb(212_175_106/0.6)] hover:brightness-110',
  secondary: 'border border-border bg-card-2/60 hover:border-accent/40 hover:text-fg',
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
      className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${buttonVariants[variant]} ${className}`}
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
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
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
    <section className={`card-premium rounded-2xl border border-border/80 p-4 sm:p-5 ${className}`}>
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
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card-premium w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg">{title}</h2>
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
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{children}</div>
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
        status === 'open'
          ? 'bg-accent/12 text-accent ring-1 ring-accent/25'
          : 'bg-card-2 text-muted ring-1 ring-border'
      }`}
    >
      {status}
    </span>
  );
}

/** Large serif headline number with a label and optional change line underneath. */
export function Hero({
  label,
  value,
  sub,
  aside,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-accent/15 card-premium px-5 py-6 sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -top-24 right-0 h-48 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            {label}
          </div>
          <div className="mt-2 font-display text-4xl sm:text-5xl text-gold leading-none">
            {value}
          </div>
          {sub && <div className="mt-3 text-sm tabular-nums">{sub}</div>}
        </div>
        {aside}
      </div>
      <div className="gold-rule mt-6" />
    </section>
  );
}

/** Pill-style segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex gap-1 rounded-full border border-border bg-card/80 p-1 text-sm ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 font-medium transition-all ${
            value === o.value
              ? 'bg-gradient-to-b from-accent-strong to-accent text-on-accent shadow-[0_4px_14px_-6px_rgb(212_175_106/0.7)]'
              : 'text-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
