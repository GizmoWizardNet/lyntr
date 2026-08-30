<script lang="ts">
	import { Copy, Check } from 'lucide-svelte';

	interface Props {
		code: string;
		lang?: 'bash' | 'json' | 'ts' | 'python';
		label?: string;
	}

	let { code, lang = 'bash', label = undefined }: Props = $props();

	let copied = $state(false);

	function esc(s: string) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// Small hand-rolled tokenizer — no shiki/prism dependency needed for
	// examples this short, and it keeps the doc bundle tiny.
	function highlightBash(src: string) {
		const lines = src.split('\n');
		return lines
			.map((line) => {
				// Whole-line comment
				if (/^\s*#/.test(line)) {
					return `<span class="tok-comment">${esc(line)}</span>`;
				}
				let out = esc(line);
				// colour strings as the first thing, to avoid broken html
				// caused by trying to highlight attributes
				out = out.replace(
					/(&#39;|')((?:\\.|[^'\\])*)(\1)|(")((?:\\.|[^"\\])*)(")/g,
					(m) => `<span class="tok-string">${m}</span>`
				);
				// HTTP methods
				out = out.replace(
					/\b(GET|POST|PUT|PATCH|DELETE)\b/g,
					'<span class="tok-method">$1</span>'
				);
				// curl / command name at line start
				out = out.replace(/^(\s*)(curl)\b/, '$1<span class="tok-keyword">$2</span>');
				// flags like -X, -H, -d, --data
				out = out.replace(
					/(\s)(--?[A-Za-z][A-Za-z-]*)/g,
					'$1<span class="tok-flag">$2</span>'
				);
				// env-style variables
				out = out.replace(
					/(\$[A-Z_][A-Z0-9_]*)/g,
					'<span class="tok-var">$1</span>'
				);
				return out;
			})
			.join('\n');
	}

	function highlightJson(src: string) {
		let out = esc(src);
		// colour strings as the first thing, to avoid broken html
		// caused by trying to highlight attributes
		out = out.replace(/(:\s*)"((?:\\.|[^"\\])*)"/g, (_m, pre, v) =>
			`${pre}<span class="tok-string">"${v}"</span>`
		);
		// keys
		out = out.replace(/(&quot;|")([^"\n]+?)\1(\s*:)/g, (_m, q, k, colon) =>
			`<span class="tok-key">${q}${k}${q}</span>${colon}`
		);
		// numbers
		out = out.replace(/:\s*(-?\d+(\.\d+)?)/g, (m, n) =>
			m.replace(n, `<span class="tok-number">${n}</span>`)
		);
		// booleans / null
		out = out.replace(
			/\b(true|false|null)\b/g,
			'<span class="tok-keyword">$1</span>'
		);
		// punctuation
		out = out.replace(/([{}[\],])/g, '<span class="tok-punct">$1</span>');
		return out;
	}

	function highlightTs(src: string) {
		let out = esc(src);
		// colour strings as the first thing, to avoid broken html
		// caused by trying to highlight attributes
		out = out.replace(
			/(&#39;|')((?:\\.|[^'\\])*)(\1)|(")((?:\\.|[^"\\])*)(")/g,
			(m) => `<span class="tok-string">${m}</span>`
		);
		out = out.replace(
			/\b(const|let|await|async|function|return|import|from|export|if|else|new)\b/g,
			'<span class="tok-keyword">$1</span>'
		);
		out = out.replace(/(\/\/.*)$/gm, '<span class="tok-comment">$1</span>');
		return out;
	}

	function highlightPython(src: string) {
		const lines = src.split('\n');
		return lines
			.map((line) => {
				if (/^\s*#/.test(line)) {
					return `<span class="tok-comment">${esc(line)}</span>`;
				}
				let out = esc(line);
				// colour strings as the first thing, to avoid broken html
				// caused by trying to highlight attributes
				out = out.replace(
					/(&#39;|')((?:\\.|[^'\\])*)(\1)|(")((?:\\.|[^"\\])*)(")/g,
					(m) => `<span class="tok-string">${m}</span>`
				);
				out = out.replace(
				    // class also needs to be removed, as it appears in the span
					/\b(from|import|as|def|return|for|in|if|else|elif|with|try|except|None|True|False|and|or|not|print)\b/g,
					`<span class="tok-keyword">$1</span>`
				);
				out = out.replace(/\b(\d+)\b/g, `<span class="tok-number">$1</span>`);
				return out;
			})
			.join('\n');
	}

	function render(src: string, l: string) {
		if (l === 'json') return highlightJson(src);
		if (l === 'ts') return highlightTs(src);
		if (l === 'python') return highlightPython(src);
		return highlightBash(src);
	}

	let html = $derived(render(code.trim(), lang));

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code.trim());
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable — silently ignore */
		}
	}
</script>

<div class="code-block group relative overflow-hidden">
	<div class="code-block-titlebar">
		<span class="titlebar-dots">
			<span></span><span></span><span></span>
		</span>
		{#if label}
			<span class="titlebar-label">{label}</span>
		{/if}
	</div>
	<button
		type="button"
		onclick={copyCode}
		class="copy-btn"
		class:copied
		aria-label="Copy code"
	>
		{#if copied}
			<Check class="h-3.5 w-3.5" />
		{:else}
			<Copy class="h-3.5 w-3.5" />
		{/if}
	</button>
	<pre class="overflow-x-auto px-3 py-2.5 text-xs leading-relaxed"><code>{@html html}</code></pre>
</div>

<style>
	/* Retro "terminal window" chrome — bevel frame + gradient titlebar
	   (same --header-bg/--bevel-* tokens as the rest of the site) instead
	   of a plain flat rounded-lg border, so this reads as another chunky
	   physical panel rather than a generic modern code snippet widget. */
	.code-block {
		border-radius: var(--radius-sm);
		border-top: 1.5px solid var(--bevel-light);
		border-left: 1.5px solid var(--bevel-light);
		border-bottom: 1.5px solid var(--bevel-dark);
		border-right: 1.5px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	.code-block-titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		background: var(--header-bg);
		border-bottom: 1px solid var(--bevel-dark);
	}

	.titlebar-dots {
		display: inline-flex;
		gap: 4px;
	}
	.titlebar-dots span {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: hsl(var(--muted-foreground) / 0.4);
	}

	.titlebar-label {
		font-family: var(--font-retro);
		color: hsl(var(--muted-foreground));
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.copy-btn {
		position: absolute;
		right: 6px;
		top: 5px;
		z-index: 10;
		display: flex;
		height: 22px;
		width: 22px;
		align-items: center;
		justify-content: center;
		border-radius: 5px;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		background: hsl(var(--background) / 0.6);
		color: hsl(var(--muted-foreground));
		opacity: 0;
		transition: opacity 0.12s ease, color 0.12s ease;
	}
	.copy-btn:hover {
		color: hsl(var(--foreground));
	}
	.code-block:hover .copy-btn,
	.copy-btn.copied {
		opacity: 1;
	}

	.code-block pre {
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
		background: hsl(var(--muted) / 0.35);
		margin: 0;
	}

	/* Aged accent palette (see app.css --accent-*) instead of a neon
	   VSCode-dark-theme syntax scheme — the old palette's saturated pinks/
	   purples/greens read as a modern editor theme dropped into an
	   otherwise sepia/bevel page. */
	:global(.code-block .tok-method) {
		color: hsl(var(--accent-rose));
		font-weight: 600;
	}
	:global(.code-block .tok-keyword) {
		color: hsl(var(--accent-violet));
		font-weight: 500;
	}
	:global(.code-block .tok-flag) {
		color: hsl(var(--accent-amber));
	}
	:global(.code-block .tok-string) {
		color: hsl(var(--accent-green));
	}
	:global(.code-block .tok-var) {
		color: hsl(var(--accent-blue));
	}
	:global(.code-block .tok-comment) {
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}
	:global(.code-block .tok-key) {
		color: hsl(var(--accent-blue));
	}
	:global(.code-block .tok-number) {
		color: hsl(var(--accent-amber));
	}
	:global(.code-block .tok-punct) {
		color: hsl(var(--muted-foreground));
	}
</style>