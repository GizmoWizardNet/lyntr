import type { PageServerLoad } from './$types';
import { getLynt } from "$lib/server/lynt"
import { stripMarkdownForOg } from '$lib/ogText';
import { PUBLIC_CDN_URL } from '$env/static/public';
import { newFeed } from './api/feed/new';
import { mainFeed } from './api/feed/main';
import { hydratePolls } from './api/util';
import { scrollableFeed } from '$lib/server/scrollables';

const TIMESTAMP_OPTS: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
};

export const load: PageServerLoad  = async ({ url, cookies, parent }) => {
    const id = url.searchParams.get('id');
    const hasAuthCookie = !!cookies.get('_TOKEN__DO_NOT_SHARE');

    // user comes from the root +layout.server.ts (runs once per request,
    // shared by every route) instead of being re-fetched here.
    const parentData = await parent();
    const user = parentData.user;

    // getLynt/publicFeed/publicScrollables only matter for logged-out
    // visitors — no reason to run them (or wait on them one at a time)
    // for someone we already know is authenticated.
    const [lynt, publicFeedRaw, publicScrollables] = await Promise.all([
        getLynt(id || ''),
        hasAuthCookie ? Promise.resolve([]) : newFeed(null),
        hasAuthCookie ? Promise.resolve([]) : scrollableFeed(null)
    ]);

    const publicFeed = hydratePolls(publicFeedRaw);

    // Seed the first page of the logged-in feed straight into the SSR
    // response so MainPage doesn't have to mount, hydrate, and then fire
    // a client-side fetch before anything but a spinner shows up. Only
    // done for the "For you" tab (the default, and by far the most
    // common `default_feed`) — other tabs fall back to MainPage's
    // existing client-side fetchFeed, same as before.
    // Only worth doing on a genuine fresh load, not every in-app
    // navigation that just changes `?id=` while MainPage stays mounted
    // (MainPage only consumes this prop once, at creation, so refetching
    // it here on every lynt click would just be a wasted query).
    // Same shape the client's own fetchFeed() already treats as loosely
    // typed (`res.lynts.map((post: any) => ...)`) — the DB row shape and
    // the client-side FeedItem type aren't nominally related, so this
    // boundary has always been an implicit `any` contract, not something
    // this change is introducing.
    let initialFeed: any[] | null = null;
    if (!id && user && (!user.default_feed || user.default_feed === 'For you')) {
        try {
            const feedRows = await mainFeed(user.id, 20, [], null);
            initialFeed = hydratePolls(feedRows);
        } catch (error) {
            console.error('Failed to SSR-seed initial feed:', error);
        }
    }

    let og = null;
    if (lynt) {
        const strippedContent = stripMarkdownForOg(lynt.content);
        const timestamp = new Date(lynt.createdAt ?? Date.now()).toLocaleString('en-US', TIMESTAMP_OPTS);

        const image = lynt.has_image
            ? `${PUBLIC_CDN_URL}/lyntr/${lynt.id}.webp`
            : lynt.gif_preview_url || lynt.gif_url
                ? (lynt.gif_preview_url ?? lynt.gif_url)
                : `${PUBLIC_CDN_URL}/lyntr/${lynt.userId}_medium.webp`;

        const description = lynt.parentUserHandle
            ? `${strippedContent} — replying to @${lynt.parentUserHandle} · ${timestamp}`
            : `${strippedContent} · ${timestamp}`;

        og = {
            title: `${lynt.username} (@${lynt.handle})`,
            description,
            image,
        };
    }

    return {
        lynt,
        lyntOpened: id,
        og,
        publicFeed,
        publicScrollables,
        user,
        initialFeed,
    };
};
