<script lang="ts">
	// Discord-style quick-react bar for a lynt. Reactions are a lighter-weight
	// "vibe" layer separate from likes (see the lynt_reactions schema
	// comment) — no notification, no LyntCoin reward, just an emoji tally
	// that updates live for everyone via the `reaction_update` WS event
	// (see MainPage.svelte's wsClient.on('reaction_update', ...)).
	interface Reaction {
		emoji: string;
		count: number;
		reactedByUser: boolean;
	}

	let {
		lyntId,
		reactions = [],
		myId
	}: {
		lyntId: string;
		reactions?: Reaction[];
		myId: string | null;
	} = $props();

	const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

	let pickerOpen = $state(false);
	// Optimistic local overlay so the click feels instant; the authoritative
	// tally arrives moments later over the socket and replaces this anyway.
	let pending = $state<Set<string>>(new Set());

	async function toggle(emoji: string) {
		if (!myId) return;
		pickerOpen = false;
		pending = new Set(pending).add(emoji);
		try {
			await fetch('/api/reactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lynt_id: lyntId, emoji })
			});
		} finally {
			const next = new Set(pending);
			next.delete(emoji);
			pending = next;
		}
	}
</script>

<div class="reaction-bar">
	{#each reactions as r (r.emoji)}
		<button
			class="reaction-pill"
			class:active={r.reactedByUser}
			onclick={() => toggle(r.emoji)}
			title={r.reactedByUser ? 'Remove reaction' : 'React'}
		>
			<span>{r.emoji}</span>
			<span class="count">{r.count}</span>
		</button>
	{/each}

	<div class="add-reaction-wrap">
		<button class="add-reaction" onclick={() => (pickerOpen = !pickerOpen)} aria-label="Add reaction">
			+
		</button>
		{#if pickerOpen}
			<div class="picker">
				{#each QUICK_EMOJI as emoji}
					<button class="picker-emoji" onclick={() => toggle(emoji)}>{emoji}</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.reaction-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
		margin-top: 4px;
	}
	.reaction-pill {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid rgba(127, 127, 127, 0.25);
		background: rgba(127, 127, 127, 0.08);
		font-size: 13px;
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease;
	}
	.reaction-pill:hover {
		background: rgba(127, 127, 127, 0.16);
	}
	.reaction-pill.active {
		border-color: var(--accent, #5865f2);
		background: color-mix(in srgb, var(--accent, #5865f2) 15%, transparent);
	}
	.count {
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
	}
	.add-reaction-wrap {
		position: relative;
	}
	.add-reaction {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		border: 1px dashed rgba(127, 127, 127, 0.35);
		background: transparent;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		opacity: 0.7;
	}
	.add-reaction:hover {
		opacity: 1;
	}
	.picker {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		display: flex;
		gap: 2px;
		padding: 4px;
		border-radius: 8px;
		background: var(--popover-bg, #1e1f22);
		border: 1px solid rgba(127, 127, 127, 0.2);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		z-index: 20;
	}
	.picker-emoji {
		background: transparent;
		border: none;
		font-size: 18px;
		padding: 4px;
		cursor: pointer;
		border-radius: 6px;
	}
	.picker-emoji:hover {
		background: rgba(127, 127, 127, 0.15);
	}
</style>
