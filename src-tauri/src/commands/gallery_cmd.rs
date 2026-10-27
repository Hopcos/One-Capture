use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};
use base64::prelude::*;
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use crate::config::AppSettings;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaHistoryItem {
    pub name: String,
    pub path: String,
    pub media_type: String, // "video", "audio", "image"
    pub size_bytes: u64,
    pub formatted_size: String,
    pub created_at: String,
    pub modified_timestamp: u64,
}

#[tauri::command]
pub fn get_media_history() -> Result<Vec<MediaHistoryItem>, String> {
    let settings = AppSettings::load();
    let dir = PathBuf::from(&settings.output_dir);
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    let read_dir = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let media_type = match ext.as_str() {
            "mp4" | "mkv" | "webm" | "mov" | "avi" => "video",
            "mp3" | "wav" | "aac" | "flac" | "opus" | "m4a" => "audio",
            "png" | "jpg" | "jpeg" | "bmp" => "image",
            _ => continue,
        };

        if let Ok(metadata) = entry.metadata() {
            let size_bytes = metadata.len();
            let formatted_size = if size_bytes >= 1024 * 1024 {
                format!("{:.2} MB", size_bytes as f64 / (1024.0 * 1024.0))
            } else if size_bytes >= 1024 {
                format!("{:.1} KB", size_bytes as f64 / 1024.0)
            } else {
                format!("{} B", size_bytes)
            };

            let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
            let modified_timestamp = modified
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let dt: DateTime<Local> = DateTime::from(modified);
            let created_at = dt.format("%Y-%m-%d %H:%M:%S").to_string();

            let filename = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("media")
                .to_string();

            items.push(MediaHistoryItem {
                name: filename,
                path: path.to_string_lossy().to_string(),
                media_type: media_type.to_string(),
                size_bytes,
                formatted_size,
                created_at,
                modified_timestamp,
            });
        }
    }

    // Sort newest first
    items.sort_by(|a, b| b.modified_timestamp.cmp(&a.modified_timestamp));
    Ok(items)
}

#[tauri::command]
pub fn save_screenshot_to_history(app: AppHandle, data_url: String) -> Result<String, String> {
    let settings = AppSettings::load();
    let dir = PathBuf::from(&settings.output_dir);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let now = Local::now();
    let filename = format!("OneCapture_Shot_{}.png", now.format("%Y%m%d_%H%M%S"));
    let file_path = dir.join(filename);

    let prefix = "base64,";
    let b64_idx = data_url.find(prefix).ok_or("Invalid data URL")? + prefix.len();
    let bytes = BASE64_STANDARD.decode(&data_url[b64_idx..]).map_err(|e| e.to_string())?;
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();

    // Notify all windows that a new media file was saved
    let _ = app.emit("media-saved", &path_str);

    Ok(path_str)
}

#[tauri::command]
pub fn open_media_file(path: String) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn open_media_folder(path: String) -> Result<(), String> {
    Command::new("explorer")
        .args([format!("/select,\"{}\"", path)])
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_media_file(app: AppHandle, path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        let _ = app.emit("media-deleted", &path);
    }
    Ok(())
}
