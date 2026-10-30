import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { setLanguage, getLanguage, t, updateDOMTranslations, onLanguageChange, type Language } from "./i18n";

interface AppSettings {
  output_dir: string;
  hotkeys: {
    snip: string;
    screen_record: string;
    audio_record: string;
    stop_record: string;
    pin_clipboard: string;
  };
  default_video_format: string;
  default_video_codec: string;
  default_video_fps: number;
  default_video_bitrate_kbps: number;
  default_audio_format: string;
  default_audio_bitrate_kbps: number;
  default_audio_mode: string;
  floating_bar_enabled: boolean;
  theme: string;
  language: string;
}

interface PinItem {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  opacity: number;
  image_data_url: string;
}

interface RecordStatusResult {
  status: string;
  elapsed: string;
  is_video: boolean;
}

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let isRecording = false;
let isPaused = false;
let currentRecordingType: "screen" | "audio" | null = null;
let statusPollInterval: any = null;

let currentHotkeys = {
  snip: "F1",
  screen_record: "F7",
  audio_record: "F6",
  stop_record: "F9",
  pin_clipboard: "F3",
};

// Lightweight in-app Toast notification (eliminates browser alert modals!)
export function showToast(message: string, type: "info" | "success" | "error" = "info", duration = 3000) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "ℹ️";
  if (type === "success") icon = "✓";
  if (type === "error") icon = "⚠️";

  toast.innerHTML = `
    <span style="font-weight: 700; font-size: 14px;">${icon}</span>
    <span style="line-height: 1.4;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, duration);
}

// Reset recording buttons back to initial idle state
function resetRecordingUI() {
  isRecording = false;
  isPaused = false;
  currentRecordingType = null;
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }

  const btnScreen = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
  const btnStopScreen = document.getElementById("btnStopScreenRecord") as HTMLButtonElement;
  if (btnScreen) {
    btnScreen.classList.remove("btn-danger", "btn-warning");
    btnScreen.classList.add("btn-primary");
    const hkText = currentHotkeys.screen_record || "F7";
    btnScreen.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span id="btnStartScreenRecordText">${t("btn_start_screen")} (${hkText})</span>`;
  }
  if (btnStopScreen) {
    btnStopScreen.style.display = "none";
  }

  const btnAudio = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;
  const btnStopAudio = document.getElementById("btnStopAudioRecord") as HTMLButtonElement;
  if (btnAudio) {
    btnAudio.classList.remove("btn-danger", "btn-warning");
    btnAudio.classList.add("btn-primary");
    const hkText = currentHotkeys.audio_record || "F6";
    btnAudio.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span id="btnStartAudioRecordText">${t("btn_start_audio")} (${hkText})</span>`;
  }
  if (btnStopAudio) {
    btnStopAudio.style.display = "none";
  }
}

// DOM Elements Initialization
window.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupPills();
  await loadSettings();
  setupRecordingHandlers();
  setupScreenshotHandler();
  setupInteractiveRegionSelector();
  setupGalleryHandlers();
  setupAudioLevelSimulation();
  setupGlobalHotkeyListeners();
  setupEscapeKeyHandler();
  onLanguageChange(() => {
    refreshPinsList();
    loadMediaGallery();
    if (!isRecording) {
      resetRecordingUI();
    }
  });
  refreshPinsList();
  await loadMediaGallery();

  await listen<string>("media-saved", async (event) => {
    loadMediaGallery();
    // Do not pop up finished toasts or unminimize main window for screenshots!
    const isImage = event.payload && (event.payload.endsWith(".png") || event.payload.endsWith(".jpg"));
    if (!isImage) {
      resetRecordingUI();
      showToast(t("toast_recording_finished"), "success");
      try {
        const appWin = getCurrentWindow();
        await appWin.unminimize();
        await appWin.show();
        await appWin.setFocus();
      } catch (e) {
        console.warn("Failed to unminimize window on media-saved:", e);
      }
    }
  });
  await listen("recording-stopped", async () => {
    resetRecordingUI();
    try {
      const appWin = getCurrentWindow();
      await appWin.unminimize();
      await appWin.show();
      await appWin.setFocus();
    } catch (e) {
      console.warn("Failed to unminimize window on recording-stopped:", e);
    }
  });
  await listen("media-deleted", () => {
    loadMediaGallery();
    showToast("文件已删除", "info");
  });
});

function setupEscapeKeyHandler() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // If fullscreen or if anything open, handle escape
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  });
}

// Screen capture workflow that safely hides the main window instantly (no shrink animation)
async function startCaptureWorkflow(mode: "screenshot" | "record_region") {
  const appWin = getCurrentWindow();
  try {
    // 1. Immediately hide main window without minimize animation so no shrunken window appears in screenshot
    await appWin.hide();
    // 2. Allow Windows DWM composition transition to settle
    await new Promise((resolve) => setTimeout(resolve, 60));
    // 3. Emit overlay mode & trigger capture
    await emit("set-overlay-mode", { mode });
    await invoke("capture_full_screen");
  } catch (err) {
    console.error("Failed to start capture workflow:", err);
    await appWin.show();
    await appWin.unminimize();
    await appWin.setFocus();
  }
}

async function handleGlobalPinShortcut() {
  try {
    // 1. Try to pin the last capture or clipboard image via Rust
    const pin = await invoke<PinItem | null>("pin_last_capture");
    if (pin) {
      await refreshPinsList();
      return;
    }
    // 2. Fallback to reading image from system clipboard
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result as string;
              const img = new Image();
              img.onload = async () => {
                const maxW = Math.min(800, window.innerWidth - 100);
                const scale = Math.min(1.0, maxW / img.width);
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const x = Math.max(50, Math.round((window.screen.width - w) / 2));
                const y = Math.max(50, Math.round((window.screen.height - h) / 2));
                await invoke("create_pin_window", {
                  imageDataUrl: dataUrl,
                  x,
                  y,
                  width: w,
                  height: h,
                });
                await refreshPinsList();
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Global pin handling:", e);
  }
}

async function setupGlobalHotkeyListeners() {
  await listen("global-hotkey-snip", async () => {
    try {
      const overlayWin = await WebviewWindow.getByLabel("overlay");
      const isOverlayVisible = await overlayWin?.isVisible();
      if (isOverlayVisible) {
        await invoke("hide_overlay", { restoreMain: false });
        return;
      }
    } catch (_) {}
    await startCaptureWorkflow("screenshot");
  });

  await listen("global-hotkey-pin-clipboard", async () => {
    try {
      const overlayWin = await WebviewWindow.getByLabel("overlay");
      const isOverlayVisible = await overlayWin?.isVisible();
      if (isOverlayVisible) {
        return;
      }
    } catch (_) {}
    await handleGlobalPinShortcut();
  });

  await listen("global-hotkey-screen-record", async () => {
    await handleScreenRecordToggle();
  });

  await listen("global-hotkey-audio-record", async () => {
    await handleAudioRecordToggle();
  });

  await listen("global-hotkey-stop-record", async () => {
    await stopActiveRecording();
  });
}

// Tab Switching
function setupTabs() {
  const navItems = document.querySelectorAll<HTMLElement>(".nav-item");
  const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const tabId = item.getAttribute("data-tab");
      navItems.forEach((n) => n.classList.remove("active"));
      tabContents.forEach((t) => (t.style.display = "none"));

      item.classList.add("active");
      const activeTab = document.getElementById(`tab-${tabId}`);
      if (activeTab) {
        activeTab.style.display = "flex";
      }

      if (tabId === "screenshot") {
        refreshPinsList();
      } else if (tabId === "gallery") {
        loadMediaGallery();
      }
    });
  });
}

// Interactive Radio Pill Groups
function setupPills() {
  const pillGroups = document.querySelectorAll<HTMLElement>(".pill-group");
  pillGroups.forEach((group) => {
    const options = group.querySelectorAll<HTMLElement>(".pill-option");
    options.forEach((opt) => {
      opt.addEventListener("click", () => {
        options.forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");

        const val = opt.getAttribute("data-value");
        if (group.id === "screenAreaPills") {
          const customFields = document.getElementById("customRegionFields");
          if (customFields) {
            customFields.style.display = val === "custom_region" || val === "window" ? "block" : "none";
          }
        } else if (group.id === "screenTimerPills") {
          const customTimer = document.getElementById("customTimerField");
          if (customTimer) {
            customTimer.style.display = val === "custom" ? "block" : "none";
          }
        }
      });
    });
  });
}

// Interactive Region and Window Selector for Video Recording
let isWindowSelected = false;

function setupInteractiveRegionSelector() {
  const btnSelectRegion = document.getElementById("btnTriggerSelectRegion") as HTMLButtonElement;
  const btnSelectWindow = document.getElementById("btnTriggerSelectWindow") as HTMLButtonElement;
  const btnCancelRegion = document.getElementById("btnCancelSelectedRegion") as HTMLButtonElement;
  const badge = document.getElementById("selectedRegionBadge");
  const badgeText = document.getElementById("badgeDimText");
  const regionX = document.getElementById("regionX") as HTMLInputElement;
  const regionY = document.getElementById("regionY") as HTMLInputElement;
  const regionW = document.getElementById("regionW") as HTMLInputElement;
  const regionH = document.getElementById("regionH") as HTMLInputElement;

  function resetSelection() {
    isWindowSelected = false;
    regionX.value = "0";
    regionY.value = "0";
    regionW.value = "1920";
    regionH.value = "1080";
    if (badge) badge.style.display = "none";
    if (btnSelectWindow) {
      btnSelectWindow.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        <span>🪟 智能选定目标窗口</span>
      `;
      btnSelectWindow.style.borderColor = "var(--border-color)";
      btnSelectWindow.style.color = "var(--text-primary)";
    }
  }

  btnCancelRegion?.addEventListener("click", () => {
    resetSelection();
  });

  btnSelectWindow?.addEventListener("click", async () => {
    // If already selected, clicking it again CANCELS smart selection!
    if (isWindowSelected) {
      resetSelection();
      return;
    }

    try {
      const rect = await invoke<ScreenRect | null>("detect_window");
      if (rect) {
        isWindowSelected = true;
        regionX.value = rect.x.toString();
        regionY.value = rect.y.toString();
        regionW.value = rect.width.toString();
        regionH.value = rect.height.toString();

        if (badge && badgeText) {
          badge.style.display = "flex";
          badgeText.textContent = `${rect.width} × ${rect.height} (窗口定位 X: ${rect.x}, Y: ${rect.y})`;
        }

        btnSelectWindow.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span style="color: #f43f5e;">✕ 取消智能选定</span>
        `;
        btnSelectWindow.style.borderColor = "rgba(244, 63, 94, 0.5)";
      } else {
        showToast("未能检测到当前光标下的窗口，请重试", "error");
      }
    } catch (e) {
      showToast("检测窗口失败: " + e, "error");
    }
  });

  btnSelectRegion?.addEventListener("click", () => {
    startCaptureWorkflow("record_region");
  });

  // Listen for region confirmation from overlay
  listen<ScreenRect>("record-region-selected", (event) => {
    const rect = event.payload;
    if (rect) {
      isWindowSelected = false;
      regionX.value = rect.x.toString();
      regionY.value = rect.y.toString();
      regionW.value = rect.width.toString();
      regionH.value = rect.height.toString();

      if (badge && badgeText) {
        badge.style.display = "flex";
        badgeText.textContent = `${rect.width} × ${rect.height} (选区坐标 X: ${rect.x}, Y: ${rect.y})`;
      }

      if (btnSelectWindow) {
        btnSelectWindow.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span>🪟 智能选定目标窗口</span>
        `;
        btnSelectWindow.style.borderColor = "var(--border-color)";
      }
    }
  });
}

function setupHotkeyInputRecord(input: HTMLInputElement) {
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.setAttribute("readonly", "true");
  input.setAttribute("placeholder", "点击并按下快捷键...");
  input.style.cursor = "pointer";

  input.addEventListener("focus", () => {
    input.select();
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore standalone modifier presses
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      return;
    }

    // Clear on Backspace or Delete
    if (e.key === "Backspace" || e.key === "Delete") {
      input.value = "";
      return;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push("Ctrl");
    if (e.shiftKey) modifiers.push("Shift");
    if (e.altKey) modifiers.push("Alt");
    if (e.metaKey) modifiers.push("Win");

    let keyName = e.key;
    if (keyName.length === 1) {
      keyName = keyName.toUpperCase();
    } else if (keyName.toLowerCase().startsWith("f") && keyName.length <= 3) {
      keyName = keyName.toUpperCase();
    } else if (keyName === "PrintScreen") {
      keyName = "PrintScreen";
    }

    if (modifiers.length > 0) {
      input.value = `${modifiers.join("+")}+${keyName}`;
    } else {
      input.value = keyName;
    }
  });
}

// Theme management system
export function applyTheme(themeName: string) {
  const normTheme = themeName === "acrylic" || themeName === "dark" ? "acrylic" : "cyberpunk";
  document.documentElement.setAttribute("data-theme", normTheme);

  // Update sidebar theme pills
  document.querySelectorAll("#sidebarThemePills .theme-pill-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-theme-val") === normTheme);
  });
  const badgeTheme = document.getElementById("badgeThemeName");
  if (badgeTheme) {
    badgeTheme.textContent = normTheme === "cyberpunk" ? "CYBERPUNK" : "ACRYLIC";
  }

  // Update settings tab pills
  document.querySelectorAll("#themePills .pill-option").forEach((pill) => {
    pill.classList.toggle("active", pill.getAttribute("data-value") === normTheme);
  });
}

export async function switchTheme(newTheme: string) {
  applyTheme(newTheme);
  try {
    const current = await invoke<AppSettings>("get_settings");
    current.theme = newTheme;
    await invoke("save_settings", { settings: current });
    const toastMsg = newTheme === "cyberpunk" ? t("toast_theme_cyberpunk") : t("toast_theme_acrylic");
    showToast(toastMsg, "info", 1800);
  } catch (e) {
    console.warn("Failed to persist theme setting:", e);
  }
}

function setupThemeHandlers() {
  // Sidebar theme pills
  document.querySelectorAll("#sidebarThemePills .theme-pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeVal = btn.getAttribute("data-theme-val") || "cyberpunk";
      switchTheme(themeVal);
    });
  });

  // Settings tab theme pills
  document.querySelectorAll("#themePills .pill-option").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#themePills .pill-option").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const themeVal = pill.getAttribute("data-value") || "cyberpunk";
      switchTheme(themeVal);
    });
  });
}

function setupLanguageHandlers() {
  // Topbar language pills
  document.querySelectorAll("#langSwitchPills .lang-pill-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const lang = (btn.getAttribute("data-lang") as Language) || "zh-CN";
      await switchLanguage(lang);
    });
  });

  // Settings tab language pills
  document.querySelectorAll("#langSettingsPills .pill-option").forEach((pill) => {
    pill.addEventListener("click", async () => {
      document.querySelectorAll("#langSettingsPills .pill-option").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const lang = (pill.getAttribute("data-value") as Language) || "zh-CN";
      await switchLanguage(lang);
    });
  });
}

export async function switchLanguage(newLang: Language) {
  setLanguage(newLang);
  try {
    const current = await invoke<AppSettings>("get_settings");
    current.language = newLang;
    await invoke("save_settings", { settings: current });
    showToast(t("toast_lang_switched"), "info", 1800);
  } catch (e) {
    console.warn("Failed to persist language setting:", e);
  }
}

export async function switchFloatingBarEnabled(enabled: boolean) {
  const valStr = enabled ? "true" : "false";
  const floatingBarToggle = document.getElementById("floatingBarToggle") as HTMLSelectElement;
  if (floatingBarToggle) {
    floatingBarToggle.value = valStr;
  }
  document.querySelectorAll("#floatingBarPills .pill-option").forEach((pill) => {
    pill.classList.toggle("active", pill.getAttribute("data-value") === valStr);
  });

  try {
    const current = await invoke<AppSettings>("get_settings");
    current.floating_bar_enabled = enabled;
    await invoke("save_settings", { settings: current });

    const toastMsg = enabled ? t("toast_floating_enabled") : t("toast_floating_disabled");
    showToast(toastMsg, "info", 2000);
  } catch (e) {
    showToast(t("toast_settings_failed") + e, "error");
  }
}

function setupFloatingBarHandlers() {
  const floatingBarToggle = document.getElementById("floatingBarToggle") as HTMLSelectElement;
  floatingBarToggle?.addEventListener("change", async () => {
    const isEnabled = floatingBarToggle.value === "true";
    await switchFloatingBarEnabled(isEnabled);
  });

  document.querySelectorAll("#floatingBarPills .pill-option").forEach((pill) => {
    pill.addEventListener("click", async () => {
      const isEnabled = pill.getAttribute("data-value") === "true";
      await switchFloatingBarEnabled(isEnabled);
    });
  });
}

// Load Application Settings
async function loadSettings() {
  try {
    const settings = await invoke<AppSettings>("get_settings");
    const activeTheme = settings.theme || "cyberpunk";
    applyTheme(activeTheme);

    const activeLang = (settings.language as Language) || "zh-CN";
    setLanguage(activeLang);

    currentHotkeys = {
      snip: settings.hotkeys.snip || "F1",
      screen_record: settings.hotkeys.screen_record || "F6",
      audio_record: settings.hotkeys.audio_record || "F7",
      stop_record: settings.hotkeys.stop_record || "F9",
      pin_clipboard: settings.hotkeys.pin_clipboard || "F3",
    };

    const settingOutput = document.getElementById("settingOutputDir") as HTMLInputElement;
    if (settingOutput) settingOutput.value = settings.output_dir;

    const hkSnip = document.getElementById("hkSnip") as HTMLInputElement;
    const hkPin = document.getElementById("hkPin") as HTMLInputElement;
    const hkScreen = document.getElementById("hkScreen") as HTMLInputElement;
    const hkAudio = document.getElementById("hkAudio") as HTMLInputElement;
    const hkStop = document.getElementById("hkStop") as HTMLInputElement;

    if (hkSnip) {
      hkSnip.value = currentHotkeys.snip;
      setupHotkeyInputRecord(hkSnip);
    }
    if (hkPin) {
      hkPin.value = currentHotkeys.pin_clipboard;
      setupHotkeyInputRecord(hkPin);
    }
    if (hkScreen) {
      hkScreen.value = currentHotkeys.screen_record;
      setupHotkeyInputRecord(hkScreen);
    }
    if (hkAudio) {
      hkAudio.value = currentHotkeys.audio_record;
      setupHotkeyInputRecord(hkAudio);
    }
    if (hkStop) {
      hkStop.value = currentHotkeys.stop_record;
      setupHotkeyInputRecord(hkStop);
    }

    const floatingBarToggle = document.getElementById("floatingBarToggle") as HTMLSelectElement;
    if (floatingBarToggle) {
      floatingBarToggle.value = settings.floating_bar_enabled ? "true" : "false";
    }
    document.querySelectorAll("#floatingBarPills .pill-option").forEach((pill) => {
      pill.classList.toggle("active", pill.getAttribute("data-value") === (settings.floating_bar_enabled ? "true" : "false"));
    });

    const bSnip = document.getElementById("hkSnipBadge");
    const bScreen = document.getElementById("hkScreenBadge");
    const bAudio = document.getElementById("hkAudioBadge");

    if (bSnip) bSnip.textContent = currentHotkeys.snip;
    if (bScreen) bScreen.textContent = currentHotkeys.screen_record;
    if (bAudio) bAudio.textContent = currentHotkeys.audio_record;

    if (!isRecording) {
      resetRecordingUI();
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

// Pause Active Recording
async function pauseActiveRecording() {
  try {
    await invoke("pause_recording");
    isPaused = true;
    updateRecordingButtonState();
    showToast(currentRecordingType === "screen" ? "⏸️ 屏幕录制已暂停" : "⏸️ 声音录制已暂停", "info", 1800);
  } catch (err) {
    showToast("暂停录制失败: " + err, "error");
  }
}

// Resume Active Recording
async function resumeActiveRecording() {
  try {
    await invoke("resume_recording");
    isPaused = false;
    updateRecordingButtonState();
    showToast(currentRecordingType === "screen" ? "▶️ 屏幕录制已继续" : "▶️ 声音录制已继续", "info", 1800);
  } catch (err) {
    showToast("恢复录制失败: " + err, "error");
  }
}

// Toggle Screen Record (Start -> Pause -> Resume -> ...)
async function handleScreenRecordToggle() {
  if (!isRecording) {
    await startScreenRecording();
  } else if (currentRecordingType === "screen") {
    if (!isPaused) {
      await pauseActiveRecording();
    } else {
      await resumeActiveRecording();
    }
  } else {
    showToast(`当前正在进行声音录制，请先按停止录制快捷键 (${currentHotkeys.stop_record || "F9"}) 停止。`, "info");
  }
}

// Toggle Audio Record (Start -> Pause -> Resume -> ...)
async function handleAudioRecordToggle() {
  if (!isRecording) {
    await startAudioRecording();
  } else if (currentRecordingType === "audio") {
    if (!isPaused) {
      await pauseActiveRecording();
    } else {
      await resumeActiveRecording();
    }
  } else {
    showToast(`当前正在进行屏幕录制，请先按停止录制快捷键 (${currentHotkeys.stop_record || "F9"}) 停止。`, "info");
  }
}

// Update UI buttons based on active/paused recording state
function updateRecordingButtonState(elapsed: string = "00:00") {
  const hkStop = currentHotkeys.stop_record || "F9";
  if (currentRecordingType === "screen") {
    const btnScreen = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
    const btnStopScreen = document.getElementById("btnStopScreenRecord") as HTMLButtonElement;
    const hkScreen = currentHotkeys.screen_record || "F6";

    if (btnStopScreen) {
      btnStopScreen.style.display = "inline-flex";
      btnStopScreen.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>${t("btn_stop_record")} (${hkStop})</span>`;
    }

    if (btnScreen) {
      btnScreen.classList.remove("btn-primary");
      if (isPaused) {
        btnScreen.classList.remove("btn-danger");
        btnScreen.classList.add("btn-warning");
        btnScreen.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>${t("btn_resume_screen")} (${hkScreen}) [${elapsed}]</span>`;
      } else {
        btnScreen.classList.remove("btn-warning");
        btnScreen.classList.add("btn-danger");
        btnScreen.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>${t("btn_pause_screen")} (${hkScreen}) (${elapsed})</span>`;
      }
    }
  } else if (currentRecordingType === "audio") {
    const btnAudio = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;
    const btnStopAudio = document.getElementById("btnStopAudioRecord") as HTMLButtonElement;
    const hkAudio = currentHotkeys.audio_record || "F7";

    if (btnStopAudio) {
      btnStopAudio.style.display = "inline-flex";
      btnStopAudio.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>${t("btn_stop_record")} (${hkStop})</span>`;
    }

    if (btnAudio) {
      btnAudio.classList.remove("btn-primary");
      if (isPaused) {
        btnAudio.classList.remove("btn-danger");
        btnAudio.classList.add("btn-warning");
        btnAudio.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>${t("btn_resume_audio")} (${hkAudio}) [${elapsed}]</span>`;
      } else {
        btnAudio.classList.remove("btn-warning");
        btnAudio.classList.add("btn-danger");
        btnAudio.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>${t("btn_pause_audio")} (${hkAudio}) (${elapsed})</span>`;
      }
    }
  }
}

// Screen & Audio Recording Controls
function setupRecordingHandlers() {
  setupThemeHandlers();
  setupLanguageHandlers();
  setupFloatingBarHandlers();

  const btnScreen = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
  const btnStopScreen = document.getElementById("btnStopScreenRecord") as HTMLButtonElement;
  const btnAudio = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;
  const btnStopAudio = document.getElementById("btnStopAudioRecord") as HTMLButtonElement;

  btnScreen?.addEventListener("click", handleScreenRecordToggle);
  btnStopScreen?.addEventListener("click", stopActiveRecording);
  btnAudio?.addEventListener("click", handleAudioRecordToggle);
  btnStopAudio?.addEventListener("click", stopActiveRecording);

  const btnSaveSettings = document.getElementById("btnSaveSettings");
  btnSaveSettings?.addEventListener("click", async () => {
    const settingOutput = document.getElementById("settingOutputDir") as HTMLInputElement;
    const hkSnip = document.getElementById("hkSnip") as HTMLInputElement;
    const hkPin = document.getElementById("hkPin") as HTMLInputElement;
    const hkScreen = document.getElementById("hkScreen") as HTMLInputElement;
    const hkAudio = document.getElementById("hkAudio") as HTMLInputElement;
    const hkStop = document.getElementById("hkStop") as HTMLInputElement;
    const floatingBarToggle = document.getElementById("floatingBarToggle") as HTMLSelectElement;

    try {
      const current = await invoke<AppSettings>("get_settings");
      const themeActive = document.querySelector("#themePills .pill-option.active")?.getAttribute("data-value") || "cyberpunk";
      const langActive = (document.querySelector("#langSettingsPills .pill-option.active")?.getAttribute("data-value") as Language) || "zh-CN";
      current.theme = themeActive;
      current.language = langActive;
      setLanguage(langActive);

      if (settingOutput?.value) current.output_dir = settingOutput.value;
      if (hkSnip?.value) current.hotkeys.snip = hkSnip.value.trim();
      if (hkPin?.value) current.hotkeys.pin_clipboard = hkPin.value.trim();
      if (hkScreen?.value) current.hotkeys.screen_record = hkScreen.value.trim();
      if (hkAudio?.value) current.hotkeys.audio_record = hkAudio.value.trim();
      if (hkStop?.value) current.hotkeys.stop_record = hkStop.value.trim();
      if (floatingBarToggle) {
        current.floating_bar_enabled = floatingBarToggle.value === "true";
      }

      await invoke("save_settings", { settings: current });
      showToast(t("toast_settings_saved"), "success");
      await loadSettings();
    } catch (e) {
      showToast(t("toast_settings_failed") + e, "error");
    }
  });
}

// Start Screen Recording
async function startScreenRecording() {
  try {
    const formatSelect = document.getElementById("videoFormatSelect") as HTMLSelectElement;
    const codecSelect = document.getElementById("videoCodecSelect") as HTMLSelectElement;
    const fpsSelect = document.getElementById("videoFpsSelect") as HTMLSelectElement;
    const bitrateSelect = document.getElementById("videoBitrateSelect") as HTMLSelectElement;

    const audioModeActive = document.querySelector("#screenAudioPills .pill-option.active")?.getAttribute("data-value") || "both_mixed";
    const areaActive = document.querySelector("#screenAreaPills .pill-option.active")?.getAttribute("data-value") || "fullscreen";
    const timerActive = document.querySelector("#screenTimerPills .pill-option.active")?.getAttribute("data-value") || "0";

    let timeLimit: number | null = null;
    if (timerActive === "custom") {
      const customSecs = parseInt((document.getElementById("customTimeLimitSecs") as HTMLInputElement).value, 10);
      if (customSecs > 0) timeLimit = customSecs;
    } else if (parseInt(timerActive, 10) > 0) {
      timeLimit = parseInt(timerActive, 10);
    }

    let region = null;
    if (areaActive === "custom_region" || areaActive === "window") {
      region = {
        x: parseInt((document.getElementById("regionX") as HTMLInputElement).value, 10) || 0,
        y: parseInt((document.getElementById("regionY") as HTMLInputElement).value, 10) || 0,
        width: parseInt((document.getElementById("regionW") as HTMLInputElement).value, 10) || 1280,
        height: parseInt((document.getElementById("regionH") as HTMLInputElement).value, 10) || 720,
      };
    }

    const options = {
      format: formatSelect.value,
      codec: codecSelect.value,
      fps: parseInt(fpsSelect.value, 10),
      bitrate_kbps: parseInt(bitrateSelect.value, 10),
      region: region,
      audio_mode: audioModeActive,
      time_limit_seconds: timeLimit,
      output_path: null,
    };

    const appWin = getCurrentWindow();
    // Automatically minimize main window immediately so it does not obstruct the recording area
    try {
      await appWin.minimize();
      // Allow Windows DWM composition transition to settle before screen capture begins
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (e) {
      console.warn("Failed to minimize window before record:", e);
    }

    const outPath = await invoke<string>("start_screen_record", { options });
    isRecording = true;
    isPaused = false;
    currentRecordingType = "screen";

    updateRecordingButtonState("00:00");
    startStatusPolling();
  } catch (err) {
    try {
      const appWin = getCurrentWindow();
      await appWin.unminimize();
      await appWin.show();
      await appWin.setFocus();
    } catch (e) {
      console.warn("Failed to restore window on error:", e);
    }
    showToast(t("toast_recording_failed") + err, "error");
  }
}

// Start Audio Recording
async function startAudioRecording() {
  try {
    const formatSelect = document.getElementById("audioFormatSelect") as HTMLSelectElement;
    const bitrateSelect = document.getElementById("audioBitrateSelect") as HTMLSelectElement;
    const sampleRateSelect = document.getElementById("audioSampleRateSelect") as HTMLSelectElement;
    const sourceMode = document.querySelector("#audioOnlySourcePills .pill-option.active")?.getAttribute("data-value") || "both_mixed";

    const options = {
      format: formatSelect.value,
      bitrate_kbps: parseInt(bitrateSelect.value, 10),
      sample_rate: parseInt(sampleRateSelect.value, 10),
      audio_mode: sourceMode,
      time_limit_seconds: null,
      output_path: null,
    };

    await invoke<string>("start_audio_record", { options });
    isRecording = true;
    isPaused = false;
    currentRecordingType = "audio";

    updateRecordingButtonState("00:00");
    startStatusPolling();
  } catch (err) {
    showToast(t("toast_recording_failed") + err, "error");
  }
}

// Stop Active Recording
async function stopActiveRecording() {
  if (!isRecording) return;
  try {
    const result = await invoke<{ path: string; duration: string; size_bytes: number }>("stop_recording");
    resetRecordingUI();
    await loadMediaGallery();
    showToast(`${t("toast_recording_finished")} (${result.duration})`, "success", 4000);
  } catch (err) {
    resetRecordingUI();
    showToast(t("toast_stop_failed") + err, "error");
  }
}

// Polling recording status & live elapsed timer
function startStatusPolling() {
  if (statusPollInterval) clearInterval(statusPollInterval);
  statusPollInterval = setInterval(async () => {
    try {
      const res = await invoke<RecordStatusResult>("get_recording_status");
      if (res.status === "recording" || res.status === "paused") {
        isPaused = res.status === "paused";
        updateRecordingButtonState(res.elapsed);
      } else if (res.status === "idle" && isRecording) {
        resetRecordingUI();
      }
    } catch (e) {
      // Ignore
    }
  }, 1000);
}

// Quick Snipping Trigger
function setupScreenshotHandler() {
  const btn = document.getElementById("btnQuickSnip");
  btn?.addEventListener("click", () => {
    startCaptureWorkflow("screenshot");
  });
}

// Multi-Pins Refresh
async function refreshPinsList() {
  try {
    const pins = await invoke<PinItem[]>("list_pins");
    const container = document.getElementById("pinsListContainer");
    if (!container) return;

    if (pins.length === 0) {
      container.innerHTML = `<div data-i18n="pins_empty">${t("pins_empty")}</div>`;
      return;
    }

    container.innerHTML = "";
    pins.forEach((pin) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "10px 14px";
      row.style.background = "rgba(15, 23, 42, 0.7)";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid var(--border-color)";

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${pin.image_data_url}" style="width: 44px; height: 32px; object-fit: cover; border-radius: 4px;" />
          <div>
            <div style="font-weight: 600; color: #f8fafc;">${pin.title}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${pin.width} × ${pin.height} px | ${t("pin_scale_prefix")}: ${(pin.scale * 100).toFixed(0)}%</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-close-pin" data-id="${pin.id}" style="padding: 6px 12px; font-size: 12px;">${t("btn_close_pin")}</button>
      `;

      row.querySelector(".btn-close-pin")?.addEventListener("click", async () => {
        await invoke("close_pin_window", { id: pin.id });
        await refreshPinsList();
      });

      container.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to list pins:", err);
  }
}

interface MediaHistoryItem {
  name: string;
  path: string;
  media_type: "video" | "audio" | "image";
  size_bytes: number;
  formatted_size: string;
  created_at: string;
  modified_timestamp: number;
}

// Gallery & History List
function setupGalleryHandlers() {
  const btnOpen = document.getElementById("btnOpenFolder");
  btnOpen?.addEventListener("click", async () => {
    const settings = await invoke<AppSettings>("get_settings");
    await invoke("open_output_folder", { path: settings.output_dir });
  });

  const btnRefresh = document.getElementById("btnRefreshGallery");
  btnRefresh?.addEventListener("click", async () => {
    await loadMediaGallery();
  });
}

async function loadMediaGallery() {
  const list = document.getElementById("galleryList");
  const badge = document.getElementById("galleryCountBadge");
  if (!list) return;

  try {
    const items = await invoke<MediaHistoryItem[]>("get_media_history");
    if (badge) {
      badge.textContent = `${t("gallery_count_prefix")}${items.length}${t("gallery_count_suffix")}`;
    }

    if (items.length === 0) {
      list.innerHTML = `
        <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px 0;">
          <div style="font-size: 32px; margin-bottom: 8px;">📁</div>
          ${t("gallery_empty")}
        </div>
      `;
      return;
    }

    list.innerHTML = "";

    items.forEach((item) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "12px 16px";
      row.style.background = "rgba(15, 23, 42, 0.7)";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid var(--border-color)";
      row.style.gap = "14px";

      let typeIcon = "📹";
      let typeLabel = t("media_type_video");
      let typeColor = "#38bdf8";

      if (item.media_type === "audio") {
        typeIcon = "🎵";
        typeLabel = t("media_type_audio");
        typeColor = "#a855f7";
      } else if (item.media_type === "image") {
        typeIcon = "📸";
        typeLabel = t("media_type_image");
        typeColor = "#10b981";
      }

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
          <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(30, 41, 59, 0.8); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.06);">
            ${typeIcon}
          </div>
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;">${item.name}</span>
              <span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: ${typeColor}22; color: ${typeColor}; border: 1px solid ${typeColor}44; flex-shrink: 0;">${typeLabel}</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
              ${item.created_at} · ${item.formatted_size}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button class="btn btn-secondary btn-open-media" style="padding: 5px 10px; font-size: 12px;" title="${t("media_open_tooltip")}">
            ▶️ ${t("btn_media_open")}
          </button>
          <button class="btn btn-secondary btn-locate-media" style="padding: 5px 10px; font-size: 12px;" title="${t("media_locate_tooltip")}">
            📂 ${t("btn_media_locate")}
          </button>
          <button class="btn btn-delete-media" style="padding: 5px 9px; font-size: 12px; background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.3); border-radius: 6px; cursor: pointer;" title="${t("media_delete_tooltip")}">
            🗑️
          </button>
        </div>
      `;

      row.querySelector(".btn-open-media")?.addEventListener("click", async () => {
        try {
          await invoke("open_media_file", { path: item.path });
        } catch (err) {
          showToast(t("toast_open_file_failed") + err, "error");
        }
      });

      row.querySelector(".btn-locate-media")?.addEventListener("click", async () => {
        try {
          await invoke("open_media_folder", { path: item.path });
        } catch (err) {
          showToast(t("toast_locate_file_failed") + err, "error");
        }
      });

      row.querySelector(".btn-delete-media")?.addEventListener("click", async () => {
        try {
          await invoke("delete_media_file", { path: item.path });
          showToast(`${t("toast_deleted_prefix")}: ${item.name}`);
          await loadMediaGallery();
        } catch (err) {
          showToast(t("toast_delete_failed") + err, "error");
        }
      });

      list.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load media history:", err);
    if (list) {
      list.innerHTML = `<div style="color: #f43f5e; font-size: 13px;">${t("gallery_load_failed")}${err}</div>`;
    }
  }
}

// Simulate live Audio VU meter waveform
function setupAudioLevelSimulation() {
  const screenVu = document.getElementById("screenAudioVu");
  const audioVu = document.getElementById("audioTabVu");

  setInterval(() => {
    if (isRecording) {
      const level = Math.min(100, Math.floor(Math.random() * 60 + 20));
      if (screenVu) screenVu.style.width = `${level}%`;
      if (audioVu) audioVu.style.width = `${level}%`;
    } else {
      if (screenVu) screenVu.style.width = "0%";
      if (audioVu) audioVu.style.width = "0%";
    }
  }, 100);
}
