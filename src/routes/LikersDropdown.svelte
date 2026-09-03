<script lang="ts">
	/**
	 * LikersDropdown.svelte
	 *
	 * Hover popover on the like button showing who liked a lynt. Deliberately
	 * reuses the same item markup/classes as MentionAutocomplete.svelte
	 * (mention-item / mention-handle / mention-username) rather than styling
	 * from scratch, so name colors and the click-to-profile link behave
	 * identically to the @mention dropdown elsewhere in the app — same
	 * component family, just a different data source and trigger (hover
	 * instead of typing "@").
	 */
	import UserName from './UserName.svelte';

	interface Liker {
		id: string;
		handle: string;
		username: string;
		verified: boolean;
		nameColor?: string | null;
	}

	interface Props {
		/** ID of the lynt or scrollable to fetch likers for. */
		id: string;
		likeCount: number;
		/** Which endpoint family to hit — /api/lynt/:id/likers vs /api/scrollables/:id/likers. */
		kind?: 'lynt' | 'scrollable';
		// Anchors the dropdown to the button that triggers it. Passed in
		// rather than doing our own mouseenter/mouseleave binding so the
		// caller (Lynt.svelte, wrapping OutlineButton) controls exactly
		// when hover starts/ends, including the touch-device fallback.
		visible: boolean;
	}

	let { id, likeCount, kind = 'lynt', visible }: Props = $props();

	let likers: Liker[] = $state([]);
	let hasMore = $state(false);
	let loading = $state(false);
	let loadedFor: string | null = null;
	let fetchToken = 0;

	async function ensureLoaded() {
		if (likeCount === 0) return;
		if (loadedFor === id) return;

		const token = ++fetchToken;
		loading = true;
		try {
			const endpoint = kind === 'scrollable' ? `/api/scrollables/${id}/likers` : `/api/lynt/${id}/likers`;
			const res = await fetch(endpoint);
			if (token !== fetchToken) return; // stale — a newer request superseded this one
			if (res.ok) {
				const data = await res.json();
				likers = data.likers;
				hasMore = data.hasMore;
				loadedFor = id;
			}
		} catch {
			// Silent — this is a hover preview, not a critical action. If it
			// fails the dropdown just stays empty rather than surfacing a
			// toast for something this minor.
		} finally {
			if (token === fetchToken) loading = false;
		}
	}

	$effect(() => {
		if (visible) ensureLoaded();
	});
</script>

{#if visible && likeCount > 0}
	<div class="mention-dropdown likers-dropdown">
		{#if loading && likers.length === 0}
			<div class="mention-item mention-empty">Loading…</div>
		{:else if likers.length === 0}
			<div class="mention-item mention-empty">No likes yet</div>
		{:else}
			{#each likers as liker (liker.id)}
				<a href="/@{liker.handle}" class="mention-item" onclick={(e) => e.stopPropagation()}>
					<span class="mention-handle">@{liker.handle}</span>
					<span class="mention-username">
						<UserName name={liker.username} color={liker.nameColor} verified={liker.verified} />
					</span>
					{#if liker.verified}
						<span class="mention-verified" title="Verified">✓</span>
					{/if}
				</a>
			{/each}
			{#if hasMore}
				<div class="mention-item mention-empty likers-more">and {likeCount - likers.length} more</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	/* Positioning differs from the mention dropdown (that one anchors to a
	   text caret inside a contenteditable; this one anchors to a button via
	   a plain relatively-positioned wrapper in the parent), everything else
	   is intentionally identical to .mention-dropdown / .mention-item in
	   MentionAutocomplete.svelte. */
	.likers-dropdown {
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
	.likers-more {
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
