pub mod annotation;
pub mod audio;
pub mod capture;
pub mod commands;
pub mod config;
pub mod hotkey;
pub mod pin;
pub mod recorder;

use pin::PinManager;
use recorder::RecorderPipeline;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            hotkey::start_global_hotkey_listener(app.handle().clone());
            Ok(())
        })
        .manage(RecorderPipeline::new())
        .manage(PinManager::new())
        .invoke_handler(tauri::generate_handler![
            // Capture commands
            commands::capture_full_screen,
            commands::crop_and_encode,
            commands::detect_window,
            commands::save_image_file,
            commands::hide_overlay,
            commands::set_recording_region,
            // Record commands
            commands::start_screen_record,
            commands::start_audio_record,
            commands::pause_recording,
            commands::resume_recording,
            commands::stop_recording,
            commands::get_recording_status,
            // Pin commands
            commands::create_pin_window,
            commands::start_pin_drag,
            commands::move_pin_by,
            commands::get_pin_data,
            commands::close_pin_window,
            commands::update_pin_zoom,
            commands::update_pin_opacity,
            commands::list_pins,
            // Gallery & History commands
            commands::get_media_history,
            commands::save_screenshot_to_history,
            commands::open_media_file,
            commands::open_media_folder,
            commands::delete_media_file,
            // Settings & Audio commands
            commands::get_settings,
            commands::save_settings,
            commands::get_audio_devices,
            commands::open_output_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running OneCapture application");
}
