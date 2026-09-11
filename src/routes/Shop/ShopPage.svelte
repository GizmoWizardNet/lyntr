<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { ShoppingBag, Check, Sparkles } from 'lucide-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { Button } from '@/components/ui/button';
	import type { LyntskinDef } from '$lib/lyntskins';
	import { celebrateLyntskinPurchase } from '$lib/lyntskinCelebration';

	interface ShopSkin extends LyntskinDef {
		owned: boolean;
	}

	let skins: ShopSkin[] = $state([]);
	let balance = $state(0);
	let loading = $state(true);
	let purchasingKey: string | null = $state(null);

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/shop/lyntskins');
			if (res.ok) {
				const data = await res.json();
				skins = data.skins ?? [];
				balance = data.balance ?? 0;
			} else {
				toast.error('Failed to load the shop.');
			}
		} catch {
			toast.error('Failed to load the shop.');
		} finally {
			loading = false;
		}
	}

	async function purchase(skin: ShopSkin) {
		if (skin.owned || purchasingKey) return;
		if (balance < skin.price) {
			toast.error("You don't have enough Community XP for this yet.");
			return;
		}
		purchasingKey = skin.key;
		try {
			const res = await fetch('/api/shop/lyntskins/purchase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: skin.key })
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error ?? 'Purchase failed.');
				return;
			}
			balance -= skin.price;
			skins = skins.map((s) => (s.key === skin.key ? { ...s, owned: true } : s));
			toast.success(`${skin.name} unlocked! Apply it next time you make a lynt.`);
			celebrateLyntskinPurchase();
		} catch {
			toast.error('Purchase failed.');
		} finally {
			purchasingKey = null;
		}
	}

	onMount(load);
</script>

<div class="flex h-full w-full flex-col gap-3 px-1 py-2">
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<ShoppingBag size={26} class="text-primary" />
			<h2 class="text-2xl font-bold">Shop</h2>
		</div>
		<span class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-bold text-primary">
			<img src="/gem_badge.png" alt="Community XP" class="h-5 w-5 flex-shrink-0" />
			{balance.toLocaleString()} XP
		</span>
	</div>
	<p class="text-sm text-muted-foreground">
		Lyntskins are animated backgrounds for your lynts — buy once, use forever, on as many lynts as you want. They
		stay hidden until someone hovers a lynt, then faintly loop behind it.
	</p>

	{#if loading}
		<LoadingSpinner occupy_screen={false} />
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each skins as skin (skin.key)}
				<div class="shop-card flex flex-col overflow-hidden rounded-lg border border-border">
					<div class="relative aspect-video w-full overflow-hidden bg-black/20">
						<img src={skin.file} alt={skin.name} class="h-full w-full object-cover" loading="lazy" />
						{#if skin.owned}
							<div class="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground">
								<Check size={14} />
							</div>
						{/if}
					</div>
					<div class="flex flex-1 flex-col gap-2 p-2.5">
						<div class="flex items-center justify-between gap-1">
							<span class="text-sm font-bold text-primary">{skin.name}</span>
						</div>
						<span class="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground">
							<Sparkles size={12} />
							{skin.price.toLocaleString()} XP
						</span>
						<Button
							size="sm"
							variant={skin.owned ? 'secondary' : 'default'}
							disabled={skin.owned || purchasingKey === skin.key || balance < skin.price}
							onclick={() => purchase(skin)}
							class="mt-auto w-full"
						>
							{#if skin.owned}
								Owned
							{:else if purchasingKey === skin.key}
								Buying...
							{:else if balance < skin.price}
								Not enough XP
							{:else}
								Buy
							{/if}
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.shop-card {
		background: hsl(var(--lynt-focus));
		box-shadow: var(--inset-shadow);
	}
</style>