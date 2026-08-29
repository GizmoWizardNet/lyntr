<script lang="ts">
	import HugeIcon from './HugeIcon.svelte';
	import { Download01Icon, SourceCodeIcon } from '@hugeicons/core-free-icons';

	// Lyntr Desktop (Nytrix Labs, see AboutContent's credits) ships .exe/.deb/
	// .rpm/raw-binary builds; Lyntr Mobile ships a plain .apk (no Play Store
	// listing). All release assets live under a moving "latest" tag rather
	// than a pinned version, so this page never needs updating when a new
	// build goes out.
	const RELEASE_BASE = 'https://codeberg.org/NytrixLabs/lyntr-desktop/releases/download/latest';

	interface DownloadEntry {
		platform: string;
		detail: string;
		filename: string;
		iconSrc: string;
	}

	const downloads: DownloadEntry[] = [
		{ platform: 'Windows', detail: '.exe installer', filename: 'lyntr-desktop.exe', iconSrc: 'download-icons/windows.png' },
		{ platform: 'Linux', detail: '.deb — Debian, Ubuntu', filename: 'lyntr-desktop.deb', iconSrc: 'download-icons/ubuntu.png' },
		{ platform: 'Linux', detail: '.rpm — Fedora, openSUSE, RHEL', filename: 'lyntr-desktop.rpm', iconSrc: 'download-icons/fedora.png' },
		{
			platform: 'Linux',
			detail: 'Raw binary — chmod +x, then ./lyntr-desktop',
			filename: 'lyntr-desktop',
			iconSrc: 'download-icons/linux.png'
		},
		{ platform: 'Android', detail: '.apk — sideload, no Play Store', filename: 'lyntr-mobile.apk', iconSrc: 'download-icons/android.png' }
	];
</script>

<div class="downloads-wrap">
	<div class="downloads-hero">
		<h1><HugeIcon icon={Download01Icon} size={32} /> Downloads</h1>
		<p>
			Native clients for Lyntr, built and maintained separately from the web app — see
			<a href="/about">About</a> for credits. Builds come from the
			<a href="https://codeberg.org/NytrixLabs/lyntr-desktop" target="_blank" rel="noopener noreferrer">
				lyntr-desktop
			</a>
			repo's latest release.
		</p>
	</div>

	<div class="downloads-grid">
		{#each downloads as d}
			<div class="download-card">
				<div class="download-icon">
					<img src={d.iconSrc} alt="{d.platform} icon" width="28" height="28" />
				</div>
				<div class="download-info">
					<span class="download-platform">{d.platform}</span>
					<span class="download-detail">{d.detail}</span>
				</div>
				<a class="download-btn" href="{RELEASE_BASE}/{d.filename}">
					<HugeIcon icon={Download01Icon} size={16} />
					<span>{d.filename}</span>
				</a>
			</div>
		{/each}
	</div>

	<div class="downloads-footnote">
		<HugeIcon icon={SourceCodeIcon} size={16} />
		<span>
			Lyntr Desktop is open source — see the
			<a href="https://codeberg.org/NytrixLabs/lyntr-desktop" target="_blank" rel="noopener noreferrer">
				Codeberg repo
			</a>
			for source, issues, and past releases.
		</span>
	</div>
</div>

<style>
	.downloads-wrap {
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.downloads-hero {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding-top: 12px;
	}

	.downloads-hero h1 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-retro);
		font-size: 28px;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.downloads-hero h1 :global(svg) {
		color: hsl(var(--primary));
	}

	.downloads-hero p {
		margin: 0;
		max-width: 520px;
		font-family: var(--font-retro);
		font-size: 13px;
		line-height: 1.5;
		color: hsl(var(--muted-foreground));
	}

	.downloads-hero a {
		color: hsl(var(--primary));
		text-decoration: underline;
	}

	/* Same raised-bevel "physical object" card language as .about-card in
	   AboutContent.svelte, so this page reads as the same material as the
	   rest of the site rather than a bolted-on downloads listing. */
	.downloads-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 14px;
	}

	.download-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border-radius: 6px;
		background: hsl(var(--card));
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	.download-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 6px;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.download-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.download-platform {
		font-family: var(--font-retro);
		font-size: 15px;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.download-detail {
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	/* Same high-gloss pill as every primary button on the site (see
	   button.bg-primary in app.css) — a plain <a> here instead of the
	   shadcn Button component so it's a real link (right-click → copy
	   link, open in new tab, etc work as expected for a file download),
	   but visually identical. */
	.download-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: auto;
		padding: 8px 12px;
		border-radius: 5px;
		background: linear-gradient(to bottom, hsl(var(--primary-top)) 0%, hsl(var(--primary)) 100%);
		border-top: 1.5px solid var(--bevel-light);
		border-left: 1.5px solid var(--bevel-light);
		border-bottom: 1.5px solid var(--bevel-dark);
		border-right: 1.5px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
		color: hsl(var(--primary-foreground));
		font-family: var(--font-retro);
		font-size: 12px;
		font-weight: 700;
		text-decoration: none;
		transition: filter 0.1s ease;
		word-break: break-all;
	}
	.download-btn:hover {
		filter: brightness(1.1);
	}
	.download-btn:active {
		filter: brightness(0.95);
		box-shadow: var(--hard-shadow-sm);
		transform: translate(1px, 1px);
	}

	.downloads-footnote {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: center;
		text-align: center;
		font-family: var(--font-retro);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.downloads-footnote :global(svg) {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.downloads-footnote a {
		color: hsl(var(--primary));
		text-decoration: underline;
	}

	@media (max-width: 560px) {
		.downloads-hero h1 {
			font-size: 22px;
		}
	}
</style>
