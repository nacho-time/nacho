import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type { AppSettings } from "../types/settings";

export interface NachoUserInfo {
  id: string;
  username: string;
  isAdmin: boolean;
}

export interface NachoUserResponse {
  success: boolean;
  user: NachoUserInfo;
}

/**
 * Check if user is authenticated with Nacho Server
 * @returns true if user has valid credentials
 */
export async function isNachoAuthenticated(): Promise<boolean> {
  try {
    const settings = await invoke<AppSettings>("get_settings");

    if (!settings.nacho_server_url || !settings.nacho_auth_token) {
      return false;
    }

    const response = await fetch(`${settings.nacho_server_url}/api/user`, {
      headers: {
        "X-Nacho-Auth": settings.nacho_auth_token,
      },
    });

    if (response.ok) {
      const data: NachoUserResponse = await response.json();
      return data.success && !!data.user;
    }

    return false;
  } catch (error) {
    console.error("Failed to check Nacho authentication:", error);
    return false;
  }
}

/**
 * Get current authenticated user info
 * @returns user info if authenticated, null otherwise
 */
export async function getNachoUserInfo(): Promise<NachoUserInfo | null> {
  try {
    const settings = await invoke<AppSettings>("get_settings");

    if (!settings.nacho_server_url || !settings.nacho_auth_token) {
      return null;
    }

    const response = await fetch(`${settings.nacho_server_url}/api/user`, {
      headers: {
        "X-Nacho-Auth": settings.nacho_auth_token,
      },
    });

    if (response.ok) {
      const data: NachoUserResponse = await response.json();
      return data.success && data.user ? data.user : null;
    }

    return null;
  } catch (error) {
    console.error("Failed to get Nacho user info:", error);
    return null;
  }
}
