import type { ReactNode } from 'react';

export default function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      {actions}
    </div>
  );
}
