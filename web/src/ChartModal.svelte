<script>
  import { onMount } from 'svelte';
  import { getOhlcv } from './api.js';

  // card: { exchange, symbol, type }. label: exchange display name. onClose: () => void.
  let { card, label, onClose } = $props();

  // Timeframe presets: { tf, hours = span fetched back }.
  const TIMEFRAMES = [
    { tf: '5m', hours: 3, label: '5m' },
    { tf: '15m', hours: 12, label: '15m' },
    { tf: '1h', hours: 24 * 3, label: '1h' },
    { tf: '4h', hours: 24 * 10, label: '4h' },
    { tf: '1d', hours: 24 * 60, label: '1d' }
  ];

  let chartEl;
  let chart;
  let series;
  let alive = true;
  let error = $state(null);
  let loading = $state(true);
  let sel = $state('5m');

  const base = $derived((card.symbol || '').split('/')[0]);
  const quote = $derived((card.symbol || '').split('/')[1] || '');

  // Decimal places giving at least 4 significant digits for the given price.
  function decimalsFor(price) {
    const abs = Math.abs(price);
    if (!isFinite(abs) || abs === 0) return 2;
    const d = 3 - Math.floor(Math.log10(abs));
    return Math.min(Math.max(d, 0), 8);
  }

  async function load() {
    const item = TIMEFRAMES.find((t) => t.tf === sel) || TIMEFRAMES[0];
    loading = true;
    error = null;
    let candles;
    try {
      candles = await getOhlcv({ exchange: card.exchange, symbol: card.symbol, type: card.type, tf: item.tf, hours: item.hours });
    } catch (e) {
      if (!alive) return;
      error = e.message;
      loading = false;
      return;
    }
    if (!alive || !series) return;
    loading = false;
    if (!candles.length) {
      error = 'no candle data';
      series.setData([]);
      return;
    }
    const dec = decimalsFor(candles[candles.length - 1].close);
    series.applyOptions({ priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) } });
    series.setData(candles);
    chart.timeScale().fitContent();
  }

  function pick(tf) {
    if (tf === sel) return;
    sel = tf;
    load();
  }

  onMount(() => {
    (async () => {
      // Lazy-load the charting lib only when a chart is actually opened.
      const { createChart, CandlestickSeries } = await import('lightweight-charts');
      if (!alive) return;

      chart = createChart(chartEl, {
        layout: { background: { color: 'transparent' }, textColor: '#8a909a', attributionLogo: false },
        grid: { vertLines: { color: '#23272e' }, horzLines: { color: '#23272e' } },
        rightPriceScale: { borderColor: '#23272e' },
        timeScale: { borderColor: '#23272e', timeVisible: true, secondsVisible: false },
        autoSize: true
      });
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#2ebd6b',
        downColor: '#f0405a',
        borderVisible: false,
        wickUpColor: '#2ebd6b',
        wickDownColor: '#f0405a'
      });
      await load();
    })();

    return () => {
      alive = false;
      chart?.remove();
      chart = null;
      series = null;
    };
  });

  function onKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="modal-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head">
      <div class="modal-title">
        <span class="m-ex">{label || card.exchange}</span>
        <span class="m-pair">{base}<span class="m-quote">/{quote}</span></span>
        {#if card.type === 'swap'}<span class="m-badge">PERP</span>{/if}
      </div>
      <div class="m-tfs">
        {#each TIMEFRAMES as t}
          <button class="m-tfbtn" class:sel={sel === t.tf} onclick={() => pick(t.tf)}>{t.label}</button>
        {/each}
      </div>
      <button class="modal-close" onclick={onClose}>×</button>
    </div>
    <div class="modal-body">
      {#if loading}
        <div class="modal-msg">loading…</div>
      {:else if error}
        <div class="modal-msg err">{error}</div>
      {/if}
      <div class="chart" bind:this={chartEl}></div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: #000a;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .modal {
    width: min(46vw, 720px);
    height: min(52vh, 460px);
    min-width: 360px;
    min-height: 260px;
    background: var(--card-bg);
    border: 1px solid var(--muted-border);
    border-radius: 10px;
    box-shadow: 0 10px 40px #000c;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--card-border);
  }
  .modal-title { display: flex; align-items: baseline; gap: 8px; flex: 1; min-width: 0; }
  .m-ex { font-size: 10px; text-transform: uppercase; color: var(--fg-dim); letter-spacing: 0.04em; }
  .m-pair { font-size: 16px; font-weight: 700; color: var(--fg); }
  .m-quote { color: var(--fg-dim); font-weight: 400; font-size: 12px; }
  .m-badge { font-size: 8px; padding: 0 3px; border-radius: 3px; background: var(--badge-bg); color: var(--fg-dim); }
  .m-tfs { display: flex; gap: 2px; margin: 0 8px; }
  .m-tfbtn {
    border: none;
    background: transparent;
    color: var(--fg-dim);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .m-tfbtn:hover { color: var(--fg); background: var(--badge-bg); }
  .m-tfbtn.sel { color: var(--fg); background: var(--badge-bg); }
  .modal-close {
    border: none;
    background: transparent;
    color: var(--fg-dim);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }
  .modal-close:hover { color: var(--fg); }
  .modal-body { position: relative; flex: 1; }
  .chart { position: absolute; inset: 0; }
  .modal-msg {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-dim);
    font-size: 13px;
    z-index: 2;
  }
  .modal-msg.err { color: var(--down); }
</style>
