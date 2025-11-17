/**
 * Trakt API Integration Types
 *
 * These types correspond to the Rust backend implementation in src-tauri/src/trakt.rs
 */

/**
 * Event payload when login codes are generated
 */
export interface TraktLoginCodesEvent {
  user_code: string;
  verification_url: string;
}

/**
 * Event payload when login succeeds
 */
export interface TraktLoginSuccessEvent {
  access_token: string;
}

/**
 * Event payload when login fails
 */
export interface TraktLoginErrorEvent {
  error: string;
}

/**
 * Trakt event types for use with Tauri's event system
 */
export const TRAKT_EVENTS = {
  LOGIN_CODES: "trakt:login-codes",
  LOGIN_SUCCESS: "trakt:login-success",
  LOGIN_ERROR: "trakt:login-error",
} as const;

/**
 * Helper type for Trakt event names
 */
export type TraktEventName = (typeof TRAKT_EVENTS)[keyof typeof TRAKT_EVENTS];

/**
 * Trakt user profile information
 */
export interface TraktUserInfo {
  username: string;
  private: boolean;
  name: string;
  vip: boolean;
  vip_ep: boolean;
  ids: {
    slug: string;
  };
  joined_at?: string;
  location?: string;
  about?: string;
  gender?: string;
  age?: number;
  images?: {
    avatar?: {
      full?: string;
    };
  };
}

/**
 * Trakt movie IDs from various services
 */
export interface TraktMovieIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
}

/**
 * Trakt movie information
 */
export interface TraktMovie {
  title: string;
  year?: number;
  ids: TraktMovieIds;
  tagline?: string;
  overview?: string;
  released?: string;
  runtime?: number;
  trailer?: string;
  homepage?: string;
  rating?: number;
  votes?: number;
  language?: string;
  genres?: string[];
}

/**
 * Trending movie item with watcher count
 */
export interface TrendingMovieItem {
  watchers: number;
  movie: TraktMovie;
}

/**
 * Watched movie item with play count and timestamps
 */
export interface WatchedMovieItem {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  movie: TraktMovie;
}

/**
 * Trakt show IDs from various services
 */
export interface TraktShowIds {
  trakt: number;
  slug: string;
  tvdb?: number;
  imdb?: string;
  tmdb?: number;
}

/**
 * Trakt show information
 */
export interface TraktShow {
  title: string;
  year?: number;
  ids: TraktShowIds;
  overview?: string;
  first_aired?: string;
  runtime?: number;
  certification?: string;
  network?: string;
  country?: string;
  trailer?: string;
  homepage?: string;
  status?: string;
  rating?: number;
  votes?: number;
  language?: string;
  genres?: string[];
  aired_episodes?: number;
}

/**
 * Trending show item with watcher count
 */
export interface TrendingShowItem {
  watchers: number;
  show: TraktShow;
}

/**
 * Watched show item with play count and timestamps
 */
export interface WatchedShowItem {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  show: TraktShow;
}

/**
 * History item for individual watch events
 */
export interface HistoryItem {
  id: number;
  watched_at: string;
  action: string;
  type: string;
  episode?: HistoryEpisode;
  show?: TraktShow;
}

/**
 * Episode information in history
 */
export interface HistoryEpisode {
  season: number;
  number: number;
  title: string;
  ids: HistoryEpisodeIds;
}

/**
 * Episode IDs in history
 */
export interface HistoryEpisodeIds {
  trakt: number;
  tvdb?: number;
  imdb?: string;
  tmdb?: number;
}
