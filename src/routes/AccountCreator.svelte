<script lang="ts">
    import { mode } from 'mode-watcher';
    import * as AlertDialog from '@/components/ui/alert-dialog';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Separator } from '@/components/ui/separator';
    import { Label } from '@/components/ui/label';
    import IQTest from './IQTest.svelte';
    import Turnstile from './Turnstile.svelte';
    import Avatar from './Avatar.svelte';
    import UserName from './UserName.svelte';
    import UserBadges from './UserBadges.svelte';
    import { cdnUrl } from './stores';
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
    let topUsersLoading = $state(false);
    let topUsersError = $state(false);

    async function loadTopUsers() {
        topUsersLoading = true;
        topUsersError = false;
        try {
            const res = await fetch(
                '/api/leaderboard?category=followers&limit=10'
            );

            if (!res.ok) {
                throw new Error('Failed to load top users');
            }

            const data = await res.json();
            topUsers = data.entries ?? [];
        } catch (err) {
            console.error(err);
            topUsers = [];
            topUsersError = true;
        } finally {
            topUsersLoading = false;
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

                <div class="aero-panel w-full">
                    <div class="panel-head">
                        <span class="panel-title">What's happening</span>
                    </div>

                    <div class="panel-body">
                        <p class="mb-3 text-sm text-muted-foreground">
                            Pick a few tags that interest you — this shapes
                            what shows up in your feed.
                        </p>

                        {#if trendingTags.length > 0}
                            <div class="tag-chip-wrap">
                                {#each trendingTags as tag}
                                    <button
                                        type="button"
                                        class="tag-chip"
                                        class:selected={selectedTags.includes(tag.tag)}
                                        onclick={() => selectTag(tag.tag)}
                                    >
                                        <span class="tag-chip-name">#{tag.tag}</span>
                                        <span class="tag-chip-count">{tag.count}</span>
                                    </button>
                                {/each}
                            </div>
                        {:else}
                            <p class="empty-row">Loading tags...</p>
                        {/if}
                    </div>
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

                <div class="aero-panel w-full">
                    <div class="panel-head">
                        <span class="panel-title">Who to follow</span>
                    </div>

                    <div class="panel-body">
                        <p class="mb-3 text-sm text-muted-foreground">
                            Follow some users to populate your feed.
                        </p>

                        {#if topUsersLoading}
                            <p class="empty-row">Loading users...</p>
                        {:else if topUsersError}
                            <p class="empty-row">
                                Couldn't load suggested users. <button
                                    type="button"
                                    class="underline"
                                    onclick={loadTopUsers}
                                >Try again</button>
                            </p>
                        {:else if topUsers.length > 0}
                            <div class="user-list">
                                {#each topUsers as user}
                                    <button
                                        type="button"
                                        class="user-row"
                                        class:selected={followedUsers.includes(user.handle)}
                                        onclick={() => toggleFollow(user.handle)}
                                    >
                                        <Avatar
                                            size={11}
                                            src={cdnUrl(user.userId, 'small')}
                                            alt={user.username}
                                            showPresence={false}
                                        />

                                        <span class="user-body">
                                            <span class="user-name-row">
                                                <UserName
                                                    name={user.username}
                                                    color={user.nameColor}
                                                    verified={user.verified}
                                                    class="user-name"
                                                />
                                                <UserBadges
                                                    verified={user.verified}
                                                    followerCount={user.value}
                                                    size="tiny"
                                                />
                                            </span>
                                            <span class="user-handle">@{user.handle}</span>
                                        </span>

                                        <span class="follow-pill" class:following={followedUsers.includes(user.handle)}>
                                            {followedUsers.includes(user.handle) ? 'Following' : 'Follow'}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                        {:else}
                            <p class="empty-row">No suggested users right now.</p>
                        {/if}
                    </div>
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
                            {#snippet children({ builder }: { builder: any })}
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

<style>
    .aero-panel {
        background: hsl(var(--card));
        border-top:    1px solid var(--bevel-light);
        border-left:   1px solid var(--bevel-light);
        border-bottom: 1px solid var(--bevel-dark);
        border-right:  1px solid var(--bevel-dark);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: var(--inset-shadow);
        font-family: var(--font-retro);
    }

    .panel-head {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        background: linear-gradient(
            to bottom,
            hsl(var(--primary) / 0.95),
            hsl(var(--primary) / 0.75)
        );
        color: hsl(var(--primary-foreground));
        border-bottom: 1px solid var(--bevel-dark);
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
    }

    .panel-title {
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.01em;
    }

    .panel-body {
        padding: 14px;
        background: hsl(var(--background));
    }

    .empty-row {
        padding: 4px 0;
        font-size: 12px;
        color: hsl(var(--muted-foreground));
        text-align: center;
    }

    /* ── Tag chips — beveled pills instead of plain bordered boxes ── */
    .tag-chip-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        font-family: inherit;
        font-size: 12px;
        cursor: pointer;
        background: hsl(var(--background));
        border-top:    1px solid var(--bevel-light);
        border-left:   1px solid var(--bevel-light);
        border-bottom: 1px solid var(--bevel-dark);
        border-right:  1px solid var(--bevel-dark);
        box-shadow: var(--hard-shadow-sm);
        transition: transform 0.08s, background 0.12s, color 0.12s;
    }

    .tag-chip:hover {
        filter: brightness(1.06);
    }

    .tag-chip:active {
        transform: scale(0.97);
    }

    .tag-chip-name {
        font-weight: 800;
        color: hsl(var(--foreground));
    }

    .tag-chip-count {
        font-size: 10px;
        color: hsl(var(--muted-foreground));
    }
    .tag-chip.selected {
        background: hsl(var(--primary) / 0.12);
        border-top:    1px solid var(--bevel-dark);
        border-left:   1px solid var(--bevel-dark);
        border-bottom: 1px solid var(--bevel-light);
        border-right:  1px solid var(--bevel-light);
        box-shadow: var(--inset-shadow);
    }

    .tag-chip.selected .tag-chip-name {
        color: hsl(var(--primary));
    }

    .user-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .user-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 10px;
        border: none;
        border-radius: 6px;
        background: transparent;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.12s;
    }

    .user-row:hover {
        background: hsl(var(--lynt-focus));
    }

    .user-row.selected {
        background: hsl(var(--primary) / 0.08);
    }

    .user-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .user-name-row {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
    }

    :global(.user-name) {
        font-size: 13px;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 1;
        min-width: 0;
    }

    .user-handle {
        font-size: 11px;
        color: hsl(var(--muted-foreground));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .follow-pill {
        flex-shrink: 0;
        padding: 5px 14px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        background: hsl(var(--foreground));
        color: hsl(var(--background));
        border-top:    1px solid var(--bevel-light);
        border-left:   1px solid var(--bevel-light);
        border-bottom: 1px solid var(--bevel-dark);
        border-right:  1px solid var(--bevel-dark);
    }

    .follow-pill.following {
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        border-top:    1px solid var(--bevel-dark);
        border-left:   1px solid var(--bevel-dark);
        border-bottom: 1px solid var(--bevel-light);
        border-right:  1px solid var(--bevel-light);
    }
</style>
