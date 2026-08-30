<!-- @migration-task Error while migrating Svelte code: $$props is used together with named props in a way that cannot be automatically migrated. -->
<script lang="ts">
	import * as Tooltip from '@/components/ui/tooltip';
	import { Label } from '@/components/ui/label';
	import * as HoverCard from '@/components/ui/hover-card/index.js';
	import Avatar from './Avatar.svelte';
	import { cdnUrl, bookmarkToggled } from './stores';

	import CalendarDays from 'lucide-svelte/icons/calendar-days';
	import * as Popover from '@/components/ui/popover';
	import { Code, Copy, Ellipsis, Trash, Pencil, Bookmark, BookmarkCheck } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { working } from '$lib/working';
	import Report from './Report.svelte';
	import ParsedContent from './ParsedContent.svelte';
	import NetWorthBadge from './NetWorthBadge.svelte';
	import UserBadges from './UserBadges.svelte';
	import UserName from './UserName.svelte';

	function getTimeElapsed(date: Date | string) {
		if (typeof date === 'string') date = new Date(date);

		const now = new Date();
		const elapsed = now.getTime() - date.getTime();
		const seconds = Math.floor(elapsed / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const weeks = Math.floor(days / 7);
		const years = Math.floor(days / 365);

		if (years > 0) return `${years}y`;
		if (weeks > 0) return `${weeks}w`;
		if (days > 0) return `${days}d`;
		if (hours > 0) return `${hours}h`;
		if (minutes > 0) return `${minutes}m`;
		return `${seconds}s`;
	}
	function formatDate(date) {
		if (typeof date === 'string') date = new Date(date);

		const options = {
			year: 'numeric',
			month: 'long'
		};
		return date.toLocaleDateString(undefined, options);
	}

	function formatDateTooltip(date) {
		date = new Date(date);

		const options = {
			hour: '2-digit',
			minute: '2-digit',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		};

		return date.toLocaleString(undefined, options);
	}

	let popoverOpened = false;

	export let truncateContent: boolean = false;
	export let username;
	export let userId;
	export let verified;
	export let contributor: boolean = false;
	export let handle: string;
	export let createdAt;
	export let content: string;
	export let iq;
	export let bio: string | null;
	export let smaller = false;
	export let userCreatedAt;
	export let includeAvatar = false;
	export let isAuthor: boolean;
	export let has_image: boolean | null;
	export let images: { key: string; position: number }[] | null = null;
	export let gif_url: string | null = null;
	export let postId: string;
	export let editedAt: string | null = null;  // NEW: populated when lynt has been edited
	export let isAdmin: boolean = false;
	export let loginStreak: number = 0;
	export let followerCount: number = 0;
	export let followsViewer: boolean = false;
	export let nameColor: string | null = null;
	export let isClan: boolean = false;
	export let clanAvgIq: number | null = null;

	const formattedDate = formatDateTooltip(createdAt);

	// ── Edit state ──────────────────────────────────────────────
	let editing = false;
	let editContent = content;
	$: editCharCount = editContent.length;
	$: editOverLimit = editCharCount > 280;
	let editMode: 'write' | 'preview' = 'write';

	function startEdit() {
		editContent = content;
		editing = true;
		popoverOpened = false;
	}

	async function handleSaveEdit() {
		if (editOverLimit) return;
		working.start('Saving edit…');
		try {
			const response = await fetch('api/lynt', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: postId, content: editContent })
			});
			if (response.status === 200) {
				content = editContent;
				editing = false;
				toast.success('Your lynt has been updated.');
			} else if (response.status === 429) {
				toast.warning('Slow down! You are being ratelimited.');
			} else {
				toast.error(`Error updating lynt: ${response.status}`);
			}
		} finally {
			working.done();
		}
	}

	// ── Bookmark state ───────────────────────────────────────────
	let bookmarked = false;

	async function loadBookmarkState() {
		const res = await fetch(`api/bookmark?id=${postId}`);
		if (res.ok) {
			const data = await res.json();
			bookmarked = data.bookmarked;
		}
	}
	loadBookmarkState();

	async function toggleBookmark() {
		// Optimistic: flip immediately and broadcast so any list showing the
		// Bookmarked tab elsewhere in the app can splice it out live, same
		// pattern as likes/follows. Roll back on failure instead of the old
		// behaviour, which set `bookmarked` unconditionally after the fetch —
		// so a failed request still silently reported success.
		const wasBookmarked = bookmarked;
		bookmarked = !wasBookmarked;
		popoverOpened = false;

		try {
			const response = wasBookmarked
				? await fetch(`api/bookmark?id=${postId}`, { method: 'DELETE' })
				: await fetch('api/bookmark', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ lyntId: postId })
					});

			if (!response.ok) throw new Error(String(response.status));

			toast.success(wasBookmarked ? 'Bookmark removed.' : 'Lynt bookmarked!');
			bookmarkToggled.set({ lyntId: postId, bookmarked: !wasBookmarked });
		} catch {
			bookmarked = wasBookmarked;
			toast.error(`Failed to ${wasBookmarked ? 'remove' : 'add'} bookmark. Please try again.`);
		}
	}

	// ── Delete ───────────────────────────────────────────────────
	async function handleDelete() {
		const response = await fetch('api/lynt?id=' + postId, { method: 'DELETE' });

		if (response.status === 200) {
			toast.success(`Your post has been permanently deleted.`);
		} else if (response.status === 403) {
			toast.error(`Missing access - frontend may be desynchronised.`);
		} else {
			toast.error(`Unknown error occured while deleting: ${response.status} | ${response.statusText}`);
		}
	}

	function truncateContentFunc(
		content: string,
		maxLines: number = 5
	): { truncated: string; needsReadMore: boolean } {
		const lines = content.split('\n');

		if (lines.length <= maxLines || !truncateContent) {
			return { truncated: content, needsReadMore: false };
		}
		return {
			truncated: lines.slice(0, maxLines).join('\n'),
			needsReadMore: true
		};
	}

	function handleCopy() {
		toast.success('Lynt contents copied to clipboard!');
		navigator.clipboard.writeText(content)
	}

	function handleCopyId() {
		toast.success('Lynt ID copied to clipboard!');
		navigator.clipboard.writeText(postId)
	}

	$: ({ truncated, needsReadMore } = truncateContentFunc(content));
</script>

<div class={`${$$props.class} flex items-start gap-2`}>
	{#if includeAvatar}
		<a href="/@{handle}" class="inline-block max-h-[40px] min-w-[40px]">
			<Avatar size={15} src={cdnUrl(userId, 'small')} alt="A profile picture." userId={userId} />
		</a>
	{/if}

	<div class="flex w-full flex-col text-left">
		<div class="flex w-full items-center justify-between gap-1 {smaller ? 'max-w-[300px]' : ''}">
			<div class="flex flex-grow items-center gap-1 overflow-hidden">
				<HoverCard.Root>
					<HoverCard.Trigger
						rel="noreferrer noopener"
						class="truncate {smaller
							? 'max-w-[30%]'
							: 'max-w-[60%]'} rounded-sm text-xl font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-black"
						href="/@{handle}"
					>
						<UserName name={username} color={nameColor} {verified} />
					</HoverCard.Trigger>
					<HoverCard.Content class="flex w-80 flex-row items-center gap-2">
						<div class="flex justify-between space-x-4">
							<Avatar size={10} src={cdnUrl(userId, 'small')} alt="Profile picture." userId={userId} />

							<div class="space-y-1">
								<h4 class="text-sm font-semibold"><UserName name={username} color={nameColor} {verified} /></h4>
								<h4 class="text-sm font-semibold">@{handle}</h4>
								<p class="break-words text-sm">{bio}</p>
								<div class="flex items-center pt-2">
									<CalendarDays class="mr-2 h-4 w-4 opacity-70" />
									<span class="text-xs text-muted-foreground">
										Joined {formatDate(userCreatedAt)}
									</span>
								</div>
								<div class="pt-1">
									<NetWorthBadge handle={handle} compact={true} />
								</div>
							</div>
						</div>
					</HoverCard.Content>
				</HoverCard.Root>

				<UserBadges
					{verified}
					isAdmin={isClan ? false : isAdmin}
					contributor={isClan ? false : contributor}
					{loginStreak}
					{followerCount}
					{followsViewer}
					compact={true}
				/>
				<span
					class="py-0.25 flex select-none items-center rounded-[4px] bg-gradient-gloss px-1.5 text-base font-semibold text-primary-foreground font-[family-name:var(--font-retro)] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] transition-[filter] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
					title={isClan ? 'Average IQ across every contributor' : undefined}
					>{isClan ? (clanAvgIq ?? iq) : iq}</span
				>
				<HoverCard.Root>
					<HoverCard.Trigger
						rel="noreferrer noopener"
						class="overflow-hidden text-clip rounded-sm text-lg text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-black"
						href="/@{handle}"
					>
						@{handle}
					</HoverCard.Trigger>
					<HoverCard.Content class="w-80">
						<div class="flex justify-between space-x-4">
							<Avatar size={10} src={cdnUrl(userId, 'small')} alt="Profile picture." userId={userId} />

							<div class="space-y-1">
								<h4 class="text-sm font-semibold"><UserName name={username} color={nameColor} {verified} /></h4>
								<h4 class="text-sm font-semibold">@{handle}</h4>
								<p class="break-words text-sm">{bio}</p>
								<div class="flex items-center pt-2">
									<CalendarDays class="mr-2 h-4 w-4 opacity-70" />
									<span class="text-xs text-muted-foreground">
										Joined {formatDate(userCreatedAt)}
									</span>
								</div>
							</div>
						</div>
					</HoverCard.Content>
				</HoverCard.Root>
				<Label class="text-muted-foreground">•</Label>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Label class="cursor-pointer text-lg text-muted-foreground hover:underline "
							>{getTimeElapsed(createdAt)}</Label
						>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{formattedDate}</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<!-- NEW: edited indicator -->
				{#if editedAt}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<span class="text-sm text-muted-foreground italic">(edited)</span>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>Edited {formatDateTooltip(editedAt)}</p>
						</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</div>
			<div class="flex-shrink-0">
				<Popover.Root bind:open={popoverOpened}>
					<Popover.Trigger asChild let:builder>
						<button {...builder} on:click|stopPropagation={() => (popoverOpened = !popoverOpened)}>
							<Ellipsis />
						</button>
					</Popover.Trigger>
					<Popover.Content class="flex w-auto flex-col p-2">
						{#if isAuthor}
							<!-- Edit -->
							<button
								on:click={startEdit}
								class="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-lynt-foreground"
							>
								<Pencil class="h-5 w-5 text-muted-foreground" />
								<span>Edit</span>
							</button>
							<!-- Delete -->
							<button
								on:click={handleDelete}
								class="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-lynt-foreground text-red-500"
							>
								<Trash class="h-5 w-5" />
								<span>Delete</span>
							</button>
						{:else}
							<button
								on:click={handleCopy}
								class="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-lynt-foreground"
							>
								<Copy class="h-5 w-5 text-muted-foreground" />
								<span>Copy</span>
							</button>

							<Report {userId} lyntId={postId} />
						{/if}

						<!-- Bookmark — shown to everyone -->
						<button
							on:click={toggleBookmark}
							class="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-lynt-foreground"
						>
							{#if bookmarked}
								<BookmarkCheck class="h-5 w-5 text-primary" />
								<span>Saved</span>
							{:else}
								<Bookmark class="h-5 w-5 text-muted-foreground" />
								<span>Save</span>
							{/if}
						</button>

						<button
							on:click={handleCopyId}
							class="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-lynt-foreground"
						>
							<Code class="h-5 w-5 text-muted-foreground" />
							<span>Copy ID</span>
						</button>
					</Popover.Content>
				</Popover.Root>
			</div>
		</div>

		<!-- Content / inline editor toggle -->
		{#if editing}
			<div class="mt-2 flex flex-col gap-2" on:click|stopPropagation>
				<!-- Write / Preview tab bar -->
				<div class="edit-tab-bar">
					<button class="edit-tab" class:active={editMode === 'write'} on:click={() => (editMode = 'write')}>Write</button>
					<button class="edit-tab" class:active={editMode === 'preview'} on:click={() => (editMode = 'preview')}>Preview</button>
					<span class="ml-auto text-xs" class:text-red-500={editOverLimit} class:text-muted-foreground={!editOverLimit}>
						{editCharCount}/280
					</span>
				</div>

				{#if editMode === 'write'}
					<textarea
						class="edit-textarea"
						rows="4"
						bind:value={editContent}
						maxlength="290"
					/>
				{:else}
					<div class="edit-preview">
						{#if editContent.trim()}
							<ParsedContent
								content={editContent}
								className="text-lg"
								authorHandle={handle}
								showLinkPreview={false}
							/>
						{:else}
							<span style="font-style:italic;opacity:0.5">Nothing to preview…</span>
						{/if}
					</div>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						on:click={() => { editing = false; editMode = 'write'; }}
						class="rounded-md px-3 py-1 text-sm text-muted-foreground hover:bg-lynt-foreground"
					>
						Cancel
					</button>
					<button
						on:click={handleSaveEdit}
						disabled={editOverLimit}
						class="edit-save-btn rounded-md px-3 py-1 text-sm text-primary-foreground disabled:opacity-40"
					>
						Save
					</button>
				</div>
			</div>
		{:else}
			<ParsedContent content={truncated} className="max-w-[490px] text-lg" authorHandle={handle} />

			{#if needsReadMore}
				<span class="mt-2 text-sm text-muted-foreground hover:underline">Read more...</span>
			{/if}
		{/if}
	</div>
</div>
{#if images && images.length > 1}
	<div class="lynt-image-gallery" class:count-3={images.length === 3}>
		{#each images as img (img.key)}
			<img class="gallery-img" src={cdnUrl(img.key)} alt="Attached image" loading="lazy" decoding="async" />
		{/each}
	</div>
{:else if (images && images.length === 1) || has_image}
	<img class="avatar mt-2 max-h-[600px] object-contain" src={cdnUrl(images?.[0]?.key ?? postId)} alt="ok" loading="lazy" decoding="async" />
{:else if gif_url}
	<img class="avatar mt-2 max-h-[600px] rounded-md object-contain" src={gif_url} alt="GIF" loading="lazy" decoding="async" />
{/if}

<style>
	.lynt-image-gallery {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		margin-top: 8px;
		border-radius: 10px;
		overflow: hidden;
		max-height: 500px;
	}
	.lynt-image-gallery.count-3 :global(.gallery-img:first-child) {
		grid-row: span 2;
	}
	.gallery-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		aspect-ratio: 1 / 1;
	}
</style>
