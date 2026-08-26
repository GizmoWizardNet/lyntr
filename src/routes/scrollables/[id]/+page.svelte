<script lang="ts">
	import { Heart, MessageCircle, Bookmark, Share } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import Avatar from '../../Avatar.svelte';
	import UserName from '../../UserName.svelte';
	import ParsedContent from '../../ParsedContent.svelte';
	import ScrollableComments from '../../scrollables/ScrollableComments.svelte';
	import { cdnUrl, scrollableCdnRawUrl } from '../../stores';
	import { shareScrollableUrl } from '$lib/share-url';

	let { data } = $props();
	let scrollable = $state(data.scrollable);
	let og = data.og;

	let liked = $state(scrollable?.liked ?? false);
	let likeCount = $state(scrollable?.likeCount ?? 0);
	let bookmarked = $state(scrollable?.bookmarked ?? false);
	let commentsOpen = $state(false);

	async function toggleLike() {
		if (!scrollable) return;
		const was = liked;
		liked = !liked;
		likeCount += liked ? 1 : -1;
		const res = await fetch(`/api/scrollables/${scrollable.id}/like`, { method: 'POST' });
		if (!res.ok) {
			liked = was;
			likeCount += was ? 1 : -1;
			if (res.status === 401) {
				toast.error('Log in to Lyntr to like this.');
			} else {
				toast.error('Could not like this scrollable.');
			}
		}
	}

	async function toggleBookmark() {
		if (!scrollable) return;
		const was = bookmarked;
		bookmarked = !bookmarked;
		const res = await fetch(`/api/scrollables/${scrollable.id}/bookmark`, { method: 'POST' });
		if (!res.ok) {
			bookmarked = was;
			if (res.status === 401) {
				toast.error('Log in to Lyntr to save this.');
			} else {
				toast.error('Could not save this scrollable.');
			}
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(shareScrollableUrl(scrollable.id));
		toast.success('Link copied!');
	}
</script>

<svelte:head>
	{#if scrollable && og}
		<title>{og.title}</title>
		<meta name="description" content={og.description} />

		<meta property="og:site_name" content="Lyntr" />
		<meta property="og:title" content={og.title} />
		<meta property="og:description" content={og.description} />
		<meta property="og:url" content="https://lyntr.gizmowizard.tech/scrollables/{scrollable.id}" />
		<meta content="#3d1f00" name="theme-color" />

		<!-- YouTube-style rich video card. og:video (+ secure_url) is what
		     lets Discord and similar unfurlers render an inline player
		     directly in the card; og:image is the poster shown before
		     playback starts / on platforms that don't support inline video. -->
		<meta property="og:type" content="video.other" />
		<meta property="og:image" content={og.thumbnailUrl} />
		<meta property="og:video" content={og.videoUrl} />
		<meta property="og:video:secure_url" content={og.videoUrl} />
		<meta property="og:video:type" content="video/mp4" />
		<meta property="og:video:width" content={String(og.width)} />
		<meta property="og:video:height" content={String(og.height)} />

		<!-- Twitter/X player card — X specifically requires an iframe-embed
		     URL (twitter:player) rather than accepting a raw mp4 the way
		     Discord's og:video does; see the embed/+page.svelte route. -->
		<meta name="twitter:card" content="player" />
		<meta name="twitter:site" content="@lyntr" />
		<meta name="twitter:title" content={og.title} />
		<meta name="twitter:description" content={og.description} />
		<meta name="twitter:image" content={og.thumbnailUrl} />
		<meta name="twitter:player" content={og.embedUrl} />
		<meta name="twitter:player:width" content={String(og.width)} />
		<meta name="twitter:player:height" content={String(og.height)} />
		<meta name="twitter:player:stream" content={og.videoUrl} />
		<meta name="twitter:player:stream:content_type" content="video/mp4" />
	{:else}
		<title>Lyntr</title>
		<meta property="og:title" content="Lyntr — micro-blogging for EVERYONE, for FUN! With a twist." />
	{/if}
</svelte:head>

<div class="page-wrap">
	{#if !scrollable}
		<div class="not-found">
			<p>This scrollable doesn't exist, or was deleted.</p>
			<a href="/">Go to Lyntr</a>
		</div>
	{:else}
		<div class="player-card">
			<video
				src={scrollableCdnRawUrl(`${scrollable.videoKey}.mp4`)}
				poster={scrollable.thumbnailKey ? scrollableCdnRawUrl(`${scrollable.thumbnailKey}.webp`) : undefined}
				controls
				playsinline
				class="video-el"
			></video>

			<div class="info-bar">
				<a class="author-row" href="/@{scrollable.handle}">
					<Avatar src={cdnUrl(scrollable.userId, 'small')} alt="" userId={scrollable.userId} showPresence={false} />
					<div class="author-text">
						<UserName name={scrollable.username} color={scrollable.nameColor} verified={scrollable.verified} />
						<span class="handle">@{scrollable.handle}</span>
					</div>
				</a>

				{#if scrollable.caption}
					<ParsedContent content={scrollable.caption} className="caption" interactive={false} showLinkPreview={false} />
				{/if}

				<div class="actions">
					<button class="action-btn" onclick={toggleLike}>
						<Heart class="h-5 w-5 {liked ? 'fill-red-500 text-red-500' : ''}" /> {likeCount}
					</button>
					<button class="action-btn" onclick={() => (commentsOpen = true)}>
						<MessageCircle class="h-5 w-5" /> {scrollable.commentCount}
					</button>
					<button class="action-btn" onclick={toggleBookmark}>
						<Bookmark class="h-5 w-5 {bookmarked ? 'fill-current' : ''}" />
					</button>
					<button class="action-btn" onclick={copyLink}>
						<Share class="h-5 w-5" />
					</button>
				</div>
			</div>
		</div>

		<a class="open-app-cta" href="/">Open in Lyntr</a>

		{#if commentsOpen}
			<div class="comments-overlay">
				<ScrollableComments scrollableId={scrollable.id} onClose={() => (commentsOpen = false)} />
			</div>
		{/if}
	{/if}
</div>

<style>
	.page-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		min-height: 100dvh;
		padding: 24px 16px;
		background: hsl(var(--background));
	}

	.not-found {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		margin-top: 80px;
		font-family: var(--font-retro);
		color: hsl(var(--muted-foreground));
	}

	.player-card {
		width: 100%;
		max-width: 420px;
		border-radius: 8px;
		overflow: hidden;
		background: hsl(var(--card));
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
	}

	.video-el {
		width: 100%;
		max-height: 70dvh;
		background: #000;
		display: block;
	}

	.info-bar {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
	}

	.author-row {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
	}

	.author-text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}

	.handle {
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	:global(.caption) {
		font-family: var(--font-retro);
		font-size: 14px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 20px;
		border-top: 1px solid hsl(var(--border));
		padding-top: 10px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		background: none;
		border: none;
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.open-app-cta {
		font-family: var(--font-retro);
		font-size: 13px;
		font-weight: 700;
		color: hsl(var(--primary));
		text-decoration: underline;
	}

	.comments-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		max-width: 420px;
		margin: 0 auto;
	}
</style>
