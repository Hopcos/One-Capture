// ============================================================================
// OneCapture Internationalization (i18n) Engine
// Supported: zh-CN (Default) | en-US
// ============================================================================

import { getCurrentWindow } from "@tauri-apps/api/window";

export type Language = "zh-CN" | "en-US";

export const translations: Record<Language, Record<string, string>> = {
  "zh-CN": {
    app_title: "OneCapture - 一站式捕捉套件",
    // Navigation Menu
    nav_screen: "屏幕录制",
    nav_audio: "声音录制",
    nav_screenshot: "区域截图与贴图",
    nav_gallery: "录制历史",
    nav_settings: "通用与快捷键设置",
    theme_title: "视觉主题风格",
    theme_cyberpunk: "赛博朋克",
    theme_acrylic: "极光暗黑",
    output_dir_label: "输出存储目录",
    loading_text: "正在读取...",
    sys_ready: "系统就绪 // READY",
    lang_toggle_title: "切换语言 / Switch Language",

    // Screen Recording View
    screen_title: "屏幕录制",
    screen_subtitle: "支持全屏/区域窗口选定、多声源混合、硬件加速编码与定时窗口",
    btn_start_screen: "开始录制 (F7)",
    btn_stop_screen: "停止录制",
    rec_mode_title: "录制范围模式",
    pill_fullscreen: "全屏录制",
    pill_region: "圈定区域",
    pill_window: "选定窗口",
    btn_drag_region: "🖱️ 拖拽圈选录制区域",
    btn_select_window: "🪟 智能选定目标窗口",
    selected_dim_prefix: "✓ 当前已选定: ",
    btn_cancel_selection: "✕ 取消选定",
    coord_dim_label: "指定坐标与尺寸 (X, Y, W, H)",
    audio_source_title: "录制声源选择",
    pill_both_mixed: "🎙️+🔊 混音录制",
    pill_speaker_only: "🔊 仅系统声音",
    pill_mic_only: "🎙️ 仅麦克风",
    pill_mute: "🔇 静音录屏",
    vu_meter_label: "声源音量实时指示",
    encoding_title: "视频编码与格式配置",
    format_label: "封装格式",
    codec_label: "视频编码器",
    fps_label: "帧率 (FPS)",
    bitrate_label: "视频码率",
    timer_title: "时间窗口范围控制 (定时录制)",
    timer_label: "预设时间窗口范围",
    timer_unlimited: "无限制 (手动停止)",
    timer_30s: "30 秒",
    timer_5m: "5 分钟",
    timer_30m: "30 分钟",
    timer_custom: "自定义",
    custom_timer_label: "自定义录制上限时长 (秒)",

    // Audio Recording View
    audio_title: "独立声音录制",
    audio_subtitle: "专业级音频捕捉，支持输入与输出双通道混音与无损音频格式",
    btn_start_audio: "开始录音 (F8)",
    btn_stop_audio: "停止录音",
    audio_source_mode_title: "录音声源模式",
    audio_mixed_pill: "🎙️+🔊 输入输出混音",
    audio_speaker_pill: "🔊 仅电脑扬声器",
    audio_mic_pill: "🎙️ 仅麦克风输入",
    audio_vu_label: "实时波形功率电平",
    audio_config_title: "音频格式与编码质量",
    audio_format_label: "音频格式",
    audio_bitrate_label: "音频码率",
    sample_rate_label: "采样率",

    // Screenshot & Pins View
    snip_title: "区域截图与桌面贴图",
    snip_subtitle: "圈定区域、多张悬浮贴图、拖动缩放、橡皮擦与箭头画笔标注",
    btn_quick_snip: "立即截屏圈选 (F1)",
    pins_list_title: "当前活动桌面贴图列表 (多张管理)",
    pins_empty: "暂无正在悬浮展示的贴图。截屏后点击工具栏“贴图”按钮即可将截图悬浮固定于桌面！",
    pin_scale_prefix: "缩放",
    btn_close_pin: "关闭取消",

    // Gallery View
    gallery_title: "录制历史",
    gallery_subtitle: "查看最新生成的视频录像与音频录音文件",
    btn_refresh_gallery: "刷新列表",
    btn_open_folder: "打开存储目录",
    gallery_card_title: "媒体录制记录",
    gallery_empty: "暂无历史媒体文件。进行录屏、录音或截图后，文件将自动汇总在此处。",
    gallery_count_prefix: "共 ",
    gallery_count_suffix: " 项",
    media_type_video: "视频",
    media_type_audio: "音频",
    media_type_image: "截图",
    btn_media_open: "打开",
    btn_media_locate: "定位",
    media_open_tooltip: "使用默认程序打开",
    media_locate_tooltip: "在文件管理器中定位",
    media_delete_tooltip: "删除此文件",
    toast_open_file_failed: "打开文件失败: ",
    toast_locate_file_failed: "定位文件失败: ",
    toast_deleted_prefix: "已删除",
    toast_delete_failed: "删除失败: ",
    gallery_load_failed: "加载历史记录失败: ",

    // Settings View
    settings_title: "通用与快捷键设置",
    settings_subtitle: "自定义全局快捷键组合、桌面悬浮工具条以及存储路径",
    btn_save_settings: "保存设置配置",
    hotkeys_title: "全局功能快捷键",
    hk_snip_label: "快速截图圈选",
    hk_pin_label: "快速贴图置顶 (Pin)",
    hk_screen_label: "开始/暂停屏幕录制",
    hk_audio_label: "开始/暂停声音录制",
    settings_theme_title: "桌面交互与视觉主题配置",
    settings_theme_label: "界面视觉主题风格 (Theme)",
    settings_theme_cyberpunk: "⚡ 赛博朋克 (Cyberpunk)",
    settings_theme_acrylic: "🔮 极光暗黑 (Acrylic)",
    settings_lang_label: "界面显示语言 (Language)",
    settings_lang_zh: "🇨🇳 简体中文 (Chinese)",
    settings_lang_en: "🇺🇸 English (英文)",
    settings_floating_bar_label: "录制时常驻展示桌面悬浮控制条",
    floating_enabled: "启用 (展示开始/暂停/停止与计时)",
    floating_disabled: "禁用 (仅托盘运行)",
    output_dir_config_label: "默认媒体保存目录",

    // Dynamic Toasts & Alerts
    toast_settings_saved: "✓ 快捷键与个性化配置已成功保存！",
    toast_settings_failed: "保存设置失败：",
    toast_theme_cyberpunk: "✓ 主题已切换为：⚡ 赛博朋克",
    toast_theme_acrylic: "✓ 主题已切换为：🔮 极光暗黑",
    toast_lang_switched: "✓ 界面语言已切换为：简体中文",
    toast_floating_enabled: "✓ 已启用桌面悬浮控制条 (录制时展示控制胶囊)",
    toast_floating_disabled: "✓ 已禁用桌面悬浮控制条 (录制仅在托盘后台运行)",
    toast_recording_started: "🔴 录制已正式启动",
    toast_recording_finished: "✓ 录制已安全停止并保存！",
    toast_recording_failed: "启动录制失败：",
    toast_stop_failed: "停止录制失败：",
    toast_snip_failed: "截屏启动失败：",
    confirm_stop_before_switch: "正在录制中，切换前请先停止当前录制。",
    recording_active_screen: "🔴 正在录制屏幕...",
    recording_active_audio: "🎙️ 正在录制音频...",
  },

  "en-US": {
    app_title: "OneCapture - All-in-One Capture Suite",
    // Navigation Menu
    nav_screen: "Screen Record",
    nav_audio: "Audio Record",
    nav_screenshot: "Snip & Pin",
    nav_gallery: "Recording History",
    nav_settings: "Settings & Hotkeys",
    theme_title: "Visual Theme",
    theme_cyberpunk: "Cyberpunk",
    theme_acrylic: "Acrylic Dark",
    output_dir_label: "Output Directory",
    loading_text: "Loading...",
    sys_ready: "SYSTEM READY // IDLE",
    lang_toggle_title: "Switch Language / 切换语言",

    // Screen Recording View
    screen_title: "Screen Recording",
    screen_subtitle: "Full screen / custom region, multi-audio mixing, hardware encoding & duration timer",
    btn_start_screen: "Start Record (F7)",
    btn_stop_screen: "Stop Record",
    rec_mode_title: "Capture Region Mode",
    pill_fullscreen: "Full Screen",
    pill_region: "Custom Region",
    pill_window: "Select Window",
    btn_drag_region: "🖱️ Drag Selection Area",
    btn_select_window: "🪟 Smart Window Snapping",
    selected_dim_prefix: "✓ Region Selected: ",
    btn_cancel_selection: "✕ Cancel",
    coord_dim_label: "Specified Coordinates & Dimension (X, Y, W, H)",
    audio_source_title: "Audio Source Selection",
    pill_both_mixed: "🎙️+🔊 Mixed Audio",
    pill_speaker_only: "🔊 System Audio",
    pill_mic_only: "🎙️ Microphone Only",
    pill_mute: "🔇 Mute Video",
    vu_meter_label: "Real-time Audio Peak VU Meter",
    encoding_title: "Video Codec & Format Configuration",
    format_label: "Container Format",
    codec_label: "Video Codec",
    fps_label: "Frame Rate (FPS)",
    bitrate_label: "Video Bitrate",
    timer_title: "Duration Window Control (Timer)",
    timer_label: "Preset Duration Window",
    timer_unlimited: "Unlimited (Manual)",
    timer_30s: "30 Seconds",
    timer_5m: "5 Minutes",
    timer_30m: "30 Minutes",
    timer_custom: "Custom",
    custom_timer_label: "Custom Upper Limit Duration (Seconds)",

    // Audio Recording View
    audio_title: "Stand-alone Audio Recording",
    audio_subtitle: "Studio-grade audio capture, dual-channel mixing & lossless audio formats",
    btn_start_audio: "Start Audio Record (F8)",
    btn_stop_audio: "Stop Recording",
    audio_source_mode_title: "Audio Capture Source Mode",
    audio_mixed_pill: "🎙️+🔊 System + Mic Mixed",
    audio_speaker_pill: "🔊 System Output Only",
    audio_mic_pill: "🎙️ Microphone Input Only",
    audio_vu_label: "Real-time Waveform Power Level",
    audio_config_title: "Audio Format & Encoding Quality",
    audio_format_label: "Audio Format",
    audio_bitrate_label: "Audio Bitrate",
    sample_rate_label: "Sampling Rate",

    // Screenshot & Pins View
    snip_title: "Area Snip & Desktop Pins",
    snip_subtitle: "Custom region, multi-window floating pins, smooth zoom, eraser & shapes annotation",
    btn_quick_snip: "Take Screenshot (F1)",
    pins_list_title: "Active Floating Pins (Multi-window Management)",
    pins_empty: "No active floating pins currently. Snip a region and click 'Pin' to float it on desktop!",
    pin_scale_prefix: "Scale",
    btn_close_pin: "Close",

    // Gallery View
    gallery_title: "Recording History",
    gallery_subtitle: "Explore recently recorded video and audio files",
    btn_refresh_gallery: "Refresh List",
    btn_open_folder: "Open Folder",
    gallery_card_title: "Recording Records",
    gallery_empty: "No media records found yet. Captured video, audio or snip files will appear here.",
    gallery_count_prefix: "Total: ",
    gallery_count_suffix: " items",
    media_type_video: "Video",
    media_type_audio: "Audio",
    media_type_image: "Screenshot",
    btn_media_open: "Open",
    btn_media_locate: "Locate",
    media_open_tooltip: "Open with default application",
    media_locate_tooltip: "Show in file explorer",
    media_delete_tooltip: "Delete this file",
    toast_open_file_failed: "Failed to open file: ",
    toast_locate_file_failed: "Failed to locate file: ",
    toast_deleted_prefix: "Deleted",
    toast_delete_failed: "Failed to delete: ",
    gallery_load_failed: "Failed to load history: ",

    // Settings View
    settings_title: "General & Hotkey Settings",
    settings_subtitle: "Customize global hotkeys, desktop floating capsule and media storage directory",
    btn_save_settings: "Save Configuration",
    hotkeys_title: "Global Feature Hotkeys",
    hk_snip_label: "Quick Screen Snip",
    hk_pin_label: "Quick Pin to Desktop",
    hk_screen_label: "Start/Stop Screen Record",
    hk_audio_label: "Start/Stop Audio Record",
    settings_theme_title: "Desktop Interaction & Visual Theme",
    settings_theme_label: "Visual Theme",
    settings_theme_cyberpunk: "⚡ Cyberpunk",
    settings_theme_acrylic: "🔮 Acrylic Dark",
    settings_lang_label: "Display Language",
    settings_lang_zh: "🇨🇳 简体中文 (Chinese)",
    settings_lang_en: "🇺🇸 English",
    settings_floating_bar_label: "Always Show Floating Capsule During Recording",
    floating_enabled: "Enabled (Show controls & live timer)",
    floating_disabled: "Disabled (System tray only)",
    output_dir_config_label: "Default Media Storage Folder",

    // Dynamic Toasts & Alerts
    toast_settings_saved: "✓ Configuration saved successfully!",
    toast_settings_failed: "Failed to save configuration: ",
    toast_theme_cyberpunk: "✓ Theme switched to: ⚡ Cyberpunk",
    toast_theme_acrylic: "✓ Theme switched to: 🔮 Acrylic Dark",
    toast_lang_switched: "✓ Display language switched to: English",
    toast_floating_enabled: "✓ Desktop floating capsule enabled (Shown during recording)",
    toast_floating_disabled: "✓ Desktop floating capsule disabled (System tray only)",
    toast_recording_started: "🔴 Recording has started",
    toast_recording_finished: "✓ Recording stopped and safely saved!",
    toast_recording_failed: "Failed to start recording: ",
    toast_stop_failed: "Failed to stop recording: ",
    toast_snip_failed: "Failed to trigger screenshot: ",
    confirm_stop_before_switch: "Recording in progress. Please stop current recording before switching.",
    recording_active_screen: "🔴 Recording screen...",
    recording_active_audio: "🎙️ Recording audio...",
  },
};

let currentLanguage: Language = "zh-CN";

type LanguageChangeCallback = (lang: Language) => void;
const langChangeCallbacks: LanguageChangeCallback[] = [];

export function onLanguageChange(cb: LanguageChangeCallback): void {
  langChangeCallbacks.push(cb);
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(key: string): string {
  const dict = translations[currentLanguage] || translations["zh-CN"];
  return dict[key] || translations["zh-CN"][key] || key;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang === "en-US" ? "en-US" : "zh-CN";
  document.documentElement.setAttribute("data-lang", currentLanguage);
  updateDOMTranslations();
  langChangeCallbacks.forEach((cb) => {
    try {
      cb(currentLanguage);
    } catch (e) {
      console.error("Language change callback failed:", e);
    }
  });
}

export function updateDOMTranslations(): void {
  // Update Window & Document Title
  const titleText = t("app_title");
  document.title = titleText;
  try {
    getCurrentWindow().setTitle(titleText).catch(() => {});
  } catch {
    // safe fallback in non-tauri or initialization
  }

  // Update all elements with data-i18n
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  // Update all elements with data-i18n-title
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) {
      el.title = t(key);
    }
  });

  // Update all elements with data-i18n-placeholder
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      el.placeholder = t(key);
    }
  });

  // Update Topbar and Settings Pills
  document.querySelectorAll<HTMLElement>("#langSwitchPills .lang-pill-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === currentLanguage);
  });

  document.querySelectorAll<HTMLElement>("#langSettingsPills .pill-option").forEach((pill) => {
    pill.classList.toggle("active", pill.getAttribute("data-value") === currentLanguage);
  });
}
