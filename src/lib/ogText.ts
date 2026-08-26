/**
 * Strips Lyntr's markdown syntax (see src/lib/markdown.ts) down to plain
 * text for use in og:description / meta description — link-preview
 * unfurlers show raw text, not rendered HTML, and shouldn't see `**`,
 * `~~`, `#`, table pipes, etc.
 *
 * $SYMBOL and @mention tokens are the exception: ParsedContent.svelte
 * treats those as first-class content (they render as chips/embeds), so
 * they're stashed before anything else runs and restored verbatim at the
 * end — same trade-off markdown.ts itself makes.
 */

// Kept in sync with the regexes in ParsedContent.svelte.
const MENTION_RE = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{1,32})(?![A-Za-z0-9_])/g;
const SYMBOL_RE = /\$([A-Z][A-Z0-9]{1,9})(?=[^A-Za-z0-9]|$)/g;

export function stripMarkdownForOg(raw: string | null | undefined): string {
	if (!raw) return '';

	let text = raw;

	// Stash tokens that must survive untouched.
	const stash: string[] = [];
	const save = (s: string) => {
		stash.push(s);
		return `\u0000OG${stash.length - 1}\u0000`;
	};
	text = text.replace(SYMBOL_RE, (m) => save(m));
	text = text.replace(MENTION_RE, (m) => save(m));

	// Fenced code blocks -> their contents only
	text = text.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, (_, code) => code.trim());
	// Inline code
	text = text.replace(/`([^`\n]+)`/g, '$1');
	// Images ![alt](url) -> alt text (or dropped if empty)
	text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
	// Links [text](url) -> text
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
	// Bold / italic / bold-italic / strikethrough
	text = text
		.replace(/\*{3}(.+?)\*{3}/g, '$1')
		.replace(/\*{2}(.+?)\*{2}/g, '$1')
		.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1$2')
		.replace(/~~(.+?)~~/g, '$1');
	// ATX headers
	text = text.replace(/^#{1,4}\s+/gm, '');
	// Blockquote markers
	text = text.replace(/^>\s?/gm, '');
	// Horizontal rules
	text = text.replace(/^(-{3,}|\*{3,}|_{3,})\s*$/gm, '');
	// List markers (bullet / ordered / task checkboxes)
	text = text.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, '');
	text = text.replace(/\[( |x|X)\]\s+/g, '');
	// Table pipes -> spaces
	text = text.replace(/\|/g, ' ');
	// Backslash-escaped characters -> literal
	text = text.replace(/\\([\\`*_{}\[\]()#+\-.!~>|])/g, '$1');

	// Restore stashed $SYMBOL / @mention tokens
	text = text.replace(/\u0000OG(\d+)\u0000/g, (_, i) => stash[Number(i)]);

	// Collapse newlines/whitespace into a single line
	text = text
		.replace(/\r?\n+/g, ' ')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();

	return text;
}
