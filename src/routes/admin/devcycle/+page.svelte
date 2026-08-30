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

	// ── Commit note bubbles ──────────────────────────────────────────────
	interface GraphCommit {
		sha: string;
		shortSha: string;
		message: string;
		authorLogin: string | null;
		authorName: string;
		notes: { id: string; note: string }[];
	}
	let commits = $state<GraphCommit[]>([]);
	let commitsLoading = $state(true);
	let commitFilter = $state('');
	let noteDraftSha = $state<string | null>(null);
	let noteDraftText = $state('');
	let noteSaving = $state(false);

	let filteredCommits = $derived(
		commitFilter.trim()
			? commits.filter(
					(c) =>
						c.message.toLowerCase().includes(commitFilter.toLowerCase()) ||
						c.shortSha.includes(commitFilter.toLowerCase())
				)
			: commits
	);

	async function loadCommits() {
		commitsLoading = true;
		try {
			const res = await fetch('/api/devcycle/graph');
			const data = await res.json();
			commits = data.commits ?? [];
		} catch {
			toast.error('Failed to load commit history');
		} finally {
			commitsLoading = false;
		}
	}

	function startNote(sha: string) {
		noteDraftSha = sha;
		noteDraftText = '';
	}

	async function saveNote() {
		if (!noteDraftSha || !noteDraftText.trim()) return;
		noteSaving = true;
		try {
			const res = await fetch('/api/admin/devcycle/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commitSha: noteDraftSha, note: noteDraftText.trim() })
			});
			if (!res.ok) throw new Error('failed');
			toast.success('Note pinned to commit');
			noteDraftSha = null;
			noteDraftText = '';
			await loadCommits();
		} catch {
			toast.error('Failed to save note');
		} finally {
			noteSaving = false;
		}
	}

	async function deleteNote(id: string) {
		if (!confirm('Remove this note?')) return;
		try {
			const res = await fetch('/api/admin/devcycle/notes', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('failed');
			await loadCommits();
		} catch {
			toast.error('Failed to delete note');
		}
	}

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
	onMount(loadCommits);
</script>

<svelte:head>
	<title>Dev Cycle Admin — Lyntr</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24">
	<Button variant="outline" size="sm" class="gap-1.5" onclick={() => goto('/updates')}>
		<ArrowLeft class="h-4 w-4" />
		Back to Updates
	</Button>

	<div class="devcycle-header">
		<h1>Dev Cycle Admin</h1>
		<p>Author changelog entries. Drafts stay hidden from /updates until published.</p>
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
							<select bind:value={item.category} class="px-2 py-1.5 text-sm">
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

		<Card>
			<CardHeader>
				<CardTitle>Commit note bubbles</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				<p class="text-muted-foreground text-xs">
					Pin a short note to any commit — it shows as a glass bubble on the commit graph at /updates.
				</p>
				<Input placeholder="Filter by message or SHA…" bind:value={commitFilter} />

				{#if commitsLoading}
					<LoadingSpinner />
				{:else}
					<div class="commit-note-list">
						{#each filteredCommits as c (c.sha)}
							<div class="commit-note-row">
								<div class="commit-note-meta">
									<code>{c.shortSha}</code>
									<span class="commit-note-msg">{c.message}</span>
								</div>

								{#each c.notes as n (n.id)}
									<div class="commit-note-existing">
										<span>{n.note}</span>
										<Button variant="ghost" size="icon" onclick={() => deleteNote(n.id)}>
											<Trash2 class="h-3.5 w-3.5" />
										</Button>
									</div>
								{/each}

								{#if noteDraftSha === c.sha}
									<div class="flex gap-2">
										<Input
											class="flex-1"
											placeholder="Note text…"
											bind:value={noteDraftText}
											autofocus
										/>
										<Button size="sm" disabled={noteSaving} onclick={saveNote}>Pin</Button>
										<Button variant="ghost" size="sm" onclick={() => (noteDraftSha = null)}>
											Cancel
										</Button>
									</div>
								{:else}
									<Button variant="outline" size="sm" onclick={() => startNote(c.sha)}>
										+ Add note
									</Button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
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

<style>
	/* Gradient bevel header bar — same visual language as the poll-head
	   gradient and the sidebar nav ribbon, so this page's title reads as
	   part of the same "material" as the rest of the site instead of a
	   plain text-2xl heading dropped on the page. */
	.devcycle-header {
		padding: 12px 16px;
		border-radius: var(--radius-md);
		background: var(--header-bg);
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
	}
	.devcycle-header h1 {
		margin: 0;
		font-size: 1.25rem;
	}
	.devcycle-header p {
		margin: 4px 0 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-family: var(--font-retro);
	}

	.commit-note-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		max-height: 420px;
		overflow-y: auto;
	}
	.commit-note-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		background: hsl(var(--muted) / 0.4);
	}
	.commit-note-meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 12px;
	}
	.commit-note-meta code {
		font-family: monospace;
		background: hsl(var(--muted));
		border-radius: 3px;
		padding: 0 4px;
	}
	.commit-note-msg {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.commit-note-existing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		background: hsl(var(--background));
		border-radius: 6px;
		padding: 4px 8px;
	}
</style>