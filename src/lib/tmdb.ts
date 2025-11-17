import { invoke } from "@tauri-apps/api/core";
import type {
  TmdbMovie,
  TmdbMovieImages,
  TmdbConfiguration,
} from "../types/tmdb";

/**
 * Get TMDB configuration including image base URLs and available sizes
 */
export async function getTmdbConfig(): Promise<TmdbConfiguration> {
  return await invoke<TmdbConfiguration>("get_tmdb_config");
}

/**
 * Get movie details by TMDB ID
 */
export async function getTmdbMovie(tmdbId: number): Promise<TmdbMovie> {
  return await invoke<TmdbMovie>("get_tmdb_movie", { tmdbId });
}

/**
 * Get movie images by TMDB ID
 */
export async function getTmdbMovieImages(
  tmdbId: number
): Promise<TmdbMovieImages> {
  return await invoke<TmdbMovieImages>("get_tmdb_movie_images", { tmdbId });
}

/**
 * Find movie by IMDB ID
 */
export async function findTmdbMovieByImdb(imdbId: string): Promise<TmdbMovie> {
  return await invoke<TmdbMovie>("find_tmdb_movie_by_imdb", { imdbId });
}

/**
 * Build a full TMDB image URL
 * @param filePath - The file path from TMDB API (e.g., "/abc123.jpg")
 * @param size - Optional size (e.g., "w500", "original"). Defaults to "original"
 */
export async function buildTmdbImageUrl(
  filePath: string,
  size?: string
): Promise<string> {
  return await invoke<string>("build_tmdb_image_url", { filePath, size });
}

/**
 * Build a TMDB image URL directly without calling the backend
 * @param filePath - The file path from TMDB API (e.g., "/abc123.jpg")
 * @param size - Optional size (e.g., "w500", "original"). Defaults to "original"
 */
export function buildTmdbImageUrlSync(
  filePath: string,
  size: string = "original"
): string {
  return `https://image.tmdb.org/t/p/${size}${filePath}`;
}

/**
 * Get available poster sizes
 */
export async function getPosterSizes(): Promise<string[]> {
  return await invoke<string[]>("get_poster_sizes");
}

/**
 * Get available backdrop sizes
 */
export async function getBackdropSizes(): Promise<string[]> {
  return await invoke<string[]>("get_backdrop_sizes");
}

/**
 * Get the best poster URL for a movie
 * @param posterPath - The poster path from TMDB
 * @param size - Desired size (defaults to w500 for good quality/size balance)
 */
export function getPosterUrl(
  posterPath: string | null | undefined,
  size: string = "w500"
): string | null {
  if (!posterPath) return null;
  return buildTmdbImageUrlSync(posterPath, size);
}

/**
 * Get the best backdrop URL for a movie
 * @param backdropPath - The backdrop path from TMDB
 * @param size - Desired size (defaults to w1280 for good quality)
 */
export function getBackdropUrl(
  backdropPath: string | null | undefined,
  size: string = "w1280"
): string | null {
  if (!backdropPath) return null;
  return buildTmdbImageUrlSync(backdropPath, size);
}

/**
 * Fetch movie details with images by TMDB ID
 */
export async function getMovieWithImages(tmdbId: number): Promise<{
  movie: TmdbMovie;
  images: TmdbMovieImages;
}> {
  const [movie, images] = await Promise.all([
    getTmdbMovie(tmdbId),
    getTmdbMovieImages(tmdbId),
  ]);

  return { movie, images };
}

/**
 * Fetch movie details with images by IMDB ID
 */
export async function getMovieWithImagesByImdb(imdbId: string): Promise<{
  movie: TmdbMovie;
  images: TmdbMovieImages;
}> {
  const movie = await findTmdbMovieByImdb(imdbId);
  const images = await getTmdbMovieImages(movie.id);

  return { movie, images };
}
