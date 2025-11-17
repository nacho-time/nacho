use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tracing::error;

// TMDB API configuration - URLs will be proxied through Nacho Server
const TMDB_API_PATH: &str = "/api/tmdb/3";
// Image URLs are not proxied - they point directly to TMDB's CDN
const TMDB_IMAGE_BASE_URL: &str = "https://image.tmdb.org/t/p";

// Helper function to get Nacho Server base URL
fn get_nacho_server_base_url(app: &AppHandle) -> Result<String, String> {
    let nacho_server_url = crate::settings_manager::get_nacho_server_url(app.clone())
        .map_err(|e| format!("Failed to get Nacho Server URL: {}", e))?;

    match nacho_server_url {
        Some(url) if !url.is_empty() => Ok(url.trim_end_matches('/').to_string()),
        _ => Err("Nacho Server URL not configured. Please set it in Settings.".to_string()),
    }
}

// Helper function to get auth token
fn get_nacho_auth_token(app: &AppHandle) -> Result<String, String> {
    let auth_token = crate::settings_manager::get_nacho_auth_token(app.clone())
        .map_err(|e| format!("Failed to get Nacho Auth Token: {}", e))?;

    match auth_token {
        Some(token) if !token.is_empty() => Ok(token),
        _ => Err("Nacho Auth Token not configured. Please set it in Settings.".to_string()),
    }
}

// TMDB Movie details response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbMovie {
    pub id: u64,
    pub title: String,
    pub original_title: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub release_date: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub popularity: Option<f32>,
    pub adult: Option<bool>,
    pub genres: Option<Vec<TmdbGenre>>,
    pub runtime: Option<u32>,
    pub tagline: Option<String>,
    pub status: Option<String>,
    pub homepage: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbGenre {
    pub id: u32,
    pub name: String,
}

// TMDB TV Show details response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbShow {
    pub id: u64,
    pub name: String,
    pub original_name: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub first_air_date: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub popularity: Option<f32>,
    pub genres: Option<Vec<TmdbGenre>>,
    pub episode_run_time: Option<Vec<u32>>,
    pub status: Option<String>,
    pub homepage: Option<String>,
    pub number_of_episodes: Option<u32>,
    pub number_of_seasons: Option<u32>,
    pub imdb_id: Option<String>,
}

// TMDB Movie images response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbMovieImages {
    pub id: u64,
    pub backdrops: Vec<TmdbImage>,
    pub posters: Vec<TmdbImage>,
    pub logos: Option<Vec<TmdbImage>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbImage {
    pub aspect_ratio: f32,
    pub height: u32,
    pub width: u32,
    pub file_path: String,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub iso_639_1: Option<String>,
}

// TMDB Configuration for image sizes
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbConfiguration {
    pub images: TmdbImageConfiguration,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbImageConfiguration {
    pub base_url: String,
    pub secure_base_url: String,
    pub backdrop_sizes: Vec<String>,
    pub logo_sizes: Vec<String>,
    pub poster_sizes: Vec<String>,
    pub profile_sizes: Vec<String>,
    pub still_sizes: Vec<String>,
}

// Get TMDB API configuration
#[tauri::command]
pub async fn get_tmdb_config(app: AppHandle) -> Result<TmdbConfiguration, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching TMDB configuration...");

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/configuration", base_url, TMDB_API_PATH);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch TMDB config: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch TMDB config: {} - {}",
            status, error_text
        ));
    }

    let config: TmdbConfiguration = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse TMDB config: {}", e))?;

    println!("[TMDB] Successfully fetched TMDB configuration");
    println!("[TMDB] ========================================");

    Ok(config)
}

// Get movie details by TMDB ID
#[tauri::command]
pub async fn get_tmdb_movie(app: AppHandle, tmdb_id: u64) -> Result<TmdbMovie, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching movie details for TMDB ID: {}", tmdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/movie/{}", base_url, TMDB_API_PATH, tmdb_id);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch movie details: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch movie details: {} - {}",
            status, error_text
        ));
    }

    let movie: TmdbMovie = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse movie details: {}", e))?;

    println!("[TMDB] Successfully fetched movie: {}", movie.title);
    println!("[TMDB] ========================================");

    Ok(movie)
}

// Get movie images by TMDB ID
#[tauri::command]
pub async fn get_tmdb_movie_images(
    app: AppHandle,
    tmdb_id: u64,
) -> Result<TmdbMovieImages, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching movie images for TMDB ID: {}", tmdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/movie/{}/images", base_url, TMDB_API_PATH, tmdb_id);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch movie images: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch movie images: {} - {}",
            status, error_text
        ));
    }

    let images: TmdbMovieImages = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse movie images: {}", e))?;

    println!(
        "[TMDB] Successfully fetched {} posters and {} backdrops",
        images.posters.len(),
        images.backdrops.len()
    );
    println!("[TMDB] ========================================");

    Ok(images)
}

// Find movie by IMDB ID
#[tauri::command]
pub async fn find_tmdb_movie_by_imdb(app: AppHandle, imdb_id: String) -> Result<TmdbMovie, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Finding movie by IMDB ID: {}", imdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/find/{}", base_url, TMDB_API_PATH, imdb_id);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .query(&[("external_source", "imdb_id")])
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to find movie by IMDB ID: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!("Failed to find movie: {} - {}", status, error_text));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[TMDB] Response Body: {}", response_text);

    let result: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse find response: {}", e))?;

    // Extract movie results
    let movie_results = result["movie_results"]
        .as_array()
        .ok_or("No movie results found")?;

    if movie_results.is_empty() {
        println!("[TMDB] No movie found with IMDB ID: {}", imdb_id);
        println!("[TMDB] ========================================");
        return Err(format!("No movie found with IMDB ID: {}", imdb_id));
    }

    // Get the first result and fetch full details
    let tmdb_id = movie_results[0]["id"]
        .as_u64()
        .ok_or("Invalid TMDB ID in response")?;

    println!(
        "[TMDB] Found TMDB ID: {}, fetching full details...",
        tmdb_id
    );
    println!("[TMDB] ========================================");

    // Now fetch full movie details
    get_tmdb_movie(app, tmdb_id).await
}

// Build image URL helper
#[tauri::command]
pub fn build_tmdb_image_url(file_path: String, size: Option<String>) -> String {
    let size = size.unwrap_or_else(|| "original".to_string());
    format!("{}/{}{}", TMDB_IMAGE_BASE_URL, size, file_path)
}

// Get available poster sizes
#[tauri::command]
pub fn get_poster_sizes() -> Vec<String> {
    vec![
        "w92".to_string(),
        "w154".to_string(),
        "w185".to_string(),
        "w342".to_string(),
        "w500".to_string(),
        "w780".to_string(),
        "original".to_string(),
    ]
}

// Get available backdrop sizes
#[tauri::command]
pub fn get_backdrop_sizes() -> Vec<String> {
    vec![
        "w300".to_string(),
        "w780".to_string(),
        "w1280".to_string(),
        "original".to_string(),
    ]
}

// TMDB Video/Trailer structures
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbVideo {
    pub id: String,
    pub iso_639_1: String,
    pub iso_3166_1: String,
    pub key: String,
    pub name: String,
    pub site: String,
    #[serde(rename = "type")]
    pub video_type: String,
    pub size: u32,
    pub official: Option<bool>,
    pub published_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbVideosResponse {
    pub id: u64,
    pub results: Vec<TmdbVideo>,
}

// Get movie videos/trailers
#[tauri::command]
pub async fn get_tmdb_movie_videos(app: AppHandle, tmdb_id: u64) -> Result<Vec<TmdbVideo>, String> {
    println!("[TMDB] Fetching videos for movie ID: {}", tmdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/movie/{}/videos", base_url, TMDB_API_PATH, tmdb_id);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch videos: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("TMDB API error: {}", response.status()));
    }

    let videos_response: TmdbVideosResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse videos response: {}", e))?;

    println!("[TMDB] Found {} videos", videos_response.results.len());
    Ok(videos_response.results)
}

// TMDB TV Show images response (uses same TmdbMovieImages structure)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbShowImages {
    pub id: u64,
    pub backdrops: Vec<TmdbImage>,
    pub posters: Vec<TmdbImage>,
    pub logos: Option<Vec<TmdbImage>>,
}

// TMDB Season details
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbSeason {
    pub id: u64,
    pub season_number: u32,
    pub name: String,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub poster_path: Option<String>,
    #[serde(default)]
    pub episode_count: u32,
    pub episodes: Option<Vec<TmdbEpisode>>,
    #[serde(rename = "_id")]
    pub internal_id: Option<String>,
}

// TMDB Episode details
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbEpisode {
    pub id: u64,
    pub episode_number: u32,
    pub season_number: u32,
    pub name: String,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub still_path: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub runtime: Option<u32>,
    pub production_code: Option<String>,
    pub episode_type: Option<String>,
    #[serde(default)]
    pub show_id: Option<u64>,
}

// TMDB Episode external IDs response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbEpisodeExternalIds {
    pub id: u64,
    pub imdb_id: Option<String>,
    pub tvdb_id: Option<u64>,
    pub tvrage_id: Option<u64>,
}

// TMDB Season images response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbSeasonImages {
    pub id: u64,
    pub posters: Vec<TmdbImage>,
}

// Get TV show details by TMDB ID
#[tauri::command]
pub async fn get_tmdb_show(app: AppHandle, tmdb_id: u64) -> Result<TmdbShow, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching TV show details for TMDB ID: {}", tmdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/tv/{}", base_url, TMDB_API_PATH, tmdb_id);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch TV show details: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch TV show details: {} - {}",
            status, error_text
        ));
    }

    let show: TmdbShow = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse TV show details: {}", e))?;

    println!("[TMDB] Successfully fetched TV show: {}", show.name);
    println!("[TMDB] ========================================");

    Ok(show)
}

// Get TV show images by TMDB ID
#[tauri::command]
pub async fn get_tmdb_show_images(app: AppHandle, tmdb_id: u64) -> Result<TmdbShowImages, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching TV show images for TMDB ID: {}", tmdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/tv/{}/images", base_url, TMDB_API_PATH, tmdb_id);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch show images: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch TV show images: {} - {}",
            status, error_text
        ));
    }

    let images: TmdbShowImages = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse TV show images: {}", e))?;

    println!(
        "[TMDB] Successfully fetched {} posters and {} backdrops",
        images.posters.len(),
        images.backdrops.len()
    );
    println!("[TMDB] ========================================");

    Ok(images)
}

// Find TV show by IMDB ID
#[tauri::command]
pub async fn find_tmdb_show_by_imdb(app: AppHandle, imdb_id: String) -> Result<TmdbShow, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Finding TV show by IMDB ID: {}", imdb_id);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/find/{}", base_url, TMDB_API_PATH, imdb_id);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .query(&[("external_source", "imdb_id")])
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to find show by IMDB ID: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to find TV show: {} - {}",
            status, error_text
        ));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[TMDB] Response Body: {}", response_text);

    let result: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse find response: {}", e))?;

    // Extract TV show results
    let show_results = result["tv_results"]
        .as_array()
        .ok_or("No TV show results found")?;

    let tmdb_id = if !show_results.is_empty() {
        // Found a TV show directly
        show_results[0]["id"]
            .as_u64()
            .ok_or("Invalid TMDB ID in response")?
    } else {
        // Check if this is an episode IMDB ID instead
        let episode_results = result["tv_episode_results"]
            .as_array()
            .ok_or("No TV show or episode results found")?;

        if episode_results.is_empty() {
            println!(
                "[TMDB] No TV show or episode found with IMDB ID: {}",
                imdb_id
            );
            println!("[TMDB] ========================================");
            return Err(format!(
                "No TV show or episode found with IMDB ID: {}",
                imdb_id
            ));
        }

        // Extract the show_id from the episode result
        println!("[TMDB] IMDB ID is for an episode, extracting show_id...");
        episode_results[0]["show_id"]
            .as_u64()
            .ok_or("Invalid show_id in episode response")?
    };

    println!(
        "[TMDB] Found TMDB ID: {}, fetching full details...",
        tmdb_id
    );
    println!("[TMDB] ========================================");

    // Now fetch full TV show details
    get_tmdb_show(app, tmdb_id).await
}

// Get TV show season details by TMDB ID and season number
#[tauri::command]
pub async fn get_tmdb_season(
    app: AppHandle,
    tmdb_id: u64,
    season_number: u32,
) -> Result<TmdbSeason, String> {
    println!("[TMDB] ========================================");
    println!(
        "[TMDB] Fetching season {} for TV show ID: {}",
        season_number, tmdb_id
    );

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!(
        "{}{}/tv/{}/season/{}",
        base_url, TMDB_API_PATH, tmdb_id, season_number
    );

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch season details: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch season details: {} - {}",
            status, error_text
        ));
    }

    // Read response as text first for debugging
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!(
        "[TMDB] Response Body (first 500 chars): {}",
        &response_text.chars().take(500).collect::<String>()
    );

    let season: TmdbSeason = serde_json::from_str(&response_text).map_err(|e| {
        format!(
            "Failed to parse season details: {} - Response: {}",
            e,
            &response_text.chars().take(200).collect::<String>()
        )
    })?;

    println!("[TMDB] Successfully fetched season: {}", season.name);
    println!("[TMDB] ========================================");

    Ok(season)
}

// Get TV show episode details by TMDB ID, season number, and episode number
#[tauri::command]
pub async fn get_tmdb_episode(
    app: AppHandle,
    tmdb_id: u64,
    season_number: u32,
    episode_number: u32,
) -> Result<TmdbEpisode, String> {
    println!("[TMDB] ========================================");
    println!(
        "[TMDB] Fetching episode {} of season {} for TV show ID: {}",
        episode_number, season_number, tmdb_id
    );

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!(
        "{}{}/tv/{}/season/{}/episode/{}",
        base_url, TMDB_API_PATH, tmdb_id, season_number, episode_number
    );

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch episode details: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch episode details: {} - {}",
            status, error_text
        ));
    }

    let episode: TmdbEpisode = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse episode details: {}", e))?;

    println!("[TMDB] Successfully fetched episode: {}", episode.name);
    println!("[TMDB] ========================================");

    Ok(episode)
}

// Get TV episode external IDs by TMDB ID, season number, and episode number
#[tauri::command]
pub async fn get_tmdb_episode_external_ids(
    app: AppHandle,
    tmdb_id: u64,
    season_number: u32,
    episode_number: u32,
) -> Result<TmdbEpisodeExternalIds, String> {
    println!("[TMDB] ========================================");
    println!(
        "[TMDB] Fetching external IDs for episode {} of season {} for TV show ID: {}",
        episode_number, season_number, tmdb_id
    );

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!(
        "{}{}/tv/{}/season/{}/episode/{}/external_ids",
        base_url, TMDB_API_PATH, tmdb_id, season_number, episode_number
    );

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch episode external IDs: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch episode external IDs: {} - {}",
            status, error_text
        ));
    }

    let external_ids: TmdbEpisodeExternalIds = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse episode external IDs: {}", e))?;

    println!(
        "[TMDB] Successfully fetched external IDs for episode. IMDB ID: {:?}",
        external_ids.imdb_id
    );
    println!("[TMDB] ========================================");

    Ok(external_ids)
}

// Get TV show season images by TMDB ID and season number
#[tauri::command]
pub async fn get_tmdb_season_images(
    app: AppHandle,
    tmdb_id: u64,
    season_number: u32,
) -> Result<TmdbSeasonImages, String> {
    println!("[TMDB] ========================================");
    println!(
        "[TMDB] Fetching images for season {} of TV show ID: {}",
        season_number, tmdb_id
    );

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!(
        "{}{}/tv/{}/season/{}/images",
        base_url, TMDB_API_PATH, tmdb_id, season_number
    );

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch season images: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch season images: {} - {}",
            status, error_text
        ));
    }

    let images: TmdbSeasonImages = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse season images: {}", e))?;

    println!(
        "[TMDB] Successfully fetched {} posters for season {}",
        images.posters.len(),
        season_number
    );
    println!("[TMDB] ========================================");

    Ok(images)
}

// TMDB Search results structures
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbSearchMovieResult {
    pub id: u64,
    pub title: String,
    pub original_title: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub release_date: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub popularity: Option<f32>,
    pub adult: Option<bool>,
    pub genre_ids: Option<Vec<u32>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbSearchShowResult {
    pub id: u64,
    pub name: String,
    pub original_name: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub first_air_date: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub popularity: Option<f32>,
    pub genre_ids: Option<Vec<u32>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbSearchMoviesResponse {
    pub page: u32,
    pub results: Vec<TmdbSearchMovieResult>,
    pub total_results: u32,
    pub total_pages: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbSearchShowsResponse {
    pub page: u32,
    pub results: Vec<TmdbSearchShowResult>,
    pub total_results: u32,
    pub total_pages: u32,
}

// Search for movies by query string
#[tauri::command]
pub async fn search_tmdb_movies(
    app: AppHandle,
    query: String,
    page: Option<u32>,
) -> Result<TmdbSearchMoviesResponse, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Searching movies for query: {}", query);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/search/movie", base_url, TMDB_API_PATH);
    let page_num = page.unwrap_or(1);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Accept", "application/json")
        .query(&[("query", query.as_str()), ("page", &page_num.to_string())])
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("TMDB API error: {} - {}", status, error_text));
    }

    let search_response: TmdbSearchMoviesResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    println!(
        "[TMDB] Found {} movies (page {} of {})",
        search_response.results.len(),
        search_response.page,
        search_response.total_pages
    );
    println!("[TMDB] ========================================");

    Ok(search_response)
}

// Search for TV shows by query string
#[tauri::command]
pub async fn search_tmdb_shows(
    app: AppHandle,
    query: String,
    page: Option<u32>,
) -> Result<TmdbSearchShowsResponse, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Searching TV shows for query: {}", query);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/search/tv", base_url, TMDB_API_PATH);
    let page_num = page.unwrap_or(1);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Accept", "application/json")
        .query(&[("query", query.as_str()), ("page", &page_num.to_string())])
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("TMDB API error: {} - {}", status, error_text));
    }

    let search_response: TmdbSearchShowsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    println!(
        "[TMDB] Found {} TV shows (page {} of {})",
        search_response.results.len(),
        search_response.page,
        search_response.total_pages
    );
    println!("[TMDB] ========================================");

    Ok(search_response)
}

// Trakt-compatible wrapper types for TMDB results
// These allow TMDB to be used as a drop-in replacement for Trakt trending

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraktCompatibleMovieIds {
    pub trakt: u64,
    pub slug: String,
    pub imdb: Option<String>,
    pub tmdb: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraktCompatibleMovie {
    pub title: String,
    pub year: Option<u32>,
    pub ids: TraktCompatibleMovieIds,
    pub tagline: Option<String>,
    pub overview: Option<String>,
    pub released: Option<String>,
    pub runtime: Option<u32>,
    pub trailer: Option<String>,
    pub homepage: Option<String>,
    pub rating: Option<f32>,
    pub votes: Option<u32>,
    pub language: Option<String>,
    pub genres: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraktCompatibleTrendingItem {
    pub watchers: u32,
    pub movie: TraktCompatibleMovie,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraktCompatibleShowIds {
    pub trakt: u64,
    pub slug: String,
    pub tvdb: Option<u64>,
    pub imdb: Option<String>,
    pub tmdb: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraktCompatibleShow {
    pub title: String,
    pub year: Option<u32>,
    pub ids: TraktCompatibleShowIds,
    pub overview: Option<String>,
    pub first_aired: Option<String>,
    pub runtime: Option<u32>,
    pub certification: Option<String>,
    pub network: Option<String>,
    pub country: Option<String>,
    pub trailer: Option<String>,
    pub homepage: Option<String>,
    pub status: Option<String>,
    pub rating: Option<f32>,
    pub votes: Option<u32>,
    pub language: Option<String>,
    pub genres: Option<Vec<String>>,
    pub aired_episodes: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraktCompatibleTrendingShowItem {
    pub watchers: u32,
    pub show: TraktCompatibleShow,
}

// Helper function to extract year from release_date
fn extract_year(release_date: &Option<String>) -> Option<u32> {
    release_date.as_ref().and_then(|date| {
        date.split('-')
            .next()
            .and_then(|year_str| year_str.parse().ok())
    })
}

// Popular movies response (same structure as trending)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbPopularMoviesResponse {
    pub page: u32,
    pub results: Vec<TmdbSearchMovieResult>,
    pub total_results: u32,
    pub total_pages: u32,
}

// Popular TV shows response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbPopularShowsResponse {
    pub page: u32,
    pub results: Vec<TmdbSearchShowResult>,
    pub total_results: u32,
    pub total_pages: u32,
}

// Get popular movies from TMDB (replaces Trakt trending)
#[tauri::command]
pub async fn get_popular_movies(
    app: AppHandle,
    page: Option<u32>,
) -> Result<Vec<TraktCompatibleTrendingItem>, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching popular movies...");

    let page_num = page.unwrap_or(1);
    println!("[TMDB] Page: {}", page_num);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/movie/popular", base_url, TMDB_API_PATH);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Accept", "application/json")
        .query(&[("page", page_num.to_string().as_str())])
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch popular movies: {}", e);
            format!("Failed to fetch popular movies: {}", e)
        })?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch popular movies: {} - {}",
            status, error_text
        ));
    }

    let popular_response: TmdbPopularMoviesResponse = response.json().await.map_err(|e| {
        error!("Failed to parse popular movies response: {}", e);
        format!("Failed to parse popular movies response: {}", e)
    })?;

    println!(
        "[TMDB] Successfully fetched {} popular movies (page {} of {})",
        popular_response.results.len(),
        popular_response.page,
        popular_response.total_pages
    );

    // Convert TMDB results to Trakt-compatible format
    let trakt_compatible: Vec<TraktCompatibleTrendingItem> = popular_response
        .results
        .into_iter()
        .map(|movie| {
            let year = extract_year(&movie.release_date);
            let slug = movie.title.to_lowercase().replace(' ', "-");

            TraktCompatibleTrendingItem {
                watchers: movie.popularity.unwrap_or(0.0) as u32, // Use popularity as watchers proxy
                movie: TraktCompatibleMovie {
                    title: movie.title,
                    year,
                    ids: TraktCompatibleMovieIds {
                        trakt: movie.id as u64,
                        slug,
                        imdb: None, // TMDB popular endpoint doesn't include IMDB ID
                        tmdb: Some(movie.id as u64),
                    },
                    tagline: None,
                    overview: movie.overview,
                    released: movie.release_date,
                    runtime: None, // Not included in search results
                    trailer: None,
                    homepage: None,
                    rating: movie.vote_average,
                    votes: movie.vote_count.map(|v| v as u32),
                    language: None,
                    genres: None, // We only have genre_ids, would need additional lookup
                },
            }
        })
        .collect();

    println!(
        "[TMDB] Converted to {} Trakt-compatible items",
        trakt_compatible.len()
    );
    println!("[TMDB] ========================================");

    Ok(trakt_compatible)
}

// Get popular TV shows from TMDB (replaces Trakt trending)
#[tauri::command]
pub async fn get_popular_shows(
    app: AppHandle,
    page: Option<u32>,
) -> Result<Vec<TraktCompatibleTrendingShowItem>, String> {
    println!("[TMDB] ========================================");
    println!("[TMDB] Fetching popular TV shows...");

    let page_num = page.unwrap_or(1);
    println!("[TMDB] Page: {}", page_num);

    let base_url = get_nacho_server_base_url(&app)?;
    let auth_token = get_nacho_auth_token(&app)?;

    let client = reqwest::Client::new();
    let url = format!("{}{}/tv/popular", base_url, TMDB_API_PATH);

    println!("[TMDB] Request URL: {}", url);

    let response = client
        .get(&url)
        .header("X-Nacho-Auth", &auth_token)
        .header("Accept", "application/json")
        .query(&[("page", page_num.to_string().as_str())])
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch popular TV shows: {}", e);
            format!("Failed to fetch popular TV shows: {}", e)
        })?;

    let status = response.status();
    println!("[TMDB] Response Status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[TMDB] Response Body (Error): {}", error_text);
        println!("[TMDB] ========================================");
        return Err(format!(
            "Failed to fetch popular TV shows: {} - {}",
            status, error_text
        ));
    }

    let popular_response: TmdbPopularShowsResponse = response.json().await.map_err(|e| {
        error!("Failed to parse popular TV shows response: {}", e);
        format!("Failed to parse popular TV shows response: {}", e)
    })?;

    println!(
        "[TMDB] Successfully fetched {} popular TV shows (page {} of {})",
        popular_response.results.len(),
        popular_response.page,
        popular_response.total_pages
    );

    // Convert TMDB results to Trakt-compatible format
    let trakt_compatible: Vec<TraktCompatibleTrendingShowItem> = popular_response
        .results
        .into_iter()
        .map(|show| {
            let year = extract_year(&show.first_air_date);
            let slug = show.name.to_lowercase().replace(' ', "-");

            TraktCompatibleTrendingShowItem {
                watchers: show.popularity.unwrap_or(0.0) as u32,
                show: TraktCompatibleShow {
                    title: show.name,
                    year,
                    ids: TraktCompatibleShowIds {
                        trakt: show.id as u64,
                        slug,
                        tvdb: None,
                        imdb: None,
                        tmdb: Some(show.id as u64),
                    },
                    overview: show.overview,
                    first_aired: show.first_air_date,
                    runtime: None,
                    certification: None,
                    network: None,
                    country: None,
                    trailer: None,
                    homepage: None,
                    status: None,
                    rating: show.vote_average,
                    votes: show.vote_count.map(|v| v as u32),
                    language: None,
                    genres: None,
                    aired_episodes: None,
                },
            }
        })
        .collect();

    println!(
        "[TMDB] Converted to {} Trakt-compatible show items",
        trakt_compatible.len()
    );
    println!("[TMDB] ========================================");

    Ok(trakt_compatible)
}
