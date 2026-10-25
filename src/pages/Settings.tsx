import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import { supabase } from '../lib/supabase';

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
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm">
          Signed in as <span className="font-medium">{session?.user.email}</span>
        </p>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
        >
          Sign out
        </button>
      </section>
      <p className="text-muted text-sm mt-6">Export, import and defaults coming soon.</p>
    </>
  );
}
