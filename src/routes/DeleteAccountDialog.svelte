<script lang="ts">
	import * as Dialog from '@/components/ui/dialog';
	import { Button } from '@/components/ui/button';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import Turnstile from './Turnstile.svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		open: boolean;
		username: string;
		onDeleted: () => void;
	}

	let { open = $bindable(false), username, onDeleted }: Props = $props();

	let typedUsername = $state('');
	let turnstileToken = $state('');
	let deleting = $state(false);

	// Reset the form every time the dialog is (re)opened, so a cancelled
	// attempt doesn't leave a stale token/typed value armed for next time.
	$effect(() => {
		if (open) {
			typedUsername = '';
			turnstileToken = '';
			deleting = false;
		}
	});

	let usernameMatches = $derived(typedUsername.trim().length > 0 && typedUsername === username);
	let canSubmit = $derived(usernameMatches && !!turnstileToken && !deleting);

	async function confirmDelete() {
		if (!canSubmit) return;

		deleting = true;
		try {
			const response = await fetch('/api/profile', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					turnstileToken,
					confirmUsername: typedUsername
				})
			});

			if (response.ok) {
				open = false;
				onDeleted();
			} else {
				const err = await response.json().catch(() => ({}));
				toast.error(err.error ?? 'Failed to delete account');
				turnstileToken = '';
			}
		} catch (error) {
			toast.error('Error deleting account.');
		} finally {
			deleting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-red-500">Delete account</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-4 py-2">
			<p class="text-sm text-muted-foreground">
				This permanently deletes your account, lynts, DMs, and everything else attached to it.
				<span class="font-bold text-red-500">This cannot be undone.</span>
			</p>

			<div class="flex flex-col gap-1">
				<Label for="confirm-username">
					Type <span class="font-bold">{username}</span> to confirm
				</Label>
				<Input
					id="confirm-username"
					bind:value={typedUsername}
					placeholder={username}
					autocomplete="off"
					spellcheck="false"
				/>
			</div>

			<Turnstile bind:token={turnstileToken} />
		</div>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => (open = false)} disabled={deleting}>Cancel</Button>
			<Button
				variant="destructive"
				onclick={confirmDelete}
				disabled={!canSubmit}
			>
				{deleting ? 'Deleting…' : 'Delete my account'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>