use onecapture_lib::capture::ScreenRect;
use onecapture_lib::recorder::encoder::{
    build_audio_recording_args, build_screen_recording_args, AudioFormat, AudioRecordOptions,
    VideoCodec, VideoFormat, VideoRecordOptions,
};
use onecapture_lib::audio::AudioSourceMode;

#[test]
fn test_screen_recording_args_fullscreen() {
    let options = VideoRecordOptions {
        format: VideoFormat::Mp4,
        codec: VideoCodec::Libx264,
        fps: 60,
        bitrate_kbps: 6000,
        region: None,
        audio_mode: AudioSourceMode::Mute,
        time_limit_seconds: Some(10),
        output_path: None,
    };

    let args = build_screen_recording_args(&options, "output.mp4");

    assert!(args.contains(&"-y".to_string()));
    assert!(args.contains(&"gdigrab".to_string()));
    assert!(args.contains(&"desktop".to_string()));
    assert!(args.contains(&"60".to_string()));
    assert!(args.contains(&"libx264".to_string()));
    assert!(args.contains(&"6000k".to_string()));
    assert!(args.contains(&"-an".to_string())); // Mute
    assert!(args.contains(&"-movflags".to_string()));
    assert!(args.contains(&"+faststart".to_string()));
    assert!(args.contains(&"-t".to_string()));
    assert!(args.contains(&"10".to_string()));
    assert_eq!(args.last().unwrap(), "output.mp4");
}

#[test]
fn test_screen_recording_args_region_even_dimensions() {
    let options = VideoRecordOptions {
        format: VideoFormat::Mkv,
        codec: VideoCodec::H264Nvenc,
        fps: 30,
        bitrate_kbps: 4000,
        region: Some(ScreenRect {
            x: 100,
            y: 200,
            width: 1281, // Odd dimension
            height: 719, // Odd dimension
        }),
        audio_mode: AudioSourceMode::Mute,
        time_limit_seconds: None,
        output_path: None,
    };

    let args = build_screen_recording_args(&options, "test.mkv");

    assert!(args.contains(&"-offset_x".to_string()));
    assert!(args.contains(&"100".to_string()));
    assert!(args.contains(&"-offset_y".to_string()));
    assert!(args.contains(&"200".to_string()));
    // Should be rounded to even: 1280x718
    assert!(args.contains(&"1280x718".to_string()));
    assert!(args.contains(&"h264_nvenc".to_string()));
}

#[test]
fn test_audio_recording_args_formats() {
    let formats = [
        (AudioFormat::Aac, "aac"),
        (AudioFormat::Mp3, "libmp3lame"),
        (AudioFormat::Wav, "pcm_s16le"),
        (AudioFormat::Flac, "flac"),
        (AudioFormat::Opus, "libopus"),
    ];

    for (fmt, expected_codec) in formats {
        let options = AudioRecordOptions {
            format: fmt,
            bitrate_kbps: 192,
            sample_rate: 48000,
            audio_mode: AudioSourceMode::SpeakerOnly,
            time_limit_seconds: Some(60),
            output_path: None,
        };

        let args = build_audio_recording_args(&options, "output.audio");
        assert!(args.contains(&expected_codec.to_string()));
        assert!(args.contains(&"-f".to_string()));
        assert!(args.contains(&"dshow".to_string()));
    }
}

#[test]
fn test_screen_recording_args_audio_modes() {
    let base_options = VideoRecordOptions {
        format: VideoFormat::Mp4,
        codec: VideoCodec::Libx264,
        fps: 30,
        bitrate_kbps: 4000,
        region: None,
        audio_mode: AudioSourceMode::BothMixed,
        time_limit_seconds: None,
        output_path: None,
    };

    // Both mixed mode: video should map from index 2 and aout from filter_complex
    let args_both = build_screen_recording_args(&base_options, "both.mp4");
    assert!(args_both.contains(&"-map".to_string()));
    assert!(args_both.contains(&"2:v".to_string()));
    assert!(args_both.contains(&"[aout]".to_string()));

    // Mic only: video should map from index 1 and audio from 0:a
    let mut mic_options = base_options.clone();
    mic_options.audio_mode = AudioSourceMode::MicOnly;
    let args_mic = build_screen_recording_args(&mic_options, "mic.mp4");
    assert!(args_mic.contains(&"1:v".to_string()));
    assert!(args_mic.contains(&"0:a".to_string()));

    // Speaker only: video should map from index 1 and audio from 0:a
    let mut speaker_options = base_options.clone();
    speaker_options.audio_mode = AudioSourceMode::SpeakerOnly;
    let args_spk = build_screen_recording_args(&speaker_options, "spk.mp4");
    assert!(args_spk.contains(&"1:v".to_string()));
    assert!(args_spk.contains(&"0:a".to_string()));
}
