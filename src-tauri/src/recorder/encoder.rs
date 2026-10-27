use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use crate::capture::ScreenRect;
use crate::audio::{AudioSourceMode, get_default_mic_name, get_default_speaker_name};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoFormat {
    #[serde(rename = "mp4")]
    Mp4,
    #[serde(rename = "mkv")]
    Mkv,
    #[serde(rename = "webm")]
    Webm,
    #[serde(rename = "mov")]
    Mov,
}

impl VideoFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            VideoFormat::Mp4 => "mp4",
            VideoFormat::Mkv => "mkv",
            VideoFormat::Webm => "webm",
            VideoFormat::Mov => "mov",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoCodec {
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "h264_nvenc")]
    H264Nvenc,
    #[serde(rename = "hevc_nvenc")]
    HevcNvenc,
    #[serde(rename = "h264_amf")]
    H264Amf,
    #[serde(rename = "h264_qsv")]
    H264Qsv,
    #[serde(rename = "libx264")]
    Libx264,
    #[serde(rename = "libx265")]
    Libx265,
    #[serde(rename = "libvpx-vp9")]
    Vp9,
    #[serde(rename = "libaom-av1")]
    Av1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoRecordOptions {
    pub format: VideoFormat,
    pub codec: VideoCodec,
    pub fps: u32,
    pub bitrate_kbps: u32,
    pub region: Option<ScreenRect>,
    pub audio_mode: AudioSourceMode,
    pub time_limit_seconds: Option<u64>,
    pub output_path: Option<String>,
}

impl Default for VideoRecordOptions {
    fn default() -> Self {
        Self {
            format: VideoFormat::Mp4,
            codec: VideoCodec::Auto,
            fps: 60,
            bitrate_kbps: 6000,
            region: None,
            audio_mode: AudioSourceMode::BothMixed,
            time_limit_seconds: None,
            output_path: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioFormat {
    #[serde(rename = "aac")]
    Aac,
    #[serde(rename = "mp3")]
    Mp3,
    #[serde(rename = "wav")]
    Wav,
    #[serde(rename = "flac")]
    Flac,
    #[serde(rename = "opus")]
    Opus,
}

impl AudioFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            AudioFormat::Aac => "m4a",
            AudioFormat::Mp3 => "mp3",
            AudioFormat::Wav => "wav",
            AudioFormat::Flac => "flac",
            AudioFormat::Opus => "opus",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioRecordOptions {
    pub format: AudioFormat,
    pub bitrate_kbps: u32,
    pub sample_rate: u32,
    pub audio_mode: AudioSourceMode,
    pub time_limit_seconds: Option<u64>,
    pub output_path: Option<String>,
}

impl Default for AudioRecordOptions {
    fn default() -> Self {
        Self {
            format: AudioFormat::Aac,
            bitrate_kbps: 192,
            sample_rate: 48000,
            audio_mode: AudioSourceMode::BothMixed,
            time_limit_seconds: None,
            output_path: None,
        }
    }
}

/// Helper to detect if FFmpeg binary is available on the host system
pub fn find_ffmpeg_binary() -> Result<PathBuf, String> {
    let known_paths = [
        r"D:\work\ffmpeg\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"D:\ffmpeg\bin\ffmpeg.exe",
    ];

    for p in &known_paths {
        let path = Path::new(p);
        if path.exists() {
            return Ok(path.to_path_buf());
        }
    }

    if let Ok(output) = std::process::Command::new("ffmpeg").arg("-version").output() {
        if output.status.success() {
            return Ok(PathBuf::from("ffmpeg"));
        }
    }

    Err("FFmpeg executable was not found. Please install FFmpeg or set it in PATH.".to_string())
}

/// Construct FFmpeg argument list for screen recording
pub fn build_screen_recording_args(
    options: &VideoRecordOptions,
    output_file: &str,
) -> Vec<String> {
    let mut args = Vec::new();

    // Overwrite without asking
    args.push("-y".to_string());

    // Performance optimizations: Real-time low latency
    args.push("-probesize".to_string());
    args.push("32M".to_string());

    // Video capture input via Windows GDI grabber
    args.push("-f".to_string());
    args.push("gdigrab".to_string());
    args.push("-draw_mouse".to_string());
    args.push("1".to_string());
    args.push("-framerate".to_string());
    args.push(options.fps.to_string());

    // Region offset or full desktop
    if let Some(r) = &options.region {
        args.push("-offset_x".to_string());
        args.push(r.x.to_string());
        args.push("-offset_y".to_string());
        args.push(r.y.to_string());
        args.push("-video_size".to_string());
        // FFmpeg requires even dimensions
        let w = (r.width / 2) * 2;
        let h = (r.height / 2) * 2;
        args.push(format!("{}x{}", w.max(2), h.max(2)));
    }

    args.push("-i".to_string());
    args.push("desktop".to_string());

    // Audio input handling
    let mic_name = get_default_mic_name();
    let speaker_name = get_default_speaker_name();
    let mut has_audio_stream = false;

    match options.audio_mode {
        AudioSourceMode::Mute => {
            args.push("-an".to_string());
        }
        AudioSourceMode::MicOnly => {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", mic_name));
            has_audio_stream = true;
        }
        AudioSourceMode::SpeakerOnly => {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", speaker_name));
            has_audio_stream = true;
        }
        AudioSourceMode::BothMixed => {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", speaker_name));

            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", mic_name));

            args.push("-filter_complex".to_string());
            args.push("[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=2[aout]".to_string());
            args.push("-map".to_string());
            args.push("0:v".to_string());
            args.push("-map".to_string());
            args.push("[aout]".to_string());
            has_audio_stream = true;
        }
    }

    // Video codec selection
    let vcodec = match options.codec {
        VideoCodec::Auto => "libx264",
        VideoCodec::H264Nvenc => "h264_nvenc",
        VideoCodec::HevcNvenc => "hevc_nvenc",
        VideoCodec::H264Amf => "h264_amf",
        VideoCodec::H264Qsv => "h264_qsv",
        VideoCodec::Libx264 => "libx264",
        VideoCodec::Libx265 => "libx265",
        VideoCodec::Vp9 => "libvpx-vp9",
        VideoCodec::Av1 => "libaom-av1",
    };

    args.push("-c:v".to_string());
    args.push(vcodec.to_string());

    if vcodec == "libx264" || vcodec == "libx265" {
        args.push("-preset".to_string());
        args.push("ultrafast".to_string());
        args.push("-tune".to_string());
        args.push("zerolatency".to_string());
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
    } else if vcodec.contains("nvenc") {
        args.push("-preset".to_string());
        args.push("p1".to_string());
        args.push("-tune".to_string());
        args.push("ull".to_string());
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
    }

    // Video Bitrate
    args.push("-b:v".to_string());
    args.push(format!("{}k", options.bitrate_kbps));

    // Audio encoding settings if enabled
    if has_audio_stream && options.audio_mode != AudioSourceMode::BothMixed {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-b:a".to_string());
        args.push("192k".to_string());
    } else if has_audio_stream && options.audio_mode == AudioSourceMode::BothMixed {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-b:a".to_string());
        args.push("192k".to_string());
    }

    // Movflags for robust playable MP4/MOV container writing
    if options.format == VideoFormat::Mp4 || options.format == VideoFormat::Mov {
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());
    }

    // Optional duration limit
    if let Some(limit) = options.time_limit_seconds {
        args.push("-t".to_string());
        args.push(limit.to_string());
    }

    args.push(output_file.to_string());
    args
}

/// Construct FFmpeg argument list for pure audio recording
pub fn build_audio_recording_args(
    options: &AudioRecordOptions,
    output_file: &str,
) -> Vec<String> {
    let mut args = Vec::new();
    args.push("-y".to_string());

    let mic_name = get_default_mic_name();
    let speaker_name = get_default_speaker_name();

    match options.audio_mode {
        AudioSourceMode::MicOnly => {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", mic_name));
        }
        AudioSourceMode::SpeakerOnly => {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", speaker_name));
        }
        AudioSourceMode::BothMixed => {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", speaker_name));

            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(format!("audio={}", mic_name));

            args.push("-filter_complex".to_string());
            args.push("[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]".to_string());
            args.push("-map".to_string());
            args.push("[aout]".to_string());
        }
        AudioSourceMode::Mute => {
            // Real-time paced silence test tone
            args.push("-re".to_string());
            args.push("-f".to_string());
            args.push("lavfi".to_string());
            args.push("-i".to_string());
            args.push(format!("anullsrc=r={}:cl=stereo", options.sample_rate));
        }
    }

    // Audio format encoder
    let acodec = match options.format {
        AudioFormat::Aac => "aac",
        AudioFormat::Mp3 => "libmp3lame",
        AudioFormat::Wav => "pcm_s16le",
        AudioFormat::Flac => "flac",
        AudioFormat::Opus => "libopus",
    };

    args.push("-c:a".to_string());
    args.push(acodec.to_string());

    if options.format != AudioFormat::Wav {
        args.push("-b:a".to_string());
        args.push(format!("{}k", options.bitrate_kbps));
    }

    // Optional duration limit
    if let Some(limit) = options.time_limit_seconds {
        args.push("-t".to_string());
        args.push(limit.to_string());
    }

    args.push(output_file.to_string());
    args
}
