use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use chrono::Local;

use super::encoder::{
    build_audio_recording_args, build_screen_recording_args, find_ffmpeg_binary,
    AudioRecordOptions, VideoRecordOptions,
};
use super::timer::{RecordingStatus, RecordingTimer};

pub struct ActiveRecording {
    pub process: Child,
    pub output_path: String,
    pub timer: RecordingTimer,
    pub is_video: bool,
}

#[derive(Clone)]
pub struct RecorderPipeline {
    active: Arc<Mutex<Option<ActiveRecording>>>,
}

impl RecorderPipeline {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
        }
    }

    /// Start a screen recording session
    pub fn start_screen_recording(
        &self,
        options: VideoRecordOptions,
        output_dir: &str,
    ) -> Result<String, String> {
        let mut guard = self.active.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("A recording session is already active!".to_string());
        }

        let ffmpeg_bin = find_ffmpeg_binary()?;

        // Generate output filename if not given
        let output_path = if let Some(p) = options.output_path.clone() {
            p
        } else {
            let timestamp = Local::now().format("%Y%m%d_%H%M%S");
            let filename = format!("OneCapture_Video_{}.{}", timestamp, options.format.extension());
            let mut p = PathBuf::from(output_dir);
            if !p.exists() {
                let _ = std::fs::create_dir_all(&p);
            }
            p.push(filename);
            p.to_string_lossy().to_string()
        };

        let args = build_screen_recording_args(&options, &output_path);

        let mut cmd = Command::new(&ffmpeg_bin);
        cmd.args(&args);
        cmd.stdin(Stdio::piped()); // Piped stdin to gracefully send 'q' on stop

        // Hide console window on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn recording engine: {}", e))?;

        let mut timer = RecordingTimer::new(options.time_limit_seconds);
        timer.start();

        *guard = Some(ActiveRecording {
            process: child,
            output_path: output_path.clone(),
            timer,
            is_video: true,
        });

        Ok(output_path)
    }

    /// Start an audio recording session
    pub fn start_audio_recording(
        &self,
        options: AudioRecordOptions,
        output_dir: &str,
    ) -> Result<String, String> {
        let mut guard = self.active.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("A recording session is already active!".to_string());
        }

        let ffmpeg_bin = find_ffmpeg_binary()?;

        let output_path = if let Some(p) = options.output_path.clone() {
            p
        } else {
            let timestamp = Local::now().format("%Y%m%d_%H%M%S");
            let filename = format!("OneCapture_Audio_{}.{}", timestamp, options.format.extension());
            let mut p = PathBuf::from(output_dir);
            if !p.exists() {
                let _ = std::fs::create_dir_all(&p);
            }
            p.push(filename);
            p.to_string_lossy().to_string()
        };

        let args = build_audio_recording_args(&options, &output_path);

        let mut cmd = Command::new(&ffmpeg_bin);
        cmd.args(&args);
        cmd.stdin(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn audio recorder: {}", e))?;

        let mut timer = RecordingTimer::new(options.time_limit_seconds);
        timer.start();

        *guard = Some(ActiveRecording {
            process: child,
            output_path: output_path.clone(),
            timer,
            is_video: false,
        });

        Ok(output_path)
    }

    /// Pause the active recording
    pub fn pause(&self) -> Result<(), String> {
        let mut guard = self.active.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut rec) = *guard {
            rec.timer.pause();
            Ok(())
        } else {
            Err("No active recording to pause".to_string())
        }
    }

    /// Resume the active recording
    pub fn resume(&self) -> Result<(), String> {
        let mut guard = self.active.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut rec) = *guard {
            rec.timer.resume();
            Ok(())
        } else {
            Err("No active recording to resume".to_string())
        }
    }

    /// Stop the recording and gracefully finalize the media file
    pub fn stop(&self) -> Result<(String, String, u64), String> {
        let mut guard = self.active.lock().map_err(|e| e.to_string())?;
        if let Some(mut rec) = guard.take() {
            let duration_str = rec.timer.format_duration();
            let _ = rec.timer.stop();

            // 1. Send 'q' to stdin for graceful container finalization (writing moov atom & ID3 tags)
            if let Some(mut stdin) = rec.process.stdin.take() {
                let _ = stdin.write_all(b"q\n");
                let _ = stdin.flush();
                drop(stdin);
            }

            // 2. Wait up to 3 seconds for FFmpeg to write trailers and exit
            let start = Instant::now();
            let mut finished = false;
            while start.elapsed() < Duration::from_millis(3000) {
                if let Ok(Some(_)) = rec.process.try_wait() {
                    finished = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }

            // 3. Fallback to kill if still running
            if !finished {
                let _ = rec.process.kill();
                let _ = rec.process.wait();
            }

            let file_size = std::fs::metadata(&rec.output_path)
                .map(|m| m.len())
                .unwrap_or(0);

            Ok((rec.output_path, duration_str, file_size))
        } else {
            Err("No active recording to stop".to_string())
        }
    }

    /// Query current status and elapsed duration
    pub fn query_status(&self) -> (RecordingStatus, String, bool) {
        if let Ok(guard) = self.active.lock() {
            if let Some(ref rec) = *guard {
                (rec.timer.status(), rec.timer.format_duration(), rec.is_video)
            } else {
                (RecordingStatus::Idle, "00:00".to_string(), false)
            }
        } else {
            (RecordingStatus::Idle, "00:00".to_string(), false)
        }
    }
}
