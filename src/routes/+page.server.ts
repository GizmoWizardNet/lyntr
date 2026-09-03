import type { PageServerLoad } from './$types';
import { getLynt } from "$lib/server/lynt"
import { stripMarkdownForOg } from '$lib/ogText';
import { PUBLIC_CDN_URL } from '$env/static/public';
import { newFeed } from './api/feed/new';
import { hydratePolls } from './api/util';
import { scrollableFeed } from '$lib/server/scrollables';

const TIMESTAMP_OPTS: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
};

export const load: PageServerLoad  = async ({ url, cookies }) => {
    const id = url.searchParams.get('id');
    const lynt = await getLynt(id || '');

    // Only fetch the public teaser feed for logged-out visitors — this is
    // what powers the middle column on the landing page. Skipping it when
    // an auth cookie is present avoids a wasted 50-row query on every
    // pageload for people who are just going to see MainPage instead.
    const publicFeed = cookies.get('_TOKEN__DO_NOT_SHARE') ? [] : hydratePolls(await newFeed(null));

    // Third landing column: newest-first scrollables. Same "skip for
    // logged-in visitors" reasoning as publicFeed above.
    const publicScrollables = cookies.get('_TOKEN__DO_NOT_SHARE') ? [] : await scrollableFeed(null);

    let og = null;
    if (lynt) {
        const strippedContent = stripMarkdownForOg(lynt.content);
        const timestamp = new Date(lynt.createdAt ?? Date.now()).toLocaleString('en-US', TIMESTAMP_OPTS);

        // A real attached image/GIF wins over the avatar — same priority
        // order the lynt card itself renders media in.
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
    };
};
