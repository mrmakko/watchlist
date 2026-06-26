import fs from 'node:fs/promises';
import { WATCHLIST_FILE, WATCHLIST_EXAMPLE, DATA_DIR } from './config.js';

// Card id is stable across exchange/symbol/type so the cache and UI agree.
export function cardId({ exchange, symbol, type }) {
  return `${exchange}|${symbol}|${type || 'spot'}`;
}

function normalize(card) {
  const type = card.type || 'spot';
  return {
    id: card.id || cardId({ ...card, type }),
    exchange: card.exchange,
    symbol: card.symbol,
    type,
    // manual grouping colour key (see web/src/colors.js); 'none' = default black
    color: card.color || 'none'
  };
}

export async function loadWatchlist() {
  let raw;
  try {
    raw = await fs.readFile(WATCHLIST_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // First run (personal list is gitignored): seed from the example.
    raw = await fs.readFile(WATCHLIST_EXAMPLE, 'utf8');
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(WATCHLIST_FILE, raw, 'utf8');
  }
  return JSON.parse(raw).map(normalize);
}

export async function saveWatchlist(cards) {
  const clean = cards.map(normalize);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(WATCHLIST_FILE, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

// Remove cards by id from the saved watchlist. Returns the remaining cards.
export async function removeCards(ids) {
  if (!ids || !ids.length) return loadWatchlist();
  const drop = new Set(ids);
  const cards = await loadWatchlist();
  const next = cards.filter((c) => !drop.has(c.id));
  if (next.length !== cards.length) await saveWatchlist(next);
  return next;
}
