import {
  Component,
  createSignal,
  onMount,
  onCleanup,
  For,
  Show,
  createMemo,
  batch,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import * as opener from "@tauri-apps/plugin-opener";
import { Line } from "solid-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { getTorrentTmdbId, setTorrentTmdbId } from "../lib/torrentDb";
import { getPosterUrl } from "../lib/tmdb";
import Player from "./Player";
import CustomAlert from "../components/CustomAlert";
import { SiVlcmediaplayer } from "solid-icons/si";

// Register Chart.js components
try {
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  );
  console.log("Chart.js registered successfully");
} catch (e) {
  console.error("Failed to register Chart.js:", e);
}

type TorrentInfo = {
  id: number;
  info_hash: string;
  name: string;
  state: string;
  progress_bytes: number;
  total_bytes: number;
  uploaded_bytes: number;
  finished: boolean;
  error: string | null;
};

type TorrentStats = {
  state: string;
  progress_bytes: number;
  uploaded_bytes: number;
  total_bytes: number;
  finished: boolean;
  error: string | null;
  download_speed?: number;
  live_peers?: number;
  seen_peers?: number;
};

type TorrentFile = {
  id: number;
  name: string;
  length: number;
};

type TorrentMetadata = {
  tmdb_id: number | null;
  media_type: string | null;
  episode_info: [number, number] | null;
};

type TorrentWithStats = TorrentInfo & {
  stats?: TorrentStats;
  download_speed: number;
  tmdb_id?: number | null;
  media_type?: string | null;
  files?: TorrentFile[];
  primaryFile?: TorrentFile;
  metadata?: TorrentMetadata;
  poster_url?: string | null;
};

const Downloads: Component = () => {
  const [torrents, setTorrents] = createStore<TorrentWithStats[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [downloadSpeed, setDownloadSpeed] = createSignal(0);
  const [speedHistory, setSpeedHistory] = createSignal<number[]>([]);
  const [torrentSpeedMap, setTorrentSpeedMap] = createSignal<
    Map<number, { bytes: number; time: number }>
  >(new Map());
  const [editingTmdb, setEditingTmdb] = createSignal<number | null>(null);
  const [tmdbInputValue, setTmdbInputValue] = createSignal<string>("");
  const [mediaTypeInputValue, setMediaTypeInputValue] =
    createSignal<string>("movie");
  const [showPlayer, setShowPlayer] = createSignal(false);
  const [playerUrl, setPlayerUrl] = createSignal("");
  const [playerTitle, setPlayerTitle] = createSignal("");
  const [expandedTorrents, setExpandedTorrents] = createSignal<Set<number>>(
    new Set()
  );
  const [showAlert, setShowAlert] = createSignal(false);

  let statsInterval: NodeJS.Timeout | null = null;

  const getFileExtension = (filename: string): string => {
    const parts = filename.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  };

  const isVideoFile = (filename: string): boolean => {
    const ext = getFileExtension(filename);
    const videoExtensions = [
      "mp4",
      "mkv",
      "avi",
      "mov",
      "webm",
      "m4v",
      "mpg",
      "mpeg",
      "ts",
    ];
    return videoExtensions.includes(ext);
  };

  const getTorrentTypeBadge = (metadata?: TorrentMetadata) => {
    const mediaType = metadata?.media_type;

    if (!mediaType) {
      return (
        <span class="text-xs px-2 py-0.5 rounded border border-red-500 text-red-400 uppercase font-semibold">
          Unknown
        </span>
      );
    }

    if (mediaType === "movie") {
      return (
        <span class="text-xs px-2 py-0.5 rounded border border-purple-500 text-purple-400 uppercase font-semibold">
          Movie
        </span>
      );
    }

    if (mediaType === "tv" || mediaType === "series") {
      const episodeText = metadata?.episode_info
        ? ` S${String(metadata.episode_info[0]).padStart(2, "0")}E${String(
            metadata.episode_info[1]
          ).padStart(2, "0")}`
        : "";
      return (
        <span class="text-xs px-2 py-0.5 rounded border border-green-500 text-green-400 uppercase font-semibold">
          Series{episodeText}
        </span>
      );
    }

    return (
      <span class="text-xs px-2 py-0.5 rounded border border-neutral-500 text-neutral-400 uppercase font-semibold">
        {mediaType}
      </span>
    );
  };

  const toggleTorrentExpanded = (torrentId: number) => {
    setExpandedTorrents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(torrentId)) {
        newSet.delete(torrentId);
      } else {
        newSet.add(torrentId);
      }
      return newSet;
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatETA = (bytesRemaining: number, speedBps: number) => {
    if (speedBps <= 0 || bytesRemaining <= 0) return "∞";
    const seconds = Math.floor(bytesRemaining / speedBps);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const getAverageSpeed = () => {
    const history = speedHistory();
    if (history.length === 0) return 0;
    const sum = history.reduce((a, b) => a + b, 0);
    return sum / history.length;
  };

  const fetchTorrents = async (
    skipTmdbFetch = false,
    skipPosterFetch = false
  ) => {
    try {
      console.log("Fetching torrents...");
      const result: any = await invoke("torrents_list");
      const torrentList: TorrentInfo[] = result.torrents || [];
      console.log("Got torrent list:", torrentList.length, "torrents");

      // Fetch stats for each torrent
      const torrentsWithStats: TorrentWithStats[] = await Promise.all(
        torrentList.map(async (torrent) => {
          try {
            const stats: TorrentStats = await invoke("torrent_stats", {
              id: torrent.id,
            });

            // Fetch TMDB ID (skip if user is editing to preserve state)
            let tmdbId: number | null = null;
            let mediaType: string | null = null;
            if (skipTmdbFetch && editingTmdb() === torrent.id) {
              // Preserve existing TMDB data from current state
              const existing = torrents.find((t) => t.id === torrent.id);
              tmdbId = existing?.tmdb_id ?? null;
              mediaType = existing?.media_type ?? null;
            } else if (!skipTmdbFetch) {
              try {
                const tmdbData = await getTorrentTmdbId(torrent.id);
                if (tmdbData) {
                  tmdbId = tmdbData.tmdb_id;
                  mediaType = tmdbData.media_type;
                }
              } catch (e) {
                console.warn(
                  `Failed to fetch TMDB ID for torrent ${torrent.id}:`,
                  e
                );
              }
            } else {
              // During interval updates, preserve existing TMDB data
              const existing = torrents.find((t) => t.id === torrent.id);
              tmdbId = existing?.tmdb_id ?? null;
              mediaType = existing?.media_type ?? null;
            }

            // Calculate individual torrent speed
            const speedMap = torrentSpeedMap();
            const lastData = speedMap.get(torrent.id);
            let speed = 0;

            if (lastData) {
              const now = Date.now();
              const timeDiff = (now - lastData.time) / 1000;
              const bytesDiff = stats.progress_bytes - lastData.bytes;
              speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            }

            // Update speed tracking
            const newSpeedMap = new Map(speedMap);
            newSpeedMap.set(torrent.id, {
              bytes: stats.progress_bytes,
              time: Date.now(),
            });
            setTorrentSpeedMap(newSpeedMap);

            // Fetch file details (skip during interval updates)
            let files: TorrentFile[] = [];
            let primaryFile: TorrentFile | undefined;
            if (!skipPosterFetch) {
              try {
                const details: any = await invoke("get_torrent_files", {
                  id: torrent.id,
                });
                if (details.files && details.files.length > 0) {
                  files = details.files;

                  // Find primary video file (largest video file)
                  const videoFiles = files.filter((f) => isVideoFile(f.name));
                  if (videoFiles.length > 0) {
                    primaryFile = videoFiles.reduce((largest, current) =>
                      current.length > largest.length ? current : largest
                    );
                  } else {
                    primaryFile = files[0];
                  }
                }
              } catch (e) {
                console.warn(
                  `Failed to fetch files for torrent ${torrent.id}:`,
                  e
                );
              }
            } else {
              // During interval updates, preserve existing files
              const existing = torrents.find((t) => t.id === torrent.id);
              files = existing?.files ?? [];
              primaryFile = existing?.primaryFile;
            }

            // Fetch metadata (type and episode info) (skip during interval updates)
            let metadata: TorrentMetadata | undefined;
            if (!skipPosterFetch) {
              try {
                metadata =
                  (await invoke<TorrentMetadata | null>(
                    "get_torrent_metadata",
                    {
                      id: torrent.id,
                    }
                  )) || undefined;
              } catch (e) {
                console.warn(
                  `Failed to fetch metadata for torrent ${torrent.id}:`,
                  e
                );
              }
            } else {
              // During interval updates, preserve existing metadata
              const existing = torrents.find((t) => t.id === torrent.id);
              metadata = existing?.metadata;
            }

            // Fetch poster if TMDB ID is available (skip during interval updates)
            let posterUrl: string | null = null;
            if (!skipPosterFetch && tmdbId) {
              try {
                // For movies, use get_tmdb_movie
                // For TV shows, use get_tmdb_show
                if (mediaType === "movie") {
                  const movieData = await invoke<{ poster_path?: string }>(
                    "get_tmdb_movie",
                    { tmdbId: tmdbId }
                  );
                  posterUrl = movieData?.poster_path
                    ? getPosterUrl(movieData.poster_path, "w185")
                    : null;
                } else if (mediaType === "tv") {
                  const seriesData = await invoke<{ poster_path?: string }>(
                    "get_tmdb_show",
                    { tmdbId: tmdbId }
                  );
                  posterUrl = seriesData?.poster_path
                    ? getPosterUrl(seriesData.poster_path, "w185")
                    : null;
                }
              } catch (e) {
                console.warn(
                  `Failed to fetch poster for torrent ${torrent.id}:`,
                  e
                );
              }
            } else {
              // During interval updates, preserve existing poster
              const existing = torrents.find((t) => t.id === torrent.id);
              posterUrl = existing?.poster_url ?? null;
            }

            return {
              ...torrent,
              stats,
              download_speed: speed,
              tmdb_id: tmdbId,
              media_type: mediaType,
              files,
              primaryFile,
              metadata,
              poster_url: posterUrl,
              // Update with fresh stats
              progress_bytes: stats.progress_bytes,
              total_bytes: stats.total_bytes,
              uploaded_bytes: stats.uploaded_bytes,
              state: stats.state,
              finished: stats.finished,
              error: stats.error,
            };
          } catch (e) {
            console.error(
              `Failed to fetch stats for torrent ${torrent.id}:`,
              e
            );
            return {
              ...torrent,
              download_speed: 0,
              tmdb_id: null,
              media_type: null,
            };
          }
        })
      );

      // Sort torrents alphabetically by name
      torrentsWithStats.sort((a, b) => a.name.localeCompare(b.name));

      setTorrents(reconcile(torrentsWithStats, { key: "id", merge: true }));
      setError(null);
    } catch (e: any) {
      console.error("Failed to fetch torrents:", e);
      setError(e?.toString?.() ?? "Failed to fetch torrents");
    }
  };

  const calculateTotalSpeed = () => {
    try {
      const torrentList = torrents;
      let totalSpeed = 0;

      // Sum up speeds from all active torrents
      for (const torrent of torrentList) {
        if (!torrent.finished && torrent.state === "live") {
          totalSpeed += torrent.download_speed || 0;
        }
      }

      // Batch updates to minimize re-renders
      batch(() => {
        setDownloadSpeed(totalSpeed);

        // Update speed history (keep last 60 samples)
        setSpeedHistory((prev) => {
          const newHistory = [...prev, totalSpeed];
          return newHistory.slice(-60);
        });
      });
    } catch (e) {
      console.error("Failed to calculate speed:", e);
    }
  };

  const handleDeleteTorrent = async (id: number) => {
    try {
      await invoke("torrent_action_delete", { id });
      await fetchTorrents(false);
    } catch (e: any) {
      alert(`Failed to delete torrent: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handlePauseTorrent = async (id: number) => {
    try {
      await invoke("torrent_action_pause", { id });
      await fetchTorrents(false);
    } catch (e: any) {
      alert(`Failed to pause torrent: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handleStartTorrent = async (id: number) => {
    try {
      await invoke("torrent_action_start", { id });
      await fetchTorrents(false);
    } catch (e: any) {
      alert(`Failed to start torrent: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handlePlayInVLC = async (torrent: TorrentWithStats) => {
    try {
      // Get download path
      const downloadPath: string = await invoke("get_download_path");

      // Get torrent files
      const details: any = await invoke("get_torrent_files", {
        id: torrent.id,
      });

      if (!details.files || details.files.length === 0) {
        alert("No files found in this torrent");
        return;
      }

      // Find the largest video file or just use the first file
      const videoExtensions = [
        ".mp4",
        ".mkv",
        ".avi",
        ".mov",
        ".webm",
        ".m4v",
        ".mpg",
        ".mpeg",
        ".ts",
      ];
      let targetFile = details.files[0];

      // Prefer video files
      const videoFiles = details.files.filter((f: any) =>
        videoExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
      );

      if (videoFiles.length > 0) {
        // Get the largest video file
        targetFile = videoFiles.reduce((largest: any, current: any) =>
          current.length > largest.length ? current : largest
        );
      }

      // Construct the full path
      const filePath = `${downloadPath}/${details.name}${
        details.files.length > 1 ? "/" + targetFile.name : ""
      }`;

      console.log("Opening in VLC:", filePath);

      // Update watch history if we have TMDB metadata
      if (torrent.metadata?.tmdb_id) {
        const tmdbId = torrent.metadata.tmdb_id;
        const mediaType = torrent.metadata.media_type;
        const episodeInfo = torrent.metadata.episode_info;

        console.log("Updating watch history:", {
          tmdbId,
          mediaType,
          episodeInfo,
        });

        try {
          if (mediaType === "movie") {
            await invoke("add_movie_to_history", {
              tmdbId: tmdbId,
              watchedAt: null, // Server will use current timestamp
            });
            console.log("Added movie to watch history");
          } else if (mediaType === "tv" && episodeInfo) {
            await invoke("add_episode_to_history", {
              tmdbId: tmdbId,
              season: episodeInfo[0],
              episode: episodeInfo[1],
              watchedAt: null, // Server will use current timestamp
            });
            console.log("Added episode to watch history");
          }
        } catch (e) {
          console.warn("Failed to update watch history:", e);
          // Don't block playback if history update fails
        }
      }

      // Open with VLC
      await opener.openPath(filePath, "vlc");
    } catch (e: any) {
      console.error("Failed to open in VLC:", e);
      alert(`Failed to open in VLC: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handleSaveTmdbId = async (torrentId: number) => {
    const idStr = tmdbInputValue().trim();
    const mediaTypeVal = mediaTypeInputValue();

    if (!idStr) {
      console.log("TMDB ID is required");
      return;
    }

    const tmdbId = parseInt(idStr, 10);
    if (isNaN(tmdbId) || tmdbId <= 0) {
      console.log("Invalid TMDB ID. Must be a positive number.");
      return;
    }

    try {
      console.log(
        `Saving TMDB ID for torrent ${torrentId}:`,
        tmdbId,
        mediaTypeVal
      );

      // Set the TMDB ID
      await setTorrentTmdbId(torrentId, tmdbId, mediaTypeVal);

      console.log("TMDB ID saved successfully");

      // Exit edit mode FIRST
      setEditingTmdb(null);
      setTmdbInputValue("");
      setMediaTypeInputValue("movie");

      // Then refresh torrents to show updated ID
      setTimeout(async () => {
        await fetchTorrents(false);
      }, 100);
    } catch (e: any) {
      console.error("Failed to save TMDB ID:", e);
      alert(`Failed to save TMDB ID: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handleEditTmdbId = (
    torrentId: number,
    currentTmdbId: number | null,
    currentMediaType: string | null
  ) => {
    setEditingTmdb(torrentId);
    setTmdbInputValue(currentTmdbId?.toString() || "");
    setMediaTypeInputValue(currentMediaType || "movie");
  };

  const handleCancelEditTmdbId = () => {
    setEditingTmdb(null);
    setTmdbInputValue("");
    setMediaTypeInputValue("movie");
  };

  const handleStreamInPlayer = async (torrent: TorrentWithStats) => {
    try {
      // Find the MP4 file specifically (don't rely on primaryFile which might be MKV)
      if (!torrent.files || torrent.files.length === 0) {
        alert("No files found in this torrent");
        return;
      }

      console.log("All torrent files:", torrent.files);

      // Find all MP4 files from the original files array (preserving their IDs)
      const mp4Files = torrent.files.filter(
        (f) => getFileExtension(f.name) === "mp4"
      );

      console.log("Filtered MP4 files:", mp4Files);

      if (mp4Files.length === 0) {
        alert("No MP4 file found in this torrent");
        return;
      }

      // Use the largest MP4 file (the ID is preserved from the original array)
      const mp4File = mp4Files.reduce((largest, current) =>
        current.length > largest.length ? current : largest
      );

      // The file ID should be the index in the original files array (0-based)
      // Find the index of this file in the original torrent.files array
      const fileIndex = torrent.files.findIndex((f) => f.name === mp4File.name);
      const fileId = fileIndex !== -1 ? fileIndex : mp4File.id;

      // Construct the stream URL (assuming torrent server is running on localhost:3030)
      const streamUrl = `http://localhost:3030/torrents/${torrent.id}/stream/${fileId}`;

      console.log(
        "Opening in player:",
        streamUrl,
        "File:",
        mp4File.name,
        "File ID from object:",
        mp4File.id,
        "File index in array:",
        fileIndex,
        "Using file ID:",
        fileId
      );

      // Update watch history if we have TMDB metadata
      if (torrent.metadata?.tmdb_id) {
        const tmdbId = torrent.metadata.tmdb_id;
        const mediaType = torrent.metadata.media_type;
        const episodeInfo = torrent.metadata.episode_info;

        console.log("Updating watch history:", {
          tmdbId,
          mediaType,
          episodeInfo,
        });

        try {
          if (mediaType === "movie") {
            await invoke("add_movie_to_history", {
              tmdbId: tmdbId,
              watchedAt: null, // Server will use current timestamp
            });
            console.log("Added movie to watch history");
          } else if (mediaType === "tv" && episodeInfo) {
            await invoke("add_episode_to_history", {
              tmdbId: tmdbId,
              season: episodeInfo[0],
              episode: episodeInfo[1],
              watchedAt: null, // Server will use current timestamp
            });
            console.log("Added episode to watch history");
          }
        } catch (e) {
          console.warn("Failed to update watch history:", e);
          // Don't block playback if history update fails
        }
      }

      // Open player popup
      setPlayerUrl(streamUrl);
      setPlayerTitle(torrent.name);
      setShowPlayer(true);
    } catch (e: any) {
      console.error("Failed to open in player:", e);
      alert(`Failed to open in player: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handleStreamMkvInPlayer = async (torrent: TorrentWithStats) => {
    // Check if download is finished
    if (!torrent.finished) {
      setShowAlert(true);
      return;
    }

    try {
      // Get download path and files
      const downloadPath: string = await invoke("get_download_path");
      const details: any = await invoke("get_torrent_files", {
        id: torrent.id,
      });

      if (!details.files || details.files.length === 0) {
        alert("No files found in this torrent");
        return;
      }

      // Find the MKV file (should be the primary file)
      const targetFile = torrent.primaryFile || details.files[0];

      // Construct the full path to the MKV file
      const mkvPath = `${downloadPath}/${details.name}${
        details.files.length > 1 ? "/" + targetFile.name : ""
      }`;

      console.log("Transmuxing MKV file:", mkvPath);

      // Start transmuxing
      const mp4Path: string = await invoke("transmux_to_mp4", {
        inputPath: mkvPath,
      });

      console.log("Transmux complete, MP4 at:", mp4Path);

      // Initialize file server (if not already done)
      await invoke("init_file_server", { port: 8765 });

      // Set the MP4 file to be served
      const streamUrl: string = await invoke("set_served_file", {
        filePath: mp4Path,
      });

      console.log("File server serving at:", streamUrl);

      // Open player popup
      setPlayerUrl(streamUrl);
      setPlayerTitle(torrent.name);
      setShowPlayer(true);
    } catch (e: any) {
      console.error("Failed to transmux and stream:", e);
      alert(
        `Failed to prepare playback: ${e?.toString?.() ?? "Unknown error"}`
      );
    }
  };

  onMount(async () => {
    console.log("Downloads component mounted");
    setLoading(true);
    try {
      await fetchTorrents();
      console.log("Initial fetch complete");
    } catch (e) {
      console.error("Failed to fetch on mount:", e);
    }
    setLoading(false);

    // Poll torrents every 2 seconds, but skip TMDB refetch if editing
    // Skip poster/metadata fetches during interval to prevent API overload
    statsInterval = setInterval(async () => {
      await fetchTorrents(editingTmdb() !== null, true);
      calculateTotalSpeed();
    }, 1000);
  });

  onCleanup(() => {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  });

  // Chart configuration
  const recentWindow = 60;
  const speedSeriesMBs = createMemo(() =>
    speedHistory()
      .slice(-recentWindow)
      .map((b) => b / (1024 * 1024))
  );

  const chartLabels = createMemo(() =>
    Array.from({ length: speedSeriesMBs().length }, () => "")
  );

  const lineData = createMemo(() => ({
    labels: chartLabels(),
    datasets: [
      {
        label: "Download Speed (MB/s)",
        data: speedSeriesMBs(),
        borderColor: "#ef4444",
        backgroundColor: "rgba(239,68,68,0.2)",
        fill: true,
        tension: 0.25,
        pointRadius: 0,
      },
    ],
  }));

  const lineOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { color: "#d4d4d8" } },
      title: { display: false },
    },
    scales: {
      x: {
        grid: { color: "#3f3f46" },
        ticks: { color: "#a1a1aa", maxTicksLimit: 6 },
      },
      y: {
        grid: { color: "#3f3f46" },
        ticks: { color: "#a1a1aa" },
        title: { display: true, text: "MB/s", color: "#9ca3af" },
      },
    },
  };

  return (
    <div class="space-y-6">
      {/* Overall Stats */}
      <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <h2 class="text-xl font-bold text-white mb-4">Overall Statistics</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
            <div class="text-neutral-400 text-xs mb-1">Current Speed</div>
            <div class="text-red-400 text-2xl font-bold">
              {(downloadSpeed() / (1024 * 1024)).toFixed(2)} MB/s
            </div>
          </div>
          <div class="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
            <div class="text-neutral-400 text-xs mb-1">Average Speed (60s)</div>
            <div class="text-orange-400 text-2xl font-bold">
              {(getAverageSpeed() / (1024 * 1024)).toFixed(2)} MB/s
            </div>
          </div>
          <div class="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
            <div class="text-neutral-400 text-xs mb-1">Active Downloads</div>
            <div class="text-blue-400 text-2xl font-bold">
              {torrents.filter((t) => !t.finished && t.state === "live").length}
            </div>
          </div>
        </div>

        {/* Speed Chart */}
        <div class="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
          <div class="text-neutral-300 text-sm font-medium mb-3">
            Download Speed History
          </div>
          <div class="w-full" style={{ height: "180px" }}>
            <Line data={lineData()} options={lineOptions} height={180} />
          </div>
          <div class="text-neutral-500 text-xs mt-2 text-center">
            Last 60 seconds
          </div>
        </div>
      </div>

      {/* Torrents List */}
      <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <h2 class="text-xl font-bold text-white mb-4">Downloads</h2>

        {loading() && (
          <div class="text-neutral-400 text-center py-8">
            Loading torrents...
          </div>
        )}

        {error() && (
          <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
            {error()}
          </div>
        )}

        {!loading() && torrents.length === 0 && (
          <div class="text-neutral-400 text-center py-8">
            No torrents yet. Add one to get started!
          </div>
        )}

        <div class="space-y-4">
          <For each={torrents} fallback={null}>
            {(torrent) => (
              <div class="bg-neutral-900 rounded-lg p-4 border border-neutral-700 flex flex-row gap-4">
                {/* Poster */}
                <div class="flex-shrink-0">
                  {torrent.poster_url ? (
                    <img
                      src={torrent.poster_url}
                      alt={torrent.name}
                      class="w-30 h-42 object-cover rounded border border-neutral-700"
                    />
                  ) : (
                    <div class="w-30 h-42 bg-neutral-800 border border-neutral-700 rounded flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-8 w-8 text-neutral-600"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <div class="flex-1 min-w-0 flex flex-col">
                  <div class="flex gap-4 items-start mb-3 flex-flex-row">
                    {/* Content */}
                    <div class="flex-1 min-w-0 flex justify-between">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <h3 class="text-white font-semibold text-lg truncate">
                            {torrent.name}
                          </h3>
                          {getTorrentTypeBadge(torrent.metadata)}
                        </div>
                        {torrent.primaryFile && (
                          <div class="flex items-center gap-2 mt-1">
                            <span class="text-neutral-300 text-sm truncate">
                              📁 {torrent.primaryFile.name}
                            </span>
                            <span class="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-600/40 uppercase font-mono">
                              {getFileExtension(torrent.primaryFile.name)}
                            </span>
                          </div>
                        )}
                        <div class="text-neutral-400 text-xs mt-1 font-mono">
                          {torrent.info_hash}
                        </div>
                        {/* TMDB ID Display/Edit */}
                        <div class="mt-2">
                          {editingTmdb() === torrent.id ? (
                            <div class="flex items-center gap-2">
                              <input
                                ref={(el) => el && el.focus()}
                                type="text"
                                value={tmdbInputValue()}
                                onInput={(e) =>
                                  setTmdbInputValue(e.currentTarget.value)
                                }
                                onBlur={(e) => {
                                  // Prevent losing focus during re-render
                                  requestAnimationFrame(() => {
                                    if (
                                      editingTmdb() === torrent.id &&
                                      document.activeElement !== e.currentTarget
                                    ) {
                                      e.currentTarget.focus();
                                    }
                                  });
                                }}
                                placeholder="12345"
                                class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-24"
                              />
                              <select
                                value={mediaTypeInputValue()}
                                onInput={(e) =>
                                  setMediaTypeInputValue(e.currentTarget.value)
                                }
                                class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="movie">Movie</option>
                                <option value="tv">TV Show</option>
                              </select>
                              <button
                                onClick={() => handleSaveTmdbId(torrent.id)}
                                class="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEditTmdbId}
                                class="px-2 py-1 text-xs bg-neutral-600 hover:bg-neutral-700 text-white rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div class="flex items-center gap-2">
                              {torrent.tmdb_id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    opener.openUrl(
                                      `https://www.themoviedb.org/${
                                        torrent.media_type === "tv"
                                          ? "tv"
                                          : "movie"
                                      }/${torrent.tmdb_id}`
                                    )
                                  }
                                  class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-3 w-3"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                                  </svg>
                                  TMDB: {torrent.tmdb_id} (
                                  {torrent.media_type === "tv" ? "TV" : "Movie"}
                                  )
                                </button>
                              ) : (
                                <span class="text-xs text-neutral-500">
                                  No TMDB ID
                                </span>
                              )}
                              <button
                                onClick={() =>
                                  handleEditTmdbId(
                                    torrent.id,
                                    torrent.tmdb_id || null,
                                    torrent.media_type || null
                                  )
                                }
                                class="text-xs text-neutral-400 hover:text-white cursor-pointer"
                                title="Edit TMDB ID"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-3 w-3"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Files Accordion */}
                        {torrent.files && torrent.files.length > 1 && (
                          <div class="mt-2">
                            <button
                              onClick={() => toggleTorrentExpanded(torrent.id)}
                              class="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class={`h-4 w-4 transition-transform ${
                                  expandedTorrents().has(torrent.id)
                                    ? "rotate-90"
                                    : ""
                                }`}
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fill-rule="evenodd"
                                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                              <span>
                                {expandedTorrents().has(torrent.id)
                                  ? "Hide"
                                  : "Show"}{" "}
                                all files ({torrent.files.length})
                              </span>
                            </button>

                            <Show when={expandedTorrents().has(torrent.id)}>
                              <div class="mt-2 space-y-1 ml-6">
                                <For each={torrent.files}>
                                  {(file) => (
                                    <div class="flex items-center justify-between text-xs bg-neutral-800/50 rounded p-2 border border-neutral-700">
                                      <div class="flex items-center gap-2 flex-1 min-w-0">
                                        <span class="text-neutral-300 truncate">
                                          {file.name}
                                        </span>
                                        <span class="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400 text-[10px] uppercase font-mono flex-shrink-0">
                                          {getFileExtension(file.name) ||
                                            "file"}
                                        </span>
                                      </div>
                                      <span class="text-neutral-500 ml-2 flex-shrink-0">
                                        {formatBytes(file.length)}
                                      </span>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </div>
                      <div class="flex gap-2 ml-4 items-start">
                        {torrent.state === "live" && !torrent.finished && (
                          <button
                            onClick={() => handlePauseTorrent(torrent.id)}
                            class="p-2 h-10 rounded bg-yellow-600/20 text-yellow-400 border border-yellow-600/40 hover:bg-yellow-600/30 transition-colors flex items-center justify-center"
                            title="Pause"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          </button>
                        )}
                        {torrent.state === "paused" && (
                          <button
                            onClick={() => handleStartTorrent(torrent.id)}
                            class="p-2 h-10 rounded bg-green-600/20 text-green-400 border border-green-600/40 hover:bg-green-600/30 transition-colors flex items-center justify-center"
                            title="Resume"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          </button>
                        )}
                        {torrent.progress_bytes > 0 && (
                          <button
                            onClick={() => handlePlayInVLC(torrent)}
                            class="flex items-center gap-2 px-3 h-10 rounded bg-orange-600/20 text-orange-400 border border-orange-600/40 hover:bg-orange-600/30 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
                            title="Open in VLC"
                          >
                            <span>Play with VLC</span>
                            <SiVlcmediaplayer />
                          </button>
                        )}
                        {/* Only show Stream in Player button for .mp4 files (not MKV or any other format) */}
                        {torrent.progress_bytes > 0 &&
                          torrent.primaryFile &&
                          getFileExtension(torrent.primaryFile.name) ===
                            "mp4" && (
                            <button
                              onClick={() => handleStreamInPlayer(torrent)}
                              class="flex items-center gap-2 px-3 h-10 rounded bg-blue-600/20 text-blue-400 border border-blue-600/40 hover:bg-blue-600/30 transition-colors text-sm font-medium whitespace-nowrap"
                              title="Stream in Player (MP4 only)"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                              </svg>
                              <span>Stream in Player</span>
                            </button>
                          )}

                        {torrent.primaryFile &&
                          getFileExtension(torrent.primaryFile.name) !==
                            "mp4" && (
                            <div class="flex items-center px-3 h-10 rounded bg-orange-600/20 text-orange-400 border border-orange-600/40 text-sm font-medium whitespace-nowrap">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-2"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fill-rule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.518 11.591c.75 1.334-.213 2.987-1.742 2.987H3.48c-1.53 0-2.492-1.653-1.742-2.987L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V8a1 1 0 112 0v2a1 1 0 01-1 1z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                              {getFileExtension(torrent.primaryFile.name)} not
                              supported in App
                            </div>
                          )}

                        <button
                          onClick={() => handleDeleteTorrent(torrent.id)}
                          class="p-2 h-10 rounded bg-red-600/20 text-red-400 border border-red-600/40 hover:bg-red-600/30 transition-colors flex items-center justify-center"
                          title="Delete"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div class="mb-3">
                    <div class="flex justify-between text-sm mb-1">
                      <span class="text-neutral-400">Progress</span>
                      <span class="text-neutral-300 font-semibold">
                        {torrent.total_bytes > 0
                          ? (
                              (torrent.progress_bytes / torrent.total_bytes) *
                              100
                            ).toFixed(2)
                          : 0}
                        %
                      </span>
                    </div>
                    <div class="w-full bg-neutral-800 rounded-full h-3 overflow-hidden">
                      <div
                        class={`h-full transition-all duration-300 ${
                          torrent.finished ? "bg-green-500" : "bg-blue-500"
                        }`}
                        style={{
                          width: `${
                            torrent.total_bytes > 0
                              ? (torrent.progress_bytes / torrent.total_bytes) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
                    <div>
                      <div class="text-neutral-500">Status</div>
                      <div
                        class={`font-semibold ${
                          torrent.finished
                            ? "text-green-400"
                            : torrent.state === "live"
                            ? "text-blue-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {torrent.finished
                          ? "✓ Completed"
                          : torrent.state === "live"
                          ? "⬇ Downloading"
                          : torrent.state === "paused"
                          ? "⏸ Paused"
                          : torrent.state}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">Speed</div>
                      <div class="text-red-400 font-medium">
                        {torrent.finished || torrent.state !== "live"
                          ? "—"
                          : `${(torrent.download_speed / (1024 * 1024)).toFixed(
                              2
                            )} MB/s`}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">Downloaded</div>
                      <div class="text-white font-medium">
                        {formatBytes(torrent.progress_bytes)}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">Total Size</div>
                      <div class="text-white font-medium">
                        {formatBytes(torrent.total_bytes)}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">Uploaded</div>
                      <div class="text-white font-medium">
                        {formatBytes(torrent.uploaded_bytes)}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">ETA</div>
                      <div class="text-white font-medium">
                        {torrent.finished
                          ? "Done"
                          : torrent.state !== "live"
                          ? "—"
                          : formatETA(
                              torrent.total_bytes - torrent.progress_bytes,
                              torrent.download_speed
                            )}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">Live Peers</div>
                      <div class="text-green-400 font-medium">
                        {torrent.stats?.live_peers ?? 0}
                      </div>
                    </div>
                    <div>
                      <div class="text-neutral-500">Seen Peers</div>
                      <div class="text-cyan-400 font-medium">
                        {torrent.stats?.seen_peers ?? 0}
                      </div>
                    </div>
                  </div>

                  {torrent.error && (
                    <div class="mt-3 text-red-400 bg-red-950/40 border border-red-700 rounded p-2 text-xs">
                      {torrent.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Player Popup */}
      <Show when={showPlayer()}>
        <Player
          streamUrl={playerUrl()}
          title={playerTitle()}
          isPopup={true}
          onClose={() => setShowPlayer(false)}
        />
      </Show>

      {/* Custom Alert for MKV Warning */}
      <CustomAlert
        isOpen={showAlert()}
        onClose={() => setShowAlert(false)}
        title="Cannot Stream MKV Files"
        message="Cannot stream .mkv files inside app. Please wait until download is finished or use VLC Media Player."
        type="warning"
      />
    </div>
  );
};

export default Downloads;
