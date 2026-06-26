<script>
  import { onMount } from 'svelte';
  import { getOhlcv } from './api.js';

  // card: { exchange, symbol, type }. label: exchange display name. onClose: () => void.
  let { card, label, onClose } = $props();

  let chartEl;
  let chart;
  let error = $state(null);
  let loading = $state(true);

  const base = (card.symbol || '').split('/')[0];
  const quote = (card.symbol || '').split('/')[1] || '';

  onMount(() => {
    let disposed = false;

    (async () => {
      let candles;
      try {
        candles = await getOhlcv({ exchange: card.exchange, symbol: card.symbol, type: card.type, tf: '5m', hours: 3 });
      } catch (e) {
        error = e.message;
        loading = false;
        return;
      }
      if (disposed) return;
      loading = false;
      if (!candles.length) {
        error = 'no candle data';
        return;
      }

      // Lazy-load the charting lib only when a chart is actually opened.
      const { createChart, CandlestickSeries } = await import('lightweight-charts');
      if (disposed) return;

      chart = createChart(chartEl, {
        layout: { background: { color: 'transparent' }, textColor: '#8a909a', attributionLogo: false },
        grid: { vertLines: { color: '#23272e' }, horzLines: { color: '#23272e' } },
        rightPriceScale: { borderColor: '#23272e' },
        timeScale: { borderColor: '#23272e', timeVisible: true, secondsVisible: false },
        autoSize: true
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#2ebd6b',
        downColor: '#f0405a',
        borderVisible: false,
        wickUpColor: '#2ebd6b',
        wickDownColor: '#f0405a'
      });
      series.setData(candles);
      chart.timeScale().fitContent();
    })();

    return () => {
      disposed = true;
      chart?.remove();
    };
  });

  function onKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="modal-backdrop" onclick={onClose}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <div class="modal-title">
        <span class="m-ex">{label || card.exchange}</span>
        <span class="m-pair">{base}<span class="m-quote">/{quote}</span></span>
        {#if card.type === 'swap'}<span class="m-badge">PERP</span>{/if}
        <span class="m-tf">5m · 3h</span>
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
  .modal-title { display: flex; align-items: baseline; gap: 8px; }
  .m-ex { font-size: 10px; text-transform: uppercase; color: var(--fg-dim); letter-spacing: 0.04em; }
  .m-pair { font-size: 16px; font-weight: 700; color: var(--fg); }
  .m-quote { color: var(--fg-dim); font-weight: 400; font-size: 12px; }
  .m-badge { font-size: 8px; padding: 0 3px; border-radius: 3px; background: var(--badge-bg); color: var(--fg-dim); }
  .m-tf { font-size: 11px; color: var(--fg-dim); margin-left: 4px; }
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
