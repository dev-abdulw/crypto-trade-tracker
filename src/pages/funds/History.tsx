import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { FundsStatus, PersonSwitch } from '../../components/funds';
import MeezanEntryForm from '../../components/MeezanEntryForm';
import PageHeader from '../../components/PageHeader';
import { Card, ErrorText, Modal } from '../../components/ui';
import { useFunds } from '../../data/funds';
import { useDeleteMeezanEntry } from '../../data/meezan';
import { formatDateTime } from '../../lib/dates';
import { ownerLabel, SHARED_OWNER } from '../../lib/meezan';
import { formatRs } from '../../lib/money';
import type { MeezanEntryRow } from '../../lib/types';

const ICON = { deposit: ArrowDownLeft, withdrawal: ArrowUpRight, valuation: RefreshCw };

export default function FundsHistory() {
  const funds = useFunds();
  const del = useDeleteMeezanEntry();
  const [who, setWho] = useState('all');
  const [editing, setEditing] = useState<MeezanEntryRow | null>(null);
  const ready = !funds.isLoading && !funds.missingTable && !funds.error && !funds.isEmpty;

  const rows = funds.holdings
    .flatMap((h) => h.entries)
    .filter((e) => who === 'all' || e.owner === who || e.owner === SHARED_OWNER)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return (
    <>
      <PageHeader eyebrow="Al Meezan" title="History" />
      <FundsStatus {...funds} />
      {ready && (
        <div className="space-y-4">
          <PersonSwitch people={funds.people} value={who} onChange={setWho} />
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-border/70">
              {rows.map((e) => {
                const Icon = ICON[e.kind];
                const tone =
                  e.kind === 'deposit'
                    ? 'text-profit bg-profit/10 ring-profit/20'
                    : e.kind === 'withdrawal'
                      ? 'text-loss bg-loss/10 ring-loss/20'
                      : 'text-accent bg-accent/10 ring-accent/20';
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${tone}`}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        {e.kind === 'valuation'
                          ? `${e.fund} balance`
                          : `${ownerLabel(e.owner)} ${e.kind === 'deposit' ? 'added' : 'withdrew'}`}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {formatDateTime(e.occurred_at)}
                        {e.kind !== 'valuation' && ` · ${e.fund}`}
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                    <div className="text-right tabular-nums font-medium">
                      {formatRs(e.amount_pkr)}
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs">
                      <button
                        type="button"
                        className="text-muted hover:text-fg"
                        onClick={() => setEditing(e)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-muted hover:text-loss"
                        disabled={del.isPending}
                        onClick={() => confirm('Delete this entry?') && del.mutate(e.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 pb-3">
              <ErrorText error={del.error} />
            </div>
          </Card>
        </div>
      )}
      <Modal open={editing !== null} title="Edit entry" onClose={() => setEditing(null)}>
        {editing && (
          <MeezanEntryForm kind={editing.kind} initial={editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}
