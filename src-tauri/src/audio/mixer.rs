use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioSourceMode {
    #[serde(rename = "mic_only")]
    MicOnly,
    #[serde(rename = "speaker_only")]
    SpeakerOnly,
    #[serde(rename = "both_mixed")]
    BothMixed,
    #[serde(rename = "mute")]
    Mute,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMixerConfig {
    pub mode: AudioSourceMode,
    pub mic_gain: f32,      // default 1.0 (0.0 to 2.0)
    pub speaker_gain: f32,  // default 1.0 (0.0 to 2.0)
    pub sample_rate: u32,   // 48000 Hz standard
    pub channels: u16,      // 2 stereo
}

impl Default for AudioMixerConfig {
    fn default() -> Self {
        Self {
            mode: AudioSourceMode::BothMixed,
            mic_gain: 1.0,
            speaker_gain: 1.0,
            sample_rate: 48000,
            channels: 2,
        }
    }
}

/// Software Audio Mixer for mixing Microphone and System Audio streams.
/// Performs gain staging, saturation limiting, and VU peak level calculation.
pub struct AudioMixer {
    config: AudioMixerConfig,
}

impl AudioMixer {
    pub fn new(config: AudioMixerConfig) -> Self {
        Self { config }
    }

    /// Mix two 16-bit signed PCM audio buffers (interleaved stereo or mono).
    /// If lengths differ, processes up to the maximum available samples.
    pub fn mix_pcm16(
        &self,
        mic_samples: &[i16],
        speaker_samples: &[i16],
    ) -> (Vec<i16>, f32) {
        match self.config.mode {
            AudioSourceMode::Mute => (Vec::new(), 0.0),
            AudioSourceMode::MicOnly => {
                let mut out = Vec::with_capacity(mic_samples.len());
                let mut peak: f32 = 0.0;
                for &s in mic_samples {
                    let scaled = (s as f32 * self.config.mic_gain).clamp(-32768.0, 32767.0) as i16;
                    let norm = scaled.abs() as f32 / 32768.0;
                    if norm > peak {
                        peak = norm;
                    }
                    out.push(scaled);
                }
                (out, peak)
            }
            AudioSourceMode::SpeakerOnly => {
                let mut out = Vec::with_capacity(speaker_samples.len());
                let mut peak: f32 = 0.0;
                for &s in speaker_samples {
                    let scaled = (s as f32 * self.config.speaker_gain).clamp(-32768.0, 32767.0) as i16;
                    let norm = scaled.abs() as f32 / 32768.0;
                    if norm > peak {
                        peak = norm;
                    }
                    out.push(scaled);
                }
                (out, peak)
            }
            AudioSourceMode::BothMixed => {
                let max_len = mic_samples.len().max(speaker_samples.len());
                let mut out = Vec::with_capacity(max_len);
                let mut peak: f32 = 0.0;

                for i in 0..max_len {
                    let m = if i < mic_samples.len() {
                        mic_samples[i] as f32 * self.config.mic_gain
                    } else {
                        0.0
                    };

                    let spk = if i < speaker_samples.len() {
                        speaker_samples[i] as f32 * self.config.speaker_gain
                    } else {
                        0.0
                    };

                    // Sum with soft-knee saturation curve to avoid hard clipping distortion
                    let sum = m + spk;
                    let mixed = Self::soft_limit(sum / 32768.0) * 32767.0;
                    let sample_i16 = mixed.clamp(-32768.0, 32767.0) as i16;

                    let norm = sample_i16.abs() as f32 / 32768.0;
                    if norm > peak {
                        peak = norm;
                    }

                    out.push(sample_i16);
                }

                (out, peak)
            }
        }
    }

    /// Soft tanh-like saturation curve to gracefully compress peak transients without digital distortion
    pub fn soft_limit(x: f32) -> f32 {
        if x > 1.0 {
            1.0 - (1.0 / (1.0 + (x - 1.0)))
        } else if x < -1.0 {
            -1.0 + (1.0 / (1.0 + (-x - 1.0)))
        } else {
            x
        }
    }

    /// Compute Root Mean Square (RMS) level and Peak Level in range [0.0, 1.0]
    pub fn calculate_levels(samples: &[i16]) -> (f32, f32) {
        if samples.is_empty() {
            return (0.0, 0.0);
        }

        let mut sum_sq: f64 = 0.0;
        let mut peak: f32 = 0.0;

        for &s in samples {
            let normalized = s.abs() as f32 / 32768.0;
            if normalized > peak {
                peak = normalized;
            }
            sum_sq += (normalized as f64) * (normalized as f64);
        }

        let rms = (sum_sq / samples.len() as f64).sqrt() as f32;
        (rms.min(1.0), peak.min(1.0))
    }
}
