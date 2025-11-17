/* @refresh reload */
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";

import { lazy } from "solid-js";

const Home = lazy(() => import("./pages/Home"));
const Player = lazy(() => import("./pages/Player"));

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
  );
}

// Function to show splash screen for deep link
function showDeepLinkSplash(message: string) {
  const splash = document.createElement("div");
  splash.id = "deep-link-splash";
  splash.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  splash.innerHTML = `
    <div style="text-align: center;">
      <div style="margin-bottom: 24px;">
        <div style="width: 64px; height: 64px; border: 4px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
      <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 12px; color: #3b82f6;">Authenticating...</h2>
      <p style="font-size: 16px; color: #9ca3af;">${message}</p>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  document.body.appendChild(splash);
}

function hideDeepLinkSplash() {
  const splash = document.getElementById("deep-link-splash");
  if (splash) {
    splash.remove();
  }
}

function updateDeepLinkSplash(message: string) {
  const splash = document.getElementById("deep-link-splash");
  if (splash) {
    const messageElement = splash.querySelector("p");
    if (messageElement) {
      messageElement.textContent = message;
    }
  }
}

// Function to parse deep link URL and extract auth token
async function handleAuthDeepLink(url: string) {
  // Prevent processing the same URL multiple times
  const lastProcessedUrl = localStorage.getItem("last-deep-link-url");
  const lastProcessedTime = localStorage.getItem("last-deep-link-time");

  // If we processed this exact URL in the last 10 seconds, ignore it
  if (lastProcessedUrl === url && lastProcessedTime) {
    const timeSinceProcessed = Date.now() - parseInt(lastProcessedTime);
    if (timeSinceProcessed < 10000) {
      console.log("Deep link already processed recently, ignoring duplicate");
      return;
    }
  }

  // Mark this URL as being processed
  localStorage.setItem("last-deep-link-url", url);
  localStorage.setItem("last-deep-link-time", Date.now().toString());
  console.log("Processing deep link:", url);

  try {
    // Parse the URL - expected format: nacho-time://auth?token=xxx&server=yyy
    const urlObj = new URL(url);

    if (urlObj.protocol !== "nacho-time:") {
      console.warn("Invalid protocol:", urlObj.protocol);
      return;
    }

    // Check if this is an auth link
    if (urlObj.hostname === "auth" || urlObj.pathname.startsWith("//auth")) {
      showDeepLinkSplash("Setting up authentication...");

      // Extract parameters
      const params = new URLSearchParams(urlObj.search);
      const token = params.get("token");
      const server = params.get("server");

      console.log("Auth deep link detected");
      console.log("Token:", token ? "***" : "missing");
      console.log("Server:", server);

      if (!token || !server) {
        console.error("Missing required parameters");
        alert("Invalid authentication link: missing token or server URL");
        hideDeepLinkSplash();
        return;
      }

      // Decode the server URL (in case it's URL encoded)
      const decodedServer = decodeURIComponent(server);

      // Save settings
      const settings = {
        nacho_server_url: decodedServer,
        nacho_auth_token: token,
      };

      console.log("Saving settings:", {
        nacho_server_url: decodedServer,
        nacho_auth_token: "***",
      });

      await invoke("save_settings", { settings });

      // Verify the token
      try {
        const response = await fetch(`${decodedServer}/api/user`, {
          headers: {
            "X-Nacho-Auth": token,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Authentication verified:", data);

          // Emit success event
          window.dispatchEvent(
            new CustomEvent("nacho-auth-success", {
              detail: { user: data.user },
            })
          );

          // Update splash with success message
          updateDeepLinkSplash(
            `✓ Successfully authenticated as ${data.user?.username || "user"}`
          );

          // Navigate to home page
          window.location.href = "/";
        } else {
          console.error("Token verification failed:", response.status);
          alert("Authentication failed: Invalid token");
          hideDeepLinkSplash();
        }
      } catch (e) {
        console.error("Failed to verify token:", e);
        alert(`Authentication failed: ${e}`);
        hideDeepLinkSplash();
      }
    }
  } catch (e) {
    console.error("Failed to process deep link:", e);
    alert(`Failed to process authentication link: ${e}`);
    hideDeepLinkSplash();
  }
}

if (root) {
  render(
    () => (
      <Router>
        <Route path="/" component={Home} />
        <Route path="/player" component={Player} />
      </Router>
    ),
    root
  );
}

// Initialize deep link handling
(async () => {
  // Handle deep links on startup
  const startUrls = await getCurrent();
  if (startUrls) {
    console.log("App started with deep links:", startUrls);
    for (const url of startUrls) {
      await handleAuthDeepLink(url);
    }
  }

  // Handle deep links while app is running
  await onOpenUrl((urls) => {
    console.log("Deep link received:", urls);
    for (const url of urls) {
      handleAuthDeepLink(url);
    }
  });
})();
