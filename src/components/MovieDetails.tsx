import {
  Component,
  createSignal,
  onMount,
  onCleanup,
  createEffect,
  Show,
  For,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { TmdbMovie, TmdbMovieImages } from "../types/tmdb";
import type { TorrentResult } from "../types/torrent";
import { getBackdropUrl, getPosterUrl } from "../lib/tmdb";

import { openUrl } from "@tauri-apps/plugin-opener";

interface MovieDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId?: number;
  imdbId?: string;
  traktSlug?: string;
  movieTitle: string;
}

const MovieDetails: Component<MovieDetailsProps> = (props) => {
  const [movieData, setMovieData] = createSignal<TmdbMovie | null>(null);
  const [movieImages, setMovieImages] = createSignal<TmdbMovieImages | null>(
    null
  );
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [trailerKey, setTrailerKey] = createSignal<string | null>(null);

  // Library files (already downloaded/downloading)
  const [libraryFiles, setLibraryFiles] = createSignal<any[]>([]);
  const [libraryLoading, setLibraryLoading] = createSignal(false);

  // Torrent search state
  const [torrents, setTorrents] = createSignal<TorrentResult[]>([]);
  const [torrentsLoading, setTorrentsLoading] = createSignal(false);
  const [torrentsError, setTorrentsError] = createSignal<string | null>(null);
  const [downloadingTorrent, setDownloadingTorrent] = createSignal<
    string | null
  >(null);

  // Filter state
  const [selectedQuality, setSelectedQuality] = createSignal<string | null>(
    null
  );
  const [selectedFileType, setSelectedFileType] = createSignal<string | null>(
    null
  );
  const [showDownloadWaitPopup, setShowDownloadWaitPopup] = createSignal(false);
  const [downloadWaitTimer, setDownloadWaitTimer] = createSignal<number | null>(
    null
  );

  // Helper functions for filtering
  const getQualityFromTitle = (title: string): string | null => {
    const titleLower = title.toLowerCase();
    if (titleLower.includes("2160p") || titleLower.includes("4k"))
      return "2160p";
    if (titleLower.includes("1080p")) return "1080p";
    if (titleLower.includes("720p")) return "720p";
    return null;
  };

  const getFileTypeFromTitle = (title: string): string | null => {
    const titleLower = title.toLowerCase();
    if (titleLower.includes(".mkv") || titleLower.includes("mkv")) return "mkv";
    if (titleLower.includes(".mp4") || titleLower.includes("mp4")) return "mp4";
    return null;
  };

  const filteredTorrents = () => {
    let filtered = torrents();

    // Filter by quality
    if (selectedQuality()) {
      filtered = filtered.filter(
        (t) => getQualityFromTitle(t.title) === selectedQuality()
      );
    }

    // Filter by file type
    if (selectedFileType()) {
      filtered = filtered.filter(
        (t) => getFileTypeFromTitle(t.title) === selectedFileType()
      );
    }

    return filtered;
  };

  // Count torrents by quality
  const qualityCounts = () => {
    const counts = { "720p": 0, "1080p": 0, "2160p": 0 };
    torrents().forEach((t) => {
      const quality = getQualityFromTitle(t.title);
      if (quality && quality in counts) {
        counts[quality as keyof typeof counts]++;
      }
    });
    return counts;
  };

  // Count torrents by file type
  const fileTypeCounts = () => {
    const counts = { mkv: 0, mp4: 0 };
    torrents().forEach((t) => {
      const fileType = getFileTypeFromTitle(t.title);
      if (fileType && fileType in counts) {
        counts[fileType as keyof typeof counts]++;
      }
    });
    return counts;
  };

  const fetchMovieDetails = async () => {
    if (!props.tmdbId && !props.imdbId) {
      setError("No movie ID provided");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let movie: TmdbMovie;

      if (props.tmdbId) {
        movie = await invoke<TmdbMovie>("get_tmdb_movie", {
          tmdbId: props.tmdbId,
        });
      } else if (props.imdbId) {
        movie = await invoke<TmdbMovie>("find_tmdb_movie_by_imdb", {
          imdbId: props.imdbId,
        });
      } else {
        throw new Error("No valid movie ID");
      }

      setMovieData(movie);

      // Fetch images
      const images = await invoke<TmdbMovieImages>("get_tmdb_movie_images", {
        tmdbId: movie.id,
      });
      setMovieImages(images);

      // Fetch videos/trailers
      try {
        const videos = await invoke<any[]>("get_tmdb_movie_videos", {
          tmdbId: movie.id,
        });
        // Find YouTube trailer
        const youtubeTrailer = videos.find(
          (v) =>
            v.site === "YouTube" &&
            (v.video_type === "Trailer" || v.type === "Trailer") &&
            v.key
        );
        if (youtubeTrailer) {
          setTrailerKey(youtubeTrailer.key);
        }
      } catch (e) {
        console.error("Failed to fetch trailers:", e);
      }
    } catch (e: any) {
      console.error("Failed to fetch movie details:", e);
      setError(e?.toString?.() ?? "Failed to load movie details");
    } finally {
      setLoading(false);
    }
  };

  const fetchLibraryFiles = async () => {
    if (!props.imdbId) return;

    try {
      setLibraryLoading(true);
      const files = await invoke<any[]>("get_library_files_by_imdb", {
        imdbId: props.imdbId,
      });
      setLibraryFiles(files);
    } catch (e: any) {
      console.error("Failed to fetch library files:", e);
    } finally {
      setLibraryLoading(false);
    }
  };

  const searchTorrents = async () => {
    if (!props.imdbId && !props.movieTitle) {
      setTorrentsError("No movie information available for torrent search");
      return;
    }

    try {
      setTorrentsLoading(true);
      setTorrentsError(null);
      console.log("Searching torrents for:", props.movieTitle || props.imdbId);

      const results = await invoke<TorrentResult[]>("search_torrents_by_imdb", {
        imdbId: props.imdbId || "",
        title: props.movieTitle,
      });

      console.log("Found", results.length, "torrents");
      setTorrents(results);
    } catch (e: any) {
      console.error("Failed to search torrents:", e);
      setTorrentsError(e?.toString?.() ?? "Failed to search torrents");
    } finally {
      setTorrentsLoading(false);
    }
  };

  const downloadTorrent = async (torrent: TorrentResult) => {
    // Set up a timer to show the wait popup after 5 seconds
    const timerId = window.setTimeout(() => {
      setShowDownloadWaitPopup(true);
    }, 5000);
    setDownloadWaitTimer(timerId);

    try {
      console.log("Starting download for torrent:", torrent.title);
      setDownloadingTorrent(torrent.download_url);

      const response = await invoke("download_torrent_from_prowlarr", {
        downloadUrl: torrent.download_url,
        tmdbId: props.tmdbId,
        mediaType: "movie",
        episodeInfo: null,
      });

      console.log("Torrent added successfully:", response);

      // Clear the timer and close popup if it was shown
      if (downloadWaitTimer()) {
        clearTimeout(downloadWaitTimer()!);
        setDownloadWaitTimer(null);
      }
      setShowDownloadWaitPopup(false);

      alert(
        `✅ Download started: ${torrent.title}\n\nCheck the Downloads tab to monitor progress.`
      );

      // Refresh library files after successful download
      await fetchLibraryFiles();
    } catch (e: any) {
      console.error("Failed to download torrent:", e);

      // Clear the timer and close popup on error
      if (downloadWaitTimer()) {
        clearTimeout(downloadWaitTimer()!);
        setDownloadWaitTimer(null);
      }
      setShowDownloadWaitPopup(false);

      alert(`❌ Failed to download: ${e?.toString?.() ?? "Unknown error"}`);
    } finally {
      setDownloadingTorrent(null);
    }
  }; // Fetch details when modal opens
  const [prevOpen, setPrevOpen] = createSignal(false);

  const checkAndFetch = () => {
    if (props.isOpen && !prevOpen()) {
      setPrevOpen(true);
      fetchMovieDetails();
      fetchLibraryFiles(); // Fetch library files
      searchTorrents(); // Also search for torrents when modal opens
    } else if (!props.isOpen && prevOpen()) {
      setPrevOpen(false);
    }
  };

  // Lock/unlock scroll when modal opens/closes
  createEffect(() => {
    if (props.isOpen) {
      // Lock scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      // Unlock scroll when modal is closed
      document.body.style.overflow = "";
    }
  });

  // Check on mount and periodically
  onMount(() => {
    checkAndFetch();
    const interval = setInterval(checkAndFetch, 100);

    // Cleanup on unmount
    onCleanup(() => {
      clearInterval(interval);
      // Ensure scroll is unlocked when component unmounts
      document.body.style.overflow = "";
    });
  });

  const backdropUrl = () => {
    const images = movieImages();
    if (images && images.backdrops.length > 0) {
      return getBackdropUrl(images.backdrops[0].file_path, "original");
    }
    const movie = movieData();
    if (movie?.backdrop_path) {
      return getBackdropUrl(movie.backdrop_path, "original");
    }
    return null;
  };

  const posterUrl = () => {
    const movie = movieData();
    if (movie?.poster_path) {
      return getPosterUrl(movie.poster_path, "w500");
    }
    return null;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "Unknown";
    const gb = bytes / 1024 / 1024 / 1024;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const formatRuntime = (minutes?: number) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (!props.isOpen) return null;

  return (
    <div class="fixed inset-0 z-[9999] overflow-y-auto bg-black/95">
      {/* Backdrop */}
      <div
        class="fixed inset-0 bg-black/90 backdrop-blur-sm"
        onClick={props.onClose}
      />

      {/* Content */}
      <div class="relative h-full flex items-center justify-center p-4">
        <div class="relative w-full h-full bg-neutral-900 rounded-lg overflow-auto shadow-2xl">
          {/* Close Button */}
          <button
            onClick={props.onClose}
            class="fixed top-10 right-15 z-50 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur-sm hover:scale-110"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <Show when={loading()}>
            <div class="flex items-center justify-center py-32">
              <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
            </div>
          </Show>

          <Show when={error()}>
            <div class="p-8 text-center">
              <div class="text-red-400 mb-4">{error()}</div>
              <button
                onClick={fetchMovieDetails}
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </Show>

          <Show when={!loading() && !error() && movieData()}>
            {/* Backdrop Image - Much Taller */}
            <div class="relative h-[60vh] overflow-hidden">
              <Show
                when={backdropUrl()}
                fallback={
                  <div class="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
                }
              >
                <img
                  src={backdropUrl()!}
                  alt={movieData()!.title}
                  class="absolute inset-0 w-full h-full object-cover"
                />
              </Show>
              {/* Gradient Overlay */}
              <div class="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/70 to-transparent" />
            </div>

            {/* Content - Scrollable */}
            <div class="relative -mt-120 px-8 pb-8 overflow-y-auto">
              <div class="flex gap-8">
                {/* Poster - Larger */}
                <div class="flex-shrink-0">
                  <Show
                    when={posterUrl()}
                    fallback={
                      <div class="w-64 h-96 bg-neutral-800 rounded-lg flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-20 w-20 text-neutral-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1"
                            d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                          />
                        </svg>
                      </div>
                    }
                  >
                    <img
                      src={posterUrl()!}
                      alt={movieData()!.title}
                      class="w-64 h-96 object-cover rounded-lg shadow-2xl border-2 border-neutral-700"
                    />
                  </Show>
                </div>

                {/* Movie Info */}
                <div class="flex-1 min-w-0">
                  {/* Title */}
                  <h1 class="text-5xl font-bold text-white mb-3 aileron-black leading-tight">
                    {movieData()!.title}
                  </h1>

                  {/* Tagline */}
                  <Show when={movieData()!.tagline}>
                    <p class="ms-1 text-xl text-neutral-400 mb-6 aileron-black">
                      {movieData()!.tagline}
                    </p>
                  </Show>

                  {/* Meta Information */}
                  <div class="flex flex-wrap items-center gap-4 mb-6 text-base">
                    <Show when={movieData()!.release_date}>
                      <div class="flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 text-neutral-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                            clip-rule="evenodd"
                          />
                        </svg>
                        <span class="text-neutral-300">
                          {formatDate(movieData()!.release_date)}
                        </span>
                      </div>
                    </Show>

                    <Show when={movieData()!.runtime}>
                      <div class="flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 text-neutral-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                            clip-rule="evenodd"
                          />
                        </svg>
                        <span class="text-neutral-300">
                          {formatRuntime(movieData()!.runtime)}
                        </span>
                      </div>
                    </Show>

                    <Show when={movieData()!.vote_average}>
                      <div class="flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-yellow-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span class="text-yellow-400 font-semibold">
                          {movieData()!.vote_average?.toFixed(1)}
                        </span>
                        <span class="text-neutral-500">
                          ({movieData()!.vote_count} votes)
                        </span>
                      </div>
                    </Show>

                    <Show when={movieData()!.status}>
                      <span class="px-3 py-1 bg-blue-900/40 text-blue-400 rounded-full text-xs font-medium">
                        {movieData()!.status}
                      </span>
                    </Show>
                  </div>

                  {/* Genres */}
                  <Show
                    when={
                      movieData()!.genres && movieData()!.genres!.length > 0
                    }
                  >
                    <div class="flex flex-wrap gap-2 mb-6">
                      <For each={movieData()!.genres}>
                        {(genre) => (
                          <span class="px-3 py-1 bg-neutral-800 text-neutral-300 rounded-full text-sm border border-neutral-700">
                            {genre.name}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>

                  {/* Overview */}
                  <Show when={movieData()!.overview}>
                    <div class="mb-6">
                      <h2 class="text-xl font-semibold text-white mb-2">
                        Synopsis
                      </h2>
                      <p class="text-neutral-300 leading-relaxed">
                        {movieData()!.overview}
                      </p>
                    </div>
                  </Show>

                  {/* Links */}
                  <div class="flex flex-wrap gap-3">
                    <Show when={props.imdbId}>
                      <button
                        onClick={() =>
                          openUrl(`https://www.imdb.com/title/${props.imdbId}`)
                        }
                        class="px-4 py-2 bg-gradient-to-r from-cyan-500 via-cyan-500 to-blue-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition-[filter] duration-200"
                      >
                        <span>View on IMDB</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                      </button>
                    </Show>

                    <Show when={props.traktSlug}>
                      <button
                        onClick={() =>
                          openUrl(`https://trakt.tv/movies/${props.traktSlug}`)
                        }
                        class="px-4 py-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition-[filter] duration-200"
                      >
                        <span>View on Trakt</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                      </button>
                    </Show>

                    <Show when={trailerKey()}>
                      <button
                        onClick={() =>
                          openUrl(
                            `https://www.youtube.com/watch?v=${trailerKey()}`
                          )
                        }
                        class="px-4 py-2 bg-gradient-to-r from-purple-500 via-purple-500 to-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition-[filter] duration-200"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                        </svg>
                        <span>Watch Trailer</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                      </button>
                    </Show>
                  </div>

                  {/* Library Files Section */}
                  <Show when={props.imdbId}>
                    <div class="mt-8 pt-8 border-t border-neutral-700">
                      <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-6 w-6 text-green-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        In Your Library
                      </h2>

                      <Show when={libraryLoading()}>
                        <div class="flex items-center justify-center py-4">
                          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mr-2"></div>
                          <span class="text-neutral-400 text-sm">
                            Checking library...
                          </span>
                        </div>
                      </Show>

                      <Show
                        when={!libraryLoading() && libraryFiles().length > 0}
                      >
                        <div class="space-y-3">
                          <For each={libraryFiles()}>
                            {(file) => (
                              <div class="bg-green-900/20 border border-green-700 rounded-lg p-4">
                                <div class="flex items-center gap-3">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-5 w-5 text-green-400 flex-shrink-0"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fill-rule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clip-rule="evenodd"
                                    />
                                  </svg>
                                  <div class="flex-1">
                                    <div class="text-white font-medium">
                                      {file.name ||
                                        `Torrent ID: ${file.torrent_id}`}
                                    </div>
                                    <div class="text-neutral-400 text-sm">
                                      {file.info_hash}
                                    </div>
                                  </div>
                                  <span class="px-3 py-1 bg-green-900/40 text-green-400 rounded-full text-xs font-medium">
                                    In Library
                                  </span>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>

                      <Show
                        when={!libraryLoading() && libraryFiles().length === 0}
                      >
                        <div class="text-neutral-500 text-sm bg-neutral-800/40 rounded-lg p-4 border border-neutral-700">
                          This movie is not in your library yet.
                        </div>
                      </Show>
                    </div>
                  </Show>

                  {/* Torrents Section */}
                  <div class="mt-8 pt-8 border-t border-neutral-700">
                    <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                      </svg>
                      Available Torrents
                    </h2>

                    {/* Filter Controls */}
                    <Show when={!torrentsLoading() && torrents().length > 0}>
                      <div class="mb-6 space-y-4">
                        {/* Quality Filter */}
                        <div>
                          <div class="text-sm text-neutral-400 mb-2 font-medium">
                            Quality
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedQuality(null)}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                selectedQuality() === null
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              All ({torrents().length})
                            </button>
                            <button
                              onClick={() => setSelectedQuality("720p")}
                              disabled={qualityCounts()["720p"] === 0}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                selectedQuality() === "720p"
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              720p ({qualityCounts()["720p"]})
                            </button>
                            <button
                              onClick={() => setSelectedQuality("1080p")}
                              disabled={qualityCounts()["1080p"] === 0}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                selectedQuality() === "1080p"
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              1080p ({qualityCounts()["1080p"]})
                            </button>
                            <button
                              onClick={() => setSelectedQuality("2160p")}
                              disabled={qualityCounts()["2160p"] === 0}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                selectedQuality() === "2160p"
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              2160p / 4K ({qualityCounts()["2160p"]})
                            </button>
                          </div>
                        </div>

                        {/* File Type Filter */}
                        <div>
                          <div class="text-sm text-neutral-400 mb-2 font-medium">
                            File Type
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedFileType(null)}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                selectedFileType() === null
                                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              All ({torrents().length})
                            </button>
                            <button
                              onClick={() => setSelectedFileType("mp4")}
                              disabled={fileTypeCounts().mp4 === 0}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                selectedFileType() === "mp4"
                                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              MP4 ({fileTypeCounts().mp4})
                            </button>
                            <button
                              onClick={() => setSelectedFileType("mkv")}
                              disabled={fileTypeCounts().mkv === 0}
                              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                selectedFileType() === "mkv"
                                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              MKV ({fileTypeCounts().mkv})
                            </button>
                          </div>
                        </div>

                        {/* Active filters summary */}
                        <Show when={selectedQuality() || selectedFileType()}>
                          <div class="flex items-center gap-2 text-sm">
                            <span class="text-neutral-400">
                              Showing {filteredTorrents().length} of{" "}
                              {torrents().length} torrents
                            </span>
                            <button
                              onClick={() => {
                                setSelectedQuality(null);
                                setSelectedFileType(null);
                              }}
                              class="text-blue-400 hover:text-blue-300 underline"
                            >
                              Clear filters
                            </button>
                          </div>
                        </Show>
                      </div>
                    </Show>

                    <Show when={torrentsLoading()}>
                      <div class="flex items-center justify-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                        <span class="text-neutral-400">
                          Searching for torrents...
                        </span>
                      </div>
                    </Show>

                    <Show when={torrentsError()}>
                      <div class="text-amber-400 bg-amber-950/40 border border-amber-700 rounded p-4">
                        <div class="flex items-center gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          <span class="text-sm">{torrentsError()}</span>
                        </div>
                      </div>
                    </Show>

                    <Show
                      when={
                        !torrentsLoading() &&
                        !torrentsError() &&
                        torrents().length === 0
                      }
                    >
                      <div class="text-neutral-400 text-center py-8 bg-neutral-800/40 rounded-lg border border-neutral-700">
                        No torrents found for this movie.
                      </div>
                    </Show>

                    <Show
                      when={
                        !torrentsLoading() &&
                        !torrentsError() &&
                        torrents().length > 0
                      }
                    >
                      <Show
                        when={filteredTorrents().length === 0}
                        fallback={
                          <div class="space-y-3 max-h-96 overflow-y-auto pr-2">
                            <For each={filteredTorrents()}>
                              {(torrent) => (
                                <div class="bg-neutral-800/60 border border-neutral-700 rounded-lg p-4 hover:border-blue-500 transition-colors">
                                  <div class="flex items-start justify-between gap-4">
                                    <div class="flex-1 min-w-0">
                                      <h3 class="text-white font-medium mb-2 line-clamp-2">
                                        {torrent.title}
                                      </h3>
                                      <div class="flex flex-wrap items-center gap-4 text-sm">
                                        <div class="flex items-center gap-1 text-green-400">
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                          >
                                            <path
                                              fill-rule="evenodd"
                                              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                                              clip-rule="evenodd"
                                            />
                                          </svg>
                                          <span class="font-semibold">
                                            {torrent.seeders}
                                          </span>
                                          <span class="text-neutral-400">
                                            seeders
                                          </span>
                                        </div>
                                        <div class="flex items-center gap-1 text-blue-400">
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                          >
                                            <path
                                              fill-rule="evenodd"
                                              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                              clip-rule="evenodd"
                                            />
                                          </svg>
                                          <span class="font-semibold">
                                            {torrent.peers}
                                          </span>
                                          <span class="text-neutral-400">
                                            peers
                                          </span>
                                        </div>
                                        <div class="flex items-center gap-1 text-neutral-300">
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                          >
                                            <path
                                              fill-rule="evenodd"
                                              d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z"
                                              clip-rule="evenodd"
                                            />
                                          </svg>
                                          <span>
                                            {formatFileSize(torrent.size)}
                                          </span>
                                        </div>
                                        <div class="text-neutral-500 text-xs">
                                          <span class="px-2 py-1 bg-neutral-700 rounded">
                                            {torrent.indexer}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    <div class="flex gap-2">
                                      <button
                                        onClick={() => downloadTorrent(torrent)}
                                        disabled={
                                          downloadingTorrent() ===
                                          torrent.download_url
                                        }
                                        class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:from-neutral-600 disabled:to-neutral-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-[filter,background-color] duration-200 flex items-center gap-2"
                                        title="Download and add to queue"
                                      >
                                        <Show
                                          when={
                                            downloadingTorrent() !==
                                            torrent.download_url
                                          }
                                          fallback={
                                            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                          }
                                        >
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                          >
                                            <path
                                              fill-rule="evenodd"
                                              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                              clip-rule="evenodd"
                                            />
                                          </svg>
                                        </Show>
                                        {downloadingTorrent() ===
                                        torrent.download_url
                                          ? "Downloading..."
                                          : "Download"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        }
                      >
                        <div class="text-neutral-400 text-center py-8 bg-neutral-800/40 rounded-lg border border-neutral-700">
                          No torrents match the selected filters.
                        </div>
                      </Show>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>

        {/* Download Wait Popup */}
        <Show when={showDownloadWaitPopup()}>
          <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* Popup Content */}
            <div class="relative bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-xl shadow-2xl border border-neutral-700 max-w-md w-full p-6 animate-fadeIn">
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowDownloadWaitPopup(false);
                  if (downloadWaitTimer()) {
                    clearTimeout(downloadWaitTimer()!);
                    setDownloadWaitTimer(null);
                  }
                }}
                class="absolute top-3 right-3 p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* Icon */}
              <div class="flex justify-center mb-4">
                <div class="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-8 w-8 text-blue-400"
                    style="animation: spin 1s linear infinite reverse;"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
              </div>

              {/* Title */}
              <h3 class="text-xl font-bold text-white text-center mb-2">
                Setting Up Download
              </h3>

              {/* Message */}
              <p class="text-neutral-300 text-center mb-4">
                We're connecting to the torrent indexer and setting up your
                download. This process may take a minute or two while we locate
                peers.
              </p>

              {/* Info Box */}
              <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
                <div class="flex items-start gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div class="text-sm text-blue-200">
                    <p class="font-medium mb-1">Please wait while we:</p>
                    <ul class="list-disc list-inside space-y-1 text-blue-300/90">
                      <li>Contact the torrent indexer</li>
                      <li>Retrieve download information</li>
                      <li>Locate available peers</li>
                      <li>Add the torrent to your queue</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default MovieDetails;
