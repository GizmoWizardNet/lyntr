<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
	import { ChevronDown } from 'lucide-svelte';

	let open = $state(false);
</script>

<Card>
	<button
		type="button"
		class="flex w-full items-center justify-between gap-2 px-6 py-4 text-left"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<CardTitle class="text-base">
			<code class="bang-badge">/bang</code> commands
		</CardTitle>
		<ChevronDown size={16} class="shrink-0 text-muted-foreground transition-transform {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<CardContent class="flex flex-col gap-3 pt-0 text-sm">
			<p class="text-xs text-muted-foreground">
				Drop one of these on its own line in a forum post or reply. They only work inside the
				forum — anywhere else on Lyntr they're just highlighted text.
			</p>

			<div class="flex flex-col gap-1">
				<code class="bang-badge w-fit">/bang dihcord</code>
				<p class="text-xs text-muted-foreground">
					Cross-posts your post to the view-only Lyntr Discord forum channel. Yes, it's spelled
					"dihcord" on purpose — that's the actual command.
				</p>
			</div>

			<div class="flex flex-col gap-1">
				<code class="bang-badge w-fit">/bang bsky</code>
				<p class="text-xs text-muted-foreground">
					Cross-posts to Bluesky through the Lyntr account. Requires a <strong>verified</strong> badge
					and an account <strong>older than 10 hours</strong>. Limited to once every 30 minutes.
				</p>
			</div>

			<div class="flex flex-col gap-1">
				<code class="bang-badge w-fit">/bang cc @user1, @user2</code>
				<p class="text-xs text-muted-foreground">
					Sends the complete post to up to <strong>5</strong> tagged users as a Lyntr notification —
					plus an email, for anyone tagged who has email notifications turned on. Fails to post at
					all if you tag more than 5. Limited to once every 5 minutes.
				</p>
			</div>
		</CardContent>
	{/if}
</Card>

<style>
	.bang-badge {
		display: inline-block;
		padding: 1px 6px;
		font-family: 'Fira Code', ui-monospace, SFMono-Regular, monospace;
		font-weight: 700;
		font-size: 0.85em;
		color: #fff6ec;
		background: #e8791a;
		border-radius: 4px;
	}
</style>