<!-- @migration-task Error while migrating Svelte code: can't migrate `let state: 'loading' | 'loaded' | 'error' = 'loading';` to `$state` because there's a variable named state.
     Rename the variable and try again or migrate by hand. -->
<script lang="ts">
  import { onMount } from 'svelte';

  export let url: string;

  interface OgData {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
    favicon?: string;
  }

  let state: 'loading' | 'loaded' | 'error' = 'loading';
  let data: OgData | null = null;

  // Module-level cache so the same URL never double-fetches across lynts in the feed
  const _cache = new Map<string, OgData | null>();

  onMount(async () => {
    if (_cache.has(url)) {
      data = _cache.get(url) ?? null;
      state = data ? 'loaded' : 'error';
      return;
    }
    try {
      const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      if (json.error || (!json.title && !json.description && !json.image)) {
        _cache.set(url, null);
        state = 'error';
        return;
      }
      data = json as OgData;
      _cache.set(url, data);
      state = 'loaded';
    } catch {
      _cache.set(url, null);
      state = 'error';
    }
  });

  function trimUrl(u: string) {
    try {
      const p = new URL(u);
      return (p.hostname + p.pathname).replace(/\/$/, '').slice(0, 60);
    } catch { return u.slice(0, 60); }
  }

  function imageError(e: Event) {
  	const img = e.currentTarget as HTMLImageElement;
  	img.closest('.og-img-wrap')?.remove();
  }

  function faviconError(e: Event) {
        const img = e.currentTarget as HTMLImageElement;
        img.style.display = 'none';
  }
</script>

{#if state === 'loading'}
  <div class="og-card og-skeleton" aria-hidden="true">
    <div class="og-skeleton-img"></div>
    <div class="og-skeleton-body">
      <div class="og-skeleton-line short"></div>
      <div class="og-skeleton-line"></div>
      <div class="og-skeleton-line medium"></div>
    </div>
  </div>
{:else if state === 'loaded' && data}
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    class="og-card og-loaded"
    on:click|stopPropagation
  >
    {#if data.image}
      <div class="og-img-wrap">
        <img src={data.image} alt={data.title ?? ''} loading="lazy" on:error={imageError}/>
      </div>
    {/if}
    <div class="og-body">
      <div class="og-meta">
        {#if data.favicon}
          <img class="og-favicon" src={data.favicon} alt="" loading="lazy" on:error={faviconError} />
        {/if}
        <span class="og-site">{data.siteName ?? trimUrl(url)}</span>
      </div>
      {#if data.title}
        <p class="og-title">{data.title}</p>
      {/if}
      {#if data.description}
        <p class="og-desc">{data.description}</p>
      {/if}
      <span class="og-url">{trimUrl(url)}</span>
    </div>
  </a>
{/if}

<style>
  /* ── Card shell ── */
  .og-card {
    display: flex;
    flex-direction: column;
    margin-top: 10px;
    border-radius: 8px;
    overflow: hidden;
    border: var(--ghost-border);
    background: hsl(var(--card));
    box-shadow: var(--inset-shadow);
    text-decoration: none !important;
    transition: box-shadow 0.15s ease, background 0.15s ease;
    max-width: 100%;
  }
  .og-loaded:hover {
    box-shadow: var(--float-shadow);
    background: hsl(var(--popover));
  }

  /* ── Image ── */
  .og-img-wrap {
    width: 100%;
    max-height: 200px;
    overflow: hidden;
    background: hsl(var(--muted));
    border-bottom: var(--ghost-border);
  }
  .og-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Body ── */
  .og-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .og-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 2px;
  }
  .og-favicon {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .og-site {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: hsl(var(--muted-foreground));
    font-family: 'Work Sans', sans-serif;
  }
  .og-title {
    font-family: 'Work Sans', sans-serif;
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1.25;
    color: hsl(var(--foreground));
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 1px 1px 2px rgba(60,30,0,0.07);
  }
  .og-desc {
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .og-url {
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
    opacity: 0.65;
    margin-top: 2px;
    font-family: 'Fira Mono', monospace;
  }

  /* ── Skeleton ── */
  .og-skeleton {
    pointer-events: none;
  }
  .og-skeleton-img {
    width: 100%;
    height: 120px;
    background: hsl(var(--muted));
    border-bottom: var(--ghost-border);
    animation: og-pulse 1.6s ease-in-out infinite;
  }
  .og-skeleton-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .og-skeleton-line {
    height: 10px;
    border-radius: 4px;
    width: 100%;
    background: hsl(var(--muted));
    animation: og-pulse 1.6s ease-in-out infinite;
  }
  .og-skeleton-line.short  { width: 35%; }
  .og-skeleton-line.medium { width: 70%; }

  @keyframes og-pulse {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1;   }
  }
</style>
