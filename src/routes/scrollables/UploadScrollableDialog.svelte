<script lang="ts">
	import * as Dialog from '@/components/ui/dialog';
	import { Button } from '@/components/ui/button';
	import { Input } from '@/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Upload } from 'lucide-svelte';

	const MAX_DURATION = 180; // 3 min
	const MAX_SIZE = 300 * 1024 * 1024; // 300MB

	interface Props {
		open: boolean;
		onUploaded: (scrollable: any) => void;
	}

	let { open = $bindable(false), onUploaded }: Props = $props();

	let file = $state<File | null>(null);
	let caption = $state('');
	let previewUrl = $state<string | null>(null);
	let durationSeconds = $state<number | null>(null);
	let uploading = $state(false);
	let uploadPct = $state(0);

	function pickFile(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (!f) return;

		if (!f.type.startsWith('video/')) {
			toast.error('Please choose a video file.');
			return;
		}
		if (f.size > MAX_SIZE) {
			toast.error('Video must be under 300MB.');
			return;
		}

		file = f;
		previewUrl = URL.createObjectURL(f);
		durationSeconds = null;
	}

	function onMetadataLoaded(e: Event) {
		const video = e.target as HTMLVideoElement;
		durationSeconds = Math.round(video.duration);
		if (durationSeconds > MAX_DURATION) {
			toast.error('Scrollables can be at most 3 minutes long.');
			file = null;
			previewUrl = null;
			durationSeconds = null;
		}
	}

	function captureThumbnail(video: HTMLVideoElement): Promise<Blob | null> {
		return new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) return resolve(null);
			ctx.drawImage(video, 0, 0);
			canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8);
		});
	}

	async function upload(videoEl: HTMLVideoElement) {
		if (!file || !durationSeconds) return;
		uploading = true;
		uploadPct = 0;

		try {
			videoEl.currentTime = Math.min(1, durationSeconds / 2);
			await new Promise((r) => (videoEl.onseeked = r));
			const thumbBlob = await captureThumbnail(videoEl);

			const form = new FormData();
			form.set('video', file);
			form.set('caption', caption);
			form.set('durationSeconds', String(durationSeconds));
			if (thumbBlob) form.set('thumbnail', thumbBlob, 'thumb.webp');

			const res = await new Promise<{ ok: boolean; status: number; body: any }>((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open('POST', '/api/scrollables');
				xhr.upload.onprogress = (e) => {
					if (e.lengthComputable) uploadPct = Math.round((e.loaded / e.total) * 100);
				};
				xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: JSON.parse(xhr.responseText || '{}') });
				xhr.onerror = () => reject(new Error('Network error'));
				xhr.send(form);
			});

			if (!res.ok) {
				toast.error(res.body?.error ?? 'Upload failed.');
				return;
			}

			toast.success('Scrollable posted!');
			onUploaded(res.body.scrollable);
			open = false;
			file = null;
			previewUrl = null;
			caption = '';
			durationSeconds = null;
		} catch {
			toast.error('Upload failed — check your connection.');
		} finally {
			uploading = false;
		}
	}

	let hiddenVideoEl: HTMLVideoElement | undefined = $state();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>New Scrollable</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-3 py-2">
			{#if !previewUrl}
				<label class="dropzone">
					<Upload class="h-8 w-8" />
					<span>Choose a video (max 3 min, 300MB)</span>
					<input type="file" accept="video/*" class="hidden" onchange={pickFile} />
				</label>
			{:else}
				<video
					bind:this={hiddenVideoEl}
					src={previewUrl}
					class="preview-video"
					controls
					onloadedmetadata={onMetadataLoaded}
				></video>
				{#if durationSeconds}
					<p class="duration-label">{Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, '0')}</p>
				{/if}
				<Input bind:value={caption} maxlength={300} placeholder="Write a caption..." />
				{#if uploading}
					<div class="progress-track"><div class="progress-fill" style="width: {uploadPct}%"></div></div>
				{/if}
			{/if}
		</div>

		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (open = false)} disabled={uploading}>Cancel</Button>
			<Button
				disabled={!file || !durationSeconds || uploading}
				onclick={() => hiddenVideoEl && upload(hiddenVideoEl)}
			>
				{uploading ? `Uploading ${uploadPct}%` : 'Post'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 40px 16px;
		border: 2px dashed hsl(var(--border));
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}

	.preview-video {
		width: 100%;
		max-height: 300px;
		border-radius: 6px;
		background: #000;
	}

	.duration-label {
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.progress-track {
		height: 6px;
		border-radius: 3px;
		background: hsl(var(--muted));
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: hsl(var(--primary));
		transition: width 0.2s;
	}
</style>
