import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { FillDraft } from '../data/trades';
import { fromLocalInput, toLocalInput } from '../lib/dates';
import { estimateFee, feeToUsdt, parseDecimal, qtyFromAmount } from '../lib/fillMath';
import { d, formatQty, formatUsdt } from '../lib/money';
import { getSettings } from '../lib/settings';
import { Button, ErrorText, Field, inputClass } from './ui';

const schema = z
  .object({
    mode: z.enum(['qty', 'usdt']),
    quantity: z.string(),
    amount: z.string(),
    price: z.string(),
    feeAsset: z.string(),
    feeAmount: z.string(),
    bnbPrice: z.string(),
    executedAt: z.string(),
  })
  .superRefine((v, ctx) => {
    const positive = (key: 'quantity' | 'amount' | 'price' | 'bnbPrice') => {
      const n = parseDecimal(v[key]);
      if (!n || n.lte(0))
        ctx.addIssue({ code: 'custom', path: [key], message: 'Enter a number above 0' });
    };
    positive('price');
    positive(v.mode === 'qty' ? 'quantity' : 'amount');
    const fee = v.feeAmount.trim() ? parseDecimal(v.feeAmount) : d(0);
    if (!fee || fee.lt(0)) {
      ctx.addIssue({ code: 'custom', path: ['feeAmount'], message: 'Enter 0 or more' });
    } else if (fee.gt(0) && v.feeAsset === 'BNB') {
      positive('bnbPrice');
    }
    if (!v.executedAt || Number.isNaN(new Date(v.executedAt).getTime())) {
      ctx.addIssue({ code: 'custom', path: ['executedAt'], message: 'Pick a date and time' });
    }
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  side: 'buy' | 'sell';
  symbol: string;
  initial?: FillDraft;
  /** Enables the 25/50/100% buttons on sells. */
  remainingQty?: Decimal;
  defaultPrice?: string;
  submitLabel: string;
  onSubmit: (draft: FillDraft) => Promise<void>;
  onCancel?: () => void;
}

function initialValues(props: Props): FormValues {
  const settings = getSettings();
  const init = props.initial;
  let bnbPrice = '';
  if (init && init.fee_asset === 'BNB' && d(init.fee_amount).gt(0)) {
    bnbPrice = d(init.fee_usdt).div(init.fee_amount).toDecimalPlaces(4).toFixed();
  }
  return {
    mode: 'qty',
    quantity: init ? d(init.quantity).toFixed() : '',
    amount: '',
    price: init ? d(init.price_usdt).toFixed() : (props.defaultPrice ?? ''),
    feeAsset: init?.fee_asset ?? settings.defaultFeeAsset,
    feeAmount: init && d(init.fee_amount).gt(0) ? d(init.fee_amount).toFixed() : '',
    bnbPrice,
    executedAt: toLocalInput(init?.executed_at ?? new Date()),
  };
}

export default function FillForm(props: Props) {
  const { side, symbol, remainingQty, submitLabel, onCancel } = props;
  const settings = getSettings();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initialValues(props) });

  const v = watch();
  const price = parseDecimal(v.price);
  const qty =
    v.mode === 'qty'
      ? parseDecimal(v.quantity)
      : price && price.gt(0) && parseDecimal(v.amount)
        ? qtyFromAmount(parseDecimal(v.amount)!, price)
        : null;
  const notional = qty && price ? qty.times(price) : null;
  const feeAmount = parseDecimal(v.feeAmount) ?? d(0);
  const feeUsdt = price
    ? feeToUsdt({
        feeAmount,
        feeAsset: v.feeAsset,
        symbol,
        price,
        bnbPrice: parseDecimal(v.bnbPrice),
      })
    : null;
  const estimate =
    qty && price
      ? estimateFee({
          qty,
          price,
          feeAsset: v.feeAsset,
          symbol,
          ratePct: v.feeAsset === 'BNB' ? settings.bnbFeeRatePct : settings.feeRatePct,
          bnbPrice: parseDecimal(v.bnbPrice),
        })
      : null;

  async function submit(values: FormValues) {
    const p = parseDecimal(values.price)!;
    const q =
      values.mode === 'qty'
        ? parseDecimal(values.quantity)!.toDecimalPlaces(12, Decimal.ROUND_DOWN)
        : qtyFromAmount(parseDecimal(values.amount)!, p);
    if (q.lte(0)) {
      setError('amount', { message: 'Amount is too small for this price' });
      return;
    }
    if (side === 'sell' && remainingQty && q.gt(remainingQty)) {
      setError('quantity', { message: `You hold ${formatQty(remainingQty)} ${symbol}` });
      return;
    }
    const fee = values.feeAmount.trim() ? parseDecimal(values.feeAmount)! : d(0);
    const fUsdt = feeToUsdt({
      feeAmount: fee,
      feeAsset: values.feeAsset,
      symbol,
      price: p,
      bnbPrice: parseDecimal(values.bnbPrice),
    });
    try {
      await props.onSubmit({
        side,
        quantity: q.toFixed(),
        price_usdt: p.toFixed(),
        fee_amount: fee.toFixed(),
        fee_asset: values.feeAsset,
        fee_usdt: (fUsdt ?? d(0)).toDecimalPlaces(8).toFixed(),
        executed_at: fromLocalInput(values.executedAt),
      });
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : String(e) });
    }
  }

  function setPercent(pct: number) {
    if (!remainingQty) return;
    const q =
      pct === 100
        ? remainingQty
        : remainingQty.times(pct).div(100).toDecimalPlaces(8, Decimal.ROUND_DOWN);
    setValue('mode', 'qty');
    setValue('quantity', q.toFixed(), { shouldValidate: true });
  }

  const feeAssets = ['USDT', 'BNB', symbol.toUpperCase()].filter(
    (a, i, all) => all.indexOf(a) === i,
  );

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      {side === 'buy' && (
        <div className="flex gap-1 rounded-md bg-surface p-1 text-xs">
          {(['qty', 'usdt'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setValue('mode', m)}
              className={`flex-1 rounded px-2 py-1 ${v.mode === m ? 'bg-card text-fg' : 'text-muted'}`}
            >
              {m === 'qty' ? `Quantity (${symbol})` : 'USDT amount spent'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {v.mode === 'qty' ? (
          <Field label={`Quantity (${symbol})`} error={errors.quantity?.message}>
            <input inputMode="decimal" className={inputClass} {...register('quantity')} />
          </Field>
        ) : (
          <Field
            label="USDT spent"
            error={errors.amount?.message}
            hint={qty ? `≈ ${formatQty(qty)} ${symbol}` : undefined}
          >
            <input inputMode="decimal" className={inputClass} {...register('amount')} />
          </Field>
        )}
        <Field label="Price (USDT)" error={errors.price?.message}>
          <input inputMode="decimal" className={inputClass} {...register('price')} />
        </Field>
      </div>

      {side === 'sell' && remainingQty && (
        <div className="flex gap-2">
          {[25, 50, 100].map((pct) => (
            <Button key={pct} onClick={() => setPercent(pct)} className="flex-1 text-xs">
              {pct}%
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Fee"
          error={errors.feeAmount?.message}
          hint={
            estimate && (
              <button
                type="button"
                className="underline decoration-dotted"
                onClick={() => setValue('feeAmount', estimate.toFixed(), { shouldValidate: true })}
              >
                use estimate {estimate.toFixed()}
              </button>
            )
          }
        >
          <input
            inputMode="decimal"
            placeholder="0"
            className={inputClass}
            {...register('feeAmount')}
          />
        </Field>
        <Field label="Fee paid in">
          <select className={inputClass} {...register('feeAsset')}>
            {feeAssets.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {v.feeAsset === 'BNB' && (
        <Field
          label="BNB price (USDT)"
          error={errors.bnbPrice?.message}
          hint="Used to convert the fee to USDT"
        >
          <input inputMode="decimal" className={inputClass} {...register('bnbPrice')} />
        </Field>
      )}

      <Field label="Time" error={errors.executedAt?.message}>
        <input type="datetime-local" className={inputClass} {...register('executedAt')} />
      </Field>

      <div className="rounded-md bg-surface px-3 py-2 text-xs text-muted space-y-0.5">
        <div>
          Total: <span className="text-fg">{notional ? formatUsdt(notional) : '—'} USDT</span>
        </div>
        <div>
          Fee in USDT:{' '}
          <span className="text-fg">{feeUsdt ? formatUsdt(feeUsdt.toDecimalPlaces(8)) : '—'}</span>
          {side === 'buy' && v.feeAsset === symbol.toUpperCase() && feeAmount.gt(0) && qty && (
            <span>
              {' '}
              · you receive {formatQty(qty.minus(feeAmount))} {symbol}
            </span>
          )}
        </div>
      </div>

      <ErrorText error={errors.root?.message} />

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
