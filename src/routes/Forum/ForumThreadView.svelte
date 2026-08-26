<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '@/components/ui/button';
	import { Badge } from '@/components/ui/badge';
	import { Separator } from '@/components/ui/separator';
	import { ChevronLeft, Lock, Pin, Eye } from 'lucide-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import ForumPostCard from './ForumPostCard.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		threadId: string;
		myId: string;
		onBack: () => void;
	}

	let { threadId, myId, onBack }: Props = $props();

	let thread: any = $state(null);
	let posts: any[] = $state([]);
	let viewerIsAdmin = $state(false);
	let loading = $state(true);
	let reply = $state('');
	let posting = $state(false);

	async function load() {
		loading = true;
		const response = await fetch(`/api/forum/threads/${threadId}`);
		if (!response.ok) {
			toast.error('Failed to load thread.');
			loading = false;
			return;
		}
		const data = await response.json();
		thread = data.thread;
		posts = data.posts.map((p: any) => ({ ...p }));
		viewerIsAdmin = data.viewerIsAdmin;
		loading = false;
	}

	onMount(load);

	async function vote(postId: string, value: 1 | -1 | 0) {
		const response = await fetch(`/api/forum/posts/${postId}/vote`, {
			method: 'POST',
			body: JSON.stringify({ value })
		});
		if (!response.ok) {
			toast.error('Failed to vote.');
			return;
		}
		const res = await response.json();
		posts = posts.map((p) =>
			p.id === postId ? { ...p, score: res.score, upvotes: res.upvotes, downvotes: res.downvotes, viewerVote: res.viewerVote } : p
		);
	}

	function handleEdited(postId: string, content: string) {
		posts = posts.map((p) => (p.id === postId ? { ...p, content, editedAt: new Date().toISOString() } : p));
	}

	function handleDeleted(postId: string) {
		posts = posts.map((p) => (p.id === postId ? { ...p, deleted: true, content: '[deleted by moderator]' } : p));
	}

	async function postReply() {
		if (!reply.trim()) return;
		posting = true;
		try {
			const response = await fetch('/api/forum/posts', {
				method: 'POST',
				body: JSON.stringify({ threadId, content: reply })
			});
			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				if (response.status === 429) toast.warning('You are being ratelimited.');
				else toast.error(err.error ?? 'Failed to post reply.');
				return;
			}
			const newPost = await response.json();
			posts = [...posts, newPost];
			reply = '';
			toast.success('Reply posted!');
		} finally {
			posting = false;
		}
	}

	async function toggleClosed() {
		const response = await fetch(`/api/forum/threads/${threadId}`, {
			method: 'PATCH',
			body: JSON.stringify({ closed: !thread.closed })
		});
		if (!response.ok) return toast.error('Failed to update thread.');
		const res = await response.json();
		thread = { ...thread, closed: res.closed };
		toast.success(res.closed ? 'Thread closed.' : 'Thread reopened.');
	}

	async function togglePinned() {
		const response = await fetch(`/api/forum/threads/${threadId}`, {
			method: 'PATCH',
			body: JSON.stringify({ pinned: !thread.pinned })
		});
		if (!response.ok) return toast.error('Failed to update thread.');
		const res = await response.json();
		thread = { ...thread, pinned: res.pinned };
		toast.success(res.pinned ? 'Thread pinned.' : 'Thread unpinned.');
	}
</script>

<div class="flex h-full w-full flex-col gap-3 overflow-y-auto px-1 py-2">
	<button class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onclick={onBack}>
		<ChevronLeft size={16} /> Back to threads
	</button>

	{#if loading}
		<LoadingSpinner occupy_screen={false} />
	{:else if thread}
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div class="flex flex-wrap items-center gap-2">
				{#if thread.pinned}<Badge class="gap-1"><Pin size={12} /> Pinned</Badge>{/if}
				{#if thread.closed}<Badge variant="destructive" class="gap-1"><Lock size={12} /> Closed</Badge>{/if}
				<h2 class="text-xl font-bold">{thread.title}</h2>
			</div>
			<div class="flex items-center gap-1 text-xs text-muted-foreground">
				<Eye size={14} /> {thread.views?.toLocaleString?.() ?? thread.views}
			</div>
		</div>

		{#if viewerIsAdmin}
			<div class="flex gap-2">
				<Button size="sm" variant="outline" on:click={toggleClosed}>
					{thread.closed ? 'Reopen thread' : 'Close thread'}
				</Button>
				<Button size="sm" variant="outline" on:click={togglePinned}>
					{thread.pinned ? 'Unpin thread' : 'Pin thread'}
				</Button>
			</div>
		{/if}

		<Separator />

		<div class="flex flex-col gap-2">
			{#each posts as post (post.id)}
				<ForumPostCard {post} {myId} isAdmin={viewerIsAdmin} threadClosed={thread.closed} onVote={vote} onEdited={handleEdited} onDeleted={handleDeleted} />
			{/each}
		</div>

		<Separator />

		{#if thread.closed && !viewerIsAdmin}
			<p class="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">
				🔒 This thread is closed. No new replies can be posted.
			</p>
		{:else}
			<div class="flex flex-col gap-2">
				<MarkdownEditor bind:value={reply} rows={3} placeholder="Write a reply..." />
				<Button class="self-end" on:click={postReply} disabled={posting || !reply.trim()}>
					{posting ? 'Posting…' : 'Post reply'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
