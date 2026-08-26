<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { cdnUrl } from './stores';

	interface Contributor {
		userId: string;
		username: string;
		handle: string;
	}

	interface Props {
		contributors: Contributor[];
		size?: number;
	}

	let { contributors, size = 10 }: Props = $props();
</script>

<!-- Same stacked-corners treatment DMPage.svelte uses for group DM icons —
     up to 3 avatars shown, front-most one on top. Kept as its own
     component since both places need the identical look. -->
<div class="clan-avatar-stack" style="--stack-size: {size * 4}px;">
	{#each contributors.slice(0, 3) as c, i (c.userId)}
		<div class="stack-item" style="z-index: {3 - i}">
			<Avatar size={contributors.length > 1 ? size * 0.7 : size} src={cdnUrl(c.userId, 'small')} alt={c.username} userId={c.userId} showPresence={false} />
		</div>
	{/each}
</div>

<style>
	.clan-avatar-stack {
		display: flex;
		width: var(--stack-size);
		height: var(--stack-size);
		position: relative;
		flex-shrink: 0;
	}
	.stack-item {
		position: absolute;
	}
	.stack-item:nth-child(1) { top: 0; left: 0; }
	.stack-item:nth-child(2) { bottom: 0; right: 0; }
	.stack-item:nth-child(3) { top: 22%; left: 30%; }
</style>
