use serde::{Deserialize, Deserializer, Serialize};
use tauri::AppHandle;

// Custom deserializer for tmdbID that handles both string and number
fn deserialize_tmdb_id<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrNumber {
        String(String),
        Number(u64),
    }

    match StringOrNumber::deserialize(deserializer)? {
        StringOrNumber::String(s) => s.parse::<u64>().map_err(serde::de::Error::custom),
        StringOrNumber::Number(n) => Ok(n),
    }
}

// Helper function to get Nacho Server base URL
fn get_nacho_server_base_url(app: &AppHandle) -> Result<String, String> {
    let nacho_server_url = crate::settings_manager::get_nacho_server_url(app.clone())
        .map_err(|e| format!("Failed to get Nacho Server URL: {}", e))?;

    match nacho_server_url {
        Some(url) if !url.is_empty() => Ok(url.trim_end_matches('/').to_string()),
        _ => Err("Nacho Server URL not configured. Please set it in Settings.".to_string()),
    }
}

// Helper function to get auth token for Nacho Server
fn get_nacho_auth_token(app: &AppHandle) -> Result<String, String> {
    let auth_token = crate::settings_manager::get_nacho_auth_token(app.clone())
        .map_err(|e| format!("Failed to get Nacho Auth Token: {}", e))?;

    match auth_token {
        Some(token) if !token.is_empty() => Ok(token),
        _ => Err("Nacho Auth Token not configured. Please set it in Settings.".to_string()),
    }
}

// Helper function to create HTTP client with proper timeouts
fn create_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .pool_max_idle_per_host(10)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

// Watch history structures
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MovieWatchEntry {
    #[serde(rename = "tmdbID")]
    pub tmdb_id: u64,
    #[serde(rename = "timestampWatched", skip_serializing_if = "Option::is_none")]
    pub timestamp_watched: Option<String>,
    #[serde(rename = "timestampAdded", skip_serializing_if = "Option::is_none")]
    pub timestamp_added: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EpisodeWatchEntry {
    #[serde(rename = "tmdbID")]
    pub tmdb_id: u64,
    pub season: u32,
    pub episode: u32,
    #[serde(rename = "timestampWatched", skip_serializing_if = "Option::is_none")]
    pub timestamp_watched: Option<String>,
    #[serde(rename = "timestampAdded", skip_serializing_if = "Option::is_none")]
    pub timestamp_added: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AddWatchHistoryRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub movies: Option<Vec<MovieWatchEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub episodes: Option<Vec<EpisodeWatchEntry>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WatchHistoryData {
    #[serde(default)]
    pub movies: Vec<MovieHistoryItem>,
    #[serde(default)]
    pub episodes: Vec<EpisodeHistoryItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WatchHistoryCount {
    #[serde(default)]
    pub movies: u32,
    #[serde(default)]
    pub episodes: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchHistoryResponse {
    pub success: bool,
    #[serde(default)]
    pub data: WatchHistoryData,
    #[serde(default)]
    pub count: WatchHistoryCount,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MovieHistoryItem {
    #[serde(rename = "tmdbID", deserialize_with = "deserialize_tmdb_id")]
    pub tmdb_id: u64,
    #[serde(rename = "timestampWatched")]
    pub timestamp_watched: String,
    #[serde(rename = "timestampAdded")]
    pub timestamp_added: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EpisodeHistoryItem {
    #[serde(rename = "tmdbID", deserialize_with = "deserialize_tmdb_id")]
    pub tmdb_id: u64,
    pub season: u32,
    pub episode: u32,
    #[serde(rename = "timestampWatched")]
    pub timestamp_watched: String,
    #[serde(rename = "timestampAdded")]
    pub timestamp_added: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AddWatchHistoryResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<AddedData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<AddedCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AddedData {
    #[serde(default)]
    pub movies: Vec<MovieHistoryItem>,
    #[serde(default)]
    pub episodes: Vec<EpisodeHistoryItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AddedCounts {
    pub movies: u32,
    pub episodes: u32,
}

/// Get watch history for the user
///
/// # Arguments
/// * `limit` - Optional limit for number of results per category
/// * `since` - Optional ISO 8601 timestamp to filter entries after this date
#[tauri::command]
pub async fn get_watch_history(
    app: AppHandle,
    limit: Option<u32>,
    since: Option<String>,
) -> Result<WatchHistoryResponse, String> {
    println!("[WatchHistory] ========================================");
    println!("[WatchHistory] Fetching watch history...");

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = create_http_client()?;

    // Build query parameters
    let mut url = format!("{}/api/history", base_url);
    let mut query_params = vec![];

    if let Some(l) = limit {
        query_params.push(format!("limit={}", l));
    }

    if let Some(s) = since {
        query_params.push(format!("since={}", s));
    }

    if !query_params.is_empty() {
        url.push('?');
        url.push_str(&query_params.join("&"));
    }

    println!("[WatchHistory] Request URL: {}", url);
    println!("[WatchHistory] Request Headers:");
    println!("[WatchHistory]   X-Nacho-Auth: ***");

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch watch history: {}", e))?;

    let status = response.status();
    println!("[WatchHistory] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[WatchHistory] Response Body (Error): {}", error_text);
        println!("[WatchHistory] ========================================");
        return Err(format!(
            "Failed to fetch watch history: {} - {}",
            status, error_text
        ));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[WatchHistory] Response Body: {}", response_text);

    let history: WatchHistoryResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse watch history response: {}", e))?;

    println!(
        "[WatchHistory] Successfully fetched {} movies and {} episodes",
        history.data.movies.len(),
        history.data.episodes.len()
    );
    println!("[WatchHistory] ========================================");

    Ok(history)
}

/// Add a movie to watch history
///
/// # Arguments
/// * `tmdb_id` - The TMDB ID of the movie
/// * `watched_at` - Optional ISO 8601 timestamp when the movie was watched
#[tauri::command]
pub async fn add_movie_to_history(
    app: AppHandle,
    tmdb_id: u64,
    watched_at: Option<String>,
) -> Result<AddWatchHistoryResponse, String> {
    println!("[WatchHistory] ========================================");
    println!("[WatchHistory] Adding movie to watch history...");
    println!("[WatchHistory] TMDB ID: {}", tmdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = create_http_client()?;

    let request_body = AddWatchHistoryRequest {
        movies: Some(vec![MovieWatchEntry {
            tmdb_id,
            timestamp_watched: watched_at.clone(),
            timestamp_added: None, // Let server set this
        }]),
        episodes: None,
    };

    let url = format!("{}/api/history", base_url);

    println!("[WatchHistory] Request URL: {}", url);
    println!("[WatchHistory] Request Headers:");
    println!("[WatchHistory]   X-Nacho-Auth: ***");
    println!("[WatchHistory]   Content-Type: application/json");
    println!(
        "[WatchHistory] Request Body: {}",
        serde_json::to_string_pretty(&request_body).unwrap_or_default()
    );

    let response = client
        .post(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to add movie to watch history: {}", e))?;

    let status = response.status();
    println!("[WatchHistory] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[WatchHistory] Response Body (Error): {}", error_text);
        println!("[WatchHistory] ========================================");
        return Err(format!(
            "Failed to add movie to watch history: {} - {}",
            status, error_text
        ));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[WatchHistory] Response Body: {}", response_text);

    let add_response: AddWatchHistoryResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse add history response: {}", e))?;

    println!("[WatchHistory] Successfully added movie to watch history");
    println!("[WatchHistory] ========================================");

    Ok(add_response)
}

/// Add an episode to watch history
///
/// # Arguments
/// * `tmdb_id` - The TMDB ID of the TV show
/// * `season` - The season number
/// * `episode` - The episode number
/// * `watched_at` - Optional ISO 8601 timestamp when the episode was watched
#[tauri::command]
pub async fn add_episode_to_history(
    app: AppHandle,
    tmdb_id: u64,
    season: u32,
    episode: u32,
    watched_at: Option<String>,
) -> Result<AddWatchHistoryResponse, String> {
    println!("[WatchHistory] ========================================");
    println!("[WatchHistory] Adding episode to watch history...");
    println!(
        "[WatchHistory] TMDB ID: {}, S{:02}E{:02}",
        tmdb_id, season, episode
    );

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = create_http_client()?;

    let request_body = AddWatchHistoryRequest {
        movies: None,
        episodes: Some(vec![EpisodeWatchEntry {
            tmdb_id,
            season,
            episode,
            timestamp_watched: watched_at.clone(),
            timestamp_added: None, // Let server set this
        }]),
    };

    let url = format!("{}/api/history", base_url);

    println!("[WatchHistory] Request URL: {}", url);
    println!("[WatchHistory] Request Headers:");
    println!("[WatchHistory]   X-Nacho-Auth: ***");
    println!("[WatchHistory]   Content-Type: application/json");
    println!(
        "[WatchHistory] Request Body: {}",
        serde_json::to_string_pretty(&request_body).unwrap_or_default()
    );

    let response = client
        .post(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to add episode to watch history: {}", e))?;

    let status = response.status();
    println!("[WatchHistory] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[WatchHistory] Response Body (Error): {}", error_text);
        println!("[WatchHistory] ========================================");
        return Err(format!(
            "Failed to add episode to watch history: {} - {}",
            status, error_text
        ));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[WatchHistory] Response Body: {}", response_text);

    let add_response: AddWatchHistoryResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse add history response: {}", e))?;

    println!("[WatchHistory] Successfully added episode to watch history");
    println!("[WatchHistory] ========================================");

    Ok(add_response)
}

/// Add multiple movies and/or episodes to watch history in a single request
///
/// # Arguments
/// * `movies` - Optional list of movie watch entries
/// * `episodes` - Optional list of episode watch entries
#[tauri::command]
pub async fn add_batch_to_history(
    app: AppHandle,
    movies: Option<Vec<MovieWatchEntry>>,
    episodes: Option<Vec<EpisodeWatchEntry>>,
) -> Result<AddWatchHistoryResponse, String> {
    println!("[WatchHistory] ========================================");
    println!("[WatchHistory] Adding batch to watch history...");
    println!(
        "[WatchHistory] Movies: {}, Episodes: {}",
        movies.as_ref().map_or(0, |m| m.len()),
        episodes.as_ref().map_or(0, |e| e.len())
    );

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = create_http_client()?;

    let request_body = AddWatchHistoryRequest { movies, episodes };

    let url = format!("{}/api/history", base_url);

    println!("[WatchHistory] Request URL: {}", url);
    println!("[WatchHistory] Request Headers:");
    println!("[WatchHistory]   X-Nacho-Auth: ***");
    println!("[WatchHistory]   Content-Type: application/json");
    println!(
        "[WatchHistory] Request Body: {}",
        serde_json::to_string_pretty(&request_body).unwrap_or_default()
    );

    let response = client
        .post(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to add batch to watch history: {}", e))?;

    let status = response.status();
    println!("[WatchHistory] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[WatchHistory] Response Body (Error): {}", error_text);
        println!("[WatchHistory] ========================================");
        return Err(format!(
            "Failed to add batch to watch history: {} - {}",
            status, error_text
        ));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[WatchHistory] Response Body: {}", response_text);

    let add_response: AddWatchHistoryResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse add history response: {}", e))?;

    println!("[WatchHistory] Successfully added batch to watch history");
    if let Some(count) = &add_response.count {
        println!(
            "[WatchHistory] Added {} movies and {} episodes",
            count.movies, count.episodes
        );
    }
    println!("[WatchHistory] ========================================");

    Ok(add_response)
}

/// Check if a movie has been watched
///
/// # Arguments
/// * `tmdb_id` - The TMDB ID of the movie
#[tauri::command]
pub async fn is_movie_watched(app: AppHandle, tmdb_id: u64) -> Result<bool, String> {
    let history = get_watch_history(app, None, None).await?;

    let is_watched = history.data.movies.iter().any(|m| m.tmdb_id == tmdb_id);

    Ok(is_watched)
}

/// Check if an episode has been watched
///
/// # Arguments
/// * `tmdb_id` - The TMDB ID of the TV show
/// * `season` - The season number
/// * `episode` - The episode number
#[tauri::command]
pub async fn is_episode_watched(
    app: AppHandle,
    tmdb_id: u64,
    season: u32,
    episode: u32,
) -> Result<bool, String> {
    let history = get_watch_history(app, None, None).await?;

    let is_watched = history
        .data
        .episodes
        .iter()
        .any(|e| e.tmdb_id == tmdb_id && e.season == season && e.episode == episode);

    Ok(is_watched)
}

/// Get watched movies only (filtered from full history)
#[tauri::command]
pub async fn get_watched_movies(
    app: AppHandle,
    limit: Option<u32>,
) -> Result<Vec<MovieHistoryItem>, String> {
    let history = get_watch_history(app, limit, None).await?;
    Ok(history.data.movies)
}

/// Get watched episodes only (filtered from full history)
#[tauri::command]
pub async fn get_watched_episodes(
    app: AppHandle,
    limit: Option<u32>,
) -> Result<Vec<EpisodeHistoryItem>, String> {
    let history = get_watch_history(app, limit, None).await?;
    Ok(history.data.episodes)
}

/// Get watched episodes for a specific show
///
/// # Arguments
/// * `tmdb_id` - The TMDB ID of the TV show
#[tauri::command]
pub async fn get_show_watched_episodes(
    app: AppHandle,
    tmdb_id: u64,
) -> Result<Vec<EpisodeHistoryItem>, String> {
    let history = get_watch_history(app, None, None).await?;

    let show_episodes: Vec<EpisodeHistoryItem> = history
        .data
        .episodes
        .into_iter()
        .filter(|e| e.tmdb_id == tmdb_id)
        .collect();

    Ok(show_episodes)
}
