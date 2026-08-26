<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '@/components/ui/button';
	import { ChevronLeft, MessageSquare, Pin, Lock, Plus } from 'lucide-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import TopTab from '../TopTab.svelte';
	import ForumNewThreadDialog from './ForumNewThreadDialog.svelte';

	interface Props {
		categoryId: string;
		categoryName: string;
		onBack: () => void;
		onOpenThread: (threadId: string) => void;
	}

	let { categoryId, categoryName, onBack, onOpenThread }: Props = $props();

	let threads: any[] = $state([]);
	let loading = $state(true);
	let sort = $state('Active');
	const tabs = ['Active', 'New', 'Top'];
	const sortMap: Record<string, string> = { Active: 'active', New: 'new', Top: 'top' };

	let showNewThread = $state(false);

	async function load() {
		loading = true;
		try {
			const response = await fetch(`/api/forum/threads?category=${categoryId}&sort=${sortMap[sort]}`);
			if (response.ok) threads = await response.json();
			else toast.error('Failed to load threads.');
		} catch {
			// Previously an unguarded fetch here meant a network error left
			// `loading` stuck true forever — spinner never clears, list never
			// resolves, and there's no error toast to explain why.
			toast.error('Failed to load threads. Check your connection and try again.');
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function handleTabChange(tab: string) {
		sort = tab;
		load();
	}

	function timeAgo(iso: string) {
		const diff = (Date.now() - new Date(iso).getTime()) / 1000;
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	function handleCreated(thread: any) {
		onOpenThread(thread.id);
	}
</script>

<div class="flex h-full w-full flex-col gap-3 px-1 py-2">
	<div class="flex items-center justify-between">
		<button class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onclick={onBack}>
			<ChevronLeft size={16} /> Categories
		</button>
		<Button size="sm" on:click={() => (showNewThread = true)}><Plus size={16} class="mr-1" /> New thread</Button>
	</div>

	<h2 class="text-xl font-bold">{categoryName}</h2>

	<TopTab {tabs} currentTab={sort} onTabChange={handleTabChange} />

	{#if loading}
		<LoadingSpinner occupy_screen={false} />
	{:else if threads.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">No threads yet — be the first to post!</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#each threads as thread (thread.id)}
				<button
					class="flex w-full flex-col gap-1 rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-3 text-left transition hover:bg-accent/50"
					onclick={() => onOpenThread(thread.id)}
				>
					<div class="flex flex-wrap items-center gap-2">
						{#if thread.pinned}<Pin size={14} class="text-primary" />{/if}
						{#if thread.closed}<Lock size={14} class="text-destructive" />{/if}
						<span class="font-semibold">{thread.title}</span>
					</div>
					<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						<span>by @{thread.handle}</span>
						<span class="flex items-center gap-1"><MessageSquare size={12} /> {thread.replyCount}</span>
						<span>score {thread.score}</span>
						<span>{timeAgo(thread.lastActivityAt)}</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<ForumNewThreadDialog bind:open={showNewThread} {categoryId} {categoryName} onCreated={handleCreated} />
