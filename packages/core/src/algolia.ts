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

export interface SearchOptions {
  page?: number;
  hitsPerPage?: number;
  tags?: string;
  /** 'relevance' (default) or 'date' = newest first. */
  sortBy?: 'relevance' | 'date';
  /** Only hits created after this unix timestamp (seconds). */
  minCreatedAt?: number;
}

export async function searchHN(query: string, opts: SearchOptions = {}): Promise<{
  hits: AlgoliaHit[];
  nbPages: number;
  page: number;
}> {
  const params = new URLSearchParams({
    query,
    tags: opts.tags ?? 'story',
    page: String(opts.page ?? 0),
    hitsPerPage: String(opts.hitsPerPage ?? 30),
  });
  if (opts.minCreatedAt) {
    params.set('numericFilters', `created_at_i>${opts.minCreatedAt}`);
  }
  const path = opts.sortBy === 'date' ? 'search_by_date' : 'search';
  const res = await fetch(`https://hn.algolia.com/api/v1/${path}?${params}`);
  if (!res.ok) throw new Error(`Algolia ${res.status}`);
  return res.json();
}
