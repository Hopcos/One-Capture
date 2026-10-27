use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppHotkeys {
    pub snip: String,
    pub screen_record: String,
    pub audio_record: String,
    pub stop_record: String,
    pub pin_clipboard: String,
}

impl Default for AppHotkeys {
    fn default() -> Self {
        Self {
            snip: "F1".to_string(),
            screen_record: "F7".to_string(),
            audio_record: "F8".to_string(),
            stop_record: "Ctrl+Shift+X".to_string(),
            pin_clipboard: "F2".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub output_dir: String,
    pub hotkeys: AppHotkeys,
    pub default_video_format: String,
    pub default_video_codec: String,
    pub default_video_fps: u32,
    pub default_video_bitrate_kbps: u32,
    pub default_audio_format: String,
    pub default_audio_bitrate_kbps: u32,
    pub default_audio_mode: String,
    pub floating_bar_enabled: bool,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        let default_output = dirs::video_dir()
            .or_else(|| dirs::picture_dir())
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OneCapture");

        Self {
            output_dir: default_output.to_string_lossy().to_string(),
            hotkeys: AppHotkeys::default(),
            default_video_format: "mp4".to_string(),
            default_video_codec: "auto".to_string(),
            default_video_fps: 60,
            default_video_bitrate_kbps: 6000,
            default_audio_format: "aac".to_string(),
            default_audio_bitrate_kbps: 192,
            default_audio_mode: "both_mixed".to_string(),
            floating_bar_enabled: true,
            theme: "dark".to_string(),
        }
    }
}

impl AppSettings {
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OneCapture")
            .join("settings.json")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                    return settings;
                }
            }
        }
        let default_settings = Self::default();
        let _ = default_settings.save();
        default_settings
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json_str = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Serialization failed: {}", e))?;
        fs::write(&path, json_str).map_err(|e| format!("Failed to write config file: {}", e))?;
        Ok(())
    }
}
