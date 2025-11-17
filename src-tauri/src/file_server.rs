use axum::{
    Router,
    body::Body,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
    routing::get,
};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use tracing::{error, info};

/// Parse a range header value like "0-1" or "1000-2000" or "1000-"
/// Returns (start, end) inclusive, or None if invalid
fn parse_range(range_str: &str, file_size: u64) -> Option<(u64, u64)> {
    let parts: Vec<&str> = range_str.split('-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start = parts[0].parse::<u64>().ok()?;
    let end = if parts[1].is_empty() {
        // If end is not specified, serve to the end of file
        file_size - 1
    } else {
        parts[1].parse::<u64>().ok()?
    };

    // Ensure start <= end and both are within file bounds
    if start <= end && end < file_size {
        Some((start, end))
    } else {
        None
    }
}

/// Simple HTTP file server for serving transmuxed files
#[derive(Clone)]
pub struct FileServerState {
    current_file: Arc<Mutex<Option<PathBuf>>>,
}

impl FileServerState {
    fn new() -> Self {
        Self {
            current_file: Arc::new(Mutex::new(None)),
        }
    }

    fn set_file(&self, file_path: PathBuf) {
        let mut current = self.current_file.lock().unwrap();
        *current = Some(file_path);
        info!("File server now serving: {:?}", current);
    }

    fn get_file(&self) -> Option<PathBuf> {
        self.current_file.lock().unwrap().clone()
    }
}

/// Add common headers to response
fn add_common_headers(headers_map: &mut HeaderMap, content_type: &str) {
    headers_map.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type).unwrap(),
    );
    headers_map.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers_map.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=3600"),
    );
    headers_map.insert(
        header::VARY,
        HeaderValue::from_static(
            "origin, access-control-request-method, access-control-request-headers",
        ),
    );
    // Add CORS headers
    headers_map.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers_map.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    headers_map.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("range, content-type"),
    );
    headers_map.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("content-length, content-range, accept-ranges"),
    );
}

/// Handle OPTIONS requests for CORS preflight
async fn handle_options() -> Response {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = StatusCode::NO_CONTENT;

    let headers_map = response.headers_mut();
    headers_map.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers_map.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    headers_map.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("range, content-type"),
    );
    headers_map.insert(
        header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static("86400"),
    );

    response
}

async fn serve_video(
    State(state): State<FileServerState>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    // Log all incoming headers for debugging
    info!("Incoming request headers:");
    for (key, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            info!("  {}: {}", key, v);
        }
    }

    let file_path = match state.get_file() {
        Some(path) => path,
        None => {
            error!("No file set");
            return Err(StatusCode::NOT_FOUND);
        }
    };

    let mut file = match File::open(&file_path).await {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to open file: {}", e);
            return Err(StatusCode::NOT_FOUND);
        }
    };

    let metadata = match file.metadata().await {
        Ok(m) => m,
        Err(e) => {
            error!("Failed to get file metadata: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    let file_size = metadata.len();

    // Determine content type
    let content_type = if file_path.extension().and_then(|e| e.to_str()) == Some("mp4") {
        "video/mp4"
    } else {
        "application/octet-stream"
    };

    // Parse Range header
    let range_header = headers
        .get(header::RANGE)
        .and_then(|h| {
            info!("Found Range header: {:?}", h);
            h.to_str().ok()
        })
        .and_then(|s| {
            info!("Range header string: {}", s);
            s.strip_prefix("bytes=")
        })
        .and_then(|range_str| {
            info!("Parsing range request: {}", range_str);
            parse_range(range_str, file_size)
        });

    match range_header {
        Some((start, end)) => {
            // Handle range request with 206 Partial Content
            let content_length = end - start + 1;
            info!(
                "Serving range: {}-{} of {} ({}MB)",
                start,
                end,
                file_size,
                content_length / 1024 / 1024
            );

            // Seek to start position
            if let Err(e) = file.seek(std::io::SeekFrom::Start(start)).await {
                error!("Failed to seek file: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }

            let content_range = format!("bytes {}-{}/{}", start, end, file_size);

            info!(
                "Response headers - Content-Length: {}, Content-Range: {}",
                content_length, content_range
            );

            // For large ranges, use streaming instead of loading into memory
            // Threshold: if range is larger than 10MB, use streaming
            const STREAMING_THRESHOLD: u64 = 10 * 1024 * 1024; // 10MB

            if content_length > STREAMING_THRESHOLD {
                // Use streaming for large ranges
                info!(
                    "Using streaming for large range ({}MB)",
                    content_length / 1024 / 1024
                );

                // Take only the requested bytes
                let limited_reader = file.take(content_length);
                let stream = ReaderStream::new(limited_reader);
                let body = Body::from_stream(stream);

                let mut response = Response::new(body);
                *response.status_mut() = StatusCode::PARTIAL_CONTENT;

                let headers_map = response.headers_mut();
                add_common_headers(headers_map, content_type);
                headers_map.insert(
                    header::CONTENT_LENGTH,
                    HeaderValue::from_str(&content_length.to_string()).unwrap(),
                );
                headers_map.insert(
                    header::CONTENT_RANGE,
                    HeaderValue::from_str(&content_range).unwrap(),
                );

                Ok(response)
            } else {
                // For small ranges (like Safari's 0-1 byte check), read into buffer
                info!("Using buffer for small range ({}KB)", content_length / 1024);

                let mut buffer = vec![0u8; content_length as usize];
                if let Err(e) = file.read_exact(&mut buffer).await {
                    error!("Failed to read file range: {}", e);
                    return Err(StatusCode::INTERNAL_SERVER_ERROR);
                }

                // Build response with explicit headers
                let mut response = Response::new(Body::from(buffer));
                *response.status_mut() = StatusCode::PARTIAL_CONTENT;

                let headers_map = response.headers_mut();
                add_common_headers(headers_map, content_type);
                headers_map.insert(
                    header::CONTENT_LENGTH,
                    HeaderValue::from_str(&content_length.to_string()).unwrap(),
                );
                headers_map.insert(
                    header::CONTENT_RANGE,
                    HeaderValue::from_str(&content_range).unwrap(),
                );

                Ok(response)
            }
        }
        None => {
            // No range header, but we should still support range requests
            // Return 200 OK with Accept-Ranges header to indicate range support
            info!(
                "No Range header - responding with Accept-Ranges to indicate support, size: {}",
                file_size
            );

            // Use streaming for large files instead of loading into memory
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            // Build response with explicit headers
            let mut response = Response::new(body);
            *response.status_mut() = StatusCode::OK;

            let headers_map = response.headers_mut();
            add_common_headers(headers_map, content_type);
            headers_map.insert(
                header::CONTENT_LENGTH,
                HeaderValue::from_str(&file_size.to_string()).unwrap(),
            );

            Ok(response)
        }
    }
}

// Global file server state
lazy_static::lazy_static! {
    static ref FILE_SERVER_STATE: FileServerState = FileServerState::new();
    static ref SERVER_HANDLE: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>> = Arc::new(Mutex::new(None));
}

/// Initialize the file server
#[tauri::command]
pub async fn init_file_server(port: u16) -> Result<String, String> {
    let mut handle_lock = SERVER_HANDLE.lock().unwrap();

    // Check if server is already running
    if handle_lock.is_some() {
        return Ok(format!("http://127.0.0.1:{}", port));
    }

    let state = FILE_SERVER_STATE.clone();
    let addr = format!("127.0.0.1:{}", port);
    let url = format!("http://{}", addr);

    // Create router - handle both root path and any subpath
    let app = Router::new()
        .route("/", get(serve_video).options(handle_options))
        .route("/*path", get(serve_video).options(handle_options))
        .with_state(state);

    // Spawn server task
    let handle = tokio::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => {
                info!("File server started on {}", addr);
                l
            }
            Err(e) => {
                error!("Failed to bind file server: {}", e);
                return;
            }
        };

        if let Err(e) = axum::serve(listener, app).await {
            error!("File server error: {}", e);
        }
    });

    *handle_lock = Some(handle);

    Ok(url)
}

/// Set the file to be served by the file server
#[tauri::command]
pub fn set_served_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    FILE_SERVER_STATE.set_file(path);
    Ok(format!("http://127.0.0.1:8765/video.mp4"))
}

/// Get the URL for the currently served file
#[tauri::command]
pub fn get_served_file_url(port: u16) -> String {
    format!("http://127.0.0.1:{}/video.mp4", port)
}
