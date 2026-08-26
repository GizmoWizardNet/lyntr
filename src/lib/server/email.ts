/**
 * Email notification service — powered by Resend.
 *
 * Setup:
 *   1. Add RESEND_API_KEY to your .env
 *   2. Add EMAIL_FROM to your .env  (e.g. "Lyntr <notifs@mail.lyntr.com>")
 *      The domain must be verified in your Resend dashboard.
 *
 * All sends are fire-and-forget wrapped in try/catch so a Resend hiccup
 * never breaks the underlying action that triggered the notification.
 */

import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

const RESEND_API = 'https://api.resend.com/emails';

// ── Colour tokens kept in sync with app.css light-mode variables ──────────
const C = {
	bg:         '#F0E8D8',
	card:       '#FAF5EC',
	border:     '#C4A882',
	primary:    '#3D1F00',
	accent:     '#C17F3C',
	muted:      '#8B6D45',
	text:       '#1A0E04',
	textLight:  '#5C3E22',
	white:      '#FFFDF6',
};

// ── Base layout ────────────────────────────────────────────────────────────
function wrap(body: string, previewText: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Lyntr</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Tahoma,Geneva,Verdana,Arial,sans-serif;">

<!-- Preview text (hidden) -->
<div style="display:none;max-height:0;overflow:hidden;color:${C.bg};">${previewText}&nbsp;‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌</div>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${C.bg};">
  <tr><td align="center" style="padding:32px 16px;">

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:${C.primary};border-radius:8px 8px 0 0;padding:20px 28px;border-bottom:3px solid ${C.accent};">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td>
                <span style="font-size:22px;font-weight:800;color:${C.white};letter-spacing:-0.02em;">Lyntr</span>
              </td>
              <td align="right">
                <span style="font-size:11px;color:rgba(255,253,246,0.45);letter-spacing:0.06em;text-transform:uppercase;">Notification</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 8px 8px;padding:28px;">
          ${body}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:${C.muted};line-height:1.6;">
            You're receiving this because you enabled email notifications in your Lyntr profile settings.<br>
            <a href="https://lyntr.gizmowizard.tech" style="color:${C.accent};text-decoration:none;">Open Lyntr</a>
            &nbsp;·&nbsp;
            <a href="https://lyntr.gizmowizard.tech" style="color:${C.muted};text-decoration:none;">Manage notifications</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Reusable blocks ────────────────────────────────────────────────────────
function actorLine(actor: string, handle: string): string {
	return `<p style="margin:0 0 16px;font-size:14px;color:${C.textLight};">
		<strong style="color:${C.text};">${esc(actor)}</strong>
		<span style="color:${C.muted};"> @${esc(handle)}</span>
	</p>`;
}

function contentQuote(text: string): string {
	return `<blockquote style="margin:16px 0 0;padding:12px 16px;background:${C.bg};border-left:3px solid ${C.accent};border-radius:0 4px 4px 0;font-size:14px;color:${C.text};line-height:1.6;">${esc(text)}</blockquote>`;
}

function ctaButton(label: string, url: string): string {
	return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
		<tr>
			<td style="background:${C.primary};border-radius:4px;">
				<a href="${url}" style="display:inline-block;padding:10px 22px;font-size:13px;font-weight:700;color:${C.white};text-decoration:none;font-family:Tahoma,Geneva,Verdana,Arial,sans-serif;">${label}</a>
			</td>
		</tr>
	</table>`;
}

function bigAction(verb: string): string {
	return `<p style="margin:0 0 8px;font-size:28px;font-weight:800;color:${C.primary};letter-spacing:-0.02em;">${verb}</p>`;
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ── Per-type template builders ──────────────────────────────────────────────
type EmailPayload = { subject: string; html: string };

function buildEmail(
	type: string,
	actor: string,
	actorHandle: string,
	lyntContent?: string | null,
	lyntUrl?: string | null,
	forumThreadTitle?: string | null,
	forumUrl?: string | null,
): EmailPayload | null {
	const base = 'https://lyntr.gizmowizard.tech';

	switch (type) {
		case 'like':
			return {
				subject: `${actor} liked your lynt`,
				html: wrap(
					bigAction('Someone liked your lynt.') +
					actorLine(actor, actorHandle) +
					(lyntContent ? contentQuote(lyntContent) : '') +
					(lyntUrl ? ctaButton('View lynt', lyntUrl) : ''),
					`${actor} liked your lynt`
				)
			};

		case 'comment':
			return {
				subject: `${actor} replied to your lynt`,
				html: wrap(
					bigAction('You got a reply.') +
					actorLine(actor, actorHandle) +
					(lyntContent ? contentQuote(lyntContent) : '') +
					(lyntUrl ? ctaButton('View reply', lyntUrl) : ''),
					`${actor} replied to your lynt`
				)
			};

		case 'repost':
			return {
				subject: `${actor} reposted your lynt`,
				html: wrap(
					bigAction('Your lynt got reposted.') +
					actorLine(actor, actorHandle) +
					(lyntContent ? contentQuote(lyntContent) : '') +
					(lyntUrl ? ctaButton('View repost', lyntUrl) : ''),
					`${actor} reposted your lynt`
				)
			};

		case 'follow':
			return {
				subject: `${actor} followed you`,
				html: wrap(
					bigAction('New follower.') +
					actorLine(actor, actorHandle) +
					`<p style="margin:16px 0 0;font-size:14px;color:${C.textLight};">They're now following your lynts.</p>` +
					ctaButton(`View @${actorHandle}'s profile`, `${base}/@${actorHandle}`),
					`${actor} is now following you`
				)
			};

		case 'mention':
			return {
				subject: `${actor} mentioned you`,
				html: wrap(
					bigAction('You were mentioned.') +
					actorLine(actor, actorHandle) +
					(lyntContent ? contentQuote(lyntContent) : '') +
					(lyntUrl ? ctaButton('View mention', lyntUrl) : ''),
					`${actor} mentioned you in a lynt`
				)
			};

		case 'forum_upvote':
			return {
				subject: `${actor} upvoted your forum post`,
				html: wrap(
					bigAction('Your post got upvoted.') +
					actorLine(actor, actorHandle) +
					(forumThreadTitle ? `<p style="margin:12px 0 0;font-size:14px;color:${C.textLight};">In thread: <strong style="color:${C.text};">${esc(forumThreadTitle)}</strong></p>` : '') +
					(forumUrl ? ctaButton('View thread', forumUrl) : ''),
					`${actor} upvoted your forum post`
				)
			};

		case 'forum_reply':
			return {
				subject: `${actor} replied in your thread`,
				html: wrap(
					bigAction('New reply in your thread.') +
					actorLine(actor, actorHandle) +
					(forumThreadTitle ? `<p style="margin:12px 0 0;font-size:14px;color:${C.textLight};">Thread: <strong style="color:${C.text};">${esc(forumThreadTitle)}</strong></p>` : '') +
					(forumUrl ? ctaButton('View thread', forumUrl) : ''),
					`${actor} replied in your forum thread`
				)
			};

		case 'clan_invite':
			return {
				subject: `${actor} added you to a clan lynt`,
				html: wrap(
					bigAction("You're in a clan lynt.") +
					actorLine(actor, actorHandle) +
					`<p style="margin:0 0 4px;font-size:14px;color:${C.textLight};">It's your turn — accept to edit and pass it on, or decline to delete it for everyone.</p>` +
					(lyntContent ? contentQuote(lyntContent) : '') +
					ctaButton('Review clan lynt', base),
					`${actor} added you to a clan lynt — your turn`
				)
			};

		case 'clan_declined':
			return {
				subject: `A clan lynt you were in got declined`,
				html: wrap(
					bigAction('Clan lynt declined.') +
					actorLine(actor, actorHandle) +
					`<p style="margin:0 0 4px;font-size:14px;color:${C.textLight};">declined their turn, so the whole draft was deleted. Nothing was posted.</p>` +
					(lyntContent ? contentQuote(lyntContent) : ''),
					`${actor} declined a clan lynt you were part of`
				)
			};

		case 'clan_live':
			return {
				subject: `Your clan lynt is live`,
				html: wrap(
					bigAction("It's live!") +
					`<p style="margin:0 0 4px;font-size:14px;color:${C.textLight};">Every contributor accepted — the clan lynt is now public.</p>` +
					(lyntContent ? contentQuote(lyntContent) : '') +
					(lyntUrl ? ctaButton('View lynt', lyntUrl) : ''),
					`Your clan lynt just went live`
				)
			};

		case 'dm_request':
			return {
				subject: `${actor} wants to message you`,
				html: wrap(
					bigAction('Message request.') +
					actorLine(actor, actorHandle) +
					`<p style="margin:16px 0 0;font-size:14px;color:${C.textLight};">Accept or decline the request in your Lyntr messages.</p>` +
					ctaButton('Open messages', `${base}`),
					`${actor} sent you a DM request on Lyntr`
				)
			};

		case 'dm_accepted':
			return {
				subject: `${actor} accepted your message request`,
				html: wrap(
					bigAction('Request accepted.') +
					actorLine(actor, actorHandle) +
					`<p style="margin:16px 0 0;font-size:14px;color:${C.textLight};">You can now send each other messages.</p>` +
					ctaButton('Open conversation', `${base}`),
					`${actor} accepted your DM request`
				)
			};

		default:
			return null;
	}
}

// ── Public send function ───────────────────────────────────────────────────
export interface NotifEmailOptions {
	recipientId: string;
	type: string;
	actorUsername: string;
	actorHandle: string;
	lyntContent?: string | null;
	lyntId?: string | null;
	forumThreadTitle?: string | null;
	forumThreadId?: string | null;
}

export async function sendNotificationEmail(opts: NotifEmailOptions): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	const from   = process.env.EMAIL_FROM ?? 'Lyntr <notifs@lyntr.com>';
	if (!apiKey) return; // Resend not configured — skip silently

	try {
		// Check that the recipient has email notifications enabled
		const [recipient] = await db
			.select({ email_notifications_enabled: users.email_notifications_enabled, notification_email: users.notification_email })
			.from(users)
			.where(eq(users.id, opts.recipientId))
			.limit(1);

		if (!recipient?.email_notifications_enabled || !recipient?.notification_email) return;

		const lyntUrl = opts.lyntId ? `https://lyntr.gizmowizard.tech/?id=${opts.lyntId}` : null;
		const forumUrl = opts.forumThreadId ? `https://lyntr.gizmowizard.tech` : null; // extend if you add direct forum URLs

		const payload = buildEmail(
			opts.type,
			opts.actorUsername,
			opts.actorHandle,
			opts.lyntContent,
			lyntUrl,
			opts.forumThreadTitle,
			forumUrl,
		);

		if (!payload) return; // unrecognised type — no email for this one

		const res = await fetch(RESEND_API, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from,
				to: [recipient.notification_email],
				subject: payload.subject,
				html: payload.html,
			}),
		});

		if (!res.ok) {
			const err = await res.text().catch(() => '');
			console.error(`[email] Resend error ${res.status}:`, err);
		}
	} catch (err) {
		// Never let email failure break the notification flow
		console.error('[email] sendNotificationEmail threw:', err);
	}
}
