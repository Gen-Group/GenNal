import type { GithubFetchPayload, GithubWorkItem, GithubWorkResult } from '../shared/types'

const API = 'https://api.github.com'

// Shape of the fields we read off the GitHub Search API issue/PR result.
interface RawSearchItem {
  id: number
  number: number
  title: string
  html_url: string
  state: string
  draft?: boolean
  updated_at: string
  pull_request?: { merged_at?: string | null }
  user?: { login?: string }
  assignees?: { login: string; avatar_url: string }[]
}

interface RawSearchResponse {
  total_count: number
  items: RawSearchItem[]
}

/** Turn a git remote URL (https or ssh) into "owner/name", or null. */
export function parseGithubRepo(remoteUrl: string | undefined): string | null {
  if (!remoteUrl) return null
  const cleaned = remoteUrl
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^ssh:\/\/git@github\.com\//, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
  const match = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/)
  return match ? `${match[1]}/${match[2]}` : null
}

function resolveToken(payload: GithubFetchPayload): string | undefined {
  return payload.token?.trim() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined
}

export async function fetchGithubWork(payload: GithubFetchPayload): Promise<GithubWorkResult> {
  const repo = (payload.repo || '').trim()
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error('No GitHub repository detected for this workspace.')
  }

  const token = resolveToken(payload)
  const query = `repo:${repo} ${payload.query}`.trim().replace(/\s+/g, ' ')
  const url = `${API}/search/issues?q=${encodeURIComponent(query)}&per_page=30&sort=updated&order=desc`

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GenNal'
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, { headers })
  } catch {
    throw new Error('Could not reach GitHub. Check your connection.')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      errors?: { message?: string }[]
    }
    const detail = body.errors?.find((e) => e.message)?.message
    if (res.status === 401) throw new Error('GitHub token is invalid or expired.')
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        token
          ? body.message || 'GitHub API rate limit reached. Try again shortly.'
          : 'GitHub rate limit reached. Add a token in Tasks to raise the limit.'
      )
    }
    if (res.status === 422) {
      // GitHub blocks search on some repos unless authenticated; surface that hint.
      throw new Error(
        detail || body.message || 'GitHub could not parse that query.'
      )
    }
    throw new Error(detail || body.message || `GitHub request failed (${res.status}).`)
  }

  const data = (await res.json()) as RawSearchResponse
  const items: GithubWorkItem[] = (data.items ?? []).map((it) => {
    const isPr = Boolean(it.pull_request)
    return {
      id: it.id,
      number: it.number,
      title: it.title,
      url: it.html_url,
      state: it.state === 'closed' ? 'closed' : 'open',
      kind: isPr ? 'pr' : 'issue',
      merged: isPr ? Boolean(it.pull_request?.merged_at) : false,
      draft: Boolean(it.draft),
      assignees: (it.assignees ?? []).map((a) => ({ login: a.login, avatarUrl: a.avatar_url })),
      updatedAt: it.updated_at,
      repo,
      author: it.user?.login
    }
  })

  return { items, total: data.total_count ?? items.length, repo, authenticated: Boolean(token) }
}
