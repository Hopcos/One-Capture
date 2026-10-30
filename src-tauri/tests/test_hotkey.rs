use onecapture_lib::hotkey::parse_hotkey_string;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, VK_F1, VK_F6, VK_F7, VK_F8, VK_F9,
};

#[test]
fn test_parse_single_function_key() {
    let parsed_f1 = parse_hotkey_string("F1").expect("Failed to parse F1");
    assert_eq!(parsed_f1.modifiers, MOD_NOREPEAT);
    assert_eq!(parsed_f1.vk_code, VK_F1 as u32);

    let parsed_f6 = parse_hotkey_string("F6").expect("Failed to parse F6");
    assert_eq!(parsed_f6.modifiers, MOD_NOREPEAT);
    assert_eq!(parsed_f6.vk_code, VK_F6 as u32);

    let parsed_f7 = parse_hotkey_string("F7").expect("Failed to parse F7");
    assert_eq!(parsed_f7.modifiers, MOD_NOREPEAT);
    assert_eq!(parsed_f7.vk_code, VK_F7 as u32);

    let parsed_f8 = parse_hotkey_string("F8").expect("Failed to parse F8");
    assert_eq!(parsed_f8.vk_code, VK_F8 as u32);

    let parsed_f9 = parse_hotkey_string("F9").expect("Failed to parse F9");
    assert_eq!(parsed_f9.modifiers, MOD_NOREPEAT);
    assert_eq!(parsed_f9.vk_code, VK_F9 as u32);

    let parsed_prtsc = parse_hotkey_string("PrintScreen").expect("Failed to parse PrintScreen");
    assert_eq!(parsed_prtsc.modifiers, MOD_NOREPEAT);
}

#[test]
fn test_parse_combinations() {
    let parsed = parse_hotkey_string("Ctrl+Shift+A").expect("Failed to parse Ctrl+Shift+A");
    assert_eq!(parsed.modifiers, MOD_NOREPEAT | MOD_CONTROL | MOD_SHIFT);
    assert_eq!(parsed.vk_code, b'A' as u32);

    let parsed_alt = parse_hotkey_string("Alt+R").expect("Failed to parse Alt+R");
    assert_eq!(parsed_alt.modifiers, MOD_NOREPEAT | MOD_ALT);
    assert_eq!(parsed_alt.vk_code, b'R' as u32);
}

#[test]
fn test_parse_invalid_hotkey() {
    assert!(parse_hotkey_string("").is_none());
    assert!(parse_hotkey_string("Ctrl+").is_none());
    assert!(parse_hotkey_string("Shift").is_none());
}
