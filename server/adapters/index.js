import ccxt from 'ccxt';

// Exchanges from the target list mapped to their ccxt ids.
// label = human name shown in the add-card UI. supported=false => no ccxt adapter yet.
export const EXCHANGES = {
  ascendex:     { label: 'AscendEX', supported: true },
  aster:        { label: 'Aster', supported: true },
  binance:      { label: 'Binance', supported: true },
  bingx:        { label: 'BingX', supported: true },
  bitget:       { label: 'Bitget', supported: true },
  bitmart:      { label: 'BitMart', supported: true },
  bitstamp:     { label: 'Bitstamp', supported: true },
  bitvavo:      { label: 'Bitvavo', supported: true },
  bybit:        { label: 'ByBit', supported: true },
  coinbase:     { label: 'Coinbase', supported: true },
  coinstore:    { label: 'Coinstore', supported: true },
  cryptocom:    { label: 'Crypto.com', supported: true },
  deribit:      { label: 'Deribit', supported: true },
  gate:         { label: 'Gate.io', supported: true },
  htx:          { label: 'HTX', supported: true },
  hyperliquid:  { label: 'Hyperliquid', supported: true },
  krakenfutures:{ label: 'Kraken Futures', supported: true },
  kraken:       { label: 'Kraken', supported: true },
  kucoin:       { label: 'KuCoin', supported: true },
  lbank:        { label: 'LBank', supported: true },
  mexc:         { label: 'MEXC', supported: true },
  okx:          { label: 'OKX', supported: true },
  upbit:        { label: 'Upbit', supported: true },
  woo:          { label: 'WOO X', supported: true },
  xt:           { label: 'XT', supported: true }
  // Bitunix, CrossX, OFZA, Weex have no ccxt adapter — skipped entirely.
};

// One ccxt instance per exchange+type (spot vs swap), lazily created and reused.
const instances = new Map();

function getInstance(exchangeId, type) {
  const key = `${exchangeId}:${type}`;
  if (instances.has(key)) return instances.get(key);

  const meta = EXCHANGES[exchangeId];
  if (!meta || !meta.supported || typeof ccxt[exchangeId] !== 'function') {
    instances.set(key, null);
    return null;
  }

  const opts = { enableRateLimit: true, timeout: 15_000 };
  if (type === 'swap') opts.options = { defaultType: 'swap' };

  const ex = new ccxt[exchangeId](opts);
  instances.set(key, ex);
  return ex;
}

// CCXT keeps the promise created by loadMarkets(). If the initial request
// rejects, that rejected promise is otherwise reused forever. Clear exactly
// that failed attempt so the next poll can retry, while preserving successful
// market caches and any newer load that may already have started.
async function ensureMarkets(ex) {
  const result = ex.loadMarkets();
  const loading = ex.marketsLoading;
  try {
    await result;
  } catch (err) {
    if (ex.marketsLoading === loading) ex.marketsLoading = undefined;
    throw err;
  }
}

export function isSupported(exchangeId) {
  return Boolean(EXCHANGES[exchangeId] && EXCHANGES[exchangeId].supported);
}

// True when the error means the symbol does not exist on the exchange
// (vs a transient network/rate error we should not drop on).
export function isBadSymbol(err) {
  return err instanceof ccxt.BadSymbol || /does not have market symbol|symbol .* not found/i.test(err?.message || '');
}

// Fetch one ticker: { last, changePct24h }.
export async function fetchTicker({ exchange, symbol, type }) {
  const ex = getInstance(exchange, type);
  if (!ex) throw new Error(`unsupported exchange: ${exchange}`);
  await ensureMarkets(ex);
  const t = await ex.fetchTicker(symbol);
  let pct = t.percentage;
  if ((pct === undefined || pct === null) && t.open && t.last) {
    pct = ((t.last - t.open) / t.open) * 100;
  }
  return { last: t.last ?? null, changePct24h: pct ?? null };
}

// Fetch 24h sparkline as an array of close prices.
export async function fetchSparkline({ exchange, symbol, type }, timeframe, limit) {
  const ex = getInstance(exchange, type);
  if (!ex) throw new Error(`unsupported exchange: ${exchange}`);
  await ensureMarkets(ex);
  if (!ex.has.fetchOHLCV) return null;
  const since = ex.milliseconds() - 24 * 60 * 60 * 1000;
  const ohlcv = await ex.fetchOHLCV(symbol, timeframe, since, limit);
  // ohlcv rows: [ts, open, high, low, close, volume]
  return ohlcv.map((r) => r[4]).filter((v) => typeof v === 'number');
}

// Fetch OHLC candles for the chart popup. Returns lightweight-charts shape:
// [{ time: <unix seconds>, open, high, low, close }]. spanMs = how far back to fetch.
export async function fetchCandles({ exchange, symbol, type }, timeframe, spanMs) {
  const ex = getInstance(exchange, type);
  if (!ex) throw new Error(`unsupported exchange: ${exchange}`);
  await ensureMarkets(ex);
  if (!ex.has.fetchOHLCV) throw new Error(`${exchange} has no OHLCV`);
  // Fall back to a supported timeframe if the requested one is missing.
  let tf = timeframe;
  if (ex.timeframes && !ex.timeframes[tf]) {
    tf = ex.timeframes['5m'] ? '5m' : ex.timeframes['1m'] ? '1m' : Object.keys(ex.timeframes)[0];
  }
  const since = ex.milliseconds() - spanMs;
  const ohlcv = await ex.fetchOHLCV(symbol, tf, since);
  return ohlcv
    .filter((r) => r[4] != null)
    .map((r) => ({ time: Math.floor(r[0] / 1000), open: r[1], high: r[2], low: r[3], close: r[4] }));
}
