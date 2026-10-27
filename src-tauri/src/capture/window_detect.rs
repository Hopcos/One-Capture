use super::screen::ScreenRect;
use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetCursorPos, GetWindowRect, WindowFromPoint, GA_ROOT,
};

/// Get the bounding rect of the top-level window currently under the cursor
pub fn detect_window_under_cursor() -> Option<ScreenRect> {
    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) == 0 {
            return None;
        }

        let hwnd_raw = WindowFromPoint(pt);
        if hwnd_raw.is_null() {
            return None;
        }

        // Retrieve top-level root window ancestor
        let hwnd_root = GetAncestor(hwnd_raw, GA_ROOT);
        let target_hwnd = if !hwnd_root.is_null() {
            hwnd_root
        } else {
            hwnd_raw
        };

        get_window_bounds(target_hwnd)
    }
}

/// Retrieve exact visual bounds for a window handle, respecting DWM shadow offsets
pub unsafe fn get_window_bounds(hwnd: HWND) -> Option<ScreenRect> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };

    // Try DWM extended frame bounds first for exact window content
    let hr = DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS as u32,
        &mut rect as *mut _ as *mut _,
        std::mem::size_of::<RECT>() as u32,
    );

    if hr != 0 {
        // Fallback to standard GetWindowRect
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return None;
        }
    }

    let width = (rect.right - rect.left).max(0) as u32;
    let height = (rect.bottom - rect.top).max(0) as u32;

    if width == 0 || height == 0 {
        return None;
    }

    Some(ScreenRect {
        x: rect.left,
        y: rect.top,
        width,
        height,
    })
}
