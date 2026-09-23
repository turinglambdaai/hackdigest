// HN search via the Algolia API (https://hn.algolia.com/api).

export interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string;
  author: string;
  points?: number;
  num_comments?: number;
  created_at: string; // ISO
  story_id?: number;
}

export async function searchHN(
  query: string,
  opts: { page?: number; hitsPerPage?: number; tags?: string } = {}
): Promise<{ hits: AlgoliaHit[]; nbPages: number; page: number }> {
  const params = new URLSearchParams({
    query,
    tags: opts.tags ?? 'story',
    page: String(opts.page ?? 0),
    hitsPerPage: String(opts.hitsPerPage ?? 30),
  });
  const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`);
  if (!res.ok) throw new Error(`Algolia ${res.status}`);
  return res.json();
}
