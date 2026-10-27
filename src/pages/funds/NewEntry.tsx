import { useNavigate, useSearchParams } from 'react-router-dom';
import MeezanEntryForm from '../../components/MeezanEntryForm';
import PageHeader from '../../components/PageHeader';
import { Card } from '../../components/ui';
import { MEEZAN_FUNDS, type MeezanFund, type MeezanKind } from '../../lib/meezan';

const KINDS: readonly MeezanKind[] = ['deposit', 'valuation', 'withdrawal'];

export default function FundsNewEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kindParam = params.get('kind') as MeezanKind | null;
  const kind = kindParam && KINDS.includes(kindParam) ? kindParam : 'valuation';
  const fundParam = params.get('fund') as MeezanFund | null;
  const fund = fundParam && MEEZAN_FUNDS.includes(fundParam) ? fundParam : undefined;
  const who = params.get('who') ?? undefined;

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader eyebrow="Al Meezan" title="New entry" />
      <Card>
        <MeezanEntryForm
          kind={kind}
          defaults={fund || who ? { fund: fund ?? 'MIACF', owner: who } : undefined}
          onDone={() => navigate('/funds')}
        />
      </Card>
    </div>
  );
}
