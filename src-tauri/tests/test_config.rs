use onecapture_lib::config::AppSettings;

#[test]
fn test_default_settings() {
    let settings = AppSettings::default();
    assert_eq!(settings.hotkeys.snip, "F1");
    assert_eq!(settings.hotkeys.screen_record, "F7");
    assert_eq!(settings.hotkeys.audio_record, "F8");
    assert_eq!(settings.default_video_format, "mp4");
    assert_eq!(settings.default_audio_format, "aac");
    assert!(settings.floating_bar_enabled);
}

#[test]
fn test_settings_serialization_roundtrip() {
    let original = AppSettings::default();
    let json = serde_json::to_string(&original).expect("Serialization failed");
    let deserialized: AppSettings = serde_json::from_str(&json).expect("Deserialization failed");

    assert_eq!(original.hotkeys.snip, deserialized.hotkeys.snip);
    assert_eq!(original.output_dir, deserialized.output_dir);
    assert_eq!(original.default_video_fps, deserialized.default_video_fps);
}
