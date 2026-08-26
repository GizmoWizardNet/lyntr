<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { X, Send, Smile } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import Avatar from '../Avatar.svelte';
	import UserName from '../UserName.svelte';
	import ParsedContent from '../ParsedContent.svelte';
	import GifPicker from '../GifPicker.svelte';
	import { cdnUrl, currentPage } from '../stores';
	import { wsClient } from '$lib/ws-client';

	interface Props {
		scrollableId: string;
		onClose: () => void;
	}

	let { scrollableId, onClose }: Props = $props();

	let comments = $state<any[]>([]);
	let loading = $state(true);
	let text = $state('');
	let pendingGif = $state<{ url: string; preview_url: string } | null>(null);
	let showGifPicker = $state(false);
	let posting = $state(false);

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/scrollables/${scrollableId}/comments`);
			if (res.ok) {
				const data = await res.json();
				comments = data.comments;
			} else {
				toast.error('Failed to load comments.');
			}
		} catch {
			toast.error('Failed to load comments. Check your connection and try again.');
		} finally {
			loading = false;
		}
	}

	load();

	let unsub: (() => void) | undefined;
	onMount(() => {
		unsub = wsClient.on('new_scrollable_comment', (data) => {
			if (data.scrollableId !== scrollableId) return;
			// Our own comment is already appended optimistically in post()
			// below the instant the POST resolves — don't double-insert it
			// when the broadcast for it lands a moment later.
			if (comments.some((c) => c.id === data.comment.id)) return;
			comments = [data.comment, ...comments];
		});
	});
	onDestroy(() => unsub?.());

	async function post() {
		if (posting || (!text.trim() && !pendingGif)) return;
		posting = true;
		try {
			const res = await fetch(`/api/scrollables/${scrollableId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: text.trim(),
					gifUrl: pendingGif?.url,
					gifPreviewUrl: pendingGif?.preview_url,
				}),
			});
			if (res.ok) {
				const data = await res.json();
				comments = [{ ...data.comment, username: 'You', handle: '', createdAt: new Date().toISOString() }, ...comments];
				text = '';
				pendingGif = null;
			} else {
				const err = await res.json().catch(() => ({}));
				toast.error(err.error ?? 'Could not post comment.');
			}
		} catch {
			// Previously an unguarded fetch here meant a network error left
			// `posting` stuck true forever — the send button disabled itself
			// and never recovered without a page reload.
			toast.error('Could not post comment. Check your connection and try again.');
		} finally {
			posting = false;
		}
	}

	function goToProfile(handle: string) {
		if (!handle) return;
		currentPage.set('profile' + handle);
		onClose();
	}
</script>

<div class="drawer">
	<div class="drawer-header">
		<h3>Comments</h3>
		<button onclick={onClose}><X class="h-5 w-5" /></button>
	</div>

	<div class="comment-list">
		{#if loading}
			<p class="empty">Loading...</p>
		{:else if comments.length === 0}
			<p class="empty">No comments yet — say something nice.</p>
		{:else}
			{#each comments as c (c.id)}
				<div class="comment-row">
					<button onclick={() => goToProfile(c.handle)}>
						<Avatar src={cdnUrl(c.userId, 'small')} alt="" showPresence={false} />
					</button>
					<div class="comment-body">
						<button class="comment-author" onclick={() => goToProfile(c.handle)}>
							<UserName name={c.username} color={c.nameColor} verified={c.verified} />
						</button>
						{#if c.content}
							<ParsedContent content={c.content} className="comment-text" interactive={false} showLinkPreview={false} />
						{/if}
						{#if c.gifUrl}
							<img class="comment-gif" src={c.gifPreviewUrl ?? c.gifUrl} alt="GIF" loading="lazy" />
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	{#if showGifPicker}
		<div class="gif-picker-wrap">
			<GifPicker onselect={(gif) => { pendingGif = { url: gif.url, preview_url: gif.preview_url }; showGifPicker = false; }} />
		</div>
	{/if}

	{#if pendingGif}
		<div class="pending-gif">
			<img src={pendingGif.preview_url} alt="Selected GIF" />
			<button onclick={() => (pendingGif = null)}><X class="h-4 w-4" /></button>
		</div>
	{/if}

	<div class="composer">
		<button class="gif-toggle" class:active={showGifPicker || pendingGif} onclick={() => (showGifPicker = !showGifPicker)}>
			<Smile class="h-5 w-5" />
		</button>
		<input
			type="text"
			placeholder="Add a comment... (markdown supported)"
			bind:value={text}
			onkeydown={(e) => e.key === 'Enter' && post()}
			maxlength={280}
		/>
		<button class="send-btn" onclick={post} disabled={posting || (!text.trim() && !pendingGif)}>
			<Send class="h-5 w-5" />
		</button>
	</div>
</div>

<style>
	.drawer {
		position: absolute;
		inset: 0;
		background: hsl(var(--card));
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
		z-index: 10;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.drawer-header h3 {
		margin: 0;
		font-family: var(--font-retro);
		font-size: 15px;
		font-weight: 700;
	}

	.drawer-header button {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
	}

	.comment-list {
		flex: 1;
		overflow-y: auto;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.empty {
		text-align: center;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--muted-foreground));
		padding: 24px 0;
	}

	.comment-row {
		display: flex;
		gap: 8px;
	}

	.comment-body {
		min-width: 0;
	}

	.comment-author {
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-retro);
		font-size: 12px;
		font-weight: 700;
	}

	:global(.comment-text) {
		font-family: var(--font-retro);
		font-size: 13px;
		margin: 2px 0 0;
	}

	.comment-gif {
		max-width: 160px;
		border-radius: 6px;
		margin-top: 4px;
	}

	.gif-picker-wrap {
		max-height: 240px;
		overflow-y: auto;
		border-top: 1px solid hsl(var(--border));
	}

	.pending-gif {
		position: relative;
		padding: 8px 12px 0;
	}

	.pending-gif img {
		max-height: 100px;
		border-radius: 6px;
	}

	.pending-gif button {
		position: absolute;
		top: 4px;
		left: 4px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		border-radius: 50%;
		border: none;
		width: 22px;
		height: 22px;
	}

	.composer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-top: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.gif-toggle {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.gif-toggle.active {
		color: hsl(var(--primary));
	}

	.composer input {
		flex: 1;
		min-width: 0;
		background: hsl(var(--input));
		border: none;
		border-radius: 20px;
		padding: 8px 14px;
		font-family: var(--font-retro);
		font-size: 13px;
		box-shadow: var(--inset-shadow);
	}

	.send-btn {
		background: none;
		border: none;
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.send-btn:disabled {
		opacity: 0.4;
	}
</style>
