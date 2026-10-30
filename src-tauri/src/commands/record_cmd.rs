use tauri::{AppHandle, Emitter, Manager, State};
use crate::recorder::{
    AudioRecordOptions, RecorderPipeline, RecordingStatus, VideoRecordOptions,
};
use crate::config::AppSettings;

#[derive(serde::Serialize)]
pub struct RecordStatusResult {
    pub status: String,
    pub elapsed: String,
    pub is_video: bool,
}

#[derive(serde::Serialize)]
pub struct StopResult {
    pub path: String,
    pub duration: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn start_screen_record(
    app: AppHandle,
    pipeline: State<'_, RecorderPipeline>,
    options: VideoRecordOptions,
) -> Result<String, String> {
    let settings = AppSettings::load();
    let path = pipeline.start_screen_recording(options, &settings.output_dir)?;

    // Automatically minimize main window so recording doesn't capture the app window
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.minimize();
    }

    // Show or ensure hidden desktop floating controller based on settings
    if let Some(float_win) = app.get_webview_window("floating") {
        if settings.floating_bar_enabled {
            let _ = float_win.show();
        } else {
            let _ = float_win.hide();
        }
    }

    Ok(path)
}

#[tauri::command]
pub async fn start_audio_record(
    app: AppHandle,
    pipeline: State<'_, RecorderPipeline>,
    options: AudioRecordOptions,
) -> Result<String, String> {
    let settings = AppSettings::load();
    let path = pipeline.start_audio_recording(options, &settings.output_dir)?;

    if let Some(float_win) = app.get_webview_window("floating") {
        if settings.floating_bar_enabled {
            let _ = float_win.show();
        } else {
            let _ = float_win.hide();
        }
    }

    Ok(path)
}

#[tauri::command]
pub fn pause_recording(pipeline: State<'_, RecorderPipeline>) -> Result<(), String> {
    pipeline.pause()
}

#[tauri::command]
pub fn resume_recording(pipeline: State<'_, RecorderPipeline>) -> Result<(), String> {
    pipeline.resume()
}

#[tauri::command]
pub fn stop_recording(
    app: AppHandle,
    pipeline: State<'_, RecorderPipeline>,
) -> Result<StopResult, String> {
    let (path, duration, size_bytes) = pipeline.stop()?;

    // Hide desktop floating bar
    if let Some(float_win) = app.get_webview_window("floating") {
        let _ = float_win.hide();
    }

    // Restore and focus main window when recording finishes
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }

    let res = StopResult {
        path: path.clone(),
        duration,
        size_bytes,
    };

    // Emit events to update media history and reset buttons in main window
    let _ = app.emit("media-saved", &path);
    let _ = app.emit("recording-stopped", ());

    Ok(res)
}

#[tauri::command]
pub fn get_recording_status(pipeline: State<'_, RecorderPipeline>) -> RecordStatusResult {
    let (status, elapsed, is_video) = pipeline.query_status();
    let status_str = match status {
        RecordingStatus::Idle => "idle",
        RecordingStatus::Recording => "recording",
        RecordingStatus::Paused => "paused",
        RecordingStatus::Stopped => "stopped",
    };

    RecordStatusResult {
        status: status_str.to_string(),
        elapsed,
        is_video,
    }
}
