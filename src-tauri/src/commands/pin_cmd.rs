use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use crate::pin::{PinItem, PinManager};

#[tauri::command]
pub async fn create_pin_window(
    app: AppHandle,
    pin_mgr: State<'_, PinManager>,
    image_data_url: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<PinItem, String> {
    let pin = pin_mgr.create_pin(image_data_url, x, y, width, height);

    // Spawn an independent floating, frameless, always-on-top window for this pin
    let win_label = pin.id.clone();
    let url = format!("pin.html?id={}", &pin.id);

    let _win = WebviewWindowBuilder::new(&app, &win_label, WebviewUrl::App(url.into()))
        .title("Pin")
        .inner_size(width as f64, height as f64)
        .position(x as f64, y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create pin window: {}", e))?;

    Ok(pin)
}

#[tauri::command]
pub fn start_pin_drag(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&id) {
        let _ = win.start_dragging();
    }
    Ok(())
}

#[tauri::command]
pub fn move_pin_by(app: AppHandle, id: String, delta_x: f64, delta_y: f64) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&id) {
        if let Ok(factor) = win.scale_factor() {
            if let Ok(phys_pos) = win.outer_position() {
                let log_pos = phys_pos.to_logical::<f64>(factor);
                let new_log = tauri::LogicalPosition::new(log_pos.x + delta_x, log_pos.y + delta_y);
                let _ = win.set_position(tauri::Position::Logical(new_log));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_pin_data(pin_mgr: State<'_, PinManager>, id: String) -> Result<PinItem, String> {
    pin_mgr
        .get_pin(&id)
        .ok_or_else(|| format!("Pin with id {} not found", id))
}

#[tauri::command]
pub fn close_pin_window(
    app: AppHandle,
    pin_mgr: State<'_, PinManager>,
    id: String,
) -> Result<(), String> {
    pin_mgr.remove_pin(&id);
    if let Some(win) = app.get_webview_window(&id) {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
pub fn update_pin_zoom(
    app: AppHandle,
    pin_mgr: State<'_, PinManager>,
    id: String,
    delta: f32,
) -> Result<f32, String> {
    let scale = pin_mgr
        .update_scale(&id, delta)
        .ok_or_else(|| "Failed to update zoom".to_string())?;

    if let Some(pin) = pin_mgr.get_pin(&id) {
        if let Some(win) = app.get_webview_window(&id) {
            let target_w = (pin.width as f32 * scale).round().max(40.0) as f64;
            let target_h = (pin.height as f32 * scale).round().max(40.0) as f64;
            let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(target_w, target_h)));
        }
    }

    Ok(scale)
}

#[tauri::command]
pub fn update_pin_opacity(
    pin_mgr: State<'_, PinManager>,
    id: String,
    opacity: f32,
) -> Result<f32, String> {
    pin_mgr
        .update_opacity(&id, opacity)
        .ok_or_else(|| "Failed to update opacity".to_string())
}

#[tauri::command]
pub fn list_pins(pin_mgr: State<'_, PinManager>) -> Vec<PinItem> {
    pin_mgr.list_pins()
}
