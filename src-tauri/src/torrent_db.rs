use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    io::{BufReader, BufWriter},
    path::PathBuf,
    sync::Arc,
};

use anyhow::Context;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

/// Represents a torrent entry in the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentEntry {
    /// The torrent ID from librqbit
    pub torrent_id: i32,
    /// The info hash of the torrent
    pub info_hash: String,
    /// TMDB ID for the media
    pub tmdb_id: Option<u64>,
    /// Type of media: "movie" or "tv"
    pub media_type: Option<String>,
    /// Timestamp when the entry was created
    pub created_at: i64,
    /// Timestamp when the entry was last updated
    pub updated_at: i64,
    /// Season and episode number for TV show torrents (season, episode)
    pub episode_info: Option<(i32, i32)>,
    /// Optional IMDB code for external reference only (deprecated, use tmdb_id)
    #[serde(default)]
    pub imdb_code: Option<String>,
}

/// The persistent database structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct TorrentDatabase {
    /// Map from info_hash to TorrentEntry
    entries: HashMap<String, TorrentEntry>,
}

/// Thread-safe torrent database manager
pub struct TorrentDb {
    db_path: PathBuf,
    data: Arc<RwLock<TorrentDatabase>>,
}

impl TorrentDb {
    /// Create a new TorrentDb instance
    pub fn new(db_path: PathBuf) -> anyhow::Result<Self> {
        let data = if db_path.exists() {
            Self::load_from_file(&db_path)?
        } else {
            info!("Database file not found, creating new database");
            TorrentDatabase::default()
        };

        Ok(Self {
            db_path,
            data: Arc::new(RwLock::new(data)),
        })
    }

    /// Load database from file
    fn load_from_file(path: &PathBuf) -> anyhow::Result<TorrentDatabase> {
        let file = File::open(path).context("Failed to open database file")?;
        let reader = BufReader::new(file);
        let db: TorrentDatabase =
            serde_json::from_reader(reader).context("Failed to deserialize database")?;
        info!("Loaded {} torrent entries from database", db.entries.len());
        Ok(db)
    }

    /// Save database to file
    fn save_to_file(&self) -> anyhow::Result<()> {
        // Create parent directories if they don't exist
        if let Some(parent) = self.db_path.parent() {
            std::fs::create_dir_all(parent).context("Failed to create database directory")?;
        }

        let tmp_path = self.db_path.with_extension("tmp");

        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp_path)
            .context("Failed to create temp database file")?;

        let writer = BufWriter::new(file);
        let data = self.data.read();
        serde_json::to_writer_pretty(writer, &*data).context("Failed to serialize database")?;

        std::fs::rename(&tmp_path, &self.db_path).context("Failed to rename temp database file")?;

        debug!("Saved database with {} entries", data.entries.len());
        Ok(())
    }

    /// Add or update a torrent entry
    pub fn upsert_torrent(
        &self,
        torrent_id: i32,
        info_hash: String,
        tmdb_id: Option<u64>,
        media_type: Option<String>,
        episode_info: Option<(i32, i32)>,
    ) -> anyhow::Result<()> {
        let now = chrono::Utc::now().timestamp();

        let mut data = self.data.write();

        if let Some(entry) = data.entries.get_mut(&info_hash) {
            // Update existing entry
            entry.torrent_id = torrent_id;
            // Only update TMDB fields if new values are provided (Some)
            // This prevents overwriting existing data with None
            if tmdb_id.is_some() {
                entry.tmdb_id = tmdb_id;
            }
            if media_type.is_some() {
                entry.media_type = media_type;
            }
            if episode_info.is_some() {
                entry.episode_info = episode_info;
            }
            entry.updated_at = now;
            debug!("Updated torrent entry: {}", info_hash);
        } else {
            // Create new entry
            let entry = TorrentEntry {
                torrent_id,
                info_hash: info_hash.clone(),
                tmdb_id,
                media_type,
                created_at: now,
                updated_at: now,
                episode_info,
                imdb_code: None, // Deprecated field
            };
            data.entries.insert(info_hash.clone(), entry);
            debug!("Created new torrent entry: {}", info_hash);
        }

        drop(data);
        self.save_to_file()?;
        Ok(())
    }

    /// Get a torrent entry by info hash
    #[allow(dead_code)]
    pub fn get_by_hash(&self, info_hash: &str) -> Option<TorrentEntry> {
        let data = self.data.read();
        data.entries.get(info_hash).cloned()
    }

    /// Get a torrent entry by torrent ID
    #[allow(dead_code)]
    pub fn get_by_id(&self, torrent_id: i32) -> Option<TorrentEntry> {
        let data = self.data.read();
        data.entries
            .values()
            .find(|entry| entry.torrent_id == torrent_id)
            .cloned()
    }

    /// Get TMDB ID for a torrent by info hash
    pub fn get_tmdb_id(&self, info_hash: &str) -> Option<u64> {
        let data = self.data.read();
        data.entries.get(info_hash).and_then(|entry| entry.tmdb_id)
    }

    /// Get IMDB code for a torrent by info hash (deprecated, for backward compatibility)
    #[deprecated(note = "Use get_tmdb_id instead")]
    pub fn get_imdb_code(&self, info_hash: &str) -> Option<String> {
        let data = self.data.read();
        data.entries
            .get(info_hash)
            .and_then(|entry| entry.imdb_code.clone())
    }

    /// Remove a torrent entry by info hash
    pub fn remove_by_hash(&self, info_hash: &str) -> anyhow::Result<()> {
        let mut data = self.data.write();
        if data.entries.remove(info_hash).is_some() {
            debug!("Removed torrent entry: {}", info_hash);
            drop(data);
            self.save_to_file()?;
        }
        Ok(())
    }

    /// Remove a torrent entry by torrent ID
    pub fn remove_by_id(&self, torrent_id: i32) -> anyhow::Result<()> {
        let mut data = self.data.write();

        // Find the info_hash for this torrent_id
        let info_hash = data
            .entries
            .iter()
            .find(|(_, entry)| entry.torrent_id == torrent_id)
            .map(|(hash, _)| hash.clone());

        if let Some(hash) = info_hash {
            data.entries.remove(&hash);
            debug!("Removed torrent entry by ID {}: {}", torrent_id, hash);
            drop(data);
            self.save_to_file()?;
        }

        Ok(())
    }

    /// Sync database with current torrent list
    /// Removes entries for torrents that no longer exist
    pub fn sync_with_torrent_list(&self, active_info_hashes: &[String]) -> anyhow::Result<()> {
        let mut data = self.data.write();
        let initial_count = data.entries.len();

        // Keep only entries that are in the active list
        data.entries
            .retain(|hash, _| active_info_hashes.contains(hash));

        let removed_count = initial_count - data.entries.len();
        if removed_count > 0 {
            info!(
                "Removed {} stale torrent entries from database",
                removed_count
            );
            drop(data);
            self.save_to_file()?;
        } else {
            debug!("Database is in sync with torrent list");
        }

        Ok(())
    }

    /// Get all torrent entries
    pub fn get_all(&self) -> Vec<TorrentEntry> {
        let data = self.data.read();
        data.entries.values().cloned().collect()
    }

    /// Get count of entries
    #[allow(dead_code)]
    pub fn count(&self) -> usize {
        let data = self.data.read();
        data.entries.len()
    }

    /// Get all entries with TMDB IDs
    pub fn get_all_with_tmdb(&self) -> Vec<TorrentEntry> {
        let data = self.data.read();
        data.entries
            .values()
            .filter(|entry| entry.tmdb_id.is_some())
            .cloned()
            .collect()
    }

    /// Get all entries with IMDB codes (deprecated)
    #[deprecated(note = "Use get_all_with_tmdb instead")]
    #[allow(dead_code)]
    pub fn get_all_with_imdb(&self) -> Vec<TorrentEntry> {
        let data = self.data.read();
        data.entries
            .values()
            .filter(|entry| entry.imdb_code.is_some())
            .cloned()
            .collect()
    }

    /// Get entries by TMDB ID and media type
    pub fn get_by_tmdb_id(&self, tmdb_id: u64, media_type: &str) -> Vec<TorrentEntry> {
        let data = self.data.read();
        data.entries
            .values()
            .filter(|entry| {
                entry.tmdb_id == Some(tmdb_id) && entry.media_type.as_deref() == Some(media_type)
            })
            .cloned()
            .collect()
    }
}

// Tests are disabled as tempfile is not a dependency
// To enable tests, add tempfile to dev-dependencies in Cargo.toml
/*
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_torrent_db_operations() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test_torrents.json");

        let db = TorrentDb::new(db_path.clone()).unwrap();

        // Test insert
        db.upsert_torrent(1, "hash1".to_string(), Some(12345), Some("movie".to_string()), None)
            .unwrap();

        // Test get
        let entry = db.get_by_hash("hash1").unwrap();
        assert_eq!(entry.torrent_id, 1);
        assert_eq!(entry.tmdb_id, Some(12345));
        assert_eq!(entry.media_type, Some("movie".to_string()));

        // Test update
        db.upsert_torrent(1, "hash1".to_string(), Some(67890), Some("movie".to_string()), None)
            .unwrap();
        let entry = db.get_by_hash("hash1").unwrap();
        assert_eq!(entry.tmdb_id, Some(67890));

        // Test sync
        db.upsert_torrent(2, "hash2".to_string(), None, None, None).unwrap();
        assert_eq!(db.count(), 2);

        db.sync_with_torrent_list(&["hash1".to_string()]).unwrap();
        assert_eq!(db.count(), 1);

        // Test remove
        db.remove_by_hash("hash1").unwrap();
        assert_eq!(db.count(), 0);
    }
}
*/
