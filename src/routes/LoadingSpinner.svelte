<script lang="ts">
	interface Props {
		size?: number; // gif width in px, full-screen mode only
		occupy_screen?: boolean;
	}

	let { size = 48, occupy_screen = true }: Props = $props();

	// Full-page loads (occupy_screen, the default) get the GIF+sound
	// treatment. Small in-content loaders (occupy_screen={false} — forum
	// lists, leaderboard, comments, etc.) get a silent GIF instead: those
	// can appear several at once while the rest of the page is already
	// usable, and stacking looping loading.mp3s on top of each other
	// would be obnoxious rather than fun.
	let audioEl: HTMLAudioElement | undefined = $state();

	$effect(() => {
		if (occupy_screen && audioEl) {
			audioEl.currentTime = 0;
			// Autoplay can be blocked before any user gesture on the page —
			// that's fine, the GIF still plays either way, just silently.
			audioEl.play().catch(() => {});
		}
	});
</script>

{#if occupy_screen}
	<div class="loader-wrap full-screen">
		<img src="/loading.gif" alt="Loading" class="loading-gif" style="width: {size * 2.5}px;" />
		<audio bind:this={audioEl} src="/loading.mp3" loop preload="auto"></audio>
	</div>
{:else}
	<div class="loader-wrap inline">
		<img src="/loading2.gif" alt="Loading" class="loading-gif" style="width: {size * 2}px;" />
	</div>
{/if}

<style>
	.loader-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.loader-wrap.full-screen {
		height: 100dvh;
	}
	.loader-wrap.inline {
		height: 100%;
		padding: 2rem 0;
	}

	.loading-gif {
		height: auto;
		object-fit: contain;
	}
</style>
