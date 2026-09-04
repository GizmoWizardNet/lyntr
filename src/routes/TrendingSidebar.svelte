<script lang="ts">
	import { onMount } from 'svelte';
	import { currentPage, pendingSearchQuery, cdnUrl } from './stores';
	import UserBadges from './UserBadges.svelte';
	import UserName from './UserName.svelte';
	import ParsedContent from './ParsedContent.svelte';

	interface Props {
		myId?: string | null;
		onOpenLynt?: ((id: string) => void) | null;
	}
	let { myId = null, onOpenLynt = null }: Props = $props();

	type TrendingTag = {
		tag: string;
		count: number;
	};

	type TrendingUser = {
		id: string;
		username: string;
		handle: string;
		verified: boolean;
		nameColor: string | null;
		isAdmin: boolean;
		contributor: boolean;
		loginStreak: number;
		postCount: number;
		likeCount: number;
		score: number;
		followerCount: number;
		isFollowing: boolean;
		followsViewer: boolean;
		isSelf: boolean;
	};

	type FeaturedLynt = {
		id: string;
		content: string;
		handle: string;
		username: string;
		userId: string;
		nameColor: string | null;
		verified: boolean;
		createdAt: string;
		likeCount: number;
		commentCount: number;
		repostCount: number;
	};

	let tags: TrendingTag[] = $state([]);
	let users: TrendingUser[] = $state([]);
	let loading = $state(true);

	let featured: FeaturedLynt | null = $state(null);
	let featuredLoading = $state(true);
	let featuredError = $state(false);

	let followOverrides: Record<string, boolean> = $state({});
	let followBusy: Record<string, boolean> = $state({});

	onMount(async () => {
		try {
			const response = await fetch('/api/trending');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			tags = data.tags ?? [];
			users = data.users ?? [];
		} catch (error) {
			console.error('Failed to load trending sidebar:', error);
		} finally {
			loading = false;
		}

		// Same "most-liked lynt in the last 24h" query the Discord bot's
		// /featured command uses (see src/lib/server/featured.ts) — just
		// exposed through a public, unauthenticated endpoint instead of the
		// admin-key-gated one the bot calls server-to-server.
		try {
			const response = await fetch('/api/featured');
			if (response.status === 404) {
				featured = null;
			} else if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			} else {
				featured = await response.json();
			}
		} catch (error) {
			console.error('Failed to load featured lynt:', error);
			featuredError = true;
		} finally {
			featuredLoading = false;
		}
	});

	function isFollowing(user: TrendingUser) {
		return followOverrides[user.id] ?? user.isFollowing;
	}

	function openTag(tag: string) {
		pendingSearchQuery.set(`#${tag}`);
		currentPage.set('search');
	}

	function openUser(handle: string) {
		currentPage.set('profile' + handle);
	}

	function openFeatured() {
		if (!featured) return;
		if (onOpenLynt) {
			onOpenLynt(featured.id);
		} else {
			currentPage.set('home');
			window.location.href = `/?id=${featured.id}`;
		}
	}

	async function toggleFollow(e: MouseEvent, user: TrendingUser) {
		e.stopPropagation();
		if (!myId || followBusy[user.id]) return;

		const nextState = !isFollowing(user);
		followOverrides = { ...followOverrides, [user.id]: nextState };
		followBusy = { ...followBusy, [user.id]: true };

		try {
			const res = await fetch('/api/follow', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: user.id })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
		} catch (error) {
			// Roll back on failure.
			followOverrides = { ...followOverrides, [user.id]: !nextState };
			console.error('Failed to toggle follow from trending sidebar:', error);
		} finally {
			followBusy = { ...followBusy, [user.id]: false };
		}
	}
</script>

<aside class="sidebar">

	<!-- Trending tags panel -->
	<div class="panel">
		<div class="panel-head">
			<span class="panel-title">What's happening</span>
			<img src="/pin.png" alt="" class="panel-pin" />
		</div>

		{#if loading}
			<div class="empty-row">Loading...</div>
		{:else if tags.length === 0}
			<div class="empty-row">Nothing trending yet.</div>
		{:else}
			<div class="tag-list">
				{#each tags as tag, i (tag.tag)}
					<button class="tag-row" onclick={() => openTag(tag.tag)}>
						<span class="tag-meta">Trending in Lyntr</span>
						<span class="tag-name">#{tag.tag}</span>
						<span class="tag-count">{tag.count} {tag.count === 1 ? 'Lynt' : 'Lynts'}</span>
					</button>
				{/each}
			</div>
		{/if}

		<button class="show-more" onclick={() => currentPage.set('search')}>Show more</button>
	</div>

	<!-- Who to follow panel -->
	<div class="panel">
		<div class="panel-head">
			<span class="panel-title">Who to follow</span>
			<img src="/pin.png" alt="" class="panel-pin" />
		</div>

		{#if loading}
			<div class="empty-row">Loading...</div>
		{:else if users.length === 0}
			<div class="empty-row">Nobody trending yet.</div>
		{:else}
			<div class="user-list">
				{#each users as user (user.id)}
					<button class="user-row" onclick={() => openUser(user.handle)}>
						<img
							src={cdnUrl(user.id, 'small')}
							alt=""
							class="avatar"
							loading="lazy"
							decoding="async"
						/>
						<span class="user-body">
							<span class="user-name-row">
								<UserName
									name={user.username}
									color={user.nameColor}
									verified={user.verified}
									class="user-name"
								/>
								<UserBadges
									verified={user.verified}
									isAdmin={user.isAdmin}
									contributor={user.contributor}
									loginStreak={user.loginStreak}
									followerCount={user.followerCount}
									followsViewer={user.followsViewer}
									size="tiny"
								/>
							</span>
							<span class="user-handle">@{user.handle}</span>
						</span>

						{#if myId && !user.isSelf}
							<button
								class="follow-btn"
								class:following={isFollowing(user)}
								disabled={followBusy[user.id]}
								onclick={(e) => toggleFollow(e, user)}
							>
								{isFollowing(user) ? 'Following' : 'Follow'}
							</button>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<button class="show-more" onclick={() => currentPage.set('search')}>Show more</button>
	</div>

	<div class="panel">
		<div class="panel-head">
			<span class="panel-title">Featured</span>
			<img src="/pin.png" alt="" class="panel-pin" />
		</div>

		{#if featuredLoading}
			<div class="empty-row">Loading...</div>
		{:else if featuredError}
			<div class="empty-row">Couldn't load the featured lynt.</div>
		{:else if !featured}
			<div class="empty-row">Nothing featured yet — check back later.</div>
		{:else}
			<button class="featured-row" onclick={openFeatured}>
				<div class="featured-head">
					<img
						src={cdnUrl(featured.userId, 'small')}
						alt=""
						class="avatar"
						loading="lazy"
						decoding="async"
					/>
					<span class="user-body">
						<span class="user-name-row">
							<UserName
								name={featured.username}
								color={featured.nameColor}
								verified={featured.verified}
								class="user-name"
							/>
						</span>
						<span class="user-handle">@{featured.handle}</span>
					</span>
				</div>

				<ParsedContent
					content={featured.content}
					className="featured-content"
					showLinkPreview={false}
					interactive={false}
				/>

				<div class="featured-stats">
					<span>❤️ {featured.likeCount}</span>
					<span>💬 {featured.commentCount}</span>
					<span>🔁 {featured.repostCount}</span>
				</div>
			</button>
		{/if}
	</div>

</aside>

<style>
	.sidebar {
		width: 280px;
		flex-shrink: 0;
		padding-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		font-family: var(--font-retro);
	}

	.panel {
		background: hsl(var(--card));
		border-top:    1px solid var(--bevel-light);
		border-left:   1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right:  1px solid var(--bevel-dark);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: var(--inset-shadow);
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: linear-gradient(
			to bottom,
			hsl(var(--primary) / 0.95),
			hsl(var(--primary) / 0.75)
		);
		color: hsl(var(--primary-foreground));
		border-bottom: 1px solid var(--bevel-dark);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
	}

	.panel-pin {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		object-fit: contain;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
	}

	.panel-title {
		font-size: 15px;
		font-weight: 800;
		letter-spacing: 0.01em;
	}

	/* ── Tags list — vertical rows like X's "What's happening" ── */
	.tag-list {
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
	}

	.tag-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		width: 100%;
		padding: 9px 14px;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		background: transparent;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}

	.tag-row:last-child {
		border-bottom: none;
	}

	.tag-row:hover {
		background: hsl(var(--lynt-focus));
	}

	.tag-row:active {
		background: hsl(var(--muted));
	}

	.tag-meta {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
	}

	.tag-name {
		font-size: 13px;
		font-weight: 800;
		color: hsl(var(--foreground));
	}

	.tag-count {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
	}

	/* ── Users list ── */
	.user-list {
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
	}

	.user-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 9px 14px;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		background: transparent;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}

	.user-row:last-child {
		border-bottom: none;
	}

	.user-row:hover {
		background: hsl(var(--lynt-focus));
	}

	.user-row:active {
		background: hsl(var(--muted));
	}

	.avatar {
		width: 34px;
		height: 34px;
		border-radius: 999px;
		flex-shrink: 0;
		object-fit: cover;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted));
	}

	.user-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.user-name-row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	:global(.user-name) {
		font-size: 12px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex-shrink: 1;
		min-width: 0;
	}

	.user-handle {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.follow-btn {
		flex-shrink: 0;
		padding: 5px 14px;
		border-radius: 999px;
		font-family: inherit;
		font-size: 11px;
		font-weight: 800;
		cursor: pointer;
		background: hsl(var(--foreground));
		color: hsl(var(--background));
		border-top:    1px solid var(--bevel-light);
		border-left:   1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right:  1px solid var(--bevel-dark);
		transition: transform 0.08s, background 0.12s, color 0.12s;
	}

	.follow-btn:active {
		transform: scale(0.96);
	}

	.follow-btn.following {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		border-top:    1px solid var(--bevel-dark);
		border-left:   1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right:  1px solid var(--bevel-light);
	}

	.follow-btn.following:hover {
		background: hsl(var(--destructive) / 0.12);
		color: hsl(var(--destructive));
		border-color: hsl(var(--destructive) / 0.4);
	}

	.follow-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* ── Show more footer link — X-style ── */
	.show-more {
		display: block;
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: hsl(var(--background));
		color: hsl(var(--primary));
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}

	.show-more:hover {
		background: hsl(var(--lynt-focus));
		text-decoration: underline;
	}

	/* ── Empty state ── */
	.empty-row {
		padding: 12px 14px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--background));
	}

	/* ── Featured lynt panel ── */
	.featured-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		padding: 12px 14px;
		border: none;
		background: hsl(var(--background));
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}

	.featured-row:hover {
		background: hsl(var(--lynt-focus));
	}

	.featured-row:active {
		background: hsl(var(--muted));
	}

	.featured-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	:global(.featured-content) {
		font-size: 12px;
		line-height: 1.45;
		color: hsl(var(--foreground));
		word-break: break-word;
		overflow-wrap: anywhere;
		/* Featured card is a teaser, not the full post — clip long lynts. */
		display: -webkit-box;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.featured-stats {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	@media (max-width: 1100px) {
		.sidebar { width: 100%; }
	}
</style>