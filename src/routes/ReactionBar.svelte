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
			<span class="pill-emoji"><EmojiIcon emoji={r.emoji} size={19} /></span>
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
						<EmojiIcon {emoji} size={24} />
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
		gap: 6px;
		align-items: center;
		margin-top: 4px;
	}

	/* Same bevel/gloss language as every other pill/button on the site
	   (see .shit in app.css, the poll option pills, etc) instead of a
	   flat generic gray chip — and noticeably bigger icon+text than
	   before, since that was the actual complaint: 15px icons in a 13px
	   pill read as decoration, not something you'd tap to see what
	   reaction it is. */
	.reaction-pill {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 11px;
		border-radius: 999px;
		font-family: var(--font-retro);
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		background: hsl(var(--muted) / 0.5);
		border-top: 1.5px solid var(--bevel-light);
		border-left: 1.5px solid var(--bevel-light);
		border-bottom: 1.5px solid var(--bevel-dark);
		border-right: 1.5px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		color: hsl(var(--foreground));
		transition: background 0.12s ease, box-shadow 0.12s ease, transform 0.1s ease;
	}
	.pill-emoji {
		display: inline-flex;
		line-height: 0;
	}
	.reaction-pill:hover {
		background: hsl(var(--muted) / 0.8);
	}
	.reaction-pill:active {
		transform: translateY(1px);
		box-shadow: none;
	}
	/* Tinted with the site's own primary color instead of a hardcoded
	   Discord blurple (#5865f2) that had nothing to do with the rest of
	   the palette — reads as "you reacted" using the same accent color
	   as everything else that marks an active/selected state. */
	.reaction-pill.active {
		background: hsl(var(--primary) / 0.18);
		border-top-color: hsl(var(--primary) / 0.6);
		border-left-color: hsl(var(--primary) / 0.6);
		border-bottom-color: hsl(var(--primary) / 0.85);
		border-right-color: hsl(var(--primary) / 0.85);
		color: hsl(var(--primary));
	}
	.count {
		font-variant-numeric: tabular-nums;
	}

	.add-reaction-wrap {
		position: relative;
	}
	.add-reaction {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		font-family: var(--font-retro);
		font-size: 16px;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		background: hsl(var(--muted) / 0.35);
		border: 1.5px dashed hsl(var(--muted-foreground) / 0.4);
		color: hsl(var(--muted-foreground));
		transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
	}
	.add-reaction:hover {
		background: hsl(var(--muted) / 0.6);
		border-color: hsl(var(--muted-foreground) / 0.7);
		color: hsl(var(--foreground));
	}

	.picker {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		display: flex;
		flex-wrap: wrap;
		/* Was `max-width: 176px` with no `width` — for an absolutely
		   positioned flex container with wrap enabled, that's ambiguous:
		   "every item on its own line" is a valid way to satisfy a
		   max-width constraint, and that's exactly the (legal, but wrong
		   for us) layout the shrink-to-fit sizing picked — a single
		   20px-wide column, ten rows tall. An explicit width removes the
		   ambiguity; capped by max-width so it still fits a narrow phone
		   screen instead of overflowing off the left edge of the card. */
		width: 216px;
		max-width: calc(100vw - 32px);
		gap: 3px;
		padding: 6px;
		border-radius: var(--radius-sm);
		background: hsl(var(--card));
		border-top: 1.5px solid var(--bevel-light);
		border-left: 1.5px solid var(--bevel-light);
		border-bottom: 1.5px solid var(--bevel-dark);
		border-right: 1.5px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
		z-index: 20;
	}
	.picker-emoji {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: none;
		cursor: pointer;
		border-radius: 6px;
		transition: background 0.1s ease;
	}
	.picker-emoji:hover {
		background: hsl(var(--muted) / 0.6);
	}
</style>