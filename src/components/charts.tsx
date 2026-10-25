import { format } from 'date-fns';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { EquityPoint } from '../lib/equity';
import { formatUsdt } from '../lib/money';

// Chart colors (validated against the dark card surface). Sign is always also encoded by
// position relative to the zero line and by signed values in tooltips.
const C = {
  line: '#3b82f6',
  reference: '#8b98a5',
  profit: '#22c55e',
  loss: '#ef4444',
  grid: '#222c38',
  axis: '#8b98a5',
  surface: '#131a22',
};

const axisProps = {
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function compact(n: number): string {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function TooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-muted">{title}</div>
      <div className="space-y-0.5 tabular-nums text-fg">{children}</div>
    </div>
  );
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className="mr-1.5 inline-block h-0.5 w-3 align-middle"
      style={{
        background: dashed ? 'none' : color,
        borderTop: dashed ? `2px dashed ${color}` : 'none',
      }}
    />
  );
}

// ---------- equity curve ----------

interface EquityDatum {
  t: number;
  capital: number;
  invested: number;
  flow: number | null;
}

function EquityTooltip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as EquityDatum | undefined;
  if (!active || !p) return null;
  return (
    <TooltipBox title={format(p.t, 'd MMM yyyy')}>
      <div>
        <Swatch color={C.line} />
        Capital {formatUsdt(p.capital)}
      </div>
      <div>
        <Swatch color={C.reference} dashed />
        Net invested {formatUsdt(p.invested)}
      </div>
      {p.flow !== null && (
        <div className={p.flow >= 0 ? 'text-profit' : 'text-loss'}>
          {p.flow >= 0 ? 'Deposit' : 'Withdrawal'} {formatUsdt(Math.abs(p.flow))}
        </div>
      )}
    </TooltipBox>
  );
}

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const data: EquityDatum[] = points.map((p) => ({
    t: new Date(`${p.date}T12:00:00`).getTime(),
    capital: p.capital.toNumber(),
    invested: p.netInvested.toNumber(),
    flow: p.flow ? p.flow.toNumber() : null,
  }));
  const flows = data.filter((d) => d.flow !== null);

  return (
    <div className="h-56" role="img" aria-label="Capital over time with deposits marked">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => format(t, 'd MMM')}
            {...axisProps}
          />
          <YAxis tickFormatter={compact} width={48} {...axisProps} />
          <Tooltip
            content={<EquityTooltip />}
            cursor={{ stroke: C.axis, strokeDasharray: '3 3' }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: C.axis }} />
          <Line
            name="Net invested"
            dataKey="invested"
            type="stepAfter"
            stroke={C.reference}
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name="Capital"
            dataKey="capital"
            type="monotone"
            stroke={C.line}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Scatter
            name="Deposit / withdrawal"
            data={flows}
            dataKey="capital"
            legendType="circle"
            fill={C.profit}
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number; payload?: EquityDatum }) => (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={5}
                fill={(props.payload?.flow ?? 0) >= 0 ? C.profit : C.loss}
                stroke={C.surface}
                strokeWidth={2}
              />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- signed bars (P&L by month / coin) ----------

export interface BarDatum {
  label: string;
  pnl: number;
  key?: string;
}

function BarTooltip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as BarDatum | undefined;
  if (!active || !p) return null;
  return (
    <TooltipBox title={p.label}>
      <div className={p.pnl >= 0 ? 'text-profit' : 'text-loss'}>
        {formatUsdt(p.pnl, { sign: true })} USDT
      </div>
    </TooltipBox>
  );
}

export function PnlBars({
  data,
  onSelect,
  height = 200,
  label,
}: {
  data: BarDatum[];
  onSelect?: (d: BarDatum) => void;
  height?: number;
  label: string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" interval="preserveStartEnd" {...axisProps} />
          <YAxis tickFormatter={compact} width={48} {...axisProps} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(139,152,165,0.08)' }} />
          <Bar
            dataKey="pnl"
            radius={[3, 3, 3, 3]}
            maxBarSize={36}
            isAnimationActive={false}
            onClick={
              onSelect ? (d: { payload?: BarDatum }) => d.payload && onSelect(d.payload) : undefined
            }
            className={onSelect ? 'cursor-pointer' : undefined}
          >
            {data.map((d, i) => (
              <Cell key={d.key ?? i} fill={d.pnl >= 0 ? C.profit : C.loss} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- daily cumulative P&L ----------

interface CumDatum {
  date: string;
  cumulative: number;
  pnl: number;
}

function CumTooltip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as CumDatum | undefined;
  if (!active || !p) return null;
  return (
    <TooltipBox title={format(new Date(`${p.date}T12:00:00`), 'EEE d MMM')}>
      <div>Month to date {formatUsdt(p.cumulative, { sign: true })}</div>
      {p.pnl !== 0 && (
        <div className={p.pnl > 0 ? 'text-profit' : 'text-loss'}>
          That day {formatUsdt(p.pnl, { sign: true })}
        </div>
      )}
    </TooltipBox>
  );
}

export function CumulativeChart({ data }: { data: CumDatum[] }) {
  return (
    <div className="h-48" role="img" aria-label="Cumulative realized P&L through the month">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(s: string) => String(Number(s.slice(8)))}
            interval="preserveStartEnd"
            {...axisProps}
          />
          <YAxis tickFormatter={compact} width={48} {...axisProps} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Tooltip content={<CumTooltip />} cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} />
          <Line
            dataKey="cumulative"
            type="stepAfter"
            stroke={C.line}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
