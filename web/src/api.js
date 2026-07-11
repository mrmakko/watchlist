// Thin fetch wrappers around the server API.
async function json(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const getAuthStatus = () => json('/api/auth/status');
export const login = (pin) => json('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
});
export const logout = () => json('/api/auth/logout', { method: 'POST' });

export const getTickers = () => json('/api/tickers');
export const getWatchlist = () => json('/api/watchlist');
export const getExchanges = () => json('/api/exchanges');

export const getOhlcv = ({ exchange, symbol, type, tf = '5m', hours = 3 }) =>
  json(
    `/api/ohlcv?exchange=${encodeURIComponent(exchange)}&symbol=${encodeURIComponent(symbol)}` +
      `&type=${type}&tf=${tf}&hours=${hours}`
  );

export const putWatchlist = (cards) =>
  json('/api/watchlist', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cards)
  });

export const addCard = (card) =>
  json('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card)
  });

export const deleteCard = (id) => json(`/api/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' });
