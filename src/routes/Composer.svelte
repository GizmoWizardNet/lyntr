<script lang="ts">
	import { ImageUp, X, Send } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { working } from '$lib/working';
	import DivInput from './DivInput.svelte';
	import PollCreator from './PollCreator.svelte';
	import GifPicker from './GifPicker.svelte';

	const MAX_IMAGES = 4;
	const CHAR_LIMIT = 280;

	interface Props {
		// Where the fetch goes. /api/lynt for new posts, /api/comment for replies.
		submitUrl: string;
		// localStorage key for draft autosave/restore. Pass a stable, unique
		// key per surface (e.g. 'compose:new' or `compose:reply:${lyntId}`).
		draftKey: string;
		placeholder?: string;
		submitLabel?: string;
		allowPoll?: boolean;
		autofocus?: boolean;
		// Called with the parsed JSON response body on a successful post.
		onPosted?: (item: any) => void;
		// Called when the user explicitly cancels (Escape / close button).
		// If there's unsaved content, Composer confirms before calling this.
		onCancel?: (() => void) | null;
		// Extra fields the caller needs on the FormData before it's sent —
		// e.g. { id: parentLyntId } for replies, { reposted: id } for reposts.
		extraFields?: Record<string, string>;
		onTypingStart?: (() => void) | null;
		onTypingStop?: (() => void) | null;
	}

	let {
		submitUrl,
		draftKey,
		placeholder = "Lynt it!",
		submitLabel = 'Lynt',
		allowPoll = false,
		autofocus = false,
		onPosted,
		onCancel = null,
		extraFields = {},
		onTypingStart = null,
		onTypingStop = null
	}: Props = $props();

	let content = $state('');
	let images = $state<{ file: File; previewUrl: string }[]>([]);
	let pendingGif = $state<{ url: string; preview_url: string } | null>(null);
	let showGifPicker = $state(false);
	let poll = $state<{ title: string; multi_select: boolean; resolve_at: string | null; options: string[] } | null>(null);
	let sending = $state(false);
	let dragActive = $state(false);
	let fileInput: HTMLInputElement;
	let rootEl: HTMLDivElement;

	const isDirty = $derived(content.trim().length > 0 || images.length > 0 || !!pendingGif || !!poll);
	const characterCount = $derived(content.length);
	const isOverLimit = $derived(characterCount > CHAR_LIMIT);
	const canAttachImage = $derived(!poll && !pendingGif && images.length < MAX_IMAGES);
	const canUseGif = $derived(!poll && images.length === 0);
	const canUsePoll = $derived(allowPoll && images.length === 0 && !pendingGif);
	const canSubmit = $derived(isDirty && !isOverLimit && !sending);

	// ── Draft persistence ────────────────────────────────────────────────
	// Only text + poll are persisted — Files can't survive localStorage, and
	// re-prompting for a lost image on refresh is an acceptable trade-off
	// for "your half-written post survives an accidental tab close".
	function loadDraft() {
		try {
			const raw = localStorage.getItem(draftKey);
			if (!raw) return;
			const draft = JSON.parse(raw);
			if (draft.content) content = draft.content;
			if (draft.poll) poll = draft.poll;
		} catch {
			// corrupt draft — ignore
		}
	}

	function saveDraftNow() {
		try {
			if (content.trim() || poll) {
				localStorage.setItem(draftKey, JSON.stringify({ content, poll }));
			} else {
				localStorage.removeItem(draftKey);
			}
		} catch {
			// storage full/unavailable — not worth surfacing to the user
		}
	}

	function clearDraft() {
		try { localStorage.removeItem(draftKey); } catch {}
	}

	let draftDebounce: ReturnType<typeof setTimeout>;
	$effect(() => {
		content; poll; // track
		clearTimeout(draftDebounce);
		draftDebounce = setTimeout(saveDraftNow, 500);
		return () => clearTimeout(draftDebounce);
	});

	loadDraft();

	// Typing indicator hooks — fired on every content change (wsClient's
	// startTyping is self-throttled/debounced, so this is safe to call often).
	let prevContent = content;
	$effect(() => {
		if (content !== prevContent) {
			prevContent = content;
			if (content.trim().length > 0) onTypingStart?.();
			else onTypingStop?.();
		}
	});

	// ── Images ───────────────────────────────────────────────────────────
	function addImageFiles(files: File[]) {
		const room = MAX_IMAGES - images.length;
		if (room <= 0) {
			toast.error(`You can attach up to ${MAX_IMAGES} images.`);
			return;
		}
		const toAdd = files.filter(f => f.type.startsWith('image/')).slice(0, room);
		if (toAdd.length < files.length) toast.error(`Only added ${toAdd.length} — max ${MAX_IMAGES} images per post.`);
		for (const file of toAdd) {
			images = [...images, { file, previewUrl: URL.createObjectURL(file) }];
		}
		pendingGif = null;
		showGifPicker = false;
		poll = null;
	}

	function removeImage(i: number) {
		URL.revokeObjectURL(images[i].previewUrl);
		images = images.filter((_, idx) => idx !== i);
	}

	function onFileSelected(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) addImageFiles(Array.from(target.files));
		target.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) addImageFiles(Array.from(files));
	}

	function onDragOver(e: DragEvent) {
		if (!canAttachImage) return;
		e.preventDefault();
		dragActive = true;
	}

	function onDragLeave(e: DragEvent) {
		if (e.currentTarget === e.target) dragActive = false;
	}

	// ── Keyboard shortcuts ───────────────────────────────────────────────
	// Ctrl/Cmd+Enter submits (DivInput lets this bubble instead of inserting
	// a newline — see DivInput.svelte). Escape discards, confirming first
	// if there's unsaved content.
	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			submit();
		} else if (e.key === 'Escape' && onCancel) {
			e.preventDefault();
			requestCancel();
		}
	}

	function requestCancel() {
		if (isDirty && !confirm('Discard this draft?')) return;
		clearDraft();
		onCancel?.();
	}

	// ── Submit ───────────────────────────────────────────────────────────
	async function submit() {
		if (!canSubmit) {
			if (isOverLimit) toast.error(`Too long — ${characterCount - CHAR_LIMIT} characters over the limit.`);
			return;
		}
		if (poll) {
			const validOptions = poll.options.filter(o => o.trim());
			if (!poll.title.trim() || validOptions.length < 2) {
				toast.error('Poll needs a question and at least 2 options.');
				return;
			}
		}

		sending = true;
		const hasUpload = images.length > 0 || !!pendingGif;
		working.steps(
			hasUpload
				? ['Uploading files…', 'Verifying post contents…', 'Writing to database…', 'Publishing…']
				: ['Verifying post contents…', 'Writing to database…', 'Publishing…']
		);

		try {
			const fd = new FormData();
			fd.append('content', content.trim());
			for (const img of images) fd.append('images', img.file, img.file.name);
			if (pendingGif) {
				fd.append('gif_url', pendingGif.url);
				fd.append('gif_preview_url', pendingGif.preview_url);
			}
			if (poll) {
				const validOptions = poll.options.filter(o => o.trim());
				fd.append('poll', JSON.stringify({ ...poll, options: validOptions }));
			}
			for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);

			const res = await fetch(submitUrl, { method: 'POST', body: fd });

			if (res.status === 201) {
				const item = await res.json();
				reset();
				onPosted?.(item);
			} else if (res.status === 429) {
				toast.warning('Woah, slow down! You are being ratelimited.');
			} else {
				const body = await res.json().catch(() => null);
				toast.error(body?.error || `Something went wrong. Error: ${res.status} ${res.statusText}`);
			}
		} finally {
			sending = false;
			working.done();
		}
	}

	function reset() {
		content = '';
		for (const img of images) URL.revokeObjectURL(img.previewUrl);
		images = [];
		pendingGif = null;
		showGifPicker = false;
		poll = null;
		clearDraft();
		onTypingStop?.();
	}

	// Exposed so a parent can force a clean slate (e.g. dialog fully closed).
	export function resetComposer() { reset(); }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="composer-root"
	class:drag-active={dragActive}
	bind:this={rootEl}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
	onkeydown={onKeydown}
>
	{#if dragActive}
		<div class="drop-overlay">Drop to attach</div>
	{/if}

	<DivInput
		bind:lynt={content}
		onImagePaste={(file) => { if (canAttachImage) addImageFiles([file]); }}
	/>

	{#if images.length > 0}
		<div class="image-grid" class:single={images.length === 1}>
			{#each images as img, i (img.previewUrl)}
				<div class="image-cell">
					<img src={img.previewUrl} alt="Attachment {i + 1}" />
					<button class="remove-image-btn" onclick={() => removeImage(i)} title="Remove image">
						<X size={13} />
					</button>
				</div>
			{/each}
		</div>
	{:else if pendingGif}
		<div class="gif-preview">
			<img src={pendingGif.url} alt="GIF" />
			<button class="remove-image-btn" onclick={() => { pendingGif = null; }} title="Remove GIF">
				<X size={13} />
			</button>
		</div>
	{/if}

	<div class="composer-toolbar">
		{#if canAttachImage}
			<button type="button" onclick={() => fileInput.click()} title="Add image ({images.length}/{MAX_IMAGES})">
				<ImageUp size={18} />
			</button>
		{/if}

		{#if canUseGif}
			<button
				type="button"
				class:text-primary={showGifPicker || pendingGif}
				onclick={() => { showGifPicker = !showGifPicker; }}
				title="Add GIF"
			>
				GIF
			</button>
		{/if}

		{#if canUsePoll}
			<PollCreator
				{poll}
				onchange={(p) => {
					poll = p;
					if (p) { images = []; pendingGif = null; showGifPicker = false; }
				}}
			/>
		{/if}

		<input style="display:none" type="file" accept="image/*" multiple onchange={onFileSelected} bind:this={fileInput} />

		<div class="composer-spacer"></div>

		{#if characterCount > 0}
			<span class="char-hint" class:over={isOverLimit}>{CHAR_LIMIT - characterCount}</span>
		{/if}

		{#if onCancel}
			<button type="button" class="cancel-btn" onclick={requestCancel}>Cancel</button>
		{/if}

		<button type="button" class="submit-btn" onclick={submit} disabled={!canSubmit} title="Post (Ctrl/Cmd+Enter)">
			{#if sending}…{:else}{submitLabel}{/if}
			<Send size={13} />
		</button>
	</div>

	{#if showGifPicker}
		<div class="gif-picker-wrap">
			<GifPicker onselect={(gif) => {
				pendingGif = { url: gif.url, preview_url: gif.preview_url };
				showGifPicker = false;
			}} />
		</div>
	{/if}
</div>

<style>
	.composer-root {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}

	.drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--primary) / 0.08);
		border: 2px dashed hsl(var(--primary));
		border-radius: 10px;
		font-weight: 700;
		color: hsl(var(--primary));
		pointer-events: none;
	}

	.image-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		border-radius: 10px;
		overflow: hidden;
		max-height: 360px;
	}
	.image-grid.single { grid-template-columns: 1fr; }
	.image-cell { position: relative; aspect-ratio: 1 / 1; }
	.image-grid.single .image-cell { aspect-ratio: 16 / 10; }
	.image-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

	.remove-image-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		border: none;
		border-radius: 50%;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.gif-preview { position: relative; border-radius: 10px; overflow: hidden; max-height: 360px; }
	.gif-preview img { width: 100%; max-height: 360px; object-fit: contain; display: block; }

	.composer-toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.composer-toolbar > button:not(.submit-btn):not(.cancel-btn) {
		background: transparent;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		font-size: 13px;
		font-weight: 700;
		padding: 4px;
		border-radius: 6px;
	}
	.composer-toolbar > button:not(.submit-btn):not(.cancel-btn):hover { color: hsl(var(--foreground)); background: hsl(var(--accent)); }

	.composer-spacer { flex: 1; }

	.char-hint { font-size: 12px; font-family: monospace; color: hsl(var(--muted-foreground)); }
	.char-hint.over { color: hsl(0 84% 60%); font-weight: 700; }

	.cancel-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		font-size: 13px;
		cursor: pointer;
		padding: 6px 10px;
	}

	.submit-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: 9999px;
		padding: 6px 16px;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}
	.submit-btn:disabled { opacity: 0.5; cursor: default; }

	.gif-picker-wrap { margin-top: 2px; }
</style>
