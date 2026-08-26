import type { PageServerLoad } from './$types';
import { getScrollable } from '$lib/server/scrollables';
import { requireUser } from '$lib/server/requireUser';
import { stripMarkdownForOg } from '$lib/ogText';
import { PUBLIC_CDN_URL, PUBLIC_SCROLLABLES_CDN_URL, PUBLIC_SCROLLABLES_BUCKET_NAME } from '$env/static/public';

// No real width/height is stored per-scrollable (see schema.ts — only
// duration/size are tracked). Vertical 9:16 is a safe default for a
// TikTok/Reels-style feed and is what most scrollables will actually be;
// platforms use these purely as a layout hint for the embed player, not
// a hard constraint, so a mismatch just means slight letterboxing rather
// than a broken embed.
const DEFAULT_VIDEO_WIDTH = 720;
const DEFAULT_VIDEO_HEIGHT = 1280;

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const viewerId = await requireUser(cookies);
	const scrollable = await getScrollable(params.id!, viewerId);

	if (!scrollable) {
		return { scrollable: null, og: null };
	}

	const videoUrl = `${PUBLIC_SCROLLABLES_CDN_URL}/${PUBLIC_SCROLLABLES_BUCKET_NAME}/${scrollable.videoKey}.mp4`;
	const thumbnailUrl = scrollable.thumbnailKey
		? `${PUBLIC_SCROLLABLES_CDN_URL}/${PUBLIC_SCROLLABLES_BUCKET_NAME}/${scrollable.thumbnailKey}.webp`
		: `${PUBLIC_CDN_URL}/lyntr/${scrollable.userId}_medium.webp`; // author avatar as a last-resort poster

	const description = scrollable.caption
		? stripMarkdownForOg(scrollable.caption)
		: `A scrollable by @${scrollable.handle} on Lyntr`;

	const embedUrl = `${url.origin}/scrollables/${scrollable.id}/embed`;

	const og = {
		title: `${scrollable.username} (@${scrollable.handle}) on Lyntr`,
		description,
		videoUrl,
		thumbnailUrl,
		embedUrl,
		width: DEFAULT_VIDEO_WIDTH,
		height: DEFAULT_VIDEO_HEIGHT,
	};

	return { scrollable, og };
};
