import { useState } from 'react';
import { useSaveAdjustment } from '../data/adjustments';
import { adjustmentFor } from '../lib/adjustments';
import { fromLocalInput, toLocalInput } from '../lib/dates';
import { parseDecimal } from '../lib/fillMath';
import { d, formatPct, formatUsdt, type Decimal } from '../lib/money';
import type { BalanceAdjustmentRow } from '../lib/types';
import { Button, ErrorText, Field, inputClass, Pnl } from './ui';

type Target = 'portfolio' | 'cash';

/**
 * New adjustment: the user types their real balance and the difference is saved as a gain/loss.
 * Editing an existing adjustment changes its amount directly.
 */
export default function AdjustBalanceForm({
  portfolioValue,
  cashUsdt,
  initial,
  onDone,
}: {
  portfolioValue: Decimal;
  cashUsdt: Decimal;
  initial?: BalanceAdjustmentRow;
  onDone: () => void;
}) {
  const save = useSaveAdjustment();
  const [target, setTarget] = useState<Target>('portfolio');
  const current = target === 'portfolio' ? portfolioValue : cashUsdt;
  const [actual, setActual] = useState(current.toDecimalPlaces(2).toFixed());
  const [amount, setAmount] = useState(initial ? d(initial.amount_usdt).toFixed() : '');
  const [when, setWhen] = useState(toLocalInput(initial?.occurred_at ?? new Date()));
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const typed = parseDecimal(initial ? amount : actual);
  const change = initial
    ? typed && { amount: typed.toDecimalPlaces(8), pct: null }
    : typed && adjustmentFor(typed, current);

  function switchTarget(t: Target) {
    setTarget(t);
    setActual((t === 'portfolio' ? portfolioValue : cashUsdt).toDecimalPlaces(2).toFixed());
  }

  async function submit() {
    setError(null);
    if (!typed || !change) return setError('Enter a number');
    if (!initial && typed.lt(0)) return setError('A balance cannot be negative');
    if (change.amount.isZero()) return setError('That matches the app already — nothing to adjust');
    await save.mutateAsync({
      id: initial?.id,
      draft: {
        amount_usdt: change.amount.toFixed(),
        ...(initial
          ? {}
          : {
              basis_usdt: portfolioValue.gt(0) ? portfolioValue.toDecimalPlaces(8).toFixed() : null,
            }),
        occurred_at: fromLocalInput(when),
        note: note.trim() || null,
      },
    });
    onDone();
  }

  return (
    <div className="space-y-4">
      {!initial && (
        <>
          <p className="text-sm text-muted">
            Type what Binance actually shows. The difference is recorded as a gain or loss (not a
            deposit or withdrawal).
          </p>
          <div className="flex gap-1 rounded-md bg-surface p-1 text-xs">
            {(
              [
                ['portfolio', `Total portfolio · app: ${formatUsdt(portfolioValue)}`],
                ['cash', `Free USDT · app: ${formatUsdt(cashUsdt)}`],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTarget(t)}
                className={`flex-1 rounded px-2 py-1.5 ${target === t ? 'bg-card text-fg' : 'text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Field
            label={target === 'portfolio' ? 'Actual portfolio value (USDT)' : 'Actual free USDT'}
          >
            <input
              inputMode="decimal"
              autoFocus
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className={inputClass}
            />
          </Field>
        </>
      )}

      {initial && (
        <Field label="Adjustment (USDT, − for a loss)">
          <input
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      <div className="rounded-md bg-surface px-3 py-2 text-sm">
        <span className="text-muted">Change: </span>
        {change && !change.amount.isZero() ? (
          <Pnl value={change.amount} pct={change.pct} />
        ) : (
          <span className="text-muted">none</span>
        )}
        {!initial && change?.pct && (
          <div className="text-xs text-muted mt-0.5">
            {formatUsdt(current)} → {formatUsdt(typed)} ({formatPct(change.pct)})
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Note">
          <input
            placeholder="e.g. fees, dust"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {error && <p className="text-sm text-loss">{error}</p>}
      <ErrorText error={save.error} />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save adjustment'}
        </Button>
      </div>
    </div>
  );
}
