<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { ArrowLeft } from 'lucide-svelte';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import CodeBlock from './CodeBlock.svelte';
	import HugeIcon from '../HugeIcon.svelte';
	import {
		Cards02Icon,
		ShuffleIcon,
		Search01Icon,
		ZapIcon,
		PencilEdit02Icon,
		Delete02Icon,
		VolumeHighIcon,
		VolumeMute02Icon
	} from '@hugeicons/core-free-icons';
	import { endpoints, type Endpoint } from './endpoints';
	import { PUBLIC_GIT_COMMIT } from '$env/static/public';

	// Aged/desaturated accent palette (see app.css --accent-*) instead of
	// raw Tailwind bg-sky-500/text-emerald-500/etc — those read as a modern
	// SaaS dashboard next to the sepia/bevel theme everywhere else on the
	// site; same hue mapping, just pulled into the same aged-paper family.
	const methodColors: Record<Endpoint['method'], string> = {
		GET: 'bg-[hsl(var(--accent-blue)/0.14)] text-[hsl(var(--accent-blue))] border-[hsl(var(--accent-blue)/0.35)]',
		POST: 'bg-[hsl(var(--accent-green)/0.14)] text-[hsl(var(--accent-green))] border-[hsl(var(--accent-green)/0.35)]',
		PUT: 'bg-[hsl(var(--accent-amber)/0.14)] text-[hsl(var(--accent-amber))] border-[hsl(var(--accent-amber)/0.35)]',
		PATCH: 'bg-[hsl(var(--accent-amber)/0.14)] text-[hsl(var(--accent-amber))] border-[hsl(var(--accent-amber)/0.35)]',
		DELETE: 'bg-[hsl(var(--accent-rose)/0.14)] text-[hsl(var(--accent-rose))] border-[hsl(var(--accent-rose)/0.35)]'
	};

	// Just the text-color portion of methodColors, for inline use in the
	// API structure tree below — the full badge classes (bg + border) are
	// meant for actual <Badge> chips, and look like clunky boxes inline
	// inside a <pre> block instead of just reading as colored text.
	const methodTextColors: Record<Endpoint['method'], string> = {
		GET: 'text-[hsl(var(--accent-blue))]',
		POST: 'text-[hsl(var(--accent-green))]',
		PUT: 'text-[hsl(var(--accent-amber))]',
		PATCH: 'text-[hsl(var(--accent-amber))]',
		DELETE: 'text-[hsl(var(--accent-rose))]'
	};

	// Solid (non-transparent) dot color per method, for the legend key —
	// separate from methodColors' translucent badge backgrounds since a
	// 14%-opacity dot at 10px would be nearly invisible.
	const methodDotColors: Record<Endpoint['method'], string> = {
		GET: 'bg-[hsl(var(--accent-blue))]',
		POST: 'bg-[hsl(var(--accent-green))]',
		PUT: 'bg-[hsl(var(--accent-amber))]',
		PATCH: 'bg-[hsl(var(--accent-amber))]',
		DELETE: 'bg-[hsl(var(--accent-rose))]'
	};

	type ApiClient = {
		id: string;
		name: string;
		client_id: string;
		secret_last4: string;
		revoked: boolean;
		created_at: string | null;
		last_used_at: string | null;
		secret_version: number;
	};

	// ── Endpoint deck ─────────────────────────────────────────────
	// Docs are dealt out like a deck of cards: each endpoint gets a real
	// 3D-flippable card (front = face-down, back = compact summary).
	// Flipping a card reveals a "View details" toggle that expands the
	// full request/response docs beneath the grid in normal document
	// flow, so the flip itself stays snappy and fixed-size regardless
	// of how long any one endpoint's docs are.
	const methodIcon: Record<Endpoint['method'], typeof Search01Icon> = {
		GET: Search01Icon,
		POST: ZapIcon,
		PUT: PencilEdit02Icon,
		PATCH: PencilEdit02Icon,
		DELETE: Delete02Icon
	};

	function shuffledIndices(length: number) {
		const arr = Array.from({ length }, (_, i) => i);
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	let deckOrder = $state<number[]>(shuffledIndices(endpoints.length));
	let drawPos = $state(0); // how many cards have been drawn off the top
	let flipped = $state<Set<number>>(new Set());
	let expanded = $state<Set<number>>(new Set());

	// ── Sound ─────────────────────────────────────────────────────
	// Short synthesized cues (no audio files to ship) for flipping,
	// drawing, and reshuffling. Muted by default is *not* the goal —
	// sound is on by default but a toggle is one click away, and the
	// AudioContext is only ever created after a real user gesture so
	// browsers don't complain about autoplay.
	let soundOn = $state(true);
	let audioCtx: AudioContext | null = null;

	function getAudioCtx() {
		if (!soundOn) return null;
		if (!audioCtx) {
			const Ctor = window.AudioContext || (window as any).webkitAudioContext;
			if (!Ctor) return null;
			audioCtx = new Ctor();
		}
		if (audioCtx.state === 'suspended') audioCtx.resume();
		return audioCtx;
	}

	// A quick pitch-swept blip. `up` sweeps low->high (flip open, draw),
	// `!up` sweeps high->low (flip closed).
	function playBlip({ up = true, duration = 0.09, startFreq = 320, endFreq = 720 } = {}) {
		const ctx = getAudioCtx();
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		const now = ctx.currentTime;
		osc.frequency.setValueAtTime(up ? startFreq : endFreq, now);
		osc.frequency.exponentialRampToValueAtTime(up ? endFreq : startFreq, now + duration);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + duration + 0.02);
	}

	function playDrawSound() {
		// Two quick blips in succession — a little more eventful than a
		// single flip, since drawing is the "headline" action.
		playBlip({ up: true, startFreq: 260, endFreq: 560, duration: 0.07 });
		setTimeout(() => playBlip({ up: true, startFreq: 420, endFreq: 880, duration: 0.08 }), 60);
	}

	function playShuffleSound() {
		const ctx = getAudioCtx();
		if (!ctx) return;
		// Short burst of filtered noise for a "riffle" texture.
		const bufferSize = ctx.sampleRate * 0.18;
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 1800;
		filter.Q.value = 0.6;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.22, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
		noise.connect(filter).connect(gain).connect(ctx.destination);
		noise.start();
	}

	function toggleFlip(i: number) {
		const next = new Set(flipped);
		const willBeFlipped = !next.has(i);
		if (willBeFlipped) next.add(i);
		else {
			next.delete(i);
			// Collapse the details panel too when the card flips back face-down.
			const nextExpanded = new Set(expanded);
			nextExpanded.delete(i);
			expanded = nextExpanded;
		}
		flipped = next;
		playBlip({ up: willBeFlipped });
	}

	function toggleExpanded(i: number) {
		const next = new Set(expanded);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		expanded = next;
		playBlip({ up: !next.has(i) ? false : true, startFreq: 500, endFreq: 700, duration: 0.05 });
	}

	function drawCard() {
		if (drawPos >= deckOrder.length) return;
		const i = deckOrder[drawPos];
		drawPos += 1;
		const next = new Set(flipped);
		next.add(i);
		flipped = next;
		playDrawSound();
		requestAnimationFrame(() => {
			document.getElementById(`ep-card-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	function reshuffleDeck() {
		deckOrder = shuffledIndices(endpoints.length);
		drawPos = 0;
		flipped = new Set();
		expanded = new Set();
		playShuffleSound();
	}

	let clients: ApiClient[] = $state([]);
	let loading = $state(true);
	let newClientName = $state('');
	let creating = $state(false);

	// Holds a freshly-created or freshly-regenerated secret so it can be
	// shown exactly once. Cleared as soon as the user navigates away or
	// creates/regenerates another one.
	let revealedSecret: { client_id: string; client_secret: string; label: string } | null = $state(null);
	let regeneratingId: string | null = $state(null);
	let deletingId: string | null = $state(null);

	async function loadClients() {
		loading = true;
		try {
			const res = await fetch('/api/developer/clients', { credentials: 'include' });
			if (res.status === 401) {
				toast.error('Please log in to manage API credentials.');
				return;
			}
			const data = await res.json();
			clients = data.clients ?? [];
		} catch {
			toast.error('Failed to load API credentials.');
		} finally {
			loading = false;
		}
	}

	async function createClient() {
		creating = true;
		try {
			const res = await fetch('/api/developer/clients', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newClientName || 'Default' })
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error || 'Failed to create credential.');
				return;
			}
			revealedSecret = {
				client_id: data.client_id,
				client_secret: data.client_secret,
				label: 'New credential created'
			};
			newClientName = '';
			await loadClients();
		} catch {
			toast.error('Failed to create credential.');
		} finally {
			creating = false;
		}
	}

	async function regenerate(client: ApiClient) {
		if (!confirm(`Regenerate the secret for "${client.name}"? The old secret will stop working immediately.`)) return;
		regeneratingId = client.id;
		try {
			const res = await fetch(`/api/developer/clients/${client.id}/regenerate`, {
				method: 'POST',
				credentials: 'include'
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error || 'Failed to regenerate secret.');
				return;
			}
			revealedSecret = {
				client_id: data.client_id,
				client_secret: data.client_secret,
				label: 'Secret regenerated'
			};
			await loadClients();
		} catch {
			toast.error('Failed to regenerate secret.');
		} finally {
			regeneratingId = null;
		}
	}

	async function remove(client: ApiClient) {
		if (!confirm(`Delete the credential "${client.name}"? This can't be undone.`)) return;
		deletingId = client.id;
		try {
			const res = await fetch(`/api/developer/clients/${client.id}`, {
				method: 'DELETE',
				credentials: 'include'
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error || 'Failed to delete credential.');
				return;
			}
			if (revealedSecret?.client_id === client.client_id) revealedSecret = null;
			await loadClients();
		} catch {
			toast.error('Failed to delete credential.');
		} finally {
			deletingId = null;
		}
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied to clipboard.');
		} catch {
			toast.error('Could not copy — copy it manually.');
		}
	}

	const LYNTR_ASCII = String.raw`
  +++++++++
 +++++++++++++
 ++++++++++++++++
  +++++++++++++++++
     ++ ++++++++++++++
         ++++++++++++++++
           ++++++++++++++++
               ++++++++++++++
                 ++++++++++++++                                             ++++++++++
                  +++++++++++++++                                      +++++++++++++++++++
                   ++++++++++++++++                                 +++++++++         +++++
                    +++++++++  +++++                             ++++++++               +++++
                     +++++++++   ++++                          ++++++                     +++
                      +++++++++   +++++                     +++++++                       ++++
                      +++++++++++  ++++                   ++++++                           ++++
                       ++++++++++  +++++                +++++                               +++
                       +++++++++++  +++++             ++++++                                ++++
                       ++++++++++++  +++++          ++++++                                  ++++
                       ++++++++++++  +++++        +++++                                      +++
                       +++++++++++++++++++      ++++++                                       +++
                       +++++++++++++ ++++++    +++++                    +++++++              +++
                       ++++++++++++++++++++  +++++                ++++++++++++++++           +++
                       +++++++++++++++++++++++++               +++++++++++++++++++++         +++
                       +++++++++++++++++++++++               ++++++++++    ++++++++++       ++++
                      ++++++++++++++++++++++             +++++++++            ++++++++      ++++
                      +++++++++++++++++++++             +++++++                +++++++      ++++
                      +++++++++++++++++++++           ++++++                   +++++++     ++++
                      ++++++++++++++++++++        +++++++                       ++++++     ++++
                     ++++++++++++++++++++        ++++++                         +++++++   ++++
                    +++++++++++++++ ++++       ++++++                            ++++++   ++++
                    ++++++++++++   ++++     ++++++                               +++++++ ++++
                    +++++++++++   +++++    ++++++                                +++++++++++
                   ++++++++++    +++++   +++++                                    +++++++++
                   +++++++       ++++ ++++++                                       ++++++
                   +++++        ++++++++++                                                
                               +++++++++                                                  
                               ++++++                                                      
                               +++                                                          
`;

	// Pull the live theme's actual accent (--primary) instead of a hardcoded
	// color, so this matches whatever the site's light/dark theme is doing.
	function themeColor(varName: string, fallback: string) {
		if (typeof document === 'undefined') return fallback;
		const hsl = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
		return hsl ? `hsl(${hsl})` : fallback;
	}

	function printDevConsoleBanner() {
		const primary = themeColor('--background', '#5470ff');
		const muted = themeColor('--muted-foreground', '#9a9a9f');
		const destructive = themeColor('--destructive', '#ff5555');

		console.log(
			'%c' + LYNTR_ASCII,
			`color: ${primary}; font-family: monospace; font-size: 10px; line-height: 10px;`
		);
		console.log(
			'%cLyntr Developer API',
			`color: ${primary}; font-family: monospace; font-size: 20px; font-weight: bold;`
		);
		console.log(
			`%cRunning commit: ${PUBLIC_GIT_COMMIT}`,
			`color: ${muted}; font-family: monospace; font-size: 12px;`
		);
		console.log(
			'%cDO NOT paste anything in here unless you know exactly what you are doing. ' +
				'Pasting code here can give attackers access to your Lyntr account and API credentials.',
			`color: ${destructive}; font-family: monospace; font-size: 13px; font-weight: bold;`
		);
		console.log(
			'%cLooking to build something? Docs are on this page — scroll down.',
			`color: ${muted}; font-family: monospace; font-size: 12px;`
		);
	}

	onMount(() => {
		printDevConsoleBanner();
	});
	onMount(loadClients);
</script>

<svelte:head>
	<title>Developer API — Lyntr</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6 p-4">
	<Button variant="outline" size="sm" class="gap-1.5" onclick={() => goto('/')}>
		<ArrowLeft class="h-4 w-4" />
		Back to Home
	</Button>

	<div class="dev-header">
		<h1>Developer API</h1>
		<p>
			Build on top of Lyntr with a REST API authenticated by a client ID and secret. Full docs
			are below.
		</p>
	</div>

	{#if revealedSecret}
		<Card class="border-amber-500">
			<CardHeader>
				<CardTitle>{revealedSecret.label} — copy your secret now</CardTitle>
				<CardDescription>
					This is the only time the secret is shown. It's not stored anywhere retrievable — if
					you lose it, you'll need to regenerate it.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<div>
					<Label>Client ID</Label>
					<div class="mt-1 flex gap-2">
						<Input readonly value={revealedSecret.client_id} class="font-mono text-sm" />
						<Button variant="outline" onclick={() => copy(revealedSecret!.client_id)}>Copy</Button>
					</div>
				</div>
				<div>
					<Label>Client Secret</Label>
					<div class="mt-1 flex gap-2">
						<Input readonly value={revealedSecret.client_secret} class="font-mono text-sm" />
						<Button variant="outline" onclick={() => copy(revealedSecret!.client_secret)}>Copy</Button>
					</div>
				</div>
				<Button variant="secondary" size="sm" onclick={() => (revealedSecret = null)}>
					I've saved it, hide this
				</Button>
			</CardContent>
		</Card>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle>Create a new credential</CardTitle>
			<CardDescription>You can have up to 10 active credentials.</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="flex gap-2">
				<Input placeholder="Name (e.g. 'My bot')" bind:value={newClientName} maxlength={60} />
				<Button onclick={createClient} disabled={creating}>
					{creating ? 'Creating...' : 'Create credential'}
				</Button>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Your credentials</CardTitle>
		</CardHeader>
		<CardContent>
			{#if loading}
				<p class="text-muted-foreground text-sm">Loading...</p>
			{:else if clients.length === 0}
				<p class="text-muted-foreground text-sm">No API credentials yet.</p>
			{:else}
				<div class="space-y-3">
					{#each clients as client (client.id)}
						<div class="credential-row">
							<div>
								<div class="font-medium">
									{client.name}
									{#if client.revoked}
										<span class="text-destructive ml-2 text-xs">Revoked</span>
									{/if}
								</div>
								<div class="text-muted-foreground font-mono text-xs">
									{client.client_id} · secret ends in {client.secret_last4} · v{client.secret_version}
								</div>
								<div class="text-muted-foreground text-xs">
									Created {new Date(client.created_at ?? '').toLocaleDateString()}
									{#if client.last_used_at}
										· last used {new Date(client.last_used_at).toLocaleString()}
									{:else}
										· never used
									{/if}
								</div>
							</div>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={client.revoked || regeneratingId === client.id}
									onclick={() => regenerate(client)}
								>
									{regeneratingId === client.id ? 'Regenerating...' : 'Regenerate secret'}
								</Button>
								<Button
									variant="destructive"
									size="sm"
									disabled={deletingId === client.id}
									onclick={() => remove(client)}
								>
									{deletingId === client.id ? 'Deleting...' : 'Delete'}
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Using the API</CardTitle>
			<CardDescription>Base URL: <code>https://lyntr.gizmowizard.tech/api/v2</code></CardDescription>
		</CardHeader>
		<CardContent class="space-y-4 text-sm">
			<p>
				Authenticate every request with your client ID and secret, either as HTTP Basic auth
				(<code>Authorization: Basic base64(client_id:client_secret)</code>) or as the
				<code>X-Client-Id</code> / <code>X-Client-Secret</code> headers.
			</p>
			<CodeBlock
				lang="bash"
				label="Authentication"
				code={`# Basic auth
curl https://lyntr.gizmowizard.tech/api/v2/me \\
  -u "$LYNTR_CLIENT_ID:$LYNTR_CLIENT_SECRET"

# or explicit headers
curl https://lyntr.gizmowizard.tech/api/v2/me \\
  -H "X-Client-Id: $LYNTR_CLIENT_ID" \\
  -H "X-Client-Secret: $LYNTR_CLIENT_SECRET"`}
			/>
			<div class="rounded-md border border-border bg-lynt-foreground p-3">
				<p class="font-semibold">What's new in v2</p>
				<ul class="text-muted-foreground mt-1.5 list-disc space-y-1 pl-4">
					<li>
						Images are now accepted on <code>POST /lynts</code> and
						<code>POST /lynts/:id/comments</code> — send <code>multipart/form-data</code>
						with an <code>images</code> field (up to 4 files) instead of JSON. Plain JSON
						still works for text-only posts, unchanged from v1.
					</li>
					<li>
						New endpoint: <code>GET /lynts/all/comments</code> — the most recent comments
						across every lynt, not scoped to one parent. Requested by
						<span class="font-medium">@libhmrc</span> (<code>@nothmrc</code> on Lyntr) — thanks
						for the idea.
					</li>
				</ul>
			</div>
			<p class="text-muted-foreground">
				v1 (<code>/api/v1</code>) is unchanged and still works for existing integrations — v2
				is additive, not a breaking migration.
			</p>
			<p class="text-muted-foreground flex items-start gap-1.5">
				Endpoints marked <Badge variant="outline" class="mx-0.5 border-[hsl(var(--accent-rose)/0.4)] bg-[hsl(var(--accent-rose)/0.1)] text-[hsl(var(--accent-rose))]">sensitive</Badge>
				perform a write on your account (posting, editing, following) and require a credential
				that hasn't been scoped down to read-only.
			</p>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Python client</CardTitle>
			<CardDescription>
				<code>pylyntr</code> wraps v2 auth and pagination so you're not hand-rolling
				<code>curl</code> calls.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4 text-sm">
			<CodeBlock
				lang="bash"
				label="Install"
				code={`uv add pylyntr

# or
pip install pylyntr`}
			/>
			<CodeBlock
				lang="python"
				label="Usage"
				code={`from pylyntr import LyntrClient

client = LyntrClient(client_id="...", client_secret="...")

me = client.get_user()
lynt = client.create_post("day 592752131 of lyntr comeback")

for comment in client.all_comments()[:20]: # limit to 20
    print(comment.user.username, comment.content)`}
			/>
			<p class="text-muted-foreground">
				Talks to the same <code>/api/v2</code> base URL and credentials as above — nothing
				extra to set up on the Lyntr side.
			</p>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>API structure</CardTitle>
			<CardDescription>
				Every v2 route, laid out by path. Colors match each method's badge everywhere else on
				this page.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="mb-3 flex flex-wrap items-center gap-3 text-xs">
				{#each (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) as m}
					<span class="inline-flex items-center gap-1.5">
						<span class={`inline-block h-2.5 w-2.5 rounded-full ${methodDotColors[m]}`}></span>
						{m}
					</span>
				{/each}
			</div>
			<pre class="overflow-x-auto rounded-md bg-lynt-foreground p-4 font-mono text-xs leading-relaxed"><code
				>/api/v2
<span class="text-muted-foreground">│</span>
<span class="text-muted-foreground">├──</span> lynts
<span class="text-muted-foreground">│   ├──</span> <span class="{methodTextColors.GET}">GET</span>    /lynts
<span class="text-muted-foreground">│   ├──</span> <span class="{methodTextColors.POST}">POST</span>   /lynts
<span class="text-muted-foreground">│   ├──</span> :id
<span class="text-muted-foreground">│   │   ├──</span> <span class="{methodTextColors.GET}">GET</span>    /lynts/:id
<span class="text-muted-foreground">│   │   ├──</span> <span class="{methodTextColors.PUT}">PUT</span>    /lynts/:id
<span class="text-muted-foreground">│   │   ├──</span> <span class="{methodTextColors.DELETE}">DELETE</span> /lynts/:id
<span class="text-muted-foreground">│   │   ├──</span> comments
<span class="text-muted-foreground">│   │   │   ├──</span> <span class="{methodTextColors.GET}">GET</span>  /lynts/:id/comments
<span class="text-muted-foreground">│   │   │   └──</span> <span class="{methodTextColors.POST}">POST</span> /lynts/:id/comments
<span class="text-muted-foreground">│   │   └──</span> like
<span class="text-muted-foreground">│   │       ├──</span> <span class="{methodTextColors.POST}">POST</span>   /lynts/:id/like
<span class="text-muted-foreground">│   │       └──</span> <span class="{methodTextColors.DELETE}">DELETE</span> /lynts/:id/like
<span class="text-muted-foreground">│   │</span>
<span class="text-muted-foreground">│   └──</span> all
<span class="text-muted-foreground">│       └──</span> comments
<span class="text-muted-foreground">│           └──</span> <span class="{methodTextColors.GET}">GET</span> /lynts/all/comments
<span class="text-muted-foreground">│</span>
<span class="text-muted-foreground">├──</span> me
<span class="text-muted-foreground">│   ├──</span> <span class="{methodTextColors.GET}">GET</span>   /me
<span class="text-muted-foreground">│   └──</span> <span class="{methodTextColors.PATCH}">PATCH</span> /me
<span class="text-muted-foreground">│</span>
<span class="text-muted-foreground">├──</span> notifications
<span class="text-muted-foreground">│   └──</span> <span class="{methodTextColors.GET}">GET</span> /notifications
<span class="text-muted-foreground">│</span>
<span class="text-muted-foreground">├──</span> search
<span class="text-muted-foreground">│   └──</span> <span class="{methodTextColors.GET}">GET</span> /search
<span class="text-muted-foreground">│</span>
<span class="text-muted-foreground">└──</span> users
<span class="text-muted-foreground">    └──</span> :handle
<span class="text-muted-foreground">        ├──</span> <span class="{methodTextColors.GET}">GET</span>    /users/:handle
<span class="text-muted-foreground">        ├──</span> <span class="{methodTextColors.POST}">POST</span>   /users/:handle/follow
<span class="text-muted-foreground">        └──</span> <span class="{methodTextColors.DELETE}">DELETE</span> /users/:handle/follow</code></pre>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Endpoints</CardTitle>
			<CardDescription>
				Every endpoint is a card, face-down. Draw one from the deck, or flip whichever one catches
				your eye, then open it up for the full request/response shape.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<Button size="sm" onclick={drawCard} disabled={drawPos >= deckOrder.length} class="gap-1.5">
					<HugeIcon icon={Cards02Icon} size={16} />
					Draw a card
				</Button>
				<Button size="sm" variant="outline" onclick={reshuffleDeck} class="gap-1.5">
					<HugeIcon icon={ShuffleIcon} size={16} />
					Reshuffle deck
				</Button>
				<span class="text-muted-foreground text-xs">
					{Math.min(drawPos, deckOrder.length)} / {deckOrder.length} drawn
					{#if flipped.size > drawPos}· {flipped.size} peeked{/if}
				</span>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1.5 text-xs transition-colors"
					onclick={() => (soundOn = !soundOn)}
					aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
				>
					<HugeIcon icon={soundOn ? VolumeHighIcon : VolumeMute02Icon} size={16} />
					{soundOn ? 'Sound on' : 'Muted'}
				</button>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{#each endpoints as ep, i (ep.method + ep.path)}
					{@const isFlipped = flipped.has(i)}
					{@const isExpanded = expanded.has(i)}
					<div id={`ep-card-${i}`} class="flex flex-col gap-2">
						<!-- The 3D flip: fixed-size, snappy, real perspective/backface transforms.
						     Both faces live in the DOM at all times so the animation is a pure
						     transform (no layout thrash), and the card itself stays a constant
						     height regardless of how long the endpoint's docs end up being —
						     the docs expand separately, below, in normal flow. -->
						<div class="[perspective:1400px]" style="height: 168px;">
							<div
								class="relative h-full w-full [transform-style:preserve-3d]"
								style={`transition: transform 0.5s cubic-bezier(0.2, 0.9, 0.25, 1); transform: rotateY(${isFlipped ? 180 : 0}deg);`}
							>
								<!-- Front: face-down -->
								<button
									type="button"
									class="absolute inset-0 flex h-full w-full flex-col justify-between rounded-lg p-3 text-left [backface-visibility:hidden] card-face"
									style="background: repeating-linear-gradient(45deg, hsl(var(--primary)/0.09), hsl(var(--primary)/0.09) 7px, hsl(var(--primary)/0.16) 7px, hsl(var(--primary)/0.16) 14px);"
									onclick={() => toggleFlip(i)}
									aria-label={`Reveal details for ${ep.method} ${ep.path}`}
								>
									<div class="flex items-center justify-between">
										<Badge class={`justify-center rounded-md font-mono text-[11px] ${methodColors[ep.method]}`} variant="outline">
											{ep.method}
										</Badge>
										<HugeIcon icon={methodIcon[ep.method]} size={20} className="text-primary/70" />
									</div>
									<div class="flex flex-col items-center gap-1.5 text-center">
										<HugeIcon icon={Cards02Icon} size={28} className="text-primary/40" />
										<span class="text-muted-foreground text-[11px]">Tap to flip</span>
									</div>
									<div class="text-muted-foreground truncate text-center font-mono text-[10px] opacity-60">
										{ep.path}
									</div>
								</button>

								<!-- Back: compact summary, baked-in 180° so it reads upright once the parent flips -->
								<div
									class="bg-card absolute inset-0 flex h-full w-full flex-col justify-between rounded-lg p-3 [backface-visibility:hidden] [transform:rotateY(180deg)] card-face"
								>
									<button
										type="button"
										class="flex w-full flex-wrap items-center gap-1.5 text-left"
										onclick={() => toggleFlip(i)}
										aria-label={`Hide details for ${ep.method} ${ep.path}`}
									>
										<Badge class={`justify-center rounded-md font-mono text-[11px] ${methodColors[ep.method]}`} variant="outline">
											{ep.method}
										</Badge>
										<code class="truncate text-xs">{ep.path}</code>
										{#if ep.sensitive}
											<Badge variant="outline" class="border-[hsl(var(--accent-rose)/0.4)] bg-[hsl(var(--accent-rose)/0.1)] text-[10px] text-[hsl(var(--accent-rose))]">
												sensitive
											</Badge>
										{/if}
									</button>
									<p class="text-muted-foreground line-clamp-3 text-xs">{ep.summary}</p>
									<Button
										size="sm"
										variant="secondary"
										class="w-full"
										onclick={() => toggleExpanded(i)}
									>
										{isExpanded ? 'Hide details' : 'View details'}
									</Button>
								</div>
							</div>
						</div>

						{#if isFlipped && isExpanded}
							<div
								class="bg-card space-y-3 rounded-lg p-3 text-sm card-face"
								transition:slide={{ duration: 220 }}
							>
								<p class="text-muted-foreground">{ep.description}</p>
								{#if ep.notes}
									<p class="text-muted-foreground border-primary/30 border-l-2 pl-2 text-xs">
										{ep.notes}
									</p>
								{/if}
								{#if ep.request}
									<CodeBlock lang="bash" label="Request" code={ep.request} />
								{/if}
								<CodeBlock lang="json" label="Response" code={ep.response} />
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<p class="text-muted-foreground mt-4 text-xs">
				Image, GIF, and poll attachments aren't supported over the API — posts are text-only,
				up to 280 characters.
			</p>
		</CardContent>
	</Card>
</div>

<style>
	/* Same gradient bevel header bar as devcycle/admin's title — poll-head/
	   nav-ribbon's visual language — instead of a plain text-2xl heading. */
	.dev-header {
		padding: 12px 16px;
		border-radius: var(--radius-md);
		background: var(--header-bg);
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
	}
	.dev-header h1 {
		margin: 0;
		font-size: 1.25rem;
	}
	.dev-header p {
		margin: 4px 0 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-family: var(--font-retro);
	}

	.credential-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 12px;
		border-radius: var(--radius-sm);
		border-top: 1.5px solid var(--bevel-light);
		border-left: 1.5px solid var(--bevel-light);
		border-bottom: 1.5px solid var(--bevel-dark);
		border-right: 1.5px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	/* Replaces the deck's old native border-style:outset — a crude
	   browser-default gray bevel that ignores the theme entirely — with
	   the same tokens every other panel on the site uses, so the card
	   game's frame actually tints with light/dark mode instead of always
	   rendering flat system gray. */
	.card-face {
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}
</style>