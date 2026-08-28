<script lang="ts">
	/**
	 * PollOptionVotersDropdown.svelte
	 *
	 * Hover popover on a resolved/voted poll option showing who voted for it.
	 * Deliberately mirrors LikersDropdown.svelte (same markup/classes as
	 * MentionAutocomplete.svelte: mention-item / mention-handle /
	 * mention-username) so it behaves identically — just a different data
	 * source (per-option voters instead of per-lynt likers).
	 */
	import UserName from './UserName.svelte';

	interface Voter {
		id: string;
		handle: string;
		username: string;
		verified: boolean;
		nameColor?: string | null;
	}

	interface Props {
		// The id to fetch voters for — either a single option (per-option
		// hover on each result row) or the whole poll (poll-wide hover on
		// the "N votes" footer text, which de-dupes voters across options).
		optionId: string;
		kind?: 'option' | 'poll';
		voteCount: number;
		visible: boolean;
	}

	let { optionId, kind = 'option', voteCount, visible }: Props = $props();

	let voters: Voter[] = $state([]);
	let hasMore = $state(false);
	let loading = $state(false);
	let loadedFor: string | null = null;
	let fetchToken = 0;

	async function ensureLoaded() {
		if (voteCount === 0) return;
		if (loadedFor === optionId) return;

		const token = ++fetchToken;
		loading = true;
		try {
			const path =
				kind === 'poll' ? `/api/poll/${optionId}/voters` : `/api/poll/option/${optionId}/voters`;
			const res = await fetch(path);
			if (token !== fetchToken) return; // stale — a newer request superseded this one
			if (res.ok) {
				const data = await res.json();
				voters = data.voters;
				hasMore = data.hasMore;
				loadedFor = optionId;
			}
		} catch {
			// Silent — this is a hover preview, not a critical action.
		} finally {
			if (token === fetchToken) loading = false;
		}
	}

	$effect(() => {
		if (visible) ensureLoaded();
	});
</script>

{#if visible && voteCount > 0}
	<div class="mention-dropdown voters-dropdown">
		{#if loading && voters.length === 0}
			<div class="mention-item mention-empty">Loading…</div>
		{:else if voters.length === 0}
			<div class="mention-item mention-empty">No votes yet</div>
		{:else}
			{#each voters as voter (voter.id)}
				<a href="/@{voter.handle}" class="mention-item" onclick={(e) => e.stopPropagation()}>
					<span class="mention-handle">@{voter.handle}</span>
					<span class="mention-username">
						<UserName name={voter.username} color={voter.nameColor} verified={voter.verified} />
					</span>
					{#if voter.verified}
						<span class="mention-verified" title="Verified">✓</span>
					{/if}
				</a>
			{/each}
			{#if hasMore}
				<div class="mention-item mention-empty voters-more">and {voteCount - voters.length} more</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.voters-dropdown {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
	}

	.mention-dropdown {
		min-width: 180px;
		max-width: 260px;
		max-height: 220px;
		overflow-y: auto;
		background: hsl(var(--popover, var(--background)));
		border: var(--ghost-border, 1px solid hsl(var(--border)));
		border-radius: 8px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
		padding: 4px;
	}

	.mention-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		border-radius: 5px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		text-decoration: none;
		color: inherit;
	}
	.mention-item:hover {
		background: hsl(var(--accent, var(--muted)));
	}
	.mention-empty {
		color: hsl(var(--muted-foreground));
		cursor: default;
		font-style: italic;
		font-size: 0.825rem;
	}
	.voters-more {
		padding-top: 2px;
	}

	.mention-handle {
		font-weight: 700;
		color: #4fa8e8;
	}
	.mention-username {
		color: hsl(var(--muted-foreground));
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mention-verified {
		margin-left: auto;
		color: hsl(var(--primary));
		font-size: 0.75rem;
	}
</style>