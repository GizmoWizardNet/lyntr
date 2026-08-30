<script lang="ts">
	import EmojiIcon from './EmojiIcon.svelte';

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

	// Matches ALLOWED_EMOJI in api/reactions/+server.ts exactly — every
	// emoji the server will accept is now reachable from the picker, since
	// custom icons exist for all ten (see lib/emojiIcons.ts).
	const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '🔥', '👍', '👎', '😡', '🎉', '👀'];

	let pickerOpen = $state(false);
	// Optimistic local delta so a click feels instant instead of waiting on
	// the reaction_update round trip: +1/-1 per emoji, applied on top of
	// the server-truth `reactions` prop in `displayReactions` below. Once
	// the real broadcast arrives, `reactions` itself already reflects the
	// change, so the delta nets out to the same number — it's cleared as
	// soon as its emoji shows up in the incoming prop with the state we
	// predicted, not just on request completion, so a slow broadcast
	// doesn't cause a visible flicker back to the old count in between.
	let pendingDelta = $state<Map<string, { count: number; reactedByUser: boolean }>>(new Map());

	const displayReactions = $derived.by(() => {
		if (pendingDelta.size === 0) return reactions;

		const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
		const remaining = new Map(pendingDelta);

		for (const [emoji, predicted] of pendingDelta) {
			const server = byEmoji.get(emoji);
			// Server has already caught up to (or passed) what we predicted —
			// drop the local override and just trust the prop from here on.
			if (server && server.reactedByUser === predicted.reactedByUser) {
				remaining.delete(emoji);
				continue;
			}
			byEmoji.set(emoji, {
				emoji,
				count: predicted.count,
				reactedByUser: predicted.reactedByUser
			});
		}

		if (remaining.size !== pendingDelta.size) {
			// Reassign (not mutate) so the $state setter fires and clears
			// out emoji that just got confirmed by the server.
			pendingDelta = remaining;
		}

		// New reactions (count 0 → 1) need inserting; existing ones already
		// got overwritten in place above via byEmoji.set.
		return Array.from(byEmoji.values()).filter((r) => r.count > 0);
	});

	async function toggle(emoji: string) {
		if (!myId) return;
		pickerOpen = false;

		const current = displayReactions.find((r) => r.emoji === emoji);
		const wasReacted = current?.reactedByUser ?? false;
		const baseCount = current?.count ?? 0;

		pendingDelta = new Map(pendingDelta).set(emoji, {
			count: wasReacted ? baseCount - 1 : baseCount + 1,
			reactedByUser: !wasReacted
		});

		try {
			const res = await fetch('/api/reactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lynt_id: lyntId, emoji })
			});
			if (!res.ok) throw new Error('reaction request failed');
		} catch {
			// Roll back the optimistic guess — the broadcast that would
			// otherwise reconcile it is never coming since the request
			// itself failed.
			const rolledBack = new Map(pendingDelta);
			rolledBack.delete(emoji);
			pendingDelta = rolledBack;
		}
	}
</script>

<div class="reaction-bar">
	{#each displayReactions as r (r.emoji)}
		<button
			class="reaction-pill"
			class:active={r.reactedByUser}
			onclick={() => toggle(r.emoji)}
			title={r.reactedByUser ? 'Remove reaction' : 'React'}
		>
			<span><EmojiIcon emoji={r.emoji} size={15} /></span>
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
					<button class="picker-emoji" onclick={() => toggle(emoji)}>
						<EmojiIcon {emoji} size={20} />
					</button>
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
		flex-wrap: wrap;
		max-width: 176px;
		gap: 2px;
		padding: 4px;
		border-radius: 8px;
		background: var(--popover-bg, #1e1f22);
		border: 1px solid rgba(127, 127, 127, 0.2);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		z-index: 20;
	}
	.picker-emoji {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		padding: 4px;
		cursor: pointer;
		border-radius: 6px;
	}
	.picker-emoji:hover {
		background: rgba(127, 127, 127, 0.15);
	}
</style>