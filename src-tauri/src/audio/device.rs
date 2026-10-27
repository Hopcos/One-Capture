use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_input: bool,
}

/// Enumerate available system audio capture devices via ffmpeg dshow or fallback
pub fn list_audio_devices() -> (Vec<AudioDevice>, Vec<AudioDevice>) {
    let mut inputs = Vec::new();
    let mut outputs = Vec::new();

    // Query dshow audio devices using ffmpeg
    if let Ok(output) = Command::new("ffmpeg")
        .args(["-list_devices", "true", "-f", "dshow", "-i", "dummy"])
        .output()
    {
        let stderr = String::from_utf8_lossy(&output.stderr);
        for line in stderr.lines() {
            if let Some(idx) = line.find("\" (audio)") {
                if let Some(start) = line[..idx].rfind('"') {
                    let dev_name = line[start + 1..idx].to_string();
                    let is_capturer = dev_name.to_lowercase().contains("capturer")
                        || dev_name.to_lowercase().contains("loopback")
                        || dev_name.to_lowercase().contains("扬声器");

                    if is_capturer {
                        outputs.push(AudioDevice {
                            id: dev_name.clone(),
                            name: format!("{} (系统声音)", dev_name),
                            is_default: outputs.is_empty(),
                            is_input: false,
                        });
                    } else {
                        inputs.push(AudioDevice {
                            id: dev_name.clone(),
                            name: format!("{} (麦克风)", dev_name),
                            is_default: inputs.is_empty(),
                            is_input: true,
                        });
                    }
                }
            }
        }
    }

    if inputs.is_empty() {
        inputs.push(AudioDevice {
            id: "麦克风阵列 (适用于数字麦克风的英特尔® 智音技术)".to_string(),
            name: "默认麦克风 (Default Microphone)".to_string(),
            is_default: true,
            is_input: true,
        });
    }

    if outputs.is_empty() {
        outputs.push(AudioDevice {
            id: "virtual-audio-capturer".to_string(),
            name: "系统扬声器 (System Loopback)".to_string(),
            is_default: true,
            is_input: false,
        });
    }

    (inputs, outputs)
}

/// Helper to get the best available microphone device name
pub fn get_default_mic_name() -> String {
    let (inputs, _) = list_audio_devices();
    inputs.first().map(|d| d.id.clone()).unwrap_or_else(|| "virtual-audio-capturer".to_string())
}

/// Helper to get the best available system loopback audio device name
pub fn get_default_speaker_name() -> String {
    let (_, outputs) = list_audio_devices();
    outputs.first().map(|d| d.id.clone()).unwrap_or_else(|| "virtual-audio-capturer".to_string())
}
