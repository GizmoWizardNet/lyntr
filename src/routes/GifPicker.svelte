<script lang="ts">
	import { Search } from 'lucide-svelte';

	interface GifResult {
		id: string;
		title: string;
		url: string;
		preview_url: string;
		width: number;
		height: number;
	}

	interface Props {
		onselect: (gif: GifResult) => void;
	}

	let { onselect }: Props = $props();

	let query = $state('');
	let results = $state<GifResult[]>([]);
	let loading = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;

	async function search(q: string) {
		loading = true;
		try {
			const res = await fetch(`/api/gif?q=${encodeURIComponent(q)}&limit=24`);
			const data = await res.json();
			results = data.results ?? [];
		} finally {
			loading = false;
		}
	}

	async function loadFeatured() {
		loading = true;
		try {
			const res = await fetch('/api/gif?limit=24');
			const data = await res.json();
			results = data.results ?? [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadFeatured();
	});

	function onInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			if (query.trim()) search(query.trim());
			else loadFeatured();
		}, 350);
	}
</script>

<div class="gif-picker">
	<div class="search-row">
		<Search size={14} />
		<input
			class="search-input"
			type="text"
			placeholder="Search KLIPY…"
			bind:value={query}
			oninput={onInput}
		/>
	</div>

	{#if loading}
		<div class="loading">Loading…</div>
	{:else if results.length === 0}
		<div class="loading">No results</div>
	{:else}
		<div class="grid">
			{#each results as gif (gif.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="cell" onclick={() => onselect(gif)}>
					<img
						src={gif.preview_url}
						alt={gif.title}
						loading="lazy"
						style="aspect-ratio: {gif.width}/{gif.height}"
					/>
				</div>
			{/each}
		</div>
	{/if}

	<p class="klipy-credit">Powered by KLIPY</p>
</div>

<style>
	.gif-picker {
		width: 320px;
		max-height: 400px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: hsl(var(--card));
		border: 1.5px solid hsl(var(--border));
		border-radius: 12px;
		overflow: hidden;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 6px;
		background: hsl(var(--muted));
		border-radius: 8px;
		padding: 6px 10px;
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 13px;
		color: hsl(var(--foreground));
	}
	.search-input::placeholder { color: hsl(var(--muted-foreground)); }

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		overflow-y: auto;
		flex: 1;
	}

	.cell {
		cursor: pointer;
		border-radius: 6px;
		overflow: hidden;
		background: hsl(var(--muted));
	}
	.cell:hover { opacity: 0.8; }
	.cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

	.loading {
		text-align: center;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
		padding: 20px;
	}

	.klipy-credit {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
		text-align: right;
		margin: 0;
		flex-shrink: 0;
	}
</style>
