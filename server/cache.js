// In-memory ticker cache. Keyed by card id. Rebuilt from live polls on restart.
const store = new Map();

export function setTicker(id, data) {
  const prev = store.get(id) || {};
  store.set(id, { ...prev, ...data, id });
}

export function getTicker(id) {
  return store.get(id);
}

export function allTickers() {
  return [...store.values()];
}

export function dropTicker(id) {
  store.delete(id);
}
