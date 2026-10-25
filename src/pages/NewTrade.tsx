import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CoinPicker, { type PickedCoin } from '../components/CoinPicker';
import FillForm from '../components/FillForm';
import PageHeader from '../components/PageHeader';
import { Card, Field, inputClass } from '../components/ui';
import { useCreateTrade, type FillDraft } from '../data/trades';
import { parseDecimal } from '../lib/fillMath';
import { addRecentCoin } from '../lib/settings';

type Style = '' | 'day' | 'swing';

export default function NewTrade() {
  const navigate = useNavigate();
  const createTrade = useCreateTrade();
  const [coin, setCoin] = useState<PickedCoin | null>(null);
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
            <CoinPicker value={coin} onChange={setCoin} />
          </Field>
        </Card>

        {coin && (
          <>
            <Card>
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
              <h2 className="text-sm font-medium mb-3">First buy</h2>
              <FillForm
                key={coin.coingecko_id}
                side="buy"
                symbol={coin.symbol}
                submitLabel="Open position"
                onSubmit={submit}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
