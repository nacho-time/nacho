/**
 * Example usage of the Torrent Database API from the frontend
 * This file demonstrates how to interact with the torrent database
 * to manage IMDB codes for downloaded torrents.
 */

import { invoke } from "@tauri-apps/api/core";

// Type definitions
type TorrentIdOrHash = number | { InfoHash: string };

interface TorrentWithImdb {
  torrent_id: number;
  info_hash: string;
  imdb_code: string | null;
}

interface ApiAddTorrentResponse {
  id: number | null;
  details: {
    info_hash: string;
    name: string;
    // ... other fields
  };
}

/**
 * Add a torrent from a magnet link or URL with an IMDB code
 */
export async function addTorrentWithImdb(
  url: string,
  imdbCode: string
): Promise<ApiAddTorrentResponse> {
  return await invoke("torrent_create_with_imdb", {
    url,
    imdbCode,
    opts: null,
  });
}

/**
 * Set or update the IMDB code for an existing torrent
 */
export async function setTorrentImdbCode(
  id: TorrentIdOrHash,
  imdbCode: string | null
): Promise<void> {
  await invoke("set_torrent_imdb_code", {
    id,
    imdbCode,
  });
}

/**
 * Get the IMDB code for a specific torrent
 */
export async function getTorrentImdbCode(
  id: TorrentIdOrHash
): Promise<string | null> {
  return await invoke("get_torrent_imdb_code", { id });
}

/**
 * Get all torrents with their IMDB codes
 */
export async function getAllTorrentsWithImdb(): Promise<TorrentWithImdb[]> {
  return await invoke("get_all_torrents_with_imdb");
}

// ============================================================================
// EXAMPLE USAGE SCENARIOS
// ============================================================================

/**
 * Example 1: Download a movie torrent with IMDB code
 */
export async function downloadMovieExample() {
  try {
    const magnetLink = "magnet:?xt=urn:btih:abcd1234...";
    const imdbCode = "tt0111161"; // The Shawshank Redemption

    const response = await addTorrentWithImdb(magnetLink, imdbCode);
    console.log("Torrent added:", response);
  } catch (error) {
    console.error("Failed to add torrent:", error);
  }
}

/**
 * Example 2: Update IMDB code for an existing torrent
 */
export async function updateImdbCodeExample(torrentId: number) {
  try {
    await setTorrentImdbCode(torrentId, "tt0068646"); // The Godfather
    console.log("IMDB code updated");
  } catch (error) {
    console.error("Failed to update IMDB code:", error);
  }
}

/**
 * Example 3: Build a media library from torrents with IMDB codes
 */
export async function buildMediaLibrary() {
  try {
    const allTorrents = await getAllTorrentsWithImdb();

    // Filter to only torrents with IMDB codes
    const moviesWithMetadata = allTorrents.filter((t) => t.imdb_code !== null);

    console.log(`Found ${moviesWithMetadata.length} movies in library`);

    // You could now fetch movie details from OMDB API or similar
    for (const torrent of moviesWithMetadata) {
      const movieDetails = await fetchMovieDetails(torrent.imdb_code!);
      console.log(`${movieDetails.title} - ${movieDetails.year}`);
    }

    return moviesWithMetadata;
  } catch (error) {
    console.error("Failed to build media library:", error);
    return [];
  }
}

/**
 * Example 4: Associate IMDB code after manually adding a torrent
 */
export async function associateImdbAfterDownload() {
  try {
    // First, add the torrent normally (without IMDB code)
    const response: any = await invoke("torrent_create_from_url", {
      url: "magnet:?xt=urn:btih:xyz789...",
      opts: null,
    });

    if (!response.id) {
      throw new Error("Failed to get torrent ID");
    }

    // Then, set the IMDB code
    await setTorrentImdbCode(response.id, "tt0468569"); // The Dark Knight
    console.log("Torrent added and IMDB code associated");
  } catch (error) {
    console.error("Failed:", error);
  }
}

/**
 * Example 5: Remove IMDB code from a torrent
 */
export async function removeImdbCode(torrentId: number) {
  try {
    await setTorrentImdbCode(torrentId, null);
    console.log("IMDB code removed");
  } catch (error) {
    console.error("Failed to remove IMDB code:", error);
  }
}

/**
 * Example 6: Check if a torrent has an IMDB code
 */
export async function checkTorrentMetadata(torrentId: number) {
  try {
    const imdbCode = await getTorrentImdbCode(torrentId);

    if (imdbCode) {
      console.log(`Torrent ${torrentId} is associated with ${imdbCode}`);
      // Fetch and display movie details
      const details = await fetchMovieDetails(imdbCode);
      return details;
    } else {
      console.log(`Torrent ${torrentId} has no IMDB code`);
      return null;
    }
  } catch (error) {
    console.error("Failed to check metadata:", error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch movie details from OMDB API (example)
 */
async function fetchMovieDetails(imdbCode: string) {
  // This is a placeholder - you would need to integrate with an actual API
  // like OMDB (http://www.omdbapi.com/) or TMDB (https://www.themoviedb.org/)
  const apiKey = "your-api-key-here";
  const response = await fetch(
    `http://www.omdbapi.com/?i=${imdbCode}&apikey=${apiKey}`
  );
  return await response.json();
}

/**
 * Extract IMDB code from torrent name (simple heuristic)
 */
export function extractImdbFromName(torrentName: string): string | null {
  // Look for patterns like "tt1234567" in the torrent name
  const match = torrentName.match(/tt\d{7,8}/i);
  return match ? match[0] : null;
}

/**
 * Validate IMDB code format
 */
export function isValidImdbCode(code: string): boolean {
  return /^tt\d{7,8}$/.test(code);
}
