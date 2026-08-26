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
				// quoted strings (single or double)
				out = out.replace(
					/(&#39;|')((?:\\.|[^'\\])*)(\1)|(")((?:\\.|[^"\\])*)(")/g,
					(m) => `<span class="tok-string">${m}</span>`
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
		// keys
		out = out.replace(/(&quot;|")([^"\n]+?)\1(\s*:)/g, (_m, q, k, colon) =>
			`<span class="tok-key">${q}${k}${q}</span>${colon}`
		);
		// string values
		out = out.replace(/(:\s*)"((?:\\.|[^"\\])*)"/g, (_m, pre, v) =>
			`${pre}<span class="tok-string">"${v}"</span>`
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
		out = out.replace(
			/\b(const|let|await|async|function|return|import|from|export|if|else|new)\b/g,
			'<span class="tok-keyword">$1</span>'
		);
		out = out.replace(
			/(&#39;|')((?:\\.|[^'\\])*)(\1)|(")((?:\\.|[^"\\])*)(")/g,
			(m) => `<span class="tok-string">${m}</span>`
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
				out = out.replace(
					/\b(from|import|as|def|class|return|for|in|if|else|elif|with|try|except|None|True|False|and|or|not)\b/g,
					'<span class="tok-keyword">$1</span>'
				);
				out = out.replace(
					/(&#39;|')((?:\\.|[^'\\])*)(\1)|(")((?:\\.|[^"\\])*)(")/g,
					(m) => `<span class="tok-string">${m}</span>`
				);
				out = out.replace(/\b(\d+)\b/g, '<span class="tok-number">$1</span>');
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

<div class="code-block group relative overflow-hidden rounded-lg border">
	{#if label}
		<div class="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
			<span class="text-muted-foreground font-mono text-[11px] uppercase tracking-wide">
				{label}
			</span>
		</div>
	{/if}
	<button
		type="button"
		onclick={copyCode}
		class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
		class:opacity-100={copied}
		aria-label="Copy code"
		style={label ? 'top: 2.25rem;' : ''}
	>
		{#if copied}
			<Check class="h-3.5 w-3.5 text-green-500" />
		{:else}
			<Copy class="h-3.5 w-3.5" />
		{/if}
	</button>
	<pre class="overflow-x-auto px-3 py-2.5 text-xs leading-relaxed"><code>{@html html}</code></pre>
</div>

<style>
	.code-block pre {
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
		background: hsl(var(--muted) / 0.35);
		margin: 0;
	}

	:global(.code-block .tok-method) {
		color: #f97583;
		font-weight: 600;
	}
	:global(.code-block .tok-keyword) {
		color: #c792ea;
		font-weight: 500;
	}
	:global(.code-block .tok-flag) {
		color: #ffcb6b;
	}
	:global(.code-block .tok-string) {
		color: #a5e844;
	}
	:global(.code-block .tok-var) {
		color: #82aaff;
	}
	:global(.code-block .tok-comment) {
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}
	:global(.code-block .tok-key) {
		color: #82aaff;
	}
	:global(.code-block .tok-number) {
		color: #f78c6c;
	}
	:global(.code-block .tok-punct) {
		color: hsl(var(--muted-foreground));
	}
</style>
