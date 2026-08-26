<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { MessageSquare, Search as SearchIcon, User2 } from 'lucide-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import ForumThreadList from './ForumThreadList.svelte';
	import ForumThreadView from './ForumThreadView.svelte';
	import ForumStatsPanel from './ForumStatsPanel.svelte';
	import ForumSearchPanel from './ForumSearchPanel.svelte';
	import ForumMyActivity from './ForumMyActivity.svelte';
	import { pendingForumThreadId } from '../stores';

	interface Props {
		myId: string;
	}

	let { myId }: Props = $props();

	// view: 'categories' | 'category' | 'thread' | 'search' | 'me'
	let view = $state('categories');
	let categories: any[] = $state([]);
	let loadingCategories = $state(true);
	let selectedCategory: any = $state(null);
	let selectedThreadId: string | null = $state(null);

	onMount(async () => {
		const response = await fetch('/api/forum/categories');
		if (response.ok) categories = await response.json();
		else toast.error('Failed to load forum categories.');
		loadingCategories = false;
	});

	function openCategory(category: any) {
		selectedCategory = category;
		view = 'category';
	}

	function openThread(threadId: string) {
		selectedThreadId = threadId;
		view = 'thread';
	}

	function backToCategories() {
		view = 'categories';
		selectedCategory = null;
	}

	function backToCategory() {
		view = selectedCategory ? 'category' : 'categories';
		selectedThreadId = null;
	}

	// A forum notification was clicked elsewhere (e.g. Notifications panel) —
	// jump straight to that thread instead of leaving the store's job to
	// something that has no other way to reach into ForumPage's own state.
	$effect(() => {
		const id = $pendingForumThreadId;
		if (id) {
			openThread(id);
			pendingForumThreadId.set(null);
		}
	});
</script>

<div class="flex h-full w-full gap-4 md:flex-row">
	<div class="flex h-full w-full flex-col">
		{#if view === 'thread' && selectedThreadId}
			<ForumThreadView threadId={selectedThreadId} {myId} onBack={backToCategory} />
		{:else if view === 'category' && selectedCategory}
			<ForumThreadList
				categoryId={selectedCategory.id}
				categoryName={selectedCategory.name}
				onBack={backToCategories}
				onOpenThread={openThread}
			/>
		{:else if view === 'search'}
			<ForumSearchPanel onBack={backToCategories} onOpenThread={openThread} />
		{:else if view === 'me'}
			<ForumMyActivity onBack={backToCategories} onOpenThread={openThread} />
		{:else}
			<div class="flex h-full w-full flex-col gap-3 px-1 py-2">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="text-2xl font-bold">Forum</h2>
					<div class="flex gap-2">
						<button
							class="flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
							onclick={() => (view = 'search')}
						>
							<SearchIcon size={15} /> Search
						</button>
						<button
							class="flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
							onclick={() => (view = 'me')}
						>
							<User2 size={15} /> My activity
						</button>
					</div>
				</div>

				{#if loadingCategories}
					<LoadingSpinner occupy_screen={false} />
				{:else}
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{#each categories as category (category.id)}
							<button
								class="flex flex-col gap-1 rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-4 text-left transition hover:bg-accent/50"
								onclick={() => openCategory(category)}
							>
								<span class="text-lg font-semibold">{category.name}</span>
								<span class="text-sm text-muted-foreground">{category.description}</span>
								<span class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
									<MessageSquare size={12} />
									{category.threadCount} threads · {category.postCount} posts
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="hidden w-[280px] flex-col gap-3 lg:flex">
		<ForumStatsPanel />
	</div>
</div>
