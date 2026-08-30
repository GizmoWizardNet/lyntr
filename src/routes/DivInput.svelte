<script lang="ts">
	import { run } from 'svelte/legacy';

	import LinkPreview from './LinkPreview.svelte';
	import MentionAutocomplete from './MentionAutocomplete.svelte';
	import ParsedContent from './ParsedContent.svelte';

	interface Props {
		lynt?: string;
		// Called once per pasted image file, instead of the default
		// "insert as text" paste behavior. Lets a wrapping Composer treat a
		// pasted screenshot the same as a dropped/browsed file.
		onImagePaste?: (file: File) => void;
	}

	let { lynt = $bindable(''), onImagePaste }: Props = $props();

	let writeAreaEl: HTMLDivElement = $state();
	let mentionAutocomplete: MentionAutocomplete = $state();

	let characterCount = $derived(lynt.length);
	let isOverLimit    = $derived(characterCount > 280);
	let isNearLimit    = $derived(characterCount >= 250 && !isOverLimit);
	let remaining      = $derived(280 - characterCount);

	let mode: 'write' | 'preview' = $state('write');

	// Debounced URL — only fetches OG data 800ms after typing stops
	let previewUrl: string | null = $state(null);
	let urlDebounce: ReturnType<typeof setTimeout>;
	function extractFirstUrl(text: string): string | null {
		const stripped = (text ?? '').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '[$1](...)');
		const m = stripped.match(/https?:\/\/[^\s<>"')]+/);
		return m ? m[0].replace(/[.,!?;:]+$/, '') : null;
	}
	$effect(() => {
		clearTimeout(urlDebounce);
		urlDebounce = setTimeout(() => { previewUrl = extractFirstUrl(lynt); }, 800);
		return () => clearTimeout(urlDebounce);
	});

	// ── Formatting helpers ───────────────────────────────────────
	type WrapToken = '**' | '*' | '`' | '~~';

	function wrapSelection(token: WrapToken) {
		const el = document.querySelector<HTMLDivElement>('[data-lynt-input]');
		if (!el) return;
		el.focus();
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		const selected = range.toString();
		const wrapped = selected
			? `${token}${selected}${token}`
			: `${token}text${token}`;
		document.execCommand('insertText', false, wrapped);
	}

	function insertPrefix(prefix: string) {
		const el = document.querySelector<HTMLDivElement>('[data-lynt-input]');
		if (!el) return;
		el.focus();
		// Insert at start of current line
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		document.execCommand('insertText', false, prefix);
	}

	function handlePaste(event: ClipboardEvent) {
		const items = event.clipboardData?.items;
		if (items && onImagePaste) {
			const imageItems = Array.from(items).filter((i) => i.type.startsWith('image/'));
			if (imageItems.length > 0) {
				event.preventDefault();
				for (const item of imageItems) {
					const file = item.getAsFile();
					if (file) onImagePaste(file);
				}
				return;
			}
		}
		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') || '';
		document.execCommand('insertText', false, text);
	}

	function handleKeydown(event: KeyboardEvent) {
		// Let the mention dropdown consume arrow/Enter/Escape first if it's open.
		if (mentionAutocomplete?.handleKeydown(event)) {
			event.preventDefault();
			return;
		}
		// Cmd/Ctrl+Enter is reserved for "submit" — let it bubble untouched so
		// a wrapping Composer can handle it, instead of inserting a newline.
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			document.execCommand('insertText', false, '\n');
		}
	}
</script>

<div class="div-input-root">
	<!-- Tab bar: Write / Preview -->
	<div class="tab-bar" role="tablist">
		<button
			role="tab"
			aria-selected={mode === 'write'}
			class:active={mode === 'write'}
			onclick={() => (mode = 'write')}
		>
			Write
		</button>
		<button
			role="tab"
			aria-selected={mode === 'preview'}
			class:active={mode === 'preview'}
			onclick={() => (mode = 'preview')}
		>
			Preview
		</button>

		<!-- Inline toolbar (only in write mode) -->
		{#if mode === 'write'}
			<div class="toolbar" role="group" aria-label="Formatting">
				<button type="button" title="Bold (Ctrl+B)" onclick={() => wrapSelection('**')}>
					<strong>B</strong>
				</button>
				<button type="button" title="Italic" onclick={() => wrapSelection('*')}>
					<em>i</em>
				</button>
				<button type="button" title="Inline code" onclick={() => wrapSelection('`')}>
					<code style="font-size:0.8em">{ '`' }</code>
				</button>
				<button type="button" title="Strikethrough" onclick={() => wrapSelection('~~')}>
					<s>S</s>
				</button>
				<button type="button" title="Heading" class="mono" onclick={() => insertPrefix('## ')}>
					H
				</button>
				<button type="button" title="Blockquote" onclick={() => insertPrefix('> ')}>
					❝
				</button>
				<button type="button" title="Subtext" class="mono" onclick={() => insertPrefix('-# ')}>
					-#
				</button>
			</div>
		{/if}
	</div>

	<!-- Write pane -->
	{#if mode === 'write'}
		<div class="relative">
			<div
				data-lynt-input
				bind:this={writeAreaEl}
				contenteditable="true"
				role="textbox"
				spellcheck="true"
				tabindex="0"
				bind:innerText={lynt}
				class="write-area overflow-wrap-anywhere"
				placeholder="What's happening? Markdown supported…"
				onpaste={handlePaste}
				onkeydown={handleKeydown}
				oninput={() => mentionAutocomplete?.handleInput()}
			></div>

			<MentionAutocomplete bind:this={mentionAutocomplete} editableEl={writeAreaEl} />

			<!-- Character ring -->
			<div
				class="char-counter"
				class:opacity-0={characterCount < 200}
				class:opacity-100={characterCount >= 200}
			>
				<svg class="ring" viewBox="0 0 20 20">
					<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"
						class="text-muted-foreground/20"
					/>
					<circle
						cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"
						stroke-linecap="round"
						class:text-red-500={isOverLimit}
						class:text-yellow-500={isNearLimit}
						class:text-muted-foreground={!isNearLimit && !isOverLimit}
						stroke-dasharray={`${Math.min((characterCount / 280) * 50.27, 50.27)} 50.27`}
					/>
				</svg>
				{#if characterCount >= 250}
					<span
						class="font-mono font-semibold tabular-nums"
						class:text-red-500={isOverLimit}
						class:text-yellow-500={isNearLimit}
					>
						{remaining}
					</span>
				{/if}
			</div>
		</div>

	<!-- Preview pane -->
	{:else}
		<div class="preview-pane">
			{#if lynt.trim()}
				<ParsedContent content={lynt} showLinkPreview={false} className="preview-body" />
				{#if previewUrl}
					<LinkPreview url={previewUrl} />
				{/if}
			{:else}
				<span class="empty-hint">Nothing to preview yet…</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* ── Root ── */
	.div-input-root {
		display: flex;
		flex-direction: column;
		gap: 0;
		width: 100%;
	}

	/* ── Tab bar ── */
	.tab-bar {
		display: flex;
		align-items: center;
		gap: 2px;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		padding-bottom: 4px;
		margin-bottom: 8px;
	}
	.tab-bar > button[role="tab"] {
		font-family: 'Work Sans', sans-serif;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 3px 10px;
		border-radius: 5px 5px 0 0;
		background: transparent;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		transition: background 0.12s, color 0.12s;
	}
	.tab-bar > button[role="tab"].active {
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		color: hsl(var(--primary-foreground));
		box-shadow: inset 0 1px 0 rgba(255,240,210,0.5), 0 2px 5px rgba(60,30,0,0.18);
	}
	.tab-bar > button[role="tab"]:not(.active):hover {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--foreground));
	}

	/* ── Toolbar ── */
	.toolbar {
		display: flex;
		gap: 2px;
		margin-left: auto;
	}
	.toolbar button {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		border: var(--ghost-border);
		background: hsl(var(--input));
		box-shadow: var(--inset-shadow);
		cursor: pointer;
		font-size: 0.8rem;
		color: hsl(var(--foreground));
		transition: filter 0.1s;
		line-height: 1;
	}
	.toolbar button:hover {
		filter: brightness(1.08);
		background: hsl(var(--accent));
	}
	.toolbar button.mono {
		font-family: 'Work Sans', sans-serif;
		font-weight: 800;
		font-size: 0.75rem;
	}

	/* ── Write area ── */
	.write-area {
		min-height: 60px;
		width: 100%;
		padding-bottom: 28px;
		outline: none;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'Inter', sans-serif;
		font-size: 1rem;
		line-height: 1.55;
		caret-color: hsl(var(--primary));
	}
	.write-area:empty::before {
		content: attr(placeholder);
		color: hsl(var(--muted-foreground));
		pointer-events: none;
		font-style: italic;
	}

	/* ── Character counter ── */
	.char-counter {
		position: absolute;
		bottom: 4px;
		right: 4px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
		transition: opacity 0.2s;
	}
	.ring {
		height: 20px;
		width: 20px;
		transform: rotate(-90deg);
	}

	/* ── Preview pane ── */
	.preview-pane {
		min-height: 60px;
		padding: 8px 10px;
		background: hsl(var(--muted));
		border-radius: 6px;
		border: var(--ghost-border);
		box-shadow: var(--inset-shadow);
	}
	/* Content styling (headers, lists, tokens, etc.) now comes from
	   ParsedContent.svelte itself — it renders its own scoped markup here,
	   so its :global() rules actually reach these elements. Only the base
	   sizing that ParsedContent doesn't opinionate on lives here. */
	:global(.preview-body) {
		font-size: 1rem;
		line-height: 1.55;
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	.empty-hint {
		font-style: italic;
		color: hsl(var(--muted-foreground));
		font-size: 0.9rem;
	}
</style>
