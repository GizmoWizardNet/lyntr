<script lang="ts">
	import * as Dialog from '@/components/ui/dialog';
	import { Button } from '@/components/ui/button';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import { toast } from 'svelte-sonner';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		open: boolean;
		categoryId: string;
		categoryName: string;
		onCreated: (thread: any) => void;
	}

	let { open = $bindable(false), categoryId, categoryName, onCreated }: Props = $props();

	let title = $state('');
	let content = $state('');
	let submitting = $state(false);

	async function submit() {
		if (title.trim().length < 3) return toast.error('Title must be at least 3 characters.');
		if (!content.trim()) return toast.error('Post content cannot be empty.');

		submitting = true;
		try {
			const response = await fetch('/api/forum/threads', {
				method: 'POST',
				body: JSON.stringify({ categoryId, title, content })
			});
			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				if (response.status === 429) toast.warning('You are being ratelimited.');
				else toast.error(err.error ?? 'Failed to create thread.');
				return;
			}
			const thread = await response.json();
			toast.success('Thread created!');
			reportBangResults(thread.bang);
			title = '';
			content = '';
			open = false;
			onCreated(thread);
		} finally {
			submitting = false;
		}
	}

	function reportBangResults(bang: any) {
		if (!bang) return;
		if (bang.discord) {
			if (bang.discord.posted) toast.success('Also posted to the Lyntr Discord.');
			else toast.warning(`/bang dihcord failed: ${bang.discord.error ?? 'unknown error'}`);
		}
		if (bang.bsky) {
			if (bang.bsky.posted) toast.success('Also posted to Bluesky.');
			else toast.warning(`/bang bsky: ${bang.bsky.reason ?? 'could not post'}`);
		}
		if (bang.cc) {
			if (bang.cc.reason) toast.warning(`/bang cc: ${bang.cc.reason}`);
			else if (bang.cc.sent.length || bang.cc.skipped.length)
				toast.success(
					`/bang cc: emailed ${bang.cc.sent.length}${bang.cc.skipped.length ? `, notified ${bang.cc.skipped.length} without email` : ''}.`
				);
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>New thread in {categoryName}</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-3 py-2">
			<div class="flex flex-col gap-1">
				<Label for="thread-title">Title</Label>
				<Input id="thread-title" bind:value={title} maxlength={200} placeholder="What's this about?" />
			</div>
			<div class="flex flex-col gap-1">
				<Label for="thread-content">Post</Label>
				<MarkdownEditor id="thread-content" bind:value={content} rows={6} placeholder="Write your post..." />
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="ghost" on:click={() => (open = false)}>Cancel</Button>
			<Button on:click={submit} disabled={submitting}>{submitting ? 'Posting…' : 'Create thread'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>