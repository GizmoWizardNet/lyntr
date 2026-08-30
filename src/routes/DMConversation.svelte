<script lang="ts">
	import { ArrowLeft, Send, Paperclip, X, MoreVertical, Users, SmilePlus, Reply, Pencil, Pin, BellOff, Bell, UserPlus, LogOut, Ban } from 'lucide-svelte';
	import Avatar from './Avatar.svelte';
	import ParsedContent from './ParsedContent.svelte';
	import GifPicker from './GifPicker.svelte';
	import UserName from './UserName.svelte';
	import EmojiIcon from './EmojiIcon.svelte';
	import { cdnUrl } from './stores';
	import { toast } from 'svelte-sonner';
	import { wsClient } from '$lib/ws-client';
	import { onMount, onDestroy, tick } from 'svelte';

	interface Props {
		conversationId: string;
		myId: string;
		onback: () => void;
	}

	let { conversationId, myId, onback }: Props = $props();

	const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥', '👎', '😡', '🎉', '👀'];

	let conv = $state<any>(null);
	let messages = $state<any[]>([]);
	let loading = $state(true);
	let sending = $state(false);
	let content = $state('');
	let pendingGif = $state<{ url: string; preview_url: string } | null>(null);
	let pendingFile = $state<File | null>(null);
	let showGifPicker = $state(false);
	let fileInput: HTMLInputElement;
	let messagesEl: HTMLElement;
	let typingUserIds = $state<Set<string>>(new Set());
	let typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	let isTyping = false;

	let replyTo = $state<any>(null);
	let editingId = $state<string | null>(null);
	let editContent = $state('');
	let openReactionPickerFor = $state<string | null>(null);
	let showHeaderMenu = $state(false);
	let showMemberPanel = $state(false);
	let showAddMember = $state(false);
	let addMemberHandle = $state('');

	const otherUser = $derived(conv?.other_user ?? null);
	const members = $derived(conv?.members ?? []);
	const isGroup = $derived(!!conv?.is_group);
	const myMembership = $derived((members as any[]).find((m: any) => m.user_id === myId) ?? null);
	const iAmOwner = $derived(conv?.owner_id === myId);

	// Discord/iMessage-style "Seen" line: for each other member, find the
	// most recent message in the loaded window matching their
	// last_read_message_id and group members by that message id, so a
	// message can show "Seen by Alice, Bob" instead of one line per member.
	// Only ever renders under the single most-recent read message per
	// member — not every message before it — same as every chat app does
	// this, since showing it retroactively on every earlier message would
	// just be noise.
	const seenByMessageId = $derived.by(() => {
		const map = new Map<string, any[]>();
		for (const m of members as any[]) {
			if (m.user_id === myId || !m.last_read_message_id) continue;
			if (!map.has(m.last_read_message_id)) map.set(m.last_read_message_id, []);
			map.get(m.last_read_message_id)!.push(m);
		}
		return map;
	});

	function displayName() {
		if (isGroup) return conv?.name || members.map((m: any) => m.username).join(', ') || 'Group';
		return otherUser?.username ?? '';
	}

	function otherMemberIds(): string[] {
		if (isGroup) return members.map((m: any) => m.user_id).filter((id: string) => id !== myId);
		return otherUser ? [otherUser.user_id ?? otherUser.id] : [];
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/dm/messages?conversation_id=${conversationId}`);
			const data = await res.json();
			conv = data.conversation;
			messages = data.messages ?? [];
			await tick();
			scrollToBottom();
			if (messages.length > 0) markRead(messages.at(-1).id);
		} finally {
			loading = false;
		}
	}

	function scrollToBottom() {
		messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
	}

	async function markRead(messageId: string) {
		await fetch('/api/dm/read', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, message_id: messageId })
		});
	}

	let unsubs: (() => void)[] = [];

	onMount(async () => {
		await load();

		unsubs.push(wsClient.on('dm_message', (data: any) => {
			if (data.conversation_id !== conversationId) return;
			messages = [...messages, data.message];
			tick().then(() => { scrollToBottom(); markRead(data.message.id); });
		}));

		unsubs.push(wsClient.on('dm_message_deleted', (data: any) => {
			if (data.conversation_id !== conversationId) return;
			messages = messages.map(m => m.id === data.message_id ? { ...m, deleted_at: new Date().toISOString() } : m);
		}));

		unsubs.push(wsClient.on('dm_message_edited', (data: any) => {
			if (data.conversation_id !== conversationId) return;
			messages = messages.map(m => m.id === data.message_id ? { ...m, content: data.content, edited_at: data.edited_at } : m);
		}));

		unsubs.push(wsClient.on('dm_reaction_update', (data: any) => {
			if (data.conversation_id !== conversationId) return;
			messages = messages.map(m => {
				if (m.id !== data.message_id) return m;
				const reactions = [...(m.reactions ?? [])];
				const idx = reactions.findIndex((r: any) => r.emoji === data.emoji);
				if (data.action === 'added') {
					if (idx >= 0) {
						reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, me: data.user_id === myId ? true : reactions[idx].me };
					} else {
						reactions.push({ emoji: data.emoji, count: 1, me: data.user_id === myId });
					}
				} else if (idx >= 0) {
					const newCount = reactions[idx].count - 1;
					if (newCount <= 0) reactions.splice(idx, 1);
					else reactions[idx] = { ...reactions[idx], count: newCount, me: data.user_id === myId ? false : reactions[idx].me };
				}
				return { ...m, reactions };
			});
		}));

		// ── Read receipts ─────────────────────────────────────────────
		// This event was already being broadcast server-side (see
		// /api/dm/read) but nothing on the client ever listened for it, so
		// "Seen" state only ever existed in the database — never rendered.
		// Patches the matching member's read position in place; readByMessageId
		// below derives which message(s) to show a "Seen" marker under.
		unsubs.push(wsClient.on('dm_read_receipt', (data: any) => {
			if (data.conversation_id !== conversationId) return;
			conv = {
				...conv,
				members: (conv.members as any[]).map((m) =>
					m.user_id === data.user_id
						? { ...m, last_read_message_id: data.message_id, last_read_at: new Date().toISOString() }
						: m
				)
			};
		}));

		unsubs.push(wsClient.on('dm_typing_start', (data: any) => {
			if (data.conversationId !== conversationId || data.userId === myId) return;
			typingUserIds = new Set(typingUserIds).add(data.userId);
			clearTimeout(typingTimeouts.get(data.userId));
			typingTimeouts.set(data.userId, setTimeout(() => {
				const next = new Set(typingUserIds); next.delete(data.userId); typingUserIds = next;
			}, 4000));
		}));

		unsubs.push(wsClient.on('dm_typing_stop', (data: any) => {
			if (data.conversationId !== conversationId) return;
			const next = new Set(typingUserIds); next.delete(data.userId); typingUserIds = next;
		}));

		for (const evt of ['dm_members_updated', 'dm_member_left', 'dm_member_removed', 'dm_group_renamed']) {
			unsubs.push(wsClient.on(evt, (data: any) => {
				if (data.conversation_id !== conversationId) return;
				load();
			}));
		}
	});

	onDestroy(() => {
		unsubs.forEach(u => u());
		typingTimeouts.forEach(t => clearTimeout(t));
		sendTypingStop();
	});

	function sendTypingStart() {
		if (!isTyping) {
			const recipients = otherMemberIds();
			if (recipients.length === 0) return;
			isTyping = true;
			wsClient.send({ type: 'dm_typing_start', conversationId, otherUserIds: recipients });
		}
	}

	function sendTypingStop() {
		if (isTyping) {
			const recipients = otherMemberIds();
			isTyping = false;
			if (recipients.length > 0) wsClient.send({ type: 'dm_typing_stop', conversationId, otherUserIds: recipients });
		}
	}

	let typingStopTimer: ReturnType<typeof setTimeout>;
	function onContentInput() {
		sendTypingStart();
		clearTimeout(typingStopTimer);
		typingStopTimer = setTimeout(sendTypingStop, 3000);
	}

	async function send() {
		if (sending) return;
		if (!content.trim() && !pendingGif && !pendingFile) return;

		sending = true;
		try {
			const fd = new FormData();
			fd.append('conversation_id', conversationId);
			if (content.trim()) fd.append('content', content.trim());
			if (pendingGif) {
				fd.append('gif_url', pendingGif.url);
				fd.append('gif_preview_url', pendingGif.preview_url);
			}
			if (pendingFile) fd.append('attachment', pendingFile);
			if (replyTo) fd.append('reply_to_id', replyTo.id);

			const res = await fetch('/api/dm/messages', { method: 'POST', body: fd });
			if (!res.ok) {
				const e = await res.json();
				toast.error(e.error ?? 'Failed to send');
				return;
			}
			const msg = await res.json();
			messages = [...messages, msg];
			content = '';
			pendingGif = null;
			pendingFile = null;
			replyTo = null;
			sendTypingStop();
			await tick();
			scrollToBottom();
		} finally {
			sending = false;
		}
	}

	async function deleteMessage(id: string) {
		await fetch('/api/dm/messages', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message_id: id })
		});
		messages = messages.map(m => m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m);
	}

	function startEdit(msg: any) {
		editingId = msg.id;
		editContent = msg.content ?? '';
	}

	async function saveEdit() {
		if (!editingId || !editContent.trim()) return;
		const res = await fetch('/api/dm/messages', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message_id: editingId, content: editContent.trim() })
		});
		if (res.ok) {
			const updated = await res.json();
			messages = messages.map(m => m.id === editingId ? { ...m, content: updated.content, edited_at: updated.edited_at } : m);
		}
		editingId = null;
		editContent = '';
	}

	async function toggleReaction(messageId: string, emoji: string) {
		openReactionPickerFor = null;
		// Optimistic update
		messages = messages.map(m => {
			if (m.id !== messageId) return m;
			const reactions = [...(m.reactions ?? [])];
			const idx = reactions.findIndex((r: any) => r.emoji === emoji);
			if (idx >= 0 && reactions[idx].me) {
				const newCount = reactions[idx].count - 1;
				if (newCount <= 0) reactions.splice(idx, 1);
				else reactions[idx] = { ...reactions[idx], count: newCount, me: false };
			} else if (idx >= 0) {
				reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, me: true };
			} else {
				reactions.push({ emoji, count: 1, me: true });
			}
			return { ...m, reactions };
		});

		await fetch('/api/dm/reactions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message_id: messageId, emoji })
		});
	}

	async function acceptRequest() {
		await fetch('/api/dm/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, action: 'accept' })
		});
		conv = { ...conv, status: 'active' };
	}

	async function rejectRequest() {
		await fetch('/api/dm/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, action: 'reject' })
		});
		onback();
	}

	async function toggleMute() {
		const newMuted = !myMembership?.muted;
		await fetch('/api/dm/members', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, muted: newMuted })
		});
		conv = { ...conv, members: members.map((m: any) => m.user_id === myId ? { ...m, muted: newMuted } : m) };
		showHeaderMenu = false;
	}

	async function togglePin() {
		const newPinned = !conv?.pinned;
		await fetch('/api/dm/members', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, pinned: newPinned })
		});
		conv = { ...conv, pinned: newPinned };
		showHeaderMenu = false;
	}

	async function leaveGroup() {
		if (!confirm('Leave this group? You can be re-added by another member later.')) return;
		await fetch('/api/dm/members', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId })
		});
		onback();
	}

	async function removeMember(userId: string) {
		await fetch('/api/dm/members', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, target_user_id: userId })
		});
		await load();
	}

	async function addMember() {
		if (!addMemberHandle.trim()) return;
		const res = await fetch('/api/dm/members', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation_id: conversationId, handles: [addMemberHandle.trim()] })
		});
		if (!res.ok) {
			const e = await res.json();
			toast.error(e.error ?? 'Failed to add member');
			return;
		}
		addMemberHandle = '';
		showAddMember = false;
		await load();
	}

	async function blockUser() {
		if (!otherUser) return;
		if (!confirm(`Block @${otherUser.handle}? They won't be able to message you again.`)) return;
		await fetch('/api/dm/block', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ target_handle: otherUser.handle })
		});
		toast.success(`Blocked @${otherUser.handle}`);
		showHeaderMenu = false;
		onback();
	}

	function onFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (file.size > 25 * 1024 * 1024) { toast.error('Max 25 MB'); return; }
		pendingFile = file;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (editingId) saveEdit(); else send();
		}
		if (e.key === 'Escape' && editingId) { editingId = null; editContent = ''; }
	}

	function formatTime(iso: string) {
		return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	function isImage(mime: string | null) {
		return mime?.startsWith('image/') ?? false;
	}

	function senderName(senderId: string): string {
		if (senderId === myId) return 'You';
		const m = members.find((x: any) => x.user_id === senderId);
		return m?.username ?? otherUser?.username ?? '';
	}

	const typingLabel = $derived.by(() => {
		const ids = Array.from(typingUserIds);
		if (ids.length === 0) return '';
		const names = ids.map(id => senderName(id));
		if (names.length === 1) return `${names[0]} is typing…`;
		return `${names.join(', ')} are typing…`;
	});
</script>

<div class="dm-view">
	<!-- Header -->
	<div class="dm-header">
		<button class="back-btn" onclick={onback}><ArrowLeft size={18} /></button>

		{#if isGroup}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="group-header-avatar" onclick={() => { showMemberPanel = true; }}>
				<Users size={16} />
			</div>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="header-info" onclick={() => { showMemberPanel = true; }} style="cursor:pointer">
				<span class="header-name">{displayName()}</span>
				<span class="header-handle">{members.length + 1} members</span>
			</div>
		{:else if otherUser}
			<Avatar size={8} src={cdnUrl(otherUser.user_id, 'small')} alt={otherUser.username} userId={otherUser.user_id} />
			<div class="header-info">
				<span class="header-name">
					<UserName name={otherUser.username} color={otherUser.name_color} verified={otherUser.verified} />
				</span>
				<span class="header-handle">@{otherUser.handle}</span>
			</div>
		{/if}

		<div class="header-menu-wrap">
			<button class="back-btn" onclick={() => { showHeaderMenu = !showHeaderMenu; }}><MoreVertical size={16} /></button>
			{#if showHeaderMenu}
				<div class="header-menu">
					<button onclick={togglePin}><Pin size={13} /> {conv?.pinned ? 'Unpin' : 'Pin'} conversation</button>
					<button onclick={toggleMute}>
						{#if myMembership?.muted}<Bell size={13} /> Unmute{:else}<BellOff size={13} /> Mute{/if}
					</button>
					{#if isGroup}
						<button onclick={() => { showMemberPanel = true; showHeaderMenu = false; }}><Users size={13} /> Members</button>
						<button class="danger" onclick={leaveGroup}><LogOut size={13} /> Leave group</button>
					{:else}
						<button class="danger" onclick={blockUser}><Ban size={13} /> Block user</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Member panel (group DMs) -->
	{#if showMemberPanel}
		<div class="member-panel-overlay">
			<div class="member-panel">
				<div class="member-panel-header">
					<span>Members ({members.length + 1})</span>
					<button onclick={() => { showMemberPanel = false; showAddMember = false; }}><X size={16} /></button>
				</div>
				<div class="member-list">
					<div class="member-row">
						<Avatar size={8} src={cdnUrl(myId, 'small')} alt="You" userId={myId} />
						<span class="member-name">You</span>
						{#if conv?.owner_id === myId}<span class="member-role">Owner</span>{/if}
					</div>
					{#each members as m (m.user_id)}
						<div class="member-row">
							<Avatar size={8} src={cdnUrl(m.user_id, 'small')} alt={m.username} userId={m.user_id} />
							<span class="member-name"><UserName name={m.username} color={m.name_color} verified={m.verified} /></span>
							{#if conv?.owner_id === m.user_id}<span class="member-role">Owner</span>{/if}
							{#if iAmOwner && conv?.owner_id !== m.user_id}
								<button class="remove-member-btn" onclick={() => removeMember(m.user_id)}>Remove</button>
							{/if}
						</div>
					{/each}
				</div>
				{#if showAddMember}
					<div class="add-member-row">
						<input type="text" placeholder="@handle" bind:value={addMemberHandle} onkeydown={(e) => e.key === 'Enter' && addMember()} />
						<button onclick={addMember}>Add</button>
					</div>
				{:else}
					<button class="add-member-toggle" onclick={() => { showAddMember = true; }}><UserPlus size={14} /> Add member</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Messages -->
	<div class="messages" bind:this={messagesEl}>
		{#if loading}
			<div class="msg-empty">Loading…</div>
		{:else if messages.length === 0 && conv?.status === 'active'}
			<div class="msg-empty">No messages yet. Say hi!</div>
		{/if}

		<!-- DM request banner (1:1 only) -->
		{#if conv?.status === 'pending'}
			{#if conv.owner_id !== myId}
				<div class="request-banner">
					<p><strong>{otherUser?.username}</strong> wants to send you a message.</p>
					<div class="request-actions">
						<button class="accept-btn" onclick={acceptRequest}>Accept</button>
						<button class="reject-btn" onclick={rejectRequest}>Decline</button>
					</div>
				</div>
			{:else}
				<div class="msg-empty">Request sent — waiting for {otherUser?.username} to accept.</div>
			{/if}
		{/if}

		{#each messages as msg (msg.id)}
			{@const isMe = msg.sender_id === myId}
			<div class="msg-row" class:me={isMe}>
				{#if !isMe}
					<Avatar size={7} src={cdnUrl(msg.sender_id, 'small')} alt="" userId={msg.sender_id} />
				{/if}
				<div class="msg-col" class:me={isMe}>
					{#if isGroup && !isMe}
						<span class="msg-sender">{senderName(msg.sender_id)}</span>
					{/if}

					<div class="msg-bubble" class:me={isMe}>
						{#if msg.deleted_at}
							<span class="deleted">Message deleted</span>
						{:else}
							{#if msg.reply_to}
								<div class="reply-preview">
									<Reply size={11} />
									<span class="reply-sender">{senderName(msg.reply_to.sender_id)}</span>
									<span class="reply-text">{msg.reply_to.content?.slice(0, 60) ?? '…'}</span>
								</div>
							{/if}

							{#if editingId === msg.id}
								<div class="edit-box">
									<textarea bind:value={editContent} onkeydown={handleKeydown} rows="1"></textarea>
									<div class="edit-actions">
										<button onclick={saveEdit}>Save</button>
										<button onclick={() => { editingId = null; }}>Cancel</button>
									</div>
								</div>
							{:else}
								{#if msg.content}
									<ParsedContent content={msg.content} showLinkPreview={true} />
								{/if}
								{#if msg.gif_url}
									<img class="gif-msg" src={msg.gif_url} alt="GIF" loading="lazy" />
								{/if}
								{#if msg.attachment_url}
									{#if isImage(msg.attachment_type)}
										<img class="attachment-img" src={msg.attachment_url} alt={msg.attachment_name} />
									{:else}
										<a class="attachment-link" href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
											📎 {msg.attachment_name}
										</a>
									{/if}
								{/if}
								<div class="msg-meta">
									<span class="msg-time">{formatTime(msg.created_at)}</span>
									{#if msg.edited_at}<span class="edited-tag">(edited)</span>{/if}
								</div>
							{/if}
						{/if}
					</div>

					{#if !msg.deleted_at && editingId !== msg.id}
						<div class="msg-actions" class:me={isMe}>
							<button title="React" onclick={() => { openReactionPickerFor = openReactionPickerFor === msg.id ? null : msg.id; }}>
								<SmilePlus size={13} />
							</button>
							<button title="Reply" onclick={() => { replyTo = msg; }}><Reply size={13} /></button>
							{#if isMe}
								<button title="Edit" onclick={() => startEdit(msg)}><Pencil size={13} /></button>
								<button title="Delete" onclick={() => deleteMessage(msg.id)}>✕</button>
							{/if}
						</div>
					{/if}

					{#if openReactionPickerFor === msg.id}
						<div class="reaction-picker">
							{#each QUICK_REACTIONS as emoji}
								<button onclick={() => toggleReaction(msg.id, emoji)}>
									<EmojiIcon {emoji} size={18} />
								</button>
							{/each}
						</div>
					{/if}

					{#if msg.reactions?.length > 0}
						<div class="reactions-row" class:me={isMe}>
							{#each msg.reactions as r (r.emoji)}
								<button class="reaction-chip" class:mine={r.me} onclick={() => toggleReaction(msg.id, r.emoji)}>
									<EmojiIcon emoji={r.emoji} size={14} /> {r.count}
								</button>
							{/each}
						</div>
					{/if}

					{#if seenByMessageId.has(msg.id)}
						<div class="seen-row" class:me={isMe}>
							{#each seenByMessageId.get(msg.id) as reader (reader.user_id)}
								<span title={`Seen by ${reader.handle}`}>
									<Avatar size={4} src={cdnUrl(reader.user_id, 'small')} alt="" userId={reader.user_id} showPresence={false} />
								</span>
							{/each}
							{#if !isGroup}
								<span class="seen-label">Seen</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if typingLabel}
			<div class="typing-indicator">
				<span></span><span></span><span></span>
				<span class="typing-label">{typingLabel}</span>
			</div>
		{/if}
	</div>

	<!-- Reply preview above compose -->
	{#if replyTo}
		<div class="reply-compose-preview">
			<Reply size={13} />
			<span class="reply-compose-text">Replying to <strong>{senderName(replyTo.sender_id)}</strong>: {replyTo.content?.slice(0, 50) ?? '…'}</span>
			<button onclick={() => { replyTo = null; }}><X size={13} /></button>
		</div>
	{/if}

	<!-- Pending previews -->
	{#if pendingGif || pendingFile}
		<div class="pending-preview">
			{#if pendingGif}
				<img src={pendingGif.preview_url} alt="GIF" class="pending-gif" />
				<button onclick={() => { pendingGif = null; }}><X size={14} /></button>
			{/if}
			{#if pendingFile}
				<span class="pending-file">📎 {pendingFile.name}</span>
				<button onclick={() => { pendingFile = null; }}><X size={14} /></button>
			{/if}
		</div>
	{/if}

	<!-- GIF picker -->
	{#if showGifPicker}
		<div class="gif-picker-wrap">
			<GifPicker onselect={(gif) => {
				pendingGif = { url: gif.url, preview_url: gif.preview_url };
				showGifPicker = false;
			}} />
		</div>
	{/if}

	<!-- Compose area -->
	{#if conv?.status === 'active' || (conv?.status === 'pending' && conv?.owner_id === myId)}
		<div class="compose">
			<div class="compose-tools">
				<button class="tool-btn" title="Attach file" onclick={() => fileInput.click()}>
					<Paperclip size={16} />
				</button>
				<button class="tool-btn" class:active={showGifPicker} title="GIF" onclick={() => { showGifPicker = !showGifPicker; }}>
					GIF
				</button>
				<input type="file" bind:this={fileInput} onchange={onFileChange} style="display:none" />
			</div>
			<textarea
				class="compose-input"
				placeholder={conv?.status === 'pending' ? 'Send a message request…' : 'Message…'}
				bind:value={content}
				oninput={onContentInput}
				onkeydown={handleKeydown}
				rows="1"
			></textarea>
			<button class="send-btn" onclick={send} disabled={sending}>
				<Send size={16} />
			</button>
		</div>
	{/if}
</div>

<style>
	.dm-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	.dm-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.back-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		padding: 4px;
		border-radius: 6px;
	}
	.back-btn:hover { background: hsl(var(--accent)); }

	.group-header-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: hsl(var(--muted));
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.header-info { display: flex; flex-direction: column; min-width: 0; }
	.header-name { font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.header-handle { font-size: 12px; color: hsl(var(--muted-foreground)); }

	.header-menu-wrap { margin-left: auto; position: relative; }
	.header-menu {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 40;
		background: hsl(var(--popover, var(--background)));
		border: 1.5px solid hsl(var(--border));
		border-radius: 10px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
		padding: 4px;
		min-width: 180px;
		display: flex;
		flex-direction: column;
	}
	.header-menu button {
		display: flex;
		align-items: center;
		gap: 8px;
		background: transparent;
		border: none;
		text-align: left;
		padding: 8px 10px;
		border-radius: 7px;
		font-size: 13px;
		cursor: pointer;
		color: hsl(var(--foreground));
	}
	.header-menu button:hover { background: hsl(var(--accent)); }
	.header-menu button.danger { color: hsl(var(--destructive, 0 84% 60%)); }

	.member-panel-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0,0,0,0.3);
		z-index: 50;
		display: flex;
		justify-content: flex-end;
	}
	.member-panel {
		width: 100%;
		max-width: 320px;
		background: hsl(var(--background));
		height: 100%;
		display: flex;
		flex-direction: column;
		box-shadow: -6px 0 20px rgba(0,0,0,0.15);
	}
	.member-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid hsl(var(--border));
		font-weight: 700;
	}
	.member-panel-header button { background: transparent; border: none; cursor: pointer; color: hsl(var(--muted-foreground)); }
	.member-list { flex: 1; overflow-y: auto; padding: 8px; }
	.member-row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; }
	.member-row:hover { background: hsl(var(--accent)); }
	.member-name { font-size: 13px; font-weight: 600; flex: 1; }
	.member-role { font-size: 10px; color: hsl(var(--muted-foreground)); text-transform: uppercase; font-weight: 700; }
	.remove-member-btn {
		background: transparent;
		border: none;
		color: hsl(var(--destructive, 0 84% 60%));
		font-size: 11px;
		cursor: pointer;
	}
	.add-member-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		justify-content: center;
		margin: 8px;
		padding: 8px;
		border-radius: 8px;
		border: 1.5px dashed hsl(var(--border));
		background: transparent;
		color: hsl(var(--primary));
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.add-member-row { display: flex; gap: 6px; padding: 8px; }
	.add-member-row input {
		flex: 1;
		background: hsl(var(--muted));
		border: 1.5px solid hsl(var(--border));
		border-radius: 8px;
		padding: 6px 10px;
		font-size: 13px;
		color: hsl(var(--foreground));
	}
	.add-member-row button {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: 8px;
		padding: 6px 12px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
	}

	.msg-empty {
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 13px;
		margin: auto;
	}

	.request-banner {
		background: hsl(var(--muted));
		border-radius: 12px;
		padding: 16px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: auto;
		max-width: 300px;
	}

	.request-actions { display: flex; gap: 8px; justify-content: center; }
	.accept-btn, .reject-btn {
		padding: 6px 16px;
		border-radius: 9999px;
		border: none;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.accept-btn { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
	.reject-btn { background: hsl(var(--muted)); color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); }

	.msg-row {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	.msg-row.me { flex-direction: row-reverse; }

	.msg-col { display: flex; flex-direction: column; gap: 2px; max-width: 70%; position: relative; }
	.msg-col.me { align-items: flex-end; }

	.msg-sender { font-size: 11px; font-weight: 600; color: hsl(var(--muted-foreground)); margin-left: 4px; }

	.msg-bubble {
		background: hsl(var(--muted));
		border-radius: 16px 16px 16px 4px;
		padding: 8px 12px;
		font-size: 14px;
		word-break: break-word;
	}
	.msg-bubble.me {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: 16px 16px 4px 16px;
	}

	.reply-preview {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		opacity: 0.75;
		border-left: 2px solid currentColor;
		padding-left: 6px;
		margin-bottom: 4px;
	}
	.reply-sender { font-weight: 700; }
	.reply-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }

	.deleted { opacity: 0.5; font-style: italic; font-size: 12px; }

	.gif-msg { max-width: 100%; border-radius: 8px; display: block; }

	.attachment-img { max-width: 100%; border-radius: 8px; display: block; }
	.attachment-link {
		display: inline-block;
		padding: 4px 8px;
		border-radius: 8px;
		background: hsl(var(--background));
		color: hsl(var(--primary));
		text-decoration: underline;
		font-size: 13px;
	}

	.msg-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
	.msg-time { font-size: 10px; opacity: 0.55; }
	.edited-tag { font-size: 10px; opacity: 0.5; font-style: italic; }

	.edit-box { display: flex; flex-direction: column; gap: 6px; }
	.edit-box textarea {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		padding: 6px 8px;
		font-size: 13px;
		font-family: inherit;
		resize: none;
	}
	.edit-actions { display: flex; gap: 6px; }
	.edit-actions button {
		font-size: 11px;
		padding: 3px 10px;
		border-radius: 9999px;
		border: none;
		cursor: pointer;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.msg-actions {
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.1s;
	}
	.msg-row:hover .msg-actions { opacity: 1; }
	.msg-actions button {
		background: hsl(var(--muted));
		border: none;
		border-radius: 6px;
		padding: 3px 6px;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		font-size: 11px;
		display: flex;
		align-items: center;
	}
	.msg-actions button:hover { color: hsl(var(--foreground)); }

	.reaction-picker {
		display: flex;
		flex-wrap: wrap;
		max-width: 190px;
		gap: 2px;
		background: hsl(var(--popover, var(--background)));
		border: 1.5px solid hsl(var(--border));
		border-radius: 14px;
		padding: 4px 6px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.12);
	}
	.reaction-picker button {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 2px;
		border-radius: 50%;
	}
	.reaction-picker button:hover { background: hsl(var(--accent)); transform: scale(1.15); }

	.reactions-row { display: flex; gap: 4px; flex-wrap: wrap; }
	.seen-row { display: flex; align-items: center; gap: 2px; margin-top: 2px; justify-content: flex-end; opacity: 0.6; }
	.seen-row.me { justify-content: flex-end; }
	.seen-row :global(img) { width: 14px; height: 14px; border-radius: 999px; }
	.seen-label { font-size: 10px; color: var(--muted-foreground, #888); }
	.reactions-row.me { justify-content: flex-end; }
	.reaction-chip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 9999px;
		font-size: 11px;
		padding: 1px 7px;
		cursor: pointer;
		color: hsl(var(--foreground));
	}
	.reaction-chip.mine { border-color: hsl(var(--primary)); background: hsl(var(--primary) / 0.12); }

	.typing-indicator {
		display: flex;
		gap: 4px;
		align-items: center;
		padding: 8px 12px;
	}
	.typing-indicator span:not(.typing-label) {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: hsl(var(--muted-foreground));
		animation: bounce 1.2s infinite;
	}
	.typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
	.typing-indicator span:nth-child(3) { animation-delay: 0.3s; }
	.typing-label { font-size: 11px; color: hsl(var(--muted-foreground)); margin-left: 6px; }

	@keyframes bounce {
		0%, 80%, 100% { transform: translateY(0); }
		40% { transform: translateY(-6px); }
	}

	.reply-compose-preview {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border-top: 1px solid hsl(var(--border));
		background: hsl(var(--muted));
		font-size: 12px;
	}
	.reply-compose-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.reply-compose-preview button { background: transparent; border: none; cursor: pointer; color: hsl(var(--muted-foreground)); }

	.pending-preview {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border-top: 1px solid hsl(var(--border));
		background: hsl(var(--muted));
	}
	.pending-gif { height: 48px; border-radius: 6px; }
	.pending-file { font-size: 12px; color: hsl(var(--foreground)); }
	.pending-preview button {
		background: transparent;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
	}

	.gif-picker-wrap {
		padding: 8px 14px;
		border-top: 1px solid hsl(var(--border));
	}

	.compose {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.compose-tools { display: flex; gap: 4px; flex-shrink: 0; }

	.tool-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		padding: 6px 8px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 700;
		display: flex;
		align-items: center;
	}
	.tool-btn:hover, .tool-btn.active { background: hsl(var(--accent)); color: hsl(var(--foreground)); }

	.compose-input {
		flex: 1;
		background: hsl(var(--muted));
		border: 1.5px solid hsl(var(--border));
		border-radius: 20px;
		padding: 8px 14px;
		font-size: 14px;
		color: hsl(var(--foreground));
		resize: none;
		outline: none;
		max-height: 120px;
		overflow-y: auto;
		line-height: 1.4;
		font-family: inherit;
	}
	.compose-input:focus { border-color: hsl(var(--primary)); }

	.send-btn {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s;
	}
	.send-btn:disabled { opacity: 0.5; cursor: default; }
</style>