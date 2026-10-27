pub mod screen;
pub mod window_detect;

pub use screen::{capture_virtual_screen, crop_rgba, encode_to_jpeg, encode_to_png, ScreenInfo, ScreenRect};
pub use window_detect::detect_window_under_cursor;
