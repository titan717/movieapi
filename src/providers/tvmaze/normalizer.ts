import type { TvmazeEpisode, TvmazeSeason, TvmazeShow } from "./schemas.js";

function cleanHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function imagePair(image: TvmazeShow["image"] | TvmazeEpisode["image"] | TvmazeSeason["image"]) {
  return image ? {
    medium: image.medium ?? null,
    original: image.original ?? null
  } : null;
}

export function normalizeShow(show: TvmazeShow) {
  const images = imagePair(show.image);
  return {
    id: `kinoma_tvmaze_${show.id}`,
    type: "tv",
    title: show.name,
    originalTitle: show.name,
    year: show.premiered ? Number(show.premiered.slice(0, 4)) || null : null,
    rating: show.rating?.average ?? null,
    poster: images?.original ?? images?.medium ?? null,
    backdrop: null,
    overview: cleanHtml(show.summary),
    genres: show.genres ?? [],
    runtime: show.averageRuntime ?? show.runtime ?? null,
    releaseDate: show.premiered ?? null,
    status: show.status ?? null,
    language: show.language ?? null,
    schedule: show.schedule ? {
      time: show.schedule.time ?? null,
      days: show.schedule.days ?? [],
      timezone: show.schedule.timezone ?? null
    } : null,
    network: show.network ? {
      id: show.network.id,
      name: show.network.name,
      country: show.network.country?.code ?? null
    } : null,
    webChannel: show.webChannel ? {
      id: show.webChannel.id,
      name: show.webChannel.name,
      country: show.webChannel.country?.code ?? null
    } : null,
    ids: {
      tvmaze: show.id,
      tmdb: null,
      imdb: show.externals?.imdb ?? null,
      thetvdb: show.externals?.thetvdb ?? null,
      tvrage: show.externals?.tvrage ?? null
    },
    source: "tvmaze"
  };
}

export function normalizeEpisode(episode: TvmazeEpisode) {
  return {
    id: `kinoma_tvmaze_episode_${episode.id}`,
    providerId: episode.id,
    type: "episode",
    title: episode.name,
    season: episode.season ?? null,
    number: episode.number ?? null,
    airdate: episode.airdate ?? null,
    airtime: episode.airtime ?? null,
    airstamp: episode.airstamp ?? null,
    runtime: episode.averageRuntime ?? episode.runtime ?? null,
    rating: episode.rating?.average ?? null,
    overview: cleanHtml(episode.summary),
    image: imagePair(episode.image),
    source: "tvmaze"
  };
}

export function normalizeSeason(season: TvmazeSeason) {
  return {
    id: `kinoma_tvmaze_season_${season.id}`,
    providerId: season.id,
    number: season.number,
    name: season.name ?? null,
    episodeOrder: season.episodeOrder ?? null,
    premiereDate: season.premiereDate ?? null,
    endDate: season.endDate ?? null,
    image: imagePair(season.image),
    summary: cleanHtml(season.summary),
    source: "tvmaze"
  };
}
