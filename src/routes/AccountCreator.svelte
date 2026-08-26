<script lang="ts">
	import { mode } from 'mode-watcher';
	import * as AlertDialog from '@/components/ui/alert-dialog';
	import { Button } from '@/components/ui/button';
	import { Input } from '@/components/ui/input';
	import { Separator } from '@/components/ui/separator';
	import { Label } from '@/components/ui/label';

	import IQTest from './IQTest.svelte';
	import Turnstile from './Turnstile.svelte';
	import { toast } from 'svelte-sonner';
	import { working } from '$lib/working';
	import { PUBLIC_DISCORD_CLIENT_ID } from '$env/static/public';

	let nickname = $state('');
	let username = $state('');
	let iqReport: string | null = $state();
	let totalIQ: number | null = $state();
	let turnstileToken = $state('');

	// Restructured into two sequential steps — username/nickname first, then
	// the IQ test — instead of showing both side-by-side at once. People
	// kept being unsure which one they were supposed to do first when they
	// were shown together; a linear wizard removes the ambiguity entirely.
	let step: 'profile' | 'test' = $state('profile');

	// The 20 question IDs IQTest.svelte stores answers under, as bare
	// (non-namespaced) localStorage keys — kept here too so this component
	// can fully wipe a stale/finished test's leftover state without IQTest
	// needing to expose it. Must stay in sync with the `components` map in
	// IQTest.svelte.
	const IQ_QUESTION_IDS = [
		'AGI', 'AudioAgeOfWar', 'AudioRick', 'British', 'CatQuestion', 'Chemistry',
		'ContentCreators', 'Degree', 'Dexerto', 'GimmickAccount', 'GPT', 'Kubernete',
		'MathProblem', 'MathProblemComplex', 'MathQuestion', 'ReactionImage',
		'SequenceNumber', 'SequenceSymbol', 'ShortFormContent', 'TypingTest'
	];

	// Nothing previously cleared 'iq_questions' / 'current_question' / each
	// question's answer key — not even on successful registration. Any
	// later visit to AccountCreator (switching accounts, a second signup
	// attempt on the same device/browser, session weirdness) would silently
	// resume or skip using another attempt's leftover progress. That's the
	// root of the "permanently stuck on the IQ test" reports: the resumed
	// state and the account actually being registered could disagree, and
	// there was no way to restart.
	function clearIqProgress() {
		localStorage.removeItem('iq_questions');
		localStorage.removeItem('current_question');
		for (const id of IQ_QUESTION_IDS) localStorage.removeItem(id);
	}

	// Bumping this key forces IQTest to fully remount (Svelte tears down and
	// re-creates keyed blocks), which re-runs its localStorage init from
	// scratch — the actual "restart" mechanism, since IQTest owns its own
	// question order/progress internally.
	let testInstance = $state(0);

	function restartTest() {
		clearIqProgress();
		testInstance++;
		allQuestionsCompleted = false;
	}

	async function authLogin() {
		// Abandoning account creation to log in as an existing account
		// instead — clear any in-progress test state so it can't bleed into
		// a future signup attempt on this device.
		clearIqProgress();
		window.location.href = window.location.origin;
	}

	let allQuestionsCompleted = $state(localStorage.getItem('current_question') === '20' ? true : false);

	const handleQuestionsCompleted = (event: { detail: boolean }) => {
		allQuestionsCompleted = event.detail;
	};

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	function continueToTest() {
		if (!nickname.trim() || !username.trim()) return;
		step = 'test';
	}

	const handleSubmit = async () => {
		const questions = JSON.parse(localStorage.getItem('iq_questions') || '[]');
		let obj: Record<string, string> = {};

		for (const question of questions) {
			if (question?.id) {
				obj[question.id] = localStorage.getItem(question.id) || '';
			}
		}

		working.start('Calculating your IQ…');
		try {
			const response = await fetch('/api/profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: nickname, handle: username, turnstileToken, ...obj })
			});

			if (response.status !== 201) throw new Error('Non-201 status code');

			const res = await response.json();
			iqReport = res.formattedText;
			totalIQ = res.totalIQ;

			// Registration succeeded — clear the test progress now instead of
			// letting it sit in localStorage forever (previously it never
			// got cleared at all, successful or not).
			clearIqProgress();

			// Stash user data so +page.svelte can skip the /api/me round-trip
			// and transition straight into the app once the user dismisses the dialog.
			dispatch('registered', {
				id: res.id,
				username: res.username,
				handle: res.handle,
				created_at: res.created_at,
				iq: res.iq,
				login_streak: res.login_streak ?? 1
			});
		} catch (error) {
			toast.error(
				'Something went wrong. This can include: your @handle being already taken; your @handle not being alphabetic ("-" is allowed); the server having an issue. Please try again later.'
			);
		} finally {
			working.done();
		}
	};
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div class="flex w-full max-w-[520px] flex-col items-center gap-6 p-1">
		<div class="inline-flex items-center gap-2">
			<img
				src={mode.current === "dark" ? "logo_dark.svg" : "logo_light.svg"}
				alt="Lyntr"
				class="pointer-events-none h-20 w-20 select-none md:h-24 md:w-24"
			/>
			<Label class="select-none text-6xl">Lyntr.</Label>
		</div>

		<div class="flex w-full items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
			<span class:text-primary={step === 'profile'}>1. Username</span>
			<span aria-hidden="true">→</span>
			<span class:text-primary={step === 'test'}>2. IQ Test</span>
		</div>

		{#if step === 'profile'}
			<p class="text-center text-2xl">Welcome onboard! Let's get you started.</p>

			<div class="flex w-full flex-col gap-5">
				<div class="flex flex-col gap-1.5">
					<Label for="email-2" placeholder="Nickname...">Nickname</Label>
					<Input
						type="email"
						id="email-2"
						placeholder="FaceDev"
						class="border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
						bind:value={nickname}
					/>
					<p class="text-sm text-muted-foreground">Enter your desired nickname (max. 60 char.)</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="username">Username</Label>
					<Input
						type="text"
						id="username"
						placeholder="@facedev"
						class="border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
						bind:value={username}
						on:input={() => {
							username = '@' + username.replace(/[^0-9a-z_-]/gi, '').toLowerCase();
						}}
					/>
					<p class="text-sm text-muted-foreground">Enter your permanent username (max. 32 char.)</p>
					<p class="text-xs text-muted-foreground">
						Only alphabetical lowercase letters (a-z) work, including '-'.
					</p>
				</div>

				<Button onclick={continueToTest} disabled={!nickname.trim() || !username.trim()}>
					Continue to IQ Test
				</Button>
			</div>

			<span class="mt-2 text-left text-sm"
				>Already have an account on Lyntr? <button
					class="font-bold text-primary"
					onclick={authLogin}>Log in</button
				></span
			>
		{:else}
			<div class="w-full">
				<button class="mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground" onclick={() => (step = 'profile')}>
					← Back to username
				</button>

				<div class="w-full rounded-md border-2 border-primary p-4">
					<div class="mb-3 flex items-start justify-between gap-2">
						<div class="space-y-1">
							<p class="text-lg font-bold">The Lyntr IQ Test</p>
							<p class="text-sm text-muted-foreground">
								20 questions, negative 100% validity. Your score gets stamped
								on your profile forever — it's the whole twist of this place, so
								give it your best (or funniest) shot LOL.
							</p>
						</div>
						<!-- Escape hatch for the exact "permanently stuck" case: if
						     leftover/incompatible progress from a previous attempt is
						     sitting in localStorage, this fully wipes it and remounts
						     IQTest fresh instead of leaving the person with no way
						     forward. -->
						<button
							class="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground underline hover:text-foreground"
							onclick={restartTest}
						>
							Restart test
						</button>
					</div>
					{#key testInstance}
						<IQTest on:questionsCompleted={handleQuestionsCompleted} />
					{/key}
				</div>

				{#if allQuestionsCompleted}
					<div class="mt-5 flex flex-col gap-3">
						<Turnstile bind:token={turnstileToken} />

						<AlertDialog.Root>
							<AlertDialog.Trigger asChild >
								{#snippet children({ builder })}
													<Button
										builders={[builder]}
										on:click={handleSubmit}
										disabled={!nickname || !username || !turnstileToken}
									>
										Continue
									</Button>
																				{/snippet}
												</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title class="mb-2 text-2xl font-bold"
										>Welcome to Lyntr!</AlertDialog.Title
									>
									<AlertDialog.Description>
										<div class="space-y-4">
											<p>
												Make sure to read the <a href="tos">Terms of Service</a> and
												<a href="privacy">Privacy Policy</a>.
											</p>
											<div class="rounded-md border border-primary p-3">
												<p class="font-medium">
													Get verified as well to unlock name colors and get a verified badge.
												</p>
												<img
													src="/verified_steps.png"
													alt="How to get verified on Lyntr"
													class="mt-2 w-full rounded"
												/>
											</div>
											{#if iqReport}
												<div>
													<h3 class="mb-2 font-semibold">IQ Report:</h3>
													<pre class="whitespace-pre-wrap text-sm">{iqReport}</pre>
												</div>
												<p class="text-right font-semibold">Total IQ: {totalIQ}</p>
											{/if}
										</div>
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Action on:click={() => dispatch('login')}>Continue</AlertDialog.Action>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
