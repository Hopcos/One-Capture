use onecapture_lib::audio::{AudioMixer, AudioMixerConfig, AudioSourceMode};

#[test]
fn test_audio_mixer_mute_mode() {
    let config = AudioMixerConfig {
        mode: AudioSourceMode::Mute,
        ..Default::default()
    };
    let mixer = AudioMixer::new(config);
    let mic = vec![1000i16, 2000i16, 3000i16];
    let spk = vec![500i16, 1500i16, 2500i16];

    let (mixed, peak) = mixer.mix_pcm16(&mic, &spk);
    assert!(mixed.is_empty());
    assert_eq!(peak, 0.0);
}

#[test]
fn test_audio_mixer_mic_only_gain() {
    let config = AudioMixerConfig {
        mode: AudioSourceMode::MicOnly,
        mic_gain: 1.5,
        ..Default::default()
    };
    let mixer = AudioMixer::new(config);
    let mic = vec![1000i16, 2000i16];
    let spk = vec![10000i16, 10000i16];

    let (mixed, peak) = mixer.mix_pcm16(&mic, &spk);
    assert_eq!(mixed.len(), 2);
    assert_eq!(mixed[0], 1500);
    assert_eq!(mixed[1], 3000);
    assert!(peak > 0.0);
}

#[test]
fn test_audio_mixer_both_mixed_soft_limit() {
    let config = AudioMixerConfig {
        mode: AudioSourceMode::BothMixed,
        mic_gain: 1.0,
        speaker_gain: 1.0,
        ..Default::default()
    };
    let mixer = AudioMixer::new(config);
    // Large values that would overflow i16 without limiting
    let mic = vec![30000i16, 32000i16];
    let spk = vec![30000i16, 32000i16];

    let (mixed, peak) = mixer.mix_pcm16(&mic, &spk);
    assert_eq!(mixed.len(), 2);
    // Soft limiter should prevent hard integer overflow / wrap-around
    for sample in mixed {
        assert!(sample >= -32768);
    }
    assert!(peak <= 1.0);
}

#[test]
fn test_audio_levels_calculation() {
    let samples = vec![0i16, 16384i16, -16384i16, 32767i16];
    let (rms, peak) = AudioMixer::calculate_levels(&samples);

    assert!(peak > 0.99); // 32767 / 32768 approx 0.9999
    assert!(rms > 0.4 && rms < 0.8);
}
