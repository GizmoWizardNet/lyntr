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
    import { createEventDispatcher } from 'svelte';

    let nickname = $state('');
    let username = $state('');
    let iqReport = $state<string | null>(null);
    let totalIQ = $state<number | null>(null);
    let turnstileToken = $state('');
    let step = $state<'profile' | 'test' | 'tags' | 'follow' | 'submit'>('profile');

    const IQ_QUESTION_IDS = [
        'AGI',
        'AudioAgeOfWar',
        'AudioRick',
        'British',
        'CatQuestion',
        'Chemistry',
        'ContentCreators',
        'Degree',
        'Dexerto',
        'GimmickAccount',
        'GPT',
        'Kubernete',
        'MathProblem',
        'MathProblemComplex',
        'MathQuestion',
        'ReactionImage',
        'SequenceNumber',
        'SequenceSymbol',
        'ShortFormContent',
        'TypingTest'
    ];

    function clearIqProgress() {
        localStorage.removeItem('iq_questions');
        localStorage.removeItem('current_question');

        for (const id of IQ_QUESTION_IDS) {
            localStorage.removeItem(id);
        }
    }

    let testInstance = $state(0);

    function restartTest() {
        clearIqProgress();
        testInstance++;
        allQuestionsCompleted = false;
    }

    async function authLogin() {
        clearIqProgress();
        window.location.href = window.location.origin;
    }

    let allQuestionsCompleted = $state(
        localStorage.getItem('current_question') === '20'
    );

    const handleQuestionsCompleted = async (event: { detail: boolean }) => {
        allQuestionsCompleted = event.detail;

        if (allQuestionsCompleted) {
            step = 'tags';
            await loadTrendingTags();
        }
    };

    const dispatch = createEventDispatcher();

    function continueToTest() {
        if (!nickname.trim() || !username.trim()) return;

        step = 'test';
    }

    // Tags step
    let selectedTags = $state<string[]>([]);
    let trendingTags = $state<any[]>([]);

    async function loadTrendingTags() {
        try {
            const res = await fetch('/api/trending');

            if (!res.ok) {
                throw new Error('Failed to load trending tags');
            }

            const data = await res.json();

            // The trending endpoint returns { tags: [...], users: [...] }
            trendingTags = data.tags;
        } catch (err) {
            console.error(err);
            trendingTags = [];
        }
    }

    function selectTag(tag: string) {
        const index = selectedTags.indexOf(tag);

        if (index === -1) {
            selectedTags = [...selectedTags, tag];
        } else {
            selectedTags = selectedTags
                .slice(0, index)
                .concat(selectedTags.slice(index + 1));
        }
    }

    async function continueToTags() {
        step = 'follow';
        await loadTopUsers();
    }

    function backToTest() {
        step = 'test';
    }

    // Follow step
    let followedUsers = $state<string[]>([]);
    let topUsers = $state<any[]>([]);

    async function loadTopUsers() {
        try {
            const res = await fetch(
                '/api/leaderboard?category=followers&limit=10'
            );

            if (!res.ok) {
                throw new Error('Failed to load top users');
            }

            topUsers = await res.json();
        } catch (err) {
            console.error(err);
            topUsers = [];
        }
    }

    function toggleFollow(userHandle: string) {
        const index = followedUsers.indexOf(userHandle);

        if (index === -1) {
            followedUsers = [...followedUsers, userHandle];
        } else {
            followedUsers = followedUsers
                .slice(0, index)
                .concat(followedUsers.slice(index + 1));
        }
    }

    function backToTags() {
        step = 'tags';
    }

    const handleSubmit = async () => {
        const questions = JSON.parse(
            localStorage.getItem('iq_questions') || '[]'
        );

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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: nickname,
                    handle: username,
                    turnstileToken,
                    selectedTags,
                    followedUsers,
                    ...obj
                })
            });

            if (response.status !== 201) {
                throw new Error('Non-201 status code');
            }

            const res = await response.json();

            iqReport = res.formattedText;
            totalIQ = res.totalIQ;

            clearIqProgress();

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
                src={mode.current === 'dark' ? 'logo_dark.svg' : 'logo_light.svg'}
                alt="Lyntr"
                class="pointer-events-none h-20 w-20 select-none md:h-24 md:w-24"
            />

            <Label class="select-none text-6xl">Lyntr.</Label>
        </div>

        <div
            class="flex w-full items-center justify-center gap-2 text-xs font-semibold text-muted-foreground"
        >
            <span class:text-primary={step === 'profile'}>
                1. Username
            </span>

            <span aria-hidden="true">→</span>

            <span class:text-primary={step === 'test'}>
                2. IQ Test
            </span>

            <span class:text-primary={step === 'tags'}>
                3. Select Tags
            </span>

            <span class:text-primary={step === 'follow'}>
                4. Follow Users
            </span>

            <span class:text-primary={step === 'submit'}>
                5. Finish
            </span>
        </div>

        {#if step === 'profile'}
            <p class="text-center text-2xl">
                Welcome onboard! Let's get you started.
            </p>

            <div class="flex w-full flex-col gap-5">
                <div class="flex flex-col gap-1.5">
                    <Label for="email-2" placeholder="Nickname...">
                        Nickname
                    </Label>

                    <Input
                        type="email"
                        id="email-2"
                        placeholder="FaceDev"
                        class="border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
                        bind:value={nickname}
                    />

                    <p class="text-sm text-muted-foreground">
                        Enter your desired nickname (max. 60 char.)
                    </p>
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
                            username =
                                '@' +
                                username
                                    .replace(/[^0-9a-z_-]/gi, '')
                                    .toLowerCase();
                        }}
                    />

                    <p class="text-sm text-muted-foreground">
                        Enter your permanent username (max. 32 char.)
                    </p>

                    <p class="text-xs text-muted-foreground">
                        Only alphabetical lowercase letters (a-z) work,
                        including '-'.
                    </p>
                </div>

                <Button
                    onclick={continueToTest}
                    disabled={!nickname.trim() || !username.trim()}
                >
                    Continue to IQ Test
                </Button>
            </div>

            <span class="mt-2 text-left text-sm">
                Already have an account on Lyntr?
                <button
                    class="font-bold text-primary"
                    onclick={authLogin}
                >
                    Log in
                </button>
            </span>

        {:else if step === 'test'}
            <div class="w-full">
                <button
                    class="mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    onclick={() => (step = 'profile')}
                >
                    ← Back to username
                </button>

                <div class="w-full rounded-md border-2 border-primary p-4">
                    <div class="mb-3 flex items-start justify-between gap-2">
                        <div class="space-y-1">
                            <p class="text-lg font-bold">
                                The Lyntr IQ Test
                            </p>

                            <p class="text-sm text-muted-foreground">
                                20 questions, negative 100% validity. Your
                                score gets stamped on your profile forever —
                                it's the whole twist of this place, so give it
                                your best (or funniest) shot LOL.
                            </p>
                        </div>

                        <!-- Escape hatch for the exact "permanently stuck" case:
                             if leftover/incompatible progress from a previous
                             attempt is sitting in localStorage, this fully
                             wipes it and remounts IQTest fresh instead of
                             leaving the person with no way forward. -->

                        <button
                            class="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground underline hover:text-foreground"
                            onclick={restartTest}
                        >
                            Restart test
                        </button>
                    </div>

                    {#key testInstance}
                        <IQTest
                            on:questionsCompleted={handleQuestionsCompleted}
                        />
                    {/key}
                </div>

                {#if allQuestionsCompleted}
                    <div class="mt-5 flex flex-col gap-3"></div>
                {/if}
            </div>

        {:else if step === 'tags'}
            <div class="w-full">
                <button
                    class="mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    onclick={() => (step = 'test')}
                >
                    ← Back to IQ Test
                </button>

                <div class="w-full rounded-md border-2 border-primary p-4">
                    <div class="mb-3 flex items-start justify-between gap-2">
                        <div class="space-y-1">
                            <p class="text-lg font-bold">
                                Select Your Interests
                            </p>

                            <p class="text-sm text-muted-foreground">
                                Choose tags that interest you to customize
                                your feed.
                            </p>
                        </div>
                    </div>

                    {#if trendingTags.length > 0}
                        <div
                            class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            {#each trendingTags as tag}
                                <div
                                    class="flex items-center gap-2 rounded border p-3 hover:border-primary cursor-pointer {selectedTags.includes(tag.tag) ? 'bg-primary/5' : ''}"
                                    class:border-primary={selectedTags.includes(
                                        tag.tag
                                    )}
                                    onclick={() => selectTag(tag.tag)}
                                >
                                    <span class="font-medium">
                                        #{tag.tag}
                                    </span>

                                    <span
                                        class="text-sm text-muted-foreground"
                                    >
                                        ({tag.count})
                                    </span>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-center text-muted-foreground">
                            Loading tags...
                        </p>
                    {/if}
                </div>

                <div class="mt-6 flex justify-between">
                    <Button
                        onclick={backToTest}
                        variant="outline"
                    >
                        Back
                    </Button>

                    <Button onclick={continueToTags}>
                        Continue to Follow Users
                    </Button>
                </div>
            </div>

        {:else if step === 'follow'}
            <div class="w-full">
                <button
                    class="mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    onclick={() => (step = 'tags')}
                >
                    ← Back to Tags
                </button>

                <div class="w-full rounded-md border-2 border-primary p-4">
                    <div class="mb-3 flex items-start justify-between gap-2">
                        <div class="space-y-1">
                            <p class="text-lg font-bold">
                                Follow Interesting Users
                            </p>

                            <p class="text-sm text-muted-foreground">
                                Follow some users to populate your feed.
                            </p>
                        </div>
                    </div>

                    {#if topUsers.length > 0}
                        <div class="space-y-4">
                            {#each topUsers as user}
                                <div
                                    class="flex items-start gap-4 rounded border p-3 hover:border-primary cursor-pointer {followedUsers.includes(user.handle) ? 'bg-primary/5' : ''}"
                                    class:border-primary={followedUsers.includes(
                                        user.handle
                                    )}
                                    onclick={() =>
                                        toggleFollow(user.handle)}
                                >
                                    <div class="flex-shrink-0">
                                        <img
                                            src={`/avatar/${user.id}.png`}
                                            on:error={(event) => {
                                                const img =
                                                    event.currentTarget as HTMLImageElement;
                                                img.onerror = null;
                                                img.src = '/default.png';
                                            }}
                                            alt={user.username}
                                            class="h-10 w-10 rounded-full"
                                        />
                                    </div>

                                    <div class="flex-1 space-y-1">
                                        <div class="flex justify-between">
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <span class="font-medium">
                                                    {user.username}
                                                </span>

                                                @{user.handle}
                                            </div>

                                            {#if user.verified}
                                                <span
                                                    class="ml-2 text-xs font-semibold text-primary"
                                                >
                                                    ?
                                                </span>
                                            {/if}
                                        </div>

                                        <p
                                            class="text-sm text-muted-foreground"
                                        >
                                            {user.followerCount} followers •
                                            {user.lynt_coins} LyntCoins
                                        </p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-center text-muted-foreground">
                            Loading users...
                        </p>
                    {/if}
                </div>

                <div class="mt-6 flex justify-between">
                    <Button
                        onclick={backToTags}
                        variant="outline"
                    >
                        Back
                    </Button>

                    <Button onclick={() => (step = 'submit')}>
                        Continue
                    </Button>
                </div>
            </div>

        {:else if step === 'submit'}
            <div class="w-full">
                <div class="w-full rounded-md border-2 border-primary p-4">
                    <div class="mb-3 flex items-start justify-between gap-2">
                        <div class="space-y-1">
                            <p class="text-lg font-bold">
                                Almost there!
                            </p>

                            <p class="text-sm text-muted-foreground">
                                Complete the CAPTCHA to finish signing up.
                            </p>
                        </div>
                    </div>

                    <Turnstile bind:token={turnstileToken} />

                    <AlertDialog.Root>
                        <AlertDialog.Trigger asChild>
                            {#snippet children({ builder })}
                                <Button
                                    builders={[builder]}
                                    onclick={handleSubmit}
                                    disabled={
                                        !nickname ||
                                        !username ||
                                        !turnstileToken
                                    }
                                >
                                    Continue
                                </Button>
                            {/snippet}
                        </AlertDialog.Trigger>

                        <AlertDialog.Content>
                            <AlertDialog.Header>
                                <AlertDialog.Title
                                    class="mb-2 text-2xl font-bold"
                                >
                                    Welcome to Lyntr!
                                </AlertDialog.Title>

                                <AlertDialog.Description>
                                    <div class="space-y-4">
                                        <p>
                                            Make sure to read the
                                            <a href="tos">
                                                Terms of Service
                                            </a>
                                            and
                                            <a href="privacy">
                                                Privacy Policy
                                            </a>.
                                        </p>

                                        <div
                                            class="rounded-md border border-primary p-3"
                                        >
                                            <p class="font-medium">
                                                Get verified as well to unlock
                                                name colors and get a verified
                                                badge.
                                            </p>

                                            <img
                                                src="/verified_steps.png"
                                                alt="How to get verified on Lyntr"
                                                class="mt-2 w-full rounded"
                                            />
                                        </div>

                                        {#if iqReport}
                                            <div>
                                                <h3
                                                    class="mb-2 font-semibold"
                                                >
                                                    IQ Report:
                                                </h3>

                                                <pre
                                                    class="whitespace-pre-wrap text-sm"
                                                >{iqReport}</pre>
                                            </div>

                                            <p
                                                class="text-right font-semibold"
                                            >
                                                Total IQ: {totalIQ}
                                            </p>
                                        {/if}
                                    </div>
                                </AlertDialog.Description>
                            </AlertDialog.Header>

                            <AlertDialog.Footer>
                                <AlertDialog.Action
                                    onclick={() => dispatch('login')}
                                >
                                    Continue
                                </AlertDialog.Action>
                            </AlertDialog.Footer>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                </div>
            </div>
        {/if}
    </div>
</div>