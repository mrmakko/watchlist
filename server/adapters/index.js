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
// CCXT keeps a complete exchange catalogue in every instance. A watchlist
// usually needs only a handful of those markets, so retain just the symbols
// that have actually been requested from each exchange+type instance.
const marketCacheStates = new WeakMap();

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

function marketState(ex) {
  let state = marketCacheStates.get(ex);
  if (!state) {
    state = { loaded: false, loading: null, symbols: new Set(), missing: new Set() };
    marketCacheStates.set(ex, state);
  }
  return state;
}

function trimMarkets(ex, state) {
  const allMarkets = ex.markets || {};
  const markets = {};
  for (const symbol of state.symbols) {
    const market = allMarkets[symbol];
    if (market) markets[symbol] = market;
  }

  // Keep ID lookups for the retained markets: several CCXT parsers use an
  // exchange market ID while normalising a ticker response.
  const marketsById = {};
  for (const market of Object.values(markets)) {
    if (!market?.id) continue;
    if (!marketsById[market.id]) marketsById[market.id] = [];
    marketsById[market.id].push(market);
  }

  ex.markets = markets;
  ex.markets_by_id = marketsById;
  ex.symbols = Object.keys(markets).sort();
  ex.ids = Object.keys(marketsById).sort();
}

async function loadAndTrimMarkets(ex, state, reload) {
  if (state.loading) return state.loading;

  state.loading = (async () => {
    const result = ex.loadMarkets(reload);
    const loading = ex.marketsLoading;
    try {
      await result;
      state.loaded = true;
      for (const symbol of state.symbols) {
        if (!ex.markets?.[symbol]) state.missing.add(symbol);
      }
      trimMarkets(ex, state);
      // A resolved Promise keeps the full map returned by loadMarkets() alive.
      // We own market loading above, so release CCXT's promise after trimming.
      if (ex.marketsLoading === loading) ex.marketsLoading = undefined;
    } catch (err) {
      if (ex.marketsLoading === loading) ex.marketsLoading = undefined;
      throw err;
    }
  })();

  try {
    await state.loading;
  } finally {
    state.loading = null;
  }
}

// Load the full catalogue only on first use, or when a newly added watchlist
// symbol is not in the retained subset. Invalid symbols are remembered so a
// bad card cannot trigger a full catalogue reload on every poll.
async function ensureMarkets(ex, symbols = []) {
  const state = marketState(ex);
  for (const symbol of symbols) state.symbols.add(symbol);

  const needsInitialLoad = !state.loaded;
  const needsNewSymbolLoad = symbols.some((symbol) => !ex.markets?.[symbol] && !state.missing.has(symbol));
  if (needsInitialLoad || needsNewSymbolLoad) {
    await loadAndTrimMarkets(ex, state, state.loaded);
  }

  trimMarkets(ex, state);
}

export function isSupported(exchangeId) {
  return Boolean(EXCHANGES[exchangeId] && EXCHANGES[exchangeId].supported);
}

// The poller calls this once per exchange/type group, so deleted cards are
// released from the retained catalogue on the following refresh.
export function syncMarketSymbols({ exchange, type }, symbols) {
  const ex = instances.get(`${exchange}:${type}`);
  if (!ex) return;
  const state = marketState(ex);
  state.symbols = new Set(symbols);
  state.missing = new Set([...state.missing].filter((symbol) => state.symbols.has(symbol)));
  if (state.loaded) trimMarkets(ex, state);
}

// True when the error means the symbol does not exist on the exchange
// (vs a transient network/rate error we should not drop on).
export function isBadSymbol(err) {
  return err instanceof ccxt.BadSymbol || /does not have market symbol|symbol .* not found/i.test(err?.message || '');
}

function normalizeTicker(t) {
  let pct = t?.percentage;
  if ((pct === undefined || pct === null) && t?.open && t?.last) {
    pct = ((t.last - t.open) / t.open) * 100;
  }
  return { last: t?.last ?? null, changePct24h: pct ?? null };
}

// Fetch one ticker: { last, changePct24h }.
export async function fetchTicker({ exchange, symbol, type }) {
  const ex = getInstance(exchange, type);
  if (!ex) throw new Error(`unsupported exchange: ${exchange}`);
  await ensureMarkets(ex, [symbol]);
  const t = await ex.fetchTicker(symbol);
  return normalizeTicker(t);
}

// Fetch several tickers in one request when the adapter supports it. A null
// result tells the poller to use the individual fetchTicker path instead.
export async function fetchTickers({ exchange, type }, symbols) {
  const ex = getInstance(exchange, type);
  if (!ex) throw new Error(`unsupported exchange: ${exchange}`);
  const uniqueSymbols = [...new Set(symbols)];
  await ensureMarkets(ex, uniqueSymbols);
  if (!ex.has.fetchTickers) return null;
  const tickers = await ex.fetchTickers(uniqueSymbols);
  const result = new Map();
  for (const [key, ticker] of Object.entries(tickers || {})) {
    result.set(ticker?.symbol || key, normalizeTicker(ticker));
  }
  return result;
}

// Fetch 24h sparkline as an array of close prices.
export async function fetchSparkline({ exchange, symbol, type }, timeframe, limit) {
  const ex = getInstance(exchange, type);
  if (!ex) throw new Error(`unsupported exchange: ${exchange}`);
  await ensureMarkets(ex, [symbol]);
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
  await ensureMarkets(ex, [symbol]);
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
