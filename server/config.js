import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');
export const DATA_DIR = path.join(ROOT, 'data');
export const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
export const WATCHLIST_EXAMPLE = path.join(DATA_DIR, 'watchlist.example.json');

export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Poll tickers (price + 24h change) every 2 minutes.
export const TICKER_INTERVAL_MS = 120_000;
// Sparkline (24h OHLCV) changes slowly — refresh every Nth loop only.
export const SPARKLINE_EVERY_N_LOOPS = 15;
// Sparkline shape: 30m candles over ~24h => 48 points.
export const SPARKLINE_TIMEFRAME = '30m';
export const SPARKLINE_POINTS = 48;
// Max concurrent exchange requests in one poll pass.
export const POLL_CONCURRENCY = 4;
