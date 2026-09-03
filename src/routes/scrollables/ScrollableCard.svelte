<script lang="ts">
	import { Heart, MessageCircle, Bookmark, Share, Volume2, VolumeX, MoreHorizontal, Play, Trash2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import Avatar from '../Avatar.svelte';
	import UserName from '../UserName.svelte';
	import { cdnUrl, scrollableCdnRawUrl, currentPage } from '../stores';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { shareScrollableUrl } from '$lib/share-url';
	import LikersDropdown from '../LikersDropdown.svelte';

	interface Props {
		scrollable: any;
		myId: string;
		active: boolean;
		// Whether this card is inside the render window (see RENDER_WINDOW
		// in ScrollablesPage.svelte). Cards outside it skip the <video> src
		// entirely and show just the poster, so a long scroll session
		// doesn't keep dozens of video decoders alive at once.
		renderVideo: boolean;
		muted: boolean;
		onToggleMute: () => void;
		// YouTube-style playback speed. Lives in the parent (same lifting
		// pattern as `muted`) so it's one shared setting across every card
		// rather than resetting to 1x each time a new video scrolls into
		// view.
		playbackRate: number;
		onSetPlaybackRate: (rate: number) => void;
		onOpenComments: () => void;
		onDeleted: (id: string) => void;
	}

	let { scrollable, myId, active, renderVideo, muted, onToggleMute, playbackRate, onSetPlaybackRate, onOpenComments, onDeleted }: Props = $props();

	// Tracks `scrollable.id` so a like/bookmark tap can update these locally
	// for instant feedback, while a fresh `scrollable` object from the
	// parent (arriving from a WSS broadcast — new likeCount, a comment
	// landing, etc.) always resyncs them to the server's authoritative
	// value. WSS wins; the local edit is just there to cover the round-trip.
	let liked = $state(scrollable.liked);
	let likeCount = $state(scrollable.likeCount);
	let bookmarked = $state(scrollable.bookmarked);
	let commentCount = $state(scrollable.commentCount);
	let lastSyncedId = scrollable.id;

	$effect(() => {
		// Re-run whenever `scrollable` changes identity (parent re-mapped
		// `items`). If it's still the same card, take the server's numbers;
		// a brand new card (feed scrolled/reset) just re-seeds from scratch.
		if (scrollable.id !== lastSyncedId) {
			lastSyncedId = scrollable.id;
		}
		liked = scrollable.liked;
		likeCount = scrollable.likeCount;
		bookmarked = scrollable.bookmarked;
		commentCount = scrollable.commentCount;
	});

	let videoEl: HTMLVideoElement | undefined = $state();
	let paused = $state(false);
	let moreOpen = $state(false);
	let likersHover = $state(false);
	let likersHoverTimer: ReturnType<typeof setTimeout>;

	// Same debounce reasoning as the equivalent in Lynt.svelte — avoid a
	// fetch per accidental cursor pass, and give room to move from the
	// button into the dropdown before it closes.
	function scheduleLikersHover(show: boolean) {
		clearTimeout(likersHoverTimer);
		likersHoverTimer = setTimeout(() => (likersHover = show), show ? 350 : 150);
	}

	$effect(() => {
		if (!videoEl || !renderVideo) return;
		if (active) {
			videoEl.play().catch(() => {});
			paused = false;
		} else {
			videoEl.pause();
			videoEl.currentTime = 0;
		}
	});

	// `playbackRate` isn't a bindable HTML attribute (unlike `muted`) — it
	// has to be set imperatively on the element, so it needs its own
	// effect, re-applied whenever the shared rate changes OR whenever this
	// card gets a freshly-mounted <video> element (scrolling back to a
	// card outside the render window unmounts/remounts it — see
	// `renderVideo` in the Props doc above).
	$effect(() => {
		if (!videoEl) return;
		videoEl.playbackRate = playbackRate;
	});

	const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
	let speedMenuOpen = $state(false);

	function selectSpeed(rate: number) {
		onSetPlaybackRate(rate);
		speedMenuOpen = false;
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) {
			videoEl.play();
			paused = false;
		} else {
			videoEl.pause();
			paused = true;
		}
	}

	async function toggleLike() {
		const wasLiked = liked;
		liked = !liked;
		likeCount += liked ? 1 : -1;
		const res = await fetch(`/api/scrollables/${scrollable.id}/like`, { method: 'POST' });
		if (!res.ok) {
			liked = wasLiked;
			likeCount += wasLiked ? 1 : -1;
			toast.error('Could not like this scrollable.');
		}
	}

	async function toggleBookmark() {
		const was = bookmarked;
		bookmarked = !bookmarked;
		const res = await fetch(`/api/scrollables/${scrollable.id}/bookmark`, { method: 'POST' });
		if (!res.ok) {
			bookmarked = was;
			toast.error('Could not save this scrollable.');
		} else {
			toast.success(bookmarked ? 'Saved to bookmarks.' : 'Removed from bookmarks.');
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(shareScrollableUrl(scrollable.id));
		toast.success('Link copied!');
	}

	function goToProfile() {
		currentPage.set('profile' + scrollable.handle);
	}

	async function handleDelete() {
		moreOpen = false;
		const res = await fetch(`/api/scrollables/${scrollable.id}`, { method: 'DELETE' });
		if (res.ok) {
			toast.success('Scrollable deleted.');
			onDeleted(scrollable.id);
		} else {
			toast.error('Could not delete this scrollable.');
		}
	}
</script>

<div class="scrollable-card">
	<div
		class="video-wrap"
		onclick={togglePlay}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && togglePlay()}
		role="button"
		tabindex="0"
	>
		{#if renderVideo}
			<video
				bind:this={videoEl}
				src={scrollableCdnRawUrl(`${scrollable.videoKey}.mp4`)}
				poster={scrollable.thumbnailKey ? scrollableCdnRawUrl(`${scrollable.thumbnailKey}.webp`) : undefined}
				{muted}
				loop
				playsinline
				preload={active ? 'auto' : 'metadata'}
				class="video-el"
			></video>
		{:else if scrollable.thumbnailKey}
			<!-- Outside the render window: just the poster frame, no decoder
			     mounted. Swapped back in for a real <video> the moment this
			     card re-enters the window (see RENDER_WINDOW). -->
			<img
				class="video-el poster-el"
				src={scrollableCdnRawUrl(`${scrollable.thumbnailKey}.webp`)}
				alt=""
				loading="lazy"
			/>
		{:else}
			<div class="video-el poster-fallback"></div>
		{/if}

		{#if paused && renderVideo}
			<div class="play-overlay"><Play class="h-16 w-16" fill="white" /></div>
		{/if}

		<button class="mute-btn" onclick={(e) => { e.stopPropagation(); onToggleMute(); }}>
			{#if muted}<VolumeX class="h-5 w-5" />{:else}<Volume2 class="h-5 w-5" />{/if}
		</button>

		<!-- Playback speed — same YouTube-style control, sitting just above
		     the mute button so both live in one predictable corner. -->
		<Popover.Root bind:open={speedMenuOpen}>
			<Popover.Trigger asChild>
				{#snippet children({ builder }: { builder: any })}
					<button
						{...builder}
						class="speed-btn"
						onclick={(e) => { e.stopPropagation(); speedMenuOpen = !speedMenuOpen; }}
					>
						{playbackRate}x
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-24 p-1" align="end" onclick={(e: MouseEvent) => e.stopPropagation()}>
				{#each SPEED_OPTIONS as speed}
					<button
						class="speed-option"
						class:active={speed === playbackRate}
						onclick={() => selectSpeed(speed)}
					>
						{speed}x{speed === 1 ? ' (Normal)' : ''}
					</button>
				{/each}
			</Popover.Content>
		</Popover.Root>
	</div>

	<!-- Author + caption overlay, bottom-left -->
	<div class="meta-overlay">
		<button class="author-row" onclick={goToProfile}>
			<Avatar src={cdnUrl(scrollable.userId, 'small')} alt="" userId={scrollable.userId} showPresence={false} border />
			<UserName name={scrollable.username} color={scrollable.nameColor} verified={scrollable.verified} class="font-bold text-white drop-shadow" />
			<span class="handle-text">@{scrollable.handle}</span>
		</button>
		{#if scrollable.caption}
			<p class="caption">{scrollable.caption}</p>
		{/if}
	</div>

	<!-- Action rail, matches the reference layout -->
	<div class="action-rail">
		<div
			class="relative inline-block"
			role="presentation"
			onmouseenter={() => scheduleLikersHover(true)}
			onmouseleave={() => scheduleLikersHover(false)}
		>
			<button class="rail-btn" onclick={toggleLike}>
				<Heart class="h-7 w-7 {liked ? 'fill-red-500 text-red-500' : ''}" />
				<span>{likeCount}</span>
			</button>
			<LikersDropdown id={scrollable.id} {likeCount} kind="scrollable" visible={likersHover} />
		</div>
		<button class="rail-btn" onclick={onOpenComments}>
			<MessageCircle class="h-7 w-7" />
			<span>{commentCount}</span>
		</button>
		<button class="rail-btn" onclick={toggleBookmark}>
			<Bookmark class="h-7 w-7 {bookmarked ? 'fill-current' : ''}" />
		</button>
		<button class="rail-btn" onclick={copyLink}>
			<Share class="h-7 w-7" />
		</button>
		{#if scrollable.userId === myId}
			<Popover.Root bind:open={moreOpen}>
				<Popover.Trigger asChild>
					{#snippet children({ builder }: { builder: any })}
						<button {...builder} onclick={() => (moreOpen = !moreOpen)} class="rail-btn">
							<MoreHorizontal class="h-7 w-7" />
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-40 p-1" align="end">
					<button class="flex w-full items-center gap-2 rounded-[4px] p-2 text-left text-sm text-destructive hover:bg-accent" onclick={handleDelete}>
						<Trash2 class="h-4 w-4" /> Delete
					</button>
				</Popover.Content>
			</Popover.Root>
		{/if}
	</div>
</div>

<style>
	.scrollable-card {
		position: relative;
		width: 100%;
		height: 100%;
		scroll-snap-align: start;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		border-radius: 8px;
		overflow: hidden;
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
	}

	.video-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.video-el {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.poster-el {
		display: block;
	}

	.poster-fallback {
		background: #111;
	}

	.play-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.85;
		pointer-events: none;
	}

	.mute-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		border: none;
	}

	.speed-btn {
		position: absolute;
		top: 56px;
		right: 12px;
		min-width: 36px;
		height: 28px;
		padding: 0 8px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		border: none;
		font-size: 12px;
		font-weight: 700;
		font-family: 'Courier New', monospace;
	}

	.speed-btn:hover {
		background: rgba(0, 0, 0, 0.7);
	}

	.speed-option {
		display: block;
		width: 100%;
		padding: 6px 8px;
		border: none;
		background: transparent;
		text-align: left;
		font-size: 13px;
		border-radius: 4px;
		cursor: pointer;
	}

	.speed-option:hover {
		background: hsl(var(--accent));
	}

	.speed-option.active {
		font-weight: 700;
		color: hsl(var(--primary));
	}

	.meta-overlay {
		position: absolute;
		left: 12px;
		bottom: 16px;
		max-width: 70%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 2;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
	}

	.author-row {
		display: flex;
		align-items: center;
		gap: 8px;
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-retro);
	}

	.handle-text {
		color: rgba(255, 255, 255, 0.75);
		font-size: 13px;
	}

	.caption {
		color: white;
		font-family: var(--font-retro);
		font-size: 14px;
		line-height: 1.35;
		margin: 0;
	}

	.action-rail {
		position: absolute;
		right: 10px;
		bottom: 90px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		z-index: 2;
	}

	.rail-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		background: rgba(0, 0, 0, 0.35);
		border: none;
		color: white;
		border-radius: 50%;
		width: 48px;
		height: 48px;
		justify-content: center;
		font-family: var(--font-retro);
		font-size: 11px;
		font-weight: 700;
	}
</style>
