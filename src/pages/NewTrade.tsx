import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CoinPicker, { type PickedCoin } from '../components/CoinPicker';
import FillForm from '../components/FillForm';
import PageHeader from '../components/PageHeader';
import { Card, Field, inputClass } from '../components/ui';
import { useCreateTrade, usePositions, useSaveFill, type FillDraft } from '../data/trades';
import { formatDate } from '../lib/dates';
import { parseDecimal } from '../lib/fillMath';
import { addRecentCoin } from '../lib/settings';

type Style = '' | 'day' | 'swing';

export default function NewTrade() {
  const navigate = useNavigate();
  const createTrade = useCreateTrade();
  const saveFill = useSaveFill();
  const positions = usePositions();
  const [coin, setCoin] = useState<PickedCoin | null>(null);
  // Default to adding to an open position in the same coin rather than opening a second one.
  const [separate, setSeparate] = useState(false);
  const existing = coin
    ? positions.data?.find((p) => p.status === 'open' && p.coingecko_id === coin.coingecko_id)
    : undefined;
  const addToExisting = !!existing && !separate;
  const [target, setTarget] = useState('');
  const [stop, setStop] = useState('');
  const [setup, setSetup] = useState('');
  const [style, setStyle] = useState<Style>('');
  const [notes, setNotes] = useState('');

  const optionalPrice = (s: string) => {
    const n = parseDecimal(s);
    return n && n.gt(0) ? n.toFixed() : null;
  };

  async function submit(fill: FillDraft) {
    if (!coin) throw new Error('Pick a coin first');
    if (addToExisting && existing) {
      await saveFill.mutateAsync({ positionId: existing.id, draft: fill });
      addRecentCoin(coin);
      navigate(`/trades/${existing.id}`, { replace: true });
      return;
    }
    const id = await createTrade.mutateAsync({
      position: {
        symbol: coin.symbol,
        coingecko_id: coin.coingecko_id,
        style: style || null,
        setup: setup.trim() || null,
        target_price: optionalPrice(target),
        stop_price: optionalPrice(stop),
        notes: notes.trim() || null,
      },
      fill,
    });
    addRecentCoin(coin);
    navigate(`/trades/${id}`, { replace: true });
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="New trade" />
      <div className="space-y-4">
        <Card>
          <Field label="Coin (paired with USDT)">
            <CoinPicker
              value={coin}
              onChange={(c) => {
                setCoin(c);
                setSeparate(false);
              }}
            />
          </Field>
          {existing && (
            <div className="mt-3 space-y-2 rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
              <p>
                You already have an open {existing.symbol} position (opened{' '}
                {formatDate(existing.opened_at)}).
              </p>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!separate} onChange={() => setSeparate(false)} />
                Add this buy to it (one position, averaged entry)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={separate} onChange={() => setSeparate(true)} />
                Open a separate position
              </label>
            </div>
          )}
        </Card>

        {coin && (
          <>
            <Card className={addToExisting ? 'hidden' : ''}>
              <h2 className="text-sm font-medium mb-3">Plan (optional)</h2>
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
                  <input
                    placeholder="breakout, dip-buy…"
                    value={setup}
                    onChange={(e) => setSetup(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Style">
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as Style)}
                    className={inputClass}
                  >
                    <option value="">Auto</option>
                    <option value="day">Day trade</option>
                    <option value="swing">Swing</option>
                  </select>
                </Field>
              </div>
              <Field label="Notes / reasoning" className="mt-3">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </Card>

            <Card>
              <h2 className="text-sm font-medium mb-3">
                {addToExisting ? `Buy more ${coin.symbol}` : 'First buy'}
              </h2>
              <FillForm
                key={coin.coingecko_id}
                side="buy"
                symbol={coin.symbol}
                submitLabel={addToExisting ? 'Add buy' : 'Open position'}
                onSubmit={submit}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
