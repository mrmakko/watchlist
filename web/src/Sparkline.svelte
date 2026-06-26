<script>
  // points: array of close prices. up: boolean (color hint).
  let { points = [], up = true, w = 96, h = 34 } = $props();

  const path = $derived(buildPath(points, w, h));

  function buildPath(pts, width, height) {
    if (!pts || pts.length < 2) return '';
    let min = Infinity;
    let max = -Infinity;
    for (const v of pts) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const stepX = width / (pts.length - 1);
    const pad = 3; // keep stroke off the edges
    return pts
      .map((v, i) => {
        const x = i * stepX;
        const y = pad + (height - 2 * pad) * (1 - (v - min) / range);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

{#if path}
  <svg viewBox="0 0 {w} {h}" width={w} height={h} class="spark" preserveAspectRatio="none">
    <path d={path} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} stroke-width="1.5"
          stroke-linejoin="round" stroke-linecap="round" />
  </svg>
{:else}
  <div class="spark spark-empty"></div>
{/if}

<style>
  .spark { display: block; }
  .spark-empty { width: 96px; height: 34px; }
</style>
