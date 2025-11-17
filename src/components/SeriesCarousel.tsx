import {
  Component,
  createSignal,
  onMount,
  onCleanup,
  For,
  Show,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { type TrendingShowItem } from "../types/trakt";
import { getBackdropUrl } from "../lib/tmdb";
import { FaSolidBowlFood } from "solid-icons/fa";
import { TbSalt } from "solid-icons/tb";
import { AiFillDollarCircle } from "solid-icons/ai";
import { FiPhone } from "solid-icons/fi";
import { FiEyeOff } from "solid-icons/fi";
import { RiCommunicationChatOffLine } from "solid-icons/ri";
import { TbUsersGroup } from "solid-icons/tb";

interface SeriesCarouselProps {
  shows: TrendingShowItem[];
  onShowSelect?: (show: TrendingShowItem) => void;
}

interface ShowWithDetails {
  show: TrendingShowItem;
  backdropPath?: string;
  backdropPaths?: string[]; // Multiple backdrop images
  posterPath?: string;
  overview?: string;
  tagline?: string;
  genres?: string[];
}

const SeriesCarousel: Component<SeriesCarouselProps> = (props) => {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [currentBackdropIndex, setCurrentBackdropIndex] = createSignal(0);
  const [showDetails, setShowDetails] = createSignal<ShowWithDetails[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isPaused, setIsPaused] = createSignal(false);
  const [progress, setProgress] = createSignal(0); // For circular countdown timer

  // Fetch TMDB details for all shows
  const fetchShowDetails = async () => {
    setLoading(true);
    const details: ShowWithDetails[] = [];

    for (const show of props.shows.slice(0, 10)) {
      try {
        if (show.show.ids.tmdb) {
          const tmdbData = await invoke<{
            backdrop_path?: string;
            poster_path?: string;
            overview?: string;
            tagline?: string;
            genres?: Array<{ id: number; name: string }>;
          }>("get_tmdb_show", {
            tmdbId: show.show.ids.tmdb,
          });

          // Fetch show images to get multiple backdrops
          let backdropPaths: string[] = [];
          try {
            const images = await invoke<{
              backdrops?: Array<{
                file_path: string;
                width: number;
                height: number;
              }>;
            }>("get_tmdb_show_images", {
              tmdbId: show.show.ids.tmdb,
            });

            backdropPaths =
              images.backdrops
                ?.filter((b) => b.width >= 1280) // Only use HD (1280px) or higher resolution images
                ?.map((b) => b.file_path)
                .filter((b) => b)
                .slice(0, 5) || []; // Get up to 5 HD backdrops
          } catch (e) {
            console.error(`Failed to fetch images for ${show.show.title}:`, e);
          }

          details.push({
            show,
            backdropPath: tmdbData.backdrop_path,
            backdropPaths,
            posterPath: tmdbData.poster_path,
            overview: tmdbData.overview,
            tagline: tmdbData.tagline,
            genres: tmdbData.genres?.map((g) => g.name),
          });
        } else {
          // Add show without TMDB details
          details.push({ show });
        }
      } catch (e) {
        console.error(
          `Failed to fetch TMDB details for ${show.show.title}:`,
          e
        );
        details.push({ show });
      }
    }

    setShowDetails(details);
    setLoading(false);
  };

  onMount(() => {
    fetchShowDetails();

    // Track total elapsed time across all backdrops for the current show
    let totalElapsedMs = 0;
    const TOTAL_SHOW_DURATION_MS = 15000; // 15 seconds total per show

    // Progress animation for circular timer (updates every 50ms for smooth animation)
    const progressInterval = setInterval(() => {
      if (!isPaused()) {
        totalElapsedMs += 50;
        const progressPercent = (totalElapsedMs / TOTAL_SHOW_DURATION_MS) * 100;
        setProgress(Math.min(progressPercent, 100));
      }
    }, 50);

    // Backdrop cycling - change backdrop every 3 seconds
    const backdropInterval = setInterval(() => {
      if (!isPaused()) {
        const currentShow = showDetails()[currentIndex()];
        const backdropCount =
          currentShow?.backdropPaths?.length ||
          (currentShow?.backdropPath ? 1 : 0);

        if (backdropCount > 0) {
          setCurrentBackdropIndex((prev) => {
            const next = prev + 1;
            // If we've cycled through all backdrops, move to next show
            if (next >= backdropCount) {
              // Move to next show
              setCurrentIndex(
                (prevShow) => (prevShow + 1) % Math.min(props.shows.length, 10)
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
        (prev - 1 + Math.min(props.shows.length, 10)) %
        Math.min(props.shows.length, 10)
    );
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % Math.min(props.shows.length, 10));
  };

  return (
    <div
      class="relative w-full h-[70vh] overflow-hidden rounded-xl group bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <Show
        when={!loading() && showDetails().length > 0}
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
          <For each={showDetails()}>
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
                        alt={item.show.show.title}
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
                          alt={`${item.show.show.title} backdrop ${
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
                <div class="absolute bottom-0 left-0 right-0 p-8">
                  <div class="max-w-3xl">
                    {/* Translucent blob background - fades in/out on hover */}
                    <div class="relative">
                      <div class="absolute inset-0 bg-neutral-900/20 backdrop-blur-md rounded-2xl opacity-100 group-hover:opacity-0 transition-opacity duration-500" />

                      <div class="relative p-6">
                        {/* Title */}
                        <h1 class="font-bold text-white drop-shadow-2xl leading-tight text-4xl md:text-5xl">
                          {item.show.show.title}
                        </h1>

                        {/* Tagline */}
                        <Show when={item.tagline}>
                          <p class="mt-3 italic text-neutral-300 drop-shadow-lg text-base md:text-lg">
                            "{item.tagline}"
                          </p>
                        </Show>

                        {/* Meta Info */}
                        <div class="mt-3 flex flex-wrap items-center gap-3 text-neutral-200 text-base">
                          <Show when={item.show.show.year}>
                            <span class="font-medium">
                              {item.show.show.year}
                            </span>
                          </Show>

                          <Show when={item.show.show.rating}>
                            <div class="flex items-center gap-2">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="text-yellow-400 w-5 h-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              <span class="font-semibold text-yellow-400">
                                {item.show.show.rating?.toFixed(1)}
                              </span>
                            </div>
                          </Show>

                          <Show when={item.show.show.runtime}>
                            <span>{item.show.show.runtime} min</span>
                          </Show>
                        </div>

                        {/* Genres */}
                        <Show when={item.genres && item.genres.length > 0}>
                          <div class="mt-3 flex flex-wrap gap-2">
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
                        <Show when={item.overview}>
                          <div class="overflow-hidden transition-[max-height] duration-500 ease-out max-h-0 group-hover:max-h-32">
                            <p class="mt-3 text-base md:text-lg text-neutral-200 leading-relaxed line-clamp-3 drop-shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                              {item.overview}
                            </p>
                          </div>
                        </Show>

                        {/* Action Button - Only visible on hover */}
                        <div class="overflow-hidden transition-[max-height] duration-500 ease-out max-h-0 group-hover:max-h-20">
                          <div class="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                            <button
                              onClick={() => props.onShowSelect?.(item.show)}
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
          aria-label="Previous show"
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
          aria-label="Next show"
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
          <For each={showDetails()}>
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
                aria-label={`Go to show ${index() + 1}`}
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

export default SeriesCarousel;
