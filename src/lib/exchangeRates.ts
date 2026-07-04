export const SUPPORTED_CURRENCIES = ['MXN', 'USD', 'EUR', 'JPY', 'GBP'] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export type ExchangeRatesResult = {
  baseCurrency: SupportedCurrency;
  rates: Partial<Record<SupportedCurrency, number>>;
  date: string;
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
};

type CachedExchangeRates = Omit<ExchangeRatesResult, 'fromCache' | 'stale'>;

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;

function cacheKey(baseCurrency: SupportedCurrency, targetCurrencies: SupportedCurrency[]) {
  const targets = [...new Set(targetCurrencies)]
    .filter((currency) => currency !== baseCurrency)
    .sort()
    .join(',');
  return `exchangeRates:${baseCurrency}:${targets}`;
}

function readCache(key: string): CachedExchangeRates | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as CachedExchangeRates : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: CachedExchangeRates) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Conversion remains available for this session when storage is blocked.
  }
}

export async function getExchangeRates(
  baseCurrency: SupportedCurrency,
  targetCurrencies: SupportedCurrency[],
): Promise<ExchangeRatesResult> {
  const targets = [...new Set(targetCurrencies)].filter((currency) => currency !== baseCurrency).sort();
  const key = cacheKey(baseCurrency, targets);
  const cached = readCache(key);
  const cacheAge = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;

  if (cached && cacheAge < CACHE_DURATION_MS) {
    return { ...cached, rates: { ...cached.rates, [baseCurrency]: 1 }, fromCache: true, stale: false };
  }

  if (!targets.length) {
    return {
      baseCurrency,
      rates: { [baseCurrency]: 1 },
      date: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      stale: false,
    };
  }

  try {
    const params = new URLSearchParams({ from: baseCurrency, to: targets.join(',') });
    const response = await fetch(`${FRANKFURTER_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Exchange-rate request failed with ${response.status}.`);
    const payload = await response.json() as { date?: string; rates?: Record<string, number> };
    if (!payload.rates) throw new Error('Exchange-rate response did not include rates.');

    const result: CachedExchangeRates = {
      baseCurrency,
      rates: { ...payload.rates, [baseCurrency]: 1 },
      date: payload.date ?? new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    };
    writeCache(key, result);
    return { ...result, fromCache: false, stale: false };
  } catch (error) {
    if (cached) {
      return { ...cached, rates: { ...cached.rates, [baseCurrency]: 1 }, fromCache: true, stale: true };
    }
    throw error;
  }
}

export async function getExchangeRate(baseCurrency: SupportedCurrency, targetCurrency: SupportedCurrency) {
  if (baseCurrency === targetCurrency) return 1;
  const result = await getExchangeRates(baseCurrency, [targetCurrency]);
  const rate = result.rates[targetCurrency];
  if (!rate) throw new Error(`No ${baseCurrency}/${targetCurrency} exchange rate is available.`);
  return rate;
}

export function convertCurrency(
  amount: number,
  baseCurrency: SupportedCurrency,
  targetCurrency: SupportedCurrency,
  rate = 1,
) {
  return baseCurrency === targetCurrency ? amount : amount * rate;
}

export function formatCurrency(amount: number | string | null | undefined, currency: SupportedCurrency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '?';
  const fractionDigits = currency === 'JPY' ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(amount));
}

export function getCurrencySymbol(currency: SupportedCurrency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? currency;
}
