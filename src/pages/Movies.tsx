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
import { type TrendingMovieItem, type WatchedMovieItem } from "../types/trakt";
import { getPosterUrl } from "../lib/tmdb";
import MovieDetails from "../components/MovieDetails";
import MovieCarousel from "../components/MovieCarousel";
import { OcDownload2 } from "solid-icons/oc";

import { isNachoAuthenticated } from "../lib/nachoAuth";

interface MoviesProps {
  isVisible: boolean;
}

// Reusable movie card component with lazy loading
const MovieCard: Component<{
  item: TrendingMovieItem;
  isWatched: (tmdbId?: number) => boolean;
  onSelect: (item: TrendingMovieItem) => void;
  shouldCheckLibrary?: boolean;
}> = (props) => {
  const tmdbId = props.item.movie.ids.tmdb;
  const imdbId = props.item.movie.ids.imdb;
  const [posterPath, setPosterPath] = createSignal<string | null>(null);
  const [inLibrary, setInLibrary] = createSignal(false);
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
      invoke<{ poster_path?: string }>("get_tmdb_movie", { tmdbId })
        .then((movie) => {
          if (movie.poster_path) {
            setPosterPath(movie.poster_path);
          }
        })
        .catch((e) => console.error("Failed to fetch TMDB movie:", e));
    }
  });

  // Check library status when visible
  createEffect(() => {
    if (isVisible() && props.shouldCheckLibrary && imdbId && !inLibrary()) {
      invoke<any[]>("get_library_files_by_imdb", { imdbId })
        .then((files) => {
          if (files && files.length > 0) {
            setInLibrary(true);
          }
        })
        .catch((e) => console.error("Failed to check library status:", e));
    }
  });

  const posterUrl = () =>
    posterPath() ? getPosterUrl(posterPath(), "w342") : null;

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(props.item);
  };

  return (
    <div
      ref={cardRef}
      class="relative group overflow-hidden border transition-all duration-300 hover:z-10 hover:shadow-2xl hover:scale-105 cursor-pointer flex-shrink-0"
      classList={{
        "border-green-500 shadow-lg shadow-green-500/50 ring-1 ring-green-500/30":
          inLibrary() && !hasWatched(),
        "border-neutral-800 hover:border-blue-500 hover:shadow-blue-500/20":
          !inLibrary() || hasWatched(),
        "brightness-[0.3]": hasWatched(),
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
          <span class="text-white text-xs font-semibold">Watched</span>
        </div>
      </Show>

      {/* Downloaded indicator icon */}
      <Show when={inLibrary() && !hasWatched()}>
        <div class="absolute top-2 right-2 z-10 bg-green-500/80 backdrop-blur-sm rounded-full p-1.5 shadow-lg shadow-green-500/50">
          <OcDownload2 class="w-4 h-4 text-white" />
        </div>
      </Show>

      {/* Movie Poster */}
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
            alt={props.item.movie.title}
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
          {props.item.movie.title}
        </h3>

        <div class="flex items-center gap-3 text-xs text-neutral-300 mb-3">
          <Show when={props.item.movie.year}>
            <span>{props.item.movie.year}</span>
          </Show>
          <Show when={props.item.movie.runtime}>
            <span>•</span>
            <span>{props.item.movie.runtime} min</span>
          </Show>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <Show when={props.item.movie.rating}>
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
                  {props.item.movie.rating?.toFixed(1)}
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
            when={props.item.movie.genres && props.item.movie.genres.length > 0}
          >
            <div class="text-xs text-neutral-400 truncate">
              {props.item.movie.genres?.[0]}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

const Movies: Component<MoviesProps> = (props) => {
  const [trendingMovies, setTrendingMovies] = createSignal<TrendingMovieItem[]>(
    []
  );
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [page, setPage] = createSignal(2); // Start at page 2 since we'll preload 2 pages
  const [limit] = createSignal(20);
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [watchedMovies, setWatchedMovies] = createSignal<WatchedMovieItem[]>(
    []
  );

  // Reference to the sentinel element for infinite scroll
  let sentinelRef: HTMLDivElement | undefined;

  // Movie details modal
  const [selectedMovie, setSelectedMovie] =
    createSignal<TrendingMovieItem | null>(null);
  const [detailsOpen, setDetailsOpen] = createSignal(false);

  const checkAuthentication = async () => {
    try {
      const loggedIn = await isNachoAuthenticated();
      setIsAuthenticated(loggedIn);

      // If authenticated, fetch watched movies
      if (loggedIn) {
        fetchWatchedMovies();
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  const fetchWatchedMovies = async () => {
    try {
      interface MovieHistoryItem {
        tmdbID: number;
        timestampWatched: string;
        timestampAdded: string;
      }

      const watched = await invoke<MovieHistoryItem[]>("get_watched_movies", {
        limit: undefined,
      });

      // Convert to the WatchedMovieItem format for compatibility
      // We'll track by TMDB ID now instead of IMDB ID
      const watchedMovieItems: WatchedMovieItem[] = watched.map((item) => ({
        plays: 1,
        last_watched_at: item.timestampWatched,
        last_updated_at: item.timestampAdded,
        movie: {
          title: "",
          year: undefined,
          ids: {
            trakt: 0,
            slug: "",
            tmdb: item.tmdbID,
            imdb: undefined,
          },
        },
      }));

      setWatchedMovies(watchedMovieItems);
      console.log(`Loaded ${watched.length} watched movies from watch history`);
      console.log("Watched movies data:", watched);
    } catch (e) {
      console.error("Failed to fetch watched movies:", e);
      // Don't set error state, just log it - this is not critical
    }
  };

  const isMovieWatched = (tmdbId?: number): boolean => {
    if (!tmdbId) return false;
    const result = watchedMovies().some(
      (watched) => watched.movie.ids.tmdb === tmdbId
    );
    if (result) {
      console.log(`Movie ${tmdbId} is marked as watched`);
    }
    return result;
  };

  const fetchTrendingMovies = async (pageNum?: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const currentPage = pageNum ?? page();

      const trending = await invoke<TrendingMovieItem[]>("get_popular_movies", {
        page: currentPage,
      });

      // Check if we got fewer results than expected (end of list)
      if (trending.length < limit()) {
        setHasMore(false);
      }

      if (append) {
        // Append to existing movies
        setTrendingMovies([...trendingMovies(), ...trending]);
      } else {
        // Replace with new movies
        setTrendingMovies(trending);
      }

      setPage(currentPage);
    } catch (e: any) {
      console.error("Failed to fetch trending movies:", e);
      setError(e?.toString?.() ?? "Failed to fetch trending movies");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    // Don't load if component not visible or modal is open
    if (!props.isVisible || detailsOpen()) {
      console.log("Skipping load - component not visible or modal open");
      return;
    }

    if (!loadingMore() && hasMore() && !loading()) {
      console.log("Loading more movies...");
      fetchTrendingMovies(page() + 1, true);
    }
  };

  onMount(async () => {
    checkAuthentication();

    // Preload first 2 pages of movies
    setLoading(true);
    try {
      const page1 = await invoke<TrendingMovieItem[]>("get_popular_movies", {
        page: 1,
      });
      const page2 = await invoke<TrendingMovieItem[]>("get_popular_movies", {
        page: 2,
      });

      setTrendingMovies([...page1, ...page2]);
      setPage(2); // We've loaded up to page 2

      // Check if we got fewer results than expected (end of list)
      if (page2.length < limit()) {
        setHasMore(false);
      }
    } catch (e: any) {
      console.error("Failed to fetch trending movies:", e);
      setError(e?.toString?.() ?? "Failed to fetch trending movies");
    } finally {
      setLoading(false);
    }

    // Observer for the sentinel - triggers loading when scrolled to bottom
    const sentinelObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Only trigger if sentinel is visible
          // The loadMore function will check if component is visible and modal is closed
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

    // Observe the sentinel element once it's available
    const checkSentinel = () => {
      if (sentinelRef) {
        sentinelObserver.observe(sentinelRef);
      } else {
        // Retry after a short delay if sentinel isn't ready
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

    // Cleanup
    onCleanup(() => {
      sentinelObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    });
  });

  return (
    <div class="space-y-6">
      {/* Header */}
      {/* <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <div class="flex justify-between items-center">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <h2 class="text-xl font-bold text-white">Movies</h2>
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
              Discover current trending movies
              <Show when={isAuthenticated()}>
                {" "}
                - Automatically saves your history to Trakt.tv
              </Show>
            </p>
          </div>
        </div>
      </div> */}

      {/* Content */}
      <div class="">
        <Show when={loading()}>
          <div class="flex flex-col items-center justify-center py-16">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <div class="text-neutral-400 text-center">
              Loading trending movies...
            </div>
          </div>
        </Show>

        <Show when={error()}>
          <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
            <div class="font-semibold mb-1">Error loading trending movies</div>
            <div class="text-sm">{error()}</div>
          </div>
        </Show>

        <Show when={!loading() && !error() && trendingMovies().length === 0}>
          <div class="text-neutral-400 text-center py-16">
            No trending movies found.
          </div>
        </Show>

        <Show when={!loading() && !error() && trendingMovies().length > 0}>
          {/* Featured Movies Carousel - Top 10 Unwatched */}
          <div class="mb-8">
            <MovieCarousel
              movies={trendingMovies()
                .filter((item) => {
                  const tmdbId = item.movie.ids.tmdb;
                  // If no TMDB ID, assume not watched
                  return !tmdbId || !isMovieWatched(tmdbId);
                })
                .slice(0, 10)}
              onMovieSelect={(movie) => {
                setSelectedMovie(movie);
                setDetailsOpen(true);
              }}
            />
          </div>

          {/* Downloaded & Unwatched Movies */}
          <Show
            when={(() => {
              const downloaded = trendingMovies().filter((item) => {
                const tmdbId = item.movie.ids.tmdb;
                // If no TMDB ID, assume not watched
                return !tmdbId || !isMovieWatched(tmdbId);
              });
              // Check if any have library files
              return downloaded.length > 0;
            })()}
          >
            <div class="mb-8">
              <h3 class="text-lg font-semibold text-white mb-4 px-2">
                Downloaded Movies
              </h3>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-0">
                <For
                  each={trendingMovies().filter((item) => {
                    const tmdbId = item.movie.ids.tmdb;
                    // If no TMDB ID, assume not watched
                    return !tmdbId || !isMovieWatched(tmdbId);
                  })}
                >
                  {(item) => {
                    const tmdbId = item.movie.ids.tmdb;
                    const imdbId = item.movie.ids.imdb;
                    const [inLibrary, setInLibrary] = createSignal(false);

                    // Check if movie is in library
                    if (imdbId) {
                      invoke<any[]>("get_library_files_by_imdb", { imdbId })
                        .then((files) => {
                          if (files && files.length > 0) {
                            setInLibrary(true);
                          }
                        })
                        .catch((e) =>
                          console.error("Failed to check library status:", e)
                        );
                    }

                    return (
                      <Show when={inLibrary()}>
                        <MovieCard
                          item={item}
                          isWatched={isMovieWatched}
                          onSelect={(movie) => {
                            setSelectedMovie(movie);
                            setDetailsOpen(true);
                          }}
                          shouldCheckLibrary={true}
                        />
                      </Show>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/*
          <Show
            when={(() => {
              const watched = trendingMovies().filter((item) => {
                const imdbId = item.movie.ids.imdb;
                return imdbId && isMovieWatched(imdbId);
              });
              return watched.length > 0;
            })()}
          >
            <div class="mb-8">
              <h3 class="text-lg font-semibold text-white mb-4 px-2">
                👁️ Already Watched
              </h3>
              <div class="overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-800/50 hover:scrollbar-thumb-neutral-600">
                <div class="flex gap-0 pb-2">
                  <For
                    each={trendingMovies().filter((item) => {
                      const imdbId = item.movie.ids.imdb;
                      return imdbId && isMovieWatched(imdbId);
                    })}
                  >
                    {(item) => (
                      <MovieCard
                        item={item}
                        isWatched={isMovieWatched}
                        onSelect={(movie) => {
                          setSelectedMovie(movie);
                          setDetailsOpen(true);
                        }}
                        shouldCheckLibrary={true}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show> */}

          {/* Trending Movies */}
          <div class="mb-4">
            <h3 class="text-lg font-semibold text-white mb-4 px-2">
              Trending Movies
            </h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-0">
              <For each={trendingMovies()}>
                {(item) => {
                  // TMDB will provide poster_path once we fetch movie details
                  const tmdbId = item.movie.ids.tmdb;
                  const imdbId = item.movie.ids.imdb;
                  const [posterPath, setPosterPath] = createSignal<
                    string | null
                  >(null);
                  const [inLibrary, setInLibrary] = createSignal(false);

                  // Check if movie has been watched (reactive)
                  const hasWatched = () => isMovieWatched(tmdbId);

                  // Fetch TMDB details to get poster
                  if (tmdbId) {
                    invoke<{ poster_path?: string }>("get_tmdb_movie", {
                      tmdbId,
                    })
                      .then((movie) => {
                        if (movie.poster_path) {
                          setPosterPath(movie.poster_path);
                        }
                      })
                      .catch((e) =>
                        console.error("Failed to fetch TMDB movie:", e)
                      );
                  }

                  // Check if movie is in library
                  if (imdbId) {
                    invoke<any[]>("get_library_files_by_imdb", { imdbId })
                      .then((files) => {
                        if (files && files.length > 0) {
                          setInLibrary(true);
                        }
                      })
                      .catch((e) =>
                        console.error("Failed to check library status:", e)
                      );
                  }

                  const posterUrl = () =>
                    posterPath() ? getPosterUrl(posterPath(), "w342") : null;

                  const handleClick = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedMovie(item);
                    setDetailsOpen(true);
                  };

                  return (
                    <div
                      class="relative group overflow-hidden border transition-all duration-300 hover:z-10 hover:shadow-2xl hover:scale-105 cursor-pointer"
                      classList={{
                        "border-green-500 shadow-lg shadow-green-500/50 ring-1 ring-green-500/30":
                          inLibrary() && !hasWatched(),
                        "border-neutral-800 hover:border-blue-500 hover:shadow-blue-500/20":
                          !inLibrary() || hasWatched(),
                        "brightness-[0.3]": hasWatched(),
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
                            Watched
                          </span>
                        </div>
                      </Show>

                      {/* Downloaded indicator icon - only show if not watched */}
                      <Show when={inLibrary() && !hasWatched()}>
                        <div class="absolute top-2 right-2 z-10 bg-green-500/80 backdrop-blur-sm rounded-full p-1.5 shadow-lg shadow-green-500/50">
                          <OcDownload2 class="w-4 h-4 text-white" />
                        </div>
                      </Show>

                      {/* Movie Poster */}
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
                          alt={item.movie.title}
                          class="w-full aspect-[2/3] object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </Show>

                      {/* Hover Overlay */}
                      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                        <h3 class="text-white font-bold text-sm mb-2 line-clamp-2">
                          {item.movie.title}
                        </h3>

                        <div class="flex items-center gap-3 text-xs text-neutral-300 mb-3">
                          <Show when={item.movie.year}>
                            <span>{item.movie.year}</span>
                          </Show>
                          <Show when={item.movie.runtime}>
                            <span>•</span>
                            <span>{item.movie.runtime} min</span>
                          </Show>
                        </div>

                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-3">
                            <Show when={item.movie.rating}>
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
                                  {item.movie.rating?.toFixed(1)}
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
                              <span class="font-medium">{item.watchers}</span>
                            </div>
                          </div>

                          <Show
                            when={
                              item.movie.genres && item.movie.genres.length > 0
                            }
                          >
                            <div class="text-xs text-neutral-400 truncate">
                              {item.movie.genres?.[0]}
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Infinite scroll sentinel - only visible when there's more to load */}
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
                    Loading more movies...
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* End of list message */}
          <Show when={!hasMore() && trendingMovies().length > 0}>
            <div class="w-full py-8 text-center text-neutral-500 text-sm">
              You've reached the end of the list
            </div>
          </Show>
        </Show>
      </div>

      {/* Movie Details Modal - Show when both conditions are true */}
      <Show when={selectedMovie() && detailsOpen()}>
        <MovieDetails
          isOpen={true}
          onClose={() => {
            setDetailsOpen(false);
            setSelectedMovie(null);
          }}
          tmdbId={selectedMovie()!.movie.ids.tmdb}
          imdbId={selectedMovie()!.movie.ids.imdb}
          traktSlug={selectedMovie()!.movie.ids.slug}
          movieTitle={selectedMovie()!.movie.title}
        />
      </Show>
    </div>
  );
};

export default Movies;
