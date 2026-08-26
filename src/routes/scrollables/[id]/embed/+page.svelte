<script lang="ts">
	import { scrollableCdnRawUrl } from '../../../stores';

	let { data } = $props();
</script>

<svelte:head>
	<!-- No site chrome, no OG tags here on purpose — this page only ever
	     renders inside another platform's iframe, never visited directly. -->
	<title>Lyntr</title>
</svelte:head>

{#if data.scrollable}
	<video
		src={scrollableCdnRawUrl(`${data.scrollable.videoKey}.mp4`)}
		poster={data.scrollable.thumbnailKey ? scrollableCdnRawUrl(`${data.scrollable.thumbnailKey}.webp`) : undefined}
		controls
		playsinline
		autoplay
		muted
		loop
	></video>
{/if}

<style>
	:global(html, body) {
		margin: 0;
		background: #000;
		height: 100%;
		overflow: hidden;
	}

	video {
		width: 100vw;
		height: 100vh;
		object-fit: contain;
		display: block;
	}
</style>
