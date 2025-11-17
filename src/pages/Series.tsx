import {
  Component,
  createSignal,
  onMount,
  For,
  Show,
  createEffect,
  onCleanup,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  type TrendingShowItem,
  type WatchedShowItem,
  type HistoryItem,
} from "../types/trakt";
import { getPosterUrl } from "../lib/tmdb";
import { OcDownload2 } from "solid-icons/oc";
import { BsArrowRightSquare, BsArrowRightSquareFill } from "solid-icons/bs";
import SeriesDetails from "../components/SeriesDetails";
import SeriesCarousel from "../components/SeriesCarousel";
import ContinueWatchingCarousel from "../components/ContinueWatchingCarousel";
import { isNachoAuthenticated } from "../lib/nachoAuth";
import {
  initUserHistoryStore,
  syncWatchHistory,
  getLastRefreshTime,
} from "../lib/userHistoryStore";

interface SeriesProps {
  isVisible: boolean;
}

// Reusable show card component with lazy loading
const ShowCard: Component<{
  item: TrendingShowItem;
  isWatched: (tmdbId?: number) => boolean;
  onSelect: (item: TrendingShowItem) => void;
  shouldCheckLibrary?: boolean;
  grayOutWatched?: boolean;
  watchedBadgeText?: string;
  size?: "normal" | "large";
  isTopSeries?: boolean;
}> = (props) => {
  const tmdbId = props.item.show.ids.tmdb;
  const imdbId = props.item.show.ids.imdb;
  const [posterPath, setPosterPath] = createSignal<string | null>(null);
  const [inLibrary] = createSignal(false);
  const [isVisible, setIsVisible] = createSignal(false);

  let cardRef: HTMLDivElement | undefined;

  const hasWatched = () => props.isWatched(tmdbId);

  // Intersection Observer for lazy loading
  onMount(() => {
    if (!cardRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible()) {
            setIsVisible(true);
          }
        });
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0.01,
      }
    );

    observer.observe(cardRef);

    onCleanup(() => observer.disconnect());
  });

  // Fetch TMDB details when visible
  createEffect(() => {
    if (isVisible() && tmdbId && !posterPath()) {
      // Fetch TMDB show details to get poster
      invoke<{ poster_path?: string }>("get_tmdb_show", { tmdbId })
        .then((show) => {
          if (show.poster_path) {
            setPosterPath(show.poster_path);
          }
        })
        .catch((e) => console.error("Failed to fetch TMDB show:", e));
    }
  });

  const posterUrl = () =>
    posterPath()
      ? getPosterUrl(posterPath(), props.size === "large" ? "w500" : "w342")
      : null;

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(props.item);
  };

  return (
    <div
      ref={cardRef}
      class={
        "relative group overflow-hidden border transition-all duration-300 hover:z-10 hover:shadow-2xl hover:scale-105 cursor-pointer"
      }
      classList={{
        "border-green-500 shadow-lg shadow-green-500/50 ring-1 ring-green-500/30":
          inLibrary() && !hasWatched(),
        "border-neutral-800 hover:border-blue-500 hover:shadow-blue-500/20":
          !inLibrary() || hasWatched(),
        "brightness-[0.3]": hasWatched() && (props.grayOutWatched ?? true),
      }}
      onClick={handleClick}
    >
      {/* Watched indicator badge */}
      <Show when={hasWatched()}>
        <div class="absolute top-2 left-2 z-10 bg-gradient-to-r from-cyan-500 to-purple-500 backdrop-blur-sm rounded px-2 py-1 shadow-lg shadow-purple-500/50 flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3 w-3 text-white"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path
              fill-rule="evenodd"
              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-white text-xs font-semibold">
            {props.watchedBadgeText ?? "Watched"}
          </span>
        </div>
      </Show>

      {/* Downloaded indicator icon */}
      <Show when={inLibrary() && !hasWatched()}>
        <div class="absolute top-2 right-2 z-10 bg-green-500/80 backdrop-blur-sm rounded-full p-1.5 shadow-lg shadow-green-500/50">
          <OcDownload2 class="w-4 h-4 text-white" />
        </div>
      </Show>

      {/* Show Poster */}
      <Show
        when={isVisible()}
        fallback={
          <div class="w-full aspect-[2/3] bg-gradient-to-br from-neutral-800 to-neutral-900" />
        }
      >
        <Show
          when={posterUrl()}
          fallback={
            <div class="w-full aspect-[2/3] bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
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
            alt={props.item.show.title}
            class="w-full aspect-[2/3] object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Show>
      </Show>

      {/* Hover Overlay */}
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <h3 class="text-white font-bold text-sm mb-2 line-clamp-2">
          {props.item.show.title}
        </h3>

        <div class="flex items-center gap-3 text-xs text-neutral-300 mb-3">
          <Show when={props.item.show.year}>
            <span>{props.item.show.year}</span>
          </Show>
          <Show when={props.item.show.network}>
            <span>•</span>
            <span>{props.item.show.network}</span>
          </Show>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <Show when={props.item.show.rating}>
              <div class="flex items-center gap-1 text-xs">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-3.5 w-3.5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span class="text-yellow-400 font-medium">
                  {props.item.show.rating?.toFixed(1)}
                </span>
              </div>
            </Show>

            <div class="flex items-center gap-1 text-xs text-blue-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fill-rule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="font-medium">{props.item.watchers}</span>
            </div>
          </div>

          <Show
            when={props.item.show.genres && props.item.show.genres.length > 0}
          >
            <div class="text-xs text-neutral-400 truncate">
              {props.item.show.genres?.[0]}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

const Series: Component<SeriesProps> = (props) => {
  const [trendingShows, setTrendingShows] = createSignal<TrendingShowItem[]>(
    []
  );
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [page, setPage] = createSignal(2);
  const [limit] = createSignal(20);
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [watchedShows, setWatchedShows] = createSignal<WatchedShowItem[]>([]);
  const [continueWatchingLimit, setContinueWatchingLimit] = createSignal(9);

  let sentinelRef: HTMLDivElement | undefined;

  const [selectedShow, setSelectedShow] = createSignal<TrendingShowItem | null>(
    null
  );
  const [showDetailsOpen, setShowDetailsOpen] = createSignal(false);

  const checkAuthentication = async () => {
    try {
      const loggedIn = await isNachoAuthenticated();
      setIsAuthenticated(loggedIn);

      if (loggedIn) {
        fetchWatchedShows();
        syncUserWatchHistory();
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  const syncUserWatchHistory = async () => {
    try {
      // Initialize the store
      await initUserHistoryStore();

      const lastRefresh = getLastRefreshTime();
      console.log(
        `[UserHistory] Last refresh: ${lastRefresh?.toISOString() || "Never"}`
      );

      // Fetch watch history from Trakt API
      // Limit to 500 most recent items to keep it fast
      const historyItems = await invoke<HistoryItem[]>(
        "get_user_watch_history",
        {
          limit: 500,
        }
      );

      console.log(
        `[UserHistory] Fetched ${historyItems.length} history items from Trakt`
      );

      // Sync to local store (only new items will be added)
      await syncWatchHistory(historyItems);

      console.log(`[UserHistory] Successfully synced watch history`);
    } catch (e) {
      console.error("Failed to sync watch history:", e);
    }
  };

  const fetchWatchedShows = async () => {
    try {
      interface EpisodeHistoryItem {
        tmdbID: number;
        season: number;
        episode: number;
        timestampWatched: string;
        timestampAdded: string;
      }

      const episodes = await invoke<EpisodeHistoryItem[]>(
        "get_watched_episodes",
        {
          limit: undefined,
        }
      );

      // Group episodes by show TMDB ID to create a list of watched shows
      const showMap = new Map<number, { lastWatched: string; count: number }>();

      episodes.forEach((ep) => {
        const existing = showMap.get(ep.tmdbID);
        if (!existing || ep.timestampWatched > existing.lastWatched) {
          showMap.set(ep.tmdbID, {
            lastWatched: ep.timestampWatched,
            count: (existing?.count || 0) + 1,
          });
        }
      });

      // Convert to WatchedShowItem format for compatibility
      const watchedShowItems: WatchedShowItem[] = Array.from(
        showMap.entries()
      ).map(([tmdbId, data]) => ({
        plays: data.count,
        last_watched_at: data.lastWatched,
        last_updated_at: data.lastWatched,
        show: {
          title: "",
          year: undefined,
          ids: {
            trakt: 0,
            slug: "",
            tmdb: tmdbId,
            imdb: undefined,
          },
        },
      }));

      setWatchedShows(watchedShowItems);
      console.log(
        `Loaded ${watchedShowItems.length} watched shows from watch history`
      );
    } catch (e) {
      console.error("Failed to fetch watched shows:", e);
    }
  };

  const isShowWatched = (tmdbId?: number): boolean => {
    if (!tmdbId) return false;
    const result = watchedShows().some(
      (watched) => watched.show.ids.tmdb === tmdbId
    );
    return result;
  };

  const getRecentlyWatchedShows = () => {
    return watchedShows()
      .sort(
        (a, b) =>
          new Date(b.last_watched_at).getTime() -
          new Date(a.last_watched_at).getTime()
      )
      .slice(0, continueWatchingLimit());
  };

  const loadMoreContinueWatching = () => {
    setContinueWatchingLimit((prev) => prev + 10);
  };

  const hasMoreContinueWatching = () => {
    return watchedShows().length > continueWatchingLimit();
  };

  const fetchTrendingShows = async (pageNum?: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const currentPage = pageNum ?? page();

      const trending = await invoke<TrendingShowItem[]>("get_popular_shows", {
        page: currentPage,
      });

      if (trending.length < limit()) {
        setHasMore(false);
      }

      if (append) {
        setTrendingShows([...trendingShows(), ...trending]);
      } else {
        setTrendingShows(trending);
      }

      setPage(currentPage);
    } catch (e: any) {
      console.error("Failed to fetch trending shows:", e);
      setError(e?.toString?.() ?? "Failed to fetch trending shows");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!props.isVisible) {
      console.log("Skipping load - component not visible");
      return;
    }

    if (!loadingMore() && hasMore() && !loading()) {
      console.log("Loading more shows...");
      fetchTrendingShows(page() + 1, true);
    }
  };

  onMount(async () => {
    // Initial check
    checkAuthentication();

    setLoading(true);
    try {
      const page1 = await invoke<TrendingShowItem[]>("get_popular_shows", {
        page: 1,
      });
      const page2 = await invoke<TrendingShowItem[]>("get_popular_shows", {
        page: 2,
      });

      setTrendingShows([...page1, ...page2]);
      setPage(2);

      if (page2.length < limit()) {
        setHasMore(false);
      }
    } catch (e: any) {
      console.error("Failed to fetch trending shows:", e);
      setError(e?.toString?.() ?? "Failed to fetch trending shows");
    } finally {
      setLoading(false);
    }

    const sentinelObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            console.log("Sentinel intersecting, attempting to load more");
            loadMore();
          }
        });
      },
      {
        root: null,
        rootMargin: "800px", // Increased from 500px for earlier triggering
        threshold: [0, 0.1, 0.5], // Multiple thresholds for better detection
      }
    );

    const checkSentinel = () => {
      if (sentinelRef) {
        sentinelObserver.observe(sentinelRef);
      } else {
        setTimeout(checkSentinel, 100);
      }
    };
    checkSentinel();

    // Backup scroll event listener to catch fast scrolling
    // This ensures we don't miss the trigger even during rapid scrolling
    let scrollTimeout: number | undefined;
    const handleScroll = () => {
      // Debounce to avoid excessive calls
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      scrollTimeout = window.setTimeout(() => {
        // Check if we're near the bottom of the page
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop =
          document.documentElement.scrollTop || document.body.scrollTop;
        const clientHeight = document.documentElement.clientHeight;

        // Trigger load more if within 1500px of bottom
        if (scrollHeight - scrollTop - clientHeight < 1500) {
          console.log("Scroll backup triggered, attempting to load more");
          loadMore();
        }
      }, 100); // 100ms debounce
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    onCleanup(() => {
      sentinelObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    });
  });

  // Refresh watch history when component becomes visible
  createEffect(() => {
    if (props.isVisible) {
      console.log("Series page became visible, refreshing watch history...");
      fetchWatchedShows();
      syncUserWatchHistory();
    }
  });

  const handleShowSelect = (show: TrendingShowItem) => {
    setSelectedShow(show);
    setShowDetailsOpen(true);
  };

  const closeShowDetails = () => {
    setShowDetailsOpen(false);
    setSelectedShow(null);

    // Refresh watch history after closing details (user may have marked episodes as watched)
    console.log("SeriesDetails closed, refreshing watch history...");
    fetchWatchedShows();
    syncUserWatchHistory();
  };

  return (
    <div class="space-y-6">
      {/* Header */}
      {/* <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <div class="flex justify-between items-center">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <h2 class="text-xl font-bold text-white">TV Series</h2>
              <Show when={isAuthenticated()}>
                <span class="px-2 py-1 bg-green-900/40 text-green-400 text-xs font-medium rounded border border-green-700 flex items-center gap-1">
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
                  Authenticated
                </span>
              </Show>
            </div>
            <p class="text-neutral-400 text-sm">
              Discover what's trending on Trakt.tv
              <Show when={isAuthenticated()}> - Using your Trakt account</Show>
            </p>
          </div>
        </div>
      </div> */}

      {/* Continue Watching Carousel - Shows next episode to watch */}
      <Show when={getRecentlyWatchedShows().length > 0}>
        <div class="mb-8">
          <ContinueWatchingCarousel
            shows={getRecentlyWatchedShows()}
            onShowSelect={(show) => {
              // Convert WatchedShowItem to TrendingShowItem for handleShowSelect
              const trendingItem: TrendingShowItem = {
                watchers: 0,
                show: show.show,
              };
              handleShowSelect(trendingItem);
            }}
            onWatchEpisode={(show, episodeDetails) => {
              console.log("Watch episode:", show.show.title, episodeDetails);
              // TODO: Implement watch episode functionality
              // This could open the player or show details
            }}
          />
        </div>
      </Show>

      {/* Recently Watched Section */}
      <Show when={getRecentlyWatchedShows().length > 0}>
        <div class="">
          <h3 class="text-lg font-semibold text-white mb-4 px-2 flex items-center gap-4">
            Recently Watched
          </h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 w-full gap-0">
            <For each={getRecentlyWatchedShows()}>
              {(watchedItem) => {
                // Convert WatchedShowItem to TrendingShowItem format for ShowCard
                const trendingItem: TrendingShowItem = {
                  watchers: 0, // Not available in watched data
                  show: watchedItem.show,
                };
                return (
                  <ShowCard
                    item={trendingItem}
                    isWatched={isShowWatched}
                    onSelect={handleShowSelect}
                    shouldCheckLibrary={true}
                    grayOutWatched={false}
                    watchedBadgeText="In Progress"
                    size="large"
                    isTopSeries={true}
                  />
                );
              }}
            </For>
            {/* Show More button as 9th poster */}
            <Show when={hasMoreContinueWatching()}>
              <div
                onClick={loadMoreContinueWatching}
                class="relative aspect-[2/3] bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700 hover:border-neutral-600 transition-all duration-300 cursor-pointer flex items-center justify-center group"
              >
                <div class="flex flex-col items-center gap-3 px-6 text-center text-neutral-400 group-hover:text-neutral-300 transition-colors">
                  <BsArrowRightSquareFill class="text-2xl" />
                  <div class=" font-medium text-sm ">Show More</div>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      {/* Content */}
      <div class="">
        <Show when={loading()}>
          <div class="flex flex-col items-center justify-center py-16">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <div class="text-neutral-400 text-center">
              Loading trending shows...
            </div>
          </div>
        </Show>

        <Show when={error()}>
          <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
            <div class="font-semibold mb-1">Error loading trending shows</div>
            <div class="text-sm">{error()}</div>
          </div>
        </Show>

        <Show when={!loading() && !error() && trendingShows().length === 0}>
          <div class="text-neutral-400 text-center py-16">
            No trending shows found.
          </div>
        </Show>

        <Show when={!loading() && !error() && trendingShows().length > 0}>
          {/* Featured Series Carousel - Top 10 Unwatched */}
          <div class="mb-8">
            <SeriesCarousel
              shows={trendingShows()
                .filter((item) => {
                  const tmdbId = item.show.ids.tmdb;
                  return !tmdbId || !isShowWatched(tmdbId);
                })
                .slice(0, 10)}
              onShowSelect={(show) => {
                handleShowSelect(show);
              }}
            />
          </div>

          {/* Trending Shows */}
          <div class="mb-4">
            <h3 class="text-lg font-semibold text-white mb-4 px-2">
              Trending Shows
            </h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-0">
              <For each={trendingShows()}>
                {(item) => (
                  <ShowCard
                    item={item}
                    isWatched={isShowWatched}
                    onSelect={handleShowSelect}
                    shouldCheckLibrary={false}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Infinite scroll sentinel */}
          <Show when={hasMore() && !loading()}>
            <div ref={sentinelRef} class="w-full py-8 flex justify-center">
              <Show
                when={loadingMore()}
                fallback={
                  <div class="text-neutral-500 text-sm">Scroll for more...</div>
                }
              >
                <div class="flex flex-col items-center gap-3">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <div class="text-neutral-400 text-sm">
                    Loading more shows...
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* End of list message */}
          <Show when={!hasMore() && trendingShows().length > 0}>
            <div class="w-full py-8 text-center text-neutral-500 text-sm">
              You've reached the end of the list
            </div>
          </Show>
        </Show>
      </div>

      {/* Series Details Modal - Show when both conditions are true */}
      <Show when={selectedShow() && showDetailsOpen()}>
        <SeriesDetails
          isOpen={true}
          onClose={closeShowDetails}
          tmdbId={selectedShow()!.show.ids.tmdb}
          imdbId={selectedShow()!.show.ids.imdb}
          traktSlug={selectedShow()!.show.ids.slug}
          showTitle={selectedShow()!.show.title}
        />
      </Show>
    </div>
  );
};

export default Series;
