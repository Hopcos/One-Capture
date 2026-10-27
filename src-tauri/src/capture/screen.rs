use std::ptr::null_mut;
use image::{ImageBuffer, Rgba};
use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
    GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    SRCCOPY,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScreenInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Capture the entire virtual desktop spanning all connected monitors.
/// Returns (ScreenInfo, RGBA buffer).
pub fn capture_virtual_screen() -> Result<(ScreenInfo, Vec<u8>), String> {
    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN) as u32;
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN) as u32;

        if width == 0 || height == 0 {
            return Err("Failed to query virtual screen dimensions".to_string());
        }

        let hdc_screen = GetDC(null_mut());
        if hdc_screen.is_null() {
            return Err("Failed to get screen DC".to_string());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_null() {
            ReleaseDC(null_mut(), hdc_screen);
            return Err("Failed to create compatible memory DC".to_string());
        }

        let h_bitmap = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
        if h_bitmap.is_null() {
            DeleteDC(hdc_mem);
            ReleaseDC(null_mut(), hdc_screen);
            return Err("Failed to create compatible bitmap".to_string());
        }

        let old_bitmap = SelectObject(hdc_mem, h_bitmap);

        // Blit screen to memory DC
        let blit_ok = BitBlt(
            hdc_mem,
            0,
            0,
            width as i32,
            height as i32,
            hdc_screen,
            x,
            y,
            SRCCOPY,
        );

        if blit_ok == 0 {
            SelectObject(hdc_mem, old_bitmap);
            DeleteObject(h_bitmap);
            DeleteDC(hdc_mem);
            ReleaseDC(null_mut(), hdc_screen);
            return Err("BitBlt screen copy failed".to_string());
        }

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // Top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [windows_sys::Win32::Graphics::Gdi::RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };

        let mut bgra_buf = vec![0u8; (width * height * 4) as usize];
        let lines_copied = GetDIBits(
            hdc_mem,
            h_bitmap,
            0,
            height,
            bgra_buf.as_mut_ptr() as *mut _,
            &mut bi,
            DIB_RGB_COLORS,
        );

        // Clean up GDI handles immediately
        SelectObject(hdc_mem, old_bitmap);
        DeleteObject(h_bitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(null_mut(), hdc_screen);

        if lines_copied == 0 {
            return Err("GetDIBits failed to copy pixel data".to_string());
        }

        // Convert BGRA -> RGBA in-place with SIMD-friendly loop
        for chunk in bgra_buf.chunks_exact_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
            chunk[3] = 255; // Ensure full opacity
        }

        Ok((
            ScreenInfo {
                x,
                y,
                width,
                height,
            },
            bgra_buf,
        ))
    }
}

/// Crop a sub-region from an RGBA buffer
pub fn crop_rgba(
    src: &[u8],
    src_w: u32,
    src_h: u32,
    crop: &ScreenRect,
) -> Result<Vec<u8>, String> {
    if crop.width == 0 || crop.height == 0 {
        return Err("Crop width and height must be positive".to_string());
    }

    let start_x = crop.x.max(0) as u32;
    let start_y = crop.y.max(0) as u32;
    let end_x = (crop.x + crop.width as i32).min(src_w as i32) as u32;
    let end_y = (crop.y + crop.height as i32).min(src_h as i32) as u32;

    if start_x >= end_x || start_y >= end_y {
        return Err("Crop region lies outside of image bounds".to_string());
    }

    let target_w = end_x - start_x;
    let target_h = end_y - start_y;
    let mut dst = vec![0u8; (target_w * target_h * 4) as usize];

    for row in 0..target_h {
        let src_row = start_y + row;
        let src_offset = ((src_row * src_w + start_x) * 4) as usize;
        let dst_offset = ((row * target_w) * 4) as usize;
        let row_bytes = (target_w * 4) as usize;

        dst[dst_offset..dst_offset + row_bytes]
            .copy_from_slice(&src[src_offset..src_offset + row_bytes]);
    }

    Ok(dst)
}

/// Encode RGBA bytes to PNG format bytes
pub fn encode_to_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let img_buffer: ImageBuffer<Rgba<u8>, _> =
        ImageBuffer::from_raw(width, height, rgba.to_vec())
            .ok_or_else(|| "Failed to construct image buffer for encoding".to_string())?;

    let mut png_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    img_buffer
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    Ok(png_bytes)
}

/// Encode RGBA bytes to JPEG format bytes
pub fn encode_to_jpeg(rgba: &[u8], width: u32, height: u32, quality: u8) -> Result<Vec<u8>, String> {
    let img_buffer: ImageBuffer<Rgba<u8>, _> =
        ImageBuffer::from_raw(width, height, rgba.to_vec())
            .ok_or_else(|| "Failed to construct image buffer for encoding".to_string())?;

    let rgb_img = image::DynamicImage::ImageRgba8(img_buffer).to_rgb8();
    let mut jpeg_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);

    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality);
    encoder
        .encode_image(&rgb_img)
        .map_err(|e| format!("JPEG encoding failed: {}", e))?;

    Ok(jpeg_bytes)
}
