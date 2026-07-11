import express from 'express';
import fs from 'node:fs';
import { PORT, WEB_DIST } from './config.js';
import { allTickers, dropTicker } from './cache.js';
import { loadWatchlist, saveWatchlist, cardId } from './watchlist.js';
import { startPoller, pollCard } from './poller.js';
import { EXCHANGES, isSupported, fetchCandles } from './adapters/index.js';
import { authHeaders, authRoutes, requireAuth, requireEditor } from './auth.js';

const app = express();
app.use(express.json());
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(authHeaders);
authRoutes(app);
app.use('/api', requireAuth);

// --- API ---

// Supported exchanges (for the add-card UI).
app.get('/api/exchanges', (_req, res) => {
  res.json(EXCHANGES);
});

// Current ticker data for every card on the watchlist.
app.get('/api/tickers', (_req, res) => {
  res.json(allTickers());
});

// OHLC candles for the chart popup. Default: 5m candles over the last 3h. On-demand only.
app.get('/api/ohlcv', async (req, res) => {
  const { exchange, symbol, type = 'spot', tf = '5m' } = req.query;
  const hours = Number(req.query.hours) || 3;
  if (!exchange || !symbol) return res.status(400).json({ error: 'exchange and symbol required' });
  if (!isSupported(exchange)) return res.status(400).json({ error: `unsupported exchange: ${exchange}` });
  try {
    const candles = await fetchCandles({ exchange, symbol, type }, tf, hours * 60 * 60 * 1000);
    res.json(candles);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read the saved watchlist (cards + order).
app.get('/api/watchlist', async (_req, res) => {
  try {
    res.json(await loadWatchlist());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Replace the whole watchlist (used for reorder).
app.put('/api/watchlist', requireEditor, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'expected array' });
    const saved = await saveWatchlist(req.body);
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add a single card.
app.post('/api/watchlist', requireEditor, async (req, res) => {
  try {
    const { exchange, symbol, type = 'spot' } = req.body || {};
    if (!exchange || !symbol) return res.status(400).json({ error: 'exchange and symbol required' });
    if (!isSupported(exchange)) return res.status(400).json({ error: `unsupported exchange: ${exchange}` });
    const card = { exchange, symbol, type, id: cardId({ exchange, symbol, type }) };
    const cards = await loadWatchlist();
    if (cards.some((c) => c.id === card.id)) return res.status(409).json({ error: 'already exists' });
    // Validate the pair exists before saving — drop nonexistent pairs up front.
    try {
      await pollCard(card);
    } catch {
      return res.status(400).json({ error: `pair not found: ${symbol} on ${exchange}` });
    }
    cards.push(card);
    await saveWatchlist(cards);
    res.json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a card by id.
app.delete('/api/watchlist/:id', requireEditor, async (req, res) => {
  try {
    const cards = await loadWatchlist();
    const next = cards.filter((c) => c.id !== req.params.id);
    await saveWatchlist(next);
    dropTicker(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Static frontend ---
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (_req, res) => res.sendFile(`${WEB_DIST}/index.html`));
} else {
  console.warn('web/dist not found — run `npm run build`. API still available.');
}

app.listen(PORT, () => {
  console.log(`watchlist server on http://localhost:${PORT}`);
  startPoller();
});
