import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent/80">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
