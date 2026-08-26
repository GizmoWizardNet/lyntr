<script lang="ts">
	import * as Tooltip from '@/components/ui/tooltip';
	import { Trophy } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { top3, ensureTop3Loaded, badgesForHandle, CATEGORY_META } from './leaderboardStore';

	interface Props {
		handle: string;
		compact?: boolean;
	}

	let { handle, compact = false }: Props = $props();

	onMount(() => {
		ensureTop3Loaded();
	});

	let badges = $derived(badgesForHandle($top3, handle));

	function rankColor(rank: number) {
		if (rank === 1) return '#F5C518'; // gold
		if (rank === 2) return '#C0C0C0'; // silver
		return '#CD7F32'; // bronze
	}

	function rankLabel(rank: number) {
		if (rank === 1) return '1st';
		if (rank === 2) return '2nd';
		return '3rd';
	}

	const iconSize = compact ? 20 : 30;
</script>

{#each badges as badge (badge.category)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Trophy size={iconSize} color={rankColor(badge.rank)} fill={rankColor(badge.rank)} strokeWidth={1.5} />
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>
				<strong>{rankLabel(badge.rank)} place</strong> — {CATEGORY_META[badge.category].label}
			</p>
		</Tooltip.Content>
	</Tooltip.Root>
{/each}
