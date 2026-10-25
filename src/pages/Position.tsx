import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import FillForm from '../components/FillForm';
import {
  Button,
  Card,
  ErrorText,
  Field,
  inputClass,
  Modal,
  Pnl,
  Stat,
  StatusBadge,
} from '../components/ui';
import {
  useClosePosition,
  useDeleteFill,
  useDeletePosition,
  useReopenPosition,
  useSaveFill,
  useUpdatePositionDetails,
  type FillDraft,
  type PositionView,
} from '../data/trades';
import { useLivePortfolio } from '../data/prices';
import PriceStatus from '../components/PriceStatus';
import { formatDateTime, formatDuration } from '../lib/dates';
import { parseDecimal } from '../lib/fillMath';
import {
  d,
  formatPct,
  formatPrice,
  formatQty,
  formatUsdt,
  safeDiv,
  type Value,
} from '../lib/money';
import { sortFills } from '../lib/pnl';
import type { FillRow, PositionRow } from '../lib/types';

type Dialog =
  { kind: 'buy' } | { kind: 'sell' } | { kind: 'edit'; fill: FillRow } | { kind: 'plan' } | null;

function PlanForm({ row, onDone }: { row: PositionRow; onDone: () => void }) {
  const update = useUpdatePositionDetails();
  const [target, setTarget] = useState(row.target_price ? d(row.target_price).toFixed() : '');
  const [stop, setStop] = useState(row.stop_price ? d(row.stop_price).toFixed() : '');
  const [setup, setSetup] = useState(row.setup ?? '');
  const [style, setStyle] = useState(row.style ?? '');
  const price = (s: string) => {
    const n = parseDecimal(s);
    return n && n.gt(0) ? n.toFixed() : null;
  };

  async function save() {
    await update.mutateAsync({
      id: row.id,
      patch: {
        target_price: price(target),
        stop_price: price(stop),
        setup: setup.trim() || null,
        style: style === 'day' || style === 'swing' ? style : null,
      },
    });
    onDone();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target price">
          <input
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Stop price">
          <input
            inputMode="decimal"
            value={stop}
            onChange={(e) => setStop(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Setup">
          <input value={setup} onChange={(e) => setSetup(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Style">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className={inputClass}>
            <option value="">Auto</option>
            <option value="day">Day trade</option>
            <option value="swing">Swing</option>
          </select>
        </Field>
      </div>
      <ErrorText error={update.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={update.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Notes({ row }: { row: PositionRow }) {
  const update = useUpdatePositionDetails();
  const [notes, setNotes] = useState(row.notes ?? '');
  const dirty = notes !== (row.notes ?? '');
  return (
    <Card>
      <h2 className="text-sm font-medium mb-2">Notes</h2>
      <textarea
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Reasoning, what went well, lessons…"
        className={inputClass}
      />
      <ErrorText error={update.error} />
      {dirty && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: row.id, patch: { notes: notes.trim() || null } })}
          >
            Save notes
          </Button>
        </div>
      )}
    </Card>
  );
}

function Timeline({ view, onEdit }: { view: PositionView; onEdit: (f: FillRow) => void }) {
  const deleteFill = useDeleteFill();
  const steps = new Map(view.summary?.timeline.map((t) => [t.fillId, t]));
  const fills = sortFills(view.fills);

  return (
    <Card className="p-0 overflow-hidden">
      <h2 className="text-sm font-medium px-4 pt-4 pb-2">Fills</h2>
      {fills.length === 0 && (
        <p className="px-4 pb-4 text-sm text-muted">No fills. Add a buy or delete this position.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              <th className="px-4 py-2 font-normal">Time</th>
              <th className="px-2 py-2 font-normal">Side</th>
              <th className="px-2 py-2 font-normal text-right">Qty</th>
              <th className="px-2 py-2 font-normal text-right">Price</th>
              <th className="px-2 py-2 font-normal text-right">Fee</th>
              <th className="px-2 py-2 font-normal text-right">Avg entry</th>
              <th className="px-2 py-2 font-normal text-right">Holding</th>
              <th className="px-2 py-2 font-normal text-right">Realized</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fills.map((f) => {
              const step = steps.get(f.id);
              return (
                <tr key={f.id} className="whitespace-nowrap">
                  <td className="px-4 py-2 text-muted">{formatDateTime(f.executed_at)}</td>
                  <td
                    className={`px-2 py-2 font-medium ${f.side === 'buy' ? 'text-profit' : 'text-loss'}`}
                  >
                    {f.side.toUpperCase()}
                  </td>
                  <td className="px-2 py-2 text-right">{formatQty(f.quantity)}</td>
                  <td className="px-2 py-2 text-right">{formatPrice(f.price_usdt)}</td>
                  <td className="px-2 py-2 text-right text-muted">
                    {d(f.fee_amount).gt(0) ? `${formatQty(f.fee_amount)} ${f.fee_asset}` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {step ? formatPrice(step.avgEntryAfter) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {step ? formatQty(step.remainingQtyAfter) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {step?.realizedPnl ? <Pnl value={step.realizedPnl} /> : ''}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(f)}
                      className="text-xs text-muted hover:text-fg mr-3"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteFill.isPending}
                      onClick={() => {
                        if (confirm(`Delete this ${f.side}?`))
                          deleteFill.mutate({ positionId: view.row.id, fillId: f.id });
                      }}
                      className="text-xs text-muted hover:text-loss"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <ErrorText error={deleteFill.error} />
      </div>
    </Card>
  );
}

export default function Position() {
  const { id } = useParams();
  const navigate = useNavigate();
  const portfolio = useLivePortfolio();
  const saveFill = useSaveFill();
  const closePosition = useClosePosition();
  const reopenPosition = useReopenPosition();
  const deletePosition = useDeletePosition();
  const [dialog, setDialog] = useState<Dialog>(null);

  if (portfolio.isLoading) return <p className="text-muted text-sm">Loading…</p>;
  if (portfolio.error) return <ErrorText error={portfolio.error} />;
  const view = portfolio.data?.find((p) => p.row.id === id);
  if (!view) {
    return (
      <p className="text-sm text-muted">
        Position not found.{' '}
        <Link to="/trades" className="underline">
          Back to trades
        </Link>
      </p>
    );
  }

  const { row, summary } = view;
  const close = () => setDialog(null);
  const saveDraft = (fillId?: string) => async (draft: FillDraft) => {
    await saveFill.mutateAsync({ positionId: row.id, fillId, draft });
    close();
  };
  const lastFill = view.fills[view.fills.length - 1];
  const live = summary?.livePrice ?? null;
  const lastPrice = live
    ? live.toSignificantDigits(8).toFixed()
    : lastFill
      ? d(lastFill.price_usdt).toFixed()
      : undefined;
  const distance = (target: Value | null) =>
    target && live ? safeDiv(d(target).minus(live), live) : null;
  const canTrade = row.status === 'open';
  const remaining = summary?.remainingQty;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/trades" className="text-muted text-sm hover:text-fg">
          ← Trades
        </Link>
        <h1 className="text-xl font-semibold">{row.symbol}/USDT</h1>
        <StatusBadge status={row.status} />
        {row.closed_manually && <span className="text-xs text-muted">closed by hand</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {canTrade && (
            <>
              <Button variant="primary" onClick={() => setDialog({ kind: 'buy' })}>
                Add buy
              </Button>
              {remaining?.gt(0) && (
                <Button variant="danger" onClick={() => setDialog({ kind: 'sell' })}>
                  Sell
                </Button>
              )}
              <Button
                disabled={closePosition.isPending}
                onClick={() => {
                  const msg = remaining?.gt(0)
                    ? `Close and write off the remaining ${formatQty(remaining)} ${row.symbol}?`
                    : 'Close this position?';
                  if (confirm(msg)) closePosition.mutate(row.id);
                }}
              >
                Close
              </Button>
            </>
          )}
          {row.closed_manually && (
            <Button
              disabled={reopenPosition.isPending}
              onClick={() => reopenPosition.mutate(row.id)}
            >
              Reopen
            </Button>
          )}
          <Button
            variant="danger"
            disabled={deletePosition.isPending}
            onClick={async () => {
              if (!confirm(`Delete this ${row.symbol} position and all its fills?`)) return;
              await deletePosition.mutateAsync(row.id);
              navigate('/trades', { replace: true });
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      <ErrorText error={closePosition.error ?? reopenPosition.error ?? deletePosition.error} />
      {view.error && (
        <p className="rounded-md border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
          {view.error} Edit or delete a fill below to fix it.
        </p>
      )}

      {summary && row.status === 'open' && (
        <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Live price">{live ? formatPrice(live) : '—'}</Stat>
          <Stat label="Market value">
            {summary.marketValue ? `${formatUsdt(summary.marketValue)} USDT` : '—'}
          </Stat>
          <Stat label="Unrealized P&L">
            <Pnl value={summary.unrealizedPnl} pct={summary.unrealizedPct} />
          </Stat>
          <div className="flex items-end">
            <PriceStatus prices={portfolio.prices} />
          </div>
        </Card>
      )}

      {summary && (
        <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Holding">
            {formatQty(summary.remainingQty)} {row.symbol}
          </Stat>
          <Stat label="Avg entry (incl. fees)">{formatPrice(summary.avgEntry)}</Stat>
          <Stat label="Open cost">{formatUsdt(summary.openCost)} USDT</Stat>
          <Stat label="Realized P&L">
            <Pnl value={summary.realizedPnl} pct={summary.pnlPct} />
          </Stat>
          <Stat label="Total bought">
            {formatQty(summary.totalBoughtQty)} {row.symbol}
          </Stat>
          <Stat label="Sold">
            {formatQty(summary.soldQty)} {row.symbol}
          </Stat>
          <Stat label="Fees">{formatUsdt(summary.feesUsdt)} USDT</Stat>
          <Stat label={row.status === 'open' ? 'Open for' : 'Held for'}>
            {formatDuration(
              row.status === 'open' && summary.firstFillAt
                ? Date.now() - summary.firstFillAt.getTime()
                : summary.holdingTimeMs,
            )}
          </Stat>
          {summary.writtenOffQty.gt(0) && (
            <Stat label="Written off">
              {formatQty(summary.writtenOffQty)} {row.symbol}
            </Stat>
          )}
        </Card>
      )}

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <span className="text-muted">Target </span>
          {row.target_price ? formatPrice(row.target_price) : '—'}
          {distance(row.target_price) && (
            <span className="text-xs text-muted">
              {' '}
              ({formatPct(distance(row.target_price))} away)
            </span>
          )}
        </span>
        <span>
          <span className="text-muted">Stop </span>
          {row.stop_price ? formatPrice(row.stop_price) : '—'}
          {distance(row.stop_price) && (
            <span className="text-xs text-muted">
              {' '}
              ({formatPct(distance(row.stop_price))} away)
            </span>
          )}
        </span>
        <span>
          <span className="text-muted">Setup </span>
          {row.setup ?? '—'}
        </span>
        <span>
          <span className="text-muted">Style </span>
          {row.style ?? 'auto'}
        </span>
        <span className="text-muted">Opened {formatDateTime(row.opened_at)}</span>
        {row.closed_at && (
          <span className="text-muted">Closed {formatDateTime(row.closed_at)}</span>
        )}
        <Button variant="ghost" className="ml-auto" onClick={() => setDialog({ kind: 'plan' })}>
          Edit plan
        </Button>
      </Card>

      <Timeline view={view} onEdit={(fill) => setDialog({ kind: 'edit', fill })} />
      <Notes key={row.updated_at} row={row} />

      <Modal open={dialog?.kind === 'buy'} title={`Buy ${row.symbol}`} onClose={close}>
        <FillForm
          side="buy"
          symbol={row.symbol}
          defaultPrice={lastPrice}
          submitLabel="Add buy"
          onSubmit={saveDraft()}
          onCancel={close}
        />
      </Modal>
      <Modal open={dialog?.kind === 'sell'} title={`Sell ${row.symbol}`} onClose={close}>
        <FillForm
          side="sell"
          symbol={row.symbol}
          remainingQty={remaining}
          defaultPrice={lastPrice}
          submitLabel="Sell"
          onSubmit={saveDraft()}
          onCancel={close}
        />
      </Modal>
      <Modal open={dialog?.kind === 'edit'} title="Edit fill" onClose={close}>
        {dialog?.kind === 'edit' && (
          <FillForm
            side={dialog.fill.side}
            symbol={row.symbol}
            initial={dialog.fill}
            submitLabel="Save"
            onSubmit={saveDraft(dialog.fill.id)}
            onCancel={close}
          />
        )}
      </Modal>
      <Modal open={dialog?.kind === 'plan'} title="Edit plan" onClose={close}>
        {dialog?.kind === 'plan' && <PlanForm row={row} onDone={close} />}
      </Modal>
    </div>
  );
}
