<script lang="ts">
	import { stopPropagation } from 'svelte/legacy';

	import { cdnUrl } from './stores';
	import { Separator } from '@/components/ui/separator';
	import { BarChart2, Heart, ImageUp, MessageCircle, Repeat2, Share2 } from 'lucide-svelte';
	import * as Dialog from '@/components/ui/dialog/index';
	import * as Form from '@/components/ui/form/index';
	import Avatar from './Avatar.svelte';
	import ClanAvatarStack from './ClanAvatarStack.svelte';
	import ReactionBar from './ReactionBar.svelte';
	import OutlineButton from './OutlineButton.svelte';
	import { toast } from 'svelte-sonner';
	import LyntContents from './LyntContents.svelte';
	import DivInput from './DivInput.svelte';
	import PollDisplay from './PollDisplay.svelte';
	import LikersDropdown from './LikersDropdown.svelte';
	import { shareLyntUrl } from '$lib/share-url';

	function formatNumber(num: number): string {
		if (!num) return '0';
		const absNum = Math.abs(num);
		if (absNum >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
		if (absNum >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
		if (absNum >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
		return num.toString();
	}

	
	interface Props {
		myId: string;
		truncateContent?: boolean;
		lyntClick: (id: string) => Promise<void>;
		id: string;
		content: string;
		userId: string;
		createdAt: number;
		editedAt?: string | null;
		views: number;
		bio: string;
		reposted: boolean;
		likeCount: number;
		repostCount: number;
		commentCount: number;
		likedByUser: boolean;
		repostedByUser: boolean;
		handle: string;
		userCreatedAt: number;
		username: string;
		iq: number;
		has_image: boolean;
		images?: { key: string; position: number }[] | null;
		gif_url?: string | null;
		verified: boolean;
		parentId: string | null;
		parentContent: string | null;
		parentUserBio: string | null;
		parentHasImage: boolean | null;
		parentImages?: { key: string; position: number }[] | null;
		parentGifUrl?: string | null;
		parentUserId: string | null;
		parentUserHandle: string | null;
		parentUserUsername: string | null;
		parentUserVerified: boolean | null;
		parentUserIq: number | null;
		parentCreatedAt: number | null;
		parentUserCreatedAt: number | null;
		connect?: boolean;
		// Badge props
		isAdmin?: boolean;
		contributor?: boolean;
		loginStreak?: number;
		followerCount?: number;
		followsViewer?: boolean;
		poll?: any | null;
		reactions?: { emoji: string; count: number; reactedByUser: boolean }[];
		// Cosmetic name color (see $lib/nameColors.ts)
		nameColor?: string | null;
		parentUserNameColor?: string | null;
		// Clan Lynting — isClan flips the header to a group-avatar stack,
		// drops individual badges, and shows clanAvgIq instead of the
		// author's own IQ. contributors is empty for a normal solo lynt.
		isClan?: boolean;
		clanAvgIq?: number | null;
		contributors?: { userId: string; username: string; handle: string }[];
	}

	let {
		myId,
		truncateContent = true,
		lyntClick,
		id,
		content,
		userId,
		createdAt,
		editedAt = null,
		views,
		bio,
		reposted,
		likeCount = $bindable(),
		repostCount,
		commentCount,
		likedByUser = $bindable(),
		repostedByUser,
		reactions = [],
		handle,
		userCreatedAt,
		username,
		iq,
		has_image,
		images = null,
		gif_url = null,
		verified,
		parentId,
		parentContent,
		parentUserBio,
		parentHasImage,
		parentImages = null,
		parentGifUrl = null,
		parentUserId,
		parentUserHandle,
		parentUserUsername,
		parentUserVerified,
		parentUserIq,
		parentCreatedAt,
		parentUserCreatedAt,
		connect = false,
		isAdmin = false,
		contributor = false,
		loginStreak = 0,
		followerCount = 0,
		followsViewer = false,
		poll = null,
		nameColor = null,
		parentUserNameColor = null,
		isClan = false,
		clanAvgIq = null,
		contributors = []
	}: Props = $props();

	let openDialog = $state(false);
	let repostContent = $state('');
	let likersHover = $state(false);
	let likersHoverTimer: ReturnType<typeof setTimeout>;

	// Small delay on both directions: on enter, avoids firing a fetch for
	// every lynt the cursor merely passes over on its way somewhere else;
	// on leave, gives the user room to move the cursor from the button down
	// into the dropdown itself without it disappearing first.
	function scheduleLikersHover(show: boolean) {
		clearTimeout(likersHoverTimer);
		likersHoverTimer = setTimeout(() => (likersHover = show), show ? 350 : 150);
	}

	// Guest gating — myId is only ever empty when this component is reused
	// on the logged-out landing page teaser feed (see Landing.svelte); every
	// authenticated context always supplies a real myId, so this is a no-op
	// there. Centralizes the "log in to do X" nudge instead of each handler
	// silently hitting a 401 or opening a dialog that has nowhere to post to.
	function requireAuth(action: string): boolean {
		if (myId) return false;
		toast.info(`Log in to ${action}.`);
		return true;
	}

	function handleRepost(e: MouseEvent) {
		// Block opening the dialog if the user already reposted this lynt.
		// Don't toggle openDialog manually here — Dialog.Trigger already
		// does that via bind:open, and doing it twice causes the dialog
		// to flash open then immediately close.
		if (repostedByUser || requireAuth('repost')) {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	async function handleLike() {
		if (requireAuth('like')) return;

		// Optimistic update
		likeCount = likedByUser ? likeCount - 1 : Number(likeCount) + 1;
		likedByUser = !likedByUser;

		const response = await fetch('/api/likelynt', {
			method: 'POST',
			body: JSON.stringify({ lyntId: id })
		});

		if (response.status !== 200) {
			// Roll back optimistic update
			likeCount = likedByUser ? likeCount - 1 : Number(likeCount) + 1;
			likedByUser = !likedByUser;
			if (response.status === 429)
				return toast.warning('Woah, slow down! You are being ratelimited.');
			toast.error(`Something went wrong while liking. Error: ${response.status} | ${response.statusText}`);
		}
		// SSE will deliver the authoritative count to all viewers
	}

	async function openLynt(lyntid: string) {
		if (requireAuth('view the full conversation')) return;
		lyntClick(lyntid);
	}

	let copied = $state(false);
	let timeoutId: ReturnType<typeof setTimeout>;

	function handleShare() {
		const url = shareLyntUrl(id);
		toast.success('Link copied to clipboard!');
		navigator.clipboard.writeText(url).then(() => {
			copied = true;
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => { copied = false; }, 300);
		}).catch((err) => console.error('Failed to copy:', err));
	}

	let image: File | null = null;
	let imagePreview: string | null = $state(null);
	let fileinput: HTMLInputElement = $state();

	const onFileSelected = (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			image = target.files[0];
			const reader = new FileReader();
			reader.readAsDataURL(image);
			reader.onload = (e) => { imagePreview = e.target?.result as string; };
		}
	};

	async function handlePost() {
		const formData = new FormData();
		formData.append('content', repostContent);
		formData.append('reposted', id);
		if (image) formData.append('image', image, image.name);

		const response = await fetch('api/lynt', { method: 'POST', body: formData });

		if (response.status === 201) {
			openDialog = false;
			toast.success('Your lynt has been published!');
		} else {
			toast.error(`Something happened! Error: ${response.status} | ${response.statusText}`);
		}
	}
</script>

<div onclick={stopPropagation(() => openLynt(id))} class="mb-2 w-full text-left">
	<div class="lynt-card flex w-full gap-3 p-3">
		<a href="/@{handle}" class="inline-block max-h-[40px] min-w-[40px] flex-shrink-0">
			{#if isClan && contributors.length > 0}
				<ClanAvatarStack {contributors} size={10} />
			{:else}
				<Avatar size={10} src={cdnUrl(userId, 'small')} alt="A profile picture." userId={userId} />
			{/if}
		</a>

		<div class="flex w-full max-w-[530px] flex-col gap-2">
			<!-- Main lynt -->
			<LyntContents
				{truncateContent}
				postId={id}
				{bio}
				isAuthor={userId === myId}
				{has_image}
				{images}
				{gif_url}
				{username}
				{userId}
				{verified}
				{handle}
				{createdAt}
				{content}
				{iq}
				{userCreatedAt}
				{editedAt}
				{isAdmin}
				{contributor}
				{loginStreak}
				{followerCount}
				{followsViewer}
				{nameColor}
				{isClan}
				{clanAvgIq}
			/>

			{#if poll}
				<PollDisplay
					{poll}
					isAuthor={userId === myId}
					loggedIn={!!myId}
					onupdate={(updated) => { poll = updated; }}
				/>
			{/if}

			{#if reposted && parentId}				<div onclick={stopPropagation(() => openLynt(parentId))}>
					<div class="repost-quote p-4 drop-shadow">
						{#if parentUserHandle}
							<LyntContents
								truncateContent={true}
								content={parentContent}
								userId={parentUserId}
								isAuthor={parentUserId === myId}
								bio={parentUserBio}
								postId={parentId}
								has_image={parentHasImage}
								images={parentImages}
							gif_url={parentGifUrl}
								username={parentUserUsername}
								verified={parentUserVerified}
								handle={parentUserHandle}
								createdAt={parentCreatedAt}
								iq={parentUserIq}
								userCreatedAt={parentUserCreatedAt}
								includeAvatar={true}
								editedAt={null}
								isAdmin={false}
								contributor={false}
								loginStreak={0}
								followerCount={0}
								followsViewer={false}
								nameColor={parentUserNameColor}
							/>
						{/if}
					</div>
				</div>
			{/if}

			<div class="mb-1 mt-2 flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<OutlineButton
						icon={MessageCircle}
						text={formatNumber(commentCount)}
						on:click={() => openLynt(id)}
						small={false}
					/>

					<Dialog.Root bind:open={openDialog}>
						<Dialog.Trigger >
							{#snippet children({ builder })}
														<OutlineButton
									{...builder}
									on:click={handleRepost}
									isActive={repostedByUser}
									icon={Repeat2}
									text={formatNumber(repostCount)}
									outline={true}
									small={false}
								/>
																				{/snippet}
												</Dialog.Trigger>
						<Dialog.Content class="min-w-[20%]">
							<div class="flex max-h-[600px] items-start space-x-3 overflow-y-auto overflow-x-hidden">
								<Avatar size={10} src={cdnUrl(myId, 'small')} alt="Your profile picture." userId={myId} />
								<div class="flex-grow">
									<div class="h-full w-full overflow-y-auto">
										<DivInput bind:lynt={repostContent} />
										{#if imagePreview}
											<div class="max-h-[600px] max-w-[400px] overflow-y-auto">
												<img src={imagePreview} alt="Preview" />
											</div>
										{/if}
									</div>
									<button onclick={() => fileinput.click()}>
										<ImageUp class="upload" />
									</button>
									<input
										style="display:none"
										type="file"
										accept=".jpg, .jpeg, .png, .gif"
										onchange={onFileSelected}
										bind:this={fileinput}
									/>
									<div class="max-h-[300px] overflow-y-auto rounded-md border-2 border-primary p-4">
										<LyntContents
											truncateContent={true}
											{content}
											isAuthor={userId === myId}
											postId={id}
											{bio}
											{has_image}
											{images}
										{gif_url}
											{username}
											{verified}
											{handle}
											{createdAt}
											{iq}
											{userId}
											{userCreatedAt}
											includeAvatar={true}
											smaller={true}
											{editedAt}
											{isAdmin}
											{loginStreak}
											{followerCount}
											{followsViewer}
											{nameColor}
										/>
									</div>
								</div>
							</div>
							<div class="flex justify-end">
								<Form.Button on:click={handlePost}>Post</Form.Button>
							</div>
						</Dialog.Content>
					</Dialog.Root>

					<div
						class="relative inline-block"
						role="presentation"
						onmouseenter={() => scheduleLikersHover(true)}
						onmouseleave={() => scheduleLikersHover(false)}
					>
						<OutlineButton
							on:click={handleLike}
							isActive={likedByUser}
							icon={Heart}
							text={formatNumber(likeCount)}
							colorOnClick={true}
							outline={true}
						/>
						<LikersDropdown lyntId={id} {likeCount} visible={likersHover} />
					</div>
				</div>
				<ReactionBar lyntId={id} {reactions} myId={myId} />
				<div class="ml-auto flex items-center gap-2">
					<OutlineButton
						icon={BarChart2}
						popover={"The times this post has been shown in someone's feed."}
						text={formatNumber(views)}
						outline={true}
					/>
					<OutlineButton icon={Share2} on:click={handleShare} animate={copied} />
				</div>
			</div>
		</div>
	</div>
</div>

{#if connect}
	<div class="relative left-6 h-4 w-0.5 bg-border"></div>
{:else}
	<Separator />
{/if}