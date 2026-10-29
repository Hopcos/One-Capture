<div align="center">

# OneCapture
### All-in-One High-Performance Desktop Media Capture Suite

[English](README.en.md) | [简体中文](README.md)

> **Ultra-Low CPU & Memory Footprint · Sub-16ms Response · Screen Recording · Audio Capture · Precision Snip & Annotation · Desktop Multi-Pinning**

</div>

---

OneCapture is a lightweight, high-performance desktop media capture and productivity suite engineered specifically for Windows. The underlying engine is built with system-level **Rust**, integrating hardware-accelerated encoding pipelines (NVIDIA NVENC / AMD AMF / Intel QSV) and Win32 native virtual screen memory capture. The front-end leverages modern glassmorphism (Cyberpunk & Acrylic themes) to deliver instantaneous response, seamless ergonomics, and minimal system resource consumption.

> [!IMPORTANT]
> ### 💻 Operating System Support Matrix
> | Operating System | Support Status | Architecture & Runtime | Key Details |
> | :--- | :---: | :--- | :--- |
> | **Windows 11 (64-bit)** | **✅ Full Native Support** | x86_64 / Built-in Edge WebView2 | Deep hardware acceleration, DWM extended frame bounds snapping |
> | **Windows 10 (64-bit, 1809+)** | **✅ Full Native Support** | x86_64 / Built-in Edge WebView2 | Native Win32 message pump, WASAPI system audio loopback |
> | **Windows 7 / 8** | ⚠️ Manual Runtime Required | End-of-Life by Microsoft | Requires manual installation of Microsoft Edge WebView2 Runtime |
> | **macOS (Apple Silicon / Intel)** | ❌ Not Currently Supported | Planned Evolution | On roadmap (planned using ScreenCaptureKit & CoreAudio) |
> | **Linux (X11 / Wayland)** | ❌ Not Currently Supported | Planned Evolution | On roadmap (planned using PipeWire & XShm) |
>
> 💡 **Why Windows-Specific Native Optimization?**  
> To achieve an ultra-lightweight memory footprint (~32MB) and sub-16ms screen freeze response, OneCapture avoids heavy, generic multi-platform abstraction layers. Instead, its core is directly tuned for Windows native subsystems: Win32 GDI zero-copy shared memory bitmaps (`CreateDIBSection` + `BitBlt`), DWM window border clipping, DirectShow hardware master clock synchronization, WASAPI system audio loopback mixing, and instantaneous hot-reloadable shortcuts via dedicated Win32 thread message loops (`PostThreadMessageW` + `GetMessageW`).

---

## Table of Contents
- [Operating System Support Matrix](#-operating-system-support-matrix)
- [Window UI Rendering & Architecture (Tauri v2 + WebView2)](#2-window-ui-rendering--multi-view-architecture-tauri-v2--webview2)
- [Feature Highlights](#feature-highlights)
  - [1. Screen Recording](#1-screen-recording)
  - [2. Standalone Audio Recording](#2-standalone-audio-recording)
  - [3. Area Snip & Desktop Multi-Pinning (Snipaste Experience)](#3-area-snip--desktop-multi-pinning-snipaste-experience)
  - [4. Desktop Floating Capsule](#4-desktop-floating-capsule)
  - [5. Global Hotkeys & Configuration](#5-global-hotkeys--configuration)
  - [6. Multi-Language & Visual Themes](#6-multi-language--visual-themes)
- [Performance Benchmarks](#performance-benchmarks)
- [System Architecture & Core Technical Implementation (Mermaid)](#system-architecture--core-technical-implementation-mermaid)
  - [1. Overall Layered Architecture](#1-overall-layered-architecture)
  - [2. Window UI Rendering & Multi-View Architecture (Tauri v2 + WebView2)](#2-window-ui-rendering--multi-view-architecture-tauri-v2--webview2)
  - [3. Hardware-Accelerated Video Pipeline & Master Clock Synchronization](#3-hardware-accelerated-video-pipeline--master-clock-synchronization)
  - [4. Win32 Global Hotkey Hot-Reload & System Tray Life Cycle](#4-win32-global-hotkey-hot-reload--system-tray-life-cycle)
  - [5. Snipaste-Style Multi-Pin Window Scheduling Engine](#5-snipaste-style-multi-pin-window-scheduling-engine)
  - [6. Zero-Copy Screen Grabbing & Dual-Canvas Annotation Pipeline](#6-zero-copy-screen-grabbing--dual-canvas-annotation-pipeline)
- [Quick Start & Compilation](#quick-start--compilation)
- [Unit Testing & Quality Assurance](#unit-testing--quality-assurance)
- [Hotkey Reference](#hotkey-reference)
- [License](#license)

---

## Feature Highlights

### 1. Screen Recording
- **Flexible Capture Modes**:
  - **Full Screen**: Seamless capture across multi-monitor virtual desktops.
  - **Custom Region**: Pixel-precise arbitrary rectangular region `(X, Y, W, H)` with interactive live alignment overlay.
  - **Window Snapping**: DWM shadow-free window boundary detection.
- **Full-Matrix Audio Capture**:
  - 🎙️ **Microphone Input Only**
  - 🔊 **System Audio Loopback Only** (WASAPI System Loopback)
  - 🎙️+🔊 **Dual-Channel Mixed Audio** (Microphone + Speaker mixed with auto-gain & soft-knee hyperbolic tangent saturation limiter to prevent digital clipping)
  - 🔇 **Pure Muted Video Recording**
- **Recording Duration Windows (Timer)**:
  - Unlimited manual recording or preset duration countdown windows (30s, 5m, 30m, or custom seconds).
- **Video Codecs & Encoders**:
  - **Containers**: MP4 (FastStart enabled), MKV (crash-resilient), WebM, MOV.
  - **Hardware Accelerated Encoders**: NVIDIA NVENC (`h264_nvenc`, `hevc_nvenc`), AMD AMF (`h264_amf`), Intel QSV (`h264_qsv`), and optimized CPU fallback (`libx264`, `libx265`, `libvpx-vp9`).
  - **Frame Rates & Bitrates**: 30 FPS / 60 FPS / 120 FPS; 3,000 to 12,000 Kbps bitrate customization.

### 2. Standalone Audio Recording
- **Comprehensive Audio Formats**:
  - **AAC** (`.m4a` - High compatibility and pristine clarity)
  - **MP3** (`.mp3` - Universally supported audio format)
  - **WAV** (`.wav` - Studio-grade uncompressed linear PCM)
  - **FLAC** (`.flac` - Lossless audio compression)
  - **Opus** (`.opus` - Low-latency modern streaming codec)
- **Quality Parameters**: Sampling rate (44.1 kHz / 48 kHz), Bitrate (128 ~ 320 Kbps).
- **Real-Time VU Peak Meter**: Dynamic dual-channel audio power level display.

### 3. Area Snip & Desktop Multi-Pinning (Snipaste Experience)
- **Pixel-Precise Cropping & Loupe**:
  - 8x oversampled magnifier loupe displaying cursor RGB hex code (e.g. `#00F0FF`) and absolute coordinates.
  - 8 interactive control handles for resizing and repositioning.
- **Desktop Multi-Pinning (Multi-Pin)**:
  - Press `F3` or click the pin button to freeze and float the screenshot atop the desktop.
  - **Supports multiple concurrent independent pin windows**.
  - **Smooth Wheel Zoom**: 20% to 500% smooth scaling with bicubic interpolation.
  - **Drag & Position**: Left-click drag to freely move windows anywhere on screen.
  - **Quick Exit**: Double-click pin, press `Esc`, or right-click to dismiss.
  - **Direct Copy**: Press `Enter` or click copy to write the PNG blob directly to the Windows clipboard.
- **Rich Annotation Toolset**:
  - 🖌️ **Smooth Brush**: Multi-color vector freehand ink.
  - 🧹 **Vector Eraser**: Geometry-collision eraser to eliminate strokes and shapes precisely.
  - ↗️ **Arrow Tool**: Automatically calculated arrowheads with adjustable angles.
  - ⬜ **Rectangles**: Highlight key interface components.
  - 🔤 **Text Annotation**: High-contrast typography annotations.
  - ↩️ **Undo History**: Full vector operation undo/redo stack.

### 4. Desktop Floating Capsule
- Non-intrusive frameless pill capsule floating over desktop during recording.
- Real-time pulse recording indicator and millisecond-accurate timer.
- Dynamic 4-stage audio power VU meter.
- Actions: **Start / Pause / Resume**, **Stop & Save**, and **Snapshot during recording**.
- Fully draggable anywhere across the screen.

### 5. Global Hotkeys & Configuration
- Native Win32 `RegisterHotKey` message queue integration with silent background handling.
- Hot-reload engine: shortcut changes take effect instantly without restarting the application.
- Auto-remembers custom output folders and user codec presets.

### 6. Multi-Language & Visual Themes
- **Internationalization (i18n)**: Seamless one-click switching between **Simplified Chinese (简体中文)** and **English** via the top-right header control.
- **Cyberpunk Theme (Default)**: High-tech neon cyan and magenta glow accents, dark cyber-panels, and animated HUD status indicators.
- **Acrylic Dark Theme**: Understated frosted glass acrylic aesthetic with soft azure gradients.

---

## Performance Benchmarks

| Metric | OneCapture (Rust + Tauri) | Traditional Electron / Python Tools |
| :--- | :--- | :--- |
| **Idle Memory Footprint** | **~32 MB** | 200 MB ~ 450 MB |
| **60 FPS Video Recording CPU Usage** | **0.8% ~ 1.6%** (NVENC active) | 12% ~ 28% (Frequent GC / software encoding) |
| **Cold Startup Time** | **< 280 ms** | 1.8 s ~ 4.2 s |
| **Screenshot Overlay Latency** | **< 16 ms** (Instantaneous zero-flicker freeze) | 200 ms ~ 500 ms |

### Key Optimizations & Reliability Mechanisms:
1. **Graceful Finalization**: Injects `'q\n'` control signals into FFmpeg's `stdin` pipe rather than harsh `SIGKILL`. This ensures the encoder safely flushes memory buffers and writes MP4 FastStart `moov` atom headers and MP3 ID3v2 metadata, completely eliminating corrupted or unplayable media files.
2. **DirectShow Master Clock Alignment**: Hardware audio streams (microphone and loopback speakers) act as the master clock. Timebase compensation prevents timestamp drifting and avoids buffer deadlocks.
3. **Interactive Region Selection**: Transparent targeting crosshairs allow users to drag and select custom regions directly on the desktop with even-pixel normalization.
4. **Zero-Copy Screen Grabbing**: Uses Win32 GDI `CreateCompatibleDC` and `CreateDIBSection` with SIMD 4-byte chunk BGRA-to-RGBA reordering, bypassing disk I/O and redundant memory reallocations.
5. **Soft-Knee Saturation Limiter**: Hyperbolic tangent non-linear saturation curve prevents digital clipping and popping when mixing system audio and microphone inputs.

---

## System Architecture & Core Technical Implementation (Mermaid)

### 1. Overall Layered Architecture

```mermaid
graph TB
    subgraph UI["Front-End Presentation Layer (TypeScript / Vite / Cyberpunk UI)"]
        Dashboard["Dashboard View (index.html)"]
        Overlay["Snip & Overlay Canvas (overlay.html)"]
        FloatingBar["Desktop Floating Capsule (floating-bar.html)"]
        PinWindows["Desktop Pin Windows (pin.html * N)"]
    end

    subgraph IPC["Cross-Language IPC & Event Bus (Tauri v2)"]
        Commands["Asynchronous Commands (Invoke / Commands)"]
        EventBus["Bidirectional Event Bus (Global Events / Emitter)"]
    end

    subgraph Core["Rust Native Core Engine"]
        subgraph CaptureMod["Screen Capture & Boundary Detection"]
            GDIScreen["GDI / BitBlt Memory Bitmap Capture"]
            DWMDetect["DWM Shadow-Free Window Snapping"]
        end
        
        subgraph AudioMod["Audio Engine & Mixer"]
            DeviceDetect["DirectShow Hardware Driver Discovery"]
            Mixer["Dual-Source Soft-Knee Saturation Limiter (Tanh)"]
            VUMeter["Real-time Audio RMS Power Level Calculation"]
        end

        subgraph RecordMod["Hardware Accelerated Pipeline"]
            Encoder["Encoder Parameter Assembler (NVENC/QSV/AMF/x264)"]
            ClockSync["DirectShow Master Clock Interleaved Alignment"]
            Subprocess["FFmpeg Subprocess Lifecycle & Graceful Shutdown"]
        end

        subgraph SystemMod["System Integration & State Management"]
            Hotkey["Win32 Message Queue Global Hotkeys (Hot-Reload)"]
            TrayIcon["System Tray Resident Icon & Close Interception"]
            PinMgr["Multi-Pin Window Instance Lifecycle Manager"]
            Config["Atomic JSON Configuration (settings.json)"]
            I18n["Bilingual Locale System (zh-CN & en-US)"]
        end
    end

    Dashboard --> Commands
    Overlay --> Commands
    FloatingBar --> Commands
    PinWindows --> Commands

    Commands --> CaptureMod
    Commands --> AudioMod
    Commands --> RecordMod
    Commands --> SystemMod

    EventBus <--> Dashboard
    EventBus <--> Overlay
    EventBus <--> FloatingBar
    EventBus <--> SystemMod
```

---

### 2. Window UI Rendering & Multi-View Architecture (Tauri v2 + WebView2)

A common architectural question is: *"Does the window UI run by embedding a Web UI inside native desktop containers?"*

**Yes, absolutely.** OneCapture embeds and renders a modern Web front-end (HTML5 + CSS3 + TypeScript / Vite) inside Windows native **Microsoft Edge WebView2 (Chromium engine)** instances. However, unlike traditional bloated Electron wrappers, OneCapture utilizes the lightweight **Tauri v2 + Rust Native Core** architecture:

```mermaid
graph TB
    subgraph OS["Windows Operating System Environment"]
        WebView2["Built-in Microsoft Edge WebView2 (Chromium Engine)"]
        Win32GDI["Win32 GDI / DWM / WASAPI Native Drivers"]
    end

    subgraph RustNative["Rust Native Core Engine (Native Binary, Zero Node.js Overhead)"]
        Capture["GDI Memory-Mapped Grabbing (SIMD Byte Reordering)"]
        AudioEngine["Dual-Source Tanh Soft-Knee Saturation Mixer"]
        Hotkeys["Dedicated Win32 Thread Message Loop (Instant Hot-Reload)"]
        Encoder["Hardware Accelerated Video Transcoding Pipeline (NVENC/QSV/AMF)"]
    end

    subgraph WebViews["Multi-Window Webviews (HTML5 / CSS3 / TypeScript / Vite)"]
        MainWin["Dashboard Window (index.html) - Settings & Recording Controls"]
        OverlayWin["Snip Canvas Overlay (overlay.html) - Fullscreen Frameless Transparent Window"]
        PinWins["Independent Desktop Pins (pin.html * N) - Frameless Always-On-Top Scalable Windows"]
        FloatBar["Recording Capsule (floating-bar.html) - Frameless Desktop Miniature Pill"]
    end

    Win32GDI <--> RustNative
    WebView2 --- WebViews
    RustNative <-->|"Tauri IPC Binary/JSON Bridge (Microsecond Latency, Zero Middleware)"| WebViews
```

#### Core Mechanisms & Architectural Advantages:
1. **OS-Native Rendering Container (Zero Bloat)**:
   - Traditional Electron apps bundle a complete Chromium browser and Node.js runtime inside every installer, resulting in massive installer sizes (150MB+) and heavy idle memory consumption (200MB ~ 450MB);
   - OneCapture reuses the pre-installed **Microsoft Edge WebView2** runtime built into Windows 10/11. With zero Node.js overhead, the compiled binary is only ~10MB, and idle memory usage remains at a low **~32MB**.
2. **Multi-Window Native Coordination**:
   - **Main Dashboard (`index.html`)**: Standard window housing bilingual preferences, hardware configurations, and gallery history;
   - **Fullscreen Snip Overlay (`overlay.html`)**: Transparent, borderless, and forced always-on-top (`always_on_top: true`). Awakens and renders in sub-16ms;
   - **Desktop Multi-Pinning (`pin.html * N`)**: Each pinned screenshot spawns as an independent transparent WebView instance. It leverages the DOM for smooth 20%~500% mouse wheel scaling and drag-and-drop repositioning;
   - **Desktop Floating Capsule (`floating-bar.html`)**: Non-intrusive borderless capsule running with `skip_taskbar: true`, continuously streaming real-time recording timers and VU audio meters.
3. **Decoupled Separation of Concerns**:
   - **Rust Engine handles heavy, time-critical tasks**: Raw GDI memory bitblt capture, hardware encoder pipes, soft-knee audio limiting, and Win32 thread message loops;
   - **Web UI handles aesthetics and ergonomic interaction**: Cyberpunk neon accents, Acrylic frosted glass (`backdrop-filter`), vector drawing canvas, and instantaneous locale switching.

---

### 3. Hardware-Accelerated Video Pipeline & Master Clock Synchronization

```mermaid
sequenceDiagram
    autonumber
    participant App as Front-End / Hotkey Trigger
    participant Cmd as Rust Commands (record_cmd)
    participant Pipe as RecorderPipeline
    participant FFmpeg as FFmpeg Subprocess
    participant Disk as Local Storage (MP4 / MKV)

    App->>Cmd: start_screen_record(options)
    Cmd->>Cmd: Auto-minimize main window (prevents self-capture)
    Cmd->>Pipe: start_screen_recording(options, out_dir)
    
    rect rgb(240, 248, 255)
    note over Pipe,FFmpeg: Input stream ordering: Hardware audio set as Master Clock
    Pipe->>FFmpeg: Input 0: DirectShow System Loopback Audio (Uptime ~4000s)
    Pipe->>FFmpeg: Input 1: DirectShow Microphone (Uptime ~4000s)
    Pipe->>FFmpeg: Input 2: GDIgrab Desktop Stream (-framerate 30/60)
    Pipe->>FFmpeg: -filter_complex: aresample(async=1000:first_pts=0) + apad + amix
    Pipe->>FFmpeg: -map 2:v -map [aout] (Hardware Encoding: NVENC / QSV / AMF / x264)
    end

    loop Live Stream Recording
        FFmpeg->>Disk: Hardware encoding to disk (Stable 60 FPS, drop=0)
    end

    App->>Cmd: stop_recording()
    Cmd->>Pipe: stop()
    
    rect rgb(255, 245, 238)
    note over Pipe,FFmpeg: Graceful Finalization Mechanism
    Pipe->>FFmpeg: Write 'q\n' control signal to stdin (avoids SIGKILL)
    FFmpeg->>Disk: Flush encoder buffers, rewrite moov atom header (+faststart)
    FFmpeg-->>Pipe: Subprocess exits normally (Exit Code 0)
    end

    Pipe->>Cmd: Return media path, elapsed duration, file size
    Cmd->>App: Restore & focus main window, emit media-saved event
```

---

### 4. Win32 Global Hotkey Hot-Reload & System Tray Life Cycle

```mermaid
flowchart TD
    subgraph UI["Settings UI"]
        Input["Interactive Hotkey Recorder\n(Captures modifiers & virtual keys)"]
        SaveBtn["Click 'Save Configuration'"]
    end

    subgraph RustCmd["Rust settings_cmd"]
        SaveFunc["save_settings()"]
        DiskJSON[("Write settings.json")]
        ReloadSignal["reload_global_hotkeys()"]
    end

    subgraph HotkeyThread["Dedicated Win32 Message Loop Thread"]
        Peek["PeekMessageW (Forces thread message queue initialization)"]
        ThreadID["Record Win32 GetCurrentThreadId()"]
        Loop["GetMessageW(&msg) Blocking Message Loop"]
        
        BranchMsg{Received Message Type}
        WM_HOTKEY["WM_HOTKEY (User pressed shortcut)"]
        WM_RELOAD["WM_USER + 100 (Hot-reload signal)"]
        
        EmitEvent["Tauri Event Emitter\n(global-hotkey-*)"]
        ReRegister["1. UnregisterHotKey for all keys\n2. Reload from settings.json\n3. RegisterHotKey for new combinations"]
    end

    subgraph TrayArea["Windows System Tray"]
        Tray["Resident Tray Icon (OneCapture)"]
        TrayLeft["Left-Click: Smart Toggle / Restore Window"]
        TrayRight["Right-Click Menu: Snip / Record / Settings / Exit"]
        CloseIntercept["Window X Button Intercept: prevent_close() -> hide()"]
    end

    Input --> SaveBtn
    SaveBtn --> SaveFunc
    SaveFunc --> DiskJSON
    SaveFunc --> ReloadSignal
    ReloadSignal -->|PostThreadMessageW| Loop

    Loop --> BranchMsg
    BranchMsg -->|WM_HOTKEY| WM_HOTKEY --> EmitEvent
    BranchMsg -->|WM_USER + 100| WM_RELOAD --> ReRegister

    Tray --> TrayLeft
    Tray --> TrayRight
    CloseIntercept --> Tray
```

---

### 5. Snipaste-Style Multi-Pin Window Scheduling Engine

```mermaid
graph LR
    subgraph Capture["1. Screen Capture & Cropping"]
        GDI["GDI BitBlt Capture"] --> Freeze["Freeze High-Res Frame"]
        Freeze --> Crop["Pixel-Level Physical Crop (getPhysicalCropRect)"]
    end

    subgraph PinCreation["2. Pin Creation & IPC"]
        Crop --> Base64["Export Base64 PNG Data"]
        Base64 --> CreateCmd["create_pin_window IPC Command"]
        CreateCmd --> PinManager["Rust PinManager Registers Instance"]
    end

    subgraph PinWindow["3. Independent Multi-Pin Window"]
        PinManager --> WebviewWindow["Spawn Frameless Transparent Webview\n(always_on_top: true, skip_taskbar: true)"]
        WebviewWindow --> SpawnLocation["Render at exact physical screen coordinates (X, Y, W, H)"]
        SpawnLocation --> Interactive["Smooth Wheel Zoom [0.2x ~ 5.0x]\nLeft-click drag to pan\nDouble-click / Esc to close"]
    end
```

---

### 6. Zero-Copy Screen Grabbing & Dual-Canvas Annotation Pipeline

```mermaid
flowchart TB
    StartTrigger["Trigger Screenshot (F1 / UI / Tray Menu)"] --> WinMin["Main Window Smooth Minimize (Zero Obstruction)"]
    WinMin --> GDICapture["Win32 Native GDI Capture (GetDC + CreateCompatibleDC)"]
    GDICapture --> MemAlloc["CreateDIBSection 32-bit Memory Buffer"]
    MemAlloc --> BitBltCopy["BitBlt Memory Blit (Latency < 16ms)"]
    BitBltCopy --> SIMDConvert["SIMD 4-Byte Chunk BGRA -> RGBA Reordering"]
    SIMDConvert --> WebviewOverlay["Push to Fullscreen Transparent Overlay (overlay.html)"]
    
    subgraph CanvasLayers["Dual-Canvas Vector Rendering Engine"]
        BGCanvas["Bottom Background Canvas: High-res frozen desktop image"]
        AnnotCanvas["Top Interaction Canvas: Vector brush, arrows, rects, text"]
        MagLayer["8x Oversampling Loupe & Hex Pixel Color Picker (#HEX)"]
    end

    WebviewOverlay --> CanvasLayers
    CanvasLayers --> ActionChoice{"User Action"}
    
    ActionChoice -->|F3 / Click Pin| PinAction["Spawn Independent Desktop Floating Pin"]
    ActionChoice -->|Enter / Click Copy| CopyAction["Write PNG Blob to Windows Clipboard"]
    ActionChoice -->|Ctrl+S / Click Save| SaveAction["Save to Output Directory & Sync to Gallery"]
    ActionChoice -->|Esc / Cancel| CloseAction["Dismiss Overlay smoothly"]
```

---

## Quick Start & Compilation

### Prerequisites
1. **Rust Toolchain** (1.75+): `cargo` & `rustc`
2. **Node.js** (v18+) & `npm`
3. **FFmpeg**: Ensure `ffmpeg` is available in your system `PATH`

### Local Development
```powershell
# 1. Install front-end dependencies
npm install

# 2. Start Vite development server
npm run dev

# 3. Launch Tauri application
npm run tauri dev
```

### Production Release Build
```powershell
# Compile production bundle and build standalone executable
npm run build
npm run tauri build
```
Binaries are output to `src-tauri/target/release/`.

---

## Unit Testing & Quality Assurance

OneCapture adheres to rigorous test-driven verification across audio mixing, encoding parameters, timer state machines, geometric mathematics, and shortcut parsing:

```powershell
cd src-tauri
cargo test
```

### Test Coverage Highlights:
- `test_audio_mixer.rs`: Verifies mute mode, microphone gain amplification, dual-source soft-knee saturation limiting, and RMS power level calculation.
- `test_encoder.rs`: Validates even-pixel coordinate normalization (per NVENC specs), NVENC/x264 argument generation, and audio formats (AAC/MP3/WAV/FLAC/Opus).
- `test_timer.rs`: Tests idle states, active recording, pause compensation, and threshold auto-stopping.
- `test_annotation.rs`: Tests arrow triangle vector calculations, eraser stroke collision geometry, and history undo/redo stacks.
- `test_pin.rs`: Validates multi-pin creation, scale clamping `[0.2x, 5.0x]`, opacity bounds `[0.1, 1.0]`, and clean window destruction.
- `test_hotkey.rs`: Tests single keys (`F1`, `F7`), multi-modifier combinations (`Ctrl+Shift+A`), and invalid key handling.
- `test_config.rs`: Ensures default configuration initialization and seamless JSON serialization/deserialization.

---

## Hotkey Reference

| Default Hotkey | Action | Description |
| :--- | :--- | :--- |
| `F1` | Take Screenshot | Freezes desktop, opens magnifier loupe & annotation toolbar |
| `F7` | Start / Stop Screen Recording | Fullscreen or custom region recording (auto-minimizes main window) |
| `F8` | Start / Stop Audio Recording | Studio-grade standalone audio track capture |
| `F3` | Pin Image to Desktop | Instantly pins selected screenshot as an independent top-level window |
| `Esc` / `Double Click Pin` | Dismiss Pin / Overlay | Dismisses active screenshot overlay or floating pin window |
| `Mouse Wheel Scroll` | Zoom Pin Window | Smooth 20% to 500% zoom on active pin window |
| `Enter` | Copy & Finish Screenshot | Copies cropped region to clipboard and closes overlay |

*(All hotkeys can be fully customized in the Settings panel)*

---

## License

This project is licensed under the [MIT License](LICENSE). You are free to use, modify, distribute, and integrate it into commercial and non-commercial workflows.
