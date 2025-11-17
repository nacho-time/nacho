import {
  Component,
  createSignal,
  onMount,
  onCleanup,
  For,
  Show,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { type TrendingMovieItem } from "../types/trakt";
import { getBackdropUrl } from "../lib/tmdb";
import { FaSolidBowlFood } from "solid-icons/fa";
import { TbSalt } from "solid-icons/tb";
import { AiFillDollarCircle } from "solid-icons/ai";
import { FiPhone } from "solid-icons/fi";
import { FiEyeOff } from "solid-icons/fi";
import { RiCommunicationChatOffLine } from "solid-icons/ri";
import { TbUsersGroup } from "solid-icons/tb";

interface MovieCarouselProps {
  movies: TrendingMovieItem[];
  onMovieSelect?: (movie: TrendingMovieItem) => void;
}

interface MovieWithDetails {
  movie: TrendingMovieItem;
  backdropPath?: string;
  backdropPaths?: string[]; // Multiple backdrop images
  posterPath?: string;
  overview?: string;
  tagline?: string;
  genres?: string[];
}

const MovieCarousel: Component<MovieCarouselProps> = (props) => {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [currentBackdropIndex, setCurrentBackdropIndex] = createSignal(0);
  const [movieDetails, setMovieDetails] = createSignal<MovieWithDetails[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isPaused, setIsPaused] = createSignal(false);
  const [progress, setProgress] = createSignal(0); // For circular countdown timer

  // Fetch TMDB details for all movies
  const fetchMovieDetails = async () => {
    setLoading(true);
    const details: MovieWithDetails[] = [];

    for (const movie of props.movies.slice(0, 10)) {
      try {
        if (movie.movie.ids.tmdb) {
          const tmdbData = await invoke<{
            backdrop_path?: string;
            poster_path?: string;
            overview?: string;
            tagline?: string;
            genres?: Array<{ id: number; name: string }>;
          }>("get_tmdb_movie", {
            tmdbId: movie.movie.ids.tmdb,
          });

          // Fetch movie images to get multiple backdrops
          let backdropPaths: string[] = [];
          try {
            const images = await invoke<{
              backdrops?: Array<{
                file_path: string;
                width: number;
                height: number;
              }>;
            }>("get_tmdb_movie_images", {
              tmdbId: movie.movie.ids.tmdb,
            });

            backdropPaths =
              images.backdrops
                ?.filter((b) => b.width >= 1280) // Only use HD (1280px) or higher resolution images
                ?.map((b) => b.file_path)
                .filter((b) => b)
                .slice(0, 5) || []; // Get up to 5 HD backdrops
          } catch (e) {
            console.error(
              `Failed to fetch images for ${movie.movie.title}:`,
              e
            );
          }

          details.push({
            movie,
            backdropPath: tmdbData.backdrop_path,
            backdropPaths,
            posterPath: tmdbData.poster_path,
            overview: tmdbData.overview,
            tagline: tmdbData.tagline,
            genres: tmdbData.genres?.map((g) => g.name),
          });
        } else {
          // Add movie without TMDB details
          details.push({ movie });
        }
      } catch (e) {
        console.error(
          `Failed to fetch TMDB details for ${movie.movie.title}:`,
          e
        );
        details.push({ movie });
      }
    }

    setMovieDetails(details);
    setLoading(false);
  };

  onMount(() => {
    fetchMovieDetails();

    // Track total elapsed time across all backdrops for the current movie
    let totalElapsedMs = 0;
    const TOTAL_MOVIE_DURATION_MS = 15000; // 15 seconds total per movie

    // Progress animation for circular timer (updates every 50ms for smooth animation)
    const progressInterval = setInterval(() => {
      if (!isPaused()) {
        totalElapsedMs += 50;
        const progressPercent =
          (totalElapsedMs / TOTAL_MOVIE_DURATION_MS) * 100;
        setProgress(Math.min(progressPercent, 100));
      }
    }, 50);

    // Backdrop cycling - change backdrop every 3 seconds
    const backdropInterval = setInterval(() => {
      if (!isPaused()) {
        const currentMovie = movieDetails()[currentIndex()];
        const backdropCount =
          currentMovie?.backdropPaths?.length ||
          (currentMovie?.backdropPath ? 1 : 0);

        if (backdropCount > 0) {
          setCurrentBackdropIndex((prev) => {
            const next = prev + 1;
            // If we've cycled through all backdrops, move to next movie
            if (next >= backdropCount) {
              // Move to next movie
              setCurrentIndex(
                (prevMovie) =>
                  (prevMovie + 1) % Math.min(props.movies.length, 10)
              );
              setProgress(0);
              totalElapsedMs = 0;
              return 0;
            }
            return next;
          });
        }
      }
    }, 3000);

    onCleanup(() => {
      clearInterval(progressInterval);
      clearInterval(backdropInterval);
    });
  });

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrevious = () => {
    setCurrentIndex(
      (prev) =>
        (prev - 1 + Math.min(props.movies.length, 10)) %
        Math.min(props.movies.length, 10)
    );
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % Math.min(props.movies.length, 10));
  };

  return (
    <div
      class="relative w-full h-[70vh] overflow-hidden rounded-xl group bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <Show
        when={!loading() && movieDetails().length > 0}
        fallback={
          <div class="w-full h-full bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center">
            <div class="flex flex-col items-center gap-4">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
              <div class="text-neutral-400 font-bold flex flex-col-reverse items-center gap-2">
                {(() => {
                  const comments = [
                    <>Popping popcorn</>,
                    <>Preparing guacamole</>,
                    <>Hiring actors</>,
                    <>Contacting Hollywood</>,
                    <>Enabling 4DX effects</>,
                    <>Disabling spoilers</>,
                    <>Assembling cast</>,
                    <>Decoding plot twists</>,
                    <>Polishing posters</>,
                    <>Rolling credits... just kidding, still loading.</>,
                  ];
                  return comments[Math.floor(Math.random() * comments.length)];
                })()}
              </div>
            </div>
          </div>
        }
      >
        {/* Main Carousel */}
        <div class="relative w-full h-full">
          <For each={movieDetails()}>
            {(item, index) => (
              <div
                class="absolute inset-0 transition-opacity duration-1000"
                classList={{
                  "opacity-100 z-10": index() === currentIndex(),
                  "opacity-0 z-0": index() !== currentIndex(),
                }}
              >
                {/* Backdrop Images - Cycling */}
                <Show
                  when={item.backdropPaths && item.backdropPaths.length > 0}
                  fallback={
                    <Show
                      when={item.backdropPath}
                      fallback={
                        <div class="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm" />
                      }
                    >
                      <img
                        src={getBackdropUrl(item.backdropPath, "original")!}
                        alt={item.movie.movie.title}
                        class="absolute inset-0 w-full h-full object-cover"
                      />
                    </Show>
                  }
                >
                  {/* Multiple backdrops - cycle through them */}
                  <For each={item.backdropPaths}>
                    {(backdropPath, backdropIdx) => (
                      <div
                        class="absolute inset-0 transition-opacity duration-700"
                        classList={{
                          "opacity-100":
                            index() === currentIndex() &&
                            backdropIdx() === currentBackdropIndex(),
                          "opacity-0":
                            index() !== currentIndex() ||
                            backdropIdx() !== currentBackdropIndex(),
                        }}
                      >
                        <img
                          src={getBackdropUrl(backdropPath, "original")!}
                          alt={`${item.movie.movie.title} backdrop ${
                            backdropIdx() + 1
                          }`}
                          class="absolute inset-0 w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </For>
                </Show>

                {/* Gradient Overlays - Only visible on hover */}
                <div class="absolute inset-0 bg-gradient-to-r from-neutral-900/95 via-neutral-900/75 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div class="absolute inset-0 bg-gradient-to-t from-neutral-900/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Content - Always at bottom-left */}
                <div class="absolute bottom-0 left-0 px-4 pb-10 lg:max-w-[50%]">
                  <div class="">
                    {/* Translucent blob background - fades in/out on hover */}
                    <div class="relative">
                      <div class="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm rounded-xl opacity-100 group-hover:opacity-0 transition-opacity duration-500" />

                      <div class="relative px-10 py-4">
                        {/* Title */}
                        <h1 class="aileron-black text-white drop-shadow-2xl text-4xl md:text-5xl uppercase">
                          {item.movie.movie.title}
                        </h1>

                        {/* Tagline */}
                        <Show when={item.tagline}>
                          <p class="text-2xl aileron-black uppercase">
                            {item.tagline}
                          </p>
                        </Show>

                        {/* Genres */}
                        <Show when={item.genres && item.genres.length > 0}>
                          <div class="mt-3 flex flex-wrap gap-2 ">
                            <For each={item.genres?.slice(0, 3)}>
                              {(genre) => (
                                <span class="px-3 py-1 bg-white/10 backdrop-blur-sm text-white rounded-full font-medium border border-white/20 text-sm">
                                  {genre}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>

                        {/* Overview - Only visible on hover */}
                        {/* <Show when={item.overview}>
                          <div class="overflow-hidden transition-[max-height] duration-500 ease-out max-h-0 group-hover:max-h-32">
                            <p class="mt-3 text-base md:text-lg text-neutral-200 leading-relaxed line-clamp-3 drop-shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                              {item.overview}
                            </p>
                          </div>
                        </Show> */}

                        {/* Action Button - Only visible on hover */}
                        <div class="overflow-hidden transition-[max-height] duration-500 ease-out max-h-0 group-hover:max-h-20">
                          <div class="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                            <button
                              onClick={() => props.onMovieSelect?.(item.movie)}
                              class="px-5 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors border border-white/30"
                            >
                              See More
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fill-rule="evenodd"
                                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={goToPrevious}
          class="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm hover:scale-110"
          aria-label="Previous movie"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <button
          onClick={goToNext}
          class="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm hover:scale-110"
          aria-label="Next movie"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        {/* Pagination Dots */}
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          <For each={movieDetails()}>
            {(_, index) => (
              <button
                onClick={() => goToSlide(index())}
                class="transition-all duration-300"
                classList={{
                  "w-12 h-1.5 bg-white rounded-full":
                    index() === currentIndex(),
                  "w-8 h-1.5 bg-white/40 hover:bg-white/60 rounded-full":
                    index() !== currentIndex(),
                }}
                aria-label={`Go to movie ${index() + 1}`}
              />
            )}
          </For>
        </div>

        {/* Pause Indicator */}
        <Show when={isPaused()}>
          <div class="absolute top-4 right-4 z-20 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-sm flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            Paused
          </div>
        </Show>

        {/* Circular Countdown Timer */}
        <Show when={!isPaused()}>
          <div class="absolute bottom-6 right-6 z-20">
            <svg class="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              {/* Background circle */}
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="rgba(255, 255, 255, 0.2)"
                stroke-width="3"
              />
              {/* Progress circle */}
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="rgba(255, 255, 255, 0.8)"
                stroke-width="3"
                stroke-dasharray={`${2 * Math.PI * 20}`}
                stroke-dashoffset={`${
                  2 * Math.PI * 20 * (1 - progress() / 100)
                }`}
                stroke-linecap="round"
                style={{
                  transition: "stroke-dashoffset 50ms linear",
                }}
              />
            </svg>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default MovieCarousel;
