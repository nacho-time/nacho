use anyhow::{Context, Result, anyhow};
use std::path::{Path, PathBuf};
use tracing::info;

/// Transmux a video file (typically MKV) to MP4 format suitable for HTTP streaming
/// The output file will be saved in the same directory with a .mp4 extension
#[tauri::command]
pub async fn transmux_to_mp4(app: tauri::AppHandle, input_path: String) -> Result<String, String> {
    info!("Starting transmux for file: {}", input_path);

    // Validate input path
    let input = Path::new(&input_path);
    if !input.exists() {
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Generate output path (same directory, .mp4 extension)
    let output_path = generate_output_path(input)
        .map_err(|e| format!("Failed to generate output path: {}", e))?;

    // Check if output already exists
    if output_path.exists() {
        info!("Output file already exists: {}", output_path.display());
        return Ok(output_path.to_string_lossy().to_string());
    }

    // Perform transmux in a blocking task since ffmpeg operations are CPU-intensive
    let input_path_clone = input_path.clone();
    let output_path_clone = output_path.clone();

    tokio::task::spawn_blocking(move || transmux_file(&input_path_clone, &output_path_clone, app))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Transmux failed: {}", e))?;

    info!("Successfully transmuxed to: {}", output_path.display());
    Ok(output_path.to_string_lossy().to_string())
}

/// Generate output path by replacing the extension with .mp4
fn generate_output_path(input: &Path) -> Result<PathBuf> {
    let parent = input
        .parent()
        .ok_or_else(|| anyhow!("Cannot get parent directory"))?;

    let stem = input
        .file_stem()
        .ok_or_else(|| anyhow!("Cannot get file stem"))?;

    let mut output = parent.to_path_buf();
    output.push(format!("{}.mp4", stem.to_string_lossy()));

    Ok(output)
}

/// Perform the actual transmux operation using ffmpeg CLI
fn transmux_file(input_path: &str, output_path: &Path, _app: tauri::AppHandle) -> Result<()> {
    info!(
        "Starting ffmpeg conversion: {} -> {}",
        input_path,
        output_path.display()
    );

    // Use ffmpeg CLI to convert MKV to MP4 with HE-AAC audio
    // -i: input file
    // -c:v copy: copy video stream without re-encoding
    // -c:a aac: use built-in AAC encoder
    // -profile:a aac_he_v2: HE-AAC v2 profile (best compression, suitable for streaming)
    // -b:a 64k: audio bitrate (lower bitrate works well with HE-AAC)
    // -movflags +faststart: optimize for streaming
    let status = std::process::Command::new("ffmpeg")
        .arg("-i")
        .arg(input_path)
        .arg("-c:v")
        .arg("copy")
        .arg("-c:a")
        .arg("aac")
        .arg("-profile:a")
        .arg("aac_he_v2")
        .arg("-b:a")
        .arg("64k")
        .arg("-movflags")
        .arg("+faststart")
        .arg("-y") // Overwrite output file if exists
        .arg(output_path)
        .status()
        .context("Failed to execute ffmpeg command")?;

    if !status.success() {
        return Err(anyhow!("ffmpeg command failed with status: {}", status));
    }

    info!("ffmpeg conversion complete");
    Ok(())
}

/// Check if a file needs transmuxing (is not already MP4)
#[tauri::command]
pub fn needs_transmux(file_path: String) -> bool {
    let path = Path::new(&file_path);
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        // Return true if it's NOT an mp4
        ext_lower != "mp4"
    } else {
        false
    }
}

/// Get the expected output path for a transmuxed file
#[tauri::command]
pub fn get_transmux_output_path(input_path: String) -> Result<String, String> {
    let input = Path::new(&input_path);
    generate_output_path(input)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to generate output path: {}", e))
}
