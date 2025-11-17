/**
 * TMDB (The Movie Database) API Integration Types
 *
 * These types correspond to the Rust backend implementation in src-tauri/src/tmdb.rs
 */

/**
 * TMDB Genre
 */
export interface TmdbGenre {
  id: number;
  name: string;
}

/**
 * TMDB Movie details
 */
export interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
  genres?: TmdbGenre[];
  runtime?: number;
  tagline?: string;
  status?: string;
  homepage?: string;
}

/**
 * TMDB Image metadata
 */
export interface TmdbImage {
  aspect_ratio: number;
  height: number;
  width: number;
  file_path: string;
  vote_average?: number;
  vote_count?: number;
  iso_639_1?: string;
}

/**
 * TMDB Movie images response
 */
export interface TmdbMovieImages {
  id: number;
  backdrops: TmdbImage[];
  posters: TmdbImage[];
  logos?: TmdbImage[];
}

/**
 * TMDB Image configuration
 */
export interface TmdbImageConfiguration {
  base_url: string;
  secure_base_url: string;
  backdrop_sizes: string[];
  logo_sizes: string[];
  poster_sizes: string[];
  profile_sizes: string[];
  still_sizes: string[];
}

/**
 * TMDB API Configuration
 */
export interface TmdbConfiguration {
  images: TmdbImageConfiguration;
}

/**
 * Image URL with size information
 */
export interface ImageUrl {
  url: string;
  size: string;
}

/**
 * TMDB TV Show details
 */
export interface TmdbShow {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genres?: TmdbGenre[];
  episode_run_time?: number[];
  status?: string;
  homepage?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  imdb_id?: string;
}

/**
 * TMDB TV Show images response
 */
export interface TmdbShowImages {
  id: number;
  backdrops: TmdbImage[];
  posters: TmdbImage[];
  logos?: TmdbImage[];
}

/**
 * TMDB Season details
 */
export interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  poster_path?: string;
  episode_count: number;
  episodes?: TmdbEpisode[];
  _id?: string;
}

/**
 * TMDB Episode details
 */
export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  still_path?: string;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;
  production_code?: string;
  episode_type?: string;
  show_id?: number;
}

/**
 * TMDB Episode external IDs
 */
export interface TmdbEpisodeExternalIds {
  id: number;
  imdb_id?: string;
  tvdb_id?: number;
  tvrage_id?: number;
}

/**
 * TMDB Season images response
 */
export interface TmdbSeasonImages {
  id: number;
  posters: TmdbImage[];
}

/**
 * TMDB Search Movie Result (used in search and popular endpoints)
 */
export interface TmdbSearchMovieResult {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
  genre_ids?: number[];
}

/**
 * TMDB Popular Movies Response
 */
export interface TmdbPopularMoviesResponse {
  page: number;
  results: TmdbSearchMovieResult[];
  total_results: number;
  total_pages: number;
}

/**
 * TMDB Search Show Result (used in search and popular endpoints)
 */
export interface TmdbSearchShowResult {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
}

/**
 * TMDB Popular Shows Response
 */
export interface TmdbPopularShowsResponse {
  page: number;
  results: TmdbSearchShowResult[];
  total_results: number;
  total_pages: number;
}
