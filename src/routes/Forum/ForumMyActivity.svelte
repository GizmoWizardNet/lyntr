<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge } from '@/components/ui/badge';
	import { ChevronLeft, Lock, Pin } from 'lucide-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import TopTab from '../TopTab.svelte';

	interface Props {
		onBack: () => void;
		onOpenThread: (threadId: string) => void;
	}

	let { onBack, onOpenThread }: Props = $props();

	let loading = $state(true);
	let data: { threads: any[]; posts: any[] } = $state({ threads: [], posts: [] });
	let currentTab = $state('Threads');
	const tabs = ['Threads', 'Posts'];

	onMount(async () => {
		const response = await fetch('/api/forum/me');
		if (response.ok) data = await response.json();
		loading = false;
	});
</script>

<div class="flex h-full w-full flex-col gap-3 px-1 py-2">
	<button class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onclick={onBack}>
		<ChevronLeft size={16} /> Forum
	</button>

	<h2 class="text-xl font-bold">My forum activity</h2>
	<TopTab {tabs} {currentTab} onTabChange={(t) => (currentTab = t)} />

	{#if loading}
		<LoadingSpinner occupy_screen={false} />
	{:else if currentTab === 'Threads'}
		{#if data.threads.length === 0}
			<p class="py-8 text-center text-sm text-muted-foreground">You haven't started any threads yet.</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each data.threads as thread (thread.id)}
					<button class="rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-3 text-left hover:bg-accent/50" onclick={() => onOpenThread(thread.id)}>
						<div class="flex items-center gap-2">
							{#if thread.pinned}<Pin size={13} class="text-primary" />{/if}
							{#if thread.closed}<Lock size={13} class="text-destructive" />{/if}
							<span class="font-semibold">{thread.title}</span>
						</div>
						<p class="text-xs text-muted-foreground">{thread.categoryId} · {thread.views} views</p>
					</button>
				{/each}
			</div>
		{/if}
	{:else if data.posts.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">You haven't posted any replies yet.</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#each data.posts as post (post.id)}
				<button class="rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-3 text-left hover:bg-accent/50" onclick={() => onOpenThread(post.threadId)}>
					<p class="truncate text-sm {post.deleted ? 'italic text-muted-foreground' : ''}">{post.content}</p>
					<p class="text-xs text-muted-foreground">in "{post.threadTitle}" · score {post.score}</p>
				</button>
			{/each}
		</div>
	{/if}
</div>
