import { load, Store } from "@tauri-apps/plugin-store";

// Type definitions
export interface EpisodeKey {
  season: number;
  episode: number;
}

export interface ShowHistory {
  imdbId?: string;
  latestEpisode: EpisodeKey;
  latestWatchTime: string; // ISO 8601 timestamp
  watchedEpisodes: EpisodeKey[];
}

export interface UserHistoryStore {
  [tmdbId: string]: ShowHistory;
}

export interface StoreMetadata {
  lastRefreshTime: string; // ISO 8601 timestamp
}

// Store instance
let storeInstance: Store | null = null;
let lastRefreshTime: Date | null = null;

const STORE_FILE = "user-history.json";
const METADATA_KEY = "_metadata";

/**
 * Initialize and load the user history store
 */
export async function initUserHistoryStore(): Promise<Store> {
  if (storeInstance) {
    return storeInstance;
  }

  storeInstance = await load(STORE_FILE, { autoSave: 100, defaults: {} }); // Auto-save after 100ms debounce

  // Load last refresh time from metadata
  const metadata = await storeInstance.get<StoreMetadata>(METADATA_KEY);
  if (metadata?.lastRefreshTime) {
    lastRefreshTime = new Date(metadata.lastRefreshTime);
  }

  return storeInstance;
}

/**
 * Get the last refresh time
 */
export function getLastRefreshTime(): Date | null {
  return lastRefreshTime;
}

/**
 * Update the last refresh time to now
 */
export async function updateLastRefreshTime(): Promise<void> {
  const store = await initUserHistoryStore();
  lastRefreshTime = new Date();

  const metadata: StoreMetadata = {
    lastRefreshTime: lastRefreshTime.toISOString(),
  };

  await store.set(METADATA_KEY, metadata);
  await store.save();
}

/**
 * Get show history by TMDB ID
 */
export async function getShowHistory(
  tmdbId: number
): Promise<ShowHistory | null> {
  const store = await initUserHistoryStore();
  const result = await store.get<ShowHistory>(tmdbId.toString());
  return result ?? null;
}

/**
 * Get all show histories
 */
export async function getAllShowHistories(): Promise<UserHistoryStore> {
  const store = await initUserHistoryStore();
  const entries = await store.entries<ShowHistory>();

  const histories: UserHistoryStore = {};
  for (const [key, value] of entries) {
    // Skip metadata key
    if (key === METADATA_KEY) continue;
    histories[key] = value;
  }

  return histories;
}

/**
 * Set or update show history
 */
export async function setShowHistory(
  tmdbId: number,
  history: ShowHistory
): Promise<void> {
  const store = await initUserHistoryStore();
  await store.set(tmdbId.toString(), history);
  await store.save();
}

/**
 * Check if an episode is watched
 */
export function isEpisodeWatched(
  history: ShowHistory,
  season: number,
  episode: number
): boolean {
  return history.watchedEpisodes.some(
    (ep) => ep.season === season && ep.episode === episode
  );
}

/**
 * Add a watched episode to show history
 */
export async function addWatchedEpisode(
  tmdbId: number,
  imdbId: string | undefined,
  season: number,
  episode: number,
  watchedAt: string
): Promise<void> {
  const store = await initUserHistoryStore();
  const existing = await getShowHistory(tmdbId);

  const episodeKey: EpisodeKey = { season, episode };

  if (existing) {
    // Check if episode already exists in watched list
    const alreadyWatched = isEpisodeWatched(existing, season, episode);

    if (!alreadyWatched) {
      existing.watchedEpisodes.push(episodeKey);
    }

    // Update latest episode if this is newer
    const watchedAtDate = new Date(watchedAt);
    const latestWatchDate = new Date(existing.latestWatchTime);

    if (watchedAtDate > latestWatchDate) {
      existing.latestEpisode = episodeKey;
      existing.latestWatchTime = watchedAt;
    }

    await store.set(tmdbId.toString(), existing);
  } else {
    // Create new history entry
    const newHistory: ShowHistory = {
      imdbId,
      latestEpisode: episodeKey,
      latestWatchTime: watchedAt,
      watchedEpisodes: [episodeKey],
    };

    await store.set(tmdbId.toString(), newHistory);
  }

  await store.save();
}

/**
 * Sync watch history from Trakt API response
 * Only processes items newer than the last refresh time
 */
export async function syncWatchHistory(historyItems: any[]): Promise<void> {
  const lastRefresh = getLastRefreshTime();

  for (const item of historyItems) {
    // Skip if not an episode
    if (item.type !== "episode" || !item.episode || !item.show) {
      continue;
    }

    // Skip if older than last refresh
    if (lastRefresh) {
      const watchedAt = new Date(item.watched_at);
      if (watchedAt <= lastRefresh) {
        continue; // Already synced
      }
    }

    const tmdbId = item.show.ids?.tmdb;
    const imdbId = item.show.ids?.imdb;

    if (!tmdbId) {
      console.warn("Skipping history item without TMDB ID:", item);
      continue;
    }

    await addWatchedEpisode(
      tmdbId,
      imdbId,
      item.episode.season,
      item.episode.number,
      item.watched_at
    );
  }

  // Update last refresh time after successful sync
  await updateLastRefreshTime();
}

/**
 * Clear all show history data
 */
export async function clearAllHistory(): Promise<void> {
  const store = await initUserHistoryStore();
  await store.clear();
  await store.save();
  lastRefreshTime = null;
}

/**
 * Get the latest watched episode for a show
 */
export async function getLatestWatchedEpisode(
  tmdbId: number
): Promise<EpisodeKey | null> {
  const history = await getShowHistory(tmdbId);
  return history?.latestEpisode || null;
}

/**
 * Get all watched episodes for a show
 */
export async function getWatchedEpisodes(
  tmdbId: number
): Promise<EpisodeKey[]> {
  const history = await getShowHistory(tmdbId);
  return history?.watchedEpisodes || [];
}
