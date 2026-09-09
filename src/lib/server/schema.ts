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
    banner: text('banner'),
    is_admin: boolean('is_admin').default(false).notNull(),
    login_streak: integer('login_streak').default(1).notNull(),
    last_login_date: date('last_login_date'),
    rugplay_username: varchar('rugplay_username', { length: 60 }),
    rugplay_enhancements_enabled: boolean('rugplay_enhancements_enabled').default(false).notNull(),
    rugplay_api_key_enc: text('rugplay_api_key_enc'),
    rugplay_key_valid: boolean('rugplay_key_valid').default(false).notNull(),
    rugplay_key_checked_at: timestamp('rugplay_key_checked_at'),
    contributor: boolean('contributor').default(false).notNull(),
    name_color: text('name_color'),
    profile_song_type: text('profile_song_type'),
    profile_song_url: text('profile_song_url'),
    profile_song_title: text('profile_song_title'),
    profile_song_volume: integer('profile_song_volume').default(50).notNull(),
    profile_song_loop: boolean('profile_song_loop').default(true).notNull(),
    email_notifications_enabled: boolean('email_notifications_enabled').default(false).notNull(),
    default_feed: text('default_feed').default('For you').notNull(),
    custom_font: text('custom_font'),
    notification_email: text('notification_email'),
    lynt_coins: integer('lynt_coins').default(0).notNull(),
    lc_earned_today: integer('lc_earned_today').default(0).notNull(),
    lc_pool_date: date('lc_pool_date'),
    lc_posts_today: integer('lc_posts_today').default(0).notNull(),
    aura_score: integer('aura_score').default(0).notNull(),
    pinned_achievement_key: text('pinned_achievement_key'),
    status_text: varchar('status_text', { length: 100 }),
    status_expires_at: timestamp('status_expires_at'),
    timezone_label: text('timezone_label'),
    timezone_offset: text('timezone_offset'),
});

export const lynts = pgTable('lynts', {
    id: text('id').primaryKey(),
    user_id: text('user_id').references(() => users.id),
    content: text('content').notNull(),
    views: integer('views').default(0),
    shares: integer('shares').default(0),
    has_link: boolean('has_link').default(false),
    has_image: boolean('has_image').default(false),
    gif_url: text('gif_url'),
    gif_preview_url: text('gif_preview_url'),
    created_at: timestamp('created_at').defaultNow(),
    reposted: boolean('reposted').default(false),
    parent: text('parent').references((): AnyPgColumn => lynts.id),
    edited_at: timestamp('edited_at'),
    is_clan: boolean('is_clan').default(false).notNull(),
    clan_avg_iq: integer('clan_avg_iq'),
}, (table) => {
    return {
        createdAtIdx: index('lynts_created_at_idx').on(table.created_at),
        parentIdx: index('lynts_parent_idx').on(table.parent),
        userCreatedAtIdx: index('lynts_user_id_created_at_idx').on(table.user_id, table.created_at),
    }
});

export const lyntImages = pgTable('lynt_images', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().references(() => lynts.id, { onDelete: 'cascade' }),
    image_key: text('image_key').notNull(),
    position: integer('position').notNull().default(0),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    lyntIdx: index('lynt_images_lynt_id_idx').on(table.lynt_id, table.position),
}));

export const clanLynts = pgTable('clan_lynts', {
    id: uuid('id').defaultRandom().primaryKey(),
    author_id: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    gif_url: text('gif_url'),
    gif_preview_url: text('gif_preview_url'),
    current_step: integer('current_step').default(0).notNull(),
    status: text('status').default('pending').notNull(),
    resulting_lynt_id: text('resulting_lynt_id').references(() => lynts.id),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export const clanLyntMembers = pgTable('clan_lynt_members', {
    clan_id: uuid('clan_id').notNull().references(() => clanLynts.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    status: text('status').default('pending').notNull(),
    responded_at: timestamp('responded_at'),
}, (table) => ({
    pk: primaryKey({ columns: [table.clan_id, table.user_id], name: 'clan_lynt_members_pkey' }),
    clanPositionIdx: index('clan_lynt_members_clan_id_position_idx').on(table.clan_id, table.position),
    userIdx: index('clan_lynt_members_user_id_idx').on(table.user_id),
}));

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
        userLikedAtIdx: index('likes_user_id_liked_at_idx').on(table.user_id, table.liked_at),
    }
});

export const userAchievements = pgTable('user_achievements', {
    user_id: text('user_id').references(() => users.id).notNull(),
    achievement_key: text('achievement_key').notNull(),
    unlocked_at: timestamp('unlocked_at').defaultNow(),
    seen_at: timestamp('seen_at'),
    claimed_at: timestamp('claimed_at'),
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
    forumPostId: text('forum_post_id').references(() => forumPosts.id),
    forumThreadId: text('forum_thread_id').references(() => forumThreads.id),
    clanLyntId: uuid('clan_lynt_id').references(() => clanLynts.id, { onDelete: 'cascade' }),
    read: boolean('read').default(false),
    createdAt: timestamp('created_at').defaultNow(),
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

export const forumCategories = pgTable('forum_categories', {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    description: varchar('description', { length: 256 }).default(''),
    sort_order: integer('sort_order').default(0).notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

export const forumThreads = pgTable('forum_threads', {
    id: text('id').primaryKey(),
    category_id: text('category_id').notNull().references(() => forumCategories.id),
    user_id: text('user_id').references(() => users.id),
    title: varchar('title', { length: 200 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    last_activity_at: timestamp('last_activity_at').defaultNow(),
    views: integer('views').default(0),
    pinned: boolean('pinned').default(false).notNull(),
    closed: boolean('closed').default(false).notNull(),
    closed_by: text('closed_by').references(() => users.id),
    closed_at: timestamp('closed_at'),
});

export const forumPosts = pgTable('forum_posts', {
    id: text('id').primaryKey(),
    thread_id: text('thread_id').notNull().references(() => forumThreads.id),
    user_id: text('user_id').references(() => users.id),
    content: text('content').notNull(),
    is_op: boolean('is_op').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    edited_at: timestamp('edited_at'),
    deleted: boolean('deleted').default(false).notNull(),
    deleted_by: text('deleted_by').references(() => users.id),
    deleted_at: timestamp('deleted_at'),
});

export const forumPostVotes = pgTable('forum_post_votes', {
    post_id: text('post_id').notNull().references(() => forumPosts.id),
    user_id: text('user_id').notNull().references(() => users.id),
    value: integer('value').notNull(),
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
        userSavedAtIdx: index('bookmarks_user_id_saved_at_idx').on(table.user_id, table.saved_at),
    }
});

export const polls = pgTable('polls', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().unique().references(() => lynts.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 140 }).notNull(),
    multi_select: boolean('multi_select').default(false).notNull(),
    resolve_at: timestamp('resolve_at'),
    resolved_at: timestamp('resolved_at'),
    created_at: timestamp('created_at').defaultNow(),
});

export const pollOptions = pgTable('poll_options', {
    id: uuid('id').defaultRandom().primaryKey(),
    poll_id: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    text: varchar('text', { length: 100 }).notNull(),
    position: integer('position').notNull(),
});

export const pollVotes = pgTable('poll_votes', {
    id: uuid('id').defaultRandom().primaryKey(),
    poll_id: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    option_id: uuid('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    voted_at: timestamp('voted_at').defaultNow(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.poll_id, table.option_id, table.user_id], name: 'poll_votes_pkey' }),
    }
});

export const lcTransactions = pgTable('lc_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    lynt_id: text('lynt_id').references(() => lynts.id),
    source_user_id: text('source_user_id').references(() => users.id),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        dedup: uniqueIndex('lc_transactions_dedup').on(table.lynt_id, table.source_user_id, table.reason),
    }
});

export const dmConversations = pgTable('dm_conversations', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_a_id: text('user_a_id').references(() => users.id, { onDelete: 'cascade' }),
    user_b_id: text('user_b_id').references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    is_group: boolean('is_group').default(false).notNull(),
    name: varchar('name', { length: 100 }),
    icon_url: text('icon_url'),
    owner_id: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at').defaultNow(),
    last_message_at: timestamp('last_message_at').defaultNow(),
    last_message_preview: text('last_message_preview').default(''),
}, (table) => ({
    uniquePair: uniqueIndex('dm_conversations_unique_pair').on(table.user_a_id, table.user_b_id),
}));

export const dmMembers = pgTable('dm_members', {
    conversation_id: uuid('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    nickname: varchar('nickname', { length: 60 }),
    muted: boolean('muted').default(false).notNull(),
    pinned: boolean('pinned').default(false).notNull(),
    joined_at: timestamp('joined_at').defaultNow(),
    left_at: timestamp('left_at'),
    last_read_message_id: uuid('last_read_message_id'),
    last_read_at: timestamp('last_read_at').defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.conversation_id, table.user_id], name: 'dm_members_pkey' }),
    userIdx: index('dm_members_user_id_idx').on(table.user_id),
}));

export const dmMessages = pgTable('dm_messages', {
    id: uuid('id').defaultRandom().primaryKey(),
    conversation_id: uuid('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
    sender_id: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content'),
    gif_url: text('gif_url'),
    gif_preview_url: text('gif_preview_url'),
    attachment_url: text('attachment_url'),
    attachment_name: text('attachment_name'),
    attachment_size: integer('attachment_size'),
    attachment_type: text('attachment_type'),
    reply_to_id: uuid('reply_to_id').references((): AnyPgColumn => dmMessages.id, { onDelete: 'set null' }),
    edited_at: timestamp('edited_at'),
    deleted_at: timestamp('deleted_at'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    convIdx: index('dm_messages_conversation_id_idx').on(table.conversation_id, table.created_at),
}));

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

export const userBlocks = pgTable('user_blocks', {
    blocker_id: text('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blocked_id: text('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.blocker_id, table.blocked_id], name: 'user_blocks_pkey' }),
}));

export const lyntHashtags = pgTable('lynt_hashtags', {
    id: uuid('id').defaultRandom().primaryKey(),
    lynt_id: text('lynt_id').notNull().references(() => lynts.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    lyntTagUnique: uniqueIndex('lynt_hashtags_lynt_tag_idx').on(table.lynt_id, table.tag),
    tagIdx: index('lynt_hashtags_tag_idx').on(table.tag),
}));

export const apiClients = pgTable('api_clients', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull().default('Default'),
    client_id: text('client_id').notNull().unique(),
    secret_hash: text('secret_hash').notNull(),
    secret_salt: text('secret_salt').notNull(),
    secret_last4: text('secret_last4').notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    last_used_at: timestamp('last_used_at'),
    secret_version: integer('secret_version').default(1).notNull(),
}, (table) => ({
    userIdx: index('api_clients_user_id_idx').on(table.user_id),
}));

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    uniqueEndpoint: uniqueIndex('push_subscriptions_user_endpoint').on(table.user_id, table.endpoint),
    userIdx: index('push_subscriptions_user_id_idx').on(table.user_id),
}));

export const scrollables = pgTable('scrollables', {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    caption: text('caption').default(''),
    video_key: text('video_key').notNull(),
    thumbnail_key: text('thumbnail_key'),
    duration_seconds: integer('duration_seconds').notNull(),
    file_size_bytes: integer('file_size_bytes').notNull(),
    views: integer('views').default(0).notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    createdAtIdx: index('scrollables_created_at_idx').on(table.created_at),
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
    gif_url: text('gif_url'),
    gif_preview_url: text('gif_preview_url'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
    scrollableCreatedAtIdx: index('scrollable_comments_scrollable_id_created_at_idx').on(table.scrollable_id, table.created_at),
}));

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

export const devCycleEntries = pgTable('dev_cycle_entries', {
    id: uuid('id').defaultRandom().primaryKey(),
    version: varchar('version', { length: 32 }),
    title: varchar('title', { length: 120 }).notNull(),
    body: text('body').notNull(),
    author_id: text('author_id').notNull().references(() => users.id, { onDelete: 'set null' }),
    published: boolean('published').default(false).notNull(),
    published_at: timestamp('published_at'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
    publishedIdx: index('dev_cycle_entries_published_idx').on(table.published, table.published_at),
}));

export const devCycleItems = pgTable('dev_cycle_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    entry_id: uuid('entry_id').notNull().references(() => devCycleEntries.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('improved'),
    content: text('content').notNull(),
    position: integer('position').notNull().default(0),
}, (table) => ({
    entryIdx: index('dev_cycle_items_entry_id_idx').on(table.entry_id, table.position),
}));

export const devCycleNotes = pgTable('dev_cycle_notes', {
    id: uuid('id').defaultRandom().primaryKey(),
    commit_sha: varchar('commit_sha', { length: 40 }).notNull(),
    note: text('note').notNull(),
    author_id: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    commitIdx: index('dev_cycle_notes_commit_sha_idx').on(table.commit_sha),
}));