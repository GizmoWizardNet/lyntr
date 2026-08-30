<script lang="ts">
	import { mode } from 'mode-watcher';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Reply, X } from 'lucide-svelte';

	import { cdnUrl, v } from './stores';

	import Lynt from './Lynt.svelte';
	import Navigation from './Navigation.svelte';
	import PostButton from './PostButton.svelte';
	import ProfileButton from './ProfileButton.svelte';
	import VisitorCounter from './VisitorCounter.svelte';
	import BlinkText from './BlinkText.svelte';
	import UnderConstructionBanner from './UnderConstructionBanner.svelte';
	import { onDestroy, onMount } from 'svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import SkeletonFeed from './SkeletonFeed.svelte';
	import { toast } from 'svelte-sonner';
	import { working } from '$lib/working';
	import { currentPage, onlineUsers, typingUsers, viewerCounts, wsConnected, bookmarkToggled } from './stores';
	import { wsClient } from '$lib/ws-client';
	import Search from './Search.svelte';
	import Notifications from './Notifications.svelte';
	import ProfilePage from './ProfilePage.svelte';
	import MentionAutocomplete from './MentionAutocomplete.svelte';
	import { goto } from '$app/navigation';
	import TopTab from './TopTab.svelte';
	import AutoRefreshControl from './AutoRefreshControl.svelte';
	import ForumPage from './Forum/ForumPage.svelte';
	import ScrollablesPage from './scrollables/ScrollablesPage.svelte';
	import CoinPop from './CoinPop.svelte';
	import AchievementPop from './AchievementPop.svelte';
	import AchievementsPage from './Achievements/AchievementsPage.svelte';
	import LeaderboardPage from './Leaderboard/LeaderboardPage.svelte';
	import DMPage from './DMPage.svelte';
	import TrendingSidebar from './TrendingSidebar.svelte';
	import Composer from './Composer.svelte';
	import type { FeedItem } from './stores';

	interface Props {
		username: string;
		handle: string;
		id: string;
		lyntOpened?: string | null;
		profileOpened?: string | null;
		default_feed?: string | null;
	}

	let {
		username,
		handle,
		id,
		lyntOpened = $bindable(null),
		profileOpened = null,
		default_feed = null
	}: Props = $props();

	let loadingFeed = $state(true);
	let page: string = $state('home');

	currentPage.subscribe((value) => { page = value; });

	let feed: FeedItem[] = $state([]);
	let comments: FeedItem[] = $state([]);
	let selectedLynt: FeedItem | null = $state(null);
	let referencedLynts: FeedItem[] = $state([]);
	let loadingComments = $state(false);

	// Falls back to 'For you' if the person hasn't set a platform default,
	// or if the tab it's set to isn't one 'type' actually recognizes
	// (defensive — e.g. a tab getting renamed/removed later).
	const VALID_TABS = ['For you', 'New', 'Following', 'Bookmarked'];
	let currentTab = $state(default_feed && VALID_TABS.includes(default_feed) ? default_feed : 'For you');
	// IQ filter shared visually with the Scrollables page — 0 means "off".
	let minIqFilter = $state(0);
	const tabs = ['For you', 'Following', 'New', 'Bookmarked'];

	// ── WebSocket ──────────────────────────────────────────────────
	// Pill that appears when new lynts arrive on non-New tabs
	let newLyntsAvailable = $state(false);
	let newLyntCount = $state(0);
	let wsUnsubscribers: Array<() => void> = [];

	function connectWS() {
		wsClient.connect();

		wsUnsubscribers.push(
			wsClient.on('_connected', () => { $wsConnected = true; }),
			wsClient.on('_disconnected', () => { $wsConnected = false; }),

			// ── Presence ─────────────────────────────────────────
			wsClient.on('presence_init', (data) => {
				onlineUsers.init(data.onlineUserIds);
			}),
			wsClient.on('presence_update', (data) => {
				if (data.online) onlineUsers.setOnline(data.userId);
				else onlineUsers.setOffline(data.userId);
			}),

			// ── New lynt posted ──────────────────────────────────
			wsClient.on('new_lynt', async (data) => {
				if (currentTab === 'New') {
					// On the Live tab: auto-insert at top immediately
					await renderLyntAtTop(data.lyntId);
				} else {
					// On other tabs: show a "N new posts" pill
					newLyntCount++;
					newLyntsAvailable = true;
				}
			}),

			// ── Like count changed (now broadcast to everyone, live) ──
			wsClient.on('like_update', (data) => {
				feed = feed.map((lynt) => {
					if (lynt.id === data.lyntId) {
						return {
							...lynt,
							likeCount: data.likeCount,
							likedByUser: data.liked !== undefined ? data.liked : lynt.likedByUser
						};
					}
					return lynt;
				});
				if (selectedLynt?.id === data.lyntId) {
					selectedLynt = {
						...selectedLynt,
						likeCount: data.likeCount,
						likedByUser: data.liked !== undefined ? data.liked : selectedLynt.likedByUser
					};
				}
				comments = comments.map((c) => {
					if (c.id === data.lyntId) return { ...c, likeCount: data.likeCount };
					return c;
				});
			}),

			// ── Repost count changed (live, same pattern as like_update) ──
			wsClient.on('repost_update', (data) => {
				feed = feed.map((lynt) => {
					if (lynt.id === data.lyntId) {
						return {
							...lynt,
							repostCount: data.repostCount,
							repostedByUser: data.reposted !== undefined ? data.reposted : lynt.repostedByUser
						};
					}
					return lynt;
				});
				if (selectedLynt?.id === data.lyntId) {
					selectedLynt = {
						...selectedLynt,
						repostCount: data.repostCount,
						repostedByUser: data.reposted !== undefined ? data.reposted : selectedLynt.repostedByUser
					};
				}
				comments = comments.map((c) => {
					if (c.id === data.lyntId) return { ...c, repostCount: data.repostCount };
					return c;
				});
			}),

			// ── Poll vote/resolve on any lynt with a poll (live tallies for
			// everyone watching; each viewer's own my_votes/voted stays local,
			// only counts + resolved_at come over the wire) ─────────────
			wsClient.on('poll_update', (data) => {
				const patchPoll = (poll: any) => {
					if (!poll) return poll;
					const votesById = new Map(data.options.map((o: any) => [o.id, o.votes]));
					return {
						...poll,
						total_votes: data.total_votes,
						resolved_at: data.resolved_at ?? poll.resolved_at,
						options: poll.options.map((o: any) => ({
							...o,
							votes: votesById.has(o.id) ? votesById.get(o.id) : o.votes
						}))
					};
				};
				feed = feed.map((lynt) =>
					lynt.id === data.lyntId && (lynt as any).poll ? { ...lynt, poll: patchPoll((lynt as any).poll) } : lynt
				);
				if (selectedLynt?.id === data.lyntId && (selectedLynt as any).poll) {
					selectedLynt = { ...selectedLynt, poll: patchPoll((selectedLynt as any).poll) } as any;
				}
			}),

			// ── New comment on open lynt ─────────────────────────
			// Note: the author, the commenter, AND anyone else with the
			// thread's panel open (watch_lynt room) can all receive this for
			// the same comment now that replies broadcast to viewers too —
			// the `exists` check below isn't just a dedupe nicety, it's load-
			// bearing: without gating the commentCount bump on it, a user who
			// is both the author/commenter *and* has the panel open would
			// get the event twice and double-count.
			wsClient.on('new_comment', (data) => {
				let isNew = true;
				if (selectedLynt?.id === data.lyntId) {
					isNew = !comments.some((c) => c.id === data.comment.id);
					if (isNew) comments = [data.comment, ...comments];
					if (isNew && selectedLynt) {
						selectedLynt = {
							...selectedLynt,
							commentCount: Number(selectedLynt.commentCount) + 1
						};
					}
				}
				if (isNew) {
					feed = feed.map((lynt) => {
						if (lynt.id === data.lyntId) {
							return { ...lynt, commentCount: Number(lynt.commentCount) + 1 };
						}
						return lynt;
					});
				}
			}),

			// ── Comment count changed without a new_comment event (i.e. a
			// reply was deleted, not added — new_comment already handles
			// the increment case) ──────────────────────────────────────
			wsClient.on('comment_count_update', (data) => {
				feed = feed.map((lynt) =>
					lynt.id === data.lyntId ? { ...lynt, commentCount: data.commentCount } : lynt
				);
				if (selectedLynt?.id === data.lyntId) {
					selectedLynt = { ...selectedLynt, commentCount: data.commentCount };
				}
			}),

			// ── Reaction tally changed on a lynt ──────────────────
			// Server sends the full current tally (not a per-user delta —
			// see broadcastReactionUpdate), so this is a plain overwrite;
			// each viewer's own reactedByUser flag was already computed
			// server-side per-request, but since this broadcast has no
			// per-viewer view, ReactionBar derives "did I react" from
			// whichever emoji(s) it already knew were reactedByUser and
			// just refreshes counts — it re-fetches the lynt on next open
			// for a fully authoritative reactedByUser if it drifts.
			wsClient.on('reaction_update', (data) => {
				const patch = (lynt: any) => (lynt.id === data.lyntId ? { ...lynt, reactions: data.reactions } : lynt);
				feed = feed.map(patch);
				comments = comments.map(patch);
				if (selectedLynt?.id === data.lyntId) {
					selectedLynt = patch(selectedLynt);
				}
			}),

			// ── Live edit sync ────────────────────────────────────
			// Patches content/has_link/edited_at anywhere the lynt is
			// currently rendered — feed card, open detail panel, and the
			// comments list (edited replies show up there too) — so an
			// edit is visible to everyone watching without a refetch.
			wsClient.on('lynt_edited', (data) => {
				const patch = (lynt: any) =>
					lynt.id === data.lyntId
						? { ...lynt, content: data.content, has_link: data.hasLink, edited_at: data.editedAt }
						: lynt;
				feed = feed.map(patch);
				comments = comments.map(patch);
				if (selectedLynt?.id === data.lyntId) {
					selectedLynt = patch(selectedLynt);
				}
			}),

			// ── Lynt (or a cascade-deleted reply/repost of it) removed —
			// live for everyone, not just the person who deleted it. If it's
			// the currently open lynt, back out of it with a toast instead of
			// leaving the viewer stuck looking at content that's gone (or
			// hitting a 404 on their next click). Comments to it get spliced
			// out too, matching the DB cascade. ──────────────────────────
			wsClient.on('lynt_deleted', (data) => {
				feed = feed.filter((lynt) => lynt.id !== data.lyntId);
				comments = comments.filter((c) => c.id !== data.lyntId);
				if (selectedLynt?.id === data.lyntId) {
					toast.info('This lynt was deleted.');
					lyntOpened = null;
					selectedLynt = null;
					wsClient.unwatchLynt();
				}
			}),

			// ── Typing indicators (new) ───────────────────────────
			wsClient.on('typing_start', (data) => {
				typingUsers.start(data.lyntId, data.userId);
			}),
			wsClient.on('typing_stop', (data) => {
				typingUsers.stop(data.lyntId, data.userId);
			}),

			// ── Live viewer counts (new) ──────────────────────────
			wsClient.on('viewer_count', (data) => {
				viewerCounts.set(data.lyntId, data.count);
			})
		);
	}

	async function loadNewLynts() {
		newLyntsAvailable = false;
		newLyntCount = 0;
		loadingFeed = true;
		feed = [];
		await fetchFeed();
	}

	// ── Tab / Feed ──────────────────────────────────────────────────
	function handleTabChange(tab: string) {
		currentTab = tab;
		newLyntsAvailable = false;
		newLyntCount = 0;
		loadingFeed = true;
		feed = [];
		fetchFeed();
	}

	let feedContainer: HTMLDivElement = $state();
	let loadingBottomFeed = false;

	function handleScroll() {
		if (feedContainer) {
			const { scrollTop, scrollHeight, clientHeight } = feedContainer;
			if (scrollTop + clientHeight >= scrollHeight - 5 && !loadingBottomFeed) {
				loadingBottomFeed = true;
				fetchFeed(true).then(() => { loadingBottomFeed = false; });
			}
		}
	}

	if (lyntOpened !== null && lyntOpened !== '') {
		(async () => {
			selectedLynt = await getLynt(lyntOpened);
			comments = await getComments(lyntOpened);
		})();
	} else if (profileOpened !== null) {
		page = `profile${profileOpened}`;
	}

	async function getLynt(lyntOpened: string) {
		const response = await fetch('api/lynt?id=' + lyntOpened, { method: 'GET' });
		if (response.status !== 200) toast.error('Error loading lynt!');
		const res = await response.json();
		referencedLynts = res.referencedLynts || [];
		return res as FeedItem;
	}

	// The "For you" tab is a multi-factor ranked feed, so it can't use a
	// plain created_at cursor — its ordering shifts between requests. It
	// keeps using excludePosts (capped, to match the server-side cap).
	// Every other tab now uses a real cursor (the sort column of the
	// oldest item already loaded), so "load more" actually advances
	// instead of silently re-fetching the same page.
	function cursorFor(tab: string, lastItem: any): string | null {
		if (!lastItem) return null;
		if (tab === 'Liked') return lastItem.likedAt ?? null;
		if (tab === 'Bookmarked') return lastItem.savedAt ?? null;
		return lastItem.createdAt ? new Date(lastItem.createdAt).toISOString() : null;
	}

	async function fetchFeed(append = false) {
		const params = new URLSearchParams({ type: currentTab });
		if (minIqFilter) params.set('minIq', String(minIqFilter));

		if (append && feed.length > 0) {
			if (currentTab === 'For you') {
				params.set('excludePosts', feed.map((post: any) => post.id).slice(-200).join(','));
			} else {
				const before = cursorFor(currentTab, feed[feed.length - 1]);
				if (before) params.set('before', before);
			}
		}

		const response = await fetch(`api/feed?${params.toString()}`, { method: 'GET' });

		if (response.status !== 200) {
			toast.error('Error generating feed! Please refresh the page');
			loadingFeed = false;
			return;
		}

		const res = await response.json();
		const newPosts = res.lynts.map((post: any) => ({ ...post }));

		if (append) {
			const uniqueNewPosts = newPosts.filter(
				(newPost: any) => !feed.some((existingPost: any) => existingPost.id === newPost.id)
			);
			feed = feed.concat(uniqueNewPosts);
			if (feed.length > 250) feed = feed.slice(50);
		} else {
			feed = newPosts;
		}

		loadingFeed = false;
	}

	function updateURL(newPath: string) {
		goto(newPath, { replaceState: true, noScroll: true });
	}

	async function handleLyntClick(clickedId: string) {
		loadingComments = true;
		lyntOpened = clickedId;
		referencedLynts = [];
		selectedLynt = feed.find((lynt) => lynt.id === lyntOpened) || (await getLynt(lyntOpened));
		comments = await getComments(lyntOpened);
		loadingComments = false;
		wsClient.watchLynt(clickedId);
		if (!page.startsWith('profile')) updateURL(`/?id=${clickedId}`);
	}

	async function getComments(lyntId: string) {
		const response = await fetch('api/comments?id=' + lyntId, { method: 'GET' });
		if (response.status !== 200) {
			toast.error(`Failed to load comments! Error: ${response.status} | ${response.statusText}`);
		}
		const res = await response.json();
		return res.map((post: any) => ({ ...post }));
	}

	function onReplyPosted(newComment: FeedItem) {
		if (selectedLynt) wsClient.stopTyping(selectedLynt.id);
		toast.success('Your reply has been posted!');
		const exists = comments.some((c) => c.id === newComment.id);
		if (!exists) comments = [newComment, ...comments];
		if (selectedLynt) {
			selectedLynt = { ...selectedLynt, commentCount: Number(selectedLynt.commentCount) + 1 };
		}
	}

	// Live-reflect bookmark toggles fired from anywhere (feed card, opened
	// lynt, profile page). Only the Bookmarked tab needs to react — an
	// unbookmark there should make the item vanish immediately instead of
	// staying until the next manual refresh; other tabs don't care since
	// bookmark state doesn't affect whether a lynt belongs there.
	let unsubBookmarkToggle: () => void;

	onMount(async () => {
		fetchFeed();
		connectWS();
		if (feedContainer) {
			feedContainer.addEventListener('scroll', handleScroll);
		}
		unsubBookmarkToggle = bookmarkToggled.subscribe((event) => {
			if (!event || currentTab !== 'Bookmarked') return;
			if (!event.bookmarked) {
				feed = feed.filter((lynt) => lynt.id !== event.lyntId);
			}
		});
	});

	onDestroy(() => {
		if (feedContainer) feedContainer.removeEventListener('scroll', handleScroll);
		unsubBookmarkToggle?.();
		wsUnsubscribers.forEach((unsub) => unsub());
		wsClient.unwatchLynt();
		wsClient.disconnect();
	});

	async function renderLyntAtTop(lyntId: string) {
		const lynt = await getLynt(lyntId);
		// Avoid duplicates
		if (!feed.some((f) => f.id === lyntId)) {
			feed = [lynt, ...feed];
		}
	}

</script>

<div class="flex w-full justify-center">
	<CoinPop />
	<AchievementPop />
	<div class="w-full max-w-[1400px]">
		<div class="flex h-dvh w-full flex-col overflow-hidden md:flex-row">
			<!-- Bottom nav bar (mobile) / left sidebar (desktop) -->
			<div
				class="mobile-nav-ribbon fixed inset-x-2 bottom-2 z-50 rounded-[8px] md:static md:inset-auto md:rounded-none"
				style="padding-bottom: env(safe-area-inset-bottom, 0px);"
			>
				<div class="md:max-w-1/3 flex w-full flex-row items-center gap-1 px-2 py-1.5 md:w-auto md:flex-col md:items-start md:gap-2 md:px-0 md:py-2 md:pt-0">
					<button class="mt-5 hidden md:block">
						<img class="mb-5 size-20" src={mode.current === "dark" ? "logo_dark.svg" : "logo_light.svg"} alt="Logo" />
					</button>
					<div class="hidden md:block md:w-full md:text-center md:-mt-3 md:mb-2">
					</div>
					<Navigation {handle} {id} onPosted={(newLynt) => {
						if (!feed.some((f) => f.id === newLynt.id)) feed = [newLynt, ...feed];
					}} />
					<div class="hidden md:flex md:w-full md:flex-col">
						<PostButton userId={id} onPosted={(newLynt) => {
						if (!feed.some((f) => f.id === newLynt.id)) feed = [newLynt, ...feed];
					}} />
						<ProfileButton src={cdnUrl(id, 'medium')} name={username} handle="@{handle}" />
					</div>
				</div>
				<Separator class="hidden h-[1px] w-full md:block md:h-full md:w-[1px]" />
			</div>

			<!-- Main content — scrolls independently above the fixed bottom nav -->
			<div class="flex h-full w-full flex-col items-center gap-1 overflow-hidden pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:flex-row md:items-start md:pb-0">
				<div class="flex h-full w-full max-w-[600px] flex-col overflow-hidden px-3 md:px-1 {lyntOpened && selectedLynt ? 'hidden md:flex' : ''} {page === 'forum' ? 'md:max-w-[900px]' : ''} {page === 'messages' ? 'md:max-w-[700px]' : ''} {page === 'scrollables' ? '!max-w-[480px] !px-0' : ''}">
					{#if page === 'search'}
						<Search userId={id} {handleLyntClick} />
					{:else if page === 'forum'}
						<ForumPage myId={id} />
					{:else if page === 'scrollables'}
						<ScrollablesPage myId={id} />
					{:else if page === 'leaderboard'}
						<LeaderboardPage />
					{:else if page === 'achievements'}
						<AchievementsPage />
					{:else if page === 'notifications'}
						<Notifications {handleLyntClick} />
					{:else if page === 'messages'}
						<DMPage myId={id} />
					{:else if page.startsWith('profile')}
						{#key page}
							<ProfilePage
								myId={id}
								profileHandle={page.replace('profile', '')}
								{handleLyntClick}
							/>
						{/key}
					{:else if page === 'home'}
						<div class="min-w-1/3 mt-5 flex h-full flex-col md:px-1">
							<TopTab {tabs} {currentTab} onTabChange={handleTabChange} />
							<div class="mt-2 flex items-center justify-end gap-2">
								<label for="iq-filter" class="font-[family-name:var(--font-retro)] text-xs text-muted-foreground">Min IQ:</label>
								<select
									id="iq-filter"
									class="rounded-[4px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] bg-input px-2 py-1 font-[family-name:var(--font-retro)] text-xs shadow-[var(--inset-shadow)]"
									bind:value={minIqFilter}
									onchange={() => fetchFeed()}
								>
									<option value={0}>Any</option>
									<option value={100}>100+</option>
									<option value={115}>115+</option>
									<option value={130}>130+</option>
									<option value={145}>145+</option>
								</select>
								<AutoRefreshControl onRefresh={() => fetchFeed()} storageKey="lyntr_feed" />
							</div>
							<Separator class="mt-4" />

							<!-- Live connection status (new) -->
							{#if !$wsConnected}
								<div class="mx-auto mt-2 flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
									<span class="size-2 animate-pulse rounded-full bg-yellow-500"></span>
									Reconnecting…
								</div>
							{/if}

							<!-- New posts pill -->
							{#if newLyntsAvailable}
								<button
									onclick={loadNewLynts}
									class="mx-auto mt-2 flex items-center gap-2 rounded-full bg-gradient-gloss px-4 py-1.5 text-sm font-semibold text-primary-foreground font-[family-name:var(--font-retro)] border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow)] transition-[filter] hover:brightness-110"
								>
									↑ {newLyntCount} new {newLyntCount === 1 ? 'lynt' : 'lynts'}
								</button>
							{/if}

							<!-- Feed -->
							<div
								class="flex h-full w-full flex-col gap-2 overflow-y-auto px-1 py-2"
								bind:this={feedContainer}
							>
								{#if loadingFeed}
									<SkeletonFeed count={6} />
								{:else}
									{#each feed as lynt (lynt.id)}
										<Lynt {...lynt} myId={id} lyntClick={handleLyntClick} />
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>

				{#if page === 'home' && !(lyntOpened && selectedLynt)}
					<div
						class="hidden h-full shrink-0 overflow-y-auto px-4 lg:block"
					>
					<TrendingSidebar myId={id} />
					</div>
				{/if}

				{#if lyntOpened && selectedLynt}
					<div class="mb-2 h-full w-full max-w-[530px] pb-10">
						<button
							class="flex w-full justify-end p-2 md:justify-start"
							onclick={() => { lyntOpened = null; selectedLynt = null; wsClient.unwatchLynt(); }}
						><X /></button>
						<div
							class="md:min-w-1/2 mx-auto flex h-full max-w-[600px] flex-col gap-2 overflow-y-auto overflow-x-hidden px-1 md:mx-0"
							id="lynt-container"
						>
							<!-- Referenced Lynts -->
							<div class="w-full">
								{#each referencedLynts as lynt (lynt.id)}
									<Lynt {...lynt} myId={id} lyntClick={handleLyntClick} connect={true} />
								{/each}
							</div>

							<!-- Selected Lynt -->
							<div class="w-full" id="selected-lynt">
								<Lynt
									{...selectedLynt}
									myId={id}
									truncateContent={false}
									lyntClick={handleLyntClick}
								/>
							</div>

							<!-- Live viewer count + typing indicator (new) -->
							{#if ($viewerCounts.get(selectedLynt.id) ?? 0) > 1}
								<div class="px-3 text-xs text-muted-foreground">
									👁 {$viewerCounts.get(selectedLynt.id)} people viewing this lynt right now
								</div>
							{/if}
							{#if ($typingUsers.get(selectedLynt.id)?.size ?? 0) > 0}
								<div class="px-3 text-xs italic text-muted-foreground">
									{$typingUsers.get(selectedLynt.id)?.size === 1 ? 'Someone is' : `${$typingUsers.get(selectedLynt.id)?.size} people are`} typing a reply…
								</div>
							{/if}

							<div class="reply-bar relative flex w-full items-start gap-2 p-3">
								<Reply size={32} class="mt-2 flex-shrink-0" />
								<div class="w-full">
									<Composer
										submitUrl="/api/comment"
										draftKey={`compose:reply:${selectedLynt.id}`}
										placeholder="Reply..."
										submitLabel="Reply"
										allowPoll={false}
										extraFields={{ id: selectedLynt.id }}
										onPosted={onReplyPosted}
										onTypingStart={() => selectedLynt && wsClient.startTyping(selectedLynt.id)}
										onTypingStop={() => selectedLynt && wsClient.stopTyping(selectedLynt.id)}
									/>
								</div>
							</div>
							<Separator />
							{#if loadingComments}
								<LoadingSpinner occupy_screen={false} />
							{:else if comments.length === 0}
								<div class="flex flex-col items-center gap-2 px-2 py-3">
									<UnderConstructionBanner text="🚧 NO COMMENTS YET — BE THE FIRST! 🚧" />
									<Label class="flex justify-center text-sm text-muted-foreground">This lynt has no comments.</Label>
								</div>
							{:else}
								{#each comments as lynt (lynt.id)}
									<Lynt {...lynt} myId={id} lyntClick={handleLyntClick} />
								{/each}
							{/if}
							<div class="flex h-full w-full flex-col gap-2 overflow-y-auto"></div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<svelte:head>
	{#if page === 'home'}
		{#if selectedLynt}
			<title>{selectedLynt.username} on Lyntr: "{selectedLynt.content}"</title>
		{:else}
			<title>Lyntr</title>
		{/if}
	{/if}
</svelte:head>