<script lang="ts">
	import { Button } from '@/components/ui/button';
	import { Badge } from '@/components/ui/badge';
	import Avatar from '../Avatar.svelte';
	import ParsedContent from '../ParsedContent.svelte';
	import UserBadges from '../UserBadges.svelte';
	import UserName from '../UserName.svelte';
	import { cdnUrl } from '../stores';
	import { ArrowBigUp, ArrowBigDown, Pencil, Trash2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		post: any;
		myId: string;
		isAdmin: boolean;
		threadClosed: boolean;
		onVote: (postId: string, value: 1 | -1 | 0) => Promise<void>;
		onEdited: (postId: string, content: string) => void;
		onDeleted: (postId: string) => void;
	}

	let { post, myId, isAdmin, threadClosed, onVote, onEdited, onDeleted }: Props = $props();

	let editing = $state(false);
	let editContent = $state(post.content);
	let voting = $state(false);

	function timeAgo(iso: string) {
		const diff = (Date.now() - new Date(iso).getTime()) / 1000;
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	async function castVote(value: 1 | -1) {
		if (post.deleted || voting) return;
		voting = true;
		const next = post.viewerVote === value ? 0 : value;
		await onVote(post.id, next);
		voting = false;
	}

	async function saveEdit() {
		if (!editContent || editContent.trim().length === 0) {
			toast.error('Post cannot be empty.');
			return;
		}
		try {
			const response = await fetch(`/api/forum/posts/${post.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ content: editContent })
			});
			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				toast.error(err.error ?? 'Failed to edit post.');
				return;
			}
			onEdited(post.id, editContent);
			editing = false;
			toast.success('Post updated.');
		} catch {
			toast.error('Failed to edit post.');
		}
	}

	async function deletePost() {
		if (!confirm(isAdmin && post.userId !== myId ? 'Delete this post for moderation?' : 'Delete your post?')) return;
		try {
			const response = await fetch(`/api/forum/posts/${post.id}`, { method: 'DELETE' });
			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				toast.error(err.error ?? 'Failed to delete post.');
				return;
			}
			onDeleted(post.id);
			toast.success('Post deleted.');
		} catch {
			toast.error('Failed to delete post.');
		}
	}
</script>

<div class="flex w-full gap-3 rounded-lg border border-border p-3 {post.isOp ? 'bg-primary/5' : ''}">
	<!-- Vote rail -->
	<div class="flex flex-col items-center gap-0.5 pt-0.5">
		<button
			class="rounded p-1 hover:bg-accent disabled:opacity-40"
			disabled={post.deleted || voting}
			class:text-primary={post.viewerVote === 1}
			onclick={() => castVote(1)}
			aria-label="Upvote"
		>
			<ArrowBigUp size={22} fill={post.viewerVote === 1 ? 'currentColor' : 'none'} />
		</button>
		<span class="text-sm font-bold tabular-nums">{post.score ?? 0}</span>
		<button
			class="rounded p-1 hover:bg-accent disabled:opacity-40"
			disabled={post.deleted || voting}
			class:text-destructive={post.viewerVote === -1}
			onclick={() => castVote(-1)}
			aria-label="Downvote"
		>
			<ArrowBigDown size={22} fill={post.viewerVote === -1 ? 'currentColor' : 'none'} />
		</button>
	</div>

	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<Avatar size={6} src={cdnUrl(post.userId, 'small')} userId={post.userId} />
			<span class="font-semibold"><UserName name={post.username} color={post.nameColor} verified={post.verified} /></span>
			<span class="text-muted-foreground">@{post.handle}</span>
			{#if post.isOp}<Badge variant="secondary">OP</Badge>{/if}
			<UserBadges
				verified={post.verified}
				isAdmin={post.isAdmin}
				contributor={post.contributor}
				loginStreak={post.loginStreak}
				followerCount={post.followerCount}
				followsViewer={post.followsViewer}
				compact={true}
			/>
			<span class="text-muted-foreground">· {timeAgo(post.createdAt)}</span>
			{#if post.editedAt}<span class="text-xs text-muted-foreground">(edited)</span>{/if}
		</div>

		{#if editing}
			<MarkdownEditor bind:value={editContent} rows={4} />
			<div class="flex gap-2">
				<Button size="sm" on:click={saveEdit}>Save</Button>
				<Button size="sm" variant="ghost" on:click={() => { editing = false; editContent = post.content; }}>Cancel</Button>
			</div>
		{:else if post.deleted}
			<p class="whitespace-pre-wrap break-words text-sm italic text-muted-foreground">
				{post.content}
			</p>
		{:else}
			<ParsedContent content={post.content} authorHandle={post.handle} className="text-sm" />
		{/if}

		{#if !post.deleted && !editing}
			<div class="mt-1 flex gap-3 text-xs text-muted-foreground">
				{#if post.userId === myId && !threadClosed}
					<button class="flex items-center gap-1 hover:text-foreground" onclick={() => (editing = true)}>
						<Pencil size={13} /> Edit
					</button>
				{/if}
				{#if post.userId === myId || isAdmin}
					<button class="flex items-center gap-1 hover:text-destructive" onclick={deletePost}>
						<Trash2 size={13} /> Delete
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
