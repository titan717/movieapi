import type { TmdbVideo } from "./video-schemas.js";

export type NormalizedVideo = {
  id: string; name: string;
  type: "Trailer" | "Teaser" | "Clip" | "Featurette" | "Opening Credits" | "Behind the Scenes" | "Bloopers" | "Other";
  site: string; key: string; url: string | null; embedUrl: string | null; thumbnail: string | null;
  official: boolean; publishedAt: string | null; language: string | null; country: string | null;
};

function videoType(type: string): NormalizedVideo["type"] {
  switch (type) {
    case "Trailer": case "Teaser": case "Clip": case "Featurette": case "Opening Credits":
    case "Behind the Scenes": case "Bloopers": return type;
    default: return "Other";
  }
}

export function normalizeTmdbVideo(video: TmdbVideo): NormalizedVideo {
  const youtube = video.site.toLowerCase() === "youtube";
  return {
    id: video.id, name: video.name, type: videoType(video.type), site: video.site, key: video.key,
    url: youtube ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}` : null,
    embedUrl: youtube ? `https://www.youtube.com/embed/${encodeURIComponent(video.key)}` : null,
    thumbnail: youtube ? `https://img.youtube.com/vi/${encodeURIComponent(video.key)}/hqdefault.jpg` : null,
    official: video.official ?? false, publishedAt: video.published_at ?? null,
    language: video.iso_639_1 ?? null, country: video.iso_3166_1 ?? null
  };
}

export function selectPrimaryTrailer(videos: NormalizedVideo[]) {
  return videos.filter(v => v.type === "Trailer")
    .sort((a,b) => Number(b.official)-Number(a.official) || String(b.publishedAt).localeCompare(String(a.publishedAt)))[0] ?? null;
}
