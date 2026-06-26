import {
  TICKER_INTERVAL_MS,
  SPARKLINE_EVERY_N_LOOPS,
  SPARKLINE_TIMEFRAME,
  SPARKLINE_POINTS,
  POLL_CONCURRENCY
} from './config.js';
import { fetchTicker, fetchSparkline, isSupported, isBadSymbol } from './adapters/index.js';
import { setTicker, dropTicker } from './cache.js';
import { loadWatchlist, removeCards } from './watchlist.js';

let loopCount = 0;
let timer = null;

// Run async fn over items with a bounded concurrency pool.
async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// Returns card.id when the card should be dropped (unsupported exchange or
// nonexistent symbol), otherwise null.
async function pollOne(card, withSparkline) {
  if (!isSupported(card.exchange)) return card.id; // skip unsupported, drop it
  try {
    const { last, changePct24h } = await fetchTicker(card);
    const patch = { ...card, last, changePct24h, updated: Date.now(), stale: false, error: null };
    if (withSparkline) {
      try {
        const sparkline = await fetchSparkline(card, SPARKLINE_TIMEFRAME, SPARKLINE_POINTS);
        if (sparkline && sparkline.length) patch.sparkline = sparkline;
      } catch {
        /* sparkline optional — keep last good one */
      }
    }
    setTicker(card.id, patch);
    return null;
  } catch (err) {
    if (isBadSymbol(err)) return card.id; // pair does not exist — drop it
    // transient (network/rate) — keep card, mark stale, retry next loop
    setTicker(card.id, { ...card, stale: true, error: err.message || 'fetch failed' });
    return null;
  }
}

// One full pass over the current watchlist. Auto-drops unsupported/nonexistent cards.
export async function pollOnce() {
  const cards = await loadWatchlist();
  const withSparkline = loopCount % SPARKLINE_EVERY_N_LOOPS === 0;
  loopCount += 1;
  const drops = [];
  await pool(cards, POLL_CONCURRENCY, async (card) => {
    const dropId = await pollOne(card, withSparkline);
    if (dropId) drops.push(dropId);
  });
  if (drops.length) {
    for (const id of drops) dropTicker(id);
    await removeCards(drops);
    console.log('dropped cards:', drops.join(', '));
  }
}

// Immediate single-card fetch (used when a card is added).
// Throws on bad symbol / unsupported so the caller can reject the add.
export async function pollCard(card) {
  if (!isSupported(card.exchange)) throw new Error(`unsupported exchange: ${card.exchange}`);
  const { last, changePct24h } = await fetchTicker(card);
  const patch = { ...card, last, changePct24h, updated: Date.now(), stale: false, error: null };
  try {
    const sparkline = await fetchSparkline(card, SPARKLINE_TIMEFRAME, SPARKLINE_POINTS);
    if (sparkline && sparkline.length) patch.sparkline = sparkline;
  } catch {
    /* sparkline optional */
  }
  setTicker(card.id, patch);
}

export function startPoller() {
  pollOnce().catch((e) => console.error('initial poll failed', e));
  timer = setInterval(() => {
    pollOnce().catch((e) => console.error('poll failed', e));
  }, TICKER_INTERVAL_MS);
}

export function stopPoller() {
  if (timer) clearInterval(timer);
}
