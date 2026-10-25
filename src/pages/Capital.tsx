import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { z } from 'zod';
import PageHeader from '../components/PageHeader';
import { Button, Card, ErrorText, Field, inputClass, Modal, Stat } from '../components/ui';
import { useCapitalFlows, useDeleteCapitalFlow, useSaveCapitalFlow } from '../data/capital';
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from '../lib/dates';
import { parseDecimal } from '../lib/fillMath';
import { d, formatUsdt, ZERO } from '../lib/money';
import type { CapitalFlowRow } from '../lib/types';

type FlowType = CapitalFlowRow['type'];

const schema = z.object({
  amount: z.string().refine((s) => parseDecimal(s)?.gt(0) ?? false, 'Enter an amount above 0'),
  occurredAt: z.string().min(1, 'Pick a date'),
  note: z.string(),
});
type FormValues = z.infer<typeof schema>;

function FlowForm({
  type,
  initial,
  onDone,
}: {
  type: FlowType;
  initial?: CapitalFlowRow;
  onDone: () => void;
}) {
  const save = useSaveCapitalFlow();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: initial ? d(initial.amount_usdt).toFixed() : '',
      occurredAt: toLocalInput(initial?.occurred_at ?? new Date()),
      note: initial?.note ?? '',
    },
  });

  async function submit(v: FormValues) {
    await save.mutateAsync({
      id: initial?.id,
      draft: {
        type,
        amount_usdt: parseDecimal(v.amount)!.toDecimalPlaces(8).toFixed(),
        occurred_at: fromLocalInput(v.occurredAt),
        note: v.note.trim() || null,
      },
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <Field label="Amount (USDT)" error={errors.amount?.message}>
        <input inputMode="decimal" autoFocus className={inputClass} {...register('amount')} />
      </Field>
      <Field label="Date" error={errors.occurredAt?.message}>
        <input type="datetime-local" className={inputClass} {...register('occurredAt')} />
      </Field>
      <Field label="Note">
        <input className={inputClass} placeholder="optional" {...register('note')} />
      </Field>
      <ErrorText error={save.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

type Editing = { type: FlowType; row?: CapitalFlowRow } | null;

export default function Capital() {
  const flows = useCapitalFlows();
  const del = useDeleteCapitalFlow();
  const [editing, setEditing] = useState<Editing>(null);

  const { deposits, withdrawals, chart } = useMemo(() => {
    let dep = ZERO;
    let wd = ZERO;
    const points: { date: string; net: number }[] = [];
    for (const f of flows.data ?? []) {
      if (f.type === 'deposit') dep = dep.plus(f.amount_usdt);
      else wd = wd.plus(f.amount_usdt);
      points.push({ date: formatDate(f.occurred_at), net: dep.minus(wd).toNumber() });
    }
    return { deposits: dep, withdrawals: wd, chart: points };
  }, [flows.data]);

  const rows = [...(flows.data ?? [])].reverse();

  return (
    <>
      <PageHeader
        title="Capital"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setEditing({ type: 'withdrawal' })}>Withdraw</Button>
            <Button variant="primary" onClick={() => setEditing({ type: 'deposit' })}>
              Add investment
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        <Card className="grid grid-cols-3 gap-4">
          <Stat label="Net invested">{formatUsdt(deposits.minus(withdrawals))}</Stat>
          <Stat label="Deposits">{formatUsdt(deposits)}</Stat>
          <Stat label="Withdrawals">{formatUsdt(withdrawals)}</Stat>
        </Card>

        {chart.length > 1 && (
          <Card>
            <h2 className="text-sm font-medium mb-3">Net invested over time</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => [`${formatUsdt(v)} USDT`, 'Net invested']}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="net"
                    stroke="var(--color-accent)"
                    fill="var(--color-accent)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card className="p-0">
          {flows.isLoading && <p className="p-4 text-sm text-muted">Loading…</p>}
          <ErrorText error={flows.error} />
          {flows.data?.length === 0 && (
            <p className="p-4 text-sm text-muted">
              No deposits yet. Add the USDT you put into Binance.
            </p>
          )}
          <ul className="divide-y divide-border">
            {rows.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-medium tabular-nums ${f.type === 'deposit' ? 'text-profit' : 'text-loss'}`}
                  >
                    {f.type === 'deposit' ? '+' : '−'}
                    {formatUsdt(f.amount_usdt)} USDT
                  </div>
                  <div className="text-xs text-muted truncate">
                    {formatDateTime(f.occurred_at)}
                    {f.note && ` · ${f.note}`}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setEditing({ type: f.type, row: f })}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm(`Delete this ${f.type}?`)) del.mutate(f.id);
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
          <ErrorText error={del.error} />
        </Card>
      </div>

      <Modal
        open={editing !== null}
        title={editing?.type === 'withdrawal' ? 'Withdraw' : 'Add investment'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <FlowForm type={editing.type} initial={editing.row} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}
