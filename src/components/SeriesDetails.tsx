import {
  Component,
  Show,
  createSignal,
  onMount,
  createEffect,
  For,
  onCleanup,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type {
  TmdbShow,
  TmdbShowImages,
  TmdbSeason,
  TmdbEpisode,
  TmdbEpisodeExternalIds,
  TmdbSeasonImages,
} from "../types/tmdb";
import type { TorrentResult } from "../types/torrent";
import { getPosterUrl, getBackdropUrl } from "../lib/tmdb";
import {
  getShowHistory,
  getWatchedEpisodes,
  type ShowHistory,
} from "../lib/userHistoryStore";
import DownloadProgressPopup from "./DownloadProgressPopup";

interface SeriesDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId?: number;
  imdbId?: string;
  traktSlug?: string;
  showTitle: string;
}

const SeriesDetails: Component<SeriesDetailsProps> = (props) => {
  const [showData, setShowData] = createSignal<TmdbShow | null>(null);
  const [showImages, setShowImages] = createSignal<TmdbShowImages | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Season/Episode state
  const [seasons, setSeasons] = createSignal<TmdbSeason[]>([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] =
    createSignal<number>(1);
  const [selectedSeason, setSelectedSeason] = createSignal<TmdbSeason | null>(
    null
  );
  const [selectedEpisode, setSelectedEpisode] =
    createSignal<TmdbEpisode | null>(null);
  const [episodeExternalIds, setEpisodeExternalIds] =
    createSignal<TmdbEpisodeExternalIds | null>(null);
  const [loadingSeason, setLoadingSeason] = createSignal(false);
  const [seasonImages, setSeasonImages] = createSignal<
    Record<number, TmdbSeasonImages>
  >({});

  // Quality selector and torrent search state
  const [selectedQuality, setSelectedQuality] = createSignal<
    "720p" | "1080p" | "2160p"
  >("1080p");
  const [torrents, setTorrents] = createSignal<TorrentResult[]>([]);
  const [loadingTorrents, setLoadingTorrents] = createSignal(false);
  const [torrentError, setTorrentError] = createSignal<string | null>(null);
  const [downloadingTorrent, setDownloadingTorrent] = createSignal<
    string | null
  >(null);
  const [strictEpisodeFilter, setStrictEpisodeFilter] = createSignal(true);
  const [showDownloadWaitPopup, setShowDownloadWaitPopup] = createSignal(false);
  const [downloadWaitTimer, setDownloadWaitTimer] = createSignal<number | null>(
    null
  );
  const [showTorrentList, setShowTorrentList] = createSignal(false);
  const [showDownloadProgressPopup, setShowDownloadProgressPopup] =
    createSignal(false);
  const [selectedTorrentForDownload, setSelectedTorrentForDownload] =
    createSignal<TorrentResult | null>(null);

  // Filtered torrents based on strict episode filter
  const filteredTorrents = () => {
    const allTorrents = torrents();
    if (!strictEpisodeFilter() || !selectedEpisode()) return allTorrents;

    const episode = selectedEpisode()!;
    const seasonStr = String(episode.season_number).padStart(2, "0");
    const episodeStr = String(episode.episode_number).padStart(2, "0");
    const episodeId = `S${seasonStr}E${episodeStr}`;

    return allTorrents.filter((torrent) =>
      torrent.title.toUpperCase().includes(episodeId.toUpperCase())
    );
  };

  // Watch history tracking
  const [watchedEpisodes, setWatchedEpisodes] = createSignal<Set<string>>(
    new Set()
  );

  // Local store watch history
  const [localShowHistory, setLocalShowHistory] =
    createSignal<ShowHistory | null>(null);

  // Library files tracking - Set of available IMDB IDs
  const [availableImdbIds, setAvailableImdbIds] = createSignal<Set<string>>(
    new Set()
  );

  // Episode IMDB ID mapping (season_episode -> imdb_id)
  const [episodeImdbIds, setEpisodeImdbIds] = createSignal<Map<string, string>>(
    new Map()
  );

  // Refs for episode elements to enable scrolling
  let episodeRefs: { [key: number]: HTMLDivElement | undefined } = {};
  let seasonRefs: { [key: number]: HTMLButtonElement | undefined } = {};

  const scrollToEpisode = (episodeId: number) => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const element = episodeRefs[episodeId];
      if (element) {
        console.log("Scrolling to episode:", episodeId);
        element.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } else {
        console.warn("Episode element not found for scrolling:", episodeId);
      }
    });
  };

  const scrollToSeason = (seasonNumber: number) => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const element = seasonRefs[seasonNumber];
      if (element) {
        console.log("Scrolling to season:", seasonNumber);
        element.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } else {
        console.warn("Season element not found for scrolling:", seasonNumber);
      }
    });
  };

  const fetchShowDetails = async () => {
    if (!props.tmdbId) return;

    try {
      setLoading(true);
      setError(null);

      const [showDetails, images] = await Promise.all([
        invoke<TmdbShow>("get_tmdb_show", {
          tmdbId: props.tmdbId,
        }),
        invoke<TmdbShowImages>("get_tmdb_show_images", {
          tmdbId: props.tmdbId,
        }).catch(() => null), // Don't fail if images aren't available
      ]);

      setShowData(showDetails);
      if (images) {
        setShowImages(images);
      }

      // Build seasons array from number_of_seasons
      if (showDetails.number_of_seasons && showDetails.number_of_seasons > 0) {
        const seasonsArray: TmdbSeason[] = [];
        for (let i = 1; i <= showDetails.number_of_seasons; i++) {
          seasonsArray.push({
            id: i,
            season_number: i,
            name: `Season ${i}`,
            episode_count: 0,
            air_date: undefined,
            overview: undefined,
            poster_path: undefined,
            episodes: [],
          });
        }
        setSeasons(seasonsArray);
      }

      // Fetch watch history first
      await fetchWatchHistory();

      // Determine which season to load based on watch history
      if (showDetails.number_of_seasons && showDetails.number_of_seasons > 0) {
        let seasonToLoad = 1; // Default to season 1

        // Check if we have local history to determine the best starting season
        const history = localShowHistory();
        if (history?.latestEpisode) {
          // Start on the season of the latest watched episode
          seasonToLoad = history.latestEpisode.season;
          console.log(
            `[SeriesDetails] Starting on season ${seasonToLoad} based on watch history`
          );
        }

        // Make sure the season is valid
        if (seasonToLoad > showDetails.number_of_seasons) {
          seasonToLoad = showDetails.number_of_seasons;
        }

        setSelectedSeasonNumber(seasonToLoad);
        await fetchSeasonDetails(seasonToLoad);

        // Scroll to the selected season after a short delay to ensure DOM is ready
        setTimeout(() => scrollToSeason(seasonToLoad), 300);
      }
    } catch (e: any) {
      console.error("Failed to fetch show details:", e);
      setError(e?.toString?.() ?? "Failed to load show details");
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasonDetails = async (seasonNumber: number) => {
    const show = showData();
    if (!show) return;

    try {
      setLoadingSeason(true);

      // Fetch season details and images in parallel
      const [season, images] = await Promise.all([
        invoke<TmdbSeason>("get_tmdb_season", {
          tmdbId: show.id,
          seasonNumber: seasonNumber,
        }),
        invoke<TmdbSeasonImages>("get_tmdb_season_images", {
          tmdbId: show.id,
          seasonNumber: seasonNumber,
        }).catch(() => null), // Don't fail if images aren't available
      ]);

      setSelectedSeason(season);

      // Store season images
      if (images) {
        setSeasonImages({ ...seasonImages(), [seasonNumber]: images });
      }

      // Find the next unwatched episode using intelligent logic
      if (season.episodes && season.episodes.length > 0) {
        let episodeToSelect = season.episodes[0]; // Default to first episode

        const history = localShowHistory();

        // If we have local history with a latest episode, use smart selection
        if (history?.latestEpisode) {
          const latestSeason = history.latestEpisode.season;
          const latestEpisode = history.latestEpisode.episode;

          console.log(
            `[SeriesDetails] Latest watched: S${latestSeason}E${latestEpisode}`
          );

          // If we're on the same season as the latest watched episode
          if (latestSeason === seasonNumber) {
            // Find the next episode after the latest watched
            const nextEpisode = season.episodes.find(
              (ep) =>
                ep.episode_number > latestEpisode &&
                !isEpisodeWatched(ep.season_number, ep.episode_number)
            );

            if (nextEpisode) {
              episodeToSelect = nextEpisode;
              console.log(
                `[SeriesDetails] Selected next episode: S${nextEpisode.season_number}E${nextEpisode.episode_number}`
              );
            } else {
              // All episodes after latest are watched, find first unwatched
              const firstUnwatched = season.episodes.find(
                (ep) => !isEpisodeWatched(ep.season_number, ep.episode_number)
              );
              episodeToSelect = firstUnwatched || season.episodes[0];
            }
          } else if (latestSeason < seasonNumber) {
            // We're on a later season, select first unwatched episode
            const firstUnwatched = season.episodes.find(
              (ep) => !isEpisodeWatched(ep.season_number, ep.episode_number)
            );
            episodeToSelect = firstUnwatched || season.episodes[0];
          } else {
            // We're on an earlier season, select first unwatched
            const firstUnwatched = season.episodes.find(
              (ep) => !isEpisodeWatched(ep.season_number, ep.episode_number)
            );
            episodeToSelect = firstUnwatched || season.episodes[0];
          }
        } else {
          // No local history, just find first unwatched episode
          const nextUnwatchedEpisode = season.episodes.find(
            (ep) => !isEpisodeWatched(ep.season_number, ep.episode_number)
          );
          episodeToSelect = nextUnwatchedEpisode || season.episodes[0];
        }

        setSelectedEpisode(episodeToSelect);

        // Fetch external IDs for the initially selected episode
        try {
          const externalIds = await invoke<TmdbEpisodeExternalIds>(
            "get_tmdb_episode_external_ids",
            {
              tmdbId: show.id,
              seasonNumber: episodeToSelect.season_number,
              episodeNumber: episodeToSelect.episode_number,
            }
          );
          setEpisodeExternalIds(externalIds);
        } catch (e: any) {
          console.error("Failed to fetch episode external IDs:", e);
          setEpisodeExternalIds(null);
        }

        searchTorrentsForEpisode(episodeToSelect);
      }

      // Fetch library files for this season
      await fetchLibraryFilesForSeason(season);
    } catch (e: any) {
      console.error("Failed to fetch season details:", e);
    } finally {
      setLoadingSeason(false);
    }
  };

  const fetchLibraryFilesForSeason = async (season: TmdbSeason) => {
    const show = showData();
    if (!show || !season?.episodes) return;

    try {
      const imdbIdMap = new Map<string, string>();

      // Fetch all library IMDB codes once
      const libraryImdbCodes = await invoke<string[]>(
        "get_all_library_imdb_codes"
      );
      setAvailableImdbIds(new Set(libraryImdbCodes));

      // Fetch episode IMDB IDs in parallel
      const episodePromises = season.episodes.map(async (episode) => {
        try {
          const externalIds = await invoke<TmdbEpisodeExternalIds>(
            "get_tmdb_episode_external_ids",
            {
              tmdbId: show.id,
              seasonNumber: episode.season_number,
              episodeNumber: episode.episode_number,
            }
          );
          if (externalIds?.imdb_id) {
            const key = `${episode.season_number}_${episode.episode_number}`;
            imdbIdMap.set(key, externalIds.imdb_id);
          }
        } catch (e) {
          // Episode might not have external IDs
        }
      });

      await Promise.all(episodePromises);
      setEpisodeImdbIds(imdbIdMap);
    } catch (e: any) {
      console.error("Failed to fetch library files:", e);
    }
  };

  const handleSeasonSelect = (seasonNumber: number) => {
    setSelectedSeasonNumber(seasonNumber);
    fetchSeasonDetails(seasonNumber);
  };

  const handleEpisodeSelect = async (episode: TmdbEpisode) => {
    setSelectedEpisode(episode);

    // Fetch episode external IDs
    try {
      const show = showData();
      if (show) {
        const externalIds = await invoke<TmdbEpisodeExternalIds>(
          "get_tmdb_episode_external_ids",
          {
            tmdbId: show.id,
            seasonNumber: episode.season_number,
            episodeNumber: episode.episode_number,
          }
        );
        setEpisodeExternalIds(externalIds);
      }
    } catch (e: any) {
      console.error("Failed to fetch episode external IDs:", e);
      setEpisodeExternalIds(null);
    }

    searchTorrentsForEpisode(episode);
  };

  const searchTorrentsForEpisode = async (episode: TmdbEpisode) => {
    const show = showData();
    if (!show) return;

    try {
      setLoadingTorrents(true);
      setTorrentError(null);
      setTorrents([]);

      // Format search query: "Show Name S01E01 1080p"
      const seasonNumber = String(episode.season_number).padStart(2, "0");
      const episodeNumber = String(episode.episode_number).padStart(2, "0");
      const quality = selectedQuality();
      const searchQuery = `${show.name} S${seasonNumber}E${episodeNumber} ${quality}`;

      console.log("Searching for torrents with query:", searchQuery);

      // Use the search_torrents_by_imdb command but with title search
      const results = await invoke<TorrentResult[]>("search_torrents_by_imdb", {
        imdbId: props.imdbId || "",
        title: searchQuery,
      });

      setTorrents(results);
    } catch (e: any) {
      console.error("Failed to search torrents:", e);
      setTorrentError(e?.toString?.() ?? "Failed to search for torrents");
    } finally {
      setLoadingTorrents(false);
    }
  };

  const handleDownloadTorrent = async (torrent: TorrentResult) => {
    // Set up a timer to show the wait popup after 5 seconds
    const timerId = window.setTimeout(() => {
      setShowDownloadWaitPopup(true);
    }, 5000);
    setDownloadWaitTimer(timerId);

    try {
      console.log("Starting download for torrent:", torrent.title);

      // Use show TMDB ID for proper tracking
      const tmdbId = props.tmdbId || null;

      console.log("Show TMDB ID:", tmdbId);

      if (!tmdbId) {
        console.warn(
          "No TMDB ID available, torrent will be saved without TMDB tracking"
        );
      }

      setDownloadingTorrent(torrent.download_url);

      // Get the current episode info
      const currentEpisode = selectedEpisode();
      const episodeInfo: [number, number] | null = currentEpisode
        ? [currentEpisode.season_number, currentEpisode.episode_number]
        : null;

      await invoke("download_torrent_from_prowlarr", {
        downloadUrl: torrent.download_url,
        tmdbId: tmdbId,
        mediaType: "tv",
        episodeInfo: episodeInfo,
      });

      console.log(
        "Torrent added successfully with TMDB ID:",
        tmdbId,
        "Episode:",
        episodeInfo
      );

      // Clear the timer and close popup if it was shown
      if (downloadWaitTimer()) {
        clearTimeout(downloadWaitTimer()!);
        setDownloadWaitTimer(null);
      }
      setShowDownloadWaitPopup(false);

      alert(
        `✅ Download started: ${torrent.title}\n\nCheck the Downloads tab to monitor progress.`
      );
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
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const handleAutoSelectTorrent = async () => {
    console.log("handleAutoSelectTorrent called");
    const torrents = filteredTorrents();
    console.log("Filtered torrents:", torrents.length);
    if (torrents.length === 0) {
      alert("No torrents available for auto-selection");
      return;
    }

    // Sort by seeders (descending) to get the best torrent
    const sortedTorrents = [...torrents].sort((a, b) => b.seeders - a.seeders);
    const bestTorrent = sortedTorrents[0];
    console.log("Best torrent selected:", bestTorrent.title);

    // Open the download progress popup instead of old flow
    setSelectedTorrentForDownload(bestTorrent);
    setShowDownloadProgressPopup(true);
    console.log("Popup state set to true");
  };

  const getBestTorrent = () => {
    const torrents = filteredTorrents();
    if (torrents.length === 0) return null;
    return [...torrents].sort((a, b) => b.seeders - a.seeders)[0];
  };

  const fetchWatchHistory = async () => {
    const tmdbId = showData()?.id || props.tmdbId;

    if (!tmdbId) {
      console.log("No TMDB ID available for watch history");
      return;
    }

    try {
      // Fetch watch history from new API
      interface EpisodeHistoryItem {
        tmdbID: number;
        season: number;
        episode: number;
        timestampWatched: string;
        timestampAdded: string;
      }

      const history = await invoke<EpisodeHistoryItem[]>(
        "get_show_watched_episodes",
        {
          tmdbId: tmdbId,
        }
      );

      console.log("Fetched watch history from API:", history);

      // Build a set of watched episode keys (season_episode)
      const watchedSet = new Set<string>();

      // Find the most recently watched episode from API by timestamp
      let latestEpisode: { season: number; episode: number } | null = null;
      let latestTimestamp: string | null = null;

      // Add episodes from API history
      history.forEach((item) => {
        const key = `${item.season}_${item.episode}`;
        watchedSet.add(key);

        // Track the most recently watched episode by timestamp (for continue watching)
        if (!latestTimestamp || item.timestampWatched > latestTimestamp) {
          latestTimestamp = item.timestampWatched;
          latestEpisode = {
            season: item.season,
            episode: item.episode,
          };
        }
      });

      // Also load from local store and merge
      const localHistory = await getShowHistory(tmdbId);
      if (localHistory?.latestEpisode) {
        console.log(
          `[SeriesDetails] Loaded local history for TMDB ${tmdbId}:`,
          localHistory
        );
        const localLatest = localHistory.latestEpisode;

        // Compare timestamps to see which is more recent
        if (!latestEpisode || !latestTimestamp) {
          latestEpisode = {
            season: localLatest.season,
            episode: localLatest.episode,
          };
        } else {
          // Use local if it has a more recent timestamp
          const localTime = localHistory.latestWatchTime || "";
          const apiTime = latestTimestamp as string;
          if (localTime > apiTime) {
            latestEpisode = {
              season: localLatest.season,
              episode: localLatest.episode,
            };
          }
        }
      }

      // Set the constructed local show history
      if (latestEpisode) {
        const constructedHistory: ShowHistory = {
          latestEpisode,
          latestWatchTime: latestTimestamp || new Date().toISOString(),
          watchedEpisodes: history.map((item) => ({
            season: item.season,
            episode: item.episode,
          })),
        };
        setLocalShowHistory(constructedHistory);
        console.log(
          `[SeriesDetails] Latest watched episode: S${latestEpisode.season}E${latestEpisode.episode}`
        );
      } else {
        setLocalShowHistory(null);
        console.log(`[SeriesDetails] No watch history found for show`);
      }

      // Also add episodes from local store
      const localWatchedEpisodes = await getWatchedEpisodes(tmdbId);
      localWatchedEpisodes.forEach((ep) => {
        const key = `${ep.season}_${ep.episode}`;
        watchedSet.add(key);
      });

      setWatchedEpisodes(watchedSet);
      console.log(`Loaded ${watchedSet.size} watched episodes for show`);
    } catch (e: any) {
      console.error("Failed to fetch watch history:", e);
      // Don't fail completely if watch history isn't available
    }
  };

  const isEpisodeWatched = (
    seasonNumber: number,
    episodeNumber: number
  ): boolean => {
    const key = `${seasonNumber}_${episodeNumber}`;
    return watchedEpisodes().has(key);
  };

  const isEpisodeDownloaded = (
    seasonNumber: number,
    episodeNumber: number
  ): boolean => {
    const key = `${seasonNumber}_${episodeNumber}`;
    const episodeImdbId = episodeImdbIds().get(key);
    if (!episodeImdbId) return false;
    return availableImdbIds().has(episodeImdbId);
  };

  const handlePlayEpisode = async (episode: TmdbEpisode) => {
    try {
      const seasonNumber = episode.season_number;
      const episodeNumber = episode.episode_number;
      const episodeId = `S${String(seasonNumber).padStart(2, "0")}E${String(
        episodeNumber
      ).padStart(2, "0")}`;

      const show = showData();
      if (!show) {
        alert("Show data not available");
        return;
      }

      // Get the episode IMDB ID from our map
      const key = `${seasonNumber}_${episodeNumber}`;
      const episodeImdbId = episodeImdbIds().get(key);

      if (!episodeImdbId) {
        alert(`No IMDB ID found for episode ${episodeId}`);
        return;
      }

      // Get the library files from the backend
      const files = await invoke<any[]>("get_library_files_by_imdb", {
        imdbId: episodeImdbId,
      });

      if (!files || files.length === 0) {
        alert(`Episode ${episodeId} is not downloaded`);
        return;
      }

      const torrent = files[0];
      console.log("Found torrent:", torrent);

      // Get the torrent files
      const details: any = await invoke("get_torrent_files", {
        id: torrent.torrent_id,
      });

      if (!details.files || details.files.length === 0) {
        alert("No files found in torrent");
        return;
      }

      // Find the video file (largest file or first video file)
      const videoExtensions = ["mp4", "mkv", "avi", "mov", "webm", "m4v"];
      let targetFileId = 0;

      const videoFiles = details.files.filter((f: any) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && videoExtensions.includes(ext);
      });

      if (videoFiles.length > 0) {
        // Use the largest video file
        const largestFile = videoFiles.reduce((largest: any, current: any) =>
          current.length > largest.length ? current : largest
        );
        targetFileId = details.files.findIndex(
          (f: any) => f.name === largestFile.name
        );
      }

      // Construct the stream URL
      const streamUrl = `http://localhost:3030/torrents/${torrent.torrent_id}/stream/${targetFileId}`;

      console.log(`Opening episode ${episodeId} in VLC:`, streamUrl);

      // Open VLC with the stream URL
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openPath(streamUrl, "vlc");

      // Mark as watched on Trakt
      await markEpisodeWatched(episode);
    } catch (e: any) {
      console.error("Failed to play episode:", e);
      alert(`Failed to play episode: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const markEpisodeWatched = async (episode: TmdbEpisode) => {
    try {
      const show = showData();

      if (!show) {
        alert("Show data not available");
        return;
      }

      // Add episode to watch history using new API
      await invoke("add_episode_to_history", {
        tmdbId: show.id,
        season: episode.season_number,
        episode: episode.episode_number,
        watchedAt: new Date().toISOString(),
      });

      // Refresh watch history to update the UI
      await fetchWatchHistory();

      // Refresh the season to update episode selection
      const currentSeason = selectedSeason();
      if (currentSeason) {
        await fetchSeasonDetails(currentSeason.season_number);
      }

      alert(`✅ Marked episode as watched: ${episode.name}`);
    } catch (e: any) {
      console.error("Failed to mark episode as watched:", e);
      alert(
        `❌ Failed to mark episode as watched: ${
          e?.toString?.() ?? "Unknown error"
        }`
      );
    }
  };

  // Watch for quality changes and re-search
  createEffect(() => {
    selectedQuality(); // Track quality changes
    const episode = selectedEpisode();
    if (episode) {
      searchTorrentsForEpisode(episode);
    }
  });

  // Scroll to selected episode when it changes and season is loaded
  createEffect(() => {
    const episode = selectedEpisode();
    const season = selectedSeason();
    const isLoading = loadingSeason();

    if (episode && season && !isLoading) {
      // Wait for DOM to update with episode elements
      scrollToEpisode(episode.id);
    }
  });

  // Handler for marking episode watched (called from popup)
  const handleMarkEpisodeWatched = async () => {
    const episode = selectedEpisode();
    if (!episode) return;

    try {
      const show = showData();
      if (!show) {
        throw new Error("Show data not available");
      }

      // Add episode to watch history using API
      await invoke("add_episode_to_history", {
        tmdbId: show.id,
        season: episode.season_number,
        episode: episode.episode_number,
        watchedAt: new Date().toISOString(),
      });

      console.log("Episode marked as watched");

      // Refresh watch history to update the UI
      await fetchWatchHistory();

      // Refresh the season to update episode selection
      const currentSeason = selectedSeason();
      if (currentSeason) {
        await fetchSeasonDetails(currentSeason.season_number);
      }
    } catch (e: any) {
      console.error("Failed to mark episode as watched:", e);
      throw e;
    }
  };

  // Fetch details when modal opens
  const [prevOpen, setPrevOpen] = createSignal(false);

  const checkAndFetch = () => {
    if (props.isOpen && !prevOpen()) {
      setPrevOpen(true);
      fetchShowDetails();
      // fetchWatchHistory will be called after fetchShowDetails completes
    } else if (!props.isOpen && prevOpen()) {
      setPrevOpen(false);
    }
  };

  // Lock/unlock scroll when modal opens/closes
  createEffect(() => {
    if (props.isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  });

  onMount(() => {
    checkAndFetch();
    const interval = setInterval(checkAndFetch, 100);

    onCleanup(() => {
      clearInterval(interval);
      document.body.style.overflow = "";
    });
  });

  const backdropUrl = () => {
    const images = showImages();
    if (images && images.backdrops.length > 0) {
      return getBackdropUrl(images.backdrops[0].file_path, "original");
    }
    const show = showData();
    if (show?.backdrop_path) {
      return getBackdropUrl(show.backdrop_path, "original");
    }
    return null;
  };

  const posterUrl = () => {
    const show = showData();
    if (show?.poster_path) {
      return getPosterUrl(show.poster_path, "w500");
    }
    return null;
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
    <div class="fixed inset-0 h-full z-[9999] overflow-y-auto bg-black/95">
      {/* Backdrop */}
      <div
        class="fixed inset-0 h-full bg-black/90 backdrop-blur-sm"
        onClick={props.onClose}
      />

      {/* Content */}
      <div class="relative h-full flex items-center justify-center p-2 sm:p-4">
        <div class="relative h-full w-full bg-neutral-900 rounded-lg overflow-auto shadow-2xl">
          {/* Close Button */}
          <button
            onClick={props.onClose}
            class="fixed top-4 sm:top-10 right-4 sm:right-15 z-50 p-2 sm:p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur-sm hover:scale-110"
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
                onClick={fetchShowDetails}
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </Show>

          <Show when={!loading() && !error() && showData()}>
            {/* Backdrop Image */}
            <div class="absolute inset-0 h-[80vh] overflow-hidden">
              <Show
                when={backdropUrl()}
                fallback={
                  <div class="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
                }
              >
                <img
                  src={backdropUrl()!}
                  alt={showData()!.name}
                  class="absolute inset-0 w-full h-full object-cover"
                />
              </Show>
              {/* Gradient Overlay */}
              <div class="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/70 to-transparent" />
            </div>

            {/* Content - Scrollable */}
            <div class="relative mt-36 px-4 sm:px-8 pb-8 overflow-y-auto">
              <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-8">
                {/* Poster */}
                <div class="flex-shrink-0 mx-auto sm:mx-0">
                  <Show
                    when={posterUrl()}
                    fallback={
                      <div class="fixed w-48 h-72 bg-neutral-800 rounded-lg flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-16 w-16 text-neutral-700"
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
                      alt={showData()!.name}
                      class="w-48 h-72 object-cover rounded-lg shadow-2xl border-2 border-neutral-700"
                    />
                  </Show>
                </div>

                {/* Show Info */}
                <div class="flex-1 min-w-0">
                  {/* Title */}
                  <h1 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
                    {showData()!.name}
                  </h1>

                  {/* Meta Information */}
                  <div class="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 text-xs sm:text-sm">
                    <Show when={showData()!.first_air_date}>
                      <div class="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-blue-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span class="text-neutral-300">
                          {formatDate(showData()!.first_air_date)}
                        </span>
                      </div>
                    </Show>

                    <Show when={showData()!.vote_average}>
                      <div class="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-yellow-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span class="text-yellow-400 font-medium">
                          {showData()!.vote_average?.toFixed(1)}
                        </span>
                      </div>
                    </Show>

                    <Show when={showData()!.status}>
                      <div class="px-3 py-1.5 bg-green-900/40 text-green-400 text-xs font-medium rounded border border-green-700">
                        {showData()!.status}
                      </div>
                    </Show>

                    <Show when={showData()!.number_of_seasons}>
                      <div class="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs font-medium rounded">
                        {showData()!.number_of_seasons} Seasons
                      </div>
                    </Show>

                    <Show when={showData()!.number_of_episodes}>
                      <div class="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs font-medium rounded">
                        {showData()!.number_of_episodes} Episodes
                      </div>
                    </Show>
                  </div>

                  {/* Genres */}
                  <Show
                    when={showData()!.genres && showData()!.genres!.length > 0}
                  >
                    <div class="flex flex-wrap gap-2 mb-4">
                      <For each={showData()!.genres}>
                        {(genre) => (
                          <span class="px-3 py-1 bg-blue-900/40 text-blue-300 text-xs font-medium rounded border border-blue-700">
                            {genre.name}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>

                  {/* Overview */}
                  <Show when={showData()!.overview}>
                    <div class="mb-6">
                      <h3 class="text-sm font-semibold text-neutral-400 mb-2">
                        Overview
                      </h3>
                      <p class="text-neutral-300 leading-relaxed">
                        {showData()!.overview}
                      </p>
                    </div>
                  </Show>

                  {/* Links */}
                  <div class="flex flex-wrap gap-3 mb-6">
                    <Show when={props.imdbId}>
                      <a
                        href={`https://www.imdb.com/title/${props.imdbId}`}
                        target="_blank"
                        rel="noopener noreferrer"
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
                      </a>
                    </Show>

                    <Show when={props.traktSlug}>
                      <a
                        href={`https://trakt.tv/shows/${props.traktSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
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
                      </a>
                    </Show>
                  </div>
                </div>
              </div>

              {/* Seasons and Episodes Section */}
              <div class="border-t border-neutral-700 pt-6">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <h2 class="text-xl sm:text-2xl font-semibold text-white">
                    Episodes
                  </h2>

                  {/* Quality Selector */}
                  <div class="flex items-center gap-2 sm:gap-3">
                    <span class="text-xs sm:text-sm text-neutral-400">
                      Quality:
                    </span>
                    <div class="flex gap-2">
                      <button
                        onClick={() => setSelectedQuality("720p")}
                        class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                        classList={{
                          "bg-blue-600 text-white":
                            selectedQuality() === "720p",
                          "bg-neutral-700 text-neutral-300 hover:bg-neutral-600":
                            selectedQuality() !== "720p",
                        }}
                      >
                        720p
                      </button>
                      <button
                        onClick={() => setSelectedQuality("1080p")}
                        class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                        classList={{
                          "bg-blue-600 text-white":
                            selectedQuality() === "1080p",
                          "bg-neutral-700 text-neutral-300 hover:bg-neutral-600":
                            selectedQuality() !== "1080p",
                        }}
                      >
                        1080p
                      </button>
                      <button
                        onClick={() => setSelectedQuality("2160p")}
                        class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                        classList={{
                          "bg-blue-600 text-white":
                            selectedQuality() === "2160p",
                          "bg-neutral-700 text-neutral-300 hover:bg-neutral-600":
                            selectedQuality() !== "2160p",
                        }}
                      >
                        4K (2160p)
                      </button>
                    </div>
                  </div>
                </div>

                <div class="flex flex-col lg:flex-row gap-6">
                  {/* Seasons List - Left Side */}
                  <div class="w-full lg:w-64 flex-shrink-0">
                    <h3 class="text-sm font-semibold text-neutral-400 mb-2 px-2">
                      Seasons
                    </h3>
                    <div class="bg-neutral-800/60 rounded-lg overflow-y-auto max-h-[30vh] lg:max-h-[50vh]">
                      <For each={seasons()}>
                        {(season) => {
                          const images = seasonImages()[season.season_number];
                          const posterPath =
                            images?.posters?.[0]?.file_path ||
                            selectedSeason()?.poster_path;

                          return (
                            <button
                              ref={(el) =>
                                (seasonRefs[season.season_number] = el)
                              }
                              onClick={() =>
                                handleSeasonSelect(season.season_number)
                              }
                              class="w-full text-left p-2 transition-colors border-l-4 flex items-center gap-3"
                              classList={{
                                "bg-blue-900/40 border-blue-500 text-blue-300":
                                  selectedSeasonNumber() ===
                                  season.season_number,
                                "border-transparent text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-300":
                                  selectedSeasonNumber() !==
                                  season.season_number,
                              }}
                            >
                              {/* Season Poster Thumbnail */}
                              <Show when={posterPath}>
                                <img
                                  src={getPosterUrl(posterPath!, "w154") || ""}
                                  alt={`Season ${season.season_number}`}
                                  class="w-12 h-18 object-cover rounded"
                                />
                              </Show>

                              <div class="flex-1">
                                <div class="font-medium">
                                  Season {season.season_number}
                                </div>
                                <Show
                                  when={
                                    selectedSeasonNumber() ===
                                      season.season_number &&
                                    selectedSeason()?.episode_count
                                  }
                                >
                                  <div class="text-xs text-neutral-500 mt-0.5">
                                    {selectedSeason()!.episode_count} episodes
                                  </div>
                                </Show>
                              </div>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  {/* Episodes List - Center */}
                  <div class="flex-1 min-w-0">
                    <h3 class="text-sm font-semibold text-neutral-400 mb-2 px-2">
                      Episodes
                    </h3>
                    <Show when={loadingSeason()}>
                      <div class="flex items-center justify-center h-[300px] lg:h-[460px]">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                      </div>
                    </Show>
                    <Show when={!loadingSeason() && selectedSeason()}>
                      <div class="bg-neutral-800/60 rounded-lg overflow-y-auto max-h-[60vh] lg:max-h-[50vh]">
                        <For each={selectedSeason()?.episodes || []}>
                          {(episode) => (
                            <div
                              ref={(el) => (episodeRefs[episode.id] = el)}
                              onClick={() => handleEpisodeSelect(episode)}
                              class="w-full text-left p-4 transition-colors duration-300 border-l-4 cursor-pointer group"
                              classList={{
                                "bg-blue-900/40 border-blue-500":
                                  selectedEpisode()?.id === episode.id,
                                "border-transparent hover:bg-neutral-700/60":
                                  selectedEpisode()?.id !== episode.id,
                                "bg-gradient-to-r from-purple-900/50 to-violet-900/50 border-purple-500/50":
                                  isEpisodeWatched(
                                    episode.season_number,
                                    episode.episode_number
                                  ),
                              }}
                            >
                              <div class="flex flex-col sm:flex-row gap-3">
                                {/* Episode Still Image */}
                                <div class="flex-shrink-0 w-full sm:w-40 h-32 sm:h-24 rounded overflow-hidden bg-neutral-900 relative">
                                  <Show
                                    when={episode.still_path}
                                    fallback={
                                      <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          class="h-8 w-8 text-neutral-700"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="1.5"
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                          />
                                        </svg>
                                      </div>
                                    }
                                  >
                                    <img
                                      src={
                                        getBackdropUrl(
                                          episode.still_path!,
                                          "w300"
                                        ) || ""
                                      }
                                      alt={episode.name}
                                      class="w-full h-full object-cover"
                                    />
                                  </Show>
                                </div>

                                {/* Episode Info */}
                                <div class="flex-1 min-w-0">
                                  <div class="flex items-start justify-between gap-2 mb-1">
                                    <div class="flex-1">
                                      <div
                                        class="font-medium text-sm"
                                        classList={{
                                          "text-blue-300":
                                            selectedEpisode()?.id ===
                                            episode.id,
                                          "text-neutral-300":
                                            selectedEpisode()?.id !==
                                            episode.id,
                                        }}
                                      >
                                        {episode.episode_number}. {episode.name}
                                      </div>
                                    </div>
                                    <Show when={episode.runtime}>
                                      <span class="text-xs text-neutral-500 flex-shrink-0">
                                        {episode.runtime}m
                                      </span>
                                    </Show>
                                  </div>

                                  <div class="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                                    <Show when={episode.air_date}>
                                      <span>
                                        {formatDate(episode.air_date)}
                                      </span>
                                    </Show>
                                    <Show when={episode.vote_average}>
                                      <span>•</span>
                                      <div class="flex items-center gap-1">
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          class="h-3 w-3 text-yellow-400"
                                          viewBox="0 0 20 20"
                                          fill="currentColor"
                                        >
                                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                        <span class="text-yellow-400">
                                          {episode.vote_average?.toFixed(1)}
                                        </span>
                                      </div>
                                    </Show>

                                    {/* Watched Label */}
                                    <Show
                                      when={isEpisodeWatched(
                                        episode.season_number,
                                        episode.episode_number
                                      )}
                                    >
                                      <span>•</span>
                                      <div class="flex items-center gap-1 px-2 py-0.5 bg-purple-900/40 text-purple-300 rounded border border-purple-700/50">
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          class="h-3 w-3"
                                          viewBox="0 0 20 20"
                                          fill="currentColor"
                                        >
                                          <path
                                            fill-rule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                            clip-rule="evenodd"
                                          />
                                        </svg>
                                        <span class="font-medium">Watched</span>
                                      </div>
                                    </Show>
                                  </div>

                                  {/* Synopsis - Hidden with text shadow, visible on hover or if watched */}
                                  <Show when={episode.overview}>
                                    {(() => {
                                      const isWatched = isEpisodeWatched(
                                        episode.season_number,
                                        episode.episode_number
                                      );
                                      return (
                                        <p
                                          class="text-xs line-clamp-3 transition-[color,text-shadow] duration-300"
                                          classList={{
                                            "text-transparent hover:text-neutral-400":
                                              !isWatched,
                                            "text-neutral-400": isWatched,
                                          }}
                                          style={{
                                            "text-shadow": !isWatched
                                              ? "0 0 8px rgba(163, 163, 163, 0.8)"
                                              : "none",
                                          }}
                                        >
                                          {episode.overview}
                                        </p>
                                      );
                                    })()}
                                  </Show>
                                  <Show when={!episode.overview}>
                                    <p class="text-xs text-neutral-600 italic">
                                      No synopsis available
                                    </p>
                                  </Show>

                                  {/* Action Buttons */}
                                  <div class="flex gap-2 mt-2">
                                    {/* Play Button - Only show if episode is downloaded */}
                                    <Show
                                      when={isEpisodeDownloaded(
                                        episode.season_number,
                                        episode.episode_number
                                      )}
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handlePlayEpisode(episode);
                                        }}
                                        class="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                                        title="Play episode in VLC"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          class="h-3 w-3"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                        Play in VLC
                                      </button>
                                    </Show>

                                    {/* Mark Watched Button - Only show for unwatched episodes */}
                                    <Show
                                      when={
                                        !isEpisodeWatched(
                                          episode.season_number,
                                          episode.episode_number
                                        )
                                      }
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markEpisodeWatched(episode);
                                        }}
                                        class="px-3 py-1.5 text-xs font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex items-center gap-1.5 border border-neutral-600"
                                        title="Mark episode as watched on Trakt"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          class="h-3 w-3"
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
                                        Mark Watched
                                      </button>
                                    </Show>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>

                  {/* Torrent Sources - Right Side */}
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 px-2">
                      <h3 class="text-sm font-semibold text-neutral-400">
                        Available Torrents ({selectedQuality()})
                      </h3>
                      <button
                        onClick={() =>
                          setStrictEpisodeFilter(!strictEpisodeFilter())
                        }
                        class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-2"
                        classList={{
                          "bg-green-600 hover:bg-green-700 text-white":
                            strictEpisodeFilter(),
                          "bg-neutral-700 hover:bg-neutral-600 text-neutral-300":
                            !strictEpisodeFilter(),
                        }}
                        title={
                          strictEpisodeFilter()
                            ? "Show all results"
                            : "Show only exact episode matches"
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                          />
                        </svg>
                        {strictEpisodeFilter()
                          ? "find more options"
                          : "filter results"}
                      </button>
                    </div>
                    <Show when={selectedEpisode()}>
                      <div class="bg-neutral-800/60 rounded-lg max-h-[60vh] lg:max-h-[45vh] overflow-y-auto">
                        {/* Episode Info Header */}
                        <div class="p-4 border-b border-neutral-700 sticky top-0 bg-neutral-800/90 backdrop-blur-sm">
                          <h4 class="text-base font-semibold text-white mb-1">
                            {selectedEpisode()!.name}
                          </h4>
                          <div class="text-xs text-neutral-400">
                            S
                            {String(selectedEpisode()!.season_number).padStart(
                              2,
                              "0"
                            )}
                            E
                            {String(selectedEpisode()!.episode_number).padStart(
                              2,
                              "0"
                            )}
                          </div>
                        </div>

                        {/* Loading State */}
                        <Show when={loadingTorrents()}>
                          <div class="flex flex-col items-center justify-center py-16">
                            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3"></div>
                            <p class="text-neutral-400 text-sm">
                              Searching for torrents...
                            </p>
                          </div>
                        </Show>

                        {/* Error State */}
                        <Show when={torrentError()}>
                          <div class="p-4 m-4 text-red-400 bg-red-950/40 border border-red-700 rounded text-sm">
                            {torrentError()}
                          </div>
                        </Show>

                        {/* No Results */}
                        <Show
                          when={
                            !loadingTorrents() &&
                            !torrentError() &&
                            filteredTorrents().length === 0
                          }
                        >
                          <div class="flex flex-col items-center justify-center py-16 text-center px-4">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-12 w-12 text-neutral-600 mb-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
                            </svg>
                            <p class="text-neutral-400 text-sm mb-1">
                              No torrents found
                            </p>
                            <p class="text-neutral-500 text-xs">
                              {strictEpisodeFilter()
                                ? "Try disabling the episode filter or check Prowlarr settings"
                                : "Try a different quality or check Prowlarr settings"}
                            </p>
                          </div>
                        </Show>

                        {/* Torrent List */}
                        <Show
                          when={
                            !loadingTorrents() && filteredTorrents().length > 0
                          }
                        >
                          <div class="p-4">
                            {/* Auto-Select Button with Warnings */}
                            <div class="mb-4">
                              <button
                                onClick={handleAutoSelectTorrent}
                                disabled={downloadingTorrent() !== null}
                                class="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:from-neutral-600 disabled:to-neutral-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                </svg>
                                Watch Now (Auto-Select Best Torrent)
                              </button>

                              {/* Warnings */}
                              <Show when={filteredTorrents().length < 5}>
                                <div class="mt-3 p-3 bg-yellow-900/40 border border-yellow-700/50 rounded-lg">
                                  <div class="flex items-start gap-2">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                      />
                                    </svg>
                                    <div class="text-sm text-yellow-200">
                                      <p class="font-medium mb-1">
                                        Limited Options Available
                                      </p>
                                      <p class="text-yellow-300/90">
                                        Only {filteredTorrents().length} torrent
                                        {filteredTorrents().length === 1
                                          ? ""
                                          : "s"}{" "}
                                        found. Consider manually selecting a
                                        torrent for better quality.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </Show>

                              <Show
                                when={
                                  getBestTorrent() &&
                                  getBestTorrent()!.seeders < 10
                                }
                              >
                                <div class="mt-3 p-3 bg-orange-900/40 border border-orange-700/50 rounded-lg">
                                  <div class="flex items-start gap-2">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <div class="text-sm text-orange-200">
                                      <p class="font-medium mb-1">
                                        Low Availability Warning
                                      </p>
                                      <p class="text-orange-300/90">
                                        Best torrent has only{" "}
                                        {getBestTorrent()!.seeders} seeder
                                        {getBestTorrent()!.seeders === 1
                                          ? ""
                                          : "s"}
                                        . Download may be slow or incomplete.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </Show>
                            </div>

                            {/* Accordion for Manual Selection */}
                            <div class="border border-neutral-700 rounded-lg overflow-hidden">
                              <button
                                onClick={() =>
                                  setShowTorrentList(!showTorrentList())
                                }
                                class="w-full px-4 py-3 bg-neutral-800 hover:bg-neutral-750 transition-colors flex items-center justify-between text-left"
                              >
                                <span class="text-sm font-medium text-neutral-300">
                                  Manual Torrent Selection (
                                  {filteredTorrents().length} available)
                                </span>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class={`h-5 w-5 text-neutral-400 transition-transform ${
                                    showTorrentList() ? "rotate-180" : ""
                                  }`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>

                              <Show when={showTorrentList()}>
                                <div class="border-t border-neutral-700 p-2 bg-neutral-800/50 max-h-96 overflow-y-auto">
                                  <For each={filteredTorrents()}>
                                    {(torrent) => (
                                      <div class="p-3 mb-2 bg-neutral-700/40 hover:bg-neutral-700/60 rounded-lg transition-colors border border-neutral-600/50 hover:border-blue-500/50">
                                        <div class="flex flex-col sm:flex-row items-start justify-between gap-3 mb-2">
                                          <div class="flex-1 min-w-0">
                                            <h5 class="text-sm font-medium text-white mb-1 line-clamp-2">
                                              {torrent.title}
                                            </h5>
                                            <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                                              <span class="px-2 py-0.5 bg-neutral-600 rounded">
                                                {torrent.indexer}
                                              </span>
                                              <span>
                                                {formatBytes(torrent.size)}
                                              </span>
                                              <span>•</span>
                                              <div class="flex items-center gap-1">
                                                <svg
                                                  xmlns="http://www.w3.org/2000/svg"
                                                  class="h-3 w-3 text-green-400"
                                                  viewBox="0 0 20 20"
                                                  fill="currentColor"
                                                >
                                                  <path
                                                    fill-rule="evenodd"
                                                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                                                    clip-rule="evenodd"
                                                  />
                                                </svg>
                                                <span class="text-green-400 font-medium">
                                                  {torrent.seeders}
                                                </span>
                                              </div>
                                              <div class="flex items-center gap-1">
                                                <svg
                                                  xmlns="http://www.w3.org/2000/svg"
                                                  class="h-3 w-3 text-blue-400"
                                                  viewBox="0 0 20 20"
                                                  fill="currentColor"
                                                >
                                                  <path
                                                    fill-rule="evenodd"
                                                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                                    clip-rule="evenodd"
                                                  />
                                                </svg>
                                                <span class="text-blue-400">
                                                  {torrent.peers}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => {
                                              setSelectedTorrentForDownload(
                                                torrent
                                              );
                                              setShowDownloadProgressPopup(
                                                true
                                              );
                                            }}
                                            disabled={
                                              downloadingTorrent() ===
                                              torrent.download_url
                                            }
                                            class="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:from-neutral-600 disabled:to-neutral-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg"
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
                                              ? "Download"
                                              : "Download"}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </div>
                        </Show>
                      </div>
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

        {/* Download Progress Popup */}
        <Show when={showDownloadProgressPopup()}>
          <DownloadProgressPopup
            isOpen={showDownloadProgressPopup()}
            onClose={() => {
              setShowDownloadProgressPopup(false);
              setSelectedTorrentForDownload(null);
            }}
            torrent={selectedTorrentForDownload()}
            tmdbId={props.tmdbId || null}
            episode={selectedEpisode()}
            onMarkWatched={handleMarkEpisodeWatched}
          />
        </Show>
      </div>
    </div>
  );
};

export default SeriesDetails;
