<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Sparkles, Wrench, Bug, Trash2 } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { renderMarkdown } from '$lib/markdown';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import CommitGraph from '../CommitGraph.svelte';

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

	<CommitGraph />

	<div>
		<h2 class="text-lg font-semibold">Changelog</h2>
		<p class="text-muted-foreground text-xs">The human-readable version of the graph above.</p>
	</div>

	{#if loading}
		<LoadingSpinner />
	{:else if error}
		<p class="text-muted-foreground text-sm">Couldn't load updates right now. Try refreshing.</p>
	{:else if entries.length === 0}
		<p class="text-muted-foreground text-sm">Nothing posted yet — check back soon.</p>
	{:else}
		<!--
			Timeline rail: one dot per entry connected by a running vertical
			line, catplay-style. The line is a single absolutely-positioned
			element behind the dots rather than a per-row border, so it reads
			as one continuous thread down the page instead of segments that
			can visibly gap/overlap depending on each entry's height.
		-->
		<div class="timeline">
			<div class="timeline-line" aria-hidden="true"></div>
			{#each entries as entry, i (entry.id)}
				<article class="timeline-row">
					<div class="timeline-dot-col">
						<span class="timeline-dot" class:first={i === 0}></span>
					</div>
					<div class="timeline-content">
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
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Timeline rail. Grid keeps the dot column a fixed width so the line and
	   every dot land on the exact same x position regardless of how much
	   text is in a given entry. */
	.timeline {
		position: relative;
	}
	.timeline-line {
		position: absolute;
		left: 5px;
		top: 6px;
		bottom: 6px;
		width: 2px;
		background: linear-gradient(
			to bottom,
			var(--accent, #5865f2) 0%,
			color-mix(in srgb, var(--accent, #5865f2) 25%, transparent) 100%
		);
	}
	.timeline-row {
		display: grid;
		grid-template-columns: 12px 1fr;
		column-gap: 20px;
		padding-bottom: 40px;
	}
	.timeline-row:last-child {
		padding-bottom: 0;
	}
	.timeline-dot-col {
		display: flex;
		justify-content: center;
		padding-top: 6px;
	}
	.timeline-dot {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--background, #0b0b0d);
		border: 2px solid var(--accent, #5865f2);
		z-index: 1;
	}
	.timeline-dot.first {
		background: var(--accent, #5865f2);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent, #5865f2) 20%, transparent);
	}
	.timeline-content {
		min-width: 0;
	}
	.timeline-content > * + * {
		margin-top: 0.5rem;
	}
</style>