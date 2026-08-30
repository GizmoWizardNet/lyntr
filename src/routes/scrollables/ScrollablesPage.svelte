<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Plus, SlidersHorizontal } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import ScrollableCard from './ScrollableCard.svelte';
	import ScrollableComments from './ScrollableComments.svelte';
	import UploadScrollableDialog from './UploadScrollableDialog.svelte';
	import AutoRefreshControl from '../AutoRefreshControl.svelte';
	import { Button } from '@/components/ui/button';
	import { wsClient } from '$lib/ws-client';

	interface Props {
		myId: string;
	}

	let { myId }: Props = $props();

	let items = $state<any[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let activeIndex = $state(0);
	let muted = $state(true);
	// Same "one shared setting, applies to whichever video is active" model
	// as `muted` above — YouTube's playback speed works the same way,
	// persisting across videos within a session. Also persisted to
	// localStorage so it survives a page reload/revisit, matching YouTube's
	// actual cross-session behavior rather than just cross-video.
	const PLAYBACK_SPEED_KEY = 'lyntr_scrollables_playback_speed';
	const VALID_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
	let playbackRate = $state(1);
	let minIq = $state(0);
	let commentsOpenFor = $state<string | null>(null);
	let uploadOpen = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();

	let observer: IntersectionObserver | undefined;
	// Slots can mount (and run the registerSlot action, below) before this
	// component's own onMount has had a chance to construct the observer —
	// Svelte mounts a component's template elements/actions before firing
	// that component's onMount. Anything that registers in that gap is
	// buffered here and flushed once the observer exists.
	let pendingSlots: HTMLDivElement[] = [];

	// Only decode/play video for cards within this many slots of the active
	// one. Scrollables can carry up to 300MB of video each — mounting every
	// <video> in the feed at once (the old behavior) meant a long scroll
	// session kept dozens of decoders alive simultaneously, which is exactly
	// the kind of thing that grinds a phone to a halt. Cards outside the
	// window render just their poster frame instead.
	const RENDER_WINDOW = 2;
	function inWindow(i: number) {
		return Math.abs(i - activeIndex) <= RENDER_WINDOW;
	}

	async function load(reset = true) {
		if (reset) {
			loading = true;
			items = [];
		} else {
			loadingMore = true;
		}

		const params = new URLSearchParams();
		if (minIq) params.set('minIq', String(minIq));
		if (!reset && items.length) params.set('before', items[items.length - 1].createdAt);

		try {
			const res = await fetch(`/api/scrollables?${params.toString()}`);
			if (res.ok) {
				const data = await res.json();
				items = reset ? data.scrollables : [...items, ...data.scrollables];
			} else {
				// Previously failures here were completely silent — no toast,
				// and combined with the missing try/catch below, a network
				// error left the spinner stuck forever with no explanation.
				toast.error('Failed to load Scrollables.');
			}
		} catch {
			toast.error('Failed to load Scrollables. Check your connection and try again.');
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	load();

	function handleIqChange() {
		load(true);
	}

	function setPlaybackRate(rate: number) {
		playbackRate = rate;
		try {
			localStorage.setItem(PLAYBACK_SPEED_KEY, String(rate));
		} catch {
			// Same private-browsing/storage-disabled fallback as the onMount
			// read above — the rate still applies for this session either way.
		}
	}

	function maybeLoadMore() {
		// Fetch the next page once the viewer is within 3 cards of the end —
		// this is what makes the mobile scroll feel infinite rather than
		// hitting a wall. Which card is "active" is handled by the
		// IntersectionObserver below (via the registerSlot action), which is
		// robust to padding/rounding instead of dividing scrollTop by
		// clientHeight the way this page used to.
		if (!loadingMore && activeIndex >= items.length - 3) {
			load(false);
		}
	}

	function handleDeleted(id: string) {
		items = items.filter((i) => i.id !== id);
		if (commentsOpenFor === id) commentsOpenFor = null;
	}

	function handleUploaded(scrollable: any) {
		items = [{ ...scrollable, username: 'You', handle: '', likeCount: 0, commentCount: 0, bookmarkCount: 0, liked: false, bookmarked: false }, ...items];
	}

	// Svelte action: registers each slot element with the shared
	// IntersectionObserver and unregisters it on teardown/id change (e.g.
	// when Svelte reuses a DOM node for a different keyed item on reorder).
	function registerSlot(node: HTMLDivElement, id: string) {
		node.dataset.slotId = id;
		if (observer) observer.observe(node);
		else pendingSlots.push(node);
		return {
			destroy() {
				observer?.unobserve(node);
				pendingSlots = pendingSlots.filter((n) => n !== node);
			}
		};
	}

	// ── Live reactivity (WSS authoritative) ──────────────────────────────
	// Every handler patches `items` by re-mapping to fresh objects so
	// ScrollableCard's $bindable props (which only resync when the object
	// they were spread from actually changes) pick up the server's version —
	// same pattern MainPage.svelte uses for like_update/repost_update on the
	// main feed. The client never trusts its own optimistic math as final;
	// it's just there so a tap feels instant while the real number is in
	// flight over the socket.
	let wsUnsubs: Array<() => void> = [];

	onMount(() => {
		try {
			const stored = Number(localStorage.getItem(PLAYBACK_SPEED_KEY));
			if (stored && VALID_SPEEDS.includes(stored)) playbackRate = stored;
		} catch {
			// localStorage unavailable (private browsing, etc.) — just fall
			// back to the 1x default, no need to surface an error for this.
		}

		observer = new IntersectionObserver(
			(entries) => {
				// The slot with the most visible area is "active". With
				// scroll-snap this is normally unambiguous (one slot fully
				// visible at a time), but taking the max rather than the
				// first >50% match keeps things correct during the snap
				// animation itself, when two slots are briefly both partly
				// visible.
				let best: { id: string; ratio: number } | null = null;
				for (const entry of entries) {
					const id = (entry.target as HTMLElement).dataset.slotId;
					if (!id) continue;
					if (!best || entry.intersectionRatio > best.ratio) {
						best = { id, ratio: entry.intersectionRatio };
					}
				}
				if (best && best.ratio > 0.5) {
					const idx = items.findIndex((i) => i.id === best!.id);
					if (idx !== -1 && idx !== activeIndex) {
						activeIndex = idx;
						maybeLoadMore();
					}
				}
			},
			{ root: containerEl, threshold: [0, 0.5, 0.75, 1] }
		);
		for (const node of pendingSlots) observer.observe(node);
		pendingSlots = [];

		wsClient.connect();
		wsUnsubs = [
			wsClient.on('new_scrollable', (data) => {
				if (items.some((i) => i.id === data.scrollable.id)) return;
				items = [data.scrollable, ...items];
			}),
			wsClient.on('scrollable_like_update', (data) => {
				items = items.map((i) =>
					i.id === data.scrollableId
						? { ...i, likeCount: data.likeCount, liked: data.liked !== undefined ? data.liked : i.liked }
						: i
				);
			}),
			wsClient.on('scrollable_bookmark_update', (data) => {
				items = items.map((i) => (i.id === data.scrollableId ? { ...i, bookmarked: data.bookmarked } : i));
			}),
			wsClient.on('new_scrollable_comment', (data) => {
				items = items.map((i) => (i.id === data.scrollableId ? { ...i, commentCount: data.commentCount } : i));
			}),
			wsClient.on('scrollable_deleted', (data) => {
				handleDeleted(data.scrollableId);
			})
		];
	});

	onDestroy(() => {
		observer?.disconnect();
		wsUnsubs.forEach((u) => u());
	});
</script>

<div class="scrollables-page">
	<div class="toolbar">
		<div class="iq-filter">
			<SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
			<select bind:value={minIq} onchange={handleIqChange}>
				<option value={0}>Any IQ</option>
				<option value={100}>100+ IQ</option>
				<option value={115}>115+ IQ</option>
				<option value={130}>130+ IQ</option>
				<option value={145}>145+ IQ</option>
			</select>
		</div>
		<AutoRefreshControl onRefresh={() => load(true)} storageKey="lyntr_scrollables" defaultEnabled={false} />
		<Button size="sm" onclick={() => (uploadOpen = true)}>
			<Plus class="mr-1 h-4 w-4" /> Post
		</Button>
	</div>

	<!-- Mobile-only floating post button — the toolbar (with the same
	     action) fades out on mobile so the video feed can go full-bleed. -->
	<button class="mobile-post-fab" onclick={() => (uploadOpen = true)} aria-label="Post a scrollable">
		<Plus class="h-5 w-5" />
	</button>


	<div class="feed-viewport" bind:this={containerEl}>
		{#if loading}
			<div class="status">Loading scrollables...</div>
		{:else if items.length === 0}
			<div class="status">No scrollables yet — be the first to post one.</div>
		{:else}
			{#each items as item, i (item.id)}
				<div class="slot" use:registerSlot={item.id}>
					<ScrollableCard
						scrollable={item}
						{myId}
						active={i === activeIndex}
						renderVideo={inWindow(i)}
						{muted}
						onToggleMute={() => (muted = !muted)}
						{playbackRate}
						onSetPlaybackRate={setPlaybackRate}
						onOpenComments={() => (commentsOpenFor = item.id)}
						onDeleted={handleDeleted}
					/>
					{#if commentsOpenFor === item.id}
						<ScrollableComments scrollableId={item.id} onClose={() => (commentsOpenFor = null)} />
					{/if}
				</div>
			{/each}
			{#if loadingMore}
				<div class="load-more-hint">Loading more...</div>
			{/if}
		{/if}
	</div>
</div>

<UploadScrollableDialog bind:open={uploadOpen} onUploaded={handleUploaded} />

<style>
	.scrollables-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		position: relative;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		flex-shrink: 0;
		transition: opacity 0.2s ease;
	}

	/* Full-bleed on mobile — this is a TikTok-style vertical feed, so the
	   IQ filter/refresh controls just get in the way of the video. They
	   stay available on desktop where there's room for them. A floating
	   "+" (below) keeps posting reachable without the toolbar. */
	@media (max-width: 767px) {
		.toolbar {
			opacity: 0;
			pointer-events: none;
			height: 0;
			padding: 0;
			overflow: hidden;
		}
	}

	.mobile-post-fab {
		display: none;
	}
	@media (max-width: 767px) {
		.mobile-post-fab {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			right: 14px;
			bottom: calc(14px + env(safe-area-inset-bottom, 0px));
			width: 44px;
			height: 44px;
			border-radius: 999px;
			z-index: 10;
			background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
			color: hsl(var(--primary-foreground));
			border-top: 1px solid var(--bevel-light);
			border-left: 1px solid var(--bevel-light);
			border-bottom: 1px solid var(--bevel-dark);
			border-right: 1px solid var(--bevel-dark);
			box-shadow: var(--hard-shadow);
		}
	}

	.iq-filter {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.iq-filter select {
		border-radius: 4px;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		background: hsl(var(--input));
		padding: 4px 8px;
		font-family: var(--font-retro);
		font-size: 12px;
		box-shadow: var(--inset-shadow);
	}

	.feed-viewport {
		flex: 1;
		overflow-y: scroll;
		scroll-snap-type: y mandatory;
		scrollbar-width: none;
	}

	.feed-viewport::-webkit-scrollbar {
		display: none;
	}

	.slot {
		position: relative;
		height: 100%;
		scroll-snap-align: start;
		padding: 8px 8px 12px;
	}

	.status {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 0 24px;
	}

	.load-more-hint {
		text-align: center;
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		padding: 10px 0 4px;
	}
</style>