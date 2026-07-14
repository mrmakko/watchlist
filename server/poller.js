import {
  TICKER_INTERVAL_MS,
  SPARKLINE_EVERY_N_LOOPS,
  SPARKLINE_TIMEFRAME,
  SPARKLINE_POINTS,
  POLL_CONCURRENCY
} from './config.js';
import { fetchTicker, fetchTickers, fetchSparkline, isSupported, isBadSymbol } from './adapters/index.js';
import { setTicker, dropTicker } from './cache.js';
import { loadWatchlist, removeCards } from './watchlist.js';

let loopCount = 0;
let timer = null;
let runningPoll = null;
let pollerGeneration = 0;

function mb(bytes) {
  return Math.round(bytes / 1024 / 1024);
}

function memorySummary() {
  const memory = process.memoryUsage();
  return `rss=${mb(memory.rss)}MB heap=${mb(memory.heapUsed)}/${mb(memory.heapTotal)}MB external=${mb(memory.external)}MB arrayBuffers=${mb(memory.arrayBuffers)}MB`;
}

async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

async function pollOne(card, stats) {
  if (!isSupported(card.exchange)) return card.id;
  try {
    stats.individualRequests += 1;
    const ticker = await fetchTicker(card);
    setTicker(card.id, { ...card, ...ticker, updated: Date.now(), stale: false, error: null });
    return null;
  } catch (err) {
    if (isBadSymbol(err)) return card.id;
    setTicker(card.id, { ...card, stale: true, error: err.message || 'fetch failed' });
    return null;
  }
}

async function pollGroup(cards, stats, drops) {
  const [first] = cards;
  if (!isSupported(first.exchange)) {
    drops.push(...cards.map((card) => card.id));
    return [];
  }

  let batch = null;
  try {
    batch = await fetchTickers(first, cards.map((card) => card.symbol));
    if (batch) stats.batchRequests += 1;
  } catch {
    // Batch failures may be transient or caused by one symbol. Fall back to
    // established per-card handling and never mass-drop an exchange group.
    stats.batchRequests += 1;
    stats.batchFailures += 1;
  }

  const fallback = [];
  if (batch) {
    for (const card of cards) {
      const ticker = batch.get(card.symbol);
      if (ticker) {
        setTicker(card.id, { ...card, ...ticker, updated: Date.now(), stale: false, error: null });
        stats.batchCards += 1;
      } else {
        fallback.push(card);
      }
    }
  } else {
    fallback.push(...cards);
  }

  return fallback;
}

async function refreshSparklines(cards, stats) {
  await pool(cards, POLL_CONCURRENCY, async (card) => {
    if (!isSupported(card.exchange)) return;
    try {
      stats.sparklineRequests += 1;
      const sparkline = await fetchSparkline(card, SPARKLINE_TIMEFRAME, SPARKLINE_POINTS);
      if (sparkline && sparkline.length) setTicker(card.id, { sparkline });
    } catch {
      // Sparkline is optional; retain the last successful value.
    }
  });
}

async function runPoll() {
  const startedAt = Date.now();
  const withSparkline = loopCount % SPARKLINE_EVERY_N_LOOPS === 0;
  loopCount += 1;
  let cards = [];
  const drops = [];
  const stats = { batchRequests: 0, batchFailures: 0, batchCards: 0, individualRequests: 0, sparklineRequests: 0 };
  let outcome = 'ok';
  try {
    cards = await loadWatchlist();
    const groups = new Map();
    for (const card of cards) {
      const key = `${card.exchange}:${card.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    }
    const fallbacks = [];
    await pool([...groups.values()], POLL_CONCURRENCY, async (group) => {
      fallbacks.push(...await pollGroup(group, stats, drops));
    });
    // Keep one global concurrency cap; nested pools would multiply the limit.
    await pool(fallbacks, POLL_CONCURRENCY, async (card) => {
      const dropId = await pollOne(card, stats);
      if (dropId) drops.push(dropId);
    });
    if (withSparkline) {
      const dropped = new Set(drops);
      await refreshSparklines(cards.filter((card) => !dropped.has(card.id)), stats);
    }
    if (drops.length) {
      for (const id of drops) dropTicker(id);
      await removeCards(drops);
      console.log('dropped cards:', drops.join(', '));
    }
  } catch (error) {
    outcome = 'failed';
    throw error;
  } finally {
    console.log(
      `poll ${outcome}: cards=${cards.length} dropped=${drops.length} sparkline=${withSparkline} ` +
      `requests=batch:${stats.batchRequests} batchFailures:${stats.batchFailures} batchCards:${stats.batchCards} ` +
      `individual:${stats.individualRequests} sparkline:${stats.sparklineRequests} ` +
      `duration=${Date.now() - startedAt}ms ${memorySummary()}`
    );
  }
}

export function pollOnce() {
  if (runningPoll) return runningPoll;
  runningPoll = runPoll().finally(() => {
    runningPoll = null;
  });
  return runningPoll;
}

export async function pollCard(card) {
  if (!isSupported(card.exchange)) throw new Error(`unsupported exchange: ${card.exchange}`);
  const ticker = await fetchTicker(card);
  const patch = { ...card, ...ticker, updated: Date.now(), stale: false, error: null };
  try {
    const sparkline = await fetchSparkline(card, SPARKLINE_TIMEFRAME, SPARKLINE_POINTS);
    if (sparkline && sparkline.length) patch.sparkline = sparkline;
  } catch {
    // Sparkline is optional.
  }
  setTicker(card.id, patch);
}

export function startPoller() {
  stopPoller();
  const generation = pollerGeneration;
  const runAndSchedule = async () => {
    try {
      await pollOnce();
    } catch (e) {
      console.error('poll failed', e);
    }
    if (generation !== pollerGeneration) return;
    timer = setTimeout(runAndSchedule, TICKER_INTERVAL_MS);
  };
  void runAndSchedule();
}

export function stopPoller() {
  pollerGeneration += 1;
  if (timer) clearTimeout(timer);
  timer = null;
}
