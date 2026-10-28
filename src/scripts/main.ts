import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

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
let currentRecordingType: "screen" | "audio" | null = null;
let statusPollInterval: any = null;

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
  currentRecordingType = null;
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }

  const btnScreen = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
  if (btnScreen) {
    btnScreen.classList.remove("btn-danger");
    btnScreen.classList.add("btn-primary");
    btnScreen.innerHTML = `<span>开始录制 (F7)</span>`;
  }

  const btnAudio = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;
  if (btnAudio) {
    btnAudio.classList.remove("btn-danger");
    btnAudio.classList.add("btn-primary");
    btnAudio.innerHTML = `<span>开始录音 (F8)</span>`;
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
  refreshPinsList();
  await loadMediaGallery();

  await listen("media-saved", async () => {
    resetRecordingUI();
    loadMediaGallery();
    showToast("✓ 录制完成已保存至存储目录", "success");
    try {
      const appWin = getCurrentWindow();
      await appWin.unminimize();
      await appWin.show();
      await appWin.setFocus();
    } catch (e) {
      console.warn("Failed to unminimize window on media-saved:", e);
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

// Screen capture workflow that safely minimizes the main window first
async function startCaptureWorkflow(mode: "screenshot" | "record_region") {
  const appWin = getCurrentWindow();
  try {
    // 1. Minimize main window to taskbar so user's screen capture is unobscured while keeping taskbar/tray access
    await appWin.minimize();
    // 2. Allow Windows DWM composition transition to settle
    await new Promise((resolve) => setTimeout(resolve, 180));
    // 3. Emit overlay mode & trigger capture
    await emit("set-overlay-mode", { mode });
    await invoke("capture_full_screen");
  } catch (err) {
    console.error("Failed to start capture workflow:", err);
    await appWin.unminimize();
    await appWin.show();
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
    if (isRecording) {
      await stopActiveRecording();
    } else {
      await startScreenRecording();
    }
  });

  await listen("global-hotkey-audio-record", async () => {
    if (isRecording) {
      await stopActiveRecording();
    } else {
      await startAudioRecording();
    }
  });

  await listen("global-hotkey-stop-record", async () => {
    if (isRecording) {
      await stopActiveRecording();
    }
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
        activeTab.style.display = "block";
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
    showToast(`✓ 主题已切换为：${newTheme === "cyberpunk" ? "⚡ 赛博朋克" : "🔮 极光暗黑"}`, "info", 1800);
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

// Load Application Settings
async function loadSettings() {
  try {
    const settings = await invoke<AppSettings>("get_settings");
    const activeTheme = settings.theme || "cyberpunk";
    applyTheme(activeTheme);

    const sidebarOutput = document.getElementById("sidebarOutputPath");
    const settingOutput = document.getElementById("settingOutputDir") as HTMLInputElement;

    if (sidebarOutput) sidebarOutput.textContent = settings.output_dir;
    if (settingOutput) settingOutput.value = settings.output_dir;

    const hkSnip = document.getElementById("hkSnip") as HTMLInputElement;
    const hkPin = document.getElementById("hkPin") as HTMLInputElement;
    const hkScreen = document.getElementById("hkScreen") as HTMLInputElement;
    const hkAudio = document.getElementById("hkAudio") as HTMLInputElement;

    if (hkSnip) {
      hkSnip.value = settings.hotkeys.snip;
      setupHotkeyInputRecord(hkSnip);
    }
    if (hkPin) {
      hkPin.value = settings.hotkeys.pin_clipboard || "F3";
      setupHotkeyInputRecord(hkPin);
    }
    if (hkScreen) {
      hkScreen.value = settings.hotkeys.screen_record;
      setupHotkeyInputRecord(hkScreen);
    }
    if (hkAudio) {
      hkAudio.value = settings.hotkeys.audio_record;
      setupHotkeyInputRecord(hkAudio);
    }

    const floatingBarToggle = document.getElementById("floatingBarToggle") as HTMLSelectElement;
    if (floatingBarToggle) {
      floatingBarToggle.value = settings.floating_bar_enabled ? "true" : "false";
    }

    const bSnip = document.getElementById("hkSnipBadge");
    const bScreen = document.getElementById("hkScreenBadge");
    const bAudio = document.getElementById("hkAudioBadge");

    if (bSnip) bSnip.textContent = settings.hotkeys.snip;
    if (bScreen) bScreen.textContent = settings.hotkeys.screen_record;
    if (bAudio) bAudio.textContent = settings.hotkeys.audio_record;
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

// Screen & Audio Recording Controls
function setupRecordingHandlers() {
  setupThemeHandlers();

  const btnScreen = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
  const btnAudio = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;

  btnScreen?.addEventListener("click", async () => {
    if (isRecording) {
      await stopActiveRecording();
    } else {
      await startScreenRecording();
    }
  });

  btnAudio?.addEventListener("click", async () => {
    if (isRecording) {
      await stopActiveRecording();
    } else {
      await startAudioRecording();
    }
  });

  const btnSaveSettings = document.getElementById("btnSaveSettings");
  btnSaveSettings?.addEventListener("click", async () => {
    const settingOutput = document.getElementById("settingOutputDir") as HTMLInputElement;
    const hkSnip = document.getElementById("hkSnip") as HTMLInputElement;
    const hkPin = document.getElementById("hkPin") as HTMLInputElement;
    const hkScreen = document.getElementById("hkScreen") as HTMLInputElement;
    const hkAudio = document.getElementById("hkAudio") as HTMLInputElement;
    const floatingBarToggle = document.getElementById("floatingBarToggle") as HTMLSelectElement;

    try {
      const current = await invoke<AppSettings>("get_settings");
      const themeActive = document.querySelector("#themePills .pill-option.active")?.getAttribute("data-value") || "cyberpunk";
      current.theme = themeActive;

      if (settingOutput?.value) current.output_dir = settingOutput.value;
      if (hkSnip?.value) current.hotkeys.snip = hkSnip.value.trim();
      if (hkPin?.value) current.hotkeys.pin_clipboard = hkPin.value.trim();
      if (hkScreen?.value) current.hotkeys.screen_record = hkScreen.value.trim();
      if (hkAudio?.value) current.hotkeys.audio_record = hkAudio.value.trim();
      if (floatingBarToggle) {
        current.floating_bar_enabled = floatingBarToggle.value === "true";
      }

      await invoke("save_settings", { settings: current });
      showToast("✓ 快捷键与视觉主题配置已成功保存！", "success");
      await loadSettings();
    } catch (e) {
      showToast("保存设置失败：" + e, "error");
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
    currentRecordingType = "screen";

    const btn = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
    if (btn) {
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-danger");
      btn.innerHTML = `<span>停止录制 (00:00)</span>`;
    }

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
    showToast("启动屏幕录制失败: " + err, "error");
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
    currentRecordingType = "audio";

    const btn = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-danger");
    btn.innerHTML = `<span>停止录音 (00:00)</span>`;

    startStatusPolling();
  } catch (err) {
    showToast("启动声音录制失败: " + err, "error");
  }
}

// Stop Active Recording
async function stopActiveRecording() {
  try {
    const result = await invoke<{ path: string; duration: string; size_bytes: number }>("stop_recording");
    resetRecordingUI();
    await loadMediaGallery();
    showToast(`✓ 录制完成已保存！时长: ${result.duration}`, "success", 4000);
  } catch (err) {
    resetRecordingUI();
    showToast("停止录制失败: " + err, "error");
  }
}

// Polling recording status & live elapsed timer
function startStatusPolling() {
  if (statusPollInterval) clearInterval(statusPollInterval);
  statusPollInterval = setInterval(async () => {
    try {
      const res = await invoke<RecordStatusResult>("get_recording_status");
      if (res.status === "recording") {
        if (currentRecordingType === "screen") {
          const btn = document.getElementById("btnStartScreenRecord");
          if (btn) btn.innerHTML = `<span>停止录制 (${res.elapsed})</span>`;
        } else if (currentRecordingType === "audio") {
          const btn = document.getElementById("btnStartAudioRecord");
          if (btn) btn.innerHTML = `<span>停止录音 (${res.elapsed})</span>`;
        }
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
      container.innerHTML = `<div>暂无正在悬浮展示的贴图。截屏后点击工具栏“贴图”按钮即可将截图固定于桌面！</div>`;
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
            <div style="font-size: 11px; color: var(--text-muted);">${pin.width} × ${pin.height} px | 缩放: ${(pin.scale * 100).toFixed(0)}%</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-close-pin" data-id="${pin.id}" style="padding: 6px 12px; font-size: 12px;">关闭取消</button>
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

  const sidebarOutput = document.getElementById("sidebarOutputPath");
  sidebarOutput?.addEventListener("click", async () => {
    const settings = await invoke<AppSettings>("get_settings");
    await invoke("open_output_folder", { path: settings.output_dir });
  });
}

async function loadMediaGallery() {
  const list = document.getElementById("galleryList");
  const badge = document.getElementById("galleryCountBadge");
  if (!list) return;

  try {
    const items = await invoke<MediaHistoryItem[]>("get_media_history");
    if (badge) {
      badge.textContent = `共 ${items.length} 项`;
    }

    if (items.length === 0) {
      list.innerHTML = `
        <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px 0;">
          <div style="font-size: 32px; margin-bottom: 8px;">📁</div>
          暂无历史媒体文件。进行录屏、录音或截图后，文件将自动汇总在此处。
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
      let typeLabel = "视频";
      let typeColor = "#38bdf8";

      if (item.media_type === "audio") {
        typeIcon = "🎵";
        typeLabel = "音频";
        typeColor = "#a855f7";
      } else if (item.media_type === "image") {
        typeIcon = "📸";
        typeLabel = "截图";
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
          <button class="btn btn-secondary btn-open-media" style="padding: 5px 10px; font-size: 12px;" title="使用默认程序打开">
            ▶️ 打开
          </button>
          <button class="btn btn-secondary btn-locate-media" style="padding: 5px 10px; font-size: 12px;" title="在文件管理器中定位">
            📂 定位
          </button>
          <button class="btn btn-delete-media" style="padding: 5px 9px; font-size: 12px; background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.3); border-radius: 6px; cursor: pointer;" title="删除此文件">
            🗑️
          </button>
        </div>
      `;

      row.querySelector(".btn-open-media")?.addEventListener("click", async () => {
        try {
          await invoke("open_media_file", { path: item.path });
        } catch (err) {
          showToast("打开文件失败: " + err, "error");
        }
      });

      row.querySelector(".btn-locate-media")?.addEventListener("click", async () => {
        try {
          await invoke("open_media_folder", { path: item.path });
        } catch (err) {
          showToast("定位文件失败: " + err, "error");
        }
      });

      row.querySelector(".btn-delete-media")?.addEventListener("click", async () => {
        try {
          await invoke("delete_media_file", { path: item.path });
          showToast(`已删除: ${item.name}`);
          await loadMediaGallery();
        } catch (err) {
          showToast("删除失败: " + err, "error");
        }
      });

      list.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load media history:", err);
    if (list) {
      list.innerHTML = `<div style="color: #f43f5e; font-size: 13px;">加载历史记录失败: ${err}</div>`;
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
