import { boolean, date, pgTable, serial, timestamp, varchar, integer, type AnyPgColumn, primaryKey, text, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';

export const users = pgTable('users', {
    id: text('id').primaryKey(),
    username: varchar('username', { length: 60 }).notNull(),
    handle: varchar('handle', { length: 32 }).notNull().unique(),
    bio: varchar('bio', { length: 256 }).default('Nothing here yet...'),
    created_at: timestamp('created_at').defaultNow(),
    banned: boolean('banned').default(false),
    iq: integer('iq').notNull(),
    token: text('token').default("a"),
    email: text('email').notNull(),
    verified: boolean('verified').default(false),
    banner: text('banner').default(null),
    // Badges
    is_admin: boolean('is_admin').default(false).notNull(),
    login_streak: integer('login_streak').default(1).notNull(),
    last_login_date: date('last_login_date').default(null),
    // Linked Rugplay account (rugplay.com) — used to show a "biggest bag" net-worth flex badge.
    rugplay_username: varchar('rugplay_username', { length: 60 }).default(null),
    // ── Rugplay Enhancements (BYO API key) ──────────────────────────────
    // Opt-in, off by default. When enabled with a valid key, $SYMBOL embeds
    // on this user's own Lynts are fetched using THEIR Rugplay API key
    // instead of the shared site key, so their usage doesn't eat into
    // everyone else's 2,000/day quota.
    rugplay_enhancements_enabled: boolean('rugplay_enhancements_enabled').default(false).notNull(),
    // AES-256-GCM ciphertext (iv + tag + data, base64), never sent to any client.
    rugplay_api_key_enc: text('rugplay_api_key_enc').default(null),
    // Cached result of the last validation call against Rugplay's API.
    rugplay_key_valid: boolean('rugplay_key_valid').default(false).notNull(),
    rugplay_key_checked_at: timestamp('rugplay_key_checked_at').default(null),

    // Set manually by admins only — never toggled by any automated logic.
    contributor: boolean('contributor').default(false).notNull(),

    // Cosmetic username color, one of the ids in $lib/nameColors.ts.
    // null = the default theme color (what everyone had before this feature).
    name_color: text('name_color').default(null),

    // Profile song (MySpace-style). type is 'upload' | 'youtube' | null.
    // For 'upload', url is the S3/MinIO object key. For 'youtube', url is
    // just the 11-char video id. Only one song at a time — setting a new
    // one (of either type) replaces the other.
    profile_song_type: text('profile_song_type').default(null),
    profile_song_url: text('profile_song_url').default(null),
    profile_song_title: text('profile_song_title').default(null),
    profile_song_volume: integer('profile_song_volume').default(50).notNull(),
    profile_song_loop: boolean('profile_song_loop').default(true).notNull(),

    // ── Email notifications (via Resend) ──────────────────────────────
    // Off by default. User opts in and provides an email address separate
    // from their auth email — so they can route notifs to a different inbox.
    // The address is never sent to any client; it's only used server-side.
    email_notifications_enabled: boolean('email_notifications_enabled').default(false).notNull(),
    // Which feed tab the app lands on after login, instead of always
    // hardcoding "For you". One of: 'For you' | 'New' | 'Following' | 'Bookmarked'.
    // Kept as free text rather than a Postgres enum so adding a new feed
    // tab later doesn't require an ALTER TYPE migration.
    default_feed: text('default_feed').default('For you').notNull(),
    // Platform Setting: lets a user override Lyntr's global font. Free text
    // rather than an enum — validated/sanitized server-side in
    // /api/platform-settings, then applied client-side as a CSS custom
    // property (see `--font-retro` in app.css) plus an on-the-fly Google
    // Fonts <link> for names that aren't already a system font.
    custom_font: text('custom_font').default(null),
    notification_email: text('notification_email').default(null),

    // ── LyntCoins (LC) ───────────────────────────────────────────────
    // Spendable balance. Never decremented except by the future shop/spend
    // system — earning logic only ever increments this.
    lynt_coins: integer('lynt_coins').default(0).notNull(),
    // How many LC this user has earned today, against the daily pool cap.
    // Reset (along with lc_pool_date) the next time they earn on a new day.
    lc_earned_today: integer('lc_earned_today').default(0).notNull(),
    // The UTC date (YYYY-MM-DD) lc_earned_today/lc_posts_today apply to.
    lc_pool_date: date('lc_pool_date').default(null),
    // How many original (non-repost) posts this user has made today —
    // drives the diminishing-returns post reward.
    lc_posts_today: integer('lc_posts_today').default(0).notNull(),
    // Cached "Aura Score" — recomputed by recalcAura() (src/lib/server/aura.ts)
    // at the same chokepoints as LyntCoins awards. Cached rather than
    // computed on every profile view because the formula pulls from several
    // tables (posts, followers, achievements) — cheap to keep fresh at award
    // time, not free to recompute on every page load.
    aura_score: integer('aura_score').default(0).notNull(),
    // Which unlocked achievement (by key) this user has chosen to show as
    // flair next to their name — null = none pinned. Not FK-enforced
    // against a real achievements table for the same reason
    // user_achievements.achievement_key isn't: the catalog is code, not a
    // table. Validated at write time (PATCH /api/achievements/pin) instead.
    pinned_achievement_key: text('pinned_achievement_key').default(null),
});

export const lynts = pgTable('lynts', {
    id: text('id').primaryKey(),
    user_id: text('user_id').references(() => users.id),
    content: text('content').notNull(),
    views: integer('views').default(0),
    shares: integer('shares').default(0),
    has_link: boolean('has_link').default(false),
    // Legacy flag: true if this lynt has at least one image. Individual
    // image rows now live in lynt_images (below) — has_image is kept
    // around because it's cheap to check/filter on and old rows only
    // ever had exactly one image at key `${lynt.id}.webp`.
    has_image: boolean('has_image').default(false),
    // GIF attachment (Klipy) — mutually exclusive with has_image/poll,
    // same "one attachment slot" model as the rest of the composer.
    gif_url: text('gif_url').default(null),
    gif_preview_url: text('gif_preview_url').default(null),
    created_at: timestamp('created_at').defaultNow(),
    reposted: boolean('reposted').default(false),
    parent: text('parent').references((): AnyPgColumn => lynts.id),
    edited_at: timestamp('edited_at').default(null),
    // Clan Lynting — true once the relay chain (see clan_lynts below)
    // finished and this row got its real INSERT. Never true for a lynt
    // that's still mid-relay — those don't have a lynts row at all yet,
    // see clanLynts for why.
    is_clan: boolean('is_clan').default(false).notNull(),
    // Snapshot of the average `users.iq` across every contributor
    // (author + accepted members) at the moment the lynt went live.
    // Deliberately a snapshot, not a live join — contributors' IQ can
    // keep changing after the lynt is posted and the displayed number
    // shouldn't drift out from under a published post.
    clan_avg_iq: integer('clan_avg_iq').default(null),
}, (table) => {
    return {
        // Every "New"/"For you"/handle feed orders by this — without it,
        // pagination and the plain chronological feed both scan the
        // whole table instead of walking a sorted index.
        createdAtIdx: index('lynts_created_at_idx').on(table.created_at),
        // Comment counts, reply-chain walks (referencedLynts), and thread
        // views all filter on parent — this was previously unindexed.
        parentIdx: index('lynts_parent_idx').on(table.parent),
        // Covers the profile feed (WHERE user_id = ? ORDER BY created_at DESC)
        // in one index instead of a user_id lookup followed by a sort.
        userCreatedAtIdx: index('lynts_user_id_created_at_idx').on(table.user_id, table.created_at),
    }
});

// One row per image on a lynt (up to 4 — see MAX_LYNT_IMAGES in
// api/util.ts). `image_key` is the MinIO object key without extension;
// the first image of any lynt always uses `${lynt_id}` (matching the old
// single-image convention so existing cached URLs/CDN entries keep
// working), and additional images use `${lynt_id}_img{position}`.
export const lyntImages = pgTable('lynt_images', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().references(() => lynts.id, { onDelete: 'cascade' }),
    image_key: text('image_key').notNull(),
    position: integer('position').notNull().default(0),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    lyntIdx: index('lynt_images_lynt_id_idx').on(table.lynt_id, table.position),
}));

// ── Clan Lynting ──────────────────────────────────────────────────────────
// A clan lynt is drafted and passed hand-to-hand through its members before
// it ever goes public. Deliberately kept OUT of the `lynts` table until the
// last member accepts — every feed query in this app selects straight from
// `lynts`, so a mid-relay draft never risks leaking into a feed just because
// someone forgot a WHERE clause. Once the chain completes, a normal `lynts`
// row is inserted (is_clan = true) and this draft is marked 'completed'.
export const clanLynts = pgTable('clan_lynts', {
    id: uuid('id').defaultRandom().primaryKey(),
    author_id: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Current draft text — whoever's turn it is can edit this before
    // passing it on. Same content the author composed with, mutated in
    // place rather than versioned; the relay isn't meant to keep a full
    // edit history, just the latest draft.
    content: text('content').notNull(),
    gif_url: text('gif_url').default(null),
    gif_preview_url: text('gif_preview_url').default(null),
    // Index into clan_lynt_members.position for whose turn it currently is.
    current_step: integer('current_step').default(0).notNull(),
    // 'pending' while relaying, 'completed' once published, 'declined' if
    // anyone in the chain declines (kills the whole draft).
    status: text('status').default('pending').notNull(),
    // Set once status flips to 'completed' — points at the real lynt row.
    resulting_lynt_id: text('resulting_lynt_id').references(() => lynts.id),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

// One row per person in the relay chain, in order. The author is position 0
// and is auto-accepted (they wrote the draft); everyone else starts
// 'pending' and flips to 'accepted' or 'declined' as the relay reaches them.
export const clanLyntMembers = pgTable('clan_lynt_members', {
    clan_id: uuid('clan_id').notNull().references(() => clanLynts.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    status: text('status').default('pending').notNull(),
    responded_at: timestamp('responded_at').default(null),
}, (table) => ({
    pk: primaryKey({ columns: [table.clan_id, table.user_id], name: 'clan_lynt_members_pkey' }),
    clanPositionIdx: index('clan_lynt_members_clan_id_position_idx').on(table.clan_id, table.position),
    userIdx: index('clan_lynt_members_user_id_idx').on(table.user_id),
}));

// Permanent record of who contributed to a published clan lynt — survives
// after clan_lynts/clan_lynt_members would otherwise be cleaned up, and is
// what drives the group-avatar stack, "no individual IQ badge" average, and
// like/comment/repost notification fan-out to every contributor rather than
// just lynts.user_id.
export const lyntContributors = pgTable('lynt_contributors', {
    lynt_id: text('lynt_id').notNull().references(() => lynts.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.lynt_id, table.user_id], name: 'lynt_contributors_pkey' }),
    lyntIdx: index('lynt_contributors_lynt_id_idx').on(table.lynt_id, table.position),
    userIdx: index('lynt_contributors_user_id_idx').on(table.user_id),
}));

export const followers = pgTable('followers', {
    user_id: text('user_id').references(() => users.id).notNull(),
    follower_id: text('follower_id').references(() => users.id).notNull(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.user_id, table.follower_id], name: 'followers_pkey' }),
        // The Following feed filters WHERE follower_id = ? — that's the
        // second column of the PK, which Postgres can't use efficiently
        // for a lookup on follower_id alone. This index covers it.
        followerIdx: index('followers_follower_id_idx').on(table.follower_id),
    }
});

export const likes = pgTable('likes', {
    lynt_id: text('lynt_id').references(() => lynts.id).notNull(),
    user_id: text('user_id').references(() => users.id).notNull(),
    liked_at: timestamp('liked_at').defaultNow(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.lynt_id, table.user_id], name: 'likes_pkey' }),
        // The Liked feed does WHERE user_id = ? ORDER BY liked_at DESC —
        // the PK's leading column is lynt_id, so that query couldn't use
        // it. This covers the lookup and the sort in one index.
        userLikedAtIdx: index('likes_user_id_liked_at_idx').on(table.user_id, table.liked_at),
    }
});

export const userAchievements = pgTable('user_achievements', {
    user_id: text('user_id').references(() => users.id).notNull(),
    // Matches a key in the ACHIEVEMENT_CATALOG in src/lib/achievements.ts.
    // Not a DB-enforced FK since the catalog is code, not a table — keeping
    // it that way means adding a new achievement is a code change, not a
    // migration.
    achievement_key: text('achievement_key').notNull(),
    unlocked_at: timestamp('unlocked_at').defaultNow(),
    // Null = the user hasn't visited the Achievements page since this
    // unlocked yet — drives the gold unread badge in the nav, same shape
    // as `notifications.read` but nullable-timestamp instead of boolean
    // so "when did they see it" is available for free if ever needed.
    seen_at: timestamp('seen_at').default(null),
    // Null = unlocked but the Community XP bonus hasn't been collected yet.
    // Unlocking an achievement no longer auto-pays it out — the
    // Achievements page shows a "Claim" button on unlocked-but-unclaimed
    // cards, and POST /api/achievements/claim is what actually credits the
    // coins and sets this. Keeps the reward as an active, satisfying
    // action instead of something that just silently happens.
    claimed_at: timestamp('claimed_at').default(null),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.user_id, table.achievement_key], name: 'user_achievements_pkey' }),
        userIdx: index('user_achievements_user_id_idx').on(table.user_id),
    }
});

export const notifications = pgTable('notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    type: text('type').notNull(),
    sourceUserId: text('source_user_id').references(() => users.id),
    lyntId: text('lynt_id').references(() => lynts.id),
    // Added for forum notifications (upvote/downvote/reply) — these targets
    // live in forum_posts/forum_threads, not lynts, so they can't reuse
    // lyntId without violating its FK.
    forumPostId: text('forum_post_id').references(() => forumPosts.id),
    forumThreadId: text('forum_thread_id').references(() => forumThreads.id),
    // Only set for type IN ('clan_invite', 'clan_declined') — points at the
    // clan_lynts draft so the notification UI can render accept/decline
    // actions and the respond endpoint has something to act on. Null for
    // 'clan_live', which carries a real lyntId instead (the draft is gone
    // by then, published).
    clanLyntId: uuid('clan_lynt_id').references(() => clanLynts.id, { onDelete: 'cascade' }),
    read: boolean('read').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    // Only meaningful for type = 'mention'. Lets one notification row stand
    // in for "mentioned you 3 times" (same lynt, possibly across edits)
    // instead of creating a new row per @handle occurrence. See migration
    // 0005 for the partial unique index this upsert relies on.
    mentionCount: integer('mention_count').default(1),
});

export const history = pgTable('history', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').references(() => users.id),
    lynt_id: text('lynt_id').references(() => lynts.id),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        uniqueUserLynt: uniqueIndex('unique_user_lynt').on(table.user_id, table.lynt_id),
    }
});

// ── Forum ────────────────────────────────────────────────────────────────
// Categories are a small, fixed-ish set (General Discussion, Shitposts,
// Development Discussion, Bug Reports, ...) so a text slug is the PK —
// readable in URLs and stable across re-seeding.
export const forumCategories = pgTable('forum_categories', {
    id: text('id').primaryKey(), // slug, e.g. 'general'
    name: varchar('name', { length: 80 }).notNull(),
    description: varchar('description', { length: 256 }).default(''),
    sort_order: integer('sort_order').default(0).notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

export const forumThreads = pgTable('forum_threads', {
    id: text('id').primaryKey(), // snowflake, same scheme as lynts.id
    category_id: text('category_id').notNull().references(() => forumCategories.id),
    user_id: text('user_id').references(() => users.id),
    title: varchar('title', { length: 200 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    // Bumped whenever a new post lands in the thread; lets us sort by
    // "recent activity" without joining/aggregating forum_posts every time.
    last_activity_at: timestamp('last_activity_at').defaultNow(),
    views: integer('views').default(0),
    pinned: boolean('pinned').default(false).notNull(),
    closed: boolean('closed').default(false).notNull(),
    closed_by: text('closed_by').references(() => users.id),
    closed_at: timestamp('closed_at').default(null),
});

export const forumPosts = pgTable('forum_posts', {
    id: text('id').primaryKey(), // snowflake
    thread_id: text('thread_id').notNull().references(() => forumThreads.id),
    user_id: text('user_id').references(() => users.id),
    content: text('content').notNull(),
    // The first post in a thread holds the thread's "body" — flagged so the
    // UI can render it like an OP instead of a reply.
    is_op: boolean('is_op').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    edited_at: timestamp('edited_at').default(null),
    // Soft-delete: admins "delete" a post for moderation but we keep the row
    // around so vote history / thread post-counts / reply chains stay sane.
    deleted: boolean('deleted').default(false).notNull(),
    deleted_by: text('deleted_by').references(() => users.id),
    deleted_at: timestamp('deleted_at').default(null),
});

export const forumPostVotes = pgTable('forum_post_votes', {
    post_id: text('post_id').notNull().references(() => forumPosts.id),
    user_id: text('user_id').notNull().references(() => users.id),
    value: integer('value').notNull(), // 1 (upvote) or -1 (downvote)
    voted_at: timestamp('voted_at').defaultNow(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.post_id, table.user_id], name: 'forum_post_votes_pkey' }),
    }
});

export const bookmarks = pgTable('bookmarks', {
    user_id: text('user_id').references(() => users.id).notNull(),
    lynt_id: text('lynt_id').references(() => lynts.id).notNull(),
    saved_at: timestamp('saved_at').defaultNow(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.user_id, table.lynt_id], name: 'bookmarks_pkey' }),
        // PK's leading column covers the WHERE user_id = ?, but the
        // ORDER BY saved_at DESC still needed a separate sort without
        // this — same fix as the likes index above.
        userSavedAtIdx: index('bookmarks_user_id_saved_at_idx').on(table.user_id, table.saved_at),
    }
});

// ── Polls ─────────────────────────────────────────────────────────────────
// One poll per lynt (lynt_id is unique). Options are stored separately so
// the count can be flexible. Votes reference options, not the poll directly,
// so per-option tallies are trivial aggregations.
export const polls = pgTable('polls', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().unique().references(() => lynts.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 140 }).notNull(),
    multi_select: boolean('multi_select').default(false).notNull(),
    // null = never auto-resolves; creator must manually resolve
    resolve_at: timestamp('resolve_at').default(null),
    // set when the poll is resolved (manually or by schedule)
    resolved_at: timestamp('resolved_at').default(null),
    created_at: timestamp('created_at').defaultNow(),
});

export const pollOptions = pgTable('poll_options', {
    id: uuid('id').defaultRandom().primaryKey(),
    poll_id: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    text: varchar('text', { length: 100 }).notNull(),
    position: integer('position').notNull(), // display order
});

export const pollVotes = pgTable('poll_votes', {
    id: uuid('id').defaultRandom().primaryKey(),
    poll_id: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    option_id: uuid('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    voted_at: timestamp('voted_at').defaultNow(),
}, (table) => {
    return {
        // one vote per (user, option) — prevents double-voting a single option
        pk: primaryKey({ columns: [table.poll_id, table.option_id, table.user_id], name: 'poll_votes_pkey' }),
    }
});

// ── LyntCoins ────────────────────────────────────────────────────────────
// Append-only ledger of every LyntCoins award. Source of truth for "did we
// already pay this out" checks (e.g. don't pay the like-received reward
// twice if someone unlikes/relikes, don't pay the curator bonus twice for
// the same liker+lynt), and gives us a real audit trail / activity feed
// for free later.
export const lcTransactions = pgTable('lc_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(), // 'post_created' | 'like_received' | 'reply_received' | 'bookmark_received' | 'repost_received' | 'curator_bonus' | 'streak_bonus'
    lynt_id: text('lynt_id').references(() => lynts.id),
    // For reasons tied to another user's action (e.g. someone liking your
    // post), this is who did it — used for dedup so the same liker can't
    // trigger the same payout twice on the same lynt.
    source_user_id: text('source_user_id').references(() => users.id),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        // Prevents double-paying the same (lynt, source_user, reason) combo —
        // e.g. unlike+relike spam, or double-bookmark race conditions.
        dedup: uniqueIndex('lc_transactions_dedup').on(table.lynt_id, table.source_user_id, table.reason),
    }
});

// ── Direct Messages ───────────────────────────────────────────────────────
// v2 schema: member-based model so both 1-to-1 DMs and group DMs are the
// same shape (a conversation has N members instead of a fixed user_a/user_b
// pair). dm_requests still handles the "request → accept → active chat"
// flow for 1-to-1 DMs so users can't be cold-messaged without consent;
// group DMs skip that (you're only added by someone already in the group).
//
// NOTE ON MIGRATION: user_a_id/user_b_id are kept on dm_conversations
// (nullable) purely so existing rows carry through the migration cleanly —
// see drizzle/0004_dm_groups.sql. All new code should read participants via
// dmMembers, not these columns.

export const dmConversations = pgTable('dm_conversations', {
    id: uuid('id').defaultRandom().primaryKey(),
    // Deprecated — superseded by dmMembers. Kept nullable for old rows.
    user_a_id: text('user_a_id').references(() => users.id, { onDelete: 'cascade' }),
    user_b_id: text('user_b_id').references(() => users.id, { onDelete: 'cascade' }),
    // 'pending'  – 1:1 request sent, not yet accepted
    // 'active'   – conversation usable
    // 'rejected' – recipient rejected the 1:1 request (soft block; shown to initiator)
    status: text('status').notNull().default('pending'),
    // false = 1-to-1 DM, true = group DM
    is_group: boolean('is_group').default(false).notNull(),
    // Group-only fields. Null for 1:1 DMs.
    name: varchar('name', { length: 100 }).default(null),
    icon_url: text('icon_url').default(null),
    owner_id: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at').defaultNow(),
    // Cache of last message for the conversation list preview
    last_message_at: timestamp('last_message_at').defaultNow(),
    last_message_preview: text('last_message_preview').default(''),
}, (table) => ({
    // Only meaningfully enforced for 1:1 DMs going forward (groups leave
    // these columns null); superseded by a partial unique index on
    // dm_members for the true "one 1:1 conversation per pair" guarantee —
    // see migration 0004.
    uniquePair: uniqueIndex('dm_conversations_unique_pair').on(table.user_a_id, table.user_b_id),
}));

// One row per (conversation, user). Replaces the old dm_reads table too —
// read-state now lives alongside membership/mute/nickname/pin state.
export const dmMembers = pgTable('dm_members', {
    conversation_id: uuid('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // 'owner' can rename the group, change icon, remove members, delete group.
    // 'member' can leave and add others (Discord-style, no strict admin tiers for now).
    role: text('role').notNull().default('member'),
    // Per-member override for how the group displays in their own client.
    nickname: varchar('nickname', { length: 60 }).default(null),
    muted: boolean('muted').default(false).notNull(),
    pinned: boolean('pinned').default(false).notNull(),
    joined_at: timestamp('joined_at').defaultNow(),
    left_at: timestamp('left_at').default(null), // soft — lets history stay intact for other members
    // Read-receipt state, migrated in from dm_reads.
    last_read_message_id: uuid('last_read_message_id').default(null),
    last_read_at: timestamp('last_read_at').defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.conversation_id, table.user_id], name: 'dm_members_pkey' }),
    userIdx: index('dm_members_user_id_idx').on(table.user_id),
}));

export const dmMessages = pgTable('dm_messages', {
    id: uuid('id').defaultRandom().primaryKey(),
    conversation_id: uuid('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
    sender_id: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // null content is valid when the message is a GIF or attachment only
    content: text('content').default(null),
    // GIF from Tenor — store the embed URL directly
    gif_url: text('gif_url').default(null),
    gif_preview_url: text('gif_preview_url').default(null),
    // Attachment stored in MinIO (same bucket as lynt images)
    attachment_url: text('attachment_url').default(null),
    attachment_name: text('attachment_name').default(null),
    attachment_size: integer('attachment_size').default(null), // bytes
    attachment_type: text('attachment_type').default(null),    // MIME
    // Reply-to another message in the same conversation. Self-referencing FK.
    reply_to_id: uuid('reply_to_id').references((): AnyPgColumn => dmMessages.id, { onDelete: 'set null' }),
    edited_at: timestamp('edited_at').default(null),
    deleted_at: timestamp('deleted_at').default(null), // soft delete
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    convIdx: index('dm_messages_conversation_id_idx').on(table.conversation_id, table.created_at),
}));

// Emoji reactions on DM messages — one row per (message, user, emoji).
export const dmReactions = pgTable('dm_reactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    message_id: uuid('message_id').notNull().references(() => dmMessages.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    uniqueReaction: uniqueIndex('dm_reactions_unique').on(table.message_id, table.user_id, table.emoji),
    messageIdx: index('dm_reactions_message_id_idx').on(table.message_id),
}));

// User-level blocking. A blocks B → B's messages/requests never reach A,
// and A disappears from B's ability to start new conversations with them.
export const userBlocks = pgTable('user_blocks', {
    blocker_id: text('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blocked_id: text('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.blocker_id, table.blocked_id], name: 'user_blocks_pkey' }),
}));

// ---------------------------------------------------------------------------
// lynt_hashtags — #tags extracted from lynt content
// ---------------------------------------------------------------------------
// One row per (lynt, tag) pair. Re-processed (old rows for the lynt deleted,
// current ones re-inserted) on every create/edit — see src/lib/server/hashtags.ts.
// `tag` is stored lowercased, without the leading '#'.
export const lyntHashtags = pgTable('lynt_hashtags', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().references(() => lynts.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    lyntTagUnique: uniqueIndex('lynt_hashtags_lynt_tag_idx').on(table.lynt_id, table.tag),
    tagIdx: index('lynt_hashtags_tag_idx').on(table.tag),
}));

// ── Developer API ────────────────────────────────────────────────────────
// One row per API credential a user has generated (a user may have several,
// e.g. "prod" / "testing"). The secret is NEVER stored in plaintext — only
// a salted scrypt hash (secret_hash/secret_salt). The plaintext is shown to
// the user exactly once, at creation or regeneration time, then discarded.
// secret_last4 is kept purely for display ("sk_live_...ab12") so users can
// tell credentials apart without re-revealing the secret.
export const apiClients = pgTable('api_clients', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull().default('Default'),
    // Public identifier, safe to expose — e.g. "lyntr_client_a1b2c3d4..."
    client_id: text('client_id').notNull().unique(),
    // scrypt(secret, salt) — never the plaintext secret.
    secret_hash: text('secret_hash').notNull(),
    secret_salt: text('secret_salt').notNull(),
    // Last 4 chars of the plaintext secret, for display purposes only.
    secret_last4: text('secret_last4').notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    last_used_at: timestamp('last_used_at').default(null),
    // Bumped every time the secret is regenerated — lets us tell "brand new
    // credential" apart from "same credential, rotated secret" in logs.
    secret_version: integer('secret_version').default(1).notNull(),
}, (table) => ({
    userIdx: index('api_clients_user_id_idx').on(table.user_id),
}));

// ── Lyntr Mail ──────────────────────────────────────────────────────────
// Removed — feature was fully retired (mailboxes, mail_messages,
// mail_payment_requests, and the monero-wallet-rpc integration for AURA
// upgrades). See DROP TABLE statements provided alongside this change if
// you still have the corresponding tables in your database.

// One row per (user, device). The endpoint+keys tuple is the Web Push
// subscription object the browser hands us after the user grants permission.
// A user can be subscribed on multiple devices simultaneously.
export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // The full PushSubscription JSON from the browser — stored as text,
    // parsed on each send. Contains endpoint + keys (p256dh, auth).
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    // User-agent snippet for display (optional, helps debug stale subs)
    user_agent: text('user_agent').default(null),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    // One subscription row per (user, endpoint) — prevents duplicates when
    // the same browser re-subscribes without unsubscribing first.
    uniqueEndpoint: uniqueIndex('push_subscriptions_user_endpoint').on(table.user_id, table.endpoint),
    userIdx: index('push_subscriptions_user_id_idx').on(table.user_id),
}));

// ── Scrollables ──────────────────────────────────────────────────────────
// Short-form vertical video, up to 3 min / 300MB (enforced at upload time,
// see api/scrollables). Deliberately its own table rather than bolted onto
// `lynts` — a reel has a video+duration+size as its core identity instead
// of text, and reusing `likes`/`bookmarks` (both hard-FK'd to lynts.id)
// would mean either a polymorphic hack or dropping that FK for everyone.
// Comments are a separate lightweight table (not full lynts) since the
// requirement here is just markdown + optional GIF, not the full
// reply/thread/repost machinery lynts carry.
export const scrollables = pgTable('scrollables', {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    caption: text('caption').default(''),
    // MinIO object key (no extension) — file is stored as `${video_key}.mp4`.
    video_key: text('video_key').notNull(),
    // Client-captured poster frame, uploaded as `${thumbnail_key}.webp`.
    // Nullable: falls back to a plain video-icon placeholder in the UI.
    thumbnail_key: text('thumbnail_key').default(null),
    duration_seconds: integer('duration_seconds').notNull(),
    file_size_bytes: integer('file_size_bytes').notNull(),
    views: integer('views').default(0).notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    // Newest-first feed, same shape as lynts_created_at_idx.
    createdAtIdx: index('scrollables_created_at_idx').on(table.created_at),
    // Author's own scrollables tab on their profile.
    userCreatedAtIdx: index('scrollables_user_id_created_at_idx').on(table.user_id, table.created_at),
}));

export const scrollableLikes = pgTable('scrollable_likes', {
    scrollable_id: text('scrollable_id').notNull().references(() => scrollables.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    liked_at: timestamp('liked_at').defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.scrollable_id, table.user_id], name: 'scrollable_likes_pkey' }),
}));

export const scrollableBookmarks = pgTable('scrollable_bookmarks', {
    scrollable_id: text('scrollable_id').notNull().references(() => scrollables.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    saved_at: timestamp('saved_at').defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.scrollable_id, table.user_id], name: 'scrollable_bookmarks_pkey' }),
}));

export const scrollableComments = pgTable('scrollable_comments', {
    id: uuid('id').defaultRandom().primaryKey(),
    scrollable_id: text('scrollable_id').notNull().references(() => scrollables.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    // Same "one attachment slot" model as the lynt composer's GIF field.
    gif_url: text('gif_url').default(null),
    gif_preview_url: text('gif_preview_url').default(null),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    scrollableCreatedAtIdx: index('scrollable_comments_scrollable_id_created_at_idx').on(table.scrollable_id, table.created_at),
}));

// ── Lynt reactions ──────────────────────────────────────────────────────────
// Emoji reactions on lynts (top-level posts AND replies — both live in the
// `lynts` table), mirroring the dm_reactions model above: one row per
// (lynt, user, emoji). Deliberately separate from `likes` rather than
// folding reactions into it — likes drive LyntCoins/Aura/notifications and
// have their own history/analytics baked in elsewhere; reactions are a
// lighter-weight, no-notification, no-coin-reward "vibe" layer on top,
// same as Discord keeps reactions distinct from a upvote/like system.
export const lyntReactions = pgTable('lynt_reactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().references(() => lynts.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    uniqueReaction: uniqueIndex('lynt_reactions_unique').on(table.lynt_id, table.user_id, table.emoji),
    lyntIdx: index('lynt_reactions_lynt_id_idx').on(table.lynt_id),
}));

// ── Dev Cycle / changelog ────────────────────────────────────────────────────
// Public "what's new" feed, admin-authored. Modeled on the catplay/rugplay
// changelog format: a version tag, a title, a body (rendered as markdown,
// reusing the same renderer as forum posts/lynt content), and a category
// per entry so the page can render colored badges (feature/fix/balance/etc)
// the way catplay's "What's New" list does.
export const devCycleEntries = pgTable('dev_cycle_entries', {
    id: uuid('id').defaultRandom().primaryKey(),
    version: varchar('version', { length: 32 }).default(null), // e.g. "2.4.0" — null for undated/ongoing notes
    title: varchar('title', { length: 120 }).notNull(),
    body: text('body').notNull(), // markdown
    author_id: text('author_id').notNull().references(() => users.id, { onDelete: 'set null' }),
    // Published entries show on /updates; drafts only show in the admin editor.
    published: boolean('published').default(false).notNull(),
    published_at: timestamp('published_at').default(null),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
    publishedIdx: index('dev_cycle_entries_published_idx').on(table.published, table.published_at),
}));

// Per-entry bullet items with a category tag, so the UI can render
// "New / Improved / Fixed" grouped lists inside one changelog entry
// (catplay's "What's New — Catplay 2.0" bullet-per-line format) instead of
// forcing everything into freeform markdown body text.
export const devCycleItems = pgTable('dev_cycle_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    entry_id: uuid('entry_id').notNull().references(() => devCycleEntries.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('improved'), // 'new' | 'improved' | 'fixed' | 'removed'
    content: text('content').notNull(),
    position: integer('position').notNull().default(0),
}, (table) => ({
    entryIdx: index('dev_cycle_items_entry_id_idx').on(table.entry_id, table.position),
}));

export const devCycleNotes = pgTable('dev_cycle_notes', {
    id: uuid('id').defaultRandom().primaryKey(),
    // Full 40-char SHA of the commit this note is pinned to.
    commit_sha: varchar('commit_sha', { length: 40 }).notNull(),
    note: text('note').notNull(),
    author_id: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    commitIdx: index('dev_cycle_notes_commit_sha_idx').on(table.commit_sha),
}));