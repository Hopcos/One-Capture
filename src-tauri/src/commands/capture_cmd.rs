use tauri::{AppHandle, Emitter, Manager};
use base64::prelude::*;
use crate::capture::{capture_virtual_screen, crop_rgba, encode_to_png, detect_window_under_cursor, ScreenRect};

#[derive(serde::Serialize, Clone)]
pub struct CaptureResult {
    pub width: u32,
    pub height: u32,
    pub image_data_url: String,
}

#[tauri::command]
pub async fn capture_full_screen(app: AppHandle) -> Result<CaptureResult, String> {
    // Instantly hide the main window before capturing so no shrunken or lingering window artifacts are captured
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.hide();
    }
    // Small pause to guarantee DWM composition has cleared the window area
    tokio::time::sleep(std::time::Duration::from_millis(60)).await;

    let (info, rgba) = capture_virtual_screen()?;
    let png_bytes = encode_to_png(&rgba, info.width, info.height)?;
    let base64_str = BASE64_STANDARD.encode(&png_bytes);
    let data_url = format!("data:image/png;base64,{}", base64_str);

    let res = CaptureResult {
        width: info.width,
        height: info.height,
        image_data_url: data_url,
    };

    // Show overlay window and send image data directly
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.show();
        let _ = overlay.set_focus();
        let _ = overlay.emit("overlay-data", res.clone());
    }

    Ok(res)
}

#[tauri::command]
pub async fn crop_and_encode(
    data_url: String,
    rect: ScreenRect,
) -> Result<String, String> {
    if !data_url.starts_with("data:image/png;base64,") {
        return Err("Invalid image format".to_string());
    }
    let b64 = &data_url["data:image/png;base64,".len()..];
    let bytes = BASE64_STANDARD.decode(b64).map_err(|e| e.to_string())?;

    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();

    let cropped_bytes = crop_rgba(rgba.as_raw(), rgba.width(), rgba.height(), &rect)?;
    let new_png = encode_to_png(&cropped_bytes, rect.width, rect.height)?;

    Ok(format!("data:image/png;base64,{}", BASE64_STANDARD.encode(&new_png)))
}

#[tauri::command]
pub fn detect_window() -> Option<ScreenRect> {
    detect_window_under_cursor()
}

#[tauri::command]
pub fn save_image_file(file_path: String, data_url: String) -> Result<(), String> {
    let prefix = "base64,";
    let b64_idx = data_url.find(prefix).ok_or("Invalid data URL")? + prefix.len();
    let bytes = BASE64_STANDARD.decode(&data_url[b64_idx..]).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle, restore_main: Option<bool>) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    // Only restore and focus main window when explicitly requested (e.g. record region selection)
    if restore_main.unwrap_or(false) {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.unminimize();
            let _ = main.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_recording_region(app: AppHandle, rect: ScreenRect) -> Result<(), String> {
    // Notify main window of selected recording region
    let _ = app.emit("record-region-selected", rect);
    hide_overlay(app, Some(true))
}
