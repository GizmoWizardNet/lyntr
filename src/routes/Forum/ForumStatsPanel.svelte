<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

	let stats: any = $state(null);

	onMount(async () => {
		const response = await fetch('/api/forum/stats');
		if (response.ok) stats = await response.json();
	});
</script>

{#if stats}
	<Card>
		<CardHeader class="pb-2">
			<CardTitle class="text-base">Forum stats</CardTitle>
		</CardHeader>
		<CardContent class="flex flex-col gap-2 text-sm">
			<div class="flex justify-between"><span class="text-muted-foreground">Threads</span><span class="font-semibold">{stats.threadCount}</span></div>
			<div class="flex justify-between"><span class="text-muted-foreground">Posts</span><span class="font-semibold">{stats.postCount}</span></div>
			<div class="flex justify-between"><span class="text-muted-foreground">Votes cast</span><span class="font-semibold">{stats.voteCount}</span></div>
			<div class="flex justify-between"><span class="text-muted-foreground">Participants</span><span class="font-semibold">{stats.participantCount}</span></div>

			{#if stats.mostDiscussed}
				<div class="mt-2 border-t border-border pt-2">
					<p class="text-xs text-muted-foreground">Most discussed</p>
					<p class="truncate text-sm font-semibold">{stats.mostDiscussed.title}</p>
					<p class="text-xs text-muted-foreground">{stats.mostDiscussed.replyCount} replies</p>
				</div>
			{/if}

			{#if stats.topPosters?.length}
				<div class="mt-2 border-t border-border pt-2">
					<p class="mb-1 text-xs text-muted-foreground">Top posters</p>
					{#each stats.topPosters as poster}
						<div class="flex justify-between text-xs">
							<span>@{poster.handle}</span>
							<span class="text-muted-foreground">{poster.postCount}</span>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>
{/if}
