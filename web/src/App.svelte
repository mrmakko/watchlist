<script>
  import { onMount } from 'svelte';
  import Sortable from 'sortablejs';
  import Card from './Card.svelte';
  import ChartModal from './ChartModal.svelte';
  import { COLOR_KEYS, colorOf } from './colors.js';
  import { getTickers, getWatchlist, getExchanges, putWatchlist, addCard, deleteCard } from './api.js';

  let watchlist = $state([]); // ordered [{id, exchange, symbol, type, color}]
  let tickers = $state({}); // id -> ticker data
  let exchanges = $state({}); // id -> { label, supported }
  let sortByMove = $state(false);
  let lastUpdate = $state(null);
  let collapsed = $state(new Set(loadCollapsed())); // group keys (pair base) that are collapsed
  let palette = $state(null); // { id, x, y, current } right-click colour menu
  let chartCard = $state(null); // card shown in the candle-chart popup

  let gridEl;
  let sortable;
  let addOpen = $state(false);
  let form = $state({ exchange: 'binance', symbol: '', type: 'spot' });

  function loadCollapsed() {
    try {
      return JSON.parse(localStorage.getItem('wl_collapsed') || '[]');
    } catch {
      return [];
    }
  }

  const base = (sym) => (sym || '').split('/')[0];

  // Config (watchlist) wins for id/exchange/symbol/type/color; ticker adds live price/sparkline.
  const cards = $derived(watchlist.map((w) => ({ ...(tickers[w.id] || {}), ...w })));

  const view = $derived(
    sortByMove
      ? [...cards].sort((a, b) => Math.abs(b.changePct24h || 0) - Math.abs(a.changePct24h || 0))
      : cards
  );

  // Per-card group metadata: size of same-pair group, representative flag, collapsed/hidden.
  const items = $derived.by(() => {
    const counts = {};
    for (const c of view) counts[base(c.symbol)] = (counts[base(c.symbol)] || 0) + 1;
    const seen = new Set();
    return view.map((c) => {
      const b = base(c.symbol);
      const groupSize = counts[b];
      const isRep = !seen.has(b);
      seen.add(b);
      const isCollapsed = groupSize > 1 && collapsed.has(b);
      return { card: c, groupSize, isRep, isCollapsed, hidden: isCollapsed && !isRep };
    });
  });

  const supportedList = $derived(
    Object.entries(exchanges)
      .filter(([, v]) => v.supported)
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
  );

  function indexTickers(arr) {
    const map = {};
    for (const t of arr) map[t.id] = t;
    return map;
  }

  async function refreshTickers() {
    try {
      tickers = indexTickers(await getTickers());
      lastUpdate = new Date();
    } catch (e) {
      console.error('ticker refresh failed', e);
    }
  }

  const reloadWatchlist = async () => (watchlist = await getWatchlist());

  async function onDelete(id) {
    await deleteCard(id);
    watchlist = watchlist.filter((c) => c.id !== id);
  }

  async function onAdd() {
    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol) return;
    try {
      await addCard({ exchange: form.exchange, symbol, type: form.type });
      await reloadWatchlist();
      await refreshTickers();
      form.symbol = '';
      addOpen = false;
    } catch (e) {
      alert(e.message);
    }
  }

  function toggleCollapse(b) {
    const s = new Set(collapsed);
    s.has(b) ? s.delete(b) : s.add(b);
    collapsed = s;
    localStorage.setItem('wl_collapsed', JSON.stringify([...s]));
  }

  function openColorMenu(card, e) {
    palette = { id: card.id, x: e.clientX, y: e.clientY, current: card.color || 'none' };
  }

  async function setColor(color) {
    const id = palette.id;
    palette = null;
    watchlist = watchlist.map((c) => (c.id === id ? { ...c, color } : c));
    try {
      await putWatchlist(watchlist);
    } catch (e) {
      console.error('save colour failed', e);
    }
  }

  // Persist new order after a drag (manual-order mode only).
  async function persistOrder() {
    const ids = [...gridEl.querySelectorAll('[data-id]')].map((el) => el.dataset.id);
    const byId = Object.fromEntries(watchlist.map((c) => [c.id, c]));
    watchlist = ids.map((id) => byId[id]).filter(Boolean);
    try {
      await putWatchlist(watchlist);
    } catch (e) {
      console.error('save order failed', e);
    }
  }

  onMount(async () => {
    exchanges = await getExchanges();
    await reloadWatchlist();
    await refreshTickers();

    sortable = Sortable.create(gridEl, {
      animation: 120,
      handle: '.card',
      draggable: '.card',
      filter: '.tool',
      onEnd: () => {
        if (!sortByMove) persistOrder();
      }
    });

    const timer = setInterval(refreshTickers, 60_000);
    const closePalette = () => (palette = null);
    window.addEventListener('click', closePalette);
    return () => {
      clearInterval(timer);
      window.removeEventListener('click', closePalette);
      sortable?.destroy();
    };
  });

  $effect(() => {
    if (sortable) sortable.option('disabled', sortByMove);
  });
</script>

<header>
  <div class="title">⌁ Crypto Watchlist</div>
  <div class="controls">
    <label class="toggle">
      <input type="checkbox" bind:checked={sortByMove} />
      Sort by movement
    </label>
    <button class="add-btn" onclick={() => (addOpen = !addOpen)}>+ Add</button>
    {#if lastUpdate}
      <span class="updated">updated {lastUpdate.toLocaleTimeString()}</span>
    {/if}
  </div>
</header>

{#if addOpen}
  <div class="add-form">
    <select bind:value={form.exchange}>
      {#each supportedList as [id, meta]}
        <option value={id}>{meta.label}</option>
      {/each}
    </select>
    <input placeholder="PAIR e.g. BTC/USDT" bind:value={form.symbol} onkeydown={(e) => e.key === 'Enter' && onAdd()} />
    <select bind:value={form.type}>
      <option value="spot">Spot</option>
      <option value="swap">Perp</option>
    </select>
    <button onclick={onAdd}>Add</button>
  </div>
{/if}

<main bind:this={gridEl} class="grid">
  {#each items as it (it.card.id)}
    <Card
      card={it.card}
      label={exchanges[it.card.exchange]?.label}
      groupSize={it.groupSize}
      isCollapsed={it.isCollapsed}
      isRep={it.isRep}
      hidden={it.hidden}
      onColorMenu={openColorMenu}
      onToggleCollapse={toggleCollapse}
      onChart={(c) => (chartCard = c)}
    />
  {/each}
</main>

{#if palette}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="palette" role="presentation" style="left:{palette.x}px; top:{palette.y}px" onclick={(e) => e.stopPropagation()}>
    <div class="swatches">
      {#each COLOR_KEYS as key}
        <button
          class="swatch"
          class:sel={palette.current === key}
          class:none={key === 'none'}
          style="background:{colorOf(key)}"
          title={key}
          aria-label={key}
          onclick={() => setColor(key)}
        ></button>
      {/each}
    </div>
    <button
      class="pal-del"
      onclick={() => {
        const id = palette.id;
        palette = null;
        onDelete(id);
      }}>Delete card</button
    >
  </div>
{/if}

{#if chartCard}
  <ChartModal card={chartCard} label={exchanges[chartCard.exchange]?.label} onClose={() => (chartCard = null)} />
{/if}
