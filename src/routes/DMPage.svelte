<script lang="ts">
	import { MessageCircle, Plus, Users, Pin, BellOff } from 'lucide-svelte';
	import Avatar from './Avatar.svelte';
	import DMConversation from './DMConversation.svelte';
	import UserName from './UserName.svelte';
	import { cdnUrl } from './stores';
	import { toast } from 'svelte-sonner';
	import { wsClient } from '$lib/ws-client';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		myId: string;
	}

	let { myId }: Props = $props();

	let conversations = $state<any[]>([]);
	let loading = $state(true);
	let openConvId = $state<string | null>(null);
	let newDmHandle = $state('');
	let showNewDm = $state(false);
	let starting = $state(false);

	// Group-composer mode: same panel, but collects multiple handles into a
	// chip list instead of firing on the first pick.
	let groupMode = $state(false);
	let groupHandles = $state<string[]>([]);
	let groupName = $state('');

	type UserSuggestion = { id: string; handle: string; username: string; verified: boolean; nameColor?: string | null };
	let suggestions = $state<UserSuggestion[]>([]);
	let showSuggestions = $state(false);
	let suggestionsLoading = $state(false);
	let activeIndex = $state(0);
	let searchDebounce: ReturnType<typeof setTimeout>;
	let searchAbort: AbortController | null = null;

	async function fetchSuggestions(q: string) {
		searchAbort?.abort();
		if (!q) {
			suggestions = [];
			showSuggestions = false;
			return;
		}
		searchAbort = new AbortController();
		suggestionsLoading = true;
		try {
			const res = await fetch(`/api/mentions/search?q=${encodeURIComponent(q)}`, {
				signal: searchAbort.signal
			});
			suggestions = res.ok ? await res.json() : [];
			activeIndex = 0;
			showSuggestions = true;
		} catch {
			// aborted or network error — leave suggestions as-is
		} finally {
			suggestionsLoading = false;
		}
	}

	function onHandleInput() {
		clearTimeout(searchDebounce);
		const q = newDmHandle.replace(/^@/, '').trim();
		searchDebounce = setTimeout(() => fetchSuggestions(q), 150);
	}

	function pickSuggestion(s: UserSuggestion) {
		showSuggestions = false;
		suggestions = [];
		if (groupMode) {
			if (!groupHandles.includes(s.handle)) groupHandles = [...groupHandles, s.handle];
			newDmHandle = '';
		} else {
			newDmHandle = s.handle;
			startDm();
		}
	}

	function removeGroupHandle(h: string) {
		groupHandles = groupHandles.filter(x => x !== h);
	}

	function onHandleKeydown(e: KeyboardEvent) {
		if (showSuggestions && suggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				activeIndex = (activeIndex + 1) % suggestions.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				pickSuggestion(suggestions[activeIndex]);
				return;
			}
			if (e.key === 'Escape') {
				showSuggestions = false;
				return;
			}
		}
		if (e.key === 'Enter' && !groupMode) startDm();
	}

	async function loadConversations() {
		loading = true;
		try {
			const res = await fetch('/api/dm/conversations');
			conversations = await res.json();
		} finally {
			loading = false;
		}
	}

	async function startDm() {
		if (!newDmHandle.trim() || starting) return;
		starting = true;
		try {
			const res = await fetch('/api/dm/conversations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ target_handle: newDmHandle.trim() })
			});
			if (!res.ok) {
				const e = await res.json();
				toast.error(e.error ?? 'Failed');
				return;
			}
			const { conversation_id } = await res.json();
			openConvId = conversation_id;
			resetComposer();
			await loadConversations();
		} finally {
			starting = false;
		}
	}

	async function startGroup() {
		if (groupHandles.length < 2 || starting) {
			if (groupHandles.length < 2) toast.error('Add at least 2 people to a group');
			return;
		}
		starting = true;
		try {
			const res = await fetch('/api/dm/conversations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ group: true, name: groupName.trim() || undefined, member_handles: groupHandles })
			});
			if (!res.ok) {
				const e = await res.json();
				toast.error(e.error ?? 'Failed to create group');
				return;
			}
			const { conversation_id } = await res.json();
			openConvId = conversation_id;
			resetComposer();
			await loadConversations();
		} finally {
			starting = false;
		}
	}

	function resetComposer() {
		showNewDm = false;
		groupMode = false;
		newDmHandle = '';
		groupHandles = [];
		groupName = '';
		suggestions = [];
		showSuggestions = false;
	}

	// Debounced refetch so a burst of incoming events (e.g. someone sending
	// several messages in a row) doesn't hammer the endpoint.
	let refetchTimer: ReturnType<typeof setTimeout>;
	function refetchConversationsSoon() {
		clearTimeout(refetchTimer);
		refetchTimer = setTimeout(loadConversations, 250);
	}

	let unsubs: (() => void)[] = [];

	onMount(() => {
		loadConversations();

		// Keep the list itself live: new message previews, ordering, unread
		// dots, and group membership changes all need to update without a
		// manual refresh.
		for (const evt of [
			'dm_message', 'dm_message_deleted', 'dm_accepted',
			'dm_group_added', 'dm_members_updated', 'dm_member_left',
			'dm_member_removed', 'dm_group_renamed'
		]) {
			unsubs.push(wsClient.on(evt, refetchConversationsSoon));
		}
	});

	onDestroy(() => {
		clearTimeout(refetchTimer);
		unsubs.forEach(u => u());
	});

	function formatTime(iso: string) {
		const d = new Date(iso);
		const now = new Date();
		if (d.toDateString() === now.toDateString()) {
			return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		}
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function convDisplayName(conv: any) {
		if (conv.is_group) return conv.name || (conv.members ?? []).map((m: any) => m.username).join(', ') || 'Group';
		return conv.other_user?.username ?? 'Unknown';
	}
</script>

<div class="dm-page">
	{#if openConvId}
		<DMConversation
			conversationId={openConvId}
			{myId}
			onback={() => { openConvId = null; loadConversations(); }}
		/>
	{:else}
		<div class="list-header">
			<span class="list-title">Messages</span>
			<button class="new-btn" onclick={() => {
				if (showNewDm) { resetComposer(); } else { showNewDm = true; }
			}}>
				<Plus size={16} />
			</button>
		</div>

		{#if showNewDm}
			<div class="new-dm-wrap">
				<div class="new-dm-mode-toggle">
					<button class:active={!groupMode} onclick={() => { groupMode = false; groupHandles = []; }}>Direct message</button>
					<button class:active={groupMode} onclick={() => { groupMode = true; }}>
						<Users size={13} /> Group
					</button>
				</div>

				{#if groupMode && groupHandles.length > 0}
					<div class="group-chips">
						{#each groupHandles as h (h)}
							<span class="chip">@{h} <button onclick={() => removeGroupHandle(h)}>✕</button></span>
						{/each}
					</div>
				{/if}

				{#if groupMode}
					<input class="group-name-input" type="text" placeholder="Group name (optional)" bind:value={groupName} />
				{/if}

				<div class="new-dm-row">
					<input
						class="new-dm-input"
						type="text"
						placeholder="@handle"
						bind:value={newDmHandle}
						oninput={onHandleInput}
						onkeydown={onHandleKeydown}
						onfocus={() => { if (suggestions.length > 0) showSuggestions = true; }}
					/>
					{#if groupMode}
						<button class="send-dm-btn" onclick={startGroup} disabled={starting || groupHandles.length < 2}>
							{starting ? '…' : 'Create'}
						</button>
					{:else}
						<button class="send-dm-btn" onclick={startDm} disabled={starting}>
							{starting ? '…' : 'Open'}
						</button>
					{/if}
				</div>

				{#if showSuggestions}
					<div class="user-suggestions">
						{#if suggestionsLoading && suggestions.length === 0}
							<div class="suggestion-empty">Searching…</div>
						{:else if suggestions.length === 0}
							<div class="suggestion-empty">No matching users</div>
						{:else}
							{#each suggestions as s, i (s.id)}
								<button
									type="button"
									class="suggestion-item"
									class:active={i === activeIndex}
									onmousedown={(e) => { e.preventDefault(); pickSuggestion(s); }}
									onmouseenter={() => (activeIndex = i)}
								>
									<Avatar size={7} src={cdnUrl(s.id, 'small')} alt={s.username} userId={s.id} />
									<span class="suggestion-name"><UserName name={s.username} color={s.nameColor} verified={s.verified} /></span>
									<span class="suggestion-handle">@{s.handle}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if loading}
			<div class="empty">Loading…</div>
		{:else if conversations.length === 0}
			<div class="empty">
				<MessageCircle size={32} opacity={0.3} />
				<p>No messages yet</p>
				<p class="sub">Start a conversation with someone using the + button</p>
			</div>
		{:else}
			<div class="list">
				{#each conversations as conv (conv.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="conv-row" onclick={() => { openConvId = conv.id; }}>
						<div class="conv-avatar">
							{#if conv.is_group}
								<div class="group-avatar-stack">
									{#each (conv.members ?? []).slice(0, 3) as m, i (m.user_id)}
										<div class="stack-item" style="z-index: {3 - i}">
											<Avatar size={conv.members.length > 1 ? 7 : 10} src={cdnUrl(m.user_id, 'small')} alt={m.username} userId={m.user_id} />
										</div>
									{/each}
								</div>
							{:else}
								<Avatar size={10} src={cdnUrl(conv.other_user?.user_id, 'small')} alt={conv.other_user?.username ?? ''} userId={conv.other_user?.user_id} />
							{/if}
							{#if conv.unread > 0}
								<span class="unread-dot">{conv.unread > 99 ? '99+' : conv.unread}</span>
							{/if}
						</div>
						<div class="conv-info">
							<div class="conv-top">
								<span class="conv-name-row">
									{#if conv.pinned}<Pin size={11} class="pin-icon" />{/if}
									<span class="conv-name" style={!conv.is_group && conv.other_user?.name_color ? `color: ${conv.other_user.name_color}` : ''}>
										{convDisplayName(conv)}
									</span>
									{#if conv.muted}<BellOff size={11} class="mute-icon" />{/if}
								</span>
								<span class="conv-time">{formatTime(conv.last_message_at)}</span>
							</div>
							<div class="conv-preview">
								{#if conv.status === 'pending'}
									{#if conv.owner_id === myId}
										<span class="pending-label">Request sent</span>
									{:else}
										<span class="pending-label request">Message request</span>
									{/if}
								{:else}
									<span class:unread-preview={conv.unread > 0}>{conv.last_message_preview || 'No messages'}</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.dm-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 10px;
		flex-shrink: 0;
	}

	.list-title { font-weight: 700; font-size: 18px; }

	.new-btn {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: 50%;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.new-dm-wrap {
		position: relative;
		flex-shrink: 0;
		padding: 0 16px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.new-dm-mode-toggle {
		display: flex;
		gap: 4px;
		background: hsl(var(--muted));
		border-radius: 9999px;
		padding: 3px;
		width: fit-content;
	}
	.new-dm-mode-toggle button {
		display: flex;
		align-items: center;
		gap: 4px;
		border: none;
		background: transparent;
		border-radius: 9999px;
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
	}
	.new-dm-mode-toggle button.active {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.group-chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip {
		display: flex;
		align-items: center;
		gap: 4px;
		background: hsl(var(--accent));
		border-radius: 9999px;
		padding: 3px 4px 3px 10px;
		font-size: 12px;
	}
	.chip button {
		background: transparent;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		font-size: 11px;
		padding: 2px 4px;
	}

	.group-name-input {
		background: hsl(var(--muted));
		border: 1.5px solid hsl(var(--border));
		border-radius: 9999px;
		padding: 6px 14px;
		font-size: 13px;
		color: hsl(var(--foreground));
		outline: none;
	}

	.new-dm-row { display: flex; gap: 8px; }

	.new-dm-input {
		flex: 1;
		background: hsl(var(--muted));
		border: 1.5px solid hsl(var(--border));
		border-radius: 9999px;
		padding: 6px 14px;
		font-size: 13px;
		color: hsl(var(--foreground));
		outline: none;
	}
	.new-dm-input:focus { border-color: hsl(var(--primary)); }

	.user-suggestions {
		position: absolute;
		top: 100%;
		left: 16px;
		right: 16px;
		z-index: 30;
		max-height: 260px;
		overflow-y: auto;
		background: hsl(var(--popover, var(--background)));
		border: 1.5px solid hsl(var(--border));
		border-radius: 10px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
		padding: 4px;
		margin-top: -6px;
	}

	.suggestion-empty {
		padding: 8px;
		font-size: 12px;
		font-style: italic;
		color: hsl(var(--muted-foreground));
	}

	.suggestion-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		border-radius: 7px;
		background: transparent;
		border: none;
		cursor: pointer;
	}
	.suggestion-item.active,
	.suggestion-item:hover {
		background: hsl(var(--accent));
	}
	.suggestion-name { font-size: 13px; font-weight: 600; }
	.suggestion-handle {
		margin-left: auto;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.send-dm-btn {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: 9999px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.send-dm-btn:disabled { opacity: 0.6; }

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: hsl(var(--muted-foreground));
		margin: auto;
		text-align: center;
		padding: 32px;
	}
	.empty p { margin: 0; font-size: 14px; font-weight: 600; }
	.empty .sub { font-size: 12px; font-weight: 400; max-width: 220px; }

	.list { overflow-y: auto; flex: 1; }

	.conv-row {
		display: flex;
		gap: 12px;
		padding: 10px 16px;
		cursor: pointer;
		border-bottom: 1px solid hsl(var(--border));
		transition: background 0.1s;
	}
	.conv-row:hover { background: hsl(var(--accent)); }

	.conv-avatar { position: relative; flex-shrink: 0; }

	.group-avatar-stack {
		display: flex;
		width: 40px;
		height: 40px;
		position: relative;
	}
	.stack-item {
		position: absolute;
	}
	.stack-item:nth-child(1) { top: 0; left: 0; }
	.stack-item:nth-child(2) { bottom: 0; right: 0; }
	.stack-item:nth-child(3) { top: 8px; left: 12px; }

	.unread-dot {
		position: absolute;
		top: -2px;
		right: -4px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: 9999px;
		font-size: 10px;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 3px;
	}

	.conv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

	.conv-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
	.conv-name-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
	.conv-name { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.conv-time { font-size: 11px; color: hsl(var(--muted-foreground)); white-space: nowrap; flex-shrink: 0; }
	:global(.pin-icon), :global(.mute-icon) { color: hsl(var(--muted-foreground)); flex-shrink: 0; }

	.conv-preview { font-size: 12px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.unread-preview { font-weight: 600; color: hsl(var(--foreground)); }

	.pending-label { font-size: 12px; color: hsl(var(--muted-foreground)); font-style: italic; }
	.pending-label.request { color: hsl(var(--primary)); font-weight: 600; font-style: normal; }
</style>
