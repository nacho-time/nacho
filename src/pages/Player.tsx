import { Component, createSignal, onMount } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface PlayerProps {
  streamUrl?: string;
  title?: string;
  onClose?: () => void;
  isPopup?: boolean;
  [key: string]: any; // Allow router props
}

const Player: Component<PlayerProps> = (props) => {
  const [searchParams] = useSearchParams();
  const [error, setError] = createSignal<string | null>(null);
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  let videoRef: HTMLVideoElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  // Get stream URL from props or search params
  const streamUrl = () => {
    const url = props.streamUrl || searchParams.url || "";
    return Array.isArray(url) ? url[0] : url;
  };
  const title = () => {
    const t = props.title || searchParams.title || "Video Player";
    return Array.isArray(t) ? t[0] : t;
  };
  const isPopup = () => props.isPopup || searchParams.popup === "true";

  const toggleFullscreen = async () => {
    try {
      const appWindow = getCurrentWindow();
      const currentFullscreen = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!currentFullscreen);
      setIsFullscreen(!currentFullscreen);
    } catch (e) {
      console.error("Failed to toggle fullscreen:", e);
    }
  };

  onMount(async () => {
    if (!streamUrl()) {
      setError("No stream URL provided");
    }

    // Check initial fullscreen state
    try {
      const appWindow = getCurrentWindow();
      const currentFullscreen = await appWindow.isFullscreen();
      setIsFullscreen(currentFullscreen);
    } catch (e) {
      console.error("Failed to get fullscreen state:", e);
    }
  });

  return (
    <div
      class={`${
        isPopup()
          ? "fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          : "min-h-screen bg-neutral-900"
      }`}
    >
      <div
        ref={containerRef}
        class={`${
          isPopup()
            ? "bg-neutral-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
            : "w-full"
        } ${isFullscreen() ? "!max-w-full !max-h-full !rounded-none" : ""}`}
      >
        {/* Header */}
        <div
          class={`${
            isPopup()
              ? "flex items-center justify-between p-4 border-b border-neutral-700"
              : "p-6"
          }`}
        >
          <h1 class="text-xl font-bold text-white truncate">{title()}</h1>
          <div class="flex items-center gap-2">
            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              class="p-2 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              title={isFullscreen() ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen() ? (
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
                    d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                  />
                </svg>
              ) : (
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
                    d="M4 8V4m0 0h4M4 4l5.5 5.5M20 8V4m0 0h-4m4 0l-5.5 5.5M4 16v4m0 0h4m-4 0l5.5-5.5M20 16v4m0 0h-4m4 0l-5.5-5.5"
                  />
                </svg>
              )}
            </button>
            {/* Close Button */}
            {isPopup() && props.onClose && (
              <button
                onClick={props.onClose}
                class="p-2 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                title="Close"
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
            )}
          </div>
        </div>

        {/* Video Player */}
        <div
          class={`${
            isPopup() ? "flex-1 p-4 overflow-hidden" : "p-6"
          } bg-black ${isFullscreen() ? "!p-0" : ""}`}
        >
          {error() ? (
            <div class="flex items-center justify-center h-full">
              <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4">
                {error()}
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              controls
              autoplay
              class={`w-full h-full rounded ${
                isFullscreen() ? "max-h-screen !rounded-none" : "max-h-[70vh]"
              }`}
              src={streamUrl()}
              onError={() => setError("Failed to load video stream")}
            >
              <p class="text-white">
                Your browser doesn't support HTML5 video. Here is a{" "}
                <a href={streamUrl()} class="text-blue-400 hover:text-blue-300">
                  link to the video
                </a>{" "}
                instead.
              </p>
            </video>
          )}
        </div>

        {/* Info/Controls */}
        {!isPopup() && (
          <div class="p-6 bg-neutral-800/60 border-t border-neutral-700">
            <div class="text-neutral-400 text-sm">
              <div class="mb-2">
                <span class="font-semibold">Stream URL:</span>
                <div class="mt-1 text-xs font-mono bg-neutral-900 p-2 rounded break-all">
                  {streamUrl()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Player;
