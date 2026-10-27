import { useState } from 'react';
import { useSaveMeezanEntry } from '../data/meezan';
import { fromLocalInput, toLocalInput } from '../lib/dates';
import { parseDecimal } from '../lib/fillMath';
import { MEEZAN_FUNDS, MEEZAN_OWNERS, type MeezanFund, type MeezanKind } from '../lib/meezan';
import { d, formatLakh, formatRs } from '../lib/money';
import type { MeezanEntryRow } from '../lib/types';
import { Button, ErrorText, Field, inputClass } from './ui';

const LAST_KEY = 'ctt.meezanLast';

function lastUsed(): { owner: string; fund: MeezanFund } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
    if (v?.owner && v?.fund) return v;
  } catch {
    // ignore
  }
  return { owner: 'me', fund: 'MIACF' };
}

const KIND_LABEL: Record<MeezanKind, string> = {
  deposit: 'Add investment',
  valuation: 'Update balance',
  withdrawal: 'Withdraw',
};

export default function MeezanEntryForm({
  kind: initialKind,
  initial,
  defaults,
  onDone,
}: {
  kind: MeezanKind;
  initial?: MeezanEntryRow;
  /** Pre-select a holding (e.g. when opened from that holding's row). */
  defaults?: { owner: string; fund: MeezanFund };
  onDone: () => void;
}) {
  const save = useSaveMeezanEntry();
  const start = initial ?? defaults ?? lastUsed();
  const [kind, setKind] = useState<MeezanKind>(initial?.kind ?? initialKind);
  const [owner, setOwner] = useState(start.owner);
  const [fund, setFund] = useState<MeezanFund>(start.fund as MeezanFund);
  const [amount, setAmount] = useState(initial ? d(initial.amount_pkr).toFixed() : '');
  const [when, setWhen] = useState(toLocalInput(initial?.occurred_at ?? new Date()));
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const value = parseDecimal(amount);

  async function submit() {
    setError(null);
    if (!value || value.lte(0)) return setError('Enter an amount above 0');
    await save.mutateAsync({
      id: initial?.id,
      draft: {
        owner,
        fund,
        kind,
        amount_pkr: value.toDecimalPlaces(2).toFixed(),
        occurred_at: fromLocalInput(when),
        note: note.trim() || null,
      },
    });
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ owner, fund }));
    } catch {
      // ignore
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md bg-surface p-1 text-xs">
        {(['deposit', 'valuation', 'withdrawal'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 rounded px-2 py-1.5 ${kind === k ? 'bg-card text-fg' : 'text-muted'}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Whose">
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
            {MEEZAN_OWNERS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fund">
          <select
            value={fund}
            onChange={(e) => setFund(e.target.value as MeezanFund)}
            className={inputClass}
          >
            {MEEZAN_FUNDS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label={kind === 'valuation' ? 'Balance shown in the Al Meezan app (Rs)' : 'Amount (Rs)'}
        hint={
          value && value.gt(0)
            ? `${formatRs(value)} · ${formatLakh(value)}`
            : kind === 'valuation'
              ? 'The total, including today’s profit'
              : undefined
        }
      >
        <input
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Date & time"
          hint={kind === 'deposit' ? 'Profit starts the next day' : undefined}
        >
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Note">
          <input
            placeholder="optional"
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
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
