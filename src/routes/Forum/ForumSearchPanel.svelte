<script lang="ts">
	import { Input } from '@/components/ui/input';
	import { Search as SearchIcon, ChevronLeft } from 'lucide-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';

	interface Props {
		onBack: () => void;
		onOpenThread: (threadId: string) => void;
	}

	let { onBack, onOpenThread }: Props = $props();

	let q = $state('');
	let loading = $state(false);
	let results: { threads: any[]; posts: any[] } = $state({ threads: [], posts: [] });
	let debounceTimer: ReturnType<typeof setTimeout>;
	let searchTicket = 0;

	function handleInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(search, 300);
	}

	async function search() {
		if (q.trim().length < 2) {
			results = { threads: [], posts: [] };
			return;
		}
		const ticket = ++searchTicket;
		loading = true;
		try {
			const response = await fetch(`/api/forum/search?q=${encodeURIComponent(q)}`);
			if (ticket !== searchTicket) return; // superseded by a newer keystroke's search
			if (response.ok) {
				results = await response.json();
			} else {
				results = { threads: [], posts: [] };
			}
		} catch {
			// Without this, a network error left `loading` stuck true forever —
			// the spinner never went away and there was no way to tell the
			// search had actually failed rather than just being slow.
			if (ticket === searchTicket) results = { threads: [], posts: [] };
		} finally {
			if (ticket === searchTicket) loading = false;
		}
	}
</script>

<div class="flex h-full w-full flex-col gap-3 px-1 py-2">
	<button class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onclick={onBack}>
		<ChevronLeft size={16} /> Forum
	</button>

	<div class="relative">
		<SearchIcon size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
		<Input class="pl-9" placeholder="Search threads and posts..." bind:value={q} oninput={handleInput} />
	</div>

	{#if loading}
		<LoadingSpinner occupy_screen={false} />
	{:else if q.trim().length >= 2}
		{#if results.threads.length === 0 && results.posts.length === 0}
			<p class="py-8 text-center text-sm text-muted-foreground">No results found.</p>
		{:else}
			{#if results.threads.length > 0}
				<div>
					<p class="mb-1 text-xs font-semibold text-muted-foreground">Threads</p>
					<div class="flex flex-col gap-2">
						{#each results.threads as thread (thread.id)}
							<button class="rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-2 text-left hover:bg-accent/50" onclick={() => onOpenThread(thread.id)}>
								<p class="font-semibold">{thread.title}</p>
								<p class="text-xs text-muted-foreground">by @{thread.handle} in {thread.categoryId}</p>
							</button>
						{/each}
					</div>
				</div>
			{/if}
			{#if results.posts.length > 0}
				<div>
					<p class="mb-1 text-xs font-semibold text-muted-foreground">Posts</p>
					<div class="flex flex-col gap-2">
						{#each results.posts as post (post.id)}
							<button class="rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-2 text-left hover:bg-accent/50" onclick={() => onOpenThread(post.threadId)}>
								<p class="truncate text-sm">{post.content}</p>
								<p class="text-xs text-muted-foreground">in "{post.threadTitle}" · @{post.handle}</p>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
