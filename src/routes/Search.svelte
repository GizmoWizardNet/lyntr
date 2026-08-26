<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import Lynt from './Lynt.svelte';
	import { onMount } from 'svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import { toast } from 'svelte-sonner';
	import { pendingSearchQuery } from './stores';

	let searchQuery = $state('');
	let searchResults: any[] = $state([]);
	let isLoading = $state(false);
	let hasSearched = $state(false);

	let { handleLyntClick, userId } = $props();

	// Guards against the classic race: fire a search, fire another before
	// the first resolves, and the slower first response lands *after* the
	// second and silently overwrites its fresher results with stale ones.
	// Each call gets a ticket; only the most recent ticket's response is
	// allowed to commit to state.
	let searchTicket = 0;

	async function performSearch() {
		if (!searchQuery.trim() || isLoading) return;
		const ticket = ++searchTicket;
		isLoading = true;
		hasSearched = true;
		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
				method: 'GET'
			});
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const results = await response.json();
			if (ticket !== searchTicket) return; // a newer search superseded this one
			searchResults = results;
		} catch (error) {
			if (ticket !== searchTicket) return;
			console.error('Search error:', error);
			toast('Failed to perform search. Please try again.');
		} finally {
			if (ticket === searchTicket) isLoading = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			performSearch();
		}
	}

	function handleInput() {
		hasSearched = false;
		searchResults = [];
	}

	$effect(() => {
		const q = $pendingSearchQuery;
		if (q) {
			searchQuery = q;
			pendingSearchQuery.set(null);
			performSearch();
		}
	});
</script>

<div class="mx-auto flex h-full w-full flex-col items-center mt-5">
	<h1 class="mb-4 text-2xl font-bold">Search Lynts</h1>
	<div class="mb-1 flex w-full p-1">
		<Input
			type="text"
			placeholder="Search, or try from:@handle content:word #tag"
			bind:value={searchQuery}
			on:keydown={handleKeyDown}
			on:input={handleInput}
			class="mr-2 flex-grow"
		/>
		<Button on:click={performSearch} disabled={isLoading || !searchQuery.trim()}>
			{isLoading ? 'Searching…' : 'Search'}
		</Button>
	</div>
	<p class="mb-3 w-full px-1 text-xs text-muted-foreground">
		Operators: <code>from:@handle</code>, <code>content:word</code>, <code>#tag</code> — combine them, e.g. "from:@ada content:c-plus-plus"
	</p>
	<div class="w-full flex-grow overflow-hidden">
		<div class="h-full overflow-y-auto overflow-x-hidden">
			{#if isLoading}
				<LoadingSpinner />
			{:else if hasSearched}
				{#if searchResults.length > 0}
					<div class="flex flex-col gap-4 px-1">
						{#each searchResults as lynt}
							<Lynt {...lynt} myId={userId} on:lyntClick={handleLyntClick} />
						{/each}
					</div>
				{:else}
					<p>No results found for "{searchQuery}"</p>
				{/if}
			{/if}
		</div>
	</div>
</div>

<svelte:head>
	{#if hasSearched}
		<title>Searching for "{searchQuery}" | Lyntr</title>
	{:else}
		<title>Search | Lyntr</title>
	{/if}
</svelte:head>
