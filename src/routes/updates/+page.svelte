<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Sparkles, Wrench, Bug, Trash2 } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { renderMarkdown } from '$lib/markdown';
	import LoadingSpinner from '../LoadingSpinner.svelte';

	type Category = 'new' | 'improved' | 'fixed' | 'removed';
	interface DevCycleItem {
		id: string;
		category: Category;
		content: string;
		position: number;
	}
	interface DevCycleEntry {
		id: string;
		version: string | null;
		title: string;
		body: string;
		publishedAt: string;
		authorHandle: string | null;
		authorUsername: string | null;
		items: DevCycleItem[];
	}

	let entries = $state<DevCycleEntry[]>([]);
	let loading = $state(true);
	let error = $state(false);

	// Same visual language as the method-color badges on /developer —
	// each bullet category gets its own icon + accent color so a long
	// entry (like catplay's "What's New — Catplay 2.0" list) scans fast
	// without reading every line.
	const CATEGORY_META: Record<Category, { label: string; icon: any; class: string }> = {
		new: { label: 'New', icon: Sparkles, class: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
		improved: { label: 'Improved', icon: Wrench, class: 'bg-sky-500/15 text-sky-500 border-sky-500/30' },
		fixed: { label: 'Fixed', icon: Bug, class: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
		removed: { label: 'Removed', icon: Trash2, class: 'bg-rose-500/15 text-rose-500 border-rose-500/30' }
	};

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
	}

	async function load() {
		loading = true;
		error = false;
		try {
			const res = await fetch('/api/devcycle');
			if (!res.ok) throw new Error('failed');
			entries = await res.json();
		} catch {
			error = true;
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>Dev Cycle — Lyntr</title>
	<meta name="description" content="What's new on Lyntr — releases, fixes, and features as they ship." />
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-8 p-4 pb-24">
	<Button variant="outline" size="sm" class="gap-1.5" onclick={() => goto('/')}>
		<ArrowLeft class="h-4 w-4" />
		Back to Home
	</Button>

	<div>
		<h1 class="text-2xl font-bold">Dev Cycle</h1>
		<p class="text-muted-foreground text-sm">
			What's shipping on Lyntr — new features, fixes, and everything in between, as it goes out.
		</p>
	</div>

	{#if loading}
		<LoadingSpinner />
	{:else if error}
		<p class="text-muted-foreground text-sm">Couldn't load updates right now. Try refreshing.</p>
	{:else if entries.length === 0}
		<p class="text-muted-foreground text-sm">Nothing posted yet — check back soon.</p>
	{:else}
		<div class="space-y-10">
			{#each entries as entry (entry.id)}
				<article class="space-y-3">
					<div class="flex flex-wrap items-center gap-2">
						{#if entry.version}
							<Badge variant="outline" class="font-mono">v{entry.version}</Badge>
						{/if}
						<h2 class="text-xl font-semibold">{entry.title}</h2>
					</div>
					<p class="text-muted-foreground text-xs">
						{formatDate(entry.publishedAt)}
						{#if entry.authorHandle}
							· by @{entry.authorHandle}
						{/if}
					</p>

					{#if entry.body}
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(entry.body)}
						</div>
					{/if}

					{#if entry.items?.length}
						<ul class="space-y-1.5">
							{#each entry.items as item (item.id)}
								{@const meta = CATEGORY_META[item.category] ?? CATEGORY_META.improved}
								<li class="flex items-start gap-2 text-sm">
									<Badge variant="outline" class="mt-0.5 shrink-0 gap-1 {meta.class}">
										<meta.icon class="h-3 w-3" />
										{meta.label}
									</Badge>
									<span>{item.content}</span>
								</li>
							{/each}
						</ul>
					{/if}

					<Separator />
				</article>
			{/each}
		</div>
	{/if}
</div>