import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { devCycleNotes, users } from '@/server/schema';
import { desc, eq } from 'drizzle-orm';

// Old-school commit graph for /updates — pulls real commit/merge history
// from the public GitHub repo and overlays admin-authored note bubbles
// (dev_cycle_notes), keyed by commit SHA.
//
// GitHub's REST API is used unauthenticated (60 req/hr/IP limit). That's
// plenty for a page that's cached for a few minutes — see CACHE_MS below.
// If GitHub ever rate-limits us, we serve the last good snapshot instead
// of failing the page.

const REPO = 'GizmoWizardNet/lyntr';
const COMMITS_PER_PAGE = 60;
const CACHE_MS = 5 * 60 * 1000;

type GitHubCommit = {
	sha: string;
	parents: { sha: string }[];
	commit: {
		message: string;
		author: { name: string; date: string };
	};
	author: { login: string; avatar_url: string } | null;
};

type GraphCommit = {
	sha: string;
	shortSha: string;
	parents: string[];
	message: string;
	authorName: string;
	authorLogin: string | null;
	avatarUrl: string | null;
	date: string;
	isMerge: boolean;
};

let cache: { at: number; commits: GraphCommit[] } | null = null;

async function fetchCommits(): Promise<GraphCommit[]> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.commits;

	const res = await fetch(
		`https://api.github.com/repos/${REPO}/commits?per_page=${COMMITS_PER_PAGE}`,
		{ headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lyntr-devcycle' } }
	);

	if (!res.ok) {
		// Serve stale cache rather than a broken page, if we have one.
		if (cache) return cache.commits;
		throw new Error(`GitHub API responded ${res.status}`);
	}

	const raw: GitHubCommit[] = await res.json();
	const commits: GraphCommit[] = raw.map((c) => ({
		sha: c.sha,
		shortSha: c.sha.slice(0, 7),
		parents: c.parents.map((p) => p.sha),
		message: c.commit.message.split('\n')[0],
		authorName: c.commit.author?.name ?? 'unknown',
		authorLogin: c.author?.login ?? null,
		avatarUrl: c.author?.avatar_url ?? null,
		date: c.commit.author?.date,
		isMerge: c.parents.length > 1
	}));

	cache = { at: Date.now(), commits };
	return commits;
}

export const GET: RequestHandler = async () => {
	const commits = await fetchCommits().catch(() => [] as GraphCommit[]);

	const notes = await db
		.select({
			id: devCycleNotes.id,
			commitSha: devCycleNotes.commit_sha,
			note: devCycleNotes.note,
			createdAt: devCycleNotes.created_at,
			authorHandle: users.handle,
			authorUsername: users.username
		})
		.from(devCycleNotes)
		.leftJoin(users, eq(devCycleNotes.author_id, users.id))
		.orderBy(desc(devCycleNotes.created_at));

	const notesBySha = new Map<string, typeof notes>();
	for (const n of notes) {
		if (!notesBySha.has(n.commitSha)) notesBySha.set(n.commitSha, []);
		notesBySha.get(n.commitSha)!.push(n);
	}

	return json({
		repo: REPO,
		commits: commits.map((c) => ({
			...c,
			notes: notesBySha.get(c.sha) ?? []
		}))
	});
};
