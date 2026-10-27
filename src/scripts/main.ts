import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

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
  refreshPinsList();
});

async function setupGlobalHotkeyListeners() {
  await listen("global-hotkey-snip", async () => {
    try {
      await emit("set-overlay-mode", { mode: "screenshot" });
      await invoke("capture_full_screen");
    } catch (e) {
      console.error("Global snip hotkey error:", e);
    }
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
function setupInteractiveRegionSelector() {
  const btnSelectRegion = document.getElementById("btnTriggerSelectRegion");
  const btnSelectWindow = document.getElementById("btnTriggerSelectWindow");
  const badge = document.getElementById("selectedRegionBadge");
  const badgeText = document.getElementById("badgeDimText");
  const regionX = document.getElementById("regionX") as HTMLInputElement;
  const regionY = document.getElementById("regionY") as HTMLInputElement;
  const regionW = document.getElementById("regionW") as HTMLInputElement;
  const regionH = document.getElementById("regionH") as HTMLInputElement;

  btnSelectRegion?.addEventListener("click", async () => {
    try {
      await emit("set-overlay-mode", { mode: "record_region" });
      await invoke("capture_full_screen");
    } catch (e) {
      alert("触发区域选择失败: " + e);
    }
  });

  btnSelectWindow?.addEventListener("click", async () => {
    try {
      const rect = await invoke<ScreenRect | null>("detect_window");
      if (rect) {
        regionX.value = rect.x.toString();
        regionY.value = rect.y.toString();
        regionW.value = rect.width.toString();
        regionH.value = rect.height.toString();

        if (badge && badgeText) {
          badge.style.display = "block";
          badgeText.textContent = `${rect.width} × ${rect.height} (窗口定位 X: ${rect.x}, Y: ${rect.y})`;
        }
        alert(`已成功识别并选定目标窗口！\n尺寸: ${rect.width} × ${rect.height} (X: ${rect.x}, Y: ${rect.y})`);
      } else {
        alert("未能检测到当前光标下的窗口，请重试！");
      }
    } catch (e) {
      alert("检测窗口失败: " + e);
    }
  });

  // Listen for region confirmation from overlay
  listen<ScreenRect>("record-region-selected", (event) => {
    const rect = event.payload;
    if (rect) {
      regionX.value = rect.x.toString();
      regionY.value = rect.y.toString();
      regionW.value = rect.width.toString();
      regionH.value = rect.height.toString();

      if (badge && badgeText) {
        badge.style.display = "block";
        badgeText.textContent = `${rect.width} × ${rect.height} (选区坐标 X: ${rect.x}, Y: ${rect.y})`;
      }
    }
  });
}

// Load Application Settings
async function loadSettings() {
  try {
    const settings = await invoke<AppSettings>("get_settings");
    const sidebarOutput = document.getElementById("sidebarOutputPath");
    const settingOutput = document.getElementById("settingOutputDir") as HTMLInputElement;

    if (sidebarOutput) sidebarOutput.textContent = settings.output_dir;
    if (settingOutput) settingOutput.value = settings.output_dir;

    const hkSnip = document.getElementById("hkSnip") as HTMLInputElement;
    const hkScreen = document.getElementById("hkScreen") as HTMLInputElement;
    const hkAudio = document.getElementById("hkAudio") as HTMLInputElement;
    const hkStop = document.getElementById("hkStop") as HTMLInputElement;

    if (hkSnip) hkSnip.value = settings.hotkeys.snip;
    if (hkScreen) hkScreen.value = settings.hotkeys.screen_record;
    if (hkAudio) hkAudio.value = settings.hotkeys.audio_record;
    if (hkStop) hkStop.value = settings.hotkeys.stop_record;

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
    const hkScreen = document.getElementById("hkScreen") as HTMLInputElement;
    const hkAudio = document.getElementById("hkAudio") as HTMLInputElement;
    const hkStop = document.getElementById("hkStop") as HTMLInputElement;

    try {
      const current = await invoke<AppSettings>("get_settings");
      current.output_dir = settingOutput.value;
      current.hotkeys.snip = hkSnip.value;
      current.hotkeys.screen_record = hkScreen.value;
      current.hotkeys.audio_record = hkAudio.value;
      current.hotkeys.stop_record = hkStop.value;

      await invoke("save_settings", { settings: current });
      alert("设置已成功保存！");
      await loadSettings();
    } catch (e) {
      alert("保存设置失败：" + e);
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

    const outPath = await invoke<string>("start_screen_record", { options });
    isRecording = true;
    currentRecordingType = "screen";

    const btn = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-danger");
    btn.innerHTML = `<span>停止录制 (00:00)</span>`;

    startStatusPolling();
  } catch (err) {
    alert("启动屏幕录制失败: " + err);
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
    alert("启动声音录制失败: " + err);
  }
}

// Stop Active Recording
async function stopActiveRecording() {
  try {
    const result = await invoke<{ path: string; duration: string; size_bytes: number }>("stop_recording");
    isRecording = false;
    currentRecordingType = null;
    clearInterval(statusPollInterval);

    // Reset buttons
    const btnScreen = document.getElementById("btnStartScreenRecord") as HTMLButtonElement;
    btnScreen.classList.remove("btn-danger");
    btnScreen.classList.add("btn-primary");
    btnScreen.innerHTML = `<span>开始录制 (F7)</span>`;

    const btnAudio = document.getElementById("btnStartAudioRecord") as HTMLButtonElement;
    btnAudio.classList.remove("btn-danger");
    btnAudio.classList.add("btn-primary");
    btnAudio.innerHTML = `<span>开始录音 (F8)</span>`;

    addMediaToGallery(result.path, result.duration, result.size_bytes);
    alert(`录制完成并保存！\n时长: ${result.duration}\n路径: ${result.path}`);
  } catch (err) {
    alert("停止录制失败: " + err);
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
          if (btn) btn.innerHTML = `<span>停止录屏 (${res.elapsed})</span>`;
        } else if (currentRecordingType === "audio") {
          const btn = document.getElementById("btnStartAudioRecord");
          if (btn) btn.innerHTML = `<span>停止录音 (${res.elapsed})</span>`;
        }
      } else if (res.status === "idle" && isRecording) {
        isRecording = false;
        clearInterval(statusPollInterval);
      }
    } catch (e) {
      // Ignore
    }
  }, 1000);
}

// Quick Snipping Trigger
function setupScreenshotHandler() {
  const btn = document.getElementById("btnQuickSnip");
  btn?.addEventListener("click", async () => {
    try {
      await emit("set-overlay-mode", { mode: "screenshot" });
      await invoke("capture_full_screen");
    } catch (e) {
      alert("截图失败: " + e);
    }
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

// Gallery & History List
function setupGalleryHandlers() {
  const btnOpen = document.getElementById("btnOpenFolder");
  btnOpen?.addEventListener("click", async () => {
    const settings = await invoke<AppSettings>("get_settings");
    await invoke("open_output_folder", { path: settings.output_dir });
  });

  const sidebarOutput = document.getElementById("sidebarOutputPath");
  sidebarOutput?.addEventListener("click", async () => {
    const settings = await invoke<AppSettings>("get_settings");
    await invoke("open_output_folder", { path: settings.output_dir });
  });
}

function addMediaToGallery(path: string, duration: string, sizeBytes: number) {
  const list = document.getElementById("galleryList");
  if (!list) return;

  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  const filename = path.split("\\").pop() || path;

  const item = document.createElement("div");
  item.style.display = "flex";
  item.style.alignItems = "center";
  item.style.justifyContent = "space-between";
  item.style.padding = "12px 16px";
  item.style.background = "rgba(15, 23, 42, 0.7)";
  item.style.borderRadius = "8px";
  item.style.border = "1px solid var(--border-color)";

  item.innerHTML = `
    <div>
      <div style="font-weight: 600; color: #f8fafc;">${filename}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">时长: ${duration} | 大小: ${sizeMB} MB | 路径: ${path}</div>
    </div>
    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="window.__openFileFolder('${path.replace(/\\/g, "\\\\")}')">打开目录</button>
  `;

  list.prepend(item);
}

(window as any).__openFileFolder = async (filePath: string) => {
  const parent = filePath.substring(0, filePath.lastIndexOf("\\"));
  await invoke("open_output_folder", { path: parent });
};

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
