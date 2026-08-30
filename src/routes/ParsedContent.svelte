<script lang="ts">
	import { stopPropagation } from 'svelte/legacy';

	import * as HoverCard from '@/components/ui/hover-card/index.js';
	import RugplayEmbed from './RugplayEmbed.svelte';
	import LinkPreview from './LinkPreview.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { goto } from '$app/navigation';
	import { currentPage, pendingSearchQuery } from './stores';

	
	interface Props {
		content: string;
		className?: string;
		// Set to false in the composer preview to avoid OG fetches while typing
		showLinkPreview?: boolean;
		// Handle of whoever wrote this content — drives whose Rugplay API
		// key (if any) is used for $SYMBOL embeds.
		authorHandle?: string;
		// False on the logged-out landing feed: @mentions and #hashtags
		// render with the same styling but don't navigate anywhere, since
		// there's no authenticated app/search page to send a visitor to.
		interactive?: boolean;
	}

	let { content, className = '', showLinkPreview = true, authorHandle = undefined, interactive = true }: Props = $props();

	type Segment =
		| { type: 'html'; value: string }
		| { type: 'symbol'; value: string }
		| { type: 'mention'; value: string }
		| { type: 'hashtag'; value: string };

	// Same handle shape used by the autocomplete endpoint and server-side
	// extraction in src/lib/server/mentions.ts: letters, digits, underscore,
	// 1-32 chars. Must not be glued to a preceding word character (so it
	// doesn't match the "domain" in "email@domain.com").
	// Trade-off: underscore is included in the blocking set, which means
	// "_@bob_" (markdown italics wrapping a mention) won't be detected as
	// a mention — a deliberately conservative choice since the alternative
	// (treating leading "_" as an emphasis delimiter rather than a literal
	// character) risks false positives on real usernames/emails containing
	// underscores. Plain, parenthesized, and bold-wrapped mentions all work.
	const MENTION_RE = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{1,32})(?![A-Za-z0-9_])/g;
	const SYMBOL_RE = /\$([A-Z][A-Z0-9]{1,9})(?=[^A-Za-z0-9]|$)/g;
	// Kept in sync with src/lib/server/hashtags.ts's HASHTAG_REGEX.
	const HASHTAG_RE = /(?<![A-Za-z0-9_#])#([A-Za-z][A-Za-z0-9_]{0,49})(?![A-Za-z0-9_])/g;

	// Placeholders are injected into the RAW text BEFORE markdown rendering,
	// then split back out of the rendered HTML afterwards. Extracting tokens
	// pre-render (rather than regexing the rendered HTML directly) means a
	// mention or symbol that happens to land inside a markdown-generated
	// <a href="..."> can never be misparsed as a second, nested clickable
	// token — the placeholder is opaque to both the markdown renderer and
	// its auto-linker.
	const PLACEHOLDER_PREFIX = '\u0000TOK';
	const PLACEHOLDER_SUFFIX = '\u0000';

	// URLs are masked FIRST, separately, so an "@" or "$" living inside a
	// query string or link target (e.g. "https://x.com?user=@bob") is never
	// extracted as a token in the first place — not just visually avoided,
	// but never even matched. Without this, the token's placeholder would
	// get woven into the URL text, and the auto-linker would carry it into
	// the middle of an href attribute, producing broken/nested markup.
	const URL_GUARD_PREFIX = '\u0000URLGUARD';
	const URL_GUARD_SUFFIX = '\u0000';
	const URL_RE = /(\[[^\]]+\]\()?(https?:\/\/[^\s<>")\]]+)(\))?/g;

	function parse(rawText: string): Segment[] {
		const text = rawText ?? '';

		type Token = { type: 'symbol' | 'mention' | 'hashtag'; value: string };
		const tokens: Token[] = [];
		const urlGuards: string[] = [];

		// Step 1: mask URLs (including markdown [label](url) targets).
		const masked = text.replace(URL_RE, (full) => {
			urlGuards.push(full);
			return `${URL_GUARD_PREFIX}${urlGuards.length - 1}${URL_GUARD_SUFFIX}`;
		});

		// Step 2: extract real mention/symbol/hashtag tokens from what's left.
		const withPlaceholders = masked
			.replace(SYMBOL_RE, (_match, sym) => {
				tokens.push({ type: 'symbol', value: sym });
				return `${PLACEHOLDER_PREFIX}${tokens.length - 1}${PLACEHOLDER_SUFFIX}`;
			})
			.replace(MENTION_RE, (_match, handle) => {
				tokens.push({ type: 'mention', value: handle });
				return `${PLACEHOLDER_PREFIX}${tokens.length - 1}${PLACEHOLDER_SUFFIX}`;
			})
			.replace(HASHTAG_RE, (_match, tag) => {
				tokens.push({ type: 'hashtag', value: tag.toLowerCase() });
				return `${PLACEHOLDER_PREFIX}${tokens.length - 1}${PLACEHOLDER_SUFFIX}`;
			});

		// Step 3: restore URLs (untouched, original @ / $ chars intact) so
		// renderMarkdown's auto-linker still sees and wraps real URLs.
		const urlGuardRe = new RegExp(`${URL_GUARD_PREFIX}(\\d+)${URL_GUARD_SUFFIX}`, 'g');
		const restored = withPlaceholders.replace(urlGuardRe, (_m, idx) => urlGuards[Number(idx)]);

		const html = renderMarkdown(restored);

		// Step 4: split the rendered HTML back apart on mention/symbol placeholders.
		const placeholderRe = new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g');
		const segments: Segment[] = [];
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = placeholderRe.exec(html)) !== null) {
			if (m.index > last) segments.push({ type: 'html', value: html.slice(last, m.index) });
			segments.push(tokens[Number(m[1])]);
			last = m.index + m[0].length;
		}
		if (last < html.length) segments.push({ type: 'html', value: html.slice(last) });
		return segments;
	}

	// Extract first bare URL from raw content (skip markdown [text](url) links)
	function extractFirstUrl(text: string): string | null {
		const stripped = (text ?? '').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '[$1](...)');
		const m = stripped.match(/https?:\/\/[^\s<>"')]+/);
		return m ? m[0].replace(/[.,!?;:]+$/, '') : null;
	}

	function goToProfile(handle: string) {
		goto(`/@${handle}`);
	}

	function goToHashtagSearch(tag: string) {
		pendingSearchQuery.set(`#${tag}`);
		currentPage.set('search');
	}

	let segments = $derived(parse(content ?? ''));
	let firstUrl = $derived(showLinkPreview ? extractFirstUrl(content ?? '') : null);
</script>

<div class="parsed-content {className}">
	{#each segments as seg, i (i)}
		{#if seg.type === 'html'}
			{@html seg.value}
		{:else if seg.type === 'symbol'}
			<HoverCard.Root openDelay={150} closeDelay={100}>
				<HoverCard.Trigger asChild >
					{#snippet children({ builder })}
												<button {...builder} use:builder.action class="symbol-token">
							${seg.value}
						</button>
																{/snippet}
										</HoverCard.Trigger>
				<HoverCard.Content class="p-0 shadow-xl" side="top" align="start" sideOffset={6}>
					<RugplayEmbed symbol={seg.value} {authorHandle} />
				</HoverCard.Content>
			</HoverCard.Root>
		{:else if seg.type === 'mention'}
			{#if interactive}
				<button
					type="button"
					class="mention-token"
					onclick={stopPropagation(() => goToProfile(seg.value))}
				>
					@{seg.value}
				</button>
			{:else}
				<span class="mention-token" style="cursor: default; text-decoration: none;">@{seg.value}</span>
			{/if}
		{:else}
			{#if interactive}
				<button
					type="button"
					class="hashtag-token"
					onclick={stopPropagation(() => goToHashtagSearch(seg.value))}
				>
					#{seg.value}
				</button>
			{:else}
				<span class="hashtag-token" style="cursor: default; text-decoration: none;">#{seg.value}</span>
			{/if}
		{/if}
	{/each}

	{#if firstUrl}
		<LinkPreview url={firstUrl} />
	{/if}
</div>

<style>
	.parsed-content {
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	/* ── Markdown element styles ── */
	.parsed-content :global(p) {
		margin: 0 0 0.25em 0;
		line-height: 1.55;
	}
	.parsed-content :global(br) {
		display: block;
		content: '';
		margin-top: 0.4em;
	}
	.parsed-content :global(h1),
	.parsed-content :global(h2),
	.parsed-content :global(h3),
	.parsed-content :global(h4) {
		font-family: 'Work Sans', sans-serif;
		font-weight: 700;
		line-height: 1.2;
		margin: 0.5em 0 0.2em;
		text-shadow: 1px 1px 2px rgba(60, 30, 0, 0.08);
	}
	.parsed-content :global(h1) { font-size: 1.35em; }
	.parsed-content :global(h2) { font-size: 1.2em; }
	.parsed-content :global(h3) { font-size: 1.08em; }
	.parsed-content :global(h4) { font-size: 1em; }

	.parsed-content :global(strong) { font-weight: 700; }
	.parsed-content :global(em)     { font-style: italic; }
	.parsed-content :global(s)      { opacity: 0.6; }

	/* -# subtext/subscript lines — smaller, muted, sits slightly below the
	   baseline of a normal line to read as a subscript-style aside. */
	.parsed-content :global(p.lynt-subtext) {
		font-size: 0.78em;
		line-height: 1.4;
		margin: 0.15em 0;
		color: hsl(var(--muted-foreground));
		vertical-align: sub;
	}

	.parsed-content :global(code) {
		font-family: 'Fira Mono', 'Consolas', monospace;
		font-size: 0.875em;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 3px;
		padding: 1px 5px;
		box-shadow: inset 0 1px 2px rgba(0,0,0,0.08);
	}
	.parsed-content :global(pre) {
		background: hsl(var(--muted));
		border: var(--ghost-border);
		border-radius: 6px;
		padding: 10px 14px;
		box-shadow: var(--inset-shadow);
		overflow-x: auto;
		margin: 0.5em 0;
		position: relative;
	}
	.parsed-content :global(pre[data-lang]::before) {
		content: attr(data-lang);
		position: absolute;
		top: 5px;
		right: 10px;
		font-size: 0.7em;
		font-weight: 700;
		opacity: 0.45;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.parsed-content :global(pre code) {
		background: none;
		border: none;
		padding: 0;
		box-shadow: none;
		font-size: 0.85em;
	}

	.parsed-content :global(blockquote) {
		border-left: 3px solid hsl(var(--primary));
		margin: 0.5em 0;
		padding: 4px 12px;
		background: hsl(var(--background));
		box-shadow: var(--inset-shadow);
		border-radius: 0 4px 4px 0;
		opacity: 0.85;
		font-style: italic;
	}

	.parsed-content :global(hr) {
		border: none;
		height: 1px;
		background: linear-gradient(
			to right,
			transparent,
			hsl(var(--border) / 0.8) 20%,
			hsl(var(--border) / 0.8) 80%,
			transparent
		);
		margin: 0.6em 0;
	}

	.parsed-content :global(a) {
		color: hsl(var(--primary));
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-style: dotted;
	}
	.parsed-content :global(a:hover) {
		text-decoration-style: solid;
	}

	/* ── Lists ── */
	.parsed-content :global(ul),
	.parsed-content :global(ol) {
		margin: 0.3em 0 0.5em;
		padding-left: 1.4em;
	}
	.parsed-content :global(ul) { list-style-type: disc; }
	.parsed-content :global(ul ul) { list-style-type: circle; }
	.parsed-content :global(ol) { list-style-type: decimal; }
	.parsed-content :global(li) {
		margin: 0.15em 0;
		line-height: 1.5;
	}

	/* ── Task list checkboxes ── */
	.parsed-content :global(li > .task-item) {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4em;
		list-style: none;
	}
	.parsed-content :global(.task-item input[type='checkbox']) {
		margin: 0;
		accent-color: hsl(var(--primary));
	}
	.parsed-content :global(.task-item .done) {
		opacity: 0.6;
		text-decoration: line-through;
	}

	/* ── Tables ── */
	.parsed-content :global(table) {
		border-collapse: collapse;
		margin: 0.5em 0;
		font-size: 0.92em;
		display: block;
		overflow-x: auto;
		max-width: 100%;
	}
	.parsed-content :global(th),
	.parsed-content :global(td) {
		border: 1px solid hsl(var(--border));
		padding: 4px 10px;
	}
	.parsed-content :global(th) {
		background: hsl(var(--muted));
		font-weight: 700;
	}

	/* $SYMBOL token */
	.symbol-token {
		display: inline;
		font-weight: 700;
		color: #1D9E75;
		background: transparent;
		border: none;
		padding: 0 1px;
		cursor: pointer;
		font-size: inherit;
		font-family: inherit;
		border-radius: 3px;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
		transition: background 0.12s;
	}
	.symbol-token:hover {
		background: #1D9E7518;
	}

	/* @mention token — same treatment as symbol-token, light blue instead */
	.mention-token {
		display: inline;
		font-weight: 700;
		color: #4FA8E8;
		background: transparent;
		border: none;
		padding: 0 1px;
		cursor: pointer;
		font-size: inherit;
		font-family: inherit;
		border-radius: 3px;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
		transition: background 0.12s;
	}
	.mention-token:hover {
		background: #4FA8E818;
	}

	.hashtag-token {
		display: inline;
		font-weight: 700;
		color: #6FD6A8;
		background: transparent;
		border: none;
		padding: 0 1px;
		cursor: pointer;
		font-size: inherit;
		font-family: inherit;
		border-radius: 3px;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
		transition: background 0.12s;
	}
	.hashtag-token:hover {
		background: #6FD6A818;
	}
</style>
