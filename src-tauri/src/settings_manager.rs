use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub nacho_server_url: Option<String>,
    pub nacho_auth_token: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            nacho_server_url: None,
            nacho_auth_token: None,
        }
    }
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Failed to get app data directory")?;

    fs::create_dir_all(&app_data_dir).context("Failed to create app data directory")?;

    Ok(app_data_dir.join("settings.json"))
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    let settings_path = get_settings_path(&app).map_err(|e| e.to_string())?;

    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }

    let contents = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let settings: AppSettings =
        serde_json::from_str(&contents).map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let settings_path = get_settings_path(&app).map_err(|e| e.to_string())?;

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json).map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn update_nacho_server_url(app: AppHandle, url: Option<String>) -> Result<AppSettings, String> {
    let mut settings = get_settings(app.clone())?;
    settings.nacho_server_url = url;
    save_settings(app, settings.clone())?;
    Ok(settings)
}

#[tauri::command]
pub fn get_nacho_server_url(app: AppHandle) -> Result<Option<String>, String> {
    let settings = get_settings(app)?;
    Ok(settings.nacho_server_url)
}

#[tauri::command]
pub fn update_nacho_auth_token(
    app: AppHandle,
    auth_token: Option<String>,
) -> Result<AppSettings, String> {
    let mut settings = get_settings(app.clone())?;
    settings.nacho_auth_token = auth_token;
    save_settings(app, settings.clone())?;
    Ok(settings)
}

#[tauri::command]
pub fn get_nacho_auth_token(app: AppHandle) -> Result<Option<String>, String> {
    let settings = get_settings(app)?;
    Ok(settings.nacho_auth_token)
}
