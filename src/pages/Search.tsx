import {
  Component,
  createSignal,
  onMount,
  For,
  Show,
  onCleanup,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getPosterUrl } from "../lib/tmdb";
import MovieDetails from "../components/MovieDetails";
import SeriesDetails from "../components/SeriesDetails";
import { BiRegularMovie } from "solid-icons/bi";
import { HiSolidTv } from "solid-icons/hi";

interface SearchMovieResult {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
  genre_ids?: number[];
}

interface SearchShowResult {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
}

interface SearchMoviesResponse {
  page: number;
  results: SearchMovieResult[];
  total_results: number;
  total_pages: number;
}

interface SearchShowsResponse {
  page: number;
  results: SearchShowResult[];
  total_results: number;
  total_pages: number;
}

// Reusable search movie card component
const SearchMovieCard: Component<{
  item: SearchMovieResult;
  onSelect: (item: SearchMovieResult) => void;
}> = (props) => {
  const [isVisible, setIsVisible] = createSignal(false);
  let cardRef: HTMLDivElement | undefined;

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

  const posterUrl = () =>
    props.item.poster_path
      ? getPosterUrl(props.item.poster_path, "w342")
      : null;

  const year = () => {
    if (!props.item.release_date) return null;
    return new Date(props.item.release_date).getFullYear();
  };

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(props.item);
  };

  return (
    <div
      ref={cardRef}
      class="relative group overflow-hidden border border-neutral-800 hover:border-blue-500 hover:shadow-blue-500/20 transition-all duration-300 hover:z-10 hover:shadow-2xl hover:scale-105 cursor-pointer flex-shrink-0 w-[200px]"
      onClick={handleClick}
    >
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
            alt={props.item.title}
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
          {props.item.title}
        </h3>

        <div class="flex items-center gap-3 text-xs text-neutral-300 mb-3">
          <Show when={year()}>
            <span>{year()}</span>
          </Show>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <Show when={props.item.vote_average}>
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
                  {props.item.vote_average?.toFixed(1)}
                </span>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

// Reusable search show card component
const SearchShowCard: Component<{
  item: SearchShowResult;
  onSelect: (item: SearchShowResult) => void;
}> = (props) => {
  const [isVisible, setIsVisible] = createSignal(false);
  let cardRef: HTMLDivElement | undefined;

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

  const posterUrl = () =>
    props.item.poster_path
      ? getPosterUrl(props.item.poster_path, "w342")
      : null;

  const year = () => {
    if (!props.item.first_air_date) return null;
    return new Date(props.item.first_air_date).getFullYear();
  };

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(props.item);
  };

  return (
    <div
      ref={cardRef}
      class="relative group overflow-hidden border border-neutral-800 hover:border-blue-500 hover:shadow-blue-500/20 transition-all duration-300 hover:z-10 hover:shadow-2xl hover:scale-105 cursor-pointer flex-shrink-0 w-[200px]"
      onClick={handleClick}
    >
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
            alt={props.item.name}
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
          {props.item.name}
        </h3>

        <div class="flex items-center gap-3 text-xs text-neutral-300 mb-3">
          <Show when={year()}>
            <span>{year()}</span>
          </Show>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <Show when={props.item.vote_average}>
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
                  {props.item.vote_average?.toFixed(1)}
                </span>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

const Search: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [movies, setMovies] = createSignal<SearchMovieResult[]>([]);
  const [shows, setShows] = createSignal<SearchShowResult[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [hasSearched, setHasSearched] = createSignal(false);
  const [isSearching, setIsSearching] = createSignal(false);

  // Modal states
  const [selectedMovie, setSelectedMovie] =
    createSignal<SearchMovieResult | null>(null);
  const [selectedShow, setSelectedShow] = createSignal<SearchShowResult | null>(
    null
  );
  const [movieDetailsOpen, setMovieDetailsOpen] = createSignal(false);
  const [showDetailsOpen, setShowDetailsOpen] = createSignal(false);

  let searchInputRef: HTMLInputElement | undefined;
  let searchTimeoutId: number | undefined;

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setMovies([]);
      setShows([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const [moviesResponse, showsResponse] = await Promise.all([
        invoke<SearchMoviesResponse>("search_tmdb_movies", { query, page: 1 }),
        invoke<SearchShowsResponse>("search_tmdb_shows", { query, page: 1 }),
      ]);

      setMovies(moviesResponse.results);
      setShows(showsResponse.results);
    } catch (e: any) {
      console.error("Search failed:", e);
      setError(e?.toString?.() ?? "Search failed");
      setMovies([]);
      setShows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInput = (e: InputEvent) => {
    const value = (e.target as HTMLInputElement).value;
    setSearchQuery(value);

    // Debounce search
    if (searchTimeoutId) {
      clearTimeout(searchTimeoutId);
    }

    if (value.trim()) {
      setIsSearching(true);
      searchTimeoutId = window.setTimeout(() => {
        performSearch(value);
      }, 500);
    } else {
      setIsSearching(false);
      setMovies([]);
      setShows([]);
      setHasSearched(false);
    }
  };

  const handleMovieSelect = (movie: SearchMovieResult) => {
    setSelectedMovie(movie);
    setMovieDetailsOpen(true);
  };

  const handleShowSelect = (show: SearchShowResult) => {
    setSelectedShow(show);
    setShowDetailsOpen(true);
  };

  onMount(() => {
    // Focus on the search input when mounted
    if (searchInputRef) {
      searchInputRef.focus();
    }
  });

  onCleanup(() => {
    if (searchTimeoutId) {
      clearTimeout(searchTimeoutId);
    }
  });

  return (
    <div class="h-full px-6">
      {/* Search Bar Container - Animated */}
      <div
        class="transition-transform duration-700 ease-out"
        style={{
          transform: isSearching()
            ? "translateY(0)"
            : "translateY(calc(30vh - 50%))",
        }}
      >
        <div class="w-full max-w-3xl mx-auto pt-2">
          <div class="relative">
            {/* Search Icon */}
            <div class="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* Search Input */}
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for movies or TV shows..."
              value={searchQuery()}
              onInput={handleSearchInput}
              class="w-full pl-16 pr-6 py-5 bg-neutral-800/80 border border-neutral-700 rounded-2xl text-white placeholder-neutral-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 text-lg"
            />

            {/* Clear Button */}
            <Show when={searchQuery()}>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setMovies([]);
                  setShows([]);
                  setHasSearched(false);
                  setIsSearching(false);
                  if (searchInputRef) searchInputRef.focus();
                }}
                class="absolute inset-y-0 right-0 pr-6 flex items-center text-neutral-400 hover:text-white transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </Show>
          </div>

          {/* Search hint text */}
          <Show when={!isSearching()}>
            <p class="text-center text-neutral-400 mt-4 text-sm">
              Search by title, actor, director, or keywords
            </p>
          </Show>
        </div>
      </div>

      {/* Results Section */}
      <Show when={isSearching()}>
        <div class="space-y-8">
          {/* Loading State */}
          <Show when={loading()}>
            <div class="flex flex-col items-center justify-center py-16">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p class="text-neutral-400">Searching...</p>
            </div>
          </Show>

          {/* Error State */}
          <Show when={error()}>
            <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
              {error()}
            </div>
          </Show>

          {/* No Results */}
          <Show
            when={
              !loading() &&
              hasSearched() &&
              movies().length === 0 &&
              shows().length === 0
            }
          >
            <div class="text-center py-16">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-16 w-16 text-neutral-600 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 class="text-xl font-semibold text-neutral-300 mb-2">
                No results found
              </h3>
              <p class="text-neutral-500">
                Try searching with different keywords
              </p>
            </div>
          </Show>

          {/* Movies Results */}
          <Show when={!loading() && movies().length > 0}>
            <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700 mt-6">
              <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-neutral-100 flex items-center gap-2">
                  <BiRegularMovie />
                  Movies
                </h2>
                <span class="text-sm text-neutral-400">
                  {movies().length} results
                </span>
              </div>

              <div class="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
                <For each={movies()}>
                  {(movie) => (
                    <SearchMovieCard
                      item={movie}
                      onSelect={handleMovieSelect}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* TV Shows Results */}
          <Show when={!loading() && shows().length > 0}>
            <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
              <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-neutral-100 flex items-center gap-2">
                  <HiSolidTv />
                  TV Shows
                </h2>
                <span class="text-sm text-neutral-400">
                  {shows().length} results
                </span>
              </div>

              <div class="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
                <For each={shows()}>
                  {(show) => (
                    <SearchShowCard item={show} onSelect={handleShowSelect} />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Movie Details Modal */}
      <Show when={selectedMovie() && movieDetailsOpen()}>
        <MovieDetails
          isOpen={true}
          onClose={() => {
            setMovieDetailsOpen(false);
            setSelectedMovie(null);
          }}
          tmdbId={selectedMovie()!.id}
          imdbId={undefined}
          traktSlug={undefined}
          movieTitle={selectedMovie()!.title}
        />
      </Show>

      {/* Show Details Modal */}
      <Show when={selectedShow() && showDetailsOpen()}>
        <SeriesDetails
          isOpen={true}
          onClose={() => {
            setShowDetailsOpen(false);
            setSelectedShow(null);
          }}
          tmdbId={selectedShow()!.id}
          imdbId={undefined}
          traktSlug={undefined}
          showTitle={selectedShow()!.name}
        />
      </Show>
    </div>
  );
};

export default Search;
