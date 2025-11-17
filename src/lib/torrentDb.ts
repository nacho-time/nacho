/**
 * Torrent Database API
 * Functions for managing TMDB IDs and metadata for torrents
 */

import { invoke } from "@tauri-apps/api/core";

export type TorrentIdOrHash = number | { InfoHash: string };

export interface TorrentWithMetadata {
  torrent_id: number;
  info_hash: string;
  tmdb_id: number | null;
  media_type: string | null;
  imdb_code: string | null;
  name: string | null;
}

// Legacy type for backward compatibility
export interface TorrentWithImdb {
  torrent_id: number;
  info_hash: string;
  imdb_code: string | null;
}

export interface ApiAddTorrentResponse {
  id: number | null;
  details: {
    info_hash: string;
    name: string;
  };
}

/**
 * Add a torrent from a URL with an associated TMDB ID
 */
export async function createTorrentWithTmdb(
  url: string,
  tmdbId: number,
  mediaType: string,
  episodeInfo?: [number, number] | null,
  opts?: any
): Promise<ApiAddTorrentResponse> {
  return await invoke("torrent_create_with_tmdb", {
    url,
    tmdbId,
    mediaType,
    episodeInfo: episodeInfo || null,
    opts: opts || null,
  });
}

/**
 * Set or update the TMDB ID for an existing torrent
 */
export async function setTorrentTmdbId(
  id: TorrentIdOrHash,
  tmdbId: number | null,
  mediaType: string | null
): Promise<void> {
  await invoke("set_torrent_tmdb_id", {
    id,
    tmdbId,
    mediaType,
  });
}

/**
 * Get the TMDB ID and media type for a specific torrent
 */
export async function getTorrentTmdbId(
  id: TorrentIdOrHash
): Promise<{ tmdb_id: number; media_type: string } | null> {
  try {
    const result: [number, string] = await invoke("get_torrent_tmdb_id", {
      id,
    });
    return { tmdb_id: result[0], media_type: result[1] };
  } catch (e) {
    return null;
  }
}

/**
 * Get all torrents with their metadata (TMDB IDs, media types, etc.)
 */
export async function getAllTorrentsWithMetadata(): Promise<
  TorrentWithMetadata[]
> {
  return await invoke("get_all_torrents_with_metadata");
}

/**
 * Get all torrents with their IMDB codes (legacy compatibility)
 * @deprecated Use getAllTorrentsWithMetadata instead
 */
export async function getAllTorrentsWithImdb(): Promise<TorrentWithImdb[]> {
  const metadata = await getAllTorrentsWithMetadata();
  return metadata.map((t) => ({
    torrent_id: t.torrent_id,
    info_hash: t.info_hash,
    imdb_code: t.imdb_code,
  }));
}

/**
 * Validate IMDB code format (e.g., "tt1234567")
 */
export function isValidImdbCode(code: string): boolean {
  return /^tt\d{7,8}$/.test(code);
}

/**
 * Extract IMDB code from a string (torrent name, URL, etc.)
 */
export function extractImdbCode(text: string): string | null {
  const match = text.match(/tt\d{7,8}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Format IMDB code to ensure lowercase 'tt' prefix
 */
export function formatImdbCode(code: string): string {
  return code.toLowerCase().replace(/^tt/, "tt");
}
