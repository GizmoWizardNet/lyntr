<script lang="ts">
	import Auth from './Auth.svelte';
	import Lynt from './Lynt.svelte';
	import { scrollableCdnRawUrl } from './stores';
	import { Play } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		feed: any[];
		scrollables: any[];
	}

	let { feed, scrollables }: Props = $props();

	// Passed as Lynt's required lyntClick prop, but never actually reached —
	// Lynt's own requireAuth() guard intercepts every click path (card body,
	// parent-preview, comment icon) before this fires, since myId="" below.
	// Kept only because the prop itself is required.
	async function guestLyntClick() {
		toast.info('Log in to view the full conversation.');
	}
</script>

<div class="landing-grid">
	<div class="col col-auth">
		<Auth />
	</div>

	<div class="col col-feed">
		<div class="feed-header">
			<h2>New</h2>
			<p>What people are posting on Lyntr right now. Log in to like, reply, or repost.</p>
		</div>
		<div class="feed-scroll">
			{#each feed as lynt (lynt.id)}
				<Lynt {...lynt} myId="" lyntClick={guestLyntClick} truncateContent={true} />
			{:else}
				<p class="empty">No lynts yet — be the first.</p>
			{/each}
		</div>
	</div>

	<div class="col col-aside">
		<div class="aside-header">
			<h2>Scrollables</h2>
			<p>Newest first. Log in to watch, like, and comment.</p>
		</div>
		<div class="aside-scroll">
			{#each scrollables as s (s.id)}
				<div class="scrollable-tile">
					{#if s.thumbnailKey}
						<img src={scrollableCdnRawUrl(`${s.thumbnailKey}.webp`)} alt="" loading="lazy" />
					{:else}
						<video src={scrollableCdnRawUrl(`${s.videoKey}.mp4`)} muted preload="metadata"></video>
					{/if}
					<div class="tile-overlay">
						<Play class="h-6 w-6" fill="white" />
					</div>
					<div class="tile-meta">
						<span class="tile-handle">@{s.handle}</span>
						{#if s.caption}<span class="tile-caption">{s.caption}</span>{/if}
					</div>
				</div>
			{:else}
				<p class="empty">No scrollables yet.</p>
			{/each}
		</div>
	</div>
</div>

<style>
	.landing-grid {
		display: grid;
		grid-template-columns: minmax(320px, 420px) minmax(0, 600px) minmax(280px, 340px);
		gap: 20px;
		align-items: start;
		min-height: 100dvh;
		max-width: 1400px;
		margin: 0 auto;
		padding: 24px;
	}

	.col-auth {
		position: sticky;
		top: 24px;
	}

	.col-feed {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 48px);
		border-radius: 6px;
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		overflow: hidden;
	}

	.feed-header {
		padding: 16px 16px 12px;
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.feed-header h2 {
		margin: 0 0 4px;
		font-family: var(--font-retro);
		font-size: 18px;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.feed-header p {
		margin: 0;
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.feed-scroll {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
	}

	.empty {
		text-align: center;
		padding: 40px 16px;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}

	.col-aside {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 48px);
		border-radius: 6px;
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		overflow: hidden;
	}

	.aside-header {
		padding: 16px 16px 12px;
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.aside-header h2 {
		margin: 0 0 4px;
		font-family: var(--font-retro);
		font-size: 18px;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.aside-header p {
		margin: 0;
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.aside-scroll {
		flex: 1;
		overflow-y: auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		padding: 8px;
		align-content: start;
	}

	.scrollable-tile {
		position: relative;
		aspect-ratio: 9 / 16;
		border-radius: 4px;
		overflow: hidden;
		background: #000;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
	}

	.scrollable-tile img,
	.scrollable-tile video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tile-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.15);
		opacity: 0.9;
		pointer-events: none;
	}

	.tile-meta {
		position: absolute;
		left: 6px;
		bottom: 6px;
		right: 6px;
		display: flex;
		flex-direction: column;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
	}

	.tile-handle {
		color: white;
		font-family: var(--font-retro);
		font-size: 11px;
		font-weight: 700;
	}

	.tile-caption {
		color: rgba(255, 255, 255, 0.85);
		font-family: var(--font-retro);
		font-size: 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Below ~1150px there isn't room for three real columns — drop the
	   empty aside first since it has nothing in it yet. */
	@media (max-width: 1150px) {
		.landing-grid {
			grid-template-columns: minmax(320px, 420px) minmax(0, 600px);
		}
		.col-aside {
			display: none;
		}
	}

	/* Below ~820px, stack: auth on top (people came here to log in),
	   feed below as a scroll-down teaser rather than a fixed pane. */
	@media (max-width: 820px) {
		.landing-grid {
			grid-template-columns: 1fr;
			padding: 16px;
		}
		.col-auth {
			position: static;
		}
		.col-feed {
			height: auto;
			max-height: 70dvh;
		}
	}
</style>