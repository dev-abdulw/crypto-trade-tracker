import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import { Button, Card, Field, inputClass } from '../components/ui';
import { downloadFile, exportBackup, importBackup } from '../data/backup';
import { useSettings } from '../data/settings';
import { usePortfolio } from '../data/trades';
import { useAdjustments } from '../data/adjustments';
import { useCapitalFlows } from '../data/capital';
import { parseBackup, toCsv } from '../lib/exporter';
import { parseDecimal } from '../lib/fillMath';
import { saveSettings, type AppSettings } from '../lib/settings';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      {children}
    </Card>
  );
}

function Preferences() {
  const current = useSettings();
  const [draft, setDraft] = useState<AppSettings>(current);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setDraft({ ...draft, [k]: v });
  const valid = (s: string) => {
    const n = parseDecimal(s);
    return n !== null && n.gte(0);
  };
  const ok = valid(draft.dustMinUsdt) && valid(draft.feeRatePct) && valid(draft.bnbFeeRatePct);
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  return (
    <Section title="Trading defaults">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default fee asset">
          <select
            value={draft.defaultFeeAsset}
            onChange={(e) =>
              set('defaultFeeAsset', e.target.value as AppSettings['defaultFeeAsset'])
            }
            className={inputClass}
          >
            <option value="USDT">USDT</option>
            <option value="BNB">BNB</option>
          </select>
        </Field>
        <Field label="Dust threshold (USDT)" hint="Leftovers worth less auto-close a position">
          <input
            inputMode="decimal"
            value={draft.dustMinUsdt}
            onChange={(e) => set('dustMinUsdt', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Fee rate (%)" hint="Binance default 0.1">
          <input
            inputMode="decimal"
            value={draft.feeRatePct}
            onChange={(e) => set('feeRatePct', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Fee rate with BNB (%)" hint="Binance default 0.075">
          <input
            inputMode="decimal"
            value={draft.bnbFeeRatePct}
            onChange={(e) => set('bnbFeeRatePct', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">
        Saved on this device. A new dust threshold is applied to a position's open/closed status the
        next time its fills change.
      </p>
      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft(current)}>
            Reset
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              saveSettings(draft);
              toast('Settings saved');
            }}
          >
            Save
          </Button>
        </div>
      )}
    </Section>
  );
}

function DataTools() {
  const qc = useQueryClient();
  const portfolio = usePortfolio();
  const flows = useCapitalFlows();
  const adjustments = useAdjustments();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = () => format(new Date(), 'yyyy-MM-dd');

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  const exportJson = () =>
    run('json', async () => {
      const backup = await exportBackup();
      downloadFile(
        `trade-tracker-backup-${stamp()}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      );
      toast(`Exported ${backup.positions.length} positions and ${backup.fills.length} fills`);
    });

  const exportFillsCsv = () => {
    const views = portfolio.data ?? [];
    const rows = views.flatMap((v) => v.fills.map((f) => ({ f, symbol: v.row.symbol })));
    const csv = toCsv(rows, [
      { header: 'executed_at', value: (r) => r.f.executed_at },
      { header: 'symbol', value: (r) => r.symbol },
      { header: 'side', value: (r) => r.f.side },
      { header: 'quantity', value: (r) => String(r.f.quantity) },
      { header: 'price_usdt', value: (r) => String(r.f.price_usdt) },
      { header: 'fee_amount', value: (r) => String(r.f.fee_amount) },
      { header: 'fee_asset', value: (r) => r.f.fee_asset },
      { header: 'fee_usdt', value: (r) => String(r.f.fee_usdt) },
      { header: 'position_id', value: (r) => r.f.position_id },
      { header: 'fill_id', value: (r) => r.f.id },
    ]);
    downloadFile(`fills-${stamp()}.csv`, csv, 'text/csv');
  };

  const exportPositionsCsv = () => {
    const csv = toCsv(portfolio.data ?? [], [
      { header: 'symbol', value: (v) => v.row.symbol },
      { header: 'status', value: (v) => v.row.status },
      { header: 'opened_at', value: (v) => v.row.opened_at },
      { header: 'closed_at', value: (v) => v.row.closed_at },
      { header: 'style', value: (v) => v.row.style },
      { header: 'setup', value: (v) => v.row.setup },
      { header: 'total_bought_qty', value: (v) => v.summary?.totalBoughtQty.toFixed() },
      {
        header: 'total_cost_usdt',
        value: (v) => v.summary?.totalCost.toDecimalPlaces(8).toFixed(),
      },
      { header: 'remaining_qty', value: (v) => v.summary?.remainingQty.toFixed() },
      {
        header: 'realized_pnl_usdt',
        value: (v) => v.summary?.realizedPnl.toDecimalPlaces(8).toFixed(),
      },
      {
        header: 'pnl_pct',
        value: (v) => v.summary?.pnlPct?.times(100).toDecimalPlaces(4).toFixed(),
      },
      { header: 'fees_usdt', value: (v) => v.summary?.feesUsdt.toDecimalPlaces(8).toFixed() },
      {
        header: 'holding_hours',
        value: (v) => (v.summary ? (v.summary.holdingTimeMs / 3.6e6).toFixed(2) : ''),
      },
      { header: 'notes', value: (v) => v.row.notes },
    ]);
    downloadFile(`positions-${stamp()}.csv`, csv, 'text/csv');
  };

  const exportCapitalCsv = () => {
    // Deposits/withdrawals plus balance adjustments (signed: + gain, − loss), oldest first.
    const rows = [
      ...(flows.data ?? []).map((f) => ({
        at: f.occurred_at,
        type: f.type,
        amount: String(f.amount_usdt),
        note: f.note,
      })),
      ...(adjustments.data ?? []).map((a) => ({
        at: a.occurred_at,
        type: 'adjustment',
        amount: String(a.amount_usdt),
        note: a.note,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const csv = toCsv(rows, [
      { header: 'occurred_at', value: (r) => r.at },
      { header: 'type', value: (r) => r.type },
      { header: 'amount_usdt', value: (r) => r.amount },
      { header: 'note', value: (r) => r.note },
    ]);
    downloadFile(`capital-${stamp()}.csv`, csv, 'text/csv');
  };

  const onImportFile = (file: File) =>
    run('import', async () => {
      const backup = parseBackup(await file.text());
      const ok = confirm(
        `Import ${backup.positions.length} positions, ${backup.fills.length} fills, ` +
          `${backup.capital_flows.length} capital entries and ${backup.balance_adjustments.length} ` +
          `adjustments from ${file.name}?\n\n` +
          'Rows already in your account with the same id are overwritten; nothing is deleted.',
      );
      if (!ok) return;
      const n = await importBackup(backup);
      await qc.invalidateQueries();
      toast(
        `Imported ${n.positions} positions, ${n.fills} fills, ${n.capital_flows} capital entries`,
      );
    });

  const loaded = !!portfolio.data && !!flows.data;

  return (
    <Section title="Your data">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy !== null} onClick={exportJson}>
          {busy === 'json' ? 'Exporting…' : 'Export JSON backup'}
        </Button>
        <Button disabled={!loaded} onClick={exportPositionsCsv}>
          Positions CSV
        </Button>
        <Button disabled={!loaded} onClick={exportFillsCsv}>
          Fills CSV
        </Button>
        <Button disabled={!loaded} onClick={exportCapitalCsv}>
          Capital CSV
        </Button>
        <Button disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          {busy === 'import' ? 'Importing…' : 'Import JSON backup'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImportFile(file);
          }}
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        The JSON backup contains everything and can be imported again. CSVs are for spreadsheets.
      </p>
    </Section>
  );
}

export default function Settings() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4 max-w-2xl">
        <Preferences />
        <DataTools />
        <Section title="Account">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              Signed in as <span className="font-medium">{session?.user.email}</span>
            </p>
            <Button onClick={signOut}>Sign out</Button>
          </div>
        </Section>
      </div>
    </>
  );
}
