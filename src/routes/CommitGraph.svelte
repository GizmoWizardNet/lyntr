<script lang="ts">
	import { onMount } from 'svelte';

	interface NoteData {
		id: string;
		note: string;
		authorUsername: string | null;
		authorHandle: string | null;
		createdAt: string;
	}
	interface CommitData {
		sha: string;
		shortSha: string;
		parents: string[];
		message: string;
		authorName: string;
		authorLogin: string | null;
		avatarUrl: string | null;
		date: string;
		isMerge: boolean;
		notes: NoteData[];
	}

	let rawCommits = $state<CommitData[]>([]);
	let repo = $state('');
	let loading = $state(true);
	let failed = $state(false);
	let openNoteFor = $state<string | null>(null);

	// ── Topological ordering ────────────────────────────────────────────
	// GitHub returns commits in commit-date order, which is usually close
	// to topological but isn't guaranteed — author/committer date skew,
	// rebases, and interleaved branches can all put a parent above its own
	// child. Our lane algorithm below assumes strict "child before parent"
	// ordering, so we re-sort into a real topological order first (a
	// commit becomes eligible once every commit that names it as a parent
	// has already been placed), the same approach `git log --graph` itself
	// uses rather than pure chronological order. Ties are broken by the
	// original date-order index, so the result still reads top-to-bottom
	// like a normal commit list wherever topology doesn't force otherwise.
	function topoSort(list: CommitData[]): CommitData[] {
		const shaSet = new Set(list.map((c) => c.sha));
		const indexOf = new Map(list.map((c, i) => [c.sha, i]));
		const remainingChildren = new Map<string, number>();
		for (const c of list) remainingChildren.set(c.sha, remainingChildren.get(c.sha) ?? 0);
		for (const c of list) {
			for (const p of c.parents) {
				if (shaSet.has(p)) remainingChildren.set(p, (remainingChildren.get(p) ?? 0) + 1);
			}
		}

		const ready = list
			.filter((c) => (remainingChildren.get(c.sha) ?? 0) === 0)
			.map((c) => c.sha);

		const emitted: string[] = [];
		const emittedSet = new Set<string>();
		const bySha = new Map(list.map((c) => [c.sha, c]));

		while (ready.length) {
			// Always take the "readiest" commit closest to the original
			// date order, so independent branch tips still interleave
			// roughly by recency instead of in arbitrary discovery order.
			ready.sort((a, b) => indexOf.get(a)! - indexOf.get(b)!);
			const sha = ready.shift()!;
			if (emittedSet.has(sha)) continue;
			emitted.push(sha);
			emittedSet.add(sha);

			for (const p of bySha.get(sha)!.parents) {
				if (!shaSet.has(p)) continue;
				const rem = (remainingChildren.get(p) ?? 0) - 1;
				remainingChildren.set(p, rem);
				if (rem === 0) ready.push(p);
			}
		}

		// A real cycle can't happen in git history, but guard against any
		// commit our loop somehow missed (e.g. malformed API data) rather
		// than silently dropping rows.
		for (const c of list) if (!emittedSet.has(c.sha)) emitted.push(c.sha);

		return emitted.map((sha) => bySha.get(sha)!);
	}

	let commits = $derived(topoSort(rawCommits));

	// ── Lane layout — the same algorithm `git log --graph` uses: walk
	// commits top (newest) to bottom, keep an array of "lanes" where
	// lanes[i] holds the sha we expect to see next in that lane. When a
	// commit's sha matches a waiting lane, it settles there; otherwise it
	// takes the first free lane. Its first parent continues in the same
	// lane; any additional parents (merges) open/reuse a lane of their
	// own. Requires topoSort's ordering to be correct, or a parent could
	// get processed before the commit that's still waiting on it.
	type ParentLane = { sha: string; lane: number; offWindow?: boolean };
	type Layout = { lane: number; parentLanes: ParentLane[]; isRoot: boolean };

	function layoutGraph(list: CommitData[]): { layout: Layout[]; laneCount: number } {
		const shaSet = new Set(list.map((c) => c.sha));
		const lanes: (string | null)[] = [];
		const layout: Layout[] = [];

		for (const c of list) {
			let lane = lanes.findIndex((s) => s === c.sha);
			if (lane === -1) {
				lane = lanes.findIndex((s) => s === null);
				if (lane === -1) {
					lane = lanes.length;
					lanes.push(null);
				}
			}
			lanes[lane] = null;

			const parentLanes: ParentLane[] = [];
			const inWindowParents = c.parents.filter((p) => shaSet.has(p));

			c.parents.forEach((psha, pi) => {
				if (!shaSet.has(psha)) {
					// Parent exists in the real history but fell outside our
					// fetched window — draw a short fading stub instead of
					// silently dropping the connector, so it's visually
					// obvious the graph continues beyond what's loaded.
					parentLanes.push({ sha: psha, lane, offWindow: true });
					return;
				}
				const inWindowIdx = inWindowParents.indexOf(psha);
				if (inWindowIdx === 0) {
					lanes[lane] = psha;
					parentLanes.push({ sha: psha, lane });
				} else {
					let mLane = lanes.findIndex((s) => s === psha);
					if (mLane === -1) {
						mLane = lanes.findIndex((s) => s === null);
						if (mLane === -1) {
							mLane = lanes.length;
							lanes.push(null);
						}
						lanes[mLane] = psha;
					}
					parentLanes.push({ sha: psha, lane: mLane });
				}
			});

			layout.push({ lane, parentLanes, isRoot: inWindowParents.length === 0 });
		}

		// Trim trailing lanes nothing ever grew into, so the SVG isn't
		// wider than it needs to be after lanes free up near the end.
		let laneCount = lanes.length;
		while (laneCount > 1 && !layout.some((l) => l.lane === laneCount - 1)) laneCount--;

		return { layout, laneCount: Math.max(1, laneCount) };
	}

	let graph = $derived(layoutGraph(commits));

	const ROW_H = 58;
	const LANE_W = 22;
	const PAD_X = 16;
	const LANE_COLORS = [
		'hsl(var(--primary))',
		'#5eb3ff',
		'#ff8a5e',
		'#7be27b',
		'#e05eff',
		'#ffd85e'
	];

	function laneColor(lane: number) {
		return LANE_COLORS[lane % LANE_COLORS.length];
	}

	let shaIndex = $derived.by(() => {
		const map = new Map<string, number>();
		commits.forEach((c, i) => map.set(c.sha, i));
		return (sha: string) => map.get(sha) ?? -1;
	});

	function timeAgo(iso: string) {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		if (days < 30) return `${days}d ago`;
		return new Date(iso).toLocaleDateString();
	}

	onMount(async () => {
		try {
			const res = await fetch('/api/devcycle/graph');
			if (!res.ok) throw new Error(String(res.status));
			const data = await res.json();
			repo = data.repo;
			rawCommits = data.commits;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	});
</script>

<div class="graph-shell">
	<div class="graph-head">
		<span class="graph-title">Commit history</span>
		{#if repo}<span class="graph-repo">{repo}</span>{/if}
	</div>

	{#if loading}
		<div class="graph-empty">Fetching commit history…</div>
	{:else if failed || commits.length === 0}
		<div class="graph-empty">Couldn't load commit history right now.</div>
	{:else}
		<div
			class="graph-body"
			style="--lane-w: {LANE_W}px; --row-h: {ROW_H}px; --pad-x: {PAD_X}px;"
		>
			<svg
				class="graph-lines"
				width={graph.laneCount * LANE_W + PAD_X * 2}
				height={commits.length * ROW_H}
			>
				{#each commits as commit, i (commit.sha)}
					{@const l = graph.layout[i]}
					{#each l.parentLanes as pl (pl.sha)}
						{@const pIdx = shaIndex(pl.sha)}
						{@const x1 = PAD_X + l.lane * LANE_W + LANE_W / 2}
						{@const y1 = i * ROW_H + ROW_H / 2}
						{#if pl.offWindow}
							<!-- Parent exists but fell outside our fetched window —
							     a short fading stub shows history continues rather
							     than the connector just vanishing. -->
							<line
								x1={x1}
								y1={y1}
								x2={x1}
								y2={y1 + ROW_H * 0.4}
								stroke={laneColor(l.lane)}
								stroke-width="2.5"
								stroke-dasharray="2 3"
								opacity="0.35"
							/>
						{:else if pIdx !== -1}
							{@const x2 = PAD_X + pl.lane * LANE_W + LANE_W / 2}
							{@const y2 = pIdx * ROW_H + ROW_H / 2}
							{@const midY = (y1 + y2) / 2}
							<path
								d="M {x1} {y1} C {x1} {midY}, {x2} {midY}, {x2} {y2}"
								stroke={laneColor(pl.lane)}
								stroke-width="2.5"
								fill="none"
								opacity="0.85"
							/>
						{/if}
					{/each}
				{/each}

				{#each commits as commit, i (commit.sha)}
					{@const l = graph.layout[i]}
					<circle
						cx={PAD_X + l.lane * LANE_W + LANE_W / 2}
						cy={i * ROW_H + ROW_H / 2}
						r={commit.isMerge ? 7 : 5.5}
						fill={commit.isMerge ? 'hsl(var(--background))' : laneColor(l.lane)}
						stroke={laneColor(l.lane)}
						stroke-width="2.5"
						stroke-dasharray={l.isRoot ? '2 2' : undefined}
					/>
				{/each}
			</svg>

			<div class="graph-rows">
				{#each commits as commit, i (commit.sha)}
					<div class="graph-row" style="height: {ROW_H}px;">
						<div class="commit-meta">
							<span class="commit-msg">{commit.message}</span>
							<span class="commit-sub">
								{#if commit.avatarUrl}
									<img src={commit.avatarUrl} alt="" class="commit-avatar" />
								{/if}
								<span class="commit-author">{commit.authorLogin ?? commit.authorName}</span>
								<code class="commit-sha">{commit.shortSha}</code>
								<span class="commit-time">{timeAgo(commit.date)}</span>
								{#if commit.isMerge}<span class="commit-merge-tag">merge</span>{/if}
							</span>
						</div>

						{#if commit.notes.length > 0}
							<div class="note-anchor">
								<button
									class="note-trigger"
									onclick={() =>
										(openNoteFor = openNoteFor === commit.sha ? null : commit.sha)}
								>
									💬 {commit.notes.length}
								</button>
								{#if openNoteFor === commit.sha}
									<div class="glass-bubble">
										{#each commit.notes as n (n.id)}
											<div class="glass-note">
												<p>{n.note}</p>
												<span class="glass-note-author">
													— {n.authorUsername ?? n.authorHandle ?? 'admin'}
												</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.graph-shell {
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: var(--inset-shadow);
	}

	.graph-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 10px 14px;
		background: linear-gradient(to bottom, hsl(var(--primary) / 0.95), hsl(var(--primary) / 0.75));
		color: hsl(var(--primary-foreground));
		border-bottom: 1px solid var(--bevel-dark);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
	}
	.graph-title { font-weight: 800; font-size: 15px; }
	.graph-repo { font-size: 11px; opacity: 0.85; font-family: monospace; }

	.graph-empty {
		padding: 24px;
		text-align: center;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.graph-body {
		position: relative;
		display: flex;
		background: hsl(var(--background));
		max-height: 640px;
		overflow-y: auto;
	}

	.graph-lines {
		flex-shrink: 0;
		display: block;
	}

	.graph-rows {
		flex: 1;
		min-width: 0;
	}

	.graph-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 14px 0 4px;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		position: relative;
	}

	.commit-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.commit-msg {
		font-size: 13px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.commit-sub {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10.5px;
		color: hsl(var(--muted-foreground));
	}
	.commit-avatar {
		width: 14px;
		height: 14px;
		border-radius: 999px;
	}
	.commit-sha {
		font-family: monospace;
		background: hsl(var(--muted));
		border-radius: 3px;
		padding: 0 4px;
	}
	.commit-merge-tag {
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		font-size: 9px;
	}

	/* ── Glass bubble note ── */
	.note-anchor { position: relative; flex-shrink: 0; }
	.note-trigger {
		font-size: 11px;
		font-weight: 700;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 999px;
		padding: 2px 8px;
		cursor: pointer;
	}
	.glass-bubble {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 20;
		margin-top: 6px;
		width: 240px;
		padding: 10px 12px;
		border-radius: 12px;
		background: hsl(var(--card) / 0.65);
		backdrop-filter: blur(14px) saturate(1.4);
		-webkit-backdrop-filter: blur(14px) saturate(1.4);
		border: 1px solid hsl(var(--foreground) / 0.15);
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}
	.glass-note + .glass-note {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid hsl(var(--foreground) / 0.1);
	}
	.glass-note p {
		margin: 0 0 4px;
		font-size: 12px;
		line-height: 1.4;
	}
	.glass-note-author {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
	}
</style>