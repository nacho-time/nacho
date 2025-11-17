use std::{
    fs::{File, OpenOptions},
    io::{BufReader, BufWriter},
    path::Path,
    sync::Arc,
};

use crate::config::RqbitDesktopConfig;
use crate::torrent_db::TorrentDb;
use anyhow::Context;
use http::StatusCode;
use librqbit::{
    AddTorrent, AddTorrentOptions, Api, ApiError, Session, SessionOptions,
    SessionPersistenceConfig, WithStatusError,
    api::{
        ApiAddTorrentResponse, EmptyJsonResponse, TorrentDetailsResponse, TorrentIdOrHash,
        TorrentListResponse, TorrentStats,
    },
    dht::PersistentDhtConfig,
    session_stats::snapshot::SessionStatsSnapshot,
    tracing_subscriber_config_utils::InitLoggingResult,
};
use librqbit_dualstack_sockets::TcpListener;
use parking_lot::RwLock;
use serde::Serialize;
use tracing::{debug_span, warn};

pub struct StateShared {
    pub config: RqbitDesktopConfig,
    pub api: Option<Api>,
}

pub struct State {
    pub config_filename: String,
    pub shared: Arc<RwLock<Option<StateShared>>>,
    pub init_logging: InitLoggingResult,
    pub torrent_db: Arc<TorrentDb>,
}

pub fn read_config(path: &str) -> anyhow::Result<RqbitDesktopConfig> {
    let rdr = BufReader::new(File::open(path)?);
    let mut config: RqbitDesktopConfig = serde_json::from_reader(rdr)?;
    config.persistence.fix_backwards_compat();
    Ok(config)
}

pub fn write_config(path: &str, config: &RqbitDesktopConfig) -> anyhow::Result<()> {
    std::fs::create_dir_all(Path::new(path).parent().context("no parent")?)
        .context("error creating dirs")?;
    let tmp = format!("{}.tmp", path);
    let mut tmp_file = BufWriter::new(
        OpenOptions::new()
            .write(true)
            .truncate(true)
            .create(true)
            .open(&tmp)?,
    );
    serde_json::to_writer(&mut tmp_file, config)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

pub async fn api_from_config(
    init_logging: &InitLoggingResult,
    config: &RqbitDesktopConfig,
) -> anyhow::Result<Api> {
    config
        .validate()
        .context("error validating configuration")?;
    let persistence = if config.persistence.disable {
        None
    } else {
        Some(SessionPersistenceConfig::Json {
            folder: if config.persistence.folder == Path::new("") {
                None
            } else {
                Some(config.persistence.folder.clone())
            },
        })
    };

    let (listen, connect) = config.connections.as_listener_and_connect_opts();

    let mut http_api_opts = librqbit::http_api::HttpApiOptions {
        read_only: config.http_api.read_only,
        basic_auth: None,
        ..Default::default()
    };

    // We need to start prometheus recorder earlier than session.
    if !config.http_api.disable {
        match metrics_exporter_prometheus::PrometheusBuilder::new().install_recorder() {
            Ok(handle) => {
                http_api_opts.prometheus_handle = Some(handle);
            }
            Err(e) => {
                warn!("error installting prometheus recorder: {e:#}");
            }
        }
    }

    let session = Session::new_with_opts(
        config.default_download_location.clone(),
        SessionOptions {
            disable_dht: config.dht.disable,
            disable_dht_persistence: config.dht.disable_persistence,
            dht_config: Some(PersistentDhtConfig {
                config_filename: Some(config.dht.persistence_filename.clone()),
                ..Default::default()
            }),
            persistence,
            connect: Some(connect),
            listen,
            fastresume: config.persistence.fastresume,
            ratelimits: config.ratelimits,
            #[cfg(feature = "disable-upload")]
            disable_upload: config.disable_upload,
            ..Default::default()
        },
    )
    .await
    .context("couldn't set up librqbit session")?;

    let api = Api::new(
        session.clone(),
        Some(init_logging.rust_log_reload_tx.clone()),
        Some(init_logging.line_broadcast.clone()),
    );

    if !config.http_api.disable {
        let listen_addr = config.http_api.listen_addr;
        let api = api.clone();
        let upnp_router = if config.upnp.enable_server {
            let friendly_name = config
                .upnp
                .server_friendly_name
                .as_ref()
                .map(|f| f.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_owned())
                .unwrap_or_else(|| {
                    format!(
                        "rqbit-desktop@{}",
                        gethostname::gethostname().to_string_lossy()
                    )
                });

            let mut upnp_adapter = session
                .make_upnp_adapter(friendly_name, config.http_api.listen_addr.port())
                .await
                .context("error starting UPnP server")?;
            let router = upnp_adapter.take_router()?;
            session.spawn(debug_span!("ssdp"), "ssdp", async move {
                upnp_adapter.run_ssdp_forever().await
            });
            Some(router)
        } else {
            None
        };
        let http_api_task = async move {
            let listener = TcpListener::bind_tcp(listen_addr, Default::default())
                .with_context(|| format!("error listening on {}", listen_addr))?;
            librqbit::http_api::HttpApi::new(api.clone(), Some(http_api_opts))
                .make_http_api_and_run(listener, upnp_router)
                .await
        };

        session.spawn(debug_span!("http_api"), "http_api", http_api_task);
    }
    Ok(api)
}

impl State {
    pub async fn new(init_logging: InitLoggingResult) -> Self {
        let config_filename = directories::ProjectDirs::from("com", "rqbit", "desktop")
            .expect("directories::ProjectDirs::from")
            .config_dir()
            .join("config.json")
            .to_str()
            .expect("to_str()")
            .to_owned();

        // Initialize torrent database
        let db_path = directories::ProjectDirs::from("com", "rqbit", "desktop")
            .expect("directories::ProjectDirs::from")
            .data_dir()
            .join("torrents.json");

        let torrent_db = Arc::new(
            TorrentDb::new(db_path)
                .map_err(|e| {
                    warn!(error=?e, "error initializing torrent database");
                    e
                })
                .unwrap_or_else(|_| {
                    // If we can't load the database, create a new one in a temp location
                    TorrentDb::new(std::env::temp_dir().join("torrents.json"))
                        .expect("Failed to create fallback torrent database")
                }),
        );

        if let Ok(config) = read_config(&config_filename) {
            // Ensure download directory exists and is writable
            if let Err(e) = std::fs::create_dir_all(&config.default_download_location) {
                warn!(
                    "Failed to create download directory {:?}: {}. Using default.",
                    config.default_download_location, e
                );
            }

            let api = api_from_config(&init_logging, &config)
                .await
                .map_err(|e| {
                    warn!(error=?e, "error reading configuration");
                    e
                })
                .ok();

            // Sync database with current torrents
            if let Some(ref api) = api {
                let torrent_list = api.api_torrent_list();
                let active_hashes: Vec<String> = torrent_list
                    .torrents
                    .iter()
                    .map(|t| t.info_hash.clone())
                    .collect();

                if let Err(e) = torrent_db.sync_with_torrent_list(&active_hashes) {
                    warn!(error=?e, "error syncing torrent database");
                }
            }

            let shared = Arc::new(RwLock::new(Some(StateShared { config, api })));

            return Self {
                config_filename,
                shared,
                init_logging,
                torrent_db,
            };
        }

        Self {
            config_filename,
            init_logging,
            shared: Arc::new(RwLock::new(None)),
            torrent_db,
        }
    }

    pub fn api(&self) -> Result<Api, ApiError> {
        let g = self.shared.read();
        g.as_ref()
            .and_then(|a| a.api.clone())
            .with_status_error(StatusCode::FAILED_DEPENDENCY, "not configured")
    }

    pub async fn configure(&self, config: RqbitDesktopConfig) -> Result<(), ApiError> {
        {
            let g = self.shared.read();
            if let Some(shared) = g.as_ref()
                && shared.api.is_some()
                && shared.config == config
            {
                // The config didn't change, and the API is running, nothing to do.
                return Ok(());
            }
        }

        let existing = self.shared.write().as_mut().and_then(|s| s.api.take());

        if let Some(api) = existing {
            api.session().stop().await;
        }

        let api = api_from_config(&self.init_logging, &config).await?;
        if let Err(e) = write_config(&self.config_filename, &config) {
            tracing::error!("error writing config: {:#}", e);
        }

        let mut g = self.shared.write();
        *g = Some(StateShared {
            config,
            api: Some(api),
        });
        Ok(())
    }
}

#[derive(Default, Serialize)]
pub struct CurrentState {
    pub config: Option<RqbitDesktopConfig>,
    pub configured: bool,
}

// Tauri command handlers
pub fn config_current(state: &State) -> CurrentState {
    let g = state.shared.read();
    match &*g {
        Some(s) => CurrentState {
            config: Some(s.config.clone()),
            configured: s.api.is_some(),
        },
        None => Default::default(),
    }
}

pub async fn config_change(
    state: &State,
    config: RqbitDesktopConfig,
) -> Result<EmptyJsonResponse, ApiError> {
    state.configure(config).await.map(|_| EmptyJsonResponse {})
}

pub fn torrents_list(state: &State) -> Result<TorrentListResponse, ApiError> {
    Ok(state.api()?.api_torrent_list())
}

pub async fn torrent_create_from_url(
    state: &State,
    url: String,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    let response = state
        .api()?
        .api_add_torrent(AddTorrent::Url(url.into()), opts)
        .await?;

    // Track in database (no IMDB code for manual URL adds)
    if let Some(id) = response.id {
        if let Err(e) = state.torrent_db.upsert_torrent(
            id as i32,
            response.details.info_hash.clone(),
            None,
            None,
            None,
        ) {
            warn!(error=?e, "Failed to update torrent database");
        }
    }

    Ok(response)
}

pub async fn torrent_create_from_base64_file(
    state: &State,
    contents: String,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD
        .decode(&contents)
        .with_status_error(StatusCode::BAD_REQUEST, "invalid base64")?;

    let response = state
        .api()?
        .api_add_torrent(AddTorrent::TorrentFileBytes(bytes.into()), opts)
        .await?;

    // Track in database (no IMDB code for manual file adds)
    if let Some(id) = response.id {
        if let Err(e) = state.torrent_db.upsert_torrent(
            id as i32,
            response.details.info_hash.clone(),
            None,
            None,
            None,
        ) {
            warn!(error=?e, "Failed to update torrent database");
        }
    }

    Ok(response)
}

pub async fn torrent_details(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<TorrentDetailsResponse, ApiError> {
    state.api()?.api_torrent_details(id)
}

pub async fn torrent_stats(state: &State, id: TorrentIdOrHash) -> Result<TorrentStats, ApiError> {
    state.api()?.api_stats_v1(id)
}

pub async fn torrent_action_delete(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    // Get torrent details first to obtain info_hash for database removal
    if let Ok(details) = state.api()?.api_torrent_details(id) {
        if let Some(torrent_id) = details.id {
            if let Err(e) = state.torrent_db.remove_by_id(torrent_id as i32) {
                warn!(error=?e, "Failed to remove torrent from database by ID");
            }
        }
        // Also try by hash as a fallback
        if let Err(e) = state.torrent_db.remove_by_hash(&details.info_hash) {
            warn!(error=?e, "Failed to remove torrent from database by hash");
        }
    }

    state.api()?.api_torrent_action_delete(id).await
}

pub async fn torrent_action_pause(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    state.api()?.api_torrent_action_pause(id).await
}

pub async fn torrent_action_forget(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    state.api()?.api_torrent_action_forget(id).await
}

pub async fn torrent_action_start(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<EmptyJsonResponse, ApiError> {
    state.api()?.api_torrent_action_start(id).await
}

pub async fn torrent_action_configure(
    state: &State,
    id: TorrentIdOrHash,
    only_files: Vec<usize>,
) -> Result<EmptyJsonResponse, ApiError> {
    state
        .api()?
        .api_torrent_action_update_only_files(id, &only_files.into_iter().collect())
        .await
}

pub async fn stats(state: &State) -> Result<SessionStatsSnapshot, ApiError> {
    Ok(state.api()?.api_session_stats())
}

pub async fn get_torrent_files(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<TorrentDetailsResponse, ApiError> {
    state.api()?.api_torrent_details(id)
}

pub fn get_download_path(state: &State) -> Result<String, ApiError> {
    let g = state.shared.read();
    g.as_ref()
        .map(|shared| {
            shared
                .config
                .default_download_location
                .to_string_lossy()
                .to_string()
        })
        .with_status_error(StatusCode::FAILED_DEPENDENCY, "Configuration not available")
}

// Torrent database functions

/// Add or update a torrent with TMDB ID
pub async fn torrent_create_with_tmdb(
    state: &State,
    url: String,
    tmdb_id: u64,
    media_type: String,
    episode_info: Option<(i32, i32)>,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    let response = state
        .api()?
        .api_add_torrent(AddTorrent::Url(url.into()), opts)
        .await?;

    // Track in database with TMDB ID
    if let Some(id) = response.id {
        if let Err(e) = state.torrent_db.upsert_torrent(
            id as i32,
            response.details.info_hash.clone(),
            Some(tmdb_id),
            Some(media_type),
            episode_info,
        ) {
            warn!(error=?e, "Failed to update torrent database with TMDB ID");
        }
    }

    Ok(response)
}

/// Add or update a torrent with IMDB code (deprecated, use torrent_create_with_tmdb)
#[deprecated(note = "Use torrent_create_with_tmdb instead")]
pub async fn torrent_create_with_imdb(
    state: &State,
    url: String,
    _imdb_code: String,
    torrent_type: Option<String>,
    episode_info: Option<(i32, i32)>,
    opts: Option<AddTorrentOptions>,
) -> Result<ApiAddTorrentResponse, ApiError> {
    let response = state
        .api()?
        .api_add_torrent(AddTorrent::Url(url.into()), opts)
        .await?;

    // Track in database (deprecated)
    if let Some(id) = response.id {
        if let Err(e) = state.torrent_db.upsert_torrent(
            id as i32,
            response.details.info_hash.clone(),
            None, // No TMDB ID
            torrent_type,
            episode_info,
        ) {
            warn!(error=?e, "Failed to update torrent database");
        }
    }

    Ok(response)
}

/// Set or update TMDB ID for an existing torrent
pub fn set_torrent_tmdb_id(
    state: &State,
    id: TorrentIdOrHash,
    tmdb_id: u64,
    media_type: String,
) -> Result<EmptyJsonResponse, ApiError> {
    // Get torrent details to find info_hash
    let details = state.api()?.api_torrent_details(id)?;
    let torrent_id = details.id.with_status_error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Torrent ID not available",
    )?;
    let info_hash = details.info_hash;

    state
        .torrent_db
        .upsert_torrent(
            torrent_id as i32,
            info_hash,
            Some(tmdb_id),
            Some(media_type),
            None,
        )
        .map_err(|e| {
            warn!(error=?e, "Failed to set TMDB ID in database");
            e
        })
        .with_status_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to update database",
        )?;

    Ok(EmptyJsonResponse {})
}

/// Set or update IMDB code for an existing torrent (deprecated)
#[deprecated(note = "Use set_torrent_tmdb_id instead")]
pub fn set_torrent_imdb_code(
    state: &State,
    id: TorrentIdOrHash,
    _imdb_code: Option<String>,
) -> Result<EmptyJsonResponse, ApiError> {
    // Get torrent details to find info_hash
    let details = state.api()?.api_torrent_details(id)?;
    let torrent_id = details.id.with_status_error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Torrent ID not available",
    )?;
    let info_hash = details.info_hash;

    state
        .torrent_db
        .upsert_torrent(torrent_id as i32, info_hash, None, None, None)
        .map_err(|e| {
            warn!(error=?e, "Failed to set IMDB code in database");
            e
        })
        .with_status_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to update database",
        )?;

    Ok(EmptyJsonResponse {})
}

/// Get TMDB ID for a torrent
pub fn get_torrent_tmdb_id(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<Option<(u64, String)>, ApiError> {
    let details = state.api()?.api_torrent_details(id)?;
    let entry = state.torrent_db.get_by_hash(&details.info_hash);
    Ok(entry.and_then(|e| e.tmdb_id.zip(e.media_type)))
}

/// Get IMDB code for a torrent (deprecated)
#[deprecated(note = "Use get_torrent_tmdb_id instead")]
pub fn get_torrent_imdb_code(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<Option<String>, ApiError> {
    let details = state.api()?.api_torrent_details(id)?;
    #[allow(deprecated)]
    Ok(state.torrent_db.get_imdb_code(&details.info_hash))
}

/// Get full metadata for a torrent (media type and episode info)
#[derive(Serialize)]
pub struct TorrentMetadata {
    pub tmdb_id: Option<u64>,
    pub media_type: Option<String>,
    pub episode_info: Option<(i32, i32)>,
}

pub fn get_torrent_metadata(
    state: &State,
    id: TorrentIdOrHash,
) -> Result<Option<TorrentMetadata>, ApiError> {
    let details = state.api()?.api_torrent_details(id)?;
    let entry = state.torrent_db.get_by_hash(&details.info_hash);

    Ok(entry.map(|e| TorrentMetadata {
        tmdb_id: e.tmdb_id,
        media_type: e.media_type,
        episode_info: e.episode_info,
    }))
}

/// Get all torrents with their metadata
#[derive(Serialize)]
pub struct TorrentWithMetadata {
    pub torrent_id: i32,
    pub info_hash: String,
    pub tmdb_id: Option<u64>,
    pub media_type: Option<String>,
    pub imdb_code: Option<String>,
    pub name: Option<String>,
}

pub fn get_all_torrents_with_metadata(state: &State) -> Result<Vec<TorrentWithMetadata>, ApiError> {
    let entries = state.torrent_db.get_all();
    let api = state.api()?;

    Ok(entries
        .into_iter()
        .map(|entry| {
            // Try to get the torrent name from the API
            let name = api
                .api_torrent_details(TorrentIdOrHash::Id(entry.torrent_id as usize))
                .ok()
                .and_then(|details| details.name);

            TorrentWithMetadata {
                torrent_id: entry.torrent_id,
                info_hash: entry.info_hash,
                tmdb_id: entry.tmdb_id,
                media_type: entry.media_type,
                imdb_code: entry.imdb_code,
                name,
            }
        })
        .collect())
}

/// Get all torrents with their IMDB codes (deprecated, use get_all_torrents_with_metadata)
#[derive(Serialize)]
pub struct TorrentWithImdb {
    pub torrent_id: i32,
    pub info_hash: String,
    pub imdb_code: Option<String>,
    pub name: Option<String>,
}

#[deprecated(note = "Use get_all_torrents_with_metadata instead")]
pub fn get_all_torrents_with_imdb(state: &State) -> Result<Vec<TorrentWithImdb>, ApiError> {
    let entries = state.torrent_db.get_all();
    let api = state.api()?;

    Ok(entries
        .into_iter()
        .map(|entry| {
            // Try to get the torrent name from the API
            let name = api
                .api_torrent_details(TorrentIdOrHash::Id(entry.torrent_id as usize))
                .ok()
                .and_then(|details| details.name);

            TorrentWithImdb {
                torrent_id: entry.torrent_id,
                info_hash: entry.info_hash,
                imdb_code: entry.imdb_code,
                name,
            }
        })
        .collect())
}

pub fn get_library_files_by_tmdb_id(
    state: &State,
    tmdb_id: u64,
    media_type: String,
) -> Result<Vec<TorrentWithMetadata>, ApiError> {
    let entries = state.torrent_db.get_by_tmdb_id(tmdb_id, &media_type);
    let api = state.api()?;

    Ok(entries
        .into_iter()
        .map(|entry| {
            // Try to get the torrent name from the API
            let name = api
                .api_torrent_details(TorrentIdOrHash::Id(entry.torrent_id as usize))
                .ok()
                .and_then(|details| details.name);

            TorrentWithMetadata {
                torrent_id: entry.torrent_id,
                info_hash: entry.info_hash,
                tmdb_id: entry.tmdb_id,
                media_type: entry.media_type,
                imdb_code: entry.imdb_code,
                name,
            }
        })
        .collect())
}

#[deprecated(note = "Use get_library_files_by_tmdb_id instead")]
pub fn get_library_files_by_imdb(
    state: &State,
    imdb_id: String,
) -> Result<Vec<TorrentWithImdb>, ApiError> {
    let entries = state.torrent_db.get_all();
    let api = state.api()?;

    Ok(entries
        .into_iter()
        .filter(|entry| {
            entry
                .imdb_code
                .as_ref()
                .map(|code| code == &imdb_id)
                .unwrap_or(false)
        })
        .map(|entry| {
            // Try to get the torrent name from the API
            let name = api
                .api_torrent_details(TorrentIdOrHash::Id(entry.torrent_id as usize))
                .ok()
                .and_then(|details| details.name);

            TorrentWithImdb {
                torrent_id: entry.torrent_id,
                info_hash: entry.info_hash,
                imdb_code: entry.imdb_code,
                name,
            }
        })
        .collect())
}

pub fn get_all_library_tmdb_ids(state: &State) -> Result<Vec<(u64, String)>, ApiError> {
    let entries = state.torrent_db.get_all();

    Ok(entries
        .into_iter()
        .filter_map(|entry| entry.tmdb_id.zip(entry.media_type))
        .collect())
}

#[deprecated(note = "Use get_all_library_tmdb_ids instead")]
pub fn get_all_library_imdb_codes(state: &State) -> Result<Vec<String>, ApiError> {
    let entries = state.torrent_db.get_all();

    Ok(entries
        .into_iter()
        .filter_map(|entry| entry.imdb_code)
        .collect())
}
