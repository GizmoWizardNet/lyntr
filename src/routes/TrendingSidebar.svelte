<script lang="ts">
	import { onMount } from 'svelte';
	import { currentPage, pendingSearchQuery, cdnUrl } from './stores';

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
		postCount: number;
		likeCount: number;
		score: number;
	};

	let tags: TrendingTag[] = $state([]);
	let users: TrendingUser[] = $state([]);
	let loading = $state(true);

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

	function openTag(tag: string) {
		pendingSearchQuery.set(`#${tag}`);
		currentPage.set('search');
	}

	function openUser(handle: string) {
		currentPage.set('profile' + handle);
	}
</script>

<aside class="sidebar">

	<!-- Tags panel -->
	<div class="panel">
		<div class="panel-head">
			<span class="panel-title">TRENDING</span>
			<span class="panel-sub">PAST 7 DAYS</span>
		</div>

		{#if loading}
			<div class="empty-row">Loading...</div>
		{:else if tags.length === 0}
			<div class="empty-row">Nothing trending yet.</div>
		{:else}
			<div class="pill-wrap">
				{#each tags as tag, i (tag.tag)}
					<button class="pill tag-pill" onclick={() => openTag(tag.tag)}>
						<span class="pill-rank">{i + 1}</span>
						<span class="pill-tag">#{tag.tag}</span>
						<span class="pill-count">{tag.count}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Users panel -->
	<div class="panel">
		<div class="panel-head">
			<span class="panel-title">TOP LYNTRS</span>
			<span class="panel-sub">THIS WEEK</span>
		</div>

		{#if loading}
			<div class="empty-row">Loading...</div>
		{:else if users.length === 0}
			<div class="empty-row">Nobody trending yet.</div>
		{:else}
			<div class="pill-list">
				{#each users as user, i (user.id)}
					<button class="pill user-pill" onclick={() => openUser(user.handle)}>
						<span class="pill-rank">{i + 1}</span>
						<img src={cdnUrl(user.id, 'small')} alt="" class="avatar" loading="lazy" decoding="async" />
						<span class="user-body">
							<span class="user-name" style={user.nameColor ? `color: ${user.nameColor}` : ''}>
								{user.username}
								{#if user.verified}
									<img src="/verified.png" alt="Verified" class="verified-icon" />
								{/if}
							</span>
							<span class="user-handle">@{user.handle}</span>
						</span>
						<span class="score-pill">
							<b>{user.score}</b>
							<small>pts</small>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<p class="footer-note">Updated from the past 7 days of activity.</p>

</aside>

<style>
	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-family: var(--font-retro);
	}

	/* ── Panel shell — matches lynt-card bevel system ── */
	.panel {
		background: hsl(var(--card));
		border-top:    1px solid var(--bevel-light);
		border-left:   1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right:  1px solid var(--bevel-dark);
		border-radius: 6px;
		overflow: hidden;
		box-shadow: var(--inset-shadow);
	}

	/* ── Panel header ── */
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-bottom: 1px solid var(--bevel-dark);
	}

	.panel-title {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
	}

	.panel-sub {
		font-size: 8px;
		font-weight: 600;
		opacity: 0.6;
		letter-spacing: 0.06em;
	}

	/* ── Pill list container ── */
	/* Tags wrap into a flowing chip cloud instead of a bordered vertical
	   list — this is the requested "pill-like system": each tag is now a
	   fully standalone, individually-shadowed rounded chip rather than a
	   row sharing a divider border with its neighbors. */
	.pill-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 10px;
		background: hsl(var(--background));
	}

	.pill-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: hsl(var(--background));
	}

	/* ── Shared pill base ── */
	.pill {
		border: 1px solid hsl(var(--border));
		border-radius: 999px;
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
		transition: background 0.12s, border-color 0.12s, transform 0.08s;
	}

	.pill:hover {
		background: hsl(var(--lynt-focus));
		border-color: hsl(var(--primary) / 0.4);
	}

	.pill:active {
		transform: scale(0.98);
		background: hsl(var(--muted));
	}

	/* Rank chip inside the pill — small filled circle instead of a squared
	   divider column, so it reads as part of the pill's shape. */
	.pill-rank {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-family: 'Courier New', monospace;
		font-size: 9px;
		font-weight: 800;
	}

	/* ── Tag pill specifics ── */
	.tag-pill {
		padding: 5px 12px 5px 5px;
	}

	.pill-tag {
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--primary));
		white-space: nowrap;
	}

	.pill-count {
		font-size: 9px;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted));
		border-radius: 999px;
		padding: 1px 6px;
	}

	/* ── User pill specifics ── */
	.user-pill {
		width: 100%;
		padding: 5px 10px 5px 5px;
	}

	.avatar {
		width: 30px;
		height: 30px;
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

	.user-name {
		font-size: 11px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.verified-icon {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		object-fit: contain;
	}

	.user-handle {
		font-size: 9px;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.score-pill {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 4px 10px;
		background: hsl(var(--muted));
		border-radius: 999px;
		min-width: 32px;
	}

	.score-pill b {
		font-family: 'Courier New', monospace;
		font-size: 10px;
		line-height: 1;
		color: hsl(var(--foreground));
	}

	.score-pill small {
		font-size: 7px;
		color: hsl(var(--muted-foreground));
		letter-spacing: 0.05em;
		margin-top: 1px;
	}

	/* ── Empty state ── */
	.empty-row {
		padding: 12px 10px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--background));
	}

	/* ── Footer note ── */
	.footer-note {
		margin: 0;
		padding: 0 4px;
		font-size: 9px;
		color: hsl(var(--muted-foreground));
		text-align: center;
		letter-spacing: 0.02em;
	}

	@media (max-width: 1100px) {
		.sidebar { width: 100%; }
	}
</style>