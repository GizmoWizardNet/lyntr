<script lang="ts">
	import { Textarea } from '@/components/ui/textarea';
	import ParsedContent from '../ParsedContent.svelte';

	interface Props {
		value: string;
		rows?: number;
		placeholder?: string;
		id?: string;
	}

	let { value = $bindable(''), rows = 4, placeholder = '', id = undefined }: Props = $props();

	let mode: 'write' | 'preview' = $state('write');
</script>

<div class="flex flex-col gap-1">
	<div class="flex items-center justify-between">
		<div class="flex gap-1 text-xs">
			<button
				type="button"
				class="rounded px-2 py-0.5 {mode === 'write' ? 'bg-accent font-semibold' : 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (mode = 'write')}
			>
				Write
			</button>
			<button
				type="button"
				class="rounded px-2 py-0.5 {mode === 'preview' ? 'bg-accent font-semibold' : 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (mode = 'preview')}
			>
				Preview
			</button>
		</div>
		<span class="text-xs text-muted-foreground">Markdown supported</span>
	</div>

	{#if mode === 'write'}
		<Textarea {id} bind:value {rows} {placeholder} />
	{:else}
		<div class="min-h-[6rem] rounded-md border border-input bg-muted/30 p-3 text-sm">
			{#if value.trim()}
				<ParsedContent content={value} showLinkPreview={false} />
			{:else}
				<span class="text-muted-foreground">Nothing to preview yet.</span>
			{/if}
		</div>
	{/if}
</div>
