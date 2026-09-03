import express from 'express';
import {
	Client,
	GatewayIntentBits,
	TextChannel,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	SlashCommandBuilder,
	REST,
	Routes,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	PermissionFlagsBits,
	Colors,
	type MessageActionRowComponentBuilder,
	type ChatInputCommandInteraction,
	type ButtonInteraction,
	type ModalSubmitInteraction,
	type StringSelectMenuInteraction
} from 'discord.js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config({ path: '.env' });

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const DISCORD_TOKEN      = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_CLIENT_ID  = process.env.PUBLIC_DISCORD_CLIENT_ID!;
const CHANNEL_ID         = process.env.DISCORD_CHANNEL_ID!;
const LOG_CHANNEL_ID     = process.env.DISCORD_LOG_CHANNEL_ID || CHANNEL_ID;
const STATS_CHANNEL_ID   = process.env.DISCORD_STATS_CHANNEL_ID || '';
const ADMIN_KEY          = process.env.ADMIN_KEY!;
const API_BASE_URL       = process.env.API_BASE_URL || 'http://lyntr:3000';
const MINIO_ENDPOINT     = process.env.MINIO_ENDPOINT || 'minio';
const S3_BUCKET          = process.env.S3_BUCKET_NAME!;
const SITE_URL           = process.env.PUBLIC_ORIGIN || 'https://lyntr.gizmowizard.tech';

// ─────────────────────────────────────────────────────────────
// In-memory persistent storage (survives bot restarts only via
// the Map — for true persistence wire these to your Postgres DB)
// ─────────────────────────────────────────────────────────────

// report message id → { lyntId, userId, reporterId, reportCount, category }
const reportData = new Map<string, {
	lyntId: string;
	userId: string;
	reporterId: string;
	category: string;
	reportCount: number;
}>();

// userId → array of mod actions
const modHistory = new Map<string, ModAction[]>();

// userId → moderator notes
const modNotes = new Map<string, string[]>();

// userId → warn count
const warnCount = new Map<string, number>();

// userId → mute expiry timestamp (0 = permanent)
const mutedUsers = new Map<string, number>();

// userId → temp ban expiry timestamp
const tempBannedUsers = new Map<string, number>();

// userId → discord user id (for DM notifications)
const discordLinks = new Map<string, string>();

interface ModAction {
	action: string;
	reason: string;
	moderator: string;
	timestamp: Date;
}

// ─────────────────────────────────────────────────────────────
// Express
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// Discord client
// ─────────────────────────────────────────────────────────────
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages
	]
});

// ─────────────────────────────────────────────────────────────
// Slash command definitions
// ─────────────────────────────────────────────────────────────
const commands = [
	// Moderation
	new SlashCommandBuilder()
		.setName('verify')
		.setDescription('Grant verified badge to a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('unverify')
		.setDescription('Remove verified badge from a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Permanently ban a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason for ban').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('unban')
		.setDescription('Unban a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Warn a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Warning reason').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('mute')
		.setDescription('Mute a user (prevent posting)')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes (0 = permanent)').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('unmute')
		.setDescription('Unmute a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('tempban')
		.setDescription('Temporarily ban a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('note')
		.setDescription('Add a moderator note to a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.addStringOption(o => o.setName('note').setDescription('Note text').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('adjustiq')
		.setDescription('Adjust a user\'s IQ score')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.addIntegerOption(o => o.setName('iq').setDescription('New IQ value').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('shadowban')
		.setDescription('Shadowban a user (content hidden from others, invisible to them)')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false),

	// Lookup
	new SlashCommandBuilder()
		.setName('profile')
		.setDescription('View a user\'s full profile')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('lookup')
		.setDescription('Quick user lookup — ID, IQ, verification, join date')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('modhistory')
		.setDescription('View moderation history for a user')
		.addStringOption(o => o.setName('handle').setDescription('Lyntr handle').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('reports')
		.setDescription('Show recent unresolved reports')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	// Stats
	new SlashCommandBuilder()
		.setName('stats')
		.setDescription('Lyntr platform statistics')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	new SlashCommandBuilder()
		.setName('health')
		.setDescription('Infrastructure health check')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.setDMPermission(false),

	// Fun
	new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('Top users by follower count'),

	new SlashCommandBuilder()
		.setName('iqleaderboard')
		.setDescription('Top users by IQ score'),

	new SlashCommandBuilder()
		.setName('randomlynt')
		.setDescription('Get a random lynt'),

	new SlashCommandBuilder()
		.setName('featured')
		.setDescription('Show the most liked lynt from the last 24 hours'),

	new SlashCommandBuilder()
		.setName('quote')
		.setDescription('Random quote from a Lyntr user')
		.addStringOption(o => o.setName('handle').setDescription('Specific user handle (optional)').setRequired(false)),
].map(c => c.toJSON());

// ─────────────────────────────────────────────────────────────
// Register slash commands
// ─────────────────────────────────────────────────────────────
async function registerCommands() {
	const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
	try {
		console.log('Registering slash commands...');
		await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
		console.log('Slash commands registered.');
	} catch (err) {
		console.error('Failed to register commands:', err);
	}
}

// ─────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────
async function apiGet(path: string) {
	const res = await fetch(`${API_BASE_URL}${path}`, {
		headers: { Authorization: ADMIN_KEY }
	});
	if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
	return res.json() as Promise<any>;
}

async function apiPost(path: string, body: any) {
	const res = await fetch(`${API_BASE_URL}${path}`, {
		method: 'POST',
		headers: { Authorization: ADMIN_KEY, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
	return res.json() as Promise<any>;
}

async function apiDelete(path: string) {
	const res = await fetch(`${API_BASE_URL}${path}`, {
		method: 'DELETE',
		headers: { Authorization: ADMIN_KEY }
	});
	if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
	return res.json() as Promise<any>;
}

async function fetchUser(handle: string): Promise<any> {
	return apiGet(`/api/profile?handle=${handle}`);
}

async function fetchUserById(id: string): Promise<any> {
	return apiGet(`/api/profile?id=${id}`);
}

async function fetchLynt(lyntId: string): Promise<any> {
	return apiGet(`/api/lynt?id=${lyntId}`);
}

async function fetchStats(): Promise<any> {
	return apiGet('/api/admin/stats');
}

// ─────────────────────────────────────────────────────────────
// Avatar/image helpers
// ─────────────────────────────────────────────────────────────
async function fetchAttachment(url: string, name: string) {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const buf = await res.buffer();
		return { attachment: buf, name };
	} catch {
		return null;
	}
}

function avatarUrl(userId: string) {
	return `http://${MINIO_ENDPOINT}:9000/${S3_BUCKET}/${userId}_small.webp`;
}

function lyntImageUrl(lyntId: string) {
	return `http://${MINIO_ENDPOINT}:9000/${S3_BUCKET}/${lyntId}.webp`;
}

// ─────────────────────────────────────────────────────────────
// Mod action logger
// ─────────────────────────────────────────────────────────────
function logModAction(userId: string, action: string, reason: string, moderator: string) {
	const history = modHistory.get(userId) || [];
	history.push({ action, reason, moderator, timestamp: new Date() });
	modHistory.set(userId, history);
}

async function sendModLog(embed: EmbedBuilder) {
	try {
		const ch = await client.channels.fetch(LOG_CHANNEL_ID);
		if (ch instanceof TextChannel) await ch.send({ embeds: [embed] });
	} catch (err) {
		console.error('Failed to send mod log:', err);
	}
}

// ─────────────────────────────────────────────────────────────
// DM helpers
// ─────────────────────────────────────────────────────────────
async function dmUser(discordUserId: string, embed: EmbedBuilder) {
	try {
		const user = await client.users.fetch(discordUserId);
		await user.send({ embeds: [embed] });
	} catch {
		// DMs disabled — silently ignore
	}
}

// ─────────────────────────────────────────────────────────────
// Embed builders
// ─────────────────────────────────────────────────────────────
function profileEmbed(user: any, extra: string = '') {
	const joinDate = new Date(user.created_at).toLocaleDateString('en-GB', {
		day: '2-digit', month: 'short', year: 'numeric'
	});

	return new EmbedBuilder()
		.setColor(0x1D9E75)
		.setTitle(`${user.username} (@${user.handle})`)
		.setURL(`${SITE_URL}/@${user.handle}`)
		.setThumbnail(`attachment://${user.id}_small.webp`)
		.addFields(
			{ name: '🧠 IQ',         value: String(user.iq),         inline: true },
			{ name: '✅ Verified',    value: user.verified ? 'Yes' : 'No', inline: true },
			{ name: '🛡️ Admin',      value: user.is_admin ? 'Yes' : 'No', inline: true },
			{ name: '👥 Followers',  value: String(user.followers),  inline: true },
			{ name: '👤 Following',  value: String(user.following),  inline: true },
			{ name: '🔥 Streak',     value: `${user.login_streak ?? 1} days`, inline: true },
			{ name: '📅 Joined',     value: joinDate,                inline: true },
			{ name: '📝 Bio',        value: user.bio || 'No bio',    inline: false },
		)
		.setFooter({ text: `ID: ${user.id}${extra ? ' • ' + extra : ''}` })
		.setTimestamp();
}

function reportEmbed(
	category: string,
	reportText: string,
	lynt: any,
	reportedUser: any,
	reporter: any,
	reportCount: number
) {
	const color = reportCount >= 5 ? Colors.DarkRed : reportCount >= 3 ? Colors.Orange : Colors.Red;
	return new EmbedBuilder()
		.setColor(color)
		.setTitle(`🚨 Report — ${category}`)
		.setDescription(`**"${reportText}"**`)
		.setAuthor({
			name: `${reportedUser.username} (@${reportedUser.handle})`,
			iconURL: `attachment://${reportedUser.id}_small.webp`,
			url: `${SITE_URL}/@${reportedUser.handle}`
		})
		.addFields(
			{ name: '👤 Reported User', value: `${reportedUser.username} (@${reportedUser.handle})\nID: \`${reportedUser.id}\``, inline: true },
			{ name: '🔍 Reporter',      value: `${reporter.username} (@${reporter.handle})`,                                      inline: true },
			{ name: '📊 Report Count',  value: `${reportCount} total reports against this user`,                                  inline: true },
			{ name: '📝 Lynt Content',  value: lynt.content?.slice(0, 1024) || 'N/A' },
			{ name: '🔗 Lynt ID',       value: `[\`${lynt.id}\`](${SITE_URL}/?id=${lynt.id})` },
		)
		.setTimestamp()
		.setFooter({ text: reportCount >= 5 ? '⚠️ AUTO-ESCALATED: 5+ reports' : 'Awaiting moderation' });
}

function modActionEmbed(action: string, user: any, reason: string, moderator: string, color: number) {
	return new EmbedBuilder()
		.setColor(color)
		.setTitle(`🔨 ${action}`)
		.addFields(
			{ name: 'User',      value: `${user.username} (@${user.handle})`, inline: true },
			{ name: 'Reason',    value: reason || 'No reason provided',       inline: true },
			{ name: 'Moderator', value: moderator,                            inline: true }
		)
		.setTimestamp();
}

// ─────────────────────────────────────────────────────────────
// Report action row
// ─────────────────────────────────────────────────────────────
function reportActionRow(escalated = false) {
	const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
		new ButtonBuilder().setCustomId('report_delete_lynt').setLabel('🗑️ Delete Lynt').setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId('report_warn').setLabel('⚠️ Warn User').setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId('report_mute').setLabel('🔇 Mute 1h').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('report_ban').setLabel('🔨 Ban User').setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId('report_ignore').setLabel('✅ Ignore').setStyle(ButtonStyle.Secondary),
	);
	return [row1];
}

// ─────────────────────────────────────────────────────────────
// Slash command handler
// ─────────────────────────────────────────────────────────────
// Commands that must never run without real mod/admin permission in a guild,
// regardless of what Discord's client-side integration settings allow.
const RESTRICTED_COMMANDS: Record<string, bigint> = {
	verify: PermissionFlagsBits.ModerateMembers,
	unverify: PermissionFlagsBits.ModerateMembers,
	ban: PermissionFlagsBits.BanMembers,
	unban: PermissionFlagsBits.BanMembers,
	warn: PermissionFlagsBits.ModerateMembers,
	mute: PermissionFlagsBits.ModerateMembers,
	unmute: PermissionFlagsBits.ModerateMembers,
	tempban: PermissionFlagsBits.BanMembers,
	note: PermissionFlagsBits.ModerateMembers,
	adjustiq: PermissionFlagsBits.Administrator,
	shadowban: PermissionFlagsBits.Administrator,
	profile: PermissionFlagsBits.ModerateMembers,
	lookup: PermissionFlagsBits.ModerateMembers,
	modhistory: PermissionFlagsBits.ModerateMembers,
	reports: PermissionFlagsBits.ModerateMembers,
	stats: PermissionFlagsBits.ModerateMembers,
	health: PermissionFlagsBits.ModerateMembers
};

async function handleSlash(interaction: ChatInputCommandInteraction) {
	const { commandName } = interaction;

	// Hard server-side gate — never trust setDefaultMemberPermissions/
	// setDMPermission alone, since guild admins can override integration
	// permissions and DMs have no member/permission context at all.
	const requiredPerm = RESTRICTED_COMMANDS[commandName];
	if (requiredPerm !== undefined) {
		if (!interaction.inGuild() || !interaction.memberPermissions?.has(requiredPerm)) {
			await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
			return;
		}
	}

	// Mod/admin actions stay ephemeral (only the invoker sees them);
	// public fun commands post a normal visible message in the channel.
	await interaction.deferReply({ ephemeral: requiredPerm !== undefined });

	try {
		switch (commandName) {

		// ── /verify ──────────────────────────────────────────
		case 'verify': {
			const handle = interaction.options.getString('handle', true);
			const user = await fetchUser(handle);
			await apiPost(`/api/verify?handle=${handle}`, {});
			logModAction(user.id, 'Verified', 'Verified badge granted', interaction.user.tag);
			await sendModLog(modActionEmbed('User Verified', user, 'Verified badge granted', interaction.user.tag, Colors.Green));
			await interaction.editReply({ content: `✅ **@${handle}** is now verified.` });
			break;
		}

		case 'unverify': {
			const handle = interaction.options.getString('handle', true);
			await apiPost(`/api/verify?handle=${handle}&remove=true`, {});
			await interaction.editReply({ content: `✅ Removed verified badge from **@${handle}**.` });
			break;
		}

		// ── /ban ─────────────────────────────────────────────
		case 'ban': {
			const handle = interaction.options.getString('handle', true);
			const reason = interaction.options.getString('reason') || 'No reason provided';
			const user = await fetchUser(handle);
			await apiPost('/api/ban', { userId: user.id });
			logModAction(user.id, 'Banned', reason, interaction.user.tag);
			await sendModLog(modActionEmbed('User Banned', user, reason, interaction.user.tag, Colors.DarkRed));
			await interaction.editReply({ content: `🔨 **@${handle}** has been permanently banned.\nReason: ${reason}` });
			break;
		}

		// ── /unban ───────────────────────────────────────────
		case 'unban': {
			const handle = interaction.options.getString('handle', true);
			await apiPost(`/api/unban?handle=${handle}`, {});
			await interaction.editReply({ content: `✅ **@${handle}** has been unbanned.` });
			break;
		}

		// ── /warn ────────────────────────────────────────────
		case 'warn': {
			const handle = interaction.options.getString('handle', true);
			const reason = interaction.options.getString('reason', true);
			const user = await fetchUser(handle);
			const count = (warnCount.get(user.id) || 0) + 1;
			warnCount.set(user.id, count);
			logModAction(user.id, `Warned (${count}x)`, reason, interaction.user.tag);
			await sendModLog(modActionEmbed(`User Warned (${count}x total)`, user, reason, interaction.user.tag, Colors.Yellow));
			if (count >= 3) {
				await sendModLog(new EmbedBuilder()
					.setColor(Colors.Orange)
					.setTitle('⚠️ Auto-escalation: 3+ Warnings')
					.setDescription(`**@${handle}** has received ${count} warnings. Consider a ban.`)
					.setTimestamp()
				);
			}
			await interaction.editReply({ content: `⚠️ **@${handle}** warned (${count} total).\nReason: ${reason}` });
			break;
		}

		// ── /mute ────────────────────────────────────────────
		case 'mute': {
			const handle = interaction.options.getString('handle', true);
			const minutes = interaction.options.getInteger('minutes', true);
			const reason = interaction.options.getString('reason') || 'No reason provided';
			const user = await fetchUser(handle);
			const expiry = minutes === 0 ? 0 : Date.now() + minutes * 60_000;
			mutedUsers.set(user.id, expiry);
			logModAction(user.id, `Muted ${minutes === 0 ? 'permanently' : `${minutes}m`}`, reason, interaction.user.tag);
			await sendModLog(modActionEmbed(`User Muted (${minutes === 0 ? 'permanent' : `${minutes}m`})`, user, reason, interaction.user.tag, Colors.Orange));
			await interaction.editReply({
				content: `🔇 **@${handle}** muted ${minutes === 0 ? 'permanently' : `for ${minutes} minutes`}.\nReason: ${reason}`
			});
			break;
		}

		case 'unmute': {
			const handle = interaction.options.getString('handle', true);
			const user = await fetchUser(handle);
			mutedUsers.delete(user.id);
			await interaction.editReply({ content: `🔊 **@${handle}** has been unmuted.` });
			break;
		}

		// ── /tempban ─────────────────────────────────────────
		case 'tempban': {
			const handle = interaction.options.getString('handle', true);
			const minutes = interaction.options.getInteger('minutes', true);
			const reason = interaction.options.getString('reason') || 'No reason provided';
			const user = await fetchUser(handle);
			const expiry = Date.now() + minutes * 60_000;
			tempBannedUsers.set(user.id, expiry);
			await apiPost('/api/ban', { userId: user.id });
			logModAction(user.id, `Temp banned ${minutes}m`, reason, interaction.user.tag);

			// Schedule unban
			setTimeout(async () => {
				try {
					await apiPost(`/api/unban?handle=${handle}`, {});
					tempBannedUsers.delete(user.id);
					await sendModLog(new EmbedBuilder()
						.setColor(Colors.Green)
						.setTitle('⏱️ Temp Ban Expired')
						.setDescription(`**@${handle}** has been automatically unbanned.`)
						.setTimestamp()
					);
				} catch (e) {
					console.error('Auto-unban failed:', e);
				}
			}, minutes * 60_000);

			await sendModLog(modActionEmbed(`Temp Banned (${minutes}m)`, user, reason, interaction.user.tag, Colors.DarkOrange));
			await interaction.editReply({ content: `⏱️ **@${handle}** temp banned for ${minutes} minutes.\nReason: ${reason}` });
			break;
		}

		// ── /note ────────────────────────────────────────────
		case 'note': {
			const handle = interaction.options.getString('handle', true);
			const note = interaction.options.getString('note', true);
			const user = await fetchUser(handle);
			const notes = modNotes.get(user.id) || [];
			notes.push(`[${new Date().toISOString()}] ${interaction.user.tag}: ${note}`);
			modNotes.set(user.id, notes);
			await interaction.editReply({ content: `📝 Note added to **@${handle}**.` });
			break;
		}

		// ── /adjustiq ────────────────────────────────────────
		case 'adjustiq': {
			const handle = interaction.options.getString('handle', true);
			const iq = interaction.options.getInteger('iq', true);
			const user = await fetchUser(handle);
			await apiPost('/api/admin/adjustiq', { userId: user.id, iq });
			logModAction(user.id, `IQ adjusted to ${iq}`, 'Admin adjustment', interaction.user.tag);
			await interaction.editReply({ content: `🧠 **@${handle}**'s IQ set to **${iq}**.` });
			break;
		}

		// ── /shadowban ───────────────────────────────────────
		case 'shadowban': {
			const handle = interaction.options.getString('handle', true);
			const user = await fetchUser(handle);
			await apiPost('/api/admin/shadowban', { userId: user.id });
			logModAction(user.id, 'Shadowbanned', 'Content hidden from others', interaction.user.tag);
			await sendModLog(modActionEmbed('User Shadowbanned', user, 'Content hidden from feed', interaction.user.tag, Colors.DarkPurple));
			await interaction.editReply({ content: `👻 **@${handle}** has been shadowbanned.` });
			break;
		}

		// ── /profile ─────────────────────────────────────────
		case 'profile': {
			const handle = interaction.options.getString('handle', true);
			const user = await fetchUser(handle);
			const avatar = await fetchAttachment(avatarUrl(user.id), `${user.id}_small.webp`);
			const notes = modNotes.get(user.id) || [];
			const history = modHistory.get(user.id) || [];
			const warns = warnCount.get(user.id) || 0;

			const embed = profileEmbed(user, `${warns} warns • ${history.length} mod actions`);
			if (notes.length) embed.addFields({ name: '📋 Mod Notes', value: notes.slice(-3).join('\n').slice(0, 1000) });

			const files = avatar ? [avatar] : [];
			await interaction.editReply({ embeds: [embed], files });
			break;
		}

		// ── /lookup ──────────────────────────────────────────
		case 'lookup': {
			const handle = interaction.options.getString('handle', true);
			const user = await fetchUser(handle);
			const warns = warnCount.get(user.id) || 0;
			const history = modHistory.get(user.id) || [];
			const isMuted = mutedUsers.has(user.id);
			const isTempBanned = tempBannedUsers.has(user.id);

			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle(`🔍 ${user.username} (@${user.handle})`)
				.setURL(`${SITE_URL}/@${user.handle}`)
				.addFields(
					{ name: 'ID',           value: `\`${user.id}\``,                                    inline: true  },
					{ name: 'IQ',           value: String(user.iq),                                     inline: true  },
					{ name: 'Verified',     value: user.verified ? '✅' : '❌',                          inline: true  },
					{ name: 'Banned',       value: user.banned ? '🔨 Yes' : '✅ No',                    inline: true  },
					{ name: 'Muted',        value: isMuted ? '🔇 Yes' : '🔊 No',                        inline: true  },
					{ name: 'Temp Banned',  value: isTempBanned ? '⏱️ Yes' : '✅ No',                   inline: true  },
					{ name: 'Warnings',     value: String(warns),                                       inline: true  },
					{ name: 'Mod Actions',  value: String(history.length),                              inline: true  },
					{ name: 'Followers',    value: String(user.followers),                              inline: true  },
					{ name: 'Joined',       value: new Date(user.created_at).toLocaleDateString(),      inline: true  },
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /modhistory ──────────────────────────────────────
		case 'modhistory': {
			const handle = interaction.options.getString('handle', true);
			const user = await fetchUser(handle);
			const history = modHistory.get(user.id) || [];
			const notes = modNotes.get(user.id) || [];

			const historyText = history.length
				? history.slice(-10).map(h =>
					`\`${new Date(h.timestamp).toLocaleDateString()}\` **${h.action}** — ${h.reason} *(${h.moderator})*`
				  ).join('\n')
				: 'No moderation history.';

			const notesText = notes.length
				? notes.slice(-5).join('\n').slice(0, 500)
				: 'No notes.';

			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle(`📋 Mod History — @${handle}`)
				.addFields(
					{ name: 'Actions', value: historyText.slice(0, 1024) },
					{ name: 'Notes',   value: notesText }
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /reports ─────────────────────────────────────────
		case 'reports': {
			const active = [...reportData.entries()].slice(-10);
			if (!active.length) {
				await interaction.editReply({ content: '✅ No active reports.' });
				break;
			}
			const lines = active.map(([msgId, r]) =>
				`[Jump](https://discord.com/channels/${interaction.guildId}/${CHANNEL_ID}/${msgId}) • \`${r.lyntId.slice(-8)}\` • User \`${r.userId.slice(-8)}\` • Reports: **${r.reportCount}** • ${r.category}`
			).join('\n');

			await interaction.editReply({
				embeds: [new EmbedBuilder()
					.setColor(Colors.Orange)
					.setTitle('🚨 Active Reports')
					.setDescription(lines)
					.setTimestamp()
				]
			});
			break;
		}

		// ── /stats ───────────────────────────────────────────
		case 'stats': {
			const stats = await fetchStats().catch(() => null);
			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle('📊 Lyntr Platform Stats')
				.setTimestamp();

			if (stats) {
				embed.addFields(
					{ name: '👥 Total Users',    value: String(stats.totalUsers),    inline: true },
					{ name: '📝 Total Lynts',    value: String(stats.totalLynts),    inline: true },
					{ name: '📸 Total Images',   value: String(stats.totalImages),   inline: true },
					{ name: '📈 Active Today',   value: String(stats.activeToday),   inline: true },
					{ name: '❤️ Total Likes',    value: String(stats.totalLikes),    inline: true },
					{ name: '🔁 Total Reposts',  value: String(stats.totalReposts),  inline: true },
				);
			} else {
				embed.setDescription('⚠️ Stats endpoint not available. Add `/api/admin/stats` to get full stats.');
			}

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /health ──────────────────────────────────────────
		case 'health': {
			const checks = await Promise.allSettled([
				fetch(`${API_BASE_URL}/api/me`).then(r => r.status < 500),
				fetch(`http://${MINIO_ENDPOINT}:9000/minio/health/live`).then(r => r.ok),
			]);

			const api    = checks[0].status === 'fulfilled' && checks[0].value;
			const minio  = checks[1].status === 'fulfilled' && checks[1].value;

			const embed = new EmbedBuilder()
				.setColor(api && minio ? Colors.Green : Colors.Red)
				.setTitle('🏥 Infrastructure Health')
				.addFields(
					{ name: 'Lyntr API',       value: api   ? '🟢 Online' : '🔴 Offline', inline: true },
					{ name: 'MinIO Storage',   value: minio ? '🟢 Online' : '🔴 Offline', inline: true },
					{ name: 'Discord Bot',     value: '🟢 Online',                         inline: true },
					{ name: 'Bot Uptime',      value: formatUptime(client.uptime || 0),    inline: true },
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /leaderboard ─────────────────────────────────────
		case 'leaderboard': {
			const data = await apiGet('/api/admin/leaderboard?by=followers').catch(() => null);
			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle('🏆 Follower Leaderboard')
				.setTimestamp();

			if (data?.users?.length) {
				const lines = data.users.slice(0, 10).map((u: any, i: number) =>
					`**${i + 1}.** [@${u.handle}](${SITE_URL}/@${u.handle}) — ${u.followers} followers`
				).join('\n');
				embed.setDescription(lines);
			} else {
				embed.setDescription('No leaderboard data available.');
			}

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /iqleaderboard ───────────────────────────────────
		case 'iqleaderboard': {
			const data = await apiGet('/api/admin/leaderboard?by=iq').catch(() => null);
			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle('🧠 IQ Leaderboard')
				.setTimestamp();

			if (data?.users?.length) {
				const lines = data.users.slice(0, 10).map((u: any, i: number) =>
					`**${i + 1}.** [@${u.handle}](${SITE_URL}/@${u.handle}) — IQ ${u.iq}`
				).join('\n');
				embed.setDescription(lines);
			} else {
				embed.setDescription('No leaderboard data available.');
			}

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /randomlynt ──────────────────────────────────────
		case 'randomlynt': {
			const data = await apiGet('/api/admin/randomlynt').catch(() => null);
			if (!data) {
				await interaction.editReply({ content: '⚠️ Could not fetch a random lynt.' });
				break;
			}
			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle(`💬 Random Lynt by @${data.handle}`)
				.setURL(`${SITE_URL}/?id=${data.id}`)
				.setDescription(data.content)
				.addFields(
					{ name: '❤️ Likes',    value: String(data.likeCount),    inline: true },
					{ name: '💬 Comments', value: String(data.commentCount), inline: true },
					{ name: '🔁 Reposts',  value: String(data.repostCount),  inline: true },
				)
				.setTimestamp(new Date(data.createdAt));

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /featured ────────────────────────────────────────
		case 'featured': {
			const data = await apiGet('/api/admin/featured').catch(() => null);
			if (!data) {
				await interaction.editReply({ content: '⚠️ Could not fetch featured lynt.' });
				break;
			}
			const embed = new EmbedBuilder()
				.setColor(Colors.Gold)
				.setTitle(`⭐ Featured Lynt — @${data.handle}`)
				.setURL(`${SITE_URL}/?id=${data.id}`)
				.setDescription(data.content)
				.addFields(
					{ name: '❤️ Likes',    value: String(data.likeCount),    inline: true },
					{ name: '💬 Comments', value: String(data.commentCount), inline: true },
					{ name: '🔁 Reposts',  value: String(data.repostCount),  inline: true },
				)
				.setFooter({ text: 'Most liked lynt in the last 24 hours' })
				.setTimestamp(new Date(data.createdAt));

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		// ── /quote ───────────────────────────────────────────
		case 'quote': {
			const handle = interaction.options.getString('handle');
			const url = handle
				? `/api/admin/randomlynt?handle=${handle}`
				: '/api/admin/randomlynt';
			const data = await apiGet(url).catch(() => null);

			if (!data) {
				await interaction.editReply({ content: '⚠️ Could not find a lynt.' });
				break;
			}

			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setDescription(`*"${data.content}"*\n\n— **@${data.handle}**`)
				.setURL(`${SITE_URL}/?id=${data.id}`)
				.setTimestamp(new Date(data.createdAt));

			await interaction.editReply({ embeds: [embed] });
			break;
		}

		default:
			await interaction.editReply({ content: '❓ Unknown command.' });
		}
	} catch (err: any) {
		console.error(`Slash command /${commandName} error:`, err);
		await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
	}
}

// ─────────────────────────────────────────────────────────────
// Button interaction handler
// ─────────────────────────────────────────────────────────────
async function handleButton(interaction: ButtonInteraction) {
	const report = reportData.get(interaction.message.id);
	if (!report) {
		await interaction.reply({ content: '⚠️ Report data expired.', ephemeral: true });
		return;
	}

	await interaction.deferUpdate();
	const { lyntId, userId } = report;
	let resultText = '';

	try {
		switch (interaction.customId) {
		case 'report_delete_lynt':
			await apiDelete(`/api/lynt?id=${lyntId}`);
			logModAction(userId, 'Lynt deleted via report', report.category, interaction.user.tag);
			resultText = `✅ Lynt \`${lyntId.slice(-8)}\` deleted by ${interaction.user.tag}`;
			break;

		case 'report_ban': {
			await apiPost('/api/ban', { userId });
			logModAction(userId, 'Banned via report', report.category, interaction.user.tag);
			const user = await fetchUserById(userId).catch(() => ({ handle: userId }));
			await sendModLog(modActionEmbed('User Banned via Report', user, report.category, interaction.user.tag, Colors.DarkRed));
			resultText = `🔨 User \`${userId.slice(-8)}\` banned by ${interaction.user.tag}`;
			break;
		}

		case 'report_warn': {
			const user = await fetchUserById(userId).catch(() => null);
			if (user) {
				const count = (warnCount.get(userId) || 0) + 1;
				warnCount.set(userId, count);
				logModAction(userId, `Warned (${count}x) via report`, report.category, interaction.user.tag);
			}
			resultText = `⚠️ User warned by ${interaction.user.tag}`;
			break;
		}

		case 'report_mute': {
			mutedUsers.set(userId, Date.now() + 60 * 60_000); // 1 hour
			logModAction(userId, 'Muted 1h via report', report.category, interaction.user.tag);
			setTimeout(() => mutedUsers.delete(userId), 60 * 60_000);
			resultText = `🔇 User muted 1h by ${interaction.user.tag}`;
			break;
		}

		case 'report_ignore':
			resultText = `✅ Report ignored by ${interaction.user.tag}`;
			break;

		default:
			resultText = '❓ Unknown action';
		}

		// Edit original report message to show resolved state
		const resolvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
			.setColor(Colors.Grey)
			.setFooter({ text: `Resolved: ${resultText}` });

		await interaction.editReply({
			embeds: [resolvedEmbed],
			components: []
		});

		reportData.delete(interaction.message.id);
	} catch (err: any) {
		await interaction.editReply({
			content: `❌ Error: ${err.message}`,
			components: []
		});
	}
}

// ─────────────────────────────────────────────────────────────
// Bot startup
// ─────────────────────────────────────────────────────────────
function startBot() {
	client.once('ready', () => {
		console.log(`✅ Logged in as ${client.user?.tag}`);
		registerCommands();
		scheduleDailyStats();
	});

	client.on('interactionCreate', async (interaction) => {
		try {
			if (interaction.isChatInputCommand()) return handleSlash(interaction);
			if (interaction.isButton())           return handleButton(interaction);
		} catch (err) {
			console.error('Interaction error:', err);
		}
	});

	client.login(DISCORD_TOKEN);
}

// ─────────────────────────────────────────────────────────────
// Daily stats post
// ─────────────────────────────────────────────────────────────
function scheduleDailyStats() {
	if (!STATS_CHANNEL_ID) return;

	async function postDaily() {
		try {
			const stats = await fetchStats().catch(() => null);
			if (!stats) return;

			const ch = await client.channels.fetch(STATS_CHANNEL_ID);
			if (!(ch instanceof TextChannel)) return;

			const embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle('📊 Daily Lyntr Stats')
				.addFields(
					{ name: '👥 Total Users',  value: String(stats.totalUsers),  inline: true },
					{ name: '📝 Total Lynts',  value: String(stats.totalLynts),  inline: true },
					{ name: '📈 Active Today', value: String(stats.activeToday), inline: true },
				)
				.setTimestamp();

			await ch.send({ embeds: [embed] });
		} catch (err) {
			console.error('Daily stats error:', err);
		}
	}

	// Post at midnight UTC every day
	const now = new Date();
	const midnight = new Date();
	midnight.setUTCHours(24, 0, 0, 0);
	const msUntilMidnight = midnight.getTime() - now.getTime();

	setTimeout(() => {
		postDaily();
		setInterval(postDaily, 24 * 60 * 60_000);
	}, msUntilMidnight);
}

// ─────────────────────────────────────────────────────────────
// Express endpoints (called by Lyntr app)
// ─────────────────────────────────────────────────────────────

// Inbound report from /api/report
app.post('/report', async (req, res) => {
	try {
		const { text, userId, lyntId, reporterId, category = 'General' } = req.body;
		if (!text || !userId || !lyntId || !reporterId) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		const [lynt, reportedUser, reporter] = await Promise.all([
			fetchLynt(lyntId),
			fetchUserById(userId),
			fetchUserById(reporterId)
		]);

		// Track report count per user
		const existing = [...reportData.values()].filter(r => r.userId === userId);
		const reportCount = existing.length + 1;

		const channel = await client.channels.fetch(CHANNEL_ID);
		if (!(channel instanceof TextChannel)) throw new Error('Invalid channel');

		const embed = reportEmbed(category, text, lynt, reportedUser, reporter, reportCount);
		const files: any[] = [];

		const avatar = await fetchAttachment(avatarUrl(userId), `${userId}_small.webp`);
		if (avatar) files.push(avatar);

		if (lynt.has_image) {
			const img = await fetchAttachment(lyntImageUrl(lyntId), `${lyntId}.webp`);
			if (img) {
				files.push(img);
				embed.setImage(`attachment://${lyntId}.webp`);
			}
		}

		const rows = reportActionRow(reportCount >= 5);
		const sent = await channel.send({ embeds: [embed], files, components: rows });
		reportData.set(sent.id, { lyntId, userId, reporterId, category, reportCount });

		// Auto-escalate: pin heavily reported lynts
		if (reportCount >= 5) {
			await sent.pin().catch(() => {});
		}

		res.json({ success: true });
	} catch (err: any) {
		console.error('Report error:', err);
		res.status(500).json({ error: err.message });
	}
});

// DM notification endpoint — called from Lyntr's notification system
app.post('/notify', async (req, res) => {
	try {
		const { type, targetDiscordId, data } = req.body;
		if (!targetDiscordId || !type) return res.status(400).json({ error: 'Missing fields' });

		let embed: EmbedBuilder;

		switch (type) {
		case 'verified':
			embed = new EmbedBuilder()
				.setColor(Colors.Green)
				.setTitle('✅ You\'re now verified on Lyntr!')
				.setDescription(`Your account [@${data.handle}](${SITE_URL}/@${data.handle}) has been verified.`)
				.setTimestamp();
			break;

		case 'banned':
			embed = new EmbedBuilder()
				.setColor(Colors.Red)
				.setTitle('🔨 Your Lyntr account has been banned')
				.setDescription(`Reason: ${data.reason || 'Violation of terms of service'}`)
				.setTimestamp();
			break;

		case 'warned':
			embed = new EmbedBuilder()
				.setColor(Colors.Yellow)
				.setTitle('⚠️ You have received a warning on Lyntr')
				.setDescription(`Reason: ${data.reason}`)
				.setTimestamp();
			break;

		case 'follow':
			embed = new EmbedBuilder()
				.setColor(0x1D9E75)
				.setTitle('👤 New follower on Lyntr!')
				.setDescription(`[@${data.fromHandle}](${SITE_URL}/@${data.fromHandle}) is now following you.`)
				.setTimestamp();
			break;

		case 'like':
			embed = new EmbedBuilder()
				.setColor(Colors.Red)
				.setTitle('❤️ Someone liked your lynt!')
				.setDescription(`[@${data.fromHandle}](${SITE_URL}/@${data.fromHandle}) liked your lynt:\n*"${data.lyntContent?.slice(0, 100)}"*`)
				.setURL(`${SITE_URL}/?id=${data.lyntId}`)
				.setTimestamp();
			break;

		case 'bookmark':
			embed = new EmbedBuilder()
				.setColor(Colors.Blue)
				.setTitle('🔖 Someone bookmarked your lynt!')
				.setDescription(`[@${data.fromHandle}](${SITE_URL}/@${data.fromHandle}) saved your lynt:\n*"${data.lyntContent?.slice(0, 100)}"*`)
				.setURL(`${SITE_URL}/?id=${data.lyntId}`)
				.setTimestamp();
			break;

		case 'mention':
			embed = new EmbedBuilder()
				.setColor(Colors.Blue)
				.setTitle('💬 You were mentioned on Lyntr!')
				.setDescription(`[@${data.fromHandle}](${SITE_URL}/@${data.fromHandle}) mentioned you:\n*"${data.lyntContent?.slice(0, 100)}"*`)
				.setURL(`${SITE_URL}/?id=${data.lyntId}`)
				.setTimestamp();
			break;

		default:
			return res.status(400).json({ error: 'Unknown notification type' });
		}

		await dmUser(targetDiscordId, embed);
		res.json({ success: true });
	} catch (err: any) {
		console.error('Notify error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Mute check endpoint — Lyntr calls this before allowing a post
app.get('/muted/:userId', (req, res) => {
	const { userId } = req.params;
	const expiry = mutedUsers.get(userId);
	if (!expiry) return res.json({ muted: false });
	if (expiry !== 0 && Date.now() > expiry) {
		mutedUsers.delete(userId);
		return res.json({ muted: false });
	}
	res.json({ muted: true, expiresAt: expiry || null });
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function formatUptime(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	const h = Math.floor(m / 60);
	const d = Math.floor(h / 24);
	if (d > 0) return `${d}d ${h % 24}h`;
	if (h > 0) return `${h}h ${m % 60}m`;
	return `${m}m ${s % 60}s`;
}

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────
startBot();
app.listen(5444, () => console.log('Bot HTTP server on :5444'));
