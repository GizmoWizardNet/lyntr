<script lang="ts">
	import { Button } from '@/components/ui/button/index';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { House, Search, Bell, User, Plus, MessageSquare, Trophy, Mail, Webhook, Award, MoreHorizontal, Clapperboard, Megaphone } from 'lucide-svelte';
	import OutlineButton from './OutlineButton.svelte';
	import { currentPage } from './stores';
	import { goto } from '$app/navigation';
	import { toggleMode, mode } from 'mode-watcher';
	import PostButton from './PostButton.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { unreadMessages, unseenAchievements } from "./stores";
	import { wsClient } from '$lib/ws-client';

	interface Props {
		id: string;
		handle: string;
		navItems?: any;
		onPosted?: (lynt: any) => void;
	}

	// mobilePrimary items get a slot in the cramped bottom tab bar; everything
	// else lives one tap away behind "More" so the bar doesn't turn into
	// nine shrunk-down icons nobody can reliably tap. Desktop is unaffected —
	// the full-height sidebar shows every item regardless of this flag.
	let { id, handle, onPosted, navItems = [
		{ icon: House, label: 'Home', page: 'home', anim: 'house', mobilePrimary: true },
		{ icon: Search, label: 'Search', page: 'search', anim: 'search', mobilePrimary: true },
		{ icon: Clapperboard, label: 'Scrollables', page: 'scrollables', anim: 'clapperboard', mobilePrimary: true },
		{ icon: Bell, label: 'Notifications', page: 'notifications', anim: 'bell', mobilePrimary: true },
		{ icon: User, label: 'Profile', page: 'profile' + handle, anim: 'user', mobilePrimary: true },
		{ icon: MessageSquare, label: 'Forum', page: 'forum', anim: 'message' },
		{ icon: Trophy, label: 'Leaderboard', page: 'leaderboard', anim: 'trophy' },
		{ icon: Award, label: 'Achievements', page: 'achievements', anim: 'award' },
		{ icon: Mail, label: 'Messages', page: 'messages', anim: 'mail' },
		{ icon: Webhook, label: 'Developer', page: 'developer', anim: 'webhook' },
		{ icon: Megaphone, label: 'Updates', page: 'updates', anim: 'megaphone' }
	] }: Props = $props();

	let moreOpen = $state(false);
	let unreadDMs = $state(0);
	let overflowItems = $derived(navItems.filter((i: any) => !i.mobilePrimary));

	function badgeFor(item: any) {
		return item.label === 'Notifications' && $unreadMessages > 0 ? $unreadMessages :
			item.label === 'Messages' && unreadDMs > 0 ? unreadDMs :
			item.label === 'Achievements' && $unseenAchievements > 0 ? $unseenAchievements :
			undefined;
	}

	// True if any item hidden behind "More" needs attention, so the trigger
	// itself can carry a dot even when the specific badge is out of sight.
	let overflowHasBadge = $derived(overflowItems.some((i: any) => badgeFor(i) !== undefined));

	function handleNavClick(page: string) {
		currentPage.set(page);
		if (page === 'home') goto('/');
		if (page === 'profile' + handle) goto(`/@${handle}`);
		if (page === 'developer') goto('/developer');
		if (page === 'updates') goto('/updates');
		if (page === 'notifications') $unreadMessages = 0;
		if (page === 'messages') unreadDMs = 0;
		// The actual DB-side "mark as seen" happens when AchievementsPage
		// mounts (PATCH /api/achievements/unseen) — this just optimistically
		// clears the badge immediately on click, same as the two lines above.
		if (page === 'achievements') $unseenAchievements = 0;
	}

	let unsubNotification: () => void;
	let unsubDmMessage: () => void;
	let unsubDmAccepted: () => void;
	let unsubAchievement: () => void;

	onMount(async () => {
		const [notifRes, dmRes, achievementsRes] = await Promise.all([
			fetch('/api/notifications/unread'),
			fetch('/api/dm/unread'),
			fetch('/api/achievements/unseen')
		]);
		if (notifRes.ok) $unreadMessages = (await notifRes.json()).count;
		if (dmRes.ok) unreadDMs = (await dmRes.json()).count;
		if (achievementsRes.ok) $unseenAchievements = (await achievementsRes.json()).count;

		unsubNotification = wsClient.on('notification', () => { $unreadMessages += 1; });
		unsubDmMessage = wsClient.on('dm_message', () => {
			if ($currentPage !== 'messages') unreadDMs += 1;
		});
		unsubDmAccepted = wsClient.on('dm_accepted', () => { $unreadMessages += 1; });
		unsubAchievement = wsClient.on('achievement_unlocked', () => {
			if ($currentPage !== 'achievements') $unseenAchievements += 1;
		});
	});

	onDestroy(() => {
		unsubNotification?.();
		unsubDmMessage?.();
		unsubDmAccepted?.();
		unsubAchievement?.();
	});
</script>

<div
	class="nav-ribbon inline-flex w-full flex-row items-center gap-1 p-[8px] md:min-w-[250px] md:flex-col md:items-start md:gap-2 md:p-[12px]"
>
	<button class="hidden w-full items-center justify-center md:flex" onclick={toggleMode}>
		<img
			class="size-8 cursor-pointer"
			src={mode.current === "dark" ? "logo_dark.svg" : "logo_light.svg"}
			alt="Logo"
		/>
	</button>

	<!-- Desktop: every item, full-height sidebar, unchanged -->
	{#each navItems as item}
		<OutlineButton
			icon={item.icon}
			iconAnim={item.anim}
			text={item.label}
			secondary={badgeFor(item)}
			secondaryClass={item.label === 'Achievements' ? 'bg-amber-500 text-black' : undefined}
			className="hidden border-none md:flex md:w-auto !rounded-full"
			on:click={() => handleNavClick(item.page)}
		/>
	{/each}

	<!-- Mobile: 5 primary tabs only, everything else behind "More" -->
	{#each navItems as item}
		{#if item.mobilePrimary}
			<OutlineButton
				icon={item.icon}
				iconAnim={item.anim}
				secondary={badgeFor(item)}
				secondaryClass={item.label === 'Achievements' ? 'bg-amber-500 text-black' : undefined}
				className="flex-1 border-none md:hidden !rounded-full"
				on:click={() => handleNavClick(item.page)}
			/>
		{/if}
	{/each}

	<div class="relative flex-1 md:hidden">
		<Popover.Root bind:open={moreOpen}>
			<Popover.Trigger asChild>
				{#snippet children({ builder })}
					<button
						{...builder}
						onclick={() => (moreOpen = !moreOpen)}
						class="shit inline-flex w-full items-center justify-center rounded-full font-bold text-primary"
					>
						<MoreHorizontal class="h-6 w-6" strokeWidth={2.5} />
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-56 p-2" align="end" sideOffset={12}>
				<div class="flex flex-col gap-1">
					{#each overflowItems as item}
						<button
							class="flex items-center gap-3 rounded-[4px] p-2 text-left text-sm font-medium hover:bg-accent"
							onclick={() => { moreOpen = false; handleNavClick(item.page); }}
						>
							<svelte:component this={item.icon} class="h-5 w-5" strokeWidth={2.5} />
							<span>{item.label}</span>
							{#if badgeFor(item) !== undefined}
								<span class="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/50 text-xs">{badgeFor(item)}</span>
							{/if}
						</button>
					{/each}
				</div>
			</Popover.Content>
		</Popover.Root>
		{#if overflowHasBadge}
			<span class="absolute -top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive"></span>
		{/if}
	</div>

	<!-- Compose — the one action that should never blend in -->
	<div class="aspect-square shrink-0 md:hidden">
		<PostButton userId={id} {onPosted} class="group flex !h-11 !w-11 items-center justify-center !rounded-full !p-0">
			<span class="inline-flex transition-transform duration-300 group-hover:rotate-90">
				<Plus class="h-5 w-5" strokeWidth={2.5} />
			</span>
		</PostButton>
	</div>
</div>