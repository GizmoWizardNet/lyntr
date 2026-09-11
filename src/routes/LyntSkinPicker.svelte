<script lang="ts">
	import { onMount } from 'svelte';
	import { ImageIcon, X } from 'lucide-svelte';
	import type { LyntskinDef } from '$lib/lyntskins';

	interface Props {
		selected?: string | null;
	}

	let { selected = $bindable(null) }: Props = $props();

	let owned: LyntskinDef[] = $state([]);
	let loaded = $state(false);

	onMount(async () => {
		try {
			const res = await fetch('/api/shop/lyntskins');
			if (res.ok) {
				const data = await res.json();
				owned = (data.skins ?? []).filter((s: any) => s.owned);
			}
		} catch {
		} finally {
			loaded = true;
		}
	});
</script>

{#if loaded && owned.length > 0}
	<div class="flex flex-col gap-1.5">
		<span class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
			<ImageIcon size={13} />
			Lyntskin {selected ? '' : '(optional)'}
		</span>
		<div class="flex flex-wrap gap-1.5">
			<button
				type="button"
				onclick={() => (selected = null)}
				class="skin-swatch flex h-10 w-10 items-center justify-center rounded-md border text-xs font-bold {!selected
					? 'border-primary ring-2 ring-primary/40'
					: 'border-border text-muted-foreground'}"
				title="No lyntskin"
			>
				<X size={16} />
			</button>
			{#each owned as skin (skin.key)}
				<button
					type="button"
					onclick={() => (selected = skin.key)}
					class="skin-swatch h-10 w-10 overflow-hidden rounded-md border {selected === skin.key
						? 'border-primary ring-2 ring-primary/40'
						: 'border-border'}"
					title={skin.name}
				>
					<img src={skin.file} alt={skin.name} class="h-full w-full object-cover" />
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.skin-swatch {
		flex-shrink: 0;
		transition: transform 0.1s ease;
	}
	.skin-swatch:hover {
		transform: scale(1.05);
	}
</style>