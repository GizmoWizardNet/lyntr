<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { X, Users, ChevronUp, ChevronDown, ImagePlus } from 'lucide-svelte';
	import Avatar from './Avatar.svelte';
	import UserName from './UserName.svelte';
	import ClanAvatarStack from './ClanAvatarStack.svelte';
	import GifPicker from './GifPicker.svelte';
	import ParsedContent from './ParsedContent.svelte';
	import { cdnUrl } from './stores';

	const CHAR_LIMIT = 280;
	const MAX_MEMBERS = 9;

	interface Friend {
		id: string;
		username: string;
		handle: string;
		verified: boolean;
		nameColor: string | null;
	}

	interface Props {
		myId: string;
		onStarted?: (clan: { id: string }) => void;
		onCancel?: (() => void) | null;
	}

	let { myId, onStarted, onCancel = null }: Props = $props();

	let content = $state('');
	let friends = $state<Friend[]>([]);
	let loadingFriends = $state(true);
	let selected = $state<Friend[]>([]);
	let search = $state('');
	let sending = $state(false);
	let pendingGif = $state<{ url: string; preview_url: string } | null>(null);
	let showGifPicker = $state(false);

	const characterCount = $derived(content.length);
	const isOverLimit = $derived(characterCount > CHAR_LIMIT);
	const filteredFriends = $derived(
		friends.filter(
			(f) =>
				!selected.some((s) => s.id === f.id) &&
				(f.username.toLowerCase().includes(search.toLowerCase()) || f.handle.toLowerCase().includes(search.toLowerCase()))
		)
	);
	// Preview mirrors what ClanAvatarStack will render on the real, published
	// lynt — myself at position 0 plus the relay chain — so what's shown
	// here is what actually ships, not a guess at it.
	const previewContributors = $derived([
		{ userId: myId, username: 'You', handle: '' },
		...selected.map((s) => ({ userId: s.id, username: s.username, handle: s.handle }))
	]);

	async function loadFriends() {
		loadingFriends = true;
		try {
			const res = await fetch('/api/friends');
			if (res.ok) friends = await res.json();
		} catch {
			// leave friends empty — the picker will just show "no friends found"
		} finally {
			loadingFriends = false;
		}
	}
	loadFriends();

	function toggleFriend(f: Friend) {
		if (selected.some((s) => s.id === f.id)) {
			selected = selected.filter((s) => s.id !== f.id);
		} else {
			if (selected.length >= MAX_MEMBERS) {
				toast.error(`Clan lynts are capped at ${MAX_MEMBERS + 1} people (including you).`);
				return;
			}
			selected = [...selected, f];
		}
	}

	// Mistakes in relay order used to mean remove-and-re-add-at-the-end —
	// the only way to fix a typo'd order was to rebuild the whole chain.
	// Straight up/down swaps instead.
	function move(index: number, dir: -1 | 1) {
		const target = index + dir;
		if (target < 0 || target >= selected.length) return;
		const next = [...selected];
		[next[index], next[target]] = [next[target], next[index]];
		selected = next;
	}

	async function start() {
		if (!content.trim() && !pendingGif) return toast.error('Say something first.');
		if (isOverLimit) return toast.error(`Keep it under ${CHAR_LIMIT} characters.`);
		if (selected.length === 0) return toast.error('Add at least one friend to lynt with.');

		sending = true;
		try {
			const res = await fetch('/api/clan-lynt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: content.trim(),
					memberIds: selected.map((s) => s.id),
					gifUrl: pendingGif?.url ?? null,
					gifPreviewUrl: pendingGif?.preview_url ?? null
				})
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error ?? 'Failed to start clan lynt.');
				return;
			}
			toast.success(`Sent to @${selected[0].handle} — waiting on them to accept.`);
			onStarted?.(data);
		} catch {
			toast.error('Network error — try again.');
		} finally {
			sending = false;
		}
	}
</script>

<div class="clan-composer">
	<p class="explainer">
		Each person accepts (and can edit) in order — the last accept is what publishes it. A
		decline at any point deletes the whole draft.
	</p>

	<textarea
		class="clan-textarea"
		placeholder="Start the clan lynt…"
		bind:value={content}
		maxlength={CHAR_LIMIT + 40}
	></textarea>

	{#if pendingGif}
		<div class="gif-preview">
			<img src={pendingGif.url} alt="GIF" />
			<button type="button" class="remove-gif-btn" onclick={() => (pendingGif = null)} title="Remove GIF">
				<X size={13} />
			</button>
		</div>
	{/if}

	<div class="composer-row">
		{#if !pendingGif}
			<button
				type="button"
				class="gif-toggle"
				class:active={showGifPicker}
				onclick={() => (showGifPicker = !showGifPicker)}
			>
				<ImagePlus class="h-3.5 w-3.5" /> GIF
			</button>
		{/if}
		<div class="composer-spacer"></div>
		<span class="char-count" class:over={isOverLimit}>{characterCount}/{CHAR_LIMIT}</span>
	</div>

	{#if showGifPicker}
		<div class="gif-picker-wrap">
			<GifPicker
				onselect={(gif) => {
					pendingGif = { url: gif.url, preview_url: gif.preview_url };
					showGifPicker = false;
				}}
			/>
		</div>
	{/if}

	<div class="picker-label"><Users class="h-3.5 w-3.5" /> Relay order — first pick goes first</div>

	{#if selected.length > 0}
		<div class="chain">
			{#each selected as f, i (f.id)}
				<div class="chain-chip">
					<span class="chain-pos">{i + 2}</span>
					<Avatar size={6} src={cdnUrl(f.id, 'small')} alt={f.username} userId={f.id} showPresence={false} />
					<div class="chain-name">
						<UserName name={f.username} color={f.nameColor} verified={f.verified} />
					</div>
					<div class="chain-reorder">
						<button type="button" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Move earlier">
							<ChevronUp class="h-3 w-3" />
						</button>
						<button type="button" disabled={i === selected.length - 1} onclick={() => move(i, 1)} aria-label="Move later">
							<ChevronDown class="h-3 w-3" />
						</button>
					</div>
					<button type="button" class="chain-remove" onclick={() => toggleFriend(f)} aria-label="Remove">
						<X class="h-3 w-3" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<input class="friend-search" type="text" placeholder="Search friends…" bind:value={search} />

	<div class="friend-list">
		{#if loadingFriends}
			<p class="empty">Loading friends…</p>
		{:else if friends.length === 0}
			<p class="empty">You need mutual friends (follow each other) to start a clan lynt.</p>
		{:else if filteredFriends.length === 0}
			<p class="empty">No matches.</p>
		{:else}
			{#each filteredFriends as f (f.id)}
				<button type="button" class="friend-row" onclick={() => toggleFriend(f)}>
					<Avatar size={7} src={cdnUrl(f.id, 'small')} alt={f.username} userId={f.id} showPresence={false} />
					<div class="friend-text">
						<UserName name={f.username} color={f.nameColor} verified={f.verified} />
						<span class="friend-handle">@{f.handle}</span>
					</div>
				</button>
			{/each}
		{/if}
	</div>

	{#if content.trim() || pendingGif || selected.length > 0}
		<div class="preview">
			<div class="preview-label">Preview</div>
			<div class="preview-card">
				<ClanAvatarStack contributors={previewContributors} size={8} />
				<div class="preview-body">
					{#if content.trim()}
						<ParsedContent
							content={content.trim()}
							className="preview-content"
							showLinkPreview={false}
							interactive={false}
						/>
					{/if}
					{#if pendingGif}<img class="preview-gif" src={pendingGif.url} alt="GIF" />{/if}
					{#if selected.length > 0}
						<p class="preview-meta">with {selected.length} other{selected.length === 1 ? '' : 's'}</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<div class="actions">
		{#if onCancel}
			<button type="button" class="cancel-btn" onclick={() => onCancel?.()}>Cancel</button>
		{/if}
		<button type="button" class="send-btn" onclick={start} disabled={sending}>
			{sending ? 'Sending…' : 'Send to first friend'}
		</button>
	</div>
</div>

<style>
	.clan-composer {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-family: var(--font-retro);
	}

	.explainer {
		margin: 0;
		font-size: 12px;
		line-height: 1.4;
		color: hsl(var(--muted-foreground));
	}

	.clan-textarea {
		width: 100%;
		min-height: 80px;
		resize: vertical;
		border-radius: 6px;
		padding: 10px;
		background: hsl(var(--secondary));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		font-family: var(--font-retro);
		font-size: 14px;
		color: hsl(var(--foreground));
	}

	.gif-preview {
		position: relative;
		width: fit-content;
		max-width: 100%;
		border-radius: 6px;
		overflow: hidden;
	}
	.gif-preview img {
		display: block;
		max-height: 180px;
		max-width: 100%;
	}
	.remove-gif-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		display: flex;
		padding: 4px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
	}

	.composer-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.composer-spacer {
		flex: 1;
	}

	.gif-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--secondary));
	}
	.gif-toggle.active {
		color: hsl(var(--primary));
	}

	.gif-picker-wrap {
		max-height: 220px;
		overflow: hidden;
		border-radius: 6px;
	}

	.char-count {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.char-count.over {
		color: hsl(var(--destructive));
	}

	.picker-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
	}

	.chain {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.chain-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px 4px 8px;
		border-radius: 8px;
		background: hsl(var(--primary) / 0.12);
		font-size: 12px;
	}

	.chain-pos {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-size: 10px;
		font-weight: 700;
		flex-shrink: 0;
	}

	.chain-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chain-reorder {
		display: flex;
		flex-direction: column;
	}
	.chain-reorder button {
		display: flex;
		color: hsl(var(--muted-foreground));
		line-height: 0;
	}
	.chain-reorder button:hover:not(:disabled) {
		color: hsl(var(--foreground));
	}
	.chain-reorder button:disabled {
		opacity: 0.25;
	}

	.chain-remove {
		display: flex;
		color: hsl(var(--muted-foreground));
		margin-left: 2px;
	}
	.chain-remove:hover {
		color: hsl(var(--destructive));
	}

	.friend-search {
		width: 100%;
		padding: 6px 10px;
		border-radius: 6px;
		background: hsl(var(--secondary));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		font-family: var(--font-retro);
		font-size: 13px;
	}

	.friend-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 140px;
		overflow-y: auto;
	}

	.empty {
		padding: 10px 4px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.friend-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		text-align: left;
	}
	.friend-row:hover {
		background: hsl(var(--secondary));
	}

	.friend-text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.friend-handle {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.preview {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.preview-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: hsl(var(--muted-foreground));
	}
	.preview-card {
		display: flex;
		gap: 10px;
		padding: 10px;
		border-radius: 6px;
		background: hsl(var(--secondary) / 0.5);
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
	}
	.preview-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.preview-content {
		margin: 0;
		font-size: 13px;
		word-break: break-word;
	}
	.preview-gif {
		max-width: 100%;
		max-height: 140px;
		border-radius: 6px;
	}
	.preview-meta {
		margin: 0;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 4px;
	}

	.cancel-btn {
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}

	.send-btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 700;
		color: hsl(var(--primary-foreground));
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}
	.send-btn:disabled {
		opacity: 0.6;
	}
</style>