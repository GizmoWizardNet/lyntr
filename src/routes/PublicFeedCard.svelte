<script lang="ts">
	import { Heart, Repeat2, MessageCircle, Share } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { shareLyntUrl } from '$lib/share-url';
	import { cdnUrl } from './stores';
	import Avatar from './Avatar.svelte';
	import UserName from './UserName.svelte';
	import UserBadges from './UserBadges.svelte';
	import ParsedContent from './ParsedContent.svelte';
	import PollDisplay from './PollDisplay.svelte';

	interface Props {
		lynt: any;
	}

	let { lynt }: Props = $props();

	function timeAgo(date: string | Date) {
		const d = typeof date === 'string' ? new Date(date) : date;
		const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		if (days > 0) return `${days}d`;
		if (hours > 0) return `${hours}h`;
		if (minutes > 0) return `${minutes}m`;
		return `${seconds}s`;
	}

	function copyLink() {
		const url = shareLyntUrl(lynt.id);
		navigator.clipboard.writeText(url);
		toast.success('Link copied — log in to see the full conversation.');
	}

	let images = $derived(lynt.images ?? []);
</script>

<article class="public-card">
	<div class="pointer-events-none inline-block max-h-[40px] min-w-[40px]">
		<Avatar size={15} src={cdnUrl(lynt.userId, 'small')} alt="" userId={lynt.userId} showPresence={false} />
	</div>

	<div class="body">
		<div class="head">
			<span class="username">
				<UserName name={lynt.username} color={lynt.nameColor} verified={lynt.verified} />
			</span>
			<div class="badges"><UserBadges verified={lynt.verified} isAdmin={lynt.isAdmin} contributor={lynt.contributor} compact /></div>
			<span class="handle">@{lynt.handle}</span>
			<span class="dot">·</span>
			<span class="time">{timeAgo(lynt.createdAt)}</span>
		</div>

		<ParsedContent content={lynt.content} className="content" authorHandle={lynt.handle} interactive={false} showLinkPreview={true} />

		{#if images.length > 1}
			<div class="lynt-image-gallery" class:count-3={images.length === 3}>
				{#each images as img (img.key)}
					<img class="gallery-img" src={cdnUrl(img.key)} alt="Attached image" loading="lazy" decoding="async" />
				{/each}
			</div>
		{:else if images.length === 1 || lynt.has_image}
			<img class="media" src={cdnUrl(images?.[0]?.key ?? lynt.id)} alt="" loading="lazy" decoding="async" />
		{:else if lynt.gif_url}
			<img class="media" src={lynt.gif_url} alt="GIF" loading="lazy" decoding="async" />
		{/if}

		{#if lynt.poll}
			<div class="pointer-events-none">
				<PollDisplay poll={lynt.poll} isAuthor={false} loggedIn={false} />
			</div>
		{/if}

		<!-- Disabled by design — this is a teaser feed for logged-out
		     visitors. Counts are shown for context; nothing here is
		     clickable except Share, which just copies the link. -->
		<div class="actions">
			<span class="stat" title="Log in to comment"><MessageCircle class="h-4 w-4" /> {lynt.commentCount ?? 0}</span>
			<span class="stat" title="Log in to repost"><Repeat2 class="h-4 w-4" /> {lynt.repostCount ?? 0}</span>
			<span class="stat" title="Log in to like"><Heart class="h-4 w-4" /> {lynt.likeCount ?? 0}</span>
			<button class="stat share" onclick={copyLink} title="Copy link">
				<Share class="h-4 w-4" />
			</button>
		</div>
	</div>
</article>

<style>
	.public-card {
		display: flex;
		gap: 10px;
		padding: 12px;
		border-radius: 6px;
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	.body {
		min-width: 0;
		flex: 1;
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: 5px;
		font-family: var(--font-retro);
		font-size: 13px;
		flex-wrap: wrap;
	}

	.username {
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.badges {
		display: inline-flex;
		align-items: center;
	}

	.handle,
	.dot,
	.time {
		color: hsl(var(--muted-foreground));
	}

	:global(.public-card .content) {
		margin: 4px 0 0;
		font-family: var(--font-retro);
		font-size: 14px;
	}

	.media {
		margin-top: 8px;
		max-width: 100%;
		max-height: 320px;
		border-radius: 4px;
		object-fit: cover;
	}

	.lynt-image-gallery {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		margin-top: 8px;
		border-radius: 10px;
		overflow: hidden;
		max-height: 320px;
	}
	.lynt-image-gallery.count-3 :global(.gallery-img:first-child) {
		grid-row: span 2;
	}
	.gallery-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		aspect-ratio: 1 / 1;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 18px;
		margin-top: 8px;
	}

	.stat {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		cursor: default;
		background: none;
		border: none;
		padding: 0;
	}

	.stat.share {
		cursor: pointer;
		margin-left: auto;
	}

	.stat.share:hover {
		color: hsl(var(--foreground));
	}
</style>
