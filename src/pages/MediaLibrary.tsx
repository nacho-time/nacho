import { Component, createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getAllTorrentsWithImdb, type TorrentWithImdb } from "../lib/torrentDb";

interface TorrentInfo {
  id: number;
  info_hash: string;
  name: string;
  state: string;
  progress_bytes: number;
  total_bytes: number;
  finished: boolean;
}

interface EnrichedTorrent extends TorrentWithImdb {
  name: string;
  progress_bytes: number;
  total_bytes: number;
  finished: boolean;
}

const MediaLibrary: Component = () => {
  const [torrents, setTorrents] = createSignal<EnrichedTorrent[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<
    "all" | "with-imdb" | "without-imdb"
  >("with-imdb");

  const fetchMediaLibrary = async () => {
    try {
      setLoading(true);

      // Get all torrents with IMDB codes
      const torrentsWithImdb = await getAllTorrentsWithImdb();

      // Get torrent details
      const torrentList: any = await invoke("torrents_list");
      const allTorrents: TorrentInfo[] = torrentList.torrents || [];

      // Merge the data
      const enriched: EnrichedTorrent[] = torrentsWithImdb.map((t) => {
        const details = allTorrents.find(
          (torrent) => torrent.id === t.torrent_id
        );
        return {
          ...t,
          name: details?.name || "Unknown",
          progress_bytes: details?.progress_bytes || 0,
          total_bytes: details?.total_bytes || 0,
          finished: details?.finished || false,
        };
      });

      setTorrents(enriched);
      setError(null);
    } catch (e: any) {
      console.error("Failed to fetch media library:", e);
      setError(e?.toString?.() ?? "Failed to fetch media library");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    fetchMediaLibrary();
  });

  const filteredTorrents = () => {
    const all = torrents();
    switch (filter()) {
      case "with-imdb":
        return all.filter((t) => t.imdb_code !== null);
      case "without-imdb":
        return all.filter((t) => t.imdb_code === null);
      default:
        return all;
    }
  };

  const formatProgress = (torrent: EnrichedTorrent) => {
    if (torrent.total_bytes === 0) return "0%";
    return (
      ((torrent.progress_bytes / torrent.total_bytes) * 100).toFixed(1) + "%"
    );
  };

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold text-white">Media Library</h2>
          <button
            onClick={fetchMediaLibrary}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filter Tabs */}
        <div class="flex gap-2">
          <button
            onClick={() => setFilter("with-imdb")}
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter() === "with-imdb"
                ? "bg-blue-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
          >
            With IMDB Code (
            {torrents().filter((t) => t.imdb_code !== null).length})
          </button>
          <button
            onClick={() => setFilter("without-imdb")}
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter() === "without-imdb"
                ? "bg-blue-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
          >
            Without IMDB Code (
            {torrents().filter((t) => t.imdb_code === null).length})
          </button>
          <button
            onClick={() => setFilter("all")}
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter() === "all"
                ? "bg-blue-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
          >
            All ({torrents().length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <Show when={loading()}>
          <div class="text-neutral-400 text-center py-8">
            Loading media library...
          </div>
        </Show>

        <Show when={error()}>
          <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
            {error()}
          </div>
        </Show>

        <Show when={!loading() && filteredTorrents().length === 0}>
          <div class="text-neutral-400 text-center py-8">
            {filter() === "with-imdb"
              ? "No torrents with IMDB codes yet. Add IMDB codes to your torrents to see them here!"
              : filter() === "without-imdb"
              ? "All torrents have IMDB codes!"
              : "No torrents in your library yet."}
          </div>
        </Show>

        <Show when={!loading() && filteredTorrents().length > 0}>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={filteredTorrents()}>
              {(torrent) => (
                <div class="bg-neutral-900 rounded-lg p-4 border border-neutral-700 hover:border-neutral-600 transition-colors">
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0">
                      <h3 class="text-white font-semibold truncate mb-1">
                        {torrent.name}
                      </h3>
                      <Show when={torrent.imdb_code}>
                        <a
                          href={`https://www.imdb.com/title/${torrent.imdb_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 w-fit"
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
                          {torrent.imdb_code}
                        </a>
                      </Show>
                    </div>
                    <div
                      class={`px-2 py-1 rounded text-xs font-medium ${
                        torrent.finished
                          ? "bg-green-900/40 text-green-400"
                          : "bg-blue-900/40 text-blue-400"
                      }`}
                    >
                      {torrent.finished ? "Complete" : formatProgress(torrent)}
                    </div>
                  </div>

                  <div class="text-neutral-500 text-xs font-mono truncate">
                    {torrent.info_hash}
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default MediaLibrary;
