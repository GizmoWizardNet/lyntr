-- Lyntr PostgreSQL schema
-- Generated from the supplied src/lib/server/schema.ts.
-- Intended for a fresh/blank Supabase PostgreSQL database.
--
-- ONE GIANT NOTE: This is not related to Drizzle since I abandoned that a fucking long while back. Any changes will be on the repo itself but be sure that you run it directly in the SQL editor of your DB and enable RLS!
--
-- NOTE:
--   * Run this once in Supabase SQL Editor.
--   * The Drizzle schema uses timestamp WITHOUT time zone semantics.
--   * The source schema declares dev_cycle_entries.author_id as NOT NULL
--     while also requesting ON DELETE SET NULL. PostgreSQL permits creation
--     of that FK, but deleting the author would then fail the NOT NULL
--     constraint. This file preserves the source declaration exactly.

BEGIN;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    handle VARCHAR(32) NOT NULL UNIQUE,
    bio VARCHAR(256) DEFAULT 'Nothing here yet...',
    created_at TIMESTAMP DEFAULT NOW(),
    banned BOOLEAN DEFAULT FALSE,
    iq INTEGER NOT NULL,
    token TEXT DEFAULT 'a',
    email TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    banner TEXT DEFAULT NULL,
    is_admin BOOLEAN DEFAULT FALSE NOT NULL,
    login_streak INTEGER DEFAULT 1 NOT NULL,
    last_login_date DATE DEFAULT NULL,
    rugplay_username VARCHAR(60) DEFAULT NULL,
    rugplay_enhancements_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    rugplay_api_key_enc TEXT DEFAULT NULL,
    rugplay_key_valid BOOLEAN DEFAULT FALSE NOT NULL,
    rugplay_key_checked_at TIMESTAMP DEFAULT NULL,
    contributor BOOLEAN DEFAULT FALSE NOT NULL,
    name_color TEXT DEFAULT NULL,
    profile_song_type TEXT DEFAULT NULL,
    profile_song_url TEXT DEFAULT NULL,
    profile_song_title TEXT DEFAULT NULL,
    profile_song_volume INTEGER DEFAULT 50 NOT NULL,
    profile_song_loop BOOLEAN DEFAULT TRUE NOT NULL,
    email_notifications_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    default_feed TEXT DEFAULT 'For you' NOT NULL,
    notification_email TEXT DEFAULT NULL,
    lynt_coins INTEGER DEFAULT 0 NOT NULL,
    lc_earned_today INTEGER DEFAULT 0 NOT NULL,
    lc_pool_date DATE DEFAULT NULL,
    lc_posts_today INTEGER DEFAULT 0 NOT NULL,
    aura_score INTEGER DEFAULT 0 NOT NULL,
    pinned_achievement_key TEXT DEFAULT NULL
);

-- ---------------------------------------------------------------------------
-- Lynts
-- ---------------------------------------------------------------------------

CREATE TABLE lynts (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    content TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    has_link BOOLEAN DEFAULT FALSE,
    has_image BOOLEAN DEFAULT FALSE,
    gif_url TEXT DEFAULT NULL,
    gif_preview_url TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    reposted BOOLEAN DEFAULT FALSE,
    parent TEXT REFERENCES lynts(id),
    edited_at TIMESTAMP DEFAULT NULL,
    is_clan BOOLEAN DEFAULT FALSE NOT NULL,
    clan_avg_iq INTEGER DEFAULT NULL
);

CREATE INDEX lynts_created_at_idx ON lynts(created_at);
CREATE INDEX lynts_parent_idx ON lynts(parent);
CREATE INDEX lynts_user_id_created_at_idx ON lynts(user_id, created_at);

CREATE TABLE lynt_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lynt_id TEXT NOT NULL REFERENCES lynts(id) ON DELETE CASCADE,
    image_key TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX lynt_images_lynt_id_idx
    ON lynt_images(lynt_id, position);

-- ---------------------------------------------------------------------------
-- Clan Lynting
-- ---------------------------------------------------------------------------

CREATE TABLE clan_lynts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    gif_url TEXT DEFAULT NULL,
    gif_preview_url TEXT DEFAULT NULL,
    current_step INTEGER DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    resulting_lynt_id TEXT REFERENCES lynts(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE clan_lynt_members (
    clan_id UUID NOT NULL REFERENCES clan_lynts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    responded_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT clan_lynt_members_pkey PRIMARY KEY (clan_id, user_id)
);

CREATE INDEX clan_lynt_members_clan_id_position_idx
    ON clan_lynt_members(clan_id, position);
CREATE INDEX clan_lynt_members_user_id_idx
    ON clan_lynt_members(user_id);

CREATE TABLE lynt_contributors (
    lynt_id TEXT NOT NULL REFERENCES lynts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    CONSTRAINT lynt_contributors_pkey PRIMARY KEY (lynt_id, user_id)
);

CREATE INDEX lynt_contributors_lynt_id_idx
    ON lynt_contributors(lynt_id, position);
CREATE INDEX lynt_contributors_user_id_idx
    ON lynt_contributors(user_id);

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------

CREATE TABLE followers (
    user_id TEXT NOT NULL REFERENCES users(id),
    follower_id TEXT NOT NULL REFERENCES users(id),
    CONSTRAINT followers_pkey PRIMARY KEY (user_id, follower_id)
);

CREATE INDEX followers_follower_id_idx
    ON followers(follower_id);

CREATE TABLE likes (
    lynt_id TEXT NOT NULL REFERENCES lynts(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    liked_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT likes_pkey PRIMARY KEY (lynt_id, user_id)
);

CREATE INDEX likes_user_id_liked_at_idx
    ON likes(user_id, liked_at);

CREATE TABLE user_achievements (
    user_id TEXT NOT NULL REFERENCES users(id),
    achievement_key TEXT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT NOW(),
    seen_at TIMESTAMP DEFAULT NULL,
    claimed_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_key)
);

CREATE INDEX user_achievements_user_id_idx
    ON user_achievements(user_id);

-- ---------------------------------------------------------------------------
-- Forum
-- ---------------------------------------------------------------------------

CREATE TABLE forum_categories (
    id TEXT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(256) DEFAULT '',
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE forum_threads (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES forum_categories(id),
    user_id TEXT REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity_at TIMESTAMP DEFAULT NOW(),
    views INTEGER DEFAULT 0,
    pinned BOOLEAN DEFAULT FALSE NOT NULL,
    closed BOOLEAN DEFAULT FALSE NOT NULL,
    closed_by TEXT REFERENCES users(id),
    closed_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE forum_posts (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES forum_threads(id),
    user_id TEXT REFERENCES users(id),
    content TEXT NOT NULL,
    is_op BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    edited_at TIMESTAMP DEFAULT NULL,
    deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_by TEXT REFERENCES users(id),
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE forum_post_votes (
    post_id TEXT NOT NULL REFERENCES forum_posts(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    value INTEGER NOT NULL,
    voted_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT forum_post_votes_pkey PRIMARY KEY (post_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Notifications / history / bookmarks
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id),
    source_user_id TEXT REFERENCES users(id),
    lynt_id TEXT REFERENCES lynts(id),
    forum_post_id TEXT REFERENCES forum_posts(id),
    forum_thread_id TEXT REFERENCES forum_threads(id),
    clan_lynt_id UUID REFERENCES clan_lynts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    mention_count INTEGER DEFAULT 1
);

CREATE TABLE history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES users(id),
    lynt_id TEXT REFERENCES lynts(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX unique_user_lynt
    ON history(user_id, lynt_id);

CREATE TABLE bookmarks (
    user_id TEXT NOT NULL REFERENCES users(id),
    lynt_id TEXT NOT NULL REFERENCES lynts(id),
    saved_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT bookmarks_pkey PRIMARY KEY (user_id, lynt_id)
);

CREATE INDEX bookmarks_user_id_saved_at_idx
    ON bookmarks(user_id, saved_at);

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------

CREATE TABLE polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lynt_id TEXT NOT NULL UNIQUE REFERENCES lynts(id) ON DELETE CASCADE,
    title VARCHAR(140) NOT NULL,
    multi_select BOOLEAN DEFAULT FALSE NOT NULL,
    resolve_at TIMESTAMP DEFAULT NULL,
    resolved_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voted_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT poll_votes_pkey PRIMARY KEY (poll_id, option_id, user_id)
);

-- ---------------------------------------------------------------------------
-- LyntCoins
-- ---------------------------------------------------------------------------

CREATE TABLE lc_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    lynt_id TEXT REFERENCES lynts(id),
    source_user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX lc_transactions_dedup
    ON lc_transactions(lynt_id, source_user_id, reason);

-- ---------------------------------------------------------------------------
-- Direct Messages
-- ---------------------------------------------------------------------------

CREATE TABLE dm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    user_b_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    is_group BOOLEAN DEFAULT FALSE NOT NULL,
    name VARCHAR(100) DEFAULT NULL,
    icon_url TEXT DEFAULT NULL,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP DEFAULT NOW(),
    last_message_preview TEXT DEFAULT ''
);

CREATE UNIQUE INDEX dm_conversations_unique_pair
    ON dm_conversations(user_a_id, user_b_id);

CREATE TABLE dm_members (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    nickname VARCHAR(60) DEFAULT NULL,
    muted BOOLEAN DEFAULT FALSE NOT NULL,
    pinned BOOLEAN DEFAULT FALSE NOT NULL,
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP DEFAULT NULL,
    last_read_message_id UUID DEFAULT NULL,
    last_read_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT dm_members_pkey PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX dm_members_user_id_idx
    ON dm_members(user_id);

CREATE TABLE dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT DEFAULT NULL,
    gif_url TEXT DEFAULT NULL,
    gif_preview_url TEXT DEFAULT NULL,
    attachment_url TEXT DEFAULT NULL,
    attachment_name TEXT DEFAULT NULL,
    attachment_size INTEGER DEFAULT NULL,
    attachment_type TEXT DEFAULT NULL,
    reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMP DEFAULT NULL,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX dm_messages_conversation_id_idx
    ON dm_messages(conversation_id, created_at);

CREATE TABLE dm_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX dm_reactions_unique
    ON dm_reactions(message_id, user_id, emoji);

CREATE INDEX dm_reactions_message_id_idx
    ON dm_reactions(message_id);

CREATE TABLE user_blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id)
);

-- ---------------------------------------------------------------------------
-- Hashtags
-- ---------------------------------------------------------------------------

CREATE TABLE lynt_hashtags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lynt_id TEXT NOT NULL REFERENCES lynts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX lynt_hashtags_lynt_tag_idx
    ON lynt_hashtags(lynt_id, tag);

CREATE INDEX lynt_hashtags_tag_idx
    ON lynt_hashtags(tag);

-- ---------------------------------------------------------------------------
-- Developer API
-- ---------------------------------------------------------------------------

CREATE TABLE api_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL DEFAULT 'Default',
    client_id TEXT NOT NULL UNIQUE,
    secret_hash TEXT NOT NULL,
    secret_salt TEXT NOT NULL,
    secret_last4 TEXT NOT NULL,
    revoked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NULL,
    secret_version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX api_clients_user_id_idx
    ON api_clients(user_id);

-- ---------------------------------------------------------------------------
-- Web Push
-- ---------------------------------------------------------------------------

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX push_subscriptions_user_endpoint
    ON push_subscriptions(user_id, endpoint);

CREATE INDEX push_subscriptions_user_id_idx
    ON push_subscriptions(user_id);

-- ---------------------------------------------------------------------------
-- Scrollables
-- ---------------------------------------------------------------------------

CREATE TABLE scrollables (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption TEXT DEFAULT '',
    video_key TEXT NOT NULL,
    thumbnail_key TEXT DEFAULT NULL,
    duration_seconds INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    views INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX scrollables_created_at_idx
    ON scrollables(created_at);

CREATE INDEX scrollables_user_id_created_at_idx
    ON scrollables(user_id, created_at);

CREATE TABLE scrollable_likes (
    scrollable_id TEXT NOT NULL REFERENCES scrollables(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT scrollable_likes_pkey PRIMARY KEY (scrollable_id, user_id)
);

CREATE TABLE scrollable_bookmarks (
    scrollable_id TEXT NOT NULL REFERENCES scrollables(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT scrollable_bookmarks_pkey PRIMARY KEY (scrollable_id, user_id)
);

CREATE TABLE scrollable_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scrollable_id TEXT NOT NULL REFERENCES scrollables(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    gif_url TEXT DEFAULT NULL,
    gif_preview_url TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX scrollable_comments_scrollable_id_created_at_idx
    ON scrollable_comments(scrollable_id, created_at);

-- ---------------------------------------------------------------------------
-- Lynt reactions
-- ---------------------------------------------------------------------------

CREATE TABLE lynt_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lynt_id TEXT NOT NULL REFERENCES lynts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX lynt_reactions_unique
    ON lynt_reactions(lynt_id, user_id, emoji);

CREATE INDEX lynt_reactions_lynt_id_idx
    ON lynt_reactions(lynt_id);

-- ---------------------------------------------------------------------------
-- Dev Cycle / changelog
-- ---------------------------------------------------------------------------

CREATE TABLE dev_cycle_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(32) DEFAULT NULL,
    title VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    published BOOLEAN DEFAULT FALSE NOT NULL,
    published_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX dev_cycle_entries_published_idx
    ON dev_cycle_entries(published, published_at);

CREATE TABLE dev_cycle_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES dev_cycle_entries(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'improved',
    content TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX dev_cycle_items_entry_id_idx
    ON dev_cycle_items(entry_id, position);

COMMIT;
