import math
from PIL import Image, ImageDraw, ImageFilter

def create_onecapture_icon():
    S = 1024
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # 1. Background Squircle with subtle gradient
    padding = 70
    radius = 220
    rect = [padding, padding, S - padding, S - padding]

    # Create dark metallic cosmic background
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)

    # Vertical gradient for background
    for y in range(padding, S - padding):
        ratio = (y - padding) / (S - 2 * padding)
        # Gradient from #0d1222 to #1e1132
        r = int(13 + (30 - 13) * ratio)
        g = int(18 + (17 - 18) * ratio)
        b = int(34 + (50 - 34) * ratio)
        bg_draw.line([(padding, y), (S - padding, y)], fill=(r, g, b, 255))

    # Mask to squircle
    mask = Image.new("L", (S, S), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(rect, radius=radius, fill=255)
    bg.putalpha(mask)

    # Paste background
    img.alpha_composite(bg)

    draw = ImageDraw.Draw(img)

    # 2. Glowing Neon Border around squircle
    border_img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border_img)
    b_draw.rounded_rectangle(rect, radius=radius, outline=(56, 189, 248, 220), width=16)
    img.alpha_composite(border_img)

    # 3. Outer Camera Viewfinder Focus Brackets (Cyan #38bdf8)
    bracket_color = (56, 189, 248, 255)
    b_w = 20
    b_len = 80
    m = 175

    # Top-Left
    draw.line([(m, m + b_len), (m, m)], fill=bracket_color, width=b_w)
    draw.line([(m, m), (m + b_len, m)], fill=bracket_color, width=b_w)
    # Top-Right
    draw.line([(S - m - b_len, m), (S - m, m)], fill=bracket_color, width=b_w)
    draw.line([(S - m, m), (S - m, m + b_len)], fill=bracket_color, width=b_w)
    # Bottom-Left
    draw.line([(m, S - m - b_len), (m, S - m)], fill=bracket_color, width=b_w)
    draw.line([(m, S - m), (m + b_len, S - m)], fill=bracket_color, width=b_w)
    # Bottom-Right
    draw.line([(S - m - b_len, S - m), (S - m, S - m)], fill=bracket_color, width=b_w)
    draw.line([(S - m, S - m - b_len), (S - m, S - m)], fill=bracket_color, width=b_w)

    cx, cy = S // 2, S // 2

    # 4. Aperture & Capture Gradient Ring
    ring_r = 250
    ring_w = 26
    # Multi-color segmented outer ring
    # Top-left to bottom-right gradient arcs
    bbox = [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r]
    draw.arc(bbox, start=210, end=330, fill=(6, 182, 212, 255), width=ring_w)    # Cyan
    draw.arc(bbox, start=330, end=450, fill=(139, 92, 246, 255), width=ring_w)   # Violet
    draw.arc(bbox, start=90, end=210, fill=(244, 63, 94, 255), width=ring_w)     # Rose/Pink

    # 5. Audio Waveform Spectrum Bars (Representing Audio Capture)
    audio_bars = [
        # (x_offset from center, height, color)
        (-145, 90, (56, 189, 248, 230)),
        (-115, 140, (129, 140, 248, 240)),
        (115, 140, (192, 132, 252, 240)),
        (145, 90, (244, 63, 94, 230)),
    ]
    for x_off, h, col in audio_bars:
        bx = cx + x_off
        draw.line([(bx, cy - h // 2), (bx, cy + h // 2)], fill=col, width=14)
        # Rounded caps
        draw.ellipse([bx - 7, cy - h // 2 - 7, bx + 7, cy - h // 2 + 7], fill=col)
        draw.ellipse([bx - 7, cy + h // 2 - 7, bx + 7, cy + h // 2 + 7], fill=col)

    # 6. Center Ruby Recording Core (The "Rec" Heart)
    ruby_r = 115
    for r in range(ruby_r, 0, -2):
        frac = r / ruby_r
        # Radial gradient from bright neon ruby red to deep crimson
        red = int(255 * (1.0 - 0.25 * (1.0 - frac)))
        green = int(40 * frac)
        blue = int(85 * frac)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(red, green, blue, 255))

    # Inner Glow Ring
    draw.ellipse([cx - ruby_r, cy - ruby_r, cx + ruby_r, cy + ruby_r], outline=(255, 255, 255, 200), width=6)

    # Specular Glass Reflection Highlight
    hl_img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hl_draw = ImageDraw.Draw(hl_img)
    hl_draw.ellipse([cx - 75, cy - 80, cx - 15, cy - 35], fill=(255, 255, 255, 220))
    hl_draw.ellipse([cx - 40, cy - 30, cx - 15, cy - 10], fill=(255, 255, 255, 150))
    hl_img = hl_img.filter(ImageFilter.GaussianBlur(3))
    img.alpha_composite(hl_img)

    # White Center Iris Focus Dot
    draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(255, 255, 255, 255))

    return img

if __name__ == "__main__":
    master_img = create_onecapture_icon()
    master_img.save("src-tauri/icons/icon_1024.png", "PNG")

    # Generate standard sizes
    img_256 = master_img.resize((256, 256), Image.Resampling.LANCZOS)
    img_256.save("src-tauri/icons/128x128@2x.png", "PNG")

    img_128 = master_img.resize((128, 128), Image.Resampling.LANCZOS)
    img_128.save("src-tauri/icons/128x128.png", "PNG")

    img_32 = master_img.resize((32, 32), Image.Resampling.LANCZOS)
    img_32.save("src-tauri/icons/32x32.png", "PNG")

    # Multi-resolution ICO for Windows Taskbar & Explorer
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    ico_images = [master_img.resize(size, Image.Resampling.LANCZOS) for size in ico_sizes]
    ico_images[0].save(
        "src-tauri/icons/icon.ico",
        format="ICO",
        sizes=ico_sizes,
        append_images=ico_images[1:],
    )

    print("Successfully generated all OneCapture icons and icon.ico!")
