<script lang="ts">
	import { Music, Pause, Play } from 'lucide-svelte';
	import { cdnRawUrl } from './stores';

	interface Props {
		type: 'upload' | 'youtube' | null;
		url: string | null;
		title?: string | null;
		volume?: number; // 0-100
		loop?: boolean;
	}

	let { type, url, title = null, volume = 50, loop = true }: Props = $props();

	let playing = $state(false);
	let audioEl: HTMLAudioElement | undefined = $state();
	let ytContainer: HTMLDivElement | undefined = $state();
	let ytPlayer: any = null;

	// ── YouTube IFrame API — loaded once per page, reused across mounts ──
	let ytApiPromise: Promise<any> | null = null;
	function loadYoutubeApi(): Promise<any> {
		if (typeof window === 'undefined') return Promise.resolve(null);
		const w = window as any;
		if (w.YT?.Player) return Promise.resolve(w.YT);
		if (w.__lyntrYtApiPromise) return w.__lyntrYtApiPromise;
		w.__lyntrYtApiPromise = new Promise((resolve) => {
			const prev = w.onYouTubeIframeAPIReady;
			w.onYouTubeIframeAPIReady = () => {
				prev?.();
				resolve(w.YT);
			};
			const tag = document.createElement('script');
			tag.src = 'https://www.youtube.com/iframe_api';
			document.head.appendChild(tag);
		});
		return w.__lyntrYtApiPromise;
	}

	async function setupYoutube(videoId: string) {
		const YT = await loadYoutubeApi();
		if (!YT || !ytContainer) return;

		ytPlayer = new YT.Player(ytContainer, {
			videoId,
			playerVars: {
				autoplay: 1,
				controls: 0,
				disablekb: 1,
				fs: 0,
				modestbranding: 1,
				rel: 0,
				...(loop ? { loop: 1, playlist: videoId } : {})
			},
			events: {
				onReady: (e: any) => {
					e.target.setVolume(volume);
					e.target.playVideo();
				},
				onStateChange: (e: any) => {
					// 1 = playing, 0 = ended, 2 = paused
					if (e.data === 1) playing = true;
					if (e.data === 0 || e.data === 2) playing = false;
				}
			}
		});
	}

	function setupAudio() {
		if (!audioEl) return;
		audioEl.volume = volume / 100;
		audioEl.loop = loop;
		audioEl.play().then(() => (playing = true)).catch(() => (playing = false));
	}

	$effect(() => {
		if (type === 'youtube' && url) {
			setupYoutube(url);
		} else if (type === 'upload' && url) {
			setupAudio();
		}

		return () => {
			// Runs before the next effect run (type/url changed — e.g. the
			// SPA navigated to a different profile without fully
			// unmounting this component) and on final component teardown.
			audioEl?.pause();
			try {
				ytPlayer?.destroy();
			} catch {
				// player may not have finished initializing
			}
			ytPlayer = null;
			playing = false;
		};
	});

	function toggle() {
		if (type === 'upload' && audioEl) {
			if (playing) audioEl.pause();
			else audioEl.play().catch(() => {});
			playing = !playing;
		} else if (type === 'youtube' && ytPlayer) {
			if (playing) ytPlayer.pauseVideo();
			else ytPlayer.playVideo();
		}
	}
</script>

{#if type === 'upload' && url}
	<audio bind:this={audioEl} src={cdnRawUrl(url)} preload="auto"></audio>
{:else if type === 'youtube' && url}
	<!-- Not display:none — some browsers throttle/pause media in
	     display:none elements. Tiny + invisible instead. -->
	<div bind:this={ytContainer} class="yt-hidden" aria-hidden="true"></div>
{/if}

{#if type && url}
	<button type="button" class="song-pill" onclick={toggle} title={playing ? 'Pause profile song' : 'Play profile song'}>
		<Music size={13} />
		<span class="song-title">{title || 'Profile song'}</span>
		{#if playing}<Pause size={12} />{:else}<Play size={12} />{/if}
	</button>
{/if}

<style>
	.yt-hidden {
		position: fixed;
		width: 2px;
		height: 2px;
		top: -10px;
		left: -10px;
		opacity: 0;
		pointer-events: none;
	}

	.song-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 9999px;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		font-size: 11px;
		cursor: pointer;
		max-width: 180px;
	}
	.song-pill:hover {
		background: hsl(var(--accent));
	}
	.song-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
