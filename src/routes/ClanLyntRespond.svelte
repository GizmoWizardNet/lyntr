<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Check, X } from 'lucide-svelte';
	import * as Dialog from '@/components/ui/dialog/index';
	import Avatar from './Avatar.svelte';
	import UserName from './UserName.svelte';
	import ParsedContent from './ParsedContent.svelte';
	import { cdnUrl } from './stores';
	const CHAR_LIMIT = 280;

	interface Member {
		userId: string;
		position: number;
		status: string;
		username: string;
		handle: string;
	}

	interface Props {
		clanId: string;
		open: boolean;
		onClose?: () => void;
		onResolved?: (result: any) => void;
	}

	let { clanId, open = $bindable(), onClose, onResolved }: Props = $props();

	let loading = $state(true);
	let content = $state('');
	let gifUrl = $state<string | null>(null);
	let members = $state<Member[]>([]);
	let myTurn = $state(false);
	let myPosition = $state(0);
	let status = $state('pending');
	let sending = $state(false);
	let confirmingDecline = $state(false);

	const isOverLimit = $derived(content.length > CHAR_LIMIT);
	const currentMember = $derived(members.find((m) => m.status === 'pending'));

	async function load() {
		loading = true;
		confirmingDecline = false;
		try {
			const res = await fetch(`/api/clan-lynt/${clanId}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				toast.error(data.error ?? 'Could not load this clan lynt.');
				open = false;
				return;
			}
			const data = await res.json();
			content = data.content;
			gifUrl = data.gifUrl ?? null;
			members = data.members;
			myTurn = data.myTurn;
			myPosition = data.myPosition;
			status = data.status;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) load();
	});

	async function respond(action: 'accept' | 'decline') {
		if (action === 'accept' && isOverLimit) {
			toast.error(`Keep it under ${CHAR_LIMIT} characters.`);
			return;
		}
		if (action === 'decline' && !confirmingDecline) {
			confirmingDecline = true;
			return;
		}

		sending = true;
		try {
			const res = await fetch(`/api/clan-lynt/${clanId}/respond`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(action === 'accept' ? { action, content } : { action })
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error ?? 'Something went wrong.');
				return;
			}
			if (data.status === 'declined') toast('Clan lynt declined — it has been deleted.');
			else if (data.status === 'published') toast.success("It's live!");
			else toast.success('Passed on to the next person.');

			open = false;
			onResolved?.(data);
		} finally {
			sending = false;
			confirmingDecline = false;
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (!o) onClose?.(); }}>
	<Dialog.Content class="sm:max-w-[480px]">
		<Dialog.Header>
			<Dialog.Title>Clan lynt</Dialog.Title>
		</Dialog.Header>

		{#if loading}
			<p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
		{:else if status !== 'pending'}
			<p class="py-6 text-center text-sm text-muted-foreground">
				This clan lynt is no longer pending.
			</p>
		{:else}
			<div class="stepper">
				{#each members as m, i (m.userId)}
					<div class="step" class:done={m.status === 'accepted'} class:declined={m.status === 'declined'} class:current={m.status === 'pending' && m === currentMember}>
						<div class="step-node-col">
							<div class="step-node">
								{#if m.status === 'accepted'}
									<Check class="h-3 w-3" />
								{:else if m.status === 'declined'}
									<X class="h-3 w-3" />
								{:else}
									{i + 1}
								{/if}
							</div>
							{#if i < members.length - 1}
								<div class="step-line" class:filled={m.status === 'accepted'}></div>
							{/if}
						</div>
						<div class="step-body">
							<Avatar size={7} src={cdnUrl(m.userId, 'small')} alt={m.username} userId={m.userId} showPresence={false} />
							<div class="step-name">
								<UserName name={m.username} color={null} verified={false} />
								{#if m.status === 'pending' && m === currentMember}
									<span class="step-tag">their turn</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if gifUrl}
				<img class="draft-gif" src={gifUrl} alt="GIF" />
			{/if}

			{#if myTurn}
				<textarea class="respond-textarea" bind:value={content} maxlength={CHAR_LIMIT + 40}></textarea>
				<p class="hint" class:over={isOverLimit}>
					{content.length}/{CHAR_LIMIT} — edit the text if you want, then accept to pass it on.
				</p>
				<div class="respond-actions">
					{#if confirmingDecline}
						<button class="cancel-decline-btn" disabled={sending} onclick={() => (confirmingDecline = false)}>
							Never mind
						</button>
						<button class="decline-btn confirm" disabled={sending} onclick={() => respond('decline')}>
							Really decline &amp; delete for everyone
						</button>
					{:else}
						<button class="decline-btn" disabled={sending} onclick={() => respond('decline')}>Decline</button>
						<button class="accept-btn" disabled={sending || isOverLimit} onclick={() => respond('accept')}>
							Accept &amp; pass on
						</button>
					{/if}
				</div>
			{:else}
				<div class="draft-preview">
					<ParsedContent content={content} className="draft-preview-body" showLinkPreview={false} interactive={false} />
				</div>
				<p class="hint">Waiting on {currentMember?.username ?? 'someone'}'s turn.</p>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	.stepper {
		display: flex;
		flex-direction: column;
		margin-bottom: 10px;
	}

	.step {
		display: flex;
		gap: 10px;
	}

	.step-node-col {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.step-node {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		border-radius: 50%;
		background: hsl(var(--secondary));
		color: hsl(var(--muted-foreground));
		font-size: 10px;
		font-weight: 700;
	}
	.step.done .step-node {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}
	.step.declined .step-node {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground, white));
	}
	.step.current .step-node {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		animation: pulse-ring 1.6s ease-out infinite;
	}

	@keyframes pulse-ring {
		0% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.5); }
		70% { box-shadow: 0 0 0 6px hsl(var(--primary) / 0); }
		100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
	}

	.step-line {
		width: 2px;
		flex: 1;
		min-height: 16px;
		background: hsl(var(--secondary));
	}
	.step-line.filled {
		background: hsl(var(--primary));
	}

	.step-body {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 12px;
		font-size: 13px;
	}
	.step.done .step-body,
	.step.declined .step-body {
		opacity: 0.6;
	}

	.step-name {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.step-tag {
		padding: 1px 6px;
		border-radius: 999px;
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.draft-gif {
		max-width: 100%;
		max-height: 160px;
		border-radius: 6px;
		margin-bottom: 8px;
	}

	.respond-textarea {
		width: 100%;
		min-height: 90px;
		padding: 10px;
		border-radius: 6px;
		background: hsl(var(--secondary));
		font-family: var(--font-retro);
		font-size: 14px;
	}

	.draft-preview {
		padding: 10px;
		border-radius: 6px;
		background: hsl(var(--secondary) / 0.5);
		font-size: 14px;
	}

	.hint {
		margin-top: 8px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.hint.over {
		color: hsl(var(--destructive));
	}

	.respond-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 10px;
	}
	.decline-btn {
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 700;
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.12);
	}
	.decline-btn.confirm {
		color: white;
		background: hsl(var(--destructive));
	}
	.cancel-decline-btn {
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--secondary));
	}
	.accept-btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 700;
		color: hsl(var(--primary-foreground));
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
	}
	.decline-btn:disabled, .accept-btn:disabled, .cancel-decline-btn:disabled {
		opacity: 0.6;
	}
</style>