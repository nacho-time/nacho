// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod file_server;
mod settings_manager;
mod tmdb;
mod torrent_db;
mod torrent_search;
mod torrent_server;
mod transmux;
mod watch_history;

use config::RqbitDesktopConfig;
use librqbit::{
    AddTorrentOptions, ApiError,
    api::{
        ApiAddTorrentResponse, EmptyJsonResponse, TorrentDetailsResponse, TorrentIdOrHash,
        TorrentListResponse, TorrentStats,
    },
    session_stats::snapshot::SessionStatsSnapshot,
    tracing_subscriber_config_utils::{InitLoggingOptions, init_logging},
};
use torrent_server::State;
use tracing::{info, warn};

#[tauri::command]
fn config_default() -> RqbitDesktopConfig {
    RqbitDesktopConfig::default()
}

#[tauri::command]
fn config_current(state: tauri::State<'_, State>) -> torrent_server::CurrentState {
    torrent_server::config_current(&state)
}

#[tauri::command]
async fn config_change(
    state: tauri::State<'_, State>,
    config: RqbitDesktopConfig,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::config_change(&state, config).await
}

#[tauri::command]
fn torrents_list(state: tauri::State<State>) -> Result<TorrentListResponse, ApiError> {
    torrent_server::torrents_list(&state)
}

#[tauri::command]
async fn torrent_create_from_url(
    state: tauri::State<'_, State>,
    url: String,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    torrent_server::torrent_create_from_url(&state, url, opts).await
}

#[tauri::command]
async fn torrent_create_from_base64_file(
    state: tauri::State<'_, State>,
    contents: String,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    torrent_server::torrent_create_from_base64_file(&state, contents, opts).await
}

#[tauri::command]
async fn torrent_details(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<TorrentDetailsResponse, ApiError> {
    torrent_server::torrent_details(&state, id).await
}

#[tauri::command]
async fn torrent_stats(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<TorrentStats, ApiError> {
    torrent_server::torrent_stats(&state, id).await
}

#[tauri::command]
async fn torrent_action_delete(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::torrent_action_delete(&state, id).await
}

#[tauri::command]
async fn torrent_action_pause(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::torrent_action_pause(&state, id).await
}

#[tauri::command]
async fn torrent_action_forget(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::torrent_action_forget(&state, id).await
}

#[tauri::command]
async fn torrent_action_start(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::torrent_action_start(&state, id).await
}

#[tauri::command]
async fn torrent_action_configure(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
    only_files: Vec<usize>,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::torrent_action_configure(&state, id, only_files).await
}

#[tauri::command]
async fn stats(state: tauri::State<'_, State>) -> Result<SessionStatsSnapshot, ApiError> {
    torrent_server::stats(&state).await
}

#[tauri::command]
async fn get_torrent_files(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<TorrentDetailsResponse, ApiError> {
    torrent_server::get_torrent_files(&state, id).await
}

#[tauri::command]
fn get_download_path(state: tauri::State<'_, State>) -> Result<String, ApiError> {
    torrent_server::get_download_path(&state)
}

#[tauri::command]
async fn torrent_create_with_tmdb(
    state: tauri::State<'_, State>,
    url: String,
    tmdb_id: u64,
    media_type: String,
    episode_info: Option<(i32, i32)>,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    torrent_server::torrent_create_with_tmdb(&state, url, tmdb_id, media_type, episode_info, opts)
        .await
}

#[tauri::command]
#[allow(deprecated)]
async fn torrent_create_with_imdb(
    state: tauri::State<'_, State>,
    url: String,
    imdb_code: String,
    torrent_type: Option<String>,
    episode_info: Option<(i32, i32)>,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    torrent_server::torrent_create_with_imdb(
        &state,
        url,
        imdb_code,
        torrent_type,
        episode_info,
        opts,
    )
    .await
}

#[tauri::command]
fn set_torrent_tmdb_id(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
    tmdb_id: u64,
    media_type: String,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::set_torrent_tmdb_id(&state, id, tmdb_id, media_type)
}

#[tauri::command]
#[allow(deprecated)]
fn set_torrent_imdb_code(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
    imdb_code: Option<String>,
) -> Result<EmptyJsonResponse, ApiError> {
    torrent_server::set_torrent_imdb_code(&state, id, imdb_code)
}

#[tauri::command]
fn get_torrent_tmdb_id(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<Option<(u64, String)>, ApiError> {
    torrent_server::get_torrent_tmdb_id(&state, id)
}

#[tauri::command]
#[allow(deprecated)]
fn get_torrent_imdb_code(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<Option<String>, ApiError> {
    torrent_server::get_torrent_imdb_code(&state, id)
}

#[tauri::command]
fn get_torrent_metadata(
    state: tauri::State<'_, State>,
    id: TorrentIdOrHash,
) -> Result<Option<torrent_server::TorrentMetadata>, ApiError> {
    torrent_server::get_torrent_metadata(&state, id)
}

#[tauri::command]
fn get_all_torrents_with_metadata(
    state: tauri::State<'_, State>,
) -> Result<Vec<torrent_server::TorrentWithMetadata>, ApiError> {
    torrent_server::get_all_torrents_with_metadata(&state)
}

#[tauri::command]
#[allow(deprecated)]
fn get_all_torrents_with_imdb(
    state: tauri::State<'_, State>,
) -> Result<Vec<torrent_server::TorrentWithImdb>, ApiError> {
    torrent_server::get_all_torrents_with_imdb(&state)
}

#[tauri::command]
fn get_library_files_by_tmdb_id(
    state: tauri::State<'_, State>,
    tmdb_id: u64,
    media_type: String,
) -> Result<Vec<torrent_server::TorrentWithMetadata>, ApiError> {
    torrent_server::get_library_files_by_tmdb_id(&state, tmdb_id, media_type)
}

#[tauri::command]
#[allow(deprecated)]
fn get_library_files_by_imdb(
    state: tauri::State<'_, State>,
    imdb_id: String,
) -> Result<Vec<torrent_server::TorrentWithImdb>, ApiError> {
    torrent_server::get_library_files_by_imdb(&state, imdb_id)
}

#[tauri::command]
fn get_all_library_tmdb_ids(
    state: tauri::State<'_, State>,
) -> Result<Vec<(u64, String)>, ApiError> {
    torrent_server::get_all_library_tmdb_ids(&state)
}

#[tauri::command]
#[allow(deprecated)]
fn get_all_library_imdb_codes(state: tauri::State<'_, State>) -> Result<Vec<String>, ApiError> {
    torrent_server::get_all_library_imdb_codes(&state)
}

#[tauri::command]
fn get_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn show_main(window: tauri::Window) -> Result<(), String> {
    window
        .show()
        .map_err(|e| format!("Failed to show window: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to set focus: {}", e))?;
    Ok(())
}

pub async fn start() {
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    let init_logging_result = init_logging(InitLoggingOptions {
        default_rust_log_value: Some("info"),
        log_file: None,
        log_file_rust_log: None,
    })
    .unwrap();

    match librqbit::try_increase_nofile_limit() {
        Ok(limit) => info!(limit = limit, "increased open file limit"),
        Err(e) => warn!("failed increasing open file limit: {:#}", e),
    };

    let state = State::new(init_logging_result).await;

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                // Use a simple password derivation - in production, you might want to use user input
                // For now, we'll use a fixed password stored in the app
                // You could also prompt the user for a password on first launch
                let password_bytes = password.as_bytes().to_vec();
                password_bytes
            })
            .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            show_main,
            torrents_list,
            torrent_details,
            torrent_stats,
            torrent_create_from_url,
            torrent_create_with_tmdb,
            torrent_create_with_imdb,
            torrent_action_delete,
            torrent_action_pause,
            torrent_action_forget,
            torrent_action_start,
            torrent_action_configure,
            torrent_create_from_base64_file,
            stats,
            get_torrent_files,
            get_download_path,
            set_torrent_tmdb_id,
            set_torrent_imdb_code,
            get_torrent_tmdb_id,
            get_torrent_imdb_code,
            get_torrent_metadata,
            get_all_torrents_with_metadata,
            get_all_torrents_with_imdb,
            get_version,
            config_default,
            config_current,
            config_change,
            watch_history::get_watch_history,
            watch_history::add_movie_to_history,
            watch_history::add_episode_to_history,
            watch_history::add_batch_to_history,
            watch_history::is_movie_watched,
            watch_history::is_episode_watched,
            watch_history::get_watched_movies,
            watch_history::get_watched_episodes,
            watch_history::get_show_watched_episodes,
            tmdb::get_tmdb_config,
            tmdb::get_tmdb_movie,
            tmdb::get_tmdb_movie_images,
            tmdb::get_tmdb_show,
            tmdb::get_tmdb_show_images,
            tmdb::get_tmdb_season,
            tmdb::get_tmdb_episode,
            tmdb::get_tmdb_episode_external_ids,
            tmdb::get_tmdb_season_images,
            tmdb::find_tmdb_movie_by_imdb,
            tmdb::find_tmdb_show_by_imdb,
            tmdb::build_tmdb_image_url,
            tmdb::get_poster_sizes,
            tmdb::get_backdrop_sizes,
            tmdb::get_tmdb_movie_videos,
            tmdb::search_tmdb_movies,
            tmdb::search_tmdb_shows,
            tmdb::get_popular_movies,
            tmdb::get_popular_shows,
            settings_manager::get_settings,
            settings_manager::save_settings,
            settings_manager::get_nacho_server_url,
            settings_manager::update_nacho_server_url,
            settings_manager::get_nacho_auth_token,
            settings_manager::update_nacho_auth_token,
            torrent_search::search_torrents_by_imdb,
            torrent_search::download_torrent_from_prowlarr,
            get_library_files_by_tmdb_id,
            get_library_files_by_imdb,
            get_all_library_tmdb_ids,
            get_all_library_imdb_codes,
            transmux::transmux_to_mp4,
            transmux::needs_transmux,
            transmux::get_transmux_output_path,
            file_server::init_file_server,
            file_server::set_served_file,
            file_server::get_served_file_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
