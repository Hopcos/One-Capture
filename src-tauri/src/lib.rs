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
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            hotkey::start_global_hotkey_listener(app.handle().clone());

            // Build system tray icon and context menu in Windows notification area (屏幕右下角状态栏)
            let settings = config::AppSettings::load();
            let show_item = MenuItem::with_id(app, "show", "打开 OneCapture 主界面", true, None::<&str>)?;
            let snip_label = format!("快速截图 ({})", settings.hotkeys.snip);
            let snip_item = MenuItem::with_id(app, "snip", &snip_label, true, None::<&str>)?;
            let record_label = format!("屏幕录制 ({})", settings.hotkeys.screen_record);
            let record_item = MenuItem::with_id(app, "record", &record_label, true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 OneCapture", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &snip_item, &record_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("OneCapture")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "snip" => {
                            let _ = app.emit("global-hotkey-snip", ());
                        }
                        "record" => {
                            let _ = app.emit("global-hotkey-screen-record", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let is_visible = win.is_visible().unwrap_or(false);
                            let is_minimized = win.is_minimized().unwrap_or(false);
                            if !is_visible || is_minimized {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            } else {
                                let _ = win.minimize();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // Prevent quitting application on clicking "X", hide to tray instead
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::pin_last_capture,
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
