import { useSearchParams } from 'react-router-dom';
import { FundsStatus, PersonSwitch, Projection } from '../../components/funds';
import PageHeader from '../../components/PageHeader';
import { useFunds } from '../../data/funds';
import { ownerLabel } from '../../lib/meezan';
import { formatRs } from '../../lib/money';

export default function FundsProjections() {
  const funds = useFunds();
  const [params, setParams] = useSearchParams();
  const who = params.get('who') ?? 'all';
  const totals = funds.totalsFor(who);
  const ready = !funds.isLoading && !funds.missingTable && !funds.error && !funds.isEmpty;

  return (
    <>
      <PageHeader eyebrow="Al Meezan" title="Projections" />
      <FundsStatus {...funds} />
      {ready && (
        <div className="space-y-4">
          <PersonSwitch
            people={funds.people}
            value={who}
            onChange={(o) => setParams(o === 'all' ? {} : { who: o }, { replace: true })}
          />
          <p className="text-sm text-muted">
            Starting from {who === 'all' ? 'the family total' : `${ownerLabel(who)} share`} of{' '}
            <span className="text-fg">{formatRs(totals.value)}</span>, with profit reinvested.
          </p>
          <Projection
            key={who}
            start={totals.value}
            avgDaily={totals.avgDaily}
            latestDaily={totals.latestDaily}
          />
        </div>
      )}
    </>
  );
}
