<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { BarChart2, Check } from 'lucide-svelte';
	import PollOptionVotersDropdown from './PollOptionVotersDropdown.svelte';

	interface PollOption {
		id: string;
		text: string;
		position: number;
		votes: number;
		voted: boolean;
	}

	interface Poll {
		id: string;
		title: string;
		multi_select: boolean;
		resolve_at: string | null;
		resolved_at: string | null;
		options: PollOption[];
		total_votes: number;
		my_votes: string[];
	}

	interface Props {
		poll: Poll;
		isAuthor: boolean;
		loggedIn: boolean;
		onupdate?: (updated: Poll) => void;
	}

	let { poll: initialPoll, isAuthor, loggedIn, onupdate }: Props = $props();

	let poll = $state<Poll>({ ...initialPoll, options: [...initialPoll.options] });
	let voting = $state(false);
	let resolving = $state(false);

	// True while the viewer has re-opened an already-cast vote to change it.
	// Kept separate from poll.my_votes so we never lose track of what was
	// actually voted for — clearing my_votes here used to make the tally
	// math below double-count every re-vote.
	let editing = $state(false);

	// Pending selection for multi-select before submitting
	let pending = $state<Set<string>>(new Set(poll.my_votes));

	// Only resync from the parent when we've actually been handed a
	// *different* poll (e.g. this component instance gets reused for a
	// different list item). Resyncing on every parent re-render would
	// stomp on our own optimistic vote/resolve updates.
	let trackedId = poll.id;
	$effect(() => {
		if (initialPoll.id !== trackedId) {
			poll = { ...initialPoll, options: [...initialPoll.options] };
			pending = new Set(initialPoll.my_votes);
			editing = false;
			trackedId = initialPoll.id;
		}
	});

	const isResolved = $derived(
		!!poll.resolved_at || (!!poll.resolve_at && new Date(poll.resolve_at) < new Date())
	);

	const hasVoted = $derived(poll.my_votes.length > 0);
	const showResults = $derived(isResolved || (hasVoted && !editing));

	const maxVotes = $derived(Math.max(...poll.options.map((o) => o.votes), 1));

	// Hover state for the per-option and poll-wide "who voted" dropdowns,
	// same debounce pattern as scheduleLikersHover in Lynt.svelte so a quick
	// mouse pass-over doesn't fire a fetch, but lingering does.
	let optionHover = $state<string | null>(null);
	let footerHover = $state(false);
	let hoverTimer: ReturnType<typeof setTimeout>;

	function scheduleOptionHover(optionId: string | null, show: boolean) {
		clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => (optionHover = show ? optionId : null), show ? 350 : 150);
	}

	function scheduleFooterHover(show: boolean) {
		clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => (footerHover = show), show ? 350 : 150);
	}

	function setsEqual(a: Set<string>, b: Set<string>) {
		if (a.size !== b.size) return false;
		for (const v of a) if (!b.has(v)) return false;
		return true;
	}

	const selectionChanged = $derived(!setsEqual(pending, new Set(poll.my_votes)));

	function formatResolveDate(d: string) {
		return new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function togglePending(optionId: string) {
		if (poll.multi_select) {
			const next = new Set(pending);
			if (next.has(optionId)) next.delete(optionId);
			else next.add(optionId);
			pending = next;
		} else {
			pending = new Set([optionId]);
		}
	}

	function startEdit() {
		pending = new Set(poll.my_votes);
		editing = true;
	}

	function cancelEdit() {
		pending = new Set(poll.my_votes);
		editing = false;
	}

	async function submitVote() {
		if (!loggedIn || pending.size === 0 || voting) return;
		if (hasVoted && !selectionChanged) {
			editing = false;
			return;
		}
		voting = true;
		try {
			const res = await fetch('/api/poll/vote', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ poll_id: poll.id, option_ids: [...pending] })
			});
			if (!res.ok) {
				const e = await res.json();
				toast.error(e.error ?? 'Failed to vote');
				return;
			}
			// Optimistically update tallies. poll.my_votes still reflects the
			// *previous* vote here, so wasVoted/isNowVoted correctly diff
			// old vs. new instead of double-adding.
			const newOptions = poll.options.map((o) => {
				const wasVoted = poll.my_votes.includes(o.id);
				const isNowVoted = pending.has(o.id);
				let votes = o.votes;
				if (wasVoted && !isNowVoted) votes--;
				if (!wasVoted && isNowVoted) votes++;
				return { ...o, votes: Math.max(0, votes), voted: isNowVoted };
			});
			const totalVotes = newOptions.reduce((s, o) => s + o.votes, 0);
			poll = { ...poll, options: newOptions, my_votes: [...pending], total_votes: totalVotes };
			editing = false;
			onupdate?.(poll);
		} catch {
			toast.error('Something went wrong');
		} finally {
			voting = false;
		}
	}

	async function resolvePoll() {
		if (resolving) return;
		resolving = true;
		try {
			const res = await fetch('/api/poll/resolve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ poll_id: poll.id })
			});
			if (!res.ok) {
				const e = await res.json();
				toast.error(e.error ?? 'Failed to resolve');
				return;
			}
			const data = await res.json();
			// Update options with server-confirmed tally
			const newOptions = poll.options.map((o) => {
				const t = data.tally.find((t: any) => t.option_id === o.id);
				return { ...o, votes: t ? Number(t.votes) : o.votes };
			});
			poll = { ...poll, options: newOptions, resolved_at: new Date().toISOString() };
			editing = false;
			onupdate?.(poll);
			toast.success('Poll resolved!');
		} catch {
			toast.error('Something went wrong');
		} finally {
			resolving = false;
		}
	}
</script>

<div class="poll" onclick={(e) => e.stopPropagation()} role="presentation">
	<div class="poll-head">
		<BarChart2 size={13} class="icon" />
		<span class="poll-eyebrow">Poll</span>
		{#if poll.multi_select}
			<span class="poll-tag">pick multiple</span>
		{/if}
	</div>

	<p class="poll-title">{poll.title}</p>

	<div class="options">
		{#each poll.options as option (option.id)}
			{@const pct = showResults
				? Math.round((option.votes / Math.max(poll.total_votes, 1)) * 100)
				: 0}
			{@const isWinner = isResolved && option.votes === maxVotes && option.votes > 0}
			{@const isSelected = pending.has(option.id)}

			{#if showResults}
				<div
					class="option-track"
					class:winner={isWinner}
					onmouseenter={() => scheduleOptionHover(option.id, true)}
					onmouseleave={() => scheduleOptionHover(option.id, false)}
					role="presentation"
				>
					<div
						class="option-fill"
						class:winner={isWinner}
						class:dim={isResolved && !isWinner}
						style="width: {pct}%;"
					></div>
					<!-- Base text, colored for the *unfilled* (track) background. -->
					<span class="option-text">
						{#if option.voted}<Check size={12} class="check" />{/if}
						{option.text}
					</span>
					<span class="pct">{pct}%</span>
					<!-- Duplicate text clipped to exactly the filled width, colored for
					     the *filled* (striped) background instead. Guarantees contrast
					     on both sides of the fill boundary regardless of theme, rather
					     than the old single foreground color that only worked in one
					     of the two themes. -->
					<div class="option-text-fill-overlay" style="clip-path: inset(0 {100 - pct}% 0 0);">
						<span class="option-text">
							{#if option.voted}<Check size={12} class="check" />{/if}
							{option.text}
						</span>
						<span class="pct">{pct}%</span>
					</div>
					<PollOptionVotersDropdown
						optionId={option.id}
						voteCount={option.votes}
						visible={optionHover === option.id}
					/>
				</div>
			{:else}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="option-choice"
					class:selected={isSelected}
					class:readonly={!loggedIn}
					onclick={() => {
						if (loggedIn) togglePending(option.id);
					}}
				>
					<span class="indicator" class:checkbox={poll.multi_select} class:radio={!poll.multi_select} class:selected={isSelected}>
						{#if isSelected}
							{#if poll.multi_select}
								<Check size={10} strokeWidth={3.5} />
							{:else}
								<span class="radio-dot"></span>
							{/if}
						{/if}
					</span>
					<span class="option-text">{option.text}</span>
				</div>
			{/if}
		{/each}
	</div>

	<div class="poll-footer">
		<span
			class="vote-count-wrap"
			onmouseenter={() => scheduleFooterHover(true)}
			onmouseleave={() => scheduleFooterHover(false)}
			role="presentation"
		>
			<span class="vote-count">{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}</span>
			<PollOptionVotersDropdown
				optionId={poll.id}
				kind="poll"
				voteCount={poll.total_votes}
				visible={footerHover}
			/>
		</span>

		{#if isResolved}
			<span class="resolved-badge">Ended</span>
		{:else if poll.resolve_at}
			<span class="resolve-date">Ends {formatResolveDate(poll.resolve_at)}</span>
		{/if}

		{#if !isResolved && loggedIn}
			{#if !hasVoted}
				{#if pending.size > 0}
					<button class="btn-3d vote-btn" onclick={submitVote} disabled={voting}>
						{voting ? 'Voting…' : 'Vote'}
					</button>
				{/if}
			{:else if editing}
				<button
					class="btn-3d vote-btn"
					onclick={submitVote}
					disabled={voting || pending.size === 0 || !selectionChanged}
				>
					{voting ? 'Updating…' : 'Update vote'}
				</button>
				<button class="btn-3d cancel-btn" onclick={cancelEdit} disabled={voting}>Cancel</button>
			{:else}
				<button class="btn-3d change-btn" onclick={startEdit}>Change vote</button>
			{/if}
		{/if}

		{#if !isResolved && isAuthor && !poll.resolve_at}
			<button class="btn-3d resolve-btn" onclick={resolvePoll} disabled={resolving}>
				{resolving ? 'Resolving…' : 'Resolve poll'}
			</button>
		{/if}
	</div>
</div>

<style>
	.poll {
		margin-top: 8px;
		border-radius: calc(var(--radius) + 4px);
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
		font-family: var(--font-retro);
	}

	.poll-head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		/* .poll used to rely on overflow:hidden to round these top corners
		   to match its own radius, but that also clipped the option/footer
		   voter hover dropdowns whenever they popped up above the card
		   bounds. Rounding this directly means .poll no longer needs
		   overflow:hidden at all. */
		border-radius: calc(var(--radius) + 4px) calc(var(--radius) + 4px) 0 0;
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		color: hsl(var(--primary-foreground));
		border-bottom: 1px solid var(--bevel-dark);
	}
	.poll-head :global(.icon) {
		flex-shrink: 0;
		opacity: 0.9;
	}

	.poll-eyebrow {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.poll-tag {
		margin-left: auto;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.poll-title {
		padding: 10px 12px 2px;
		margin: 0;
		font-weight: 700;
		font-size: 14px;
		line-height: 1.35;
		color: hsl(var(--foreground));
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 10px 12px 6px;
	}

	/* ── Results mode: retro "progress bar" rows ── */
	.option-track {
		position: relative;
		display: flex;
		align-items: center;
		min-height: 32px;
		padding: 0 10px;
		border-radius: 5px;
		background: hsl(var(--muted));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
		overflow: hidden;
	}
	.option-track.winner {
		border-top-color: hsl(var(--primary));
		border-left-color: hsl(var(--primary));
	}

	/* Clipped duplicate-text overlay for fill contrast (see markup comment).
	   Same box/padding as .option-track so its text lines up pixel-for-pixel
	   with the base text underneath. */
	.option-text-fill-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		padding: 0 10px;
		pointer-events: none;
	}
	.option-text-fill-overlay .option-text,
	.option-text-fill-overlay .pct {
		color: hsl(var(--primary-foreground));
	}
	.option-text-fill-overlay .option-text {
		flex: 1;
	}

	.option-fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: repeating-linear-gradient(
			45deg,
			hsl(var(--primary)) 0px,
			hsl(var(--primary)) 8px,
			hsl(var(--primary-top)) 8px,
			hsl(var(--primary-top)) 16px
		);
		transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
		opacity: 0.92;
		pointer-events: none;
	}
	.option-fill.dim {
		opacity: 0.3;
		filter: grayscale(0.4);
	}

	/* ── Voting mode: chunky beveled choice rows ── */
	.option-choice {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		padding: 7px 10px;
		border-radius: 5px;
		background: hsl(var(--secondary));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		cursor: pointer;
		user-select: none;
		transition: transform 0.05s ease, background 0.12s ease;
	}
	.option-choice:hover {
		background: hsl(var(--accent));
	}
	.option-choice:active {
		transform: translate(1px, 1px);
	}
	.option-choice.readonly {
		cursor: default;
	}
	.option-choice.readonly:hover {
		background: hsl(var(--secondary));
	}
	.option-choice.readonly:active {
		transform: none;
	}
	.option-choice.selected {
		background: hsl(var(--primary) / 0.14);
		border-top-color: var(--bevel-dark);
		border-left-color: var(--bevel-dark);
		border-bottom-color: var(--bevel-light);
		border-right-color: var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}

	.indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		background: hsl(var(--background));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		color: hsl(var(--primary-foreground));
	}
	.indicator.checkbox {
		border-radius: 3px;
	}
	.indicator.radio {
		border-radius: 50%;
	}
	.indicator.selected {
		background: hsl(var(--primary));
	}
	.radio-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: hsl(var(--primary-foreground));
	}

	.option-text {
		display: flex;
		align-items: center;
		gap: 5px;
		position: relative;
		z-index: 1;
		font-size: 13px;
		color: hsl(var(--foreground));
	}
	.option-track .option-text {
		flex: 1;
	}
	.option-track :global(.check) {
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.pct {
		position: relative;
		z-index: 1;
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.poll-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 8px 12px 12px;
		font-size: 12px;
		border-top: 1px dashed hsl(var(--border));
		margin-top: 2px;
	}

	.vote-count-wrap {
		position: relative;
		display: inline-flex;
	}

	.vote-count {
		font-family: 'Consolas', 'Courier New', monospace;
		font-weight: 700;
		font-size: 11px;
		padding: 3px 7px;
		border-radius: 3px;
		background: hsl(var(--primary-dim));
		color: hsl(var(--primary-foreground));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}

	.resolved-badge {
		padding: 2px 8px;
		border-radius: 3px;
		border: 1.5px dashed hsl(var(--destructive) / 0.55);
		color: hsl(var(--destructive));
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		transform: rotate(-3deg);
	}

	.resolve-date {
		color: hsl(var(--muted-foreground));
	}

	.btn-3d {
		font-family: var(--font-retro);
		font-size: 11px;
		font-weight: 700;
		padding: 5px 14px;
		border-radius: 5px;
		cursor: pointer;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		transition: transform 0.05s ease, box-shadow 0.05s ease, opacity 0.15s;
	}
	.btn-3d:active:not(:disabled) {
		transform: translate(1px, 1px);
		box-shadow: none;
	}
	.btn-3d:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.vote-btn {
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		color: hsl(var(--primary-foreground));
	}
	.change-btn,
	.cancel-btn {
		background: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
	}

	.resolve-btn {
		margin-left: auto;
		background: hsl(var(--destructive) / 0.08);
		color: hsl(var(--destructive));
	}
</style>