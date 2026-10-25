import type { DustOptions } from './pnl';

// Per-device preferences kept in localStorage (a full Settings screen comes in phase 8).

export interface AppSettings {
  /** Remaining holdings worth less than this (USDT) auto-close a position. */
  dustMinUsdt: string;
  defaultFeeAsset: 'USDT' | 'BNB';
  /** Binance spot fee in percent, e.g. "0.1". */
  feeRatePct: string;
  /** Fee in percent when paying with BNB, e.g. "0.075". */
  bnbFeeRatePct: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  dustMinUsdt: '1',
  defaultFeeAsset: 'USDT',
  feeRatePct: '0.1',
  bnbFeeRatePct: '0.075',
};

const SETTINGS_KEY = 'ctt.settings';
const RECENT_COINS_KEY = 'ctt.recentCoins';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — preferences just won't persist
  }
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(SETTINGS_KEY) };
}

export function saveSettings(settings: AppSettings) {
  writeJson(SETTINGS_KEY, settings);
}

export function dustOptions(settings: AppSettings = getSettings()): DustOptions {
  return { minValueUsdt: settings.dustMinUsdt };
}

export interface RecentCoin {
  symbol: string;
  coingecko_id: string;
  name: string;
  thumb?: string;
}

export function getRecentCoins(): RecentCoin[] {
  return readJson<RecentCoin[]>(RECENT_COINS_KEY) ?? [];
}

export function addRecentCoin(coin: RecentCoin) {
  const rest = getRecentCoins().filter((c) => c.coingecko_id !== coin.coingecko_id);
  writeJson(RECENT_COINS_KEY, [coin, ...rest].slice(0, 8));
}

const RECAP_KEY = 'ctt.recapDismissed';

/** Month key (yyyy-MM) whose recap card the user last dismissed. */
export function getDismissedRecap(): string | null {
  return readJson<string>(RECAP_KEY);
}

export function dismissRecap(month: string) {
  writeJson(RECAP_KEY, month);
}
