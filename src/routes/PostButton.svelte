<script lang="ts">
	import { buttonVariants } from '@/components/ui/button/index';
	import * as Dialog from '@/components/ui/dialog/index';
	import Avatar from './Avatar.svelte';
	import { toast } from 'svelte-sonner';
	import { cdnUrl } from './stores';
	import Composer from './Composer.svelte';
	import ClanLyntComposer from './ClanLyntComposer.svelte';
	import { Users, PenLine } from 'lucide-svelte';

	interface Props {
		userId: string;
		class?: $$Props['class'];
		children?: import('svelte').Snippet;
		// Called immediately with the newly-created lynt so the caller can
		// prepend it to the feed without waiting on a WebSocket round-trip —
		// this is what makes posting feel instant instead of "did it work?".
		onPosted?: (lynt: any) => void;
	}

	let { userId, class: className = undefined, children, onPosted }: Props = $props();

	let opened = $state(false);
	let composer: Composer = $state();
	// Every post starts with this choice — solo goes straight into the
	// existing single-author flow, clan swaps in the friend-relay composer.
	// Nothing publishes until either the solo post lands or the last clan
	// member accepts, so onPosted only ever fires for a genuinely live lynt.
	let mode: 'solo' | 'clan' = $state('solo');

	function handlePosted(item: any) {
		opened = false;
		toast.success('Your lynt has been published!');
		requestAnimationFrame(() => {
			onPosted?.(item);
		});
	}

	function handleClanStarted() {
		opened = false;
		toast.success("Clan lynt sent — it'll go live once everyone accepts.");
	}

	function reset() {
		composer?.resetComposer?.();
		mode = 'solo';
	}
</script>

<Dialog.Root bind:open={opened} onOpenChange={(o) => { if (!o) reset(); }}>
	<Dialog.Trigger
		class={`${buttonVariants({ variant: 'default' })} w-full ${className}`}
		on:click={() => (opened = true)}>{#if children}{@render children()}{:else}Post{/if}</Dialog.Trigger
	>
	<Dialog.Content class="sm:max-w-[500px]">
		<div class="mode-toggle">
			<button type="button" class="mode-btn" class:active={mode === 'solo'} onclick={() => (mode = 'solo')}>
				<PenLine class="h-3.5 w-3.5" /> Solo lynt
			</button>
			<button type="button" class="mode-btn" class:active={mode === 'clan'} onclick={() => (mode = 'clan')}>
				<Users class="h-3.5 w-3.5" /> Clan lynt
			</button>
		</div>

		<div class="flex items-start space-x-3">
			<Avatar size={10} src={cdnUrl(userId, 'small')} alt="Your profile picture." />

			<div class="flex h-full flex-grow flex-col gap-2">
				<div class="max-h-[600px] overflow-y-auto">
					{#if mode === 'solo'}
						<Composer
							bind:this={composer}
							submitUrl="/api/lynt"
							draftKey="compose:new"
							allowPoll={true}
							autofocus={true}
							onPosted={handlePosted}
							onCancel={() => { opened = false; }}
						/>
					{:else}
						<ClanLyntComposer myId={userId} onStarted={handleClanStarted} onCancel={() => { opened = false; }} />
					{/if}
				</div>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.mode-toggle {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}
	.mode-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 6px;
		font-family: var(--font-retro);
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--secondary));
	}
	.mode-btn.active {
		color: hsl(var(--primary-foreground));
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
	}
</style>
