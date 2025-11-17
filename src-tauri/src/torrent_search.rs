use crate::settings_manager;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentResult {
    pub title: String,
    pub size: u64,
    pub seeders: u32,
    pub peers: u32,
    pub download_url: String,
    pub magnet_url: Option<String>,
    pub indexer: String,
    pub publish_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProwlarrResponse {
    #[serde(rename = "title")]
    title: String,
    #[serde(rename = "size")]
    size: Option<u64>,
    #[serde(rename = "seeders")]
    seeders: Option<u32>,
    #[serde(rename = "peers")]
    peers: Option<u32>,
    #[serde(rename = "downloadUrl")]
    download_url: Option<String>,
    #[serde(rename = "magnetUrl")]
    magnet_url: Option<String>,
    #[serde(rename = "indexer")]
    indexer: Option<String>,
    #[serde(rename = "publishDate")]
    publish_date: Option<String>,
}

#[tauri::command]
pub async fn search_torrents_by_imdb(
    app: AppHandle,
    imdb_id: String,
    title: Option<String>,
) -> Result<Vec<TorrentResult>, String> {
    info!("Starting torrent search");

    // Determine search query - prefer title over IMDB ID
    let search_query = if let Some(movie_title) = title.filter(|t| !t.is_empty()) {
        info!("Using movie title for search: {}", movie_title);
        movie_title
    } else {
        info!("Using IMDB ID for search: {}", imdb_id);
        let clean_imdb_id = imdb_id.trim_start_matches("tt");
        format!("imdbid:{}", clean_imdb_id)
    };

    // Get Nacho Server URL from settings
    info!("Fetching Nacho Server URL from settings");
    let nacho_server_url = settings_manager::get_nacho_server_url(app.clone()).map_err(|e| {
        error!("Failed to get Nacho Server URL from settings: {}", e);
        format!("Failed to get Nacho Server URL: {}", e)
    })?;

    let nacho_server_url = match nacho_server_url {
        Some(url) if !url.is_empty() => {
            info!("Nacho Server URL found: {}", url);
            url
        }
        _ => {
            warn!("Nacho Server URL not configured in settings");
            return Err("Nacho Server URL not configured. Please set it in Settings.".to_string());
        }
    };

    // Get Nacho Auth Token from settings
    info!("Fetching Nacho Auth Token from settings");
    let auth_token = settings_manager::get_nacho_auth_token(app).map_err(|e| {
        error!("Failed to get Nacho Auth Token from settings: {}", e);
        format!("Failed to get Nacho Auth Token: {}", e)
    })?;

    let auth_token = match auth_token {
        Some(token) if !token.is_empty() => {
            info!("Nacho Auth Token found");
            token
        }
        _ => {
            warn!("Nacho Auth Token not configured in settings");
            return Err("Nacho Auth Token not configured. Please set it in Settings.".to_string());
        }
    };

    // Construct search URL base - route through Nacho Server proxy
    let base_url = format!(
        "{}/api/prowlarr/api/v1/search",
        nacho_server_url.trim_end_matches('/')
    );
    info!("Constructed search URL with query: {}", search_query);

    // Make HTTP request
    info!("Sending HTTP request to Nacho Server with auth token");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            error!("Failed to create HTTP client: {}", e);
            format!("Failed to create HTTP client: {}", e)
        })?;

    let response = client
        .get(&base_url)
        .query(&[("query", &search_query), ("type", &"movie".to_string())])
        .header("X-Nacho-Auth", auth_token)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to send request to Nacho Server: {}", e);
            format!("Failed to connect to Nacho Server: {}", e)
        })?;

    let status = response.status();
    info!("Nacho Server response status: {}", status);

    if !status.is_success() {
        error!("Nacho Server returned error status: {}", status);
        return Err(format!("Nacho Server returned error: {}", status));
    }

    // Parse response
    info!("Parsing Nacho Server response");
    let prowlarr_results: Vec<ProwlarrResponse> = response.json().await.map_err(|e| {
        error!("Failed to parse Nacho Server response: {}", e);
        format!("Failed to parse Nacho Server response: {}", e)
    })?;

    info!(
        "Received {} results from Nacho Server",
        prowlarr_results.len()
    );

    // Convert to our result format
    let results: Vec<TorrentResult> = prowlarr_results
        .into_iter()
        .enumerate()
        .filter_map(|(idx, result)| {
            info!("Processing result {}: {}", idx + 1, result.title);

            // Need either download_url or magnet_url
            let download_url = result
                .download_url
                .clone()
                .or_else(|| result.magnet_url.clone());

            if download_url.is_none() {
                warn!(
                    "Skipping result {} - no download URL or magnet link",
                    idx + 1
                );
                return None;
            }

            let torrent = TorrentResult {
                title: result.title,
                size: result.size.unwrap_or(0),
                seeders: result.seeders.unwrap_or(0),
                peers: result.peers.unwrap_or(0),
                download_url: download_url.unwrap(),
                magnet_url: result.magnet_url,
                indexer: result.indexer.unwrap_or_else(|| "Unknown".to_string()),
                publish_date: result.publish_date,
            };

            info!(
                "  - Title: {}, Size: {} bytes, Seeders: {}, Peers: {}, Indexer: {}",
                torrent.title, torrent.size, torrent.seeders, torrent.peers, torrent.indexer
            );

            Some(torrent)
        })
        .collect();

    info!("Successfully processed {} torrent results", results.len());

    // Sort by seeders (descending)
    let mut sorted_results = results;
    sorted_results.sort_by(|a, b| b.seeders.cmp(&a.seeders));
    info!("Sorted results by seeders");

    Ok(sorted_results)
}

#[tauri::command]
pub async fn download_torrent_from_prowlarr(
    state: tauri::State<'_, crate::torrent_server::State>,
    app: AppHandle,
    download_url: String,
    tmdb_id: Option<u64>,
    media_type: Option<String>,
    episode_info: Option<(i32, i32)>,
) -> Result<librqbit::api::ApiAddTorrentResponse, String> {
    use base64::Engine;

    info!("Starting torrent download");
    info!("Download URL: {}", download_url);
    info!("TMDB ID: {:?}", tmdb_id);

    // Get Auth Token for authentication
    let auth_token = crate::settings_manager::get_nacho_auth_token(app).map_err(|e| {
        error!("Failed to get Nacho Auth Token: {}", e);
        format!("Failed to get Auth Token: {}", e)
    })?;

    let auth_token = match auth_token.filter(|k| !k.is_empty()) {
        Some(token) => token,
        None => {
            warn!("No auth token available");
            return Err("Nacho Auth Token not configured".to_string());
        }
    };

    // Fetch the download URL - it will return either a magnet link or torrent file
    info!("Fetching download from custom endpoint");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            error!("Failed to create HTTP client: {}", e);
            format!("Failed to create HTTP client: {}", e)
        })?;

    let response = client
        .get(&download_url)
        .header("X-Nacho-Auth", &auth_token)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch download: {}", e);
            format!("Failed to fetch download: {}", e)
        })?;

    if !response.status().is_success() {
        error!("Download endpoint returned error: {}", response.status());
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    // Check content type to determine if it's a magnet link or torrent file
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let final_source = if content_type.contains("text/plain") {
        // Likely a magnet link
        let body = response.text().await.map_err(|e| {
            error!("Failed to read response body: {}", e);
            format!("Failed to read response: {}", e)
        })?;

        if body.trim().starts_with("magnet:") {
            info!("Received magnet link");
            body.trim().to_string()
        } else {
            error!(
                "Expected magnet link but got: {}",
                &body[..50.min(body.len())]
            );
            return Err("Invalid response: expected magnet link".to_string());
        }
    } else {
        // Assume it's a torrent file
        info!("Received torrent file");
        let torrent_bytes = response.bytes().await.map_err(|e| {
            error!("Failed to read torrent file bytes: {}", e);
            format!("Failed to read torrent file: {}", e)
        })?;

        // Convert to base64
        let base64_torrent = base64::engine::general_purpose::STANDARD.encode(&torrent_bytes);
        info!("Successfully encoded torrent file");

        // Use base64 format for librqbit
        format!("base64:{}", base64_torrent)
    };

    info!("Adding torrent to download queue");

    // Add torrent using the appropriate method
    let response = if final_source.starts_with("base64:") {
        let base64_content = final_source.strip_prefix("base64:").unwrap();
        crate::torrent_server::torrent_create_from_base64_file(
            &state,
            base64_content.to_string(),
            None,
        )
        .await
        .map_err(|e| {
            error!("Failed to add torrent from base64: {:?}", e);
            format!("Failed to add torrent: {:?}", e)
        })?
    } else {
        crate::torrent_server::torrent_create_from_url(&state, final_source, None)
            .await
            .map_err(|e| {
                error!("Failed to add torrent from URL: {:?}", e);
                format!("Failed to add torrent: {:?}", e)
            })?
    };

    info!("Torrent added successfully with ID: {:?}", response.id);

    // If we have a TMDB ID, associate it with the torrent
    if let Some(tmdb) = tmdb_id {
        if let Some(torrent_id_num) = response.id {
            info!(
                "Associating TMDB ID {} with torrent {} (type: {:?}, episode: {:?})",
                tmdb, torrent_id_num, media_type, episode_info
            );

            // Get the torrent details to get the info hash
            let torrent_id = librqbit::api::TorrentIdOrHash::Id(torrent_id_num);
            match state.api() {
                Ok(api) => match api.api_torrent_details(torrent_id) {
                    Ok(details) => {
                        if let Err(e) = state.torrent_db.upsert_torrent(
                            torrent_id_num as i32,
                            details.info_hash,
                            Some(tmdb),
                            media_type,
                            episode_info,
                        ) {
                            error!("Failed to set torrent metadata: {:?}", e);
                            warn!("Torrent added but metadata association failed");
                        } else {
                            info!("Successfully associated metadata with torrent");
                        }
                    }
                    Err(e) => {
                        error!("Failed to get torrent details: {:?}", e);
                        warn!("Cannot associate metadata - torrent details unavailable");
                    }
                },
                Err(e) => {
                    error!("Failed to get API: {:?}", e);
                    warn!("Cannot associate metadata - API unavailable");
                }
            }
        } else {
            warn!("Cannot associate TMDB ID - torrent ID not available");
        }
    }

    Ok(response)
}
