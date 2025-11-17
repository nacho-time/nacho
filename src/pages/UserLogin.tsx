import { createSignal, onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  TraktLoginCodesEvent,
  TraktLoginSuccessEvent,
  TraktLoginErrorEvent,
  TraktUserInfo,
} from "../types/trakt";
import { openUrl } from "@tauri-apps/plugin-opener";

const UserLogin: Component = () => {
  const [isLoggedIn, setIsLoggedIn] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [userInfo, setUserInfo] = createSignal<TraktUserInfo | null>(null);
  const [userCode, setUserCode] = createSignal<string | null>(null);
  const [verificationUrl, setVerificationUrl] = createSignal<string | null>(
    null
  );
  const [error, setError] = createSignal<string | null>(null);

  let unlistenCodes: UnlistenFn | undefined;
  let unlistenSuccess: UnlistenFn | undefined;
  let unlistenError: UnlistenFn | undefined;

  // Check if user is already logged in on mount
  onMount(async () => {
    try {
      const loggedIn = await invoke<boolean>("is_logged_in");
      setIsLoggedIn(loggedIn);

      // If logged in, fetch user info
      if (loggedIn) {
        try {
          const info = await invoke<TraktUserInfo>("get_user_info");
          setUserInfo(info);
        } catch (error) {
          console.error("Failed to fetch user info:", error);
        }
      }
    } catch (error) {
      console.error("Failed to check login status:", error);
      setIsLoggedIn(false);
    }

    // Set up event listeners for login flow
    unlistenCodes = await listen<TraktLoginCodesEvent>(
      "trakt:login-codes",
      (event) => {
        console.log("Received login codes:", event.payload);
        setUserCode(event.payload.user_code);
        setVerificationUrl(event.payload.verification_url);
        setIsLoading(false);
        setError(null);
      }
    );

    unlistenSuccess = await listen<TraktLoginSuccessEvent>(
      "trakt:login-success",
      async (event) => {
        console.log("Login successful:", event.payload);
        setIsLoggedIn(true);
        setUserCode(null);
        setVerificationUrl(null);
        setError(null);
        setIsLoading(false);

        // Fetch user info after successful login
        try {
          const info = await invoke<TraktUserInfo>("get_user_info");
          setUserInfo(info);
        } catch (error) {
          console.error("Failed to fetch user info:", error);
        }
      }
    );

    unlistenError = await listen<TraktLoginErrorEvent>(
      "trakt:login-error",
      (event) => {
        console.error("Login error:", event.payload);
        setError(event.payload.error);
        setUserCode(null);
        setVerificationUrl(null);
        setIsLoading(false);
      }
    );
  });

  onCleanup(() => {
    unlistenCodes?.();
    unlistenSuccess?.();
    unlistenError?.();
  });

  // Start the login flow
  const startAuth = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setUserCode(null);
      setVerificationUrl(null);
      await invoke("start_login");
      // The backend will emit events that we're listening to
    } catch (e: any) {
      setError(e.message || e || "Failed to start login");
      setIsLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await invoke("logout");
      setIsLoggedIn(false);
      setUserInfo(null);
      setError(null);
    } catch (e: any) {
      setError(e.message || e || "Failed to logout");
    } finally {
      setIsLoading(false);
    }
  };

  // UI
  return (
    <div class="flex flex-col items-center justify-center p-6 h-full overflow-auto">
      <div class="bg-neutral-800/80 backdrop-blur-sm rounded-2xl shadow-2xl p-10 w-full max-w-lg border border-neutral-700/50 my-auto">
        {/* Header */}
        <div class="flex items-center gap-3 mb-8">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-white">Trakt.tv</h1>
            <p class="text-sm text-neutral-400">Account Authentication</p>
          </div>
        </div>

        {/* Already logged in */}
        {isLoggedIn() && (
          <div class="flex flex-col space-y-6 w-full">
            {/* Success banner */}
            <div class="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <div class="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6 text-green-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <p class="text-green-400 font-semibold">
                  Connected Successfully
                </p>
                <p class="text-green-400/70 text-sm">Your account is linked</p>
              </div>
            </div>

            {/* Display user info if available */}
            {userInfo() && (
              <div class="flex flex-col items-center space-y-4 w-full bg-neutral-900/50 rounded-xl p-6 border border-neutral-700/50">
                {userInfo()!.images?.avatar?.full && (
                  <div class="relative">
                    <img
                      src={userInfo()!.images!.avatar!.full!}
                      alt="Avatar"
                      class="w-24 h-24 rounded-full border-4 border-neutral-700 shadow-xl"
                    />
                    {userInfo()!.vip && (
                      <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border-2 border-neutral-900 flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-white"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    )}
                  </div>
                )}
                <div class="text-center">
                  <div class="text-white text-xl font-semibold mb-1">
                    {userInfo()!.name || userInfo()!.username}
                  </div>
                  <div class="text-neutral-400 text-sm">
                    @{userInfo()!.username}
                  </div>
                  {userInfo()!.vip && (
                    <div class="inline-flex items-center gap-1 mt-2 text-yellow-400 text-xs font-semibold px-3 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/30">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      VIP Member
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              class="w-full px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={handleLogout}
              disabled={isLoading()}
            >
              {isLoading() ? (
                <>
                  <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Disconnecting...</span>
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span>Disconnect Account</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Not logged in - idle state */}
        {!isLoggedIn() && !userCode() && !error() && (
          <div class="flex flex-col space-y-6">
            <div class="text-center space-y-2">
              <p class="text-neutral-300">
                Connect your Trakt.tv account to sync your watch history and
                preferences.
              </p>
            </div>
            <button
              class="w-full px-6 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold text-lg transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              onClick={startAuth}
              disabled={isLoading()}
            >
              {isLoading() ? (
                <>
                  <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  <span>Initializing...</span>
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span>Connect to Trakt</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Waiting for user to enter code */}
        {!isLoggedIn() && userCode() && verificationUrl() && !error() && (
          <div class="flex flex-col space-y-6 w-full">
            {/* Instructions */}
            <div class="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5">
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 text-blue-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
                <div class="flex-1 space-y-3">
                  <p class="text-blue-400 font-semibold">
                    Complete Authorization
                  </p>
                  <ol class="space-y-2 text-sm text-blue-300/80">
                    <li class="flex items-start gap-2">
                      <span class="font-semibold min-w-[1.5rem]">1.</span>
                      <span>
                        Click the link below to open Trakt.tv in your browser
                      </span>
                    </li>
                    <li class="flex items-start gap-2">
                      <span class="font-semibold min-w-[1.5rem]">2.</span>
                      <span>Enter the code shown below</span>
                    </li>
                    <li class="flex items-start gap-2">
                      <span class="font-semibold min-w-[1.5rem]">3.</span>
                      <span>Authorize the application</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Verification URL Button */}
            <button
              class="w-full px-6 py-4 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl font-semibold transition-colors duration-200 flex items-center justify-center gap-3"
              onClick={async () => {
                const url = verificationUrl();
                if (!url) return;
                try {
                  await openUrl(url);
                } catch (e) {
                  console.error("Failed to open URL:", e);
                }
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
              <span>Open Trakt.tv</span>
            </button>

            {/* Activation Code */}
            <div class="space-y-3">
              <p class="text-sm text-neutral-400 text-center font-medium">
                Activation Code
              </p>
              <div class="relative group">
                <div class="absolute inset-0 bg-gradient-to-r from-red-500/20 to-red-600/20 rounded-xl blur-xl group-hover:blur-2xl transition-all"></div>
                <div class="relative text-4xl font-mono bg-neutral-900 px-8 py-6 rounded-xl tracking-[0.5em] text-red-400 border-2 border-red-500/50 select-all text-center shadow-2xl">
                  {userCode()}
                </div>
              </div>
            </div>

            {/* Loading indicator */}
            <div class="flex items-center justify-center gap-3 py-4">
              <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-neutral-400"></div>
              <p class="text-neutral-400 text-sm">
                Waiting for authorization...
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {!isLoggedIn() && error() && (
          <div class="flex flex-col space-y-6 w-full">
            {/* Error banner */}
            <div class="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <div class="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <p class="text-red-400 font-semibold mb-1">
                  Authentication Failed
                </p>
                <p class="text-red-400/70 text-sm">{error()}</p>
              </div>
            </div>

            <button
              class="w-full px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2"
              onClick={startAuth}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clip-rule="evenodd"
                />
              </svg>
              <span>Try Again</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserLogin;
