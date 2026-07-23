<script>
  import Sparkline from './Sparkline.svelte';
  import { colorOf } from './colors.js';

  // card: { id, exchange, symbol, type, color, last, changePct24h, volume24h, volume1h, sparkline, stale }
  // group props: groupSize, isCollapsed (group collapsed), isRep (representative of group), hidden
  let {
    card,
    label,
    onColorMenu,
    onToggleCollapse,
    onChart,
    editable = false,
    groupSize = 1,
    isCollapsed = false,
    isRep = false,
    hidden = false
  } = $props();

  const pct = $derived(typeof card.changePct24h === 'number' ? card.changePct24h : null);
  const up = $derived(pct === null ? true : pct >= 0);
  // Heat: how loud the glow is. Saturates around 8% move. (Separate from group colour.)
  const heat = $derived(pct === null ? 0 : Math.min(Math.abs(pct) / 8, 1));
  const hot = $derived(heat >= 0.6);
  const base = $derived((card.symbol || '').split('/')[0]);
  const quote = $derived((card.symbol || '').split('/')[1] || '');

  // Left border = manual grouping colour (default black).
  const borderColor = $derived(colorOf(card.color));
  const accent = $derived(up ? 'var(--up)' : 'var(--down)');
  const style = $derived(`--accent:${accent};--heat:${heat};border-left-color:${borderColor};`);

  const showCollapseBtn = $derived(groupSize > 1 && (!isCollapsed || isRep));

  function fmtPrice(v) {
    if (v === null || v === undefined) return '—';
    if (v === 0) return '0';
    const abs = Math.abs(v);
    let digits;
    if (abs >= 1000) digits = 2;
    else if (abs >= 1) digits = 4;
    else if (abs >= 0.01) digits = 5;
    else digits = 7;
    return v.toLocaleString('en-US', { maximumFractionDigits: digits });
  }

  const fmtPct = (v) => (v === null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

  function fmtVolume(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="card"
  class:hot
  class:stale={card.stale}
  class:hidden
  style={style}
  data-id={card.id}
  oncontextmenu={(e) => {
    if (editable) {
      e.preventDefault();
      onColorMenu(card, e);
    }
  }}
>
  <div class="tools">
    <button
      class="tool"
      title="Candle chart (5m · 3h)"
      onclick={(e) => {
        e.stopPropagation();
        onChart(card);
      }}>📈</button
    >
    {#if showCollapseBtn}
      <button
        class="tool"
        title={isCollapsed ? 'Expand exchanges' : 'Collapse same pair'}
        onclick={(e) => {
          e.stopPropagation();
          onToggleCollapse(base);
        }}>{isCollapsed ? '+' : '−'}</button
      >
    {/if}
  </div>

  <div class="head">
    {#if isCollapsed && isRep}
      <span class="ex multi">{groupSize} exchanges</span>
    {:else}
      <span class="ex">{label || card.exchange}</span>
    {/if}
    {#if card.type === 'swap'}<span class="badge">PERP</span>{/if}
  </div>
  <div class="pair">{base}<span class="quote">/{quote}</span></div>

  <div class="row">
    <Sparkline points={card.sparkline} {up} />
    <span class="volume" title="Volume">
      <span>{fmtVolume(card.volume24h)}</span>
      <span class={card.volume1h === 0 ? 'volume-zero' : ''}>{fmtVolume(card.volume1h)}</span>
    </span>
  </div>

  <div class="bottom">
    <span class="price">{fmtPrice(card.last)}</span>
    {#if pct !== null}
      <span class="pct" class:down={!up}>{fmtPct(pct)}</span>
    {:else}
      <span class="pct na">…</span>
    {/if}
  </div>
</div>

<style>
  .card {
    position: relative;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-left: 3px solid #000;
    border-radius: 6px;
    padding: 6px 8px;
    min-height: 84px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.1s;
  }
  .card.hidden { display: none; }
  .card.hot {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent),
      0 0 14px color-mix(in srgb, var(--accent) calc(var(--heat) * 55%), transparent);
  }
  .card.stale { opacity: 0.5; }

  .tools {
    position: absolute;
    top: 2px;
    right: 3px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .card:hover .tools { opacity: 1; }
  .tool {
    border: none;
    background: transparent;
    color: var(--fg-dim);
    font-size: 14px;
    line-height: 1;
    padding: 1px 3px;
    cursor: pointer;
    border-radius: 3px;
  }
  .tool:hover { color: var(--fg); background: var(--badge-bg); }

  .head { display: flex; align-items: center; gap: 5px; }
  .ex { font-size: 9px; letter-spacing: 0.04em; color: var(--fg-dim); text-transform: uppercase; }
  .ex.multi { color: var(--fg); font-weight: 600; }
  .badge {
    font-size: 8px;
    padding: 0 3px;
    border-radius: 3px;
    background: var(--badge-bg);
    color: var(--fg-dim);
  }
  .pair { font-size: 14px; font-weight: 600; color: var(--fg); line-height: 1.1; }
  .quote { color: var(--fg-dim); font-weight: 400; font-size: 11px; }

  .row { display: flex; align-items: center; justify-content: space-between; margin: 1px 0; }

  .bottom { display: flex; align-items: baseline; justify-content: space-between; margin-top: auto; }
  .price { font-size: 15px; font-weight: 700; color: var(--fg); }
  .volume { display: flex; flex-direction: column; align-items: flex-end; font-size: 9px; line-height: 1.35; color: var(--fg-dim); white-space: nowrap; cursor: help; }
  .volume .volume-zero { color: var(--down); font-weight: 600; }
  .pct { font-size: 11px; font-weight: 600; color: var(--up); }
  .pct.down { color: var(--down); }
  .pct.na { color: var(--fg-dim); }
</style>
