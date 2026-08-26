<script lang="ts">
	import '../../../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Plus, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import MarkdownEditor from '../../Forum/MarkdownEditor.svelte';
	import LoadingSpinner from '../../LoadingSpinner.svelte';

	type Category = 'new' | 'improved' | 'fixed' | 'removed';
	interface ItemDraft {
		category: Category;
		content: string;
	}
	interface Entry {
		id: string;
		version: string | null;
		title: string;
		body: string;
		published: boolean;
		items: ItemDraft[];
	}

	let entries = $state<Entry[]>([]);
	let loading = $state(true);
	let forbidden = $state(false);
	let saving = $state(false);

	// Draft state for the composer — a blank entry to start, or loaded from
	// an existing one via edit().
	let editingId = $state<string | null>(null);
	let version = $state('');
	let title = $state('');
	let body = $state('');
	let items = $state<ItemDraft[]>([]);

	function resetDraft() {
		editingId = null;
		version = '';
		title = '';
		body = '';
		items = [];
	}

	function edit(entry: Entry) {
		editingId = entry.id;
		version = entry.version ?? '';
		title = entry.title;
		body = entry.body;
		items = entry.items.map((i) => ({ category: i.category, content: i.content }));
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function addItem() {
		items = [...items, { category: 'new', content: '' }];
	}
	function removeItem(i: number) {
		items = items.filter((_, idx) => idx !== i);
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/admin/devcycle');
			if (res.status === 403 || res.status === 401) {
				forbidden = true;
				return;
			}
			entries = await res.json();
		} catch {
			toast.error('Failed to load entries');
		} finally {
			loading = false;
		}
	}

	async function save(publish: boolean) {
		if (!title.trim() || !body.trim()) {
			toast.error('Title and body are required');
			return;
		}
		saving = true;
		try {
			const payload = {
				version: version.trim() || null,
				title: title.trim(),
				body,
				published: publish,
				items: items.filter((i) => i.content.trim())
			};
			const res = await fetch('/api/admin/devcycle', {
				method: editingId ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload)
			});
			if (!res.ok) throw new Error('failed');
			toast.success(publish ? 'Published' : 'Saved as draft');
			resetDraft();
			await load();
		} catch {
			toast.error('Failed to save');
		} finally {
			saving = false;
		}
	}

	async function togglePublish(entry: Entry) {
		try {
			const res = await fetch('/api/admin/devcycle', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: entry.id, published: !entry.published })
			});
			if (!res.ok) throw new Error('failed');
			await load();
		} catch {
			toast.error('Failed to update');
		}
	}

	async function remove(id: string) {
		if (!confirm('Delete this entry permanently?')) return;
		try {
			const res = await fetch('/api/admin/devcycle', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('failed');
			toast.success('Deleted');
			if (editingId === id) resetDraft();
			await load();
		} catch {
			toast.error('Failed to delete');
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>Dev Cycle Admin — Lyntr</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24">
	<Button variant="outline" size="sm" class="gap-1.5" onclick={() => goto('/updates')}>
		<ArrowLeft class="h-4 w-4" />
		Back to Updates
	</Button>

	<div>
		<h1 class="text-2xl font-bold">Dev Cycle Admin</h1>
		<p class="text-muted-foreground text-sm">Author changelog entries. Drafts stay hidden from /updates until published.</p>
	</div>

	{#if loading}
		<LoadingSpinner />
	{:else if forbidden}
		<p class="text-muted-foreground text-sm">You don't have access to this page.</p>
	{:else}
		<Card>
			<CardHeader>
				<CardTitle>{editingId ? 'Edit entry' : 'New entry'}</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="flex gap-3">
					<div class="w-32 space-y-1.5">
						<Label for="version">Version</Label>
						<Input id="version" placeholder="2.4.0" bind:value={version} />
					</div>
					<div class="flex-1 space-y-1.5">
						<Label for="title">Title</Label>
						<Input id="title" placeholder="Reactions, live editing, and more" bind:value={title} />
					</div>
				</div>

				<div class="space-y-1.5">
					<Label>Summary (markdown)</Label>
					<MarkdownEditor bind:value={body} rows={5} placeholder="A short summary of this release..." />
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label>Bullet items</Label>
						<Button variant="outline" size="sm" class="gap-1" onclick={addItem}>
							<Plus class="h-3.5 w-3.5" />
							Add item
						</Button>
					</div>
					{#each items as item, i}
						<div class="flex items-start gap-2">
							<select bind:value={item.category} class="border-border bg-background rounded-md border px-2 py-1.5 text-sm">
								<option value="new">New</option>
								<option value="improved">Improved</option>
								<option value="fixed">Fixed</option>
								<option value="removed">Removed</option>
							</select>
							<Input class="flex-1" placeholder="Describe the change..." bind:value={item.content} />
							<Button variant="ghost" size="icon" onclick={() => removeItem(i)}>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					{/each}
				</div>

				<div class="flex gap-2 pt-2">
					<Button disabled={saving} onclick={() => save(true)}>Publish</Button>
					<Button variant="outline" disabled={saving} onclick={() => save(false)}>Save as draft</Button>
					{#if editingId}
						<Button variant="ghost" onclick={resetDraft}>Cancel edit</Button>
					{/if}
				</div>
			</CardContent>
		</Card>

		<div class="space-y-3">
			<h2 class="text-lg font-semibold">All entries</h2>
			{#each entries as entry (entry.id)}
				<Card>
					<CardContent class="flex items-center justify-between gap-3 py-4">
						<div>
							<div class="flex items-center gap-2">
								{#if entry.version}<Badge variant="outline" class="font-mono">v{entry.version}</Badge>{/if}
								<span class="font-medium">{entry.title}</span>
								<Badge variant={entry.published ? 'default' : 'outline'}>
									{entry.published ? 'Published' : 'Draft'}
								</Badge>
							</div>
						</div>
						<div class="flex shrink-0 gap-2">
							<Button variant="outline" size="sm" onclick={() => edit(entry)}>Edit</Button>
							<Button variant="outline" size="sm" onclick={() => togglePublish(entry)}>
								{entry.published ? 'Unpublish' : 'Publish'}
							</Button>
							<Button variant="ghost" size="icon" onclick={() => remove(entry.id)}>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
