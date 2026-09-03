<script lang="ts">
	import { PUBLIC_CDN_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import Lynt from './Lynt.svelte';
	import Avatar from './Avatar.svelte';
	import { Button } from '@/components/ui/button';
	import { Label } from '@/components/ui/label';
	import { Brain, Calendar } from 'lucide-svelte';
	import { Separator } from '@/components/ui/separator';
	import { Progress } from '@/components/ui/progress';
	import FollowListPopup from './FollowListPopup.svelte';
	import ProfileSettings from './ProfileSettings.svelte';
	import ProfileButton from './ProfileButton.svelte';
	import { cdnUrl, currentPage } from './stores';
	import TopTab from './TopTab.svelte';
	import UserBadges from './UserBadges.svelte';
	import UserName from './UserName.svelte';
	import ProfileSongPlayer from './ProfileSongPlayer.svelte';
	import NetWorthBadge from './NetWorthBadge.svelte';
	import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_BY_KEY, tierColor } from '$lib/achievements';
	import { auraTier } from '$lib/aura';

	interface Props {
		profileHandle: string;
		handleLyntClick: (id: string) => Promise<void>;
		myId: string;
	}

	let { profileHandle, handleLyntClick, myId }: Props = $props();

	let profile: {
		username: string;
		handle: string;
		iq: number;
		created_at: string;
		id: string;
		following: number;
		followers: number;
		bio: string;
		verified: boolean;
		banner: string | null;
		is_admin: boolean;
		login_streak: number;
		lynt_coins?: number;
		aura_score?: number;
		achievements?: { key: string; unlocked_at: string }[];
		pinned_achievement_key?: string | null;
		rugplay_username?: string | null;
		rugplay_enhancements_enabled?: boolean;
		rugplay_key_valid?: boolean;
		rugplay_key_set?: boolean;
		name_color?: string | null;
		contributor?: boolean;
		profile_song_type?: 'upload' | 'youtube' | null;
		profile_song_url?: string | null;
		profile_song_title?: string | null;
		profile_song_volume?: number;
		profile_song_loop?: boolean;
		email_notifications_enabled?: boolean;
		notification_email_set?: boolean;
	} | undefined = $state();

	let userLynts: any[] = $state([]);
	let loading = $state(true);
	let isSelf = $state(false);
	let showSettings = $state(false);
	let isFollowing = $state(false);
	// isFollowedBy = the profile person follows ME (viewer)  - show rocket on their profile
	let isFollowedBy = $state(false);
	let followersCount = $state(0);
	let followingCount = $state(0);

	let showFollowersPopup = $state(false);
	let showFollowingPopup = $state(false);

	let currentTab = $state('Lynts');
	const tabs = ['Lynts', 'Likes'];

	function handleTabChange(tab: string) {
		currentTab = tab;
		userLyntsExhausted = false;
		fetchUserLynts(currentTab === tabs[1]);
	}

	function toggleFollowersPopup() { showFollowersPopup = !showFollowersPopup; }
	function toggleFollowingPopup() { showFollowingPopup = !showFollowingPopup; }

	async function fetchProfile() {
		try {
			const response = await fetch(`/api/profile?handle=${profileHandle}`);
			if (response.status === 200) {
				const data = await response.json();
				profile = data;
				isSelf = data.id === myId;
				followersCount = data.followers;
				followingCount = data.following;
			} else {
				toast.error(`Failed to load profile. Error: ${response.status}`);
			}
		} catch (error) {
			if (isSelf) return;
			console.error('Error fetching profile:', error);
			toast.error('Failed to load profile');
		}
	}

	async function fetchUserLynts(fetchLikes: boolean, append = false) {
		try {
			const params = new URLSearchParams({ handle: profileHandle });
			if (fetchLikes) params.set('type', 'Liked');

			if (append && userLynts.length > 0) {
				const last = userLynts[userLynts.length - 1];
				const before = fetchLikes ? last.likedAt : last.createdAt;
				if (before) params.set('before', new Date(before).toISOString());
			}

			const response = await fetch(`/api/feed?${params.toString()}`);
			if (response.status === 200) {
				const data = await response.json();
				// API returns { lynts: [...] }
				const newLynts = data.lynts ?? data;
				if (append) {
					const unique = newLynts.filter(
						(item: any) => !userLynts.some((existing: any) => existing.id === item.id)
					);
					userLynts = userLynts.concat(unique);
					userLyntsExhausted = unique.length === 0;
				} else {
					userLynts = newLynts;
					userLyntsExhausted = newLynts.length === 0;
				}
			} else {
				toast.error(`Failed to load lynts. Error: ${response.status}`);
			}
		} catch (error) {
			if (isSelf) return;
			console.error('Error fetching user lynts:', error);
		}
	}

	let userLyntsExhausted = $state(false);
	let loadingMoreUserLynts = $state(false);
	let userLyntsContainer: HTMLDivElement | undefined = $state();

	function handleUserLyntsScroll() {
		if (!userLyntsContainer || userLyntsExhausted || loadingMoreUserLynts) return;
		const { scrollTop, scrollHeight, clientHeight } = userLyntsContainer;
		if (scrollTop + clientHeight >= scrollHeight - 5) {
			loadingMoreUserLynts = true;
			fetchUserLynts(currentTab === tabs[1], true).then(() => {
				loadingMoreUserLynts = false;
			});
		}
	}

	let followInFlight = $state(false);

	let vibeLine = $state<string | null>(null);
	let vibeRolling = $state(false);

	function vibeCheck() {
		if (vibeRolling || !profile) return;
		vibeRolling = true;
		vibeLine = null;

		const name = profile.username;
		const iq = profile.iq ?? 100;
		const streak = profile.login_streak ?? 0;
		const coins = profile.lynt_coins ?? 0;
		const followers = followersCount ?? 0;
		const score = profile.aura_score ?? 0;
		const tier = auraTier(score);

		const templates: string[] = [
			`Aura Score: ${score.toLocaleString()}. Tier: ${tier}. The math has been done, ${name}.`,
			`${name} has ${iq} IQ points and has chosen to spend every single one of them posting on Lyntr.`,
			streak >= 7
				? `${streak} days in a row. At this point Lyntr isn't a habit for ${name}, it's a load-bearing wall.`
				: `${name}'s login streak currently sits at ${streak}. Character development pending.`,
			coins >= 500
				? `${name} is sitting on ${coins.toLocaleString()} Community XP and still hasn't figured out there's nothing to spend it on.`
				: `${name} has ${coins.toLocaleString()} Community XP, which is somehow both a lot and not enough.`,
			followers >= 100
				? `${followers.toLocaleString()} people willingly chose to see ${name}'s posts. Bold of them.`
				: `${followers.toLocaleString()} followers deep and still posting like the algorithm owes them something.`,
			`Combine the IQ (${iq}), the streak (${streak}), and the Community XP (${coins.toLocaleString()}) and you get one ${tier.toLowerCase()}-tier Lyntr power user: ${name}.`,
			`Scientists have run the numbers on ${name}'s profile. Verdict: ${tier}.`,
			iq >= 130
				? `${iq} IQ and this is what ${name} is doing with it. Incredible.`
				: `${name} clocks in at ${iq} IQ, which tracks for someone posting on a website called Lyntr.`,
			score >= 2500
				? `${score.toLocaleString()} Aura. ${name} is not okay, and I mean that as a compliment.`
				: `${score.toLocaleString()} Aura and climbing. ${name} is putting in the work.`
		];

		setTimeout(() => {
			vibeLine = templates[Math.floor(Math.random() * templates.length)];
			vibeRolling = false;
		}, 380);
	}

	async function toggleFollow() {

		if (followInFlight || !profile) return;
		followInFlight = true;

		const previousFollowing = isFollowing;
		const previousCount = followersCount;
		isFollowing = !isFollowing;
		followersCount += isFollowing ? 1 : -1;

		try {
			const response = await fetch('/api/follow', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: profile.id })
			});
			if (response.ok) {

			} else if (response.status === 409) {
				isSelf = true;
				isFollowing = previousFollowing;
				followersCount = previousCount;
			} else {
				isFollowing = previousFollowing;
				followersCount = previousCount;
				const error = await response.json().catch(() => ({ error: 'Failed to update follow status' }));
				toast.error(error.error, {
					action: {
						label: 'Retry',
						onClick: () => toggleFollow()
					}
				});
			}
		} catch (error) {
			isFollowing = previousFollowing;
			followersCount = previousCount;
			if (isSelf) return;
			toast.error('Failed to update follow status', {
				action: {
					label: 'Retry',
					onClick: () => toggleFollow()
				}
			});
		} finally {
			followInFlight = false;
		}
	}

	async function checkFollowStatus() {
		if (!profile) return;
		try {
			const response = await fetch(`/api/follow?userId=${profile.id}`);
			if (response.ok) {
				const result = await response.json();
				isFollowing = result.isFollowing;

				isFollowedBy = result.isFollowedBy;
			} else if (response.status === 409) {
				isSelf = true;
			} else {
				const error = await response.json();
				toast.error(error.error);
			}
		} catch (error) {
			if (isSelf) return;
		}
	}

	let avatar: string | undefined = $state();

	onMount(async () => {
		const lyntsPromise = fetchUserLynts(false);
		await fetchProfile();
		await Promise.all([lyntsPromise, checkFollowStatus()]);
		loading = false;
		if (profile) avatar = cdnUrl(profile.id, 'big');
	});

	$effect(() => {
		const el = userLyntsContainer;
		if (!el) return;
		el.addEventListener('scroll', handleUserLyntsScroll);
		return () => el.removeEventListener('scroll', handleUserLyntsScroll);
	});
</script>

{#if showSettings && profile}
	<ProfileSettings
		userId={profile.id}
		username={profile.username}
		bio={profile.bio}
		banner={profile.banner}
		rugplayUsername={profile.rugplay_username}
		rugplayEnhancementsEnabled={profile.rugplay_enhancements_enabled}
		rugplayKeyValid={profile.rugplay_key_valid}
		rugplayKeySet={profile.rugplay_key_set}
		nameColor={profile.name_color}
		verified={profile.verified}
		profileSongType={profile.profile_song_type}
		profileSongUrl={profile.profile_song_url}
		profileSongTitle={profile.profile_song_title}
		profileSongVolume={profile.profile_song_volume}
		profileSongLoop={profile.profile_song_loop}
		emailNotificationsEnabled={profile.email_notifications_enabled}
		notificationEmailSet={profile.notification_email_set}
		onback={() => (showSettings = false)}
	/>
{:else if loading}
	<LoadingSpinner />
{:else if profile}
	<div class="h-full w-full flex-grow overflow-hidden pl-1">
		<div
			class="mr-[-17px] h-full overflow-y-auto overflow-x-hidden pr-[17px]"
			bind:this={userLyntsContainer}
		>
			<div class="mt-2">

				<!-- Banner -->
				{#if profile.banner}
					<div class="mb-3 h-36 w-full overflow-hidden rounded-lg">
						<img
							src={`${PUBLIC_CDN_URL}/lyntr/${profile.banner}?v=${Math.random()}`}
							alt="Profile banner"
							class="h-full w-full object-cover"
						/>
					</div>
				{/if}

				<div class="flex items-center justify-between px-2">
					<div class="flex min-w-0 items-center gap-4">
						<Avatar size={40} src={avatar} alt={profile.username} border={true} userId={profile.id} />
						<div class="flex min-w-0 flex-col gap-2">
							<!-- Name + badges row -->
							<div class="flex flex-wrap items-center gap-2">
								<Label class="text-2xl font-bold text-primary"><UserName name={profile.username} color={profile.name_color} verified={profile.verified} /></Label>
								<UserBadges
									verified={profile.verified}
									isAdmin={profile.is_admin}
									contributor={profile.contributor}
									loginStreak={profile.login_streak}
									followerCount={followersCount}
									followsViewer={isFollowedBy}
								/>
								{#if profile.pinned_achievement_key && ACHIEVEMENT_BY_KEY[profile.pinned_achievement_key]}
									{@const pinned = ACHIEVEMENT_BY_KEY[profile.pinned_achievement_key]}
									<span
										class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
										style={`box-shadow: 0 0 0 1.5px ${tierColor(pinned.tier)};`}
										title={`${pinned.name} â€” ${pinned.description}`}
									>
										<img src={`/achievements/${pinned.icon}`} alt={pinned.name} class="h-4 w-4 object-contain" />
									</span>
								{/if}
							</div>

							<p class="text-xl text-muted-foreground">@{profile.handle}</p>

							{#if profile.profile_song_type}
								<ProfileSongPlayer
									type={profile.profile_song_type}
									url={profile.profile_song_url ?? null}
									title={profile.profile_song_title}
									volume={profile.profile_song_volume}
									loop={profile.profile_song_loop}
								/>
							{/if}

							<div class="w-full">
								{#if isSelf}
									<Button class="w-full" on:click={() => (showSettings = true)}>Edit Profile</Button>
								{:else}
									<div class="flex flex-col gap-2">
										<Button class="w-full" on:click={toggleFollow} disabled={followInFlight}>
											{isFollowing ? 'Unfollow' : 'Follow'}
										</Button>
										<Button
											variant="outline"
											class="w-full"
											on:click={async () => {
												if (!profile) return;
												await fetch('/api/dm/conversations', {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify({ target_handle: profile.handle })
												});
												currentPage.set('messages');
											}}
										>
											Message
										</Button>
									</div>
								{/if}
							</div>

							{#if isFollowedBy && !isSelf}
								<p class="text-sm text-muted-foreground">Follows you</p>
							{/if}
						</div>
					</div>
					<div class="md:hidden {!isSelf ? 'hidden' : ''}">
						<ProfileButton />
					</div>
				</div>

				<div class="mt-4 inline-flex flex-wrap items-center gap-4">
					<button
						type="button"
						class="cursor-pointer bg-transparent p-0 font-bold text-primary hover:underline"
						onclick={toggleFollowingPopup}
					>
						{followingCount.toLocaleString()} following
					</button>
					<button
						type="button"
						class="cursor-pointer bg-transparent p-0 font-bold text-primary hover:underline"
						onclick={toggleFollowersPopup}
					>
						{followersCount.toLocaleString()} followers
					</button>
					<span class="inline-flex items-center gap-1.5 font-bold text-primary" title="Community XP">
						<img src="/gem_badge.png" alt="Community XP" class="h-7 w-7 flex-shrink-0" />
						{(profile.lynt_coins ?? 0).toLocaleString()} XP
					</span>
					<span class="inline-flex items-center gap-1.5 font-bold text-primary" title="Aura Score">
						<img src="/aura.png" alt="Aura Score" class="h-6 w-6 flex-shrink-0" />
						{(profile.aura_score ?? 0).toLocaleString()} Aura Â· {auraTier(profile.aura_score ?? 0)}
					</span>
				</div>

				<FollowListPopup userId={profile.id} type="following" isOpen={showFollowingPopup} onClose={toggleFollowingPopup} />
				<FollowListPopup userId={profile.id} type="followers" isOpen={showFollowersPopup} onClose={toggleFollowersPopup} />

				<blockquote class="my-4 flex flex-col gap-2 border-s-4 border-muted-foreground bg-border p-4">
					<Label class="text-lg font-bold text-primary">About me</Label>
					<p>{profile.bio}</p>
					<div class="flex items-center justify-between">
						<div class="flex select-none items-center gap-2 rounded-[4px] bg-gradient-gloss px-1.5 py-0.5 text-base font-semibold text-primary-foreground font-[family-name:var(--font-retro)] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] transition-[filter] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
							<Brain />
							<span>{profile.iq}</span>
						</div>
						<div class="inline-flex select-none items-center gap-2 rounded-[4px] bg-gradient-gloss px-1.5 py-0.5 text-base font-semibold text-primary-foreground font-[family-name:var(--font-retro)] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] transition-[filter] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
							<Calendar />
							<p>Joined: {new Date(profile.created_at).toLocaleDateString()}</p>
						</div>
					</div>
					{#if profile.rugplay_username}
						<div class="mt-3">
							<NetWorthBadge handle={profile.handle} />
						</div>
					{/if}

					<div class="mt-3 flex flex-col gap-2">
						<Button
							size="sm"
							variant="secondary"
							class="w-fit gap-1.5"
							onclick={vibeCheck}
							disabled={vibeRolling}
						>
							<img
								src="/aura.png"
								alt=""
								class={`h-4 w-4 flex-shrink-0 ${vibeRolling ? 'animate-spin' : ''}`}
							/>
							Aura Verifier Pro 100% Max
						</Button>
						{#if vibeLine}
							<p class="vibe-line text-sm italic text-muted-foreground">{vibeLine}</p>
						{/if}
					</div>

					<div class="mt-4">
						<button
							type="button"
							class="flex w-full items-center justify-between text-left"
							onclick={() => currentPage.set('achievements')}
						>
							<Label class="cursor-pointer text-sm font-bold text-primary">
								Achievements
								<span class="text-muted-foreground font-normal">
									({(profile.achievements ?? []).length}/{ACHIEVEMENT_CATALOG.length})
								</span>
							</Label>
							<span class="text-muted-foreground text-xs">View all â†’</span>
						</button>
						<Progress
							value={(profile.achievements ?? []).length}
							max={ACHIEVEMENT_CATALOG.length}
							class="mt-1.5 h-1.5"
						/>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each ACHIEVEMENT_CATALOG.slice(0, 8) as achievement (achievement.key)}
								{@const unlocked = (profile.achievements ?? []).some((a) => a.key === achievement.key)}
								{@const hidden = achievement.secret && !unlocked}
								<div
									class="achievement-badge flex h-9 w-9 items-center justify-center rounded-full transition-opacity"
									class:opacity-30={!unlocked}
									style={`background: ${unlocked ? tierColor(achievement.tier) + '22' : 'transparent'};`}
									title={hidden ? '??? â€” keep using Lyntr to find out.' : `${achievement.name} â€” ${achievement.description}${unlocked ? '' : ' (locked)'}`}
								>
									{#if hidden}
										<span class="text-muted-foreground text-xs font-bold">?</span>
									{:else}
										<img
											src={`/achievements/${achievement.icon}`}
											alt={achievement.name}
											class={`h-5 w-5 object-contain ${unlocked ? '' : 'grayscale'}`}
										/>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</blockquote>
			</div>

			<div class="flex max-w-[600px] flex-col gap-3">
				<Separator class="mt-3" />
				<TopTab {tabs} {currentTab} onTabChange={handleTabChange} />
				<Separator />
				{#if userLynts.length === 0}
					<p>No lynts yet.</p>
				{:else}
					{#each userLynts as lynt (lynt.id)}
						<Lynt {...lynt} {myId} lyntClick={handleLyntClick} />
					{/each}
					{#if loadingMoreUserLynts}
						<p class="text-muted-foreground py-2 text-center text-xs">Loading more...</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{:else}
	<p>Profile not found.</p>
{/if}

<svelte:head>
	{#if loading}
		<title>Loading... | Lyntr</title>
	{:else if profile}
		<title>{profile.username} (@{profile.handle}) | Lyntr</title>
		<meta property="og:title" content="{profile.username} (@{profile.handle}) | IQ: {profile.iq}" />
		<meta property="og:type" content="website" />
		<meta property="og:image" content="{PUBLIC_CDN_URL}/lyntr/{profile.id}.webp" />
		<meta property="og:url" content="https://lyntr.gizmowizard.tech/@{profile.handle}" />
		<meta property="og:description" content="{profile.bio}" />
		<meta name="description" content="Lyntr is a micro-blogging social media with an IQ test." />
	{:else}
		<title>Profile not found | Lyntr</title>
	{/if}
</svelte:head>

<style>
	.vibe-line {
		animation: vibe-fade-in 0.25s ease-out;
	}

	@keyframes vibe-fade-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>


