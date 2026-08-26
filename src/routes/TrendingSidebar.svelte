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
			<div class="list">
				{#each tags as tag, i (tag.tag)}
					<button class="row tag-row" onclick={() => openTag(tag.tag)}>
						<span class="rank">{String(i + 1).padStart(2, '0')}</span>
						<span class="tag-body">
							<span class="tag-name">#{tag.tag}</span>
							<span class="tag-count">{tag.count} {tag.count === 1 ? 'lynt' : 'lynts'}</span>
						</span>
						<span class="chevron" aria-hidden="true">›</span>
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
			<div class="list">
				{#each users as user, i (user.id)}
					<button class="row user-row" onclick={() => openUser(user.handle)}>
						<span class="rank">{String(i + 1).padStart(2, '0')}</span>
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
						<span class="score">
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
		font-family: Tahoma, Geneva, Verdana, sans-serif;
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

	/* ── List container ── */
	.list {
		display: flex;
		flex-direction: column;
	}

	/* ── Shared row base ── */
	.row {
		width: 100%;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		border-radius: 0;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0;
		transition: background 0.1s;
	}

	.row:last-child { border-bottom: none; }

	.row:hover { background: hsl(var(--lynt-focus)); }

	.row:active {
		background: hsl(var(--muted));
		box-shadow: var(--inset-shadow);
	}

	/* Rank badge — monospace to keep digits from jumping */
	.rank {
		flex-shrink: 0;
		width: 32px;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted));
		border-right: 1px solid hsl(var(--border));
		font-family: 'Courier New', monospace;
		font-size: 10px;
		font-weight: 800;
		color: hsl(var(--muted-foreground));
	}

	/* ── Tag row specifics ── */
	.tag-row { padding-right: 8px; }

	.tag-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 7px 0;
	}

	.tag-name {
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--primary));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
	}

	.tag-count {
		font-size: 9px;
		color: hsl(var(--muted-foreground));
	}

	.chevron {
		color: hsl(var(--muted-foreground));
		font-size: 16px;
		line-height: 1;
		flex-shrink: 0;
	}

	/* ── User row specifics ── */
	.user-row { padding: 6px 8px 6px 0; }

	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 4px;
		flex-shrink: 0;
		object-fit: cover;
		border-top:    1px solid var(--bevel-light);
		border-left:   1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right:  1px solid var(--bevel-dark);
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

	.score {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 4px 6px;
		border-top:    1px solid var(--bevel-light);
		border-left:   1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right:  1px solid var(--bevel-dark);
		background: hsl(var(--muted));
		border-radius: 3px;
		min-width: 32px;
	}

	.score b {
		font-family: 'Courier New', monospace;
		font-size: 10px;
		line-height: 1;
		color: hsl(var(--foreground));
	}

	.score small {
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
