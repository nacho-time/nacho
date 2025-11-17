import { Component, Show, createSignal, createEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { TorrentResult } from "../types/torrent";
import type { TmdbEpisode } from "../types/tmdb";

interface DownloadProgressPopupProps {
  isOpen: boolean;
  onClose: () => void;
  torrent: TorrentResult | null;
  tmdbId: number | null;
  episode: TmdbEpisode | null;
  onMarkWatched: () => Promise<void>;
}

type DownloadStep = {
  name: string;
  status: "pending" | "active" | "complete" | "error";
  message?: string;
};

const DownloadProgressPopup: Component<DownloadProgressPopupProps> = (
  props
) => {
  const [steps, setSteps] = createSignal<DownloadStep[]>([
    { name: "Initiating download", status: "pending" },
    { name: "Connecting to peers", status: "pending" },
    { name: "Download queued", status: "pending" },
  ]);

  const [downloadError, setDownloadError] = createSignal<string | null>(null);
  const [downloadStarted, setDownloadStarted] = createSignal(false);
  const [hasStartedDownload, setHasStartedDownload] = createSignal(false);
  const [isOpeningVLC, setIsOpeningVLC] = createSignal(false);
  const [fileIsMp4, setFileIsMp4] = createSignal<boolean | null>(null);
  const [isCheckingFileType, setIsCheckingFileType] = createSignal(false);

  const updateStep = (
    index: number,
    status: DownloadStep["status"],
    message?: string
  ) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, status, message } : step))
    );
  };

  const startDownload = async () => {
    if (!props.torrent || !props.episode) {
      console.log("startDownload: Missing torrent or episode");
      return;
    }

    if (hasStartedDownload()) {
      console.log("Download already started, skipping");
      return;
    }

    console.log("Starting download process for:", props.torrent.title);
    setHasStartedDownload(true);

    try {
      // Step 1: Initiating download
      updateStep(0, "active");

      const episodeInfo: [number, number] = [
        props.episode.season_number,
        props.episode.episode_number,
      ];

      console.log("Calling download_torrent_from_prowlarr");

      await invoke("download_torrent_from_prowlarr", {
        downloadUrl: props.torrent.download_url,
        tmdbId: props.tmdbId,
        mediaType: "tv",
        episodeInfo: episodeInfo,
      });

      console.log("Download command completed successfully");
      updateStep(0, "complete");

      // Step 2: Connecting to peers
      updateStep(1, "active");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      updateStep(1, "complete");

      // Step 3: Download queued
      updateStep(2, "active");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      updateStep(2, "complete");

      setDownloadStarted(true);
      console.log("Download has been queued successfully");

      // Check file type after download is queued
      checkFileType();
    } catch (e: any) {
      console.error("Download failed:", e);
      setDownloadError(e?.toString?.() ?? "Download failed");

      const activeIndex = steps().findIndex((s) => s.status === "active");
      if (activeIndex !== -1) {
        updateStep(activeIndex, "error", e?.toString?.());
      }
    }
  };

  const checkFileType = async () => {
    setIsCheckingFileType(true);
    try {
      console.log("Checking file type for torrent...");

      // Wait a bit for the torrent to appear
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Fetch current torrents
      const result: any = await invoke("torrents_list");
      const torrentList = result.torrents || [];

      console.log(`Found ${torrentList.length} total torrents`);

      // Try to find our torrent by matching name
      const titleWords = props.torrent!.title.toLowerCase().split(" ");
      const matchingTorrent = torrentList.find((t: any) => {
        const torrentNameLower = t.name.toLowerCase();
        // Match at least 3 significant words (longer than 3 chars)
        const matchCount = titleWords.filter(
          (word) => word.length > 3 && torrentNameLower.includes(word)
        ).length;
        return matchCount >= 3;
      });

      if (!matchingTorrent) {
        console.log("Could not find torrent yet, will disable MP4 streaming");
        setFileIsMp4(false);
        setIsCheckingFileType(false);
        return;
      }

      console.log(
        "Found torrent for file check:",
        matchingTorrent.name,
        "ID:",
        matchingTorrent.id
      );

      // Get file details
      const details: any = await invoke("get_torrent_files", {
        id: matchingTorrent.id,
      });

      if (!details.files || details.files.length === 0) {
        console.log("No files found yet");
        setFileIsMp4(false);
        setIsCheckingFileType(false);
        return;
      }

      // Find primary video file
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
      const videoFiles = details.files.filter((f: any) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && videoExtensions.includes(ext);
      });

      let primaryFile;
      if (videoFiles.length > 0) {
        primaryFile = videoFiles.reduce((largest: any, current: any) =>
          current.length > largest.length ? current : largest
        );
      } else {
        primaryFile = details.files[0];
      }

      const ext = primaryFile.name.split(".").pop()?.toLowerCase() || "";
      const isMp4 = ext === "mp4";

      console.log("Primary file:", primaryFile.name, "Is MP4:", isMp4);
      setFileIsMp4(isMp4);
    } catch (e: any) {
      console.error("Failed to check file type:", e);
      setFileIsMp4(false);
    } finally {
      setIsCheckingFileType(false);
    }
  };

  const findTorrentAndPlay = async (
    playHandler: (
      torrentId: number,
      primaryFile: any,
      isMp4: boolean
    ) => Promise<void>
  ) => {
    try {
      console.log("Looking for torrent in downloads...");

      // Fetch current torrents
      const result: any = await invoke("torrents_list");
      const torrentList = result.torrents || [];

      console.log(`Found ${torrentList.length} total torrents`);

      // Try to find our torrent by matching name
      const titleWords = props.torrent!.title.toLowerCase().split(" ");
      const matchingTorrent = torrentList.find((t: any) => {
        const torrentNameLower = t.name.toLowerCase();
        // Match at least 3 significant words (longer than 3 chars)
        const matchCount = titleWords.filter(
          (word) => word.length > 3 && torrentNameLower.includes(word)
        ).length;
        return matchCount >= 3;
      });

      if (!matchingTorrent) {
        throw new Error(
          "Could not find the torrent in downloads. It may still be initializing. Please wait a moment and check the Downloads tab."
        );
      }

      console.log(
        "Found torrent:",
        matchingTorrent.name,
        "ID:",
        matchingTorrent.id
      );

      // Get file details
      const details: any = await invoke("get_torrent_files", {
        id: matchingTorrent.id,
      });

      if (!details.files || details.files.length === 0) {
        throw new Error("No files found in torrent");
      }

      // Find primary video file
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
      const videoFiles = details.files.filter((f: any) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && videoExtensions.includes(ext);
      });

      let primaryFile;
      if (videoFiles.length > 0) {
        primaryFile = videoFiles.reduce((largest: any, current: any) =>
          current.length > largest.length ? current : largest
        );
      } else {
        primaryFile = details.files[0];
      }

      const ext = primaryFile.name.split(".").pop()?.toLowerCase() || "";
      const isMp4 = ext === "mp4";

      console.log("Primary file:", primaryFile.name, "Is MP4:", isMp4);

      await playHandler(matchingTorrent.id, primaryFile, isMp4);
    } catch (e: any) {
      console.error("Failed to find/play torrent:", e);
      alert(`Failed to play: ${e?.toString?.() ?? "Unknown error"}`);
    }
  };

  const handlePlayInVLC = async () => {
    setIsOpeningVLC(true);
    try {
      await findTorrentAndPlay(async (torrentId, primaryFile) => {
        const downloadPath: string = await invoke("get_download_path");
        const details: any = await invoke("get_torrent_files", {
          id: torrentId,
        });

        const filePath = `${downloadPath}/${details.name}${
          details.files.length > 1 ? "/" + primaryFile.name : ""
        }`;

        console.log("Opening in VLC:", filePath);

        // Mark as watched
        await props.onMarkWatched();

        // Open with VLC
        const opener = await import("@tauri-apps/plugin-opener");
        await opener.openPath(filePath, "vlc");

        props.onClose();
      });
    } finally {
      setIsOpeningVLC(false);
    }
  };

  const handleStreamInPlayer = async () => {
    await findTorrentAndPlay(async (torrentId, primaryFile) => {
      const details: any = await invoke("get_torrent_files", { id: torrentId });

      // Find the file index
      const fileIndex = details.files.findIndex(
        (f: any) => f.name === primaryFile.name
      );
      const fileId = fileIndex !== -1 ? fileIndex : primaryFile.id;

      const streamUrl = `http://localhost:3030/torrents/${torrentId}/stream/${fileId}`;

      console.log("Opening in player:", streamUrl);

      // Mark as watched
      await props.onMarkWatched();

      // Open player
      window.open(
        `/player?url=${encodeURIComponent(
          streamUrl
        )}&title=${encodeURIComponent(props.episode?.name || "Episode")}`,
        "_blank"
      );

      props.onClose();
    });
  };

  // Watch for props changes and trigger download
  createEffect(() => {
    if (props.isOpen && props.torrent && !hasStartedDownload()) {
      console.log("Starting download from effect...");
      startDownload();
    }

    // Reset when popup closes
    if (!props.isOpen && hasStartedDownload()) {
      console.log("Popup closed, resetting state");
      setHasStartedDownload(false);
      setDownloadStarted(false);
      setDownloadError(null);
      setIsOpeningVLC(false);
      setFileIsMp4(null);
      setIsCheckingFileType(false);
      setSteps([
        { name: "Initiating download", status: "pending" },
        { name: "Connecting to peers", status: "pending" },
        { name: "Download queued", status: "pending" },
      ]);
    }
  });

  if (!props.isOpen) return null;

  return (
    <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div class="relative bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-xl shadow-2xl border border-neutral-700 max-w-lg w-full p-6">
        <button
          onClick={props.onClose}
          class="absolute top-3 right-3 p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
        >
          <svg
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

        <div class="mb-6">
          <h3 class="text-xl font-bold text-white mb-2">
            {downloadStarted()
              ? "Download Started"
              : downloadError()
              ? "Download Failed"
              : "Preparing Download"}
          </h3>
          <p class="text-neutral-400 text-sm">
            {props.episode && (
              <span>
                S{String(props.episode.season_number).padStart(2, "0")}E
                {String(props.episode.episode_number).padStart(2, "0")} -{" "}
                {props.episode.name}
              </span>
            )}
          </p>
        </div>

        <Show when={downloadError()}>
          <div class="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-4">
            <div class="flex items-start gap-3">
              <svg
                class="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5"
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
              <div>
                <p class="text-red-300 font-medium mb-1">Download Error</p>
                <p class="text-red-400 text-sm">{downloadError()}</p>
              </div>
            </div>
          </div>
        </Show>

        <Show when={!downloadError()}>
          <div class="space-y-3 mb-6">
            {steps().map((step) => (
              <div class="flex items-center gap-3">
                <div class="flex-shrink-0">
                  <Show when={step.status === "complete"}>
                    <div class="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <svg
                        class="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </Show>
                  <Show when={step.status === "active"}>
                    <div class="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  </Show>
                  <Show when={step.status === "error"}>
                    <div class="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                      <svg
                        class="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                  </Show>
                  <Show when={step.status === "pending"}>
                    <div class="w-6 h-6 rounded-full border-2 border-neutral-600" />
                  </Show>
                </div>
                <div class="flex-1">
                  <p
                    class={`text-sm font-medium ${
                      step.status === "complete"
                        ? "text-green-400"
                        : step.status === "active"
                        ? "text-blue-400"
                        : step.status === "error"
                        ? "text-red-400"
                        : "text-neutral-500"
                    }`}
                  >
                    {step.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Show>

        <Show when={downloadStarted()}>
          <div class="bg-green-900/40 border border-green-700 rounded-lg p-4 mb-6">
            <div class="flex items-start gap-3">
              <svg
                class="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p class="text-green-300 font-medium mb-1">Download Queued!</p>
                <p class="text-green-400 text-sm">
                  The episode has been added to your downloads. Click below to
                  play when ready.
                </p>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <Show when={isCheckingFileType()}>
              <div class="bg-blue-900/40 border border-blue-700 rounded-lg p-3 mb-3">
                <div class="flex items-center gap-3">
                  <div class="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin flex-shrink-0" />
                  <p class="text-blue-300 text-sm font-medium">
                    Checking file type...
                  </p>
                </div>
              </div>
            </Show>

            <button
              onClick={handleStreamInPlayer}
              disabled={fileIsMp4() === false || isCheckingFileType()}
              class={`w-full py-3 px-4 rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-2 ${
                fileIsMp4() === false || isCheckingFileType()
                  ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:shadow-xl text-white"
              }`}
              title={
                fileIsMp4() === false
                  ? "This file is not an MP4 and cannot be streamed"
                  : isCheckingFileType()
                  ? "Checking file type..."
                  : ""
              }
            >
              <svg
                class="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {isCheckingFileType()
                ? "Checking file type..."
                : "Stream in Player (MP4 only)"}
            </button>

            <button
              onClick={handlePlayInVLC}
              disabled={isOpeningVLC()}
              class="w-full py-3 px-4 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
              Open in VLC
            </button>

            <Show when={isOpeningVLC()}>
              <div class="bg-blue-900/40 border border-blue-700 rounded-lg p-3">
                <div class="flex items-center gap-3">
                  <div class="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin flex-shrink-0" />
                  <p class="text-blue-300 text-sm font-medium">
                    Waiting for VLC to open...
                  </p>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={downloadError()}>
          <button
            onClick={props.onClose}
            class="w-full mt-4 py-2 px-4 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </Show>
      </div>
    </div>
  );
};

export default DownloadProgressPopup;
