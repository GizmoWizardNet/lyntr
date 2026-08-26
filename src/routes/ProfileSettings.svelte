<script lang="ts">
	import { PUBLIC_CDN_URL } from '$env/static/public';
	import * as Form from '@/components/ui/form/index';
	import Avatar from './Avatar.svelte';
	import { toast } from 'svelte-sonner';
	import { working } from '$lib/working';
	import { Label } from '@/components/ui/label';
	import { Input } from '@/components/ui/input';
	import { cdnUrl } from './stores';
	import { ImageUp, Music, X, Check, ArrowLeft } from 'lucide-svelte';
	import { NAME_COLORS } from '@/nameColors';
	import UserName from './UserName.svelte';
	import { parseYoutubeId } from '@/youtube';

	interface Props {
		userId: string;
		username: string;
		bio: string;
		banner?: string | null;
		rugplayUsername?: string | null;
		rugplayEnhancementsEnabled?: boolean;
		rugplayKeyValid?: boolean;
		rugplayKeySet?: boolean;
		nameColor?: string | null;
		verified?: boolean;
		profileSongType?: 'upload' | 'youtube' | null;
		profileSongUrl?: string | null;
		profileSongTitle?: string | null;
		profileSongVolume?: number;
		profileSongLoop?: boolean;
		emailNotificationsEnabled?: boolean;
		notificationEmailSet?: boolean;
		pushNotificationsEnabled?: boolean;
		onback: () => void;
	}

	let {
		userId,
		username = $bindable(),
		bio = $bindable(),
		banner = null,
		rugplayUsername = $bindable(null),
		rugplayEnhancementsEnabled = false,
		rugplayKeyValid = false,
		rugplayKeySet = false,
		nameColor = $bindable(null),
		verified = false,
		profileSongType = $bindable(null),
		profileSongUrl = $bindable(null),
		profileSongTitle = $bindable(null),
		profileSongVolume = $bindable(50),
		profileSongLoop = $bindable(true),
		emailNotificationsEnabled = false,
		notificationEmailSet = false,
		pushNotificationsEnabled = false,
		onback
	}: Props = $props();

	// Local, editable copies. We never receive the actual key back from the
	// server (it's encrypted at rest and never sent to any client) — only
	// whether one is currently stored/valid, so the UI can show a status
	// instead of the secret itself.
	let enhancementsEnabled = $state(rugplayEnhancementsEnabled);
	let keyIsSet = $state(rugplayKeySet);
	let keyIsValid = $state(rugplayKeyValid);
	let apiKeyInput = $state(''); // only sent to the server if non-empty (i.e. user is setting/replacing it)
	let removeKeyRequested = $state(false);

	// Email notifications — mirror the Rugplay key pattern.
	// The actual address is never echoed back; we only know if one is set.
	let emailNotifsEnabled = $state(emailNotificationsEnabled);
	let emailIsSet = $state(notificationEmailSet);
	let emailInput = $state('');
	let removeEmailRequested = $state(false);

	function removeEmail() {
		emailInput = '';
		removeEmailRequested = true;
		emailIsSet = false;
	}

	function removeKey() {
		apiKeyInput = '';
		removeKeyRequested = true;
		keyIsSet = false;
		keyIsValid = false;
	}

	// Avatar state (unchanged from original)
	let avatarSrc: any;
	function handleAvatarChange(shit) {
		avatarSrc = shit.detail.file;
	}

	// Banner state
	let bannerFile: File | null = null;
	let bannerPreview: string | null = $state(banner
		? `${PUBLIC_CDN_URL}/lyntr/${banner}`
		: null);
	let bannerInput: HTMLInputElement = $state();

	function onBannerSelected(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			bannerFile = target.files[0];
			const reader = new FileReader();
			reader.readAsDataURL(bannerFile);
			reader.onload = (e) => {
				bannerPreview = e.target?.result as string;
			};
		}
	}

	// ── Profile song ─────────────────────────────────────────────────────
	// Kept as its own save action rather than folded into handleSave():
	// it can involve a real (up to 25MB) file upload, and there's no
	// reason a failed/slow song upload should block saving bio/username
	// edits, or vice versa.
	const SONG_MAX_BYTES = 25 * 1024 * 1024;
	const SONG_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a', 'weba'];

	let songMode = $state<'upload' | 'youtube'>(profileSongType === 'youtube' ? 'youtube' : 'upload');
	let songFile = $state<File | null>(null);
	let songFileError = $state('');
	let youtubeUrlInput = $state('');
	let songVolume = $state(profileSongVolume);
	let songLoop = $state(profileSongLoop);
	let savingSong = $state(false);

	let youtubeIdPreview = $derived(youtubeUrlInput.trim() ? parseYoutubeId(youtubeUrlInput) : null);

	function onSongFileSelected(e: Event) {
		songFileError = '';
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
		if (!SONG_EXTENSIONS.includes(ext)) {
			songFileError = 'Upload an MP3, OGG, WAV, M4A, or WEBA file.';
			songFile = null;
			return;
		}
		if (file.size > SONG_MAX_BYTES) {
			songFileError = `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 25MB.`;
			songFile = null;
			return;
		}
		songFile = file;
	}

	async function saveSong() {
		if (songMode === 'youtube' && youtubeUrlInput.trim() && !youtubeIdPreview) {
			toast.error("That doesn't look like a valid YouTube link");
			return;
		}

		savingSong = true;
		try {
			const formData = new FormData();
			// These always get re-sent so volume/loop changes apply even
			// when not also changing the song itself.
			formData.append('profile_song_volume', String(songVolume));
			formData.append('profile_song_loop', String(songLoop));

			if (songMode === 'upload' && songFile) {
				formData.append('profile_song_action', 'upload');
				formData.append('profile_song_file', songFile, songFile.name);
			} else if (songMode === 'youtube' && youtubeUrlInput.trim()) {
				formData.append('profile_song_action', 'youtube');
				formData.append('profile_song_youtube_url', youtubeUrlInput.trim());
			}

			const res = await fetch('/api/profile', { method: 'PATCH', body: formData });
			const result = await res.json().catch(() => ({}));

			if (!res.ok) {
				toast.error(result.error ?? 'Failed to save profile song');
				return;
			}

			profileSongType = result.user?.profile_song_type ?? profileSongType;
			profileSongUrl = result.user?.profile_song_url ?? profileSongUrl;
			profileSongTitle = result.user?.profile_song_title ?? profileSongTitle;
			profileSongVolume = result.user?.profile_song_volume ?? songVolume;
			profileSongLoop = result.user?.profile_song_loop ?? songLoop;
			songFile = null;
			youtubeUrlInput = '';
			toast.success('Profile song updated!');
		} catch {
			toast.error('Something went wrong saving your profile song');
		} finally {
			savingSong = false;
		}
	}

	async function removeSong() {
		savingSong = true;
		try {
			const formData = new FormData();
			formData.append('profile_song_action', 'clear');
			const res = await fetch('/api/profile', { method: 'PATCH', body: formData });
			if (!res.ok) {
				const result = await res.json().catch(() => ({}));
				toast.error(result.error ?? 'Failed to remove profile song');
				return;
			}
			profileSongType = null;
			profileSongUrl = null;
			profileSongTitle = null;
			songFile = null;
			youtubeUrlInput = '';
			toast.success('Profile song removed');
		} finally {
			savingSong = false;
		}
	}

	async function handleSave() {
		working.start('Updating profile…');
		try {
			// Only send rugplay_api_key when the user actually typed a new one
			// or explicitly hit "Remove key" — otherwise we'd have nothing
			// meaningful to send anyway, since the real key is never echoed
			// back to us to "leave unchanged".
			const apiKeyToSend = removeKeyRequested ? '' : apiKeyInput.trim() ? apiKeyInput.trim() : undefined;

			let response: Response;
			if (bannerFile || avatarSrc) {
				const formData = new FormData();
				formData.append('bio', bio ?? '');
				formData.append('username', username ?? '');
				formData.append('rugplay_username', rugplayUsername ?? '');
				formData.append('rugplay_enhancements_enabled', String(enhancementsEnabled));
				formData.append('name_color', nameColor ?? '');
				if (apiKeyToSend !== undefined) formData.append('rugplay_api_key', apiKeyToSend);
				if (bannerFile) formData.append('banner', bannerFile, bannerFile.name);
				response = await fetch('/api/profile', { method: 'PATCH', body: formData });
			} else {
				response = await fetch('/api/profile', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						bio,
						username,
						rugplay_username: rugplayUsername ?? '',
						rugplay_enhancements_enabled: enhancementsEnabled,
						name_color: nameColor,
						...(apiKeyToSend !== undefined ? { rugplay_api_key: apiKeyToSend } : {}),
						email_notifications_enabled: emailNotifsEnabled,
						...(removeEmailRequested
							? { notification_email: null }
							: emailInput.trim()
							? { notification_email: emailInput.trim() }
							: {})
					})
				});
			}

			if (response.status === 200) {
				const result = await response.json();
				toast.success('Your profile has been successfully updated!');
				// Reflect the server's authoritative state back into local UI state.
				keyIsValid = result.user?.rugplay_key_valid ?? keyIsValid;
				keyIsSet = result.user?.rugplay_key_set ?? keyIsSet;
				nameColor = result.user?.name_color ?? nameColor;
				apiKeyInput = '';
				removeKeyRequested = false;
				emailNotifsEnabled = result.user?.email_notifications_enabled ?? emailNotifsEnabled;
				if (emailInput.trim() || removeEmailRequested) {
					emailIsSet = !removeEmailRequested;
					emailInput = '';
					removeEmailRequested = false;
				}
			} else {
				const errBody = await response.json().catch(() => ({}));
				toast.error(errBody.error ?? `Something happened! Error: ${response.status} | ${response.statusText}`);
				return; // don't proceed to avatar upload / closing on a failed key validation, etc.
			}

			if (avatarSrc) {
				working.start('Uploading photo…');
				const formData = new FormData();
				formData.append('file', avatarSrc);
				const pfpRes = await fetch('/api/upload', { method: 'POST', body: formData });
				if (pfpRes.status !== 200) {
					if (pfpRes.status == 400) {
						toast.error(`Uploading photo failed. ${(await pfpRes.json()).error}`);
						return;
					}
					toast.error(`Uploading photo failed. Common cause is file size being over 8MB. Error code: ${pfpRes.status} | ${pfpRes.statusText}`);
				}
			}
		} finally {
			working.done();
		}
	}
</script>

<div class="settings-page flex h-full w-full flex-col overflow-hidden">
	<div class="flex flex-shrink-0 items-center gap-3 border-b border-border p-3">
		<button
			type="button"
			class="rounded-full p-1.5 hover:bg-muted"
			onclick={onback}
			title="Back to profile"
		>
			<ArrowLeft size={18} />
		</button>
		<h2 class="text-lg font-bold">Edit Profile</h2>
	</div>

	<div class="flex-1 overflow-y-auto p-4">

		<!-- Banner preview + picker -->
		<div class="relative mb-4 h-28 w-full overflow-hidden rounded-lg bg-muted">
			{#if bannerPreview}
				<img src={bannerPreview} alt="Banner preview" class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
					No banner — click to add one
				</div>
			{/if}
			<button
				class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity rounded-lg"
				onclick={() => bannerInput.click()}
			>
				<ImageUp class="h-6 w-6 text-white" />
			</button>
			<input
				style="display:none"
				type="file"
				accept=".jpg,.jpeg,.png,.webp"
				onchange={onBannerSelected}
				bind:this={bannerInput}
			/>
		</div>

		<div class="flex items-start space-x-3">
			<Avatar
				size={40}
				src={cdnUrl(userId, 'small')}
				alt="Your profile picture."
				border={true}
				editable={true}
				showPresence={false}
				on:change={handleAvatarChange}
			/>

			<div class="flex flex-grow flex-col gap-2">
				<div class="flex w-full max-w-sm flex-col gap-1.5">
					<Label for="username">Username</Label>
					<Input type="text" id="username" placeholder="Username" bind:value={username} />
				</div>

				<div class="flex w-full max-w-sm flex-col gap-1.5">
					<Label>Name color</Label>
					{#if !verified}
						<p class="text-xs text-muted-foreground">
							Get <span class="font-semibold text-foreground">verified</span> to unlock name colors.
						</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Preview: <UserName name={username || 'Your Name'} color={nameColor} {verified} class="font-semibold" />
						</p>
					{/if}
					<div class="flex flex-wrap gap-2 pt-1" class:opacity-50={!verified}>
						<button
							type="button"
							disabled={!verified}
							class="rounded-full border-2 px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed {nameColor === null
								? 'border-primary'
								: 'border-border opacity-70 hover:opacity-100'}"
							onclick={() => (nameColor = null)}
						>
							Default
						</button>
						{#each NAME_COLORS as c (c.id)}
							<button
								type="button"
								disabled={!verified}
								class="rounded-full border-2 px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed {nameColor === c.id
									? 'border-primary'
									: 'border-border opacity-70 hover:opacity-100'}"
								onclick={() => (nameColor = c.id)}
							>
								{#if c.kind === 'gradient'}
									<span
										style="background-image: {c.value}; background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;"
									>
										{c.label}
									</span>
								{:else}
									<span style="color: {c.value}">{c.label}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<div class="flex w-full max-w-sm flex-col gap-1.5">
					<Label for="bio">About me</Label>
					<Input type="text" id="bio" placeholder="About me..." bind:value={bio} />
				</div>

				<div class="flex w-full max-w-sm flex-col gap-2 rounded-md border border-border p-3">
					<div class="flex items-center gap-2">
						<Music size={15} />
						<Label>Profile song</Label>
					</div>
					<p class="text-xs text-muted-foreground">
						Plays for anyone who visits your profile. Upload a short track (25MB max) or link a YouTube video —
						not both.
					</p>

					{#if profileSongType}
						<div class="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5">
							<span class="truncate text-xs">
								🎵 Currently set: <strong>{profileSongTitle || (profileSongType === 'youtube' ? 'YouTube video' : 'Uploaded track')}</strong>
							</span>
							<button
								type="button"
								class="flex-shrink-0 text-muted-foreground hover:text-destructive"
								onclick={removeSong}
								disabled={savingSong}
								title="Remove profile song"
							>
								<X size={14} />
							</button>
						</div>
					{/if}

					<div class="flex gap-1 text-xs">
						<button
							type="button"
							class="flex-1 rounded-md border px-2 py-1 {songMode === 'upload' ? 'border-primary font-semibold' : 'border-border opacity-70'}"
							onclick={() => (songMode = 'upload')}
						>
							Upload file
						</button>
						<button
							type="button"
							class="flex-1 rounded-md border px-2 py-1 {songMode === 'youtube' ? 'border-primary font-semibold' : 'border-border opacity-70'}"
							onclick={() => (songMode = 'youtube')}
						>
							YouTube link
						</button>
					</div>

					{#if songMode === 'upload'}
						<input
							type="file"
							accept=".mp3,.ogg,.wav,.m4a,.weba,audio/*"
							onchange={onSongFileSelected}
							class="text-xs"
						/>
						{#if songFile}
							<p class="text-xs text-primary">Ready to upload: {songFile.name}</p>
						{/if}
						{#if songFileError}
							<p class="text-xs text-destructive">{songFileError}</p>
						{/if}
					{:else}
						<div class="flex items-center gap-1.5">
							<Input type="text" placeholder="https://youtube.com/watch?v=…" bind:value={youtubeUrlInput} class="text-xs" />
							{#if youtubeUrlInput.trim()}
								{#if youtubeIdPreview}
									<Check size={16} class="flex-shrink-0 text-green-600" />
								{:else}
									<X size={16} class="flex-shrink-0 text-destructive" />
								{/if}
							{/if}
						</div>
					{/if}

					<div class="flex flex-col gap-1">
						<Label class="text-xs">Volume: {songVolume}%</Label>
						<input type="range" min="0" max="100" bind:value={songVolume} />
					</div>

					<label class="flex items-center gap-2 text-xs">
						<input type="checkbox" bind:checked={songLoop} />
						Loop while visitors stay on the page
					</label>

					<button
						type="button"
						class="mt-1 self-start rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
						onclick={saveSong}
						disabled={savingSong}
					>
						{savingSong ? 'Saving…' : 'Save profile song'}
					</button>
				</div>

				<div class="flex w-full max-w-sm flex-col gap-1.5">
					<Label for="rugplay-username">
						Rugplay username
						<span class="text-xs text-muted-foreground">(optional — shows your biggest bag on your profile)</span>
					</Label>
					<Input
						type="text"
						id="rugplay-username"
						placeholder="your-rugplay-username"
						bind:value={rugplayUsername}
					/>
				</div>

				<div class="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-border p-3">
					<label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
						<input type="checkbox" bind:checked={enhancementsEnabled} class="h-4 w-4" />
						Enable Rugplay Enhancements
					</label>
					<p class="text-xs text-muted-foreground">
						Use your own Rugplay API key for $SYMBOL previews on your Lynts, so it's billed
						against your own quota instead of Lyntr's shared one. Off by default.
					</p>

					{#if enhancementsEnabled}
						<div class="flex flex-col gap-1.5 pt-1">
							<Label for="rugplay-api-key">Rugplay API key</Label>

							{#if keyIsSet && !removeKeyRequested && apiKeyInput === ''}
								<div class="flex items-center justify-between gap-2 text-xs">
									<span class={keyIsValid ? 'text-green-500' : 'text-amber-500'}>
										{keyIsValid ? '✓ Key saved and verified' : '⚠ Key saved, but failed verification'}
									</span>
									<button
										type="button"
										class="text-muted-foreground underline hover:text-foreground"
										onclick={removeKey}
									>
										Remove key
									</button>
								</div>
							{/if}

							<Input
								type="password"
								id="rugplay-api-key"
								placeholder={keyIsSet ? 'Enter a new key to replace it…' : 'rgpl_...'}
								bind:value={apiKeyInput}
								autocomplete="off"
							/>
							<span class="text-xs text-muted-foreground">
								Stored encrypted. We validate it against Rugplay when you save, and never show
								it again afterwards.
							</span>
						</div>
					{/if}
				</div>
			</div>
		</div>


			<!-- ── Email notifications ──────────────────────────────────────── -->
			<div class="flex w-full flex-col gap-1.5">
				<div class="flex flex-col gap-3 rounded-lg border border-border p-3">
					<label class="flex cursor-pointer items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={emailNotifsEnabled} class="h-4 w-4" />
						<span>
							<span class="font-semibold">Email notifications</span>
							<span class="text-muted-foreground"> — get notified by email when someone likes, replies, follows, or messages you.</span>
						</span>
					</label>

					{#if emailNotifsEnabled}
						<div class="flex flex-col gap-2">
							<Label for="notification-email">Notification email</Label>

							{#if emailIsSet && !emailInput && !removeEmailRequested}
								<div class="flex items-center gap-2">
									<span class="flex-1 rounded border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground">
										An email address is set. Enter a new one to replace it.
									</span>
									<button
										type="button"
										class="text-xs text-destructive underline underline-offset-2 hover:opacity-80"
										onclick={removeEmail}
									>
										Remove
									</button>
								</div>
							{:else if removeEmailRequested}
								<span class="text-sm text-muted-foreground italic">
									Email address will be removed when you save.
								</span>
							{/if}

							{#if !removeEmailRequested}
								<Input
									type="email"
									id="notification-email"
									placeholder={emailIsSet ? 'Enter a new address to replace it\u2026' : 'you@example.com'}
									bind:value={emailInput}
									autocomplete="email"
								/>
							{/if}

							<span class="text-xs text-muted-foreground">
								Only used for notifications — never shown publicly or shared.
							</span>
						</div>
					{/if}
				</div>
			</div>
	</div>

	<div class="flex flex-shrink-0 justify-end border-t border-border p-3">
		<Form.Button on:click={handleSave}>Save</Form.Button>
	</div>
</div>

<style>
	.settings-page {
		height: 100%;
	}
</style>
