import { Component, createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types/settings";
import { fetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";

interface UserInfo {
  id: string;
  username: string;
  isAdmin: boolean;
}

interface UserResponse {
  success: boolean;
  user: UserInfo;
}

const Settings: Component = () => {
  const [nachoServerUrl, setNachoServerUrl] = createSignal<string>("");
  const [nachoAuthToken, setNachoAuthToken] = createSignal<string>("");
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [verifying, setVerifying] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [successMessage, setSuccessMessage] = createSignal<string | null>(null);
  const [userInfo, setUserInfo] = createSignal<UserInfo | null>(null);
  const [verifyError, setVerifyError] = createSignal<string | null>(null);
  const [showManualConfig, setShowManualConfig] = createSignal(false);
  const [isLinked, setIsLinked] = createSignal(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const settings = await invoke<AppSettings>("get_settings");
      setNachoServerUrl(settings.nacho_server_url || "");
      setNachoAuthToken(settings.nacho_auth_token || "");

      // Check if linked by verifying if both URL and token exist
      setIsLinked(!!(settings.nacho_server_url && settings.nacho_auth_token));
    } catch (e: any) {
      console.error("Failed to load settings:", e);
      setError(e?.toString?.() ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const url = nachoServerUrl().trim() || null;
      const authToken = nachoAuthToken().trim() || null;

      const settings: AppSettings = {
        nacho_server_url: url,
        nacho_auth_token: authToken,
      };

      await invoke("save_settings", { settings });

      setSuccessMessage("Settings saved successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error("Failed to save settings:", e);
      setError(e?.toString?.() ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const verifyToken = async () => {
    try {
      setVerifying(true);
      setVerifyError(null);
      setUserInfo(null);

      const url = nachoServerUrl().trim();
      const token = nachoAuthToken().trim();

      if (!url) {
        setVerifyError("Please enter a Nacho Server URL");
        return;
      }

      if (!token) {
        setVerifyError("Please enter an authentication token");
        return;
      }

      const response = await fetch(`${url}/api/user`, {
        headers: {
          "X-Nacho-Auth": token,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setVerifyError("Invalid authentication token");
        } else {
          setVerifyError(`Failed to verify token: ${response.status}`);
        }
        return;
      }

      const data: UserResponse = await response.json();

      if (data.success && data.user) {
        setUserInfo(data.user);
        setSuccessMessage("Token verified successfully!");

        // Save the settings with the verified token
        const settings: AppSettings = {
          nacho_server_url: url,
          nacho_auth_token: token,
        };
        await invoke("save_settings", { settings });

        // Emit a custom event to notify other components about authentication
        window.dispatchEvent(
          new CustomEvent("nacho-auth-success", {
            detail: { user: data.user },
          })
        );

        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setVerifyError("Invalid response from server");
      }
    } catch (e: any) {
      console.error("Failed to verify token:", e);
      setVerifyError(e?.toString?.() ?? "Failed to connect to Nacho Server");
    } finally {
      setVerifying(false);
    }
  };

  onMount(() => {
    loadSettings();

    // Listen for settings changes from deep link authentication
    const handleSettingsChanged = () => {
      console.log("Settings changed event received, reloading...");
      loadSettings();
    };

    window.addEventListener("nacho-auth-success", handleSettingsChanged);

    // Cleanup listener
    return () => {
      window.removeEventListener("nacho-auth-success", handleSettingsChanged);
    };
  });

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-xl font-bold text-white mb-1">Settings</h2>
            <p class="text-neutral-400 text-sm">
              Configure your application preferences
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
        <Show when={loading()}>
          <div class="flex flex-col items-center justify-center py-16">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <div class="text-neutral-400 text-center">Loading settings...</div>
          </div>
        </Show>

        <Show when={error()}>
          <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
            <div class="font-semibold mb-1">Error</div>
            <div class="text-sm">{error()}</div>
          </div>
        </Show>

        <Show when={successMessage()}>
          <div class="text-green-400 bg-green-950/40 border border-green-700 rounded p-4 mb-4">
            <div class="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
              <span>{successMessage()}</span>
            </div>
          </div>
        </Show>

        <Show when={!loading()}>
          <div class="space-y-6">
            {/* Linked Status Banner */}
            <Show when={isLinked()}>
              <div class="bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-600/50 rounded-xl p-6">
                <div class="flex items-center gap-4">
                  <div class="flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-12 w-12 text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-xl font-bold text-green-300 mb-1">
                      ✓ Linked to Nacho Server
                    </h3>
                    <p class="text-green-200 text-sm">
                      Your app is successfully connected to{" "}
                      <span class="font-mono bg-green-950/50 px-2 py-0.5 rounded">
                        {nachoServerUrl()}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </Show>

            {/* Not Linked Warning */}
            <Show when={!isLinked()}>
              <div class="bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border border-yellow-600/50 rounded-xl p-6">
                <div class="flex items-center gap-4">
                  <div class="flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-12 w-12 text-yellow-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-xl font-bold text-yellow-300 mb-1">
                      Not Linked to Nacho Server
                    </h3>
                    <p class="text-yellow-200 text-sm">
                      Connect to a Nacho Server to enable torrent search and
                      watch history features.
                    </p>
                  </div>
                </div>
              </div>
            </Show>

            {/* Nacho Server URL Setting */}
            <div>
              <label class="block text-sm font-medium text-neutral-300 mb-2">
                Nacho Server URL
              </label>
              <p class="text-xs text-neutral-500 mb-3">
                Enter the URL to your Nacho proxy server (e.g.,
                http://localhost:3030)
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={nachoServerUrl()}
                  onInput={(e) => setNachoServerUrl(e.currentTarget.value)}
                  placeholder="http://localhost:3030"
                  class="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  onClick={() => {
                    const url = nachoServerUrl().trim();
                    if (url) {
                      openUrl(`${url}/link`);
                    }
                  }}
                  disabled={!nachoServerUrl().trim()}
                  class="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title="Open authentication link page"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  Link
                </button>
              </div>
              <p class="text-xs text-neutral-500 mt-2">
                Required for all API calls (TMDB, Trakt, Prowlarr)
              </p>
            </div>

            {/* Manual Token Configuration (Accordion) */}
            <div class="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
              <button
                onClick={() => setShowManualConfig(!showManualConfig())}
                class="w-full px-6 py-4 flex items-center justify-between hover:bg-neutral-750 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-neutral-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span class="font-medium text-neutral-200">
                    Manual Token Configuration
                  </span>
                  <span class="text-xs text-neutral-500 font-normal">
                    (Advanced)
                  </span>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class={`h-5 w-5 text-neutral-400 transition-transform ${
                    showManualConfig() ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              <Show when={showManualConfig()}>
                <div class="px-6 pb-6 pt-2 space-y-6 border-t border-neutral-700">
                  {/* Nacho Auth Token Setting */}
                  <div>
                    <label class="block text-sm font-medium text-neutral-300 mb-2">
                      Nacho Auth Token
                    </label>
                    <p class="text-xs text-neutral-500 mb-3">
                      Enter your Nacho proxy server authentication token
                    </p>
                    <div class="flex gap-2">
                      <input
                        type="password"
                        value={nachoAuthToken()}
                        onInput={(e) =>
                          setNachoAuthToken(e.currentTarget.value)
                        }
                        placeholder="Enter authentication token"
                        class="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
                      />
                      <button
                        onClick={verifyToken}
                        disabled={
                          verifying() || !nachoServerUrl() || !nachoAuthToken()
                        }
                        class="px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title="Verify token"
                      >
                        <Show when={verifying()}>
                          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        </Show>
                        <Show when={!verifying()}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
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
                        </Show>
                        {verifying() ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                    <p class="text-xs text-neutral-500 mt-2">
                      Required for authenticating with the proxy server
                    </p>

                    {/* User Info Display */}
                    <Show when={userInfo()}>
                      <div class="mt-3 p-3 bg-green-950/40 border border-green-700 rounded-lg">
                        <div class="flex items-center gap-2 text-green-400 text-sm">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          <div>
                            <div class="font-semibold">
                              Authenticated as: {userInfo()!.username}
                            </div>
                            <Show when={userInfo()!.isAdmin}>
                              <div class="text-xs text-green-300 mt-1">
                                Admin privileges
                              </div>
                            </Show>
                          </div>
                        </div>
                      </div>
                    </Show>

                    {/* Verify Error Display */}
                    <Show when={verifyError()}>
                      <div class="mt-3 p-3 bg-red-950/40 border border-red-700 rounded-lg">
                        <div class="flex items-center gap-2 text-red-400 text-sm">
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
                          <span>{verifyError()}</span>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>

            {/* Save Button */}
            <div class="flex justify-end gap-3 pt-4 border-t border-neutral-700">
              <button
                onClick={() => loadSettings()}
                disabled={loading() || saving()}
                class="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset
              </button>
              <button
                onClick={saveSettings}
                disabled={loading() || saving()}
                class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Show when={saving()}>
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                </Show>
                {saving() ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </Show>
      </div>

      {/* Info Section */}
      <div class="bg-blue-950/20 border border-blue-900/50 rounded-xl p-6">
        <div class="flex gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-blue-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 class="text-blue-400 font-semibold mb-1">About Nacho Server</h3>
            <p class="text-neutral-400 text-sm">
              Nacho Time requires a Nacho Server, which is a proxy server that
              routes all API calls through a centralized endpoint. It is
              required to handle authentication and proxying for TMDB, Trakt,
              and Prowlarr services and keeping safe and private all associated
              API keys and your user data. Configure your Nacho Server URL and
              authentication token here to enable <b>Torrent Search</b> for
              Movies and Shows.
            </p>
            <p class="text-neutral-400 text-sm mt-2">
              Setting up a Nacho Server is relatively trivial for a technical
              user, both locally and publically.
            </p>
            <button
              class="mt-3 text-sm text-blue-500 hover:underline cursor-pointer"
              onclick={() =>
                openUrl("https://github.com/nacho-time/nacho-time-server")
              }
            >
              Setup Nacho Server
            </button>

            <p class="text-neutral-400 text-sm mt-2">
              Don't be afraid to ask one of your more technical friends for
              help! Multiple users can share the same server.
            </p>
          </div>
        </div>
      </div>

      {/* Deep Link Authentication Info */}
      <div class="bg-purple-950/20 border border-purple-900/50 rounded-xl p-6">
        <div class="flex gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-purple-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
          <div>
            <h3 class="text-purple-400 font-semibold mb-1">
              Quick Authentication
            </h3>
            <p class="text-neutral-400 text-sm">
              You can authenticate quickly by clicking an authentication link
              from your Nacho Server's web interface. The link will
              automatically configure your server URL and authentication token.
            </p>
            <p class="text-neutral-400 text-sm mt-2">
              <span class="font-mono text-xs bg-neutral-900 px-2 py-1 rounded text-purple-400">
                nacho-time://auth?token=YOUR_TOKEN&server=SERVER_URL
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* VLC Info Section */}
      <div class="bg-orange-950/20 border border-orange-900/50 rounded-xl p-6">
        <div class="flex gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-orange-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 class="text-orange-400 font-semibold mb-1">About VLC</h3>
            <p class="text-neutral-400 text-sm">
              VLC is a free and open-source media player that supports a wide
              variety of audio and video formats. Nacho Time uses VLC to play
              your media files with high compatibility and performance.
            </p>
            <button
              class="mt-3 text-sm text-orange-500 hover:underline cursor-pointer"
              onclick={() => openUrl("https://www.videolan.org/vlc/")}
            >
              Get VLC
            </button>
          </div>
        </div>
      </div>

      {/* Attributions */}
      <div class="text-xs text-neutral-500 text-center mt-8 gap-10 flex flex-col">
        <p>Nacho Time v1.1 2025. Open Source Project.</p>
        <img
          src="src/assets/tmdb.svg"
          alt="TMDb Logo"
          class="mx-auto mt-2 mb-8 h-10 cursor-pointer hover:opacity-80 transition-opacity duration-300"
          onclick={() => openUrl("https://www.themoviedb.org")}
        />
      </div>
    </div>
  );
};

export default Settings;
