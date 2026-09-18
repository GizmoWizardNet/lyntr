<script lang="ts">
	import { mode } from 'mode-watcher';
	import { PUBLIC_GIT_COMMIT } from '$env/static/public';
	import {
		BookOpen,
		TrendingUp,
		Users,
		PenLine,
		MessagesSquare,
		Trophy,
		Webhook,
		Radio,
		Code,
		MessageCircle,
		Mail,
		AppWindow,
		Rss
	} from 'lucide-svelte';

	const features: Array<{ icon: any; color: string; label: string }> = [
		{ icon: PenLine, color: 'text-[hsl(var(--accent-amber))]', label: 'Lynt away; text, images, GIFs and much more!' },
		{ icon: Users, color: 'text-[hsl(var(--accent-green))]', label: 'Follow people and DM them in semi-real time' },
		{ icon: MessagesSquare, color: 'text-[hsl(var(--accent-blue))]', label: 'Forum for longer-form discussion, over a hundred words.' },
		{ icon: Trophy, color: 'text-[hsl(var(--accent-yellow))]', label: 'Leaderboard rankings, fight for the top!' },
		{ icon: Webhook, color: 'text-[hsl(var(--accent-violet))]', label: 'Developer API with your own credentials, code whatever you want.' },
		{ icon: Radio, color: 'text-[hsl(var(--accent-rose))]', label: 'Live stuff is built in, though not VERY good.' }
	];

	const links: Array<{ href: string; icon: any; label: string; external: boolean }> = [
		{ href: 'https://github.com/GizmoWizardNet/lyntr', icon: Code, label: 'Our Github!', external: true },
		{
	href: 'https://bsky.app/profile/lyntr.bsky.social',
	icon: null,
	label: 'Lyntr on Bluesky',
	external: true
},
		{ href: 'https://discord.gg/y5PA8uS5Tj', icon: MessageCircle, label: 'Discord!', external: true },
		{
			href: 'https://github.com/NotHMRC/pylyntr',
			icon: Code,
			label: 'Pylyntr — open source Python lib for the API by NotHMRC',
			external: true
		},
		{
			href: 'https://codeberg.org/NytrixLabs/lyntr-desktop',
			icon: AppWindow,
			label: 'Lyntr Desktop — open source desktop app shell by Stormzady',
			external: true
		},
		{ href: 'mailto:dev@gizmowizard.tech', icon: Mail, label: 'Contact me', external: false },
		{ href: 'https://github.com/face-hh/lyntr', icon: Code, label: 'Original, archived repo', external: true }
	];

	
</script>

<div class="about-wrap">
	<div class="about-hero">
		<h1>
			<img src={mode.current === 'dark' ? 'logo_dark.svg' : 'logo_light.svg'} alt="Lyntr" class="hero-logo" />
			Lyntr.
		</h1>
		<p>
			A microblogging social media platform for you to post short form content as lynts — no
			extra unnecessary shit going on in the backend.
		</p>
	</div>

	<div class="about-masonry">
		<section class="about-card">
			<h2><BookOpen class="h-4 w-4" /> About Lyntr</h2>
			<div class="about-card-body">
				<p>
					Lyntr is a small, community-run social platform built around short posts called
					"lynts" — think microblogging without the algorithm. And a lot more fun.
				</p>
				<p>
					Post, reply, repost, follow, and message people in real time, or take the
					conversation to the forum for anything that needs more than a couple hundred
					characters.
				</p>
				<p>Build bots, dashboards or WHATEVER you want — the REST API is open to everyone!</p>
			</div>
		</section>

				<section class="about-card">
			<h2><Rss class="h-4 w-4" /> Using the RSS/Atom 2.0 feed</h2>
			<div class="about-card-body">
				<p>
					Thanks to big-time contributor NotHMRC(follow him @libhmrc6) we finally have a true RSS and Atom 2.0 feed generator; and its the simplest to use!
				</p>
				<p>
					Head over to https://nothmrc.codeberg.page/lyntr-atom/, select the type of feed you want(RSS or Atom 2.0), and then click generate! The resultant link
					will be your feed.

					Feeds can be generated of a specific user, or just the newest first feed, or can be filtered(still newest first) by tag used. 
				</p>
				<p>use it wherever you want.</p>
			</div>
		</section>

		<section class="about-card">
			<h2><TrendingUp class="h-4 w-4" /> Features</h2>
			<ul class="feature-list">
				{#each features as f}
					<li>
						<f.icon class="h-4 w-4 shrink-0 {f.color}" />
						<span>{f.label}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="about-card about-card-wide">
			<h2><Users class="h-4 w-4" /> Credits</h2>
			<div class="about-card-body">
				<p>
					Modified extensively and completely, as well as operated by
					<span class="who">GizmoWizard</span>, based on the original Lyntr project by
					<span class="who">FaceDev</span>.
				</p>
			</div>
			<div class="credit-links">
				{#each links as l}
	<a
		href={l.href}
		target={l.external ? '_blank' : undefined}
		rel={l.external ? 'noopener noreferrer' : undefined}
	>
		{#if l.label === 'Lyntr on Bluesky'}
			<svg
				class="h-3.5 w-3.5 shrink-0"
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"
			>
				<path d="M12 10.8C10.9 8.7 7.9 4.8 5.1 2.9 2.4 1.1 1.4 1.4.8 1.7.1 2-.2 3.1.1 4.4c.5 2.1 2.2 5.2 3.9 7.1 1.7 1.9 3.6 2.9 5.5 2.9-1.8.3-4.4 1.2-5.3 2.7-.9 1.5-.6 3.1.6 3.7 1.2.6 3.4-.2 5.2-1.5 1.8-1.3 3.2-3 4-4.6.8 1.6 2.2 3.3 4 4.6 1.8 1.3 4 2.1 5.2 1.5 1.2-.6 1.5-2.2.6-3.7-.9-1.5-3.5-2.4-5.3-2.7 1.9 0 3.8-1 5.5-2.9 1.7-1.9 3.4-5 3.9-7.1.3-1.3 0-2.4-.7-2.7-.6-.3-1.6-.6-4.3 1.2-2.8 1.9-5.8 5.8-6.9 7.9z" />
			</svg>
		{:else}
			<l.icon class="h-3.5 w-3.5 shrink-0" />
		{/if}

		<span>{l.label}</span>
	</a>
{/each}
			</div>
			<div class="legal-links">
				<a href="/tos">Terms of Service</a>
				<span class="legal-dot">·</span>
				<a href="/privacy">Privacy Policy</a>
			</div>
			<p class="build-footer">Running commit: <code>{PUBLIC_GIT_COMMIT}</code></p>
		</section>
	</div>
</div>

<style>
	.about-wrap {
		width: 100%;
		max-width: 1000px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.about-hero {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding-top: 12px;
	}

	.about-hero h1 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-retro);
		font-size: 30px;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.hero-logo {
		width: 40px;
		height: 40px;
	}

	.about-hero p {
		margin: 0;
		max-width: 560px;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}

	/* Auto-fitting columns instead of a rigid 3-up grid, and each card
	   sizes to its own content (align-items: start) — so a Credits
	   card that grows over time (more links) doesn't force Features
	   and About to stretch to match it, and everything still reflows
	   to a single column on narrow screens without any breakpoints. */
	.about-masonry {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 16px;
		align-items: start;
	}

	.about-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 16px 16px;
		border-radius: 6px;
		background: hsl(var(--card));
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	/* Credits tends to grow (more links over time) — let it claim the
	   full row on wide layouts instead of being squeezed into a third
	   column alongside two much shorter cards. */
	.about-card-wide {
		grid-column: 1 / -1;
	}

	.about-card h2 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-retro);
		font-size: 14px;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.about-card h2 :global(svg) {
		color: hsl(var(--primary));
	}

	.about-card-body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-family: var(--font-retro);
		font-size: 13px;
		line-height: 1.5;
		color: hsl(var(--muted-foreground));
	}

	.who {
		color: hsl(var(--foreground));
		font-weight: 700;
	}

	.feature-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.feature-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--foreground));
	}

	/* Credit links wrap onto their own lines regardless of label
	   length — a long "Pylyntr — open source..." button never gets
	   clipped or forces horizontal scroll, it just takes more width
	   or drops to its own row. */
	.credit-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.credit-links a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 6px 10px;
		border-radius: 5px;
		font-family: var(--font-retro);
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-decoration: none;
		background: hsl(var(--secondary));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		white-space: normal;
		overflow-wrap: break-word;
	}

	.credit-links a:hover {
		background: hsl(var(--primary) / 0.12);
	}

	.legal-links {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 2px;
		font-family: var(--font-retro);
		font-size: 11px;
	}

	.legal-links a {
		color: hsl(var(--muted-foreground));
		text-decoration: underline;
	}

	.legal-links a:hover {
		color: hsl(var(--foreground));
	}

	.legal-dot {
		color: hsl(var(--muted-foreground));
	}

	.build-footer {
		margin: 4px 0 0;
		text-align: center;
		font-family: var(--font-retro);
		font-size: 11px;
		color: hsl(var(--muted-foreground) / 0.7);
	}

	.build-footer code {
		font-family: 'Consolas', 'Courier New', monospace;
	}

	@media (max-width: 560px) {
		.about-hero h1 {
			font-size: 24px;
		}
	}
</style>
