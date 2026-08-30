<script lang="ts">
	import * as Tooltip from '@/components/ui/tooltip';
	import { mode } from 'mode-watcher';
	import { Star, Flame, Rocket } from 'lucide-svelte';
	
	interface Props {
		verified?: boolean;
		isAdmin?: boolean;
		contributor?: boolean;
		loginStreak?: number;
		followerCount?: number;
		followsViewer?: boolean;
		/** @deprecated use size="compact" instead */
		compact?: boolean;
		size?: 'default' | 'compact' | 'tiny';
	}

	let {
		verified = false,
		isAdmin = false,
		contributor = false,
		loginStreak = 0,
		followerCount = 0,
		followsViewer = false,
		compact = false,
		size
	}: Props = $props();

	// `compact` predates `size` — keep it working as `size="compact"` so
	// existing call sites (ProfilePage, LyntContents, ForumPostCard) don't
	// need touching.
	let resolvedSize = $derived(size ?? (compact ? 'compact' : 'default'));
	let isCompact = $derived(resolvedSize !== 'default');
	let isTiny = $derived(resolvedSize === 'tiny');

	// ── Star tier ────────────────────────────────────────────────
	type StarTier = { color: string; label: string } | null;

	function getStarTier(n: number): StarTier {
		if (n >= 10000) return { color: '#F5C518', label: 'Gold star — 10,000+ followers' };
		if (n >= 5000)  return { color: '#E5E4E2', label: 'Platinum star — 5,000+ followers' };
		if (n >= 1000)  return { color: '#50C878', label: 'Emerald star — 1,000+ followers' };
		if (n >= 500)   return { color: '#FF6B35', label: 'Orange star — 500+ followers' };
		if (n >= 100)   return { color: '#A855F7', label: 'Purple star — 100+ followers' };
		if (n >= 50)    return { color: '#3B82F6', label: 'Blue star — 50+ followers' };
		if (n >= 10)    return { color: '#9CA3AF', label: 'Grey star — 10+ followers' };
		return null;
	}
	let starTier = $derived(getStarTier(followerCount));

	// ── Streak colour ────────────────────────────────────────────
	function streakColor(n: number): string {
		if (n >= 365) return '#F5C518';
		if (n >= 30)  return '#FF6B35';
		if (n >= 7)   return '#3B82F6';
		return '#9CA3AF';
	}
	let flameColor = $derived(streakColor(loginStreak));

	let iconSize = $derived(isTiny ? 13 : isCompact ? 20 : 30);
</script>

<div class="badges-row" class:compact={isCompact} class:tiny={isTiny}>

	<!-- Verified -->
	{#if verified}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<img
					src={mode.current !== 'light' ? 'white_mode_verified.png?v=7' : 'verified.png?v=7'}
					alt="Verified"
					class="badge-img"
				/>
			</Tooltip.Trigger>
			<Tooltip.Content><p>This user is <span class="rounded-xl bg-border px-1">verified</span>!</p></Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<!-- Admin -->
	{#if isAdmin}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<img 
					src="/admin_badge.gif" 
					alt="Admin"
					class="badge-img"
				/>
			</Tooltip.Trigger>
			<Tooltip.Content><p>This user is an <span class="rounded-xl bg-border px-1">admin</span>.</p></Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<!-- Contributor — always shown even in compact mode -->
	{#if contributor}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<img src="/badge_contrib.gif" alt="Contributor" class="badge-img" />
			</Tooltip.Trigger>
			<Tooltip.Content><p>This user has <span class="rounded-xl bg-border px-1">contributed</span> to Lyntr!</p></Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<!-- Popularity star -->
	{#if starTier}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Star size={iconSize} color={starTier.color} fill={starTier.color} strokeWidth={1.5} />
			</Tooltip.Trigger>
			<Tooltip.Content><p>{starTier.label}</p></Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<!-- Login streak -->
	{#if loginStreak > 1 || !isCompact}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<span class="streak-wrap">
					<Flame size={iconSize} color={flameColor} fill={flameColor} strokeWidth={1.5} />
					{#if !isCompact}
						<span class="streak-num" style="color: {flameColor}">{loginStreak}</span>
					{/if}
				</span>
			</Tooltip.Trigger>
			<Tooltip.Content><p><strong>{loginStreak}-day</strong> login streak</p></Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<!-- Rocket: this person follows the viewer -->
	{#if followsViewer}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Rocket size={iconSize} color="#6366F1" fill="#6366F1" strokeWidth={1.5} />
			</Tooltip.Trigger>
			<Tooltip.Content><p>Follows you :D</p></Tooltip.Content>
		</Tooltip.Root>
	{/if}

</div>

<style>
	.badges-row {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0; /* never let the whole badge cluster get squeezed by a parent flex row */
	}
	.badges-row.compact { gap: 3px; }
	.badges-row.tiny { gap: 2px; }
	.badge-img { width: 45px; height: 45px; display: block; flex-shrink: 0; }
	.badges-row.compact .badge-img { width: 30px; height: 30px; }
	.badges-row.tiny .badge-img { width: 15px; height: 15px; }
	.streak-wrap { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }
	.streak-num { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }

	/* lucide-svelte renders a raw <svg> for each icon (ShieldCheck, Star, Flame, Rocket) —
	   without this, those svgs shrink individually inside the inline-flex row too */
	.badges-row :global(svg) {
		flex-shrink: 0;
	}
</style>