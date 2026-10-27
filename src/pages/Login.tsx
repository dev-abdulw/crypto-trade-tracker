import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/useAuth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export default function Login() {
  const { session } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit({ email, password }: FormValues) {
    setError(null);
    setInfo(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) setError(error.message);
    else if (!data.session) setInfo('Check your email to confirm the account, then sign in.');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="mb-8 flex flex-col items-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent-strong to-accent/70 shadow-[0_12px_32px_-8px_rgb(212_175_106/0.7)]">
          <span className="h-5 w-5 rotate-45 rounded-[4px] bg-on-accent/85" />
        </span>
        <div className="mt-4 font-display text-4xl text-gold">Ledger</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted">
          Crypto · Funds · Family
        </div>
      </div>
      <div className="card-premium w-full max-w-sm rounded-3xl border border-border p-6">
        <h1 className="font-display text-xl mb-5">
          {mode === 'signin' ? 'Welcome back' : 'Create the owner account'}
        </h1>

        {!isSupabaseConfigured && (
          <p className="mb-4 rounded-md border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
            Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
            .env.local.
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              className={`${inputClass} mt-1`}
              {...register('email')}
            />
            {errors.email && <span className="text-xs text-loss">{errors.email.message}</span>}
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Password
            </span>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={`${inputClass} mt-1`}
              {...register('password')}
            />
            {errors.password && (
              <span className="text-xs text-loss">{errors.password.message}</span>
            )}
          </label>

          {error && <p className="text-sm text-loss">{error}</p>}
          {info && <p className="text-sm text-profit">{info}</p>}

          <button
            type="submit"
            disabled={isSubmitting || !isSupabaseConfigured}
            className="w-full rounded-xl bg-gradient-to-b from-accent-strong to-accent px-3 py-2.5 text-sm font-semibold text-on-accent shadow-[0_8px_24px_-10px_rgb(212_175_106/0.8)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 w-full text-center text-xs text-muted hover:text-fg"
        >
          {mode === 'signin' ? 'First time? Create the owner account' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
