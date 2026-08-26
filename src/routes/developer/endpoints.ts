export type Endpoint = {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	path: string;
	summary: string;
	description: string;
	sensitive?: boolean; // requires a "sensitive"-scope credential per authenticateApiRequest
	request?: string;
	response: string;
	notes?: string;
};

const AUTH_HEADER = `-H "X-Client-Id: $LYNTR_CLIENT_ID" \\
  -H "X-Client-Secret: $LYNTR_CLIENT_SECRET"`;

export const endpoints: Endpoint[] = [
	{
		method: 'GET',
		path: '/me',
		summary: 'Current user',
		description: 'Returns the account tied to the credential making the request.',
		request: `curl https://lyntr.gizmowizard.tech/api/v2/me \\
  ${AUTH_HEADER}`,
		response: `{
  "id": "7331021...",
  "username": "dani",
  "handle": "dani",
  "bio": "building lyntr",
  "iq": 142,
  "created_at": "2025-02-11T08:15:00.000Z",
  "is_admin": false,
  "verified": true,
  "lynt_coins": 4820
}`
	},
	{
		method: 'PATCH',
		path: '/me',
		summary: 'Update your profile',
		description:
			'Text-only profile customization. Supports bio, username, and name_color — the same fields the app itself lets you edit without a file upload. Avatar, banner, and profile-song uploads still aren\u2019t available over the API — v2 added multipart support to lynt/comment creation specifically, not to every endpoint.',
		sensitive: true,
		request: `curl -X PATCH https://lyntr.gizmowizard.tech/api/v2/me \\
  ${AUTH_HEADER} \\
  -H "Content-Type: application/json" \\
  -d '{
    "bio": "building lyntr",
    "name_color": "#5470ff"
  }'`,
		response: `{
  "id": "7331021...",
  "username": "dani",
  "handle": "dani",
  "bio": "building lyntr",
  "name_color": "#5470ff",
  "verified": true
}`,
		notes:
			'bio: string, max 256 chars · username: string, max 60 chars · name_color: hex string, requires a verified account (403 otherwise).'
	},
	{
		method: 'GET',
		path: '/lynts',
		summary: 'Feed',
		description: 'A page of lynts from one of the three feed algorithms.',
		request: `curl "https://lyntr.gizmowizard.tech/api/v2/lynts?type=New" \\
  ${AUTH_HEADER}`,
		response: `{
  "lynts": [
    {
      "id": "7331099...",
      "content": "just shipped the v2 api",
      "userId": "7331021...",
      "createdAt": "2026-07-19T10:02:11.000Z",
      "editedAt": null,
      "reposted": false,
      "parentId": null,
      "has_image": false,
      "images": [],
      "gif_url": null,
      "gif_preview_url": null,
      "views": 12,
      "likeCount": 3,
      "repostCount": 0,
      "commentCount": 0,
      "likedByUser": false,
      "repostedByUser": false,
      "likedByFollowed": false,
      "handle": "dani",
      "username": "dani",
      "bio": "building lyntr",
      "iq": 142,
      "verified": true,
      "isAdmin": false,
      "contributor": true,
      "loginStreak": 4,
      "followerCount": 918,
      "followsViewer": false,
      "nameColor": "#5470ff",
      "userCreatedAt": "2025-02-11T08:15:00.000Z",
      "parentContent": null,
      "parentHasImage": null,
      "parentImages": null,
      "parentGifUrl": null,
      "parentGifPreviewUrl": null,
      "parentUserHandle": null,
      "parentUserCreatedAt": null,
      "parentUserBio": null,
      "parentUserUsername": null,
      "parentUserVerified": null,
      "parentUserIq": null,
      "parentUserId": null,
      "parentCreatedAt": null,
      "parentUserNameColor": null,
      "poll": null
    }
  ]
}`,
		notes:
			'type: one of "New" (default), "Following", or "For you". Every lynt object has this full shape — the parent* fields are only populated when the lynt is a reply/comment, and poll is only populated when the lynt has one attached.'
	},
	{
		method: 'POST',
		path: '/lynts',
		summary: 'Create a lynt',
		description:
			'Posts a lynt, up to 280 characters. New in v2: images are now accepted, up to 4 per lynt. Content is run through the same moderation pipeline as posts made through the app — image uploads are also run through NSFW screening the same way the app\u2019s own composer does.',
		sensitive: true,
		request: `# Text only (application/json) — same as v1
curl -X POST https://lyntr.gizmowizard.tech/api/v2/lynts \\
  ${AUTH_HEADER} \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "just shipped the v2 api" }'

# With images (multipart/form-data) — new in v2
curl -X POST https://lyntr.gizmowizard.tech/api/v2/lynts \\
  ${AUTH_HEADER} \\
  -F "content=screenshots incoming" \\
  -F "images=@one.png" \\
  -F "images=@two.png"`,
		response: `{
  "id": "7331099...",
  "content": "just shipped the v2 api",
  "userId": "7331021...",
  "createdAt": "2026-07-19T10:02:11.000Z",
  "editedAt": null,
  "reposted": false,
  "parentId": null,
  "has_image": false,
  "images": [],
  "gif_url": null,
  "gif_preview_url": null,
  "views": 0,
  "likeCount": 0,
  "repostCount": 0,
  "commentCount": 0,
  "likedByUser": false,
  "repostedByUser": false,
  "likedByFollowed": false,
  "handle": "dani",
  "username": "dani",
  "bio": "building lyntr",
  "iq": 142,
  "verified": true,
  "isAdmin": false,
  "contributor": true,
  "loginStreak": 4,
  "followerCount": 918,
  "followsViewer": false,
  "nameColor": "#5470ff",
  "userCreatedAt": "2025-02-11T08:15:00.000Z",
  "parentContent": null,
  "poll": null
}`,
		notes:
			'content is required unless at least one image is attached (an image-only lynt is valid) · content: 0\u2013280 characters · images: up to 4 files, field name "images" repeated once per file · GIF and poll attachments still aren\u2019t available over the API. Response is the same full lynt shape returned by every other lynt endpoint (trimmed here for space — see the Feed example above for every field); has_image and images reflect what was actually uploaded.'
	},
	{
		method: 'GET',
		path: '/lynts/:id',
		summary: 'Get a lynt',
		description: 'Fetches a single lynt by id.',
		request: `curl https://lyntr.gizmowizard.tech/api/v2/lynts/7331099... \\
  ${AUTH_HEADER}`,
		response: `{
  "id": "7331099...",
  "content": "just shipped the v2 api",
  "userId": "7331021...",
  "createdAt": "2026-07-19T10:02:11.000Z",
  "editedAt": null,
  "reposted": false,
  "parentId": null,
  "parent": null,
  "likeCount": 3,
  "commentCount": 1,
  "likedByUser": false,
  "handle": "dani",
  "username": "dani",
  "poll": null,
  "referencedLynts": [],
  "...": "same full shape as the Feed endpoint's lynt objects"
}`,
		notes:
			'404 if the lynt doesn\u2019t exist. Full response shape matches the Feed endpoint\u2019s lynt objects, plus two fields the other endpoints don\u2019t return: parent (the raw parent lynt id — parentId is the same value) and referencedLynts (the full chain of ancestor lynts, oldest first, if this lynt is a reply — empty array otherwise).'
	},
	{
		method: 'PUT',
		path: '/lynts/:id',
		summary: 'Edit a lynt',
		description:
			'Edits the text of a lynt you own. Reposts have no original text, so they can\u2019t be edited. Content is re-moderated and re-scanned for @mentions and #hashtags, exactly like an edit made through the app.',
		sensitive: true,
		request: `curl -X PUT https://lyntr.gizmowizard.tech/api/v2/lynts/7331099... \\
  ${AUTH_HEADER} \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "just shipped the v2 api (typo fixed)" }'`,
		response: `{
  "id": "7331099...",
  "content": "just shipped the v2 api (typo fixed)",
  "userId": "7331021...",
  "createdAt": "2026-07-19T10:02:11.000Z",
  "editedAt": "2026-07-19T10:05:44.000Z",
  "likeCount": 3,
  "commentCount": 1,
  "poll": null,
  "...": "same full shape as the Feed endpoint's lynt objects"
}`,
		notes:
			'403 if you don\u2019t own the lynt · 400 if it\u2019s a repost · content: 1\u2013280 characters. Response is the full lynt shape, not just the edited fields.'
	},
	{
		method: 'DELETE',
		path: '/lynts/:id',
		summary: 'Delete a lynt',
		description: 'Deletes a lynt you own.',
		sensitive: true,
		request: `curl -X DELETE https://lyntr.gizmowizard.tech/api/v2/lynts/7331099... \\
  ${AUTH_HEADER}`,
		response: `{ "success": true }`,
		notes: '404 if the lynt doesn\u2019t exist or isn\u2019t owned by you.'
	},
	{
		method: 'POST',
		path: '/lynts/:id/like',
		summary: 'Like a lynt',
		description: 'Likes a lynt. Liking your own lynt is allowed but won\u2019t generate a notification.',
		request: `curl -X POST https://lyntr.gizmowizard.tech/api/v2/lynts/7331099.../like \\
  ${AUTH_HEADER}`,
		response: `{ "liked": true }`,
		notes: 'Returns { "liked": true, "message": "Already liked." } if you\u2019d already liked it.'
	},
	{
		method: 'DELETE',
		path: '/lynts/:id/like',
		summary: 'Unlike a lynt',
		description: 'Removes your like from a lynt.',
		request: `curl -X DELETE https://lyntr.gizmowizard.tech/api/v2/lynts/7331099.../like \\
  ${AUTH_HEADER}`,
		response: `{ "liked": false }`
	},
	{
		method: 'GET',
		path: '/lynts/:id/comments',
		summary: 'List comments',
		description: 'Up to 50 most recent top-level comments on a lynt, newest first.',
		request: `curl https://lyntr.gizmowizard.tech/api/v2/lynts/7331099.../comments \\
  ${AUTH_HEADER}`,
		response: `{
  "comments": [
    {
      "id": "7331150...",
      "content": "nice, does it support polls yet?",
      "userId": "7331040...",
      "createdAt": "2026-07-19T10:11:02.000Z",
      "parentId": "7331099...",
      "likeCount": 0,
      "commentCount": 0,
      "likedByUser": false,
      "handle": "someone",
      "username": "Someone",
      "poll": null,
      "...": "same full shape as the Feed endpoint's lynt objects"
    }
  ]
}`,
		notes: 'Each comment is a full lynt object (see the Feed endpoint) with parentId set to the lynt it replies to.'
	},
	{
		method: 'GET',
		path: '/lynts/all/comments',
		summary: 'Recent comments (all lynts)',
		description:
			'New in v2. The most recent comments across every lynt on Lyntr, newest first — not scoped to one parent. Requested by @libhmrc (@nothmrc on Lyntr): before this, getting recent comments meant calling GET /lynts/:id/comments once per lynt you cared about, which doesn\u2019t scale and is an easy way to get rate-limited. This is the same underlying data, queried by time across all parents at once instead of per-parent.',
		request: `curl "https://lyntr.gizmowizard.tech/api/v2/lynts/all/comments" \\
  ${AUTH_HEADER}`,
		response: `{
  "comments": [
    {
      "id": "7331150...",
      "content": "nice, does it support polls yet?",
      "userId": "7331040...",
      "createdAt": "2026-07-19T10:11:02.000Z",
      "parentId": "7331099...",
      "likeCount": 0,
      "commentCount": 0,
      "likedByUser": false,
      "handle": "someone",
      "username": "Someone",
      "poll": null,
      "...": "same full shape as the Feed endpoint's lynt objects"
    }
  ]
}`,
		notes:
			'before: an ISO timestamp cursor — pass the createdAt of the oldest comment you\u2019ve already seen to page further back, same convention as the Feed endpoint\u2019s pagination. Up to 50 per page. Each comment is a full lynt object, same as GET /lynts/:id/comments.'
	},
	{
		method: 'POST',
		path: '/lynts/:id/comments',
		summary: 'Post a comment',
		description:
			'Replies to a lynt. Images are accepted here too, same as POST /lynts. The parent author gets a notification and lyntcoins award unless you\u2019re replying to yourself.',
		sensitive: true,
		request: `curl -X POST https://lyntr.gizmowizard.tech/api/v2/lynts/7331099.../comments \\
  ${AUTH_HEADER} \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "same request shape as v1, images now optional via multipart" }'`,
		response: `{
  "id": "7331150...",
  "content": "same request shape as v1, images now optional via multipart",
  "userId": "7331021...",
  "createdAt": "2026-07-19T10:12:30.000Z",
  "parentId": "7331099...",
  "has_image": false,
  "images": [],
  "likeCount": 0,
  "commentCount": 0,
  "poll": null,
  "...": "same full shape as the Feed endpoint's lynt objects"
}`,
		notes:
			'content is required unless at least one image is attached · same multipart "images" field as POST /lynts for attaching up to 4 images. Response is a full lynt object (see the Feed endpoint), with parentId set to the lynt you replied to.'
	},
	{
		method: 'GET',
		path: '/users/:handle',
		summary: 'Get a profile',
		description: 'A public profile, including follower/following counts and whether you follow them.',
		request: `curl https://lyntr.gizmowizard.tech/api/v2/users/dani \\
  ${AUTH_HEADER}`,
		response: `{
  "id": "7331021...",
  "username": "dani",
  "handle": "dani",
  "bio": "building lyntr",
  "iq": 142,
  "created_at": "2025-02-11T08:15:00.000Z",
  "verified": true,
  "contributor": true,
  "follower_count": 918,
  "following_count": 214,
  "followed_by_viewer": false
}`
	},
	{
		method: 'POST',
		path: '/users/:handle/follow',
		summary: 'Follow a user',
		description: 'Follows a user. Following yourself returns a 400.',
		sensitive: true,
		request: `curl -X POST https://lyntr.gizmowizard.tech/api/v2/users/dani/follow \\
  ${AUTH_HEADER}`,
		response: `{ "following": true }`,
		notes: 'Returns { "following": true, "message": "Already following." } if you already followed them. 400 if you try to follow yourself.'
	},
	{
		method: 'DELETE',
		path: '/users/:handle/follow',
		summary: 'Unfollow a user',
		description: 'Unfollows a user.',
		sensitive: true,
		request: `curl -X DELETE https://lyntr.gizmowizard.tech/api/v2/users/dani/follow \\
  ${AUTH_HEADER}`,
		response: `{ "following": false }`
	},
	{
		method: 'GET',
		path: '/search',
		summary: 'Search lynts',
		description:
			'Simple plain-substring content search. For the full operator syntax (from:, #tag, etc.) use the app itself for now.',
		request: `curl "https://lyntr.gizmowizard.tech/api/v2/search?q=lyntr%20api" \\
  ${AUTH_HEADER}`,
		response: `{
  "lynts": [
    {
      "id": "7331099...",
      "content": "just shipped the v2 api",
      "userId": "7331021...",
      "createdAt": "2026-07-19T10:02:11.000Z",
      "likeCount": 3,
      "commentCount": 0,
      "likedByUser": false,
      "handle": "dani",
      "username": "dani",
      "poll": null,
      "...": "same full shape as the Feed endpoint's lynt objects"
    }
  ]
}`,
		notes: 'q is required — a 400 is returned if it\u2019s missing. Results are full lynt objects (see the Feed endpoint), reposts excluded.'
	},
	{
		method: 'GET',
		path: '/notifications',
		summary: 'Recent notifications',
		description: 'Up to 50 most recent notifications, newest first.',
		request: `curl https://lyntr.gizmowizard.tech/api/v2/notifications \\
  ${AUTH_HEADER}`,
		response: `{
  "notifications": [
    {
      "id": "7331201...",
      "type": "like",
      "sourceUserId": "7331040...",
      "sourceUserHandle": "someone",
      "sourceUsername": "Someone",
      "lyntId": "7331099...",
      "lyntContent": "just shipped the v2 api",
      "read": false,
      "createdAt": "2026-07-19T10:11:40.000Z",
      "mentionCount": null
    }
  ]
}`
	}
];
