use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN,
    VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetMessageW, MSG, WM_HOTKEY,
};
use crate::config::AppSettings;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HotkeyId {
    Snip = 1001,
    ScreenRecord = 1002,
    AudioRecord = 1003,
    StopRecord = 1004,
    PinClipboard = 1005,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedHotkey {
    pub modifiers: u32,
    pub vk_code: u32,
}

/// Parse hotkey string (e.g. "Ctrl+Shift+A", "F1", "Alt+R") into Windows VK modifiers and keycode
pub fn parse_hotkey_string(s: &str) -> Option<ParsedHotkey> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.is_empty() {
        return None;
    }

    let mut modifiers = MOD_NOREPEAT;
    let mut key_part = "";

    for part in parts {
        let lower = part.to_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => modifiers |= MOD_CONTROL,
            "shift" => modifiers |= MOD_SHIFT,
            "alt" => modifiers |= MOD_ALT,
            "win" | "super" => modifiers |= MOD_WIN,
            _ => key_part = part,
        }
    }

    if key_part.is_empty() {
        return None;
    }

    let vk_code = match key_part.to_uppercase().as_str() {
        "F1" => VK_F1 as u32,
        "F2" => VK_F2 as u32,
        "F3" => VK_F3 as u32,
        "F4" => VK_F4 as u32,
        "F5" => VK_F5 as u32,
        "F6" => VK_F6 as u32,
        "F7" => VK_F7 as u32,
        "F8" => VK_F8 as u32,
        "F9" => VK_F9 as u32,
        "F10" => VK_F10 as u32,
        "F11" => VK_F11 as u32,
        "F12" => VK_F12 as u32,
        c if c.len() == 1 => {
            let ch = c.chars().next().unwrap();
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase() as u32
            } else {
                return None;
            }
        }
        _ => return None,
    };

    Some(ParsedHotkey { modifiers, vk_code })
}

/// Start background thread to listen for system-wide Windows hotkeys
pub fn start_global_hotkey_listener(app_handle: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));

    thread::spawn(move || {
        let settings = AppSettings::load();

        unsafe {
            // Register hotkeys from user settings
            if let Some(hk) = parse_hotkey_string(&settings.hotkeys.snip) {
                RegisterHotKey(std::ptr::null_mut(), HotkeyId::Snip as i32, hk.modifiers, hk.vk_code);
            }
            if let Some(hk) = parse_hotkey_string(&settings.hotkeys.screen_record) {
                RegisterHotKey(std::ptr::null_mut(), HotkeyId::ScreenRecord as i32, hk.modifiers, hk.vk_code);
            }
            if let Some(hk) = parse_hotkey_string(&settings.hotkeys.audio_record) {
                RegisterHotKey(std::ptr::null_mut(), HotkeyId::AudioRecord as i32, hk.modifiers, hk.vk_code);
            }
            if let Some(hk) = parse_hotkey_string(&settings.hotkeys.stop_record) {
                RegisterHotKey(std::ptr::null_mut(), HotkeyId::StopRecord as i32, hk.modifiers, hk.vk_code);
            }
            if let Some(hk) = parse_hotkey_string(&settings.hotkeys.pin_clipboard) {
                RegisterHotKey(std::ptr::null_mut(), HotkeyId::PinClipboard as i32, hk.modifiers, hk.vk_code);
            }

            let mut msg: MSG = std::mem::zeroed();
            while running.load(Ordering::Relaxed) && GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                if msg.message == WM_HOTKEY {
                    let hotkey_id = msg.wParam as i32;
                    if hotkey_id == HotkeyId::Snip as i32 {
                        let _ = app_handle.emit("global-hotkey-snip", ());
                    } else if hotkey_id == HotkeyId::ScreenRecord as i32 {
                        let _ = app_handle.emit("global-hotkey-screen-record", ());
                    } else if hotkey_id == HotkeyId::AudioRecord as i32 {
                        let _ = app_handle.emit("global-hotkey-audio-record", ());
                    } else if hotkey_id == HotkeyId::StopRecord as i32 {
                        let _ = app_handle.emit("global-hotkey-stop-record", ());
                    } else if hotkey_id == HotkeyId::PinClipboard as i32 {
                        let _ = app_handle.emit("global-hotkey-pin-clipboard", ());
                    }
                }
            }

            // Unregister all hotkeys on exit
            UnregisterHotKey(std::ptr::null_mut(), HotkeyId::Snip as i32);
            UnregisterHotKey(std::ptr::null_mut(), HotkeyId::ScreenRecord as i32);
            UnregisterHotKey(std::ptr::null_mut(), HotkeyId::AudioRecord as i32);
            UnregisterHotKey(std::ptr::null_mut(), HotkeyId::StopRecord as i32);
            UnregisterHotKey(std::ptr::null_mut(), HotkeyId::PinClipboard as i32);
        }
    });
}
