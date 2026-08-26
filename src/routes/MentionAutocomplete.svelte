<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	/**
	 * MentionAutocomplete.svelte
	 *
	 * Reusable @mention dropdown. Attach to any `contenteditable` element by
	 * calling `handleInput(event)` on its `on:input` and `handleKeydown(event)`
	 * on its `on:keydown` (for arrow-key navigation / Enter-to-select / Escape
	 * to dismiss). The component tracks the caret position via the native
	 * Selection API and renders itself as an absolutely-positioned popover
	 * next to the caret.
	 *
	 * Usage:
	 *   <div contenteditable on:input={mention.handleInput} on:keydown={mention.handleKeydown} />
	 *   <MentionAutocomplete bind:this={mention} editableEl={myDiv} on:select={(e) => ...} />
	 *
	 * Because contenteditable text manipulation varies subtly across browsers,
	 * this component does the insertion itself via document.execCommand
	 * ('insertText'), the same primitive DivInput.svelte already relies on
	 * elsewhere in this codebase — so behaviour stays consistent with the
	 * existing formatting toolbar.
	 */
	import { createEventDispatcher, onDestroy } from 'svelte';
	import UserName from './UserName.svelte';

	interface Props {
		editableEl?: HTMLElement | null;
	}

	let { editableEl = null }: Props = $props();

	const dispatch = createEventDispatcher<{ select: { handle: string } }>();

	type Suggestion = { id: string; handle: string; username: string; verified: boolean; nameColor?: string | null };

	let suggestions: Suggestion[] = $state([]);
	let activeIndex = $state(0);
	let visible = $state(false);
	let loading = $state(false);
	let pos = $state({ top: 0, left: 0 });

	// Tracks the open "@partial" being typed, so we know what to replace
	// when a suggestion is picked.
	let triggerStart = -1; // character offset of the "@" within the element's text
	let query = '';

	let debounceTimer: ReturnType<typeof setTimeout>;
	let abortController: AbortController | null = null;

	function close() {
		visible = false;
		suggestions = [];
		triggerStart = -1;
		query = '';
	}

	// ── Find the @query immediately before the caret, if any ────────────
	// Walks backward from the caret through the current text node looking
	// for an "@" that isn't preceded by a word character (mirrors the
	// MENTION_RE used for rendering/highlighting elsewhere in the app).
	function findActiveTrigger(): { start: number; query: string } | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editableEl) return null;
		const range = sel.getRangeAt(0);
		if (!range.collapsed) return null; // no autocomplete while text is selected

		const node = range.startContainer;
		if (node.nodeType !== Node.TEXT_NODE) return null;

		const textBeforeCaret = (node.textContent ?? '').slice(0, range.startOffset);
		const match = textBeforeCaret.match(/(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{0,32})$/);
		if (!match) return null;

		return { start: range.startOffset - match[0].length, query: match[1] };
	}

	function computeCaretPosition() {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editableEl) return { top: 0, left: 0 };
		const range = sel.getRangeAt(0).cloneRange();
		// Collapse to caret and grab its bounding rect.
		range.collapse(true);
		const rects = range.getClientRects();
		const rect = rects[0] ?? range.startContainer.parentElement?.getBoundingClientRect();
		const parentRect = editableEl.getBoundingClientRect();
		if (!rect) return { top: 0, left: 0 };
		return {
			top: rect.bottom - parentRect.top + 4,
			left: rect.left - parentRect.left
		};
	}

	async function fetchSuggestions(q: string) {
		abortController?.abort();
		abortController = new AbortController();
		loading = true;
		try {
			const res = await fetch(`/api/mentions/search?q=${encodeURIComponent(q)}`, {
				signal: abortController.signal
			});
			if (res.ok) {
				suggestions = await res.json();
				activeIndex = 0;
			} else {
				suggestions = [];
			}
		} catch {
			// aborted or network error — leave suggestions as-is
		} finally {
			loading = false;
		}
	}

	export function handleInput() {
		const trigger = findActiveTrigger();
		if (!trigger) {
			close();
			return;
		}

		triggerStart = trigger.start;
		query = trigger.query;
		visible = true;
		pos = computeCaretPosition();

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => fetchSuggestions(query), 150);
	}

	export function handleKeydown(event: KeyboardEvent): boolean {
		// Returns true if the event was consumed by the dropdown (caller
		// should preventDefault), false otherwise.
		if (!visible || suggestions.length === 0) return false;

		if (event.key === 'ArrowDown') {
			activeIndex = (activeIndex + 1) % suggestions.length;
			return true;
		}
		if (event.key === 'ArrowUp') {
			activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
			return true;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			selectSuggestion(suggestions[activeIndex]);
			return true;
		}
		if (event.key === 'Escape') {
			close();
			return true;
		}
		return false;
	}

	function selectSuggestion(suggestion: Suggestion) {
		if (!editableEl) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		// Replace the open "@query" (from triggerStart to the caret) with
		// "@handle " (trailing space so the user can keep typing naturally).
		const range = sel.getRangeAt(0);
		const node = range.startContainer;
		const replaceRange = document.createRange();
		replaceRange.setStart(node, triggerStart);
		replaceRange.setEnd(node, range.startOffset);

		sel.removeAllRanges();
		sel.addRange(replaceRange);
		document.execCommand('insertText', false, `@${suggestion.handle} `);

		dispatch('select', { handle: suggestion.handle });
		close();
	}

	onDestroy(() => {
		clearTimeout(debounceTimer);
		abortController?.abort();
	});
</script>

{#if visible}
	<div class="mention-dropdown" style="top: {pos.top}px; left: {pos.left}px;">
		{#if loading && suggestions.length === 0}
			<div class="mention-item mention-empty">Searching…</div>
		{:else if suggestions.length === 0}
			<div class="mention-item mention-empty">No matching users</div>
		{:else}
			{#each suggestions as suggestion, i (suggestion.id)}
				<button
					type="button"
					class="mention-item"
					class:active={i === activeIndex}
					onmousedown={preventDefault(() => selectSuggestion(suggestion))}
					onmouseenter={() => (activeIndex = i)}
				>
					<span class="mention-handle">@{suggestion.handle}</span>
					<span class="mention-username"><UserName name={suggestion.username} color={suggestion.nameColor} verified={suggestion.verified} /></span>
					{#if suggestion.verified}
						<span class="mention-verified" title="Verified">✓</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
{/if}

<style>
	.mention-dropdown {
		position: absolute;
		z-index: 50;
		min-width: 200px;
		max-width: 280px;
		max-height: 220px;
		overflow-y: auto;
		background: hsl(var(--popover, var(--background)));
		border: var(--ghost-border, 1px solid hsl(var(--border)));
		border-radius: 8px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
		padding: 4px;
	}

	.mention-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		border-radius: 5px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
	}
	.mention-item.active,
	.mention-item:hover {
		background: hsl(var(--accent, var(--muted)));
	}
	.mention-empty {
		color: hsl(var(--muted-foreground));
		cursor: default;
		font-style: italic;
		font-size: 0.825rem;
	}

	.mention-handle {
		font-weight: 700;
		color: #4fa8e8;
	}
	.mention-username {
		color: hsl(var(--muted-foreground));
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mention-verified {
		margin-left: auto;
		color: hsl(var(--primary));
		font-size: 0.75rem;
	}
</style>
