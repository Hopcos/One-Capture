use std::process::Command;
use tauri::{AppHandle, Emitter};
use crate::audio::{list_audio_devices, AudioDevice};
use crate::config::AppSettings;

#[derive(serde::Serialize)]
pub struct AudioDevicesResult {
    pub inputs: Vec<AudioDevice>,
    pub outputs: Vec<AudioDevice>,
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    AppSettings::load()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    settings.save()?;
    crate::hotkey::reload_global_hotkeys();
    let _ = app.emit("settings-updated", &settings);
    Ok(())
}

#[tauri::command]
pub fn get_audio_devices() -> AudioDevicesResult {
    let (inputs, outputs) = list_audio_devices();
    AudioDevicesResult { inputs, outputs }
}

#[tauri::command]
pub fn open_output_folder(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).exists() {
        let _ = std::fs::create_dir_all(&path);
    }
    Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    Ok(())
}
