<script lang="ts">
	import { onMount } from 'svelte';
	import { currentPage, pendingSearchQuery, cdnUrl } from './stores';
	import UserBadges from './UserBadges.svelte';
	import UserName from './UserName.svelte';

	interface Props {
		myId?: string | null;
	}
	let { myId = null }: Props = $props();

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

	let tags: TrendingTag[] = $state([]);
	let users: TrendingUser[] = $state([]);
	let loading = $state(true);

	// Local optimistic follow-state overrides, keyed by user id, so a click
	// updates the button instantly instead of waiting on a re-fetch.
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

	/* ── Panel shell — matches lynt-card bevel system ── */
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

	/* ── Panel header — aero gradient title bar, X-style copy ── */
	.panel-head {
		display: flex;
		align-items: center;
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

	/* UserName renders its own <span> inside a child component, so this
	   parent-scoped selector needs :global to actually reach it. */
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

	/* ── Follow button — beveled aero pill, like the rest of Lyntr's chrome ── */
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

	@media (max-width: 1100px) {
		.sidebar { width: 100%; }
	}
</style>