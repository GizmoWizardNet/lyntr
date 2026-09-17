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
                Special use Forum post commands. 
                These are commanads which allow you to CC other people in your post, crosspost it through the official Bluesky channel, 
                as well as post it in the dedicated Discord channel!
			</p>

			<div class="flex flex-col gap-1">
				<code class="bang-badge w-fit">/bang dihcord</code>
				<p class="text-xs text-muted-foreground">
					cross post your forum post to the discord channel; #forum in the server, everyone can view.
				</p>
			</div>

			<div class="flex flex-col gap-1">
				<code class="bang-badge w-fit">/bang bsky</code>
				<p class="text-xs text-muted-foreground">
					Cross-posts your post to the official Lyntr Bluesky! Requires a <strong>verified</strong> badge
					and an account <strong>older than 10 hours</strong>. rate limited to once every 30 minutes.
                    Please keep posts civil.
				</p>
			</div>

			<div class="flex flex-col gap-1">
				<code class="bang-badge w-fit">/bang cc @user1, @user2</code>
				<p class="text-xs text-muted-foreground">
					Sends the complete post to tagged users as a Lyntr notification and email. <strong>Max five people</strong>. rate limited to once every 5 minutes.
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
