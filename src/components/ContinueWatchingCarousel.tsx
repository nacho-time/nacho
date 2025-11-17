import { Component, createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { type WatchedShowItem } from "../types/trakt";
import { getPosterUrl, getBackdropUrl } from "../lib/tmdb";

interface ContinueWatchingCarouselProps {
  shows: WatchedShowItem[];
  onShowSelect?: (show: WatchedShowItem) => void;
  onWatchEpisode?: (show: WatchedShowItem, episodeDetails: any) => void;
}

interface ShowWithNextEpisode {
  show: WatchedShowItem;
  backdropPath?: string;
  nextEpisode?: {
    season: number;
    episode: number;
    name: string;
    overview?: string;
    still_path?: string;
    air_date?: string;
  };
}

const ContinueWatchingCarousel: Component<ContinueWatchingCarouselProps> = (
  props
) => {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [showDetails, setShowDetails] = createSignal<ShowWithNextEpisode[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Fetch TMDB details and next episode info for all shows
  const fetchShowDetails = async () => {
    setLoading(true);
    const details: ShowWithNextEpisode[] = [];

    for (const show of props.shows.slice(0, 10)) {
      try {
        if (show.show.ids.tmdb) {
          // Get show backdrop
          const tmdbData = await invoke<{
            backdrop_path?: string;
          }>("get_tmdb_show", {
            tmdbId: show.show.ids.tmdb,
          });

          // Get next episode to watch - fetch from API instead of local storage
          let nextEpisode = undefined;
          try {
            // Fetch watch history from API to get accurate latest episode
            interface EpisodeHistoryItem {
              tmdbID: number;
              season: number;
              episode: number;
              timestampWatched: string;
              timestampAdded: string;
            }

            const watchHistory = await invoke<EpisodeHistoryItem[]>(
              "get_show_watched_episodes",
              {
                tmdbId: show.show.ids.tmdb,
              }
            );

            let nextSeason = 1;
            let nextEpisodeNum = 1;

            // Find the most recently watched episode by timestamp (for continue watching)
            if (watchHistory && watchHistory.length > 0) {
              let latestWatched: { season: number; episode: number } | null =
                null;
              let latestTimestamp = "";

              watchHistory.forEach((item) => {
                if (item.timestampWatched > latestTimestamp) {
                  latestTimestamp = item.timestampWatched;
                  latestWatched = {
                    season: item.season,
                    episode: item.episode,
                  };
                }
              });

              if (latestWatched) {
                // TypeScript assertion: we know latestWatched is not null here
                const latest = latestWatched as {
                  season: number;
                  episode: number;
                };

                // Next episode is the one after the latest watched
                nextSeason = latest.season;
                nextEpisodeNum = latest.episode + 1;

                console.log(
                  `[ContinueWatching] ${show.show.title} - Last watched: S${latest.season}:E${latest.episode}, trying next: S${nextSeason}:E${nextEpisodeNum}`
                );
              }
            }

            // Try to fetch the next episode from TMDB
            try {
              const episodeData = await invoke<{
                name: string;
                overview?: string;
                still_path?: string;
                air_date?: string;
              }>("get_tmdb_episode", {
                tmdbId: show.show.ids.tmdb,
                seasonNumber: nextSeason,
                episodeNumber: nextEpisodeNum,
              });

              nextEpisode = {
                season: nextSeason,
                episode: nextEpisodeNum,
                name: episodeData.name,
                overview: episodeData.overview,
                still_path: episodeData.still_path,
                air_date: episodeData.air_date,
              };

              console.log(
                `[ContinueWatching] Successfully fetched episode: ${episodeData.name}`
              );
            } catch (episodeError) {
              // If next episode doesn't exist, try the first episode of next season
              if (watchHistory && watchHistory.length > 0) {
                try {
                  const nextSeasonData = await invoke<{
                    name: string;
                    overview?: string;
                    still_path?: string;
                    air_date?: string;
                  }>("get_tmdb_episode", {
                    tmdbId: show.show.ids.tmdb,
                    seasonNumber: nextSeason + 1,
                    episodeNumber: 1,
                  });

                  nextEpisode = {
                    season: nextSeason + 1,
                    episode: 1,
                    name: nextSeasonData.name,
                    overview: nextSeasonData.overview,
                    still_path: nextSeasonData.still_path,
                    air_date: nextSeasonData.air_date,
                  };

                  console.log(
                    `[ContinueWatching] Moved to next season: S${
                      nextSeason + 1
                    }:E1`
                  );
                } catch (nextSeasonError) {
                  console.log(
                    `[ContinueWatching] No more episode
                        s available for ${show.show.title}, error:`,
                    nextSeasonError
                  );
                }
              }
            }
          } catch (e) {
            console.error(
              `Failed to fetch next episode for ${show.show.title}:`,
              e
            );
          }

          details.push({
            show,
            backdropPath: tmdbData.backdrop_path,
            nextEpisode,
          });
        } else {
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
    <div class="relative w-full h-[70vh] overflow-hidden rounded-xl group bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/50">
      <Show
        when={!loading() && showDetails().length > 0}
        fallback={
          <div class="w-full h-full bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center">
            <div class="flex flex-col items-center gap-4">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <div class="text-neutral-400">Loading your shows...</div>
            </div>
          </div>
        }
      >
        {/* Main Carousel */}
        <div class="relative w-full h-full">
          <For each={showDetails()}>
            {(item, index) => (
              <div
                class="absolute inset-0 transition-opacity duration-700"
                classList={{
                  "opacity-100 z-10": index() === currentIndex(),
                  "opacity-0 z-0": index() !== currentIndex(),
                }}
              >
                {/* Series Backdrop */}
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

                {/* Gradient Overlays */}
                <div class="absolute inset-0 bg-gradient-to-r from-neutral-900/95 via-neutral-900/80 to-transparent" />
                <div class="absolute inset-0 bg-gradient-to-t from-neutral-900/95 via-transparent to-transparent" />

                {/* Content */}
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full max-w-7xl mx-auto px-8 flex gap-8 items-center">
                    {/* Episode Still/Poster */}
                    <div class="flex-shrink-0 hidden md:block">
                      <Show
                        when={item.nextEpisode?.still_path}
                        fallback={
                          <div class="w-96 h-56 bg-neutral-800/60 rounded-lg flex items-center justify-center border-2 border-neutral-700/50">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-16 w-16 text-neutral-600"
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
                          src={
                            getPosterUrl(item.nextEpisode!.still_path, "w500")!
                          }
                          alt={item.nextEpisode!.name}
                          class="w-96 h-auto object-cover rounded-lg shadow-2xl border-2 border-neutral-700/50"
                        />
                      </Show>
                    </div>

                    {/* Show & Episode Info */}
                    <div class="flex-1 max-w-2xl space-y-4">
                      {/* Series Title */}
                      <div class="text-sm text-neutral-400 uppercase tracking-wider font-semibold">
                        Continue Watching
                      </div>
                      <h1 class="font-bold text-white drop-shadow-2xl leading-tight text-4xl md:text-5xl">
                        {item.show.show.title}
                      </h1>

                      {/* Episode Info */}
                      <Show
                        when={item.nextEpisode}
                        fallback={
                          <div class="text-neutral-400 text-lg">
                            No episode information available
                          </div>
                        }
                      >
                        <div class="space-y-3">
                          <div class="space-y-1">
                            <div class="flex items-center gap-3 text-2xl text-white">
                              <span class="font-bold bg-white/10 px-3 py-1 rounded">
                                S{item.nextEpisode!.season}:E
                                {item.nextEpisode!.episode}
                              </span>
                            </div>
                            <h2 class="text-xl font-semibold text-neutral-200">
                              {item.nextEpisode!.name}
                            </h2>
                          </div>

                          <Show when={item.nextEpisode!.air_date}>
                            <div class="text-sm text-neutral-400">
                              Aired:{" "}
                              {new Date(
                                item.nextEpisode!.air_date!
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </div>
                          </Show>

                          {/* Episode Overview */}
                          <Show when={item.nextEpisode!.overview}>
                            <div class="relative group/spoiler">
                              <p class="text-base md:text-lg text-neutral-200 leading-relaxed line-clamp-3 drop-shadow-lg  transition-all duration-300">
                                {item.nextEpisode!.overview}
                              </p>
                              <div class="absolute inset-0 flex items-center justify-center bg-neutral-900/50 backdrop-blur-xl rounded  group-hover/spoiler:opacity-0 transition-opacity duration-500 pointer-events-none">
                                <div class="flex items-center gap-2 text-neutral-300 text-sm font-semibold">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-4 w-4"
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
                                  Hover to reveal, spoilers ahead
                                </div>
                              </div>
                            </div>
                          </Show>
                        </div>
                      </Show>

                      {/* Action Button - Single merged button */}
                      <div class="pt-2">
                        <button
                          onClick={() => props.onShowSelect?.(item.show)}
                          class="px-8 py-3 bg-white text-black rounded-lg font-bold text-lg flex items-center gap-3 hover:bg-neutral-200 transition-colors shadow-lg hover:scale-105 transform duration-200"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-6 w-6"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          Watch Now
                        </button>
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
          class="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-sm hover:scale-110"
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
          class="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-sm hover:scale-110"
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
      </Show>
    </div>
  );
};

export default ContinueWatchingCarousel;
