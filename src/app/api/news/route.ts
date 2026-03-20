import { NextResponse } from "next/server";

const NEWS_FETCH_TIMEOUT_MS = 5000;
const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedNewsItems: NewsItem[] = [];
let cachedNewsAt = 0;

type HNHit = {
  title?: string | null;
  story_title?: string | null;
  url?: string | null;
  story_url?: string | null;
  author?: string | null;
  created_at?: string | null;
};

type NewsItem = {
  title: string;
  source: string;
  time: string;
  url: string;
};

function relativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) {
    return "just now";
  }

  if (mins < 60) {
    return `${mins}m ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function GET() {
  const now = Date.now();
  if (cachedNewsItems.length > 0 && now - cachedNewsAt < NEWS_CACHE_TTL_MS) {
    return NextResponse.json({ items: cachedNewsItems });
  }

  try {
    const response = await fetch(
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=8",
      {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(NEWS_FETCH_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ items: cachedNewsItems }, { status: 200 });
    }

    const payload = (await response.json()) as { hits?: HNHit[] };

    const items: NewsItem[] = (payload.hits || [])
      .map((hit) => {
        const title = (hit.title || hit.story_title || "").trim();
        const url = (hit.url || hit.story_url || "").trim();
        const createdAt = hit.created_at || "";

        if (!title || !url || !createdAt) {
          return null;
        }

        return {
          title,
          source: `Hacker News • ${hit.author || "unknown"}`,
          time: relativeTime(createdAt),
          url,
        } satisfies NewsItem;
      })
      .filter((item): item is NewsItem => Boolean(item));

    cachedNewsItems = items;
    cachedNewsAt = Date.now();

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: cachedNewsItems }, { status: 200 });
  }
}
