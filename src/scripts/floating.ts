import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

let isPaused = false;

window.addEventListener("DOMContentLoaded", () => {
  const timerText = document.getElementById("floatingTimer") as HTMLElement;
  const btnPause = document.getElementById("btnPauseResume") as HTMLElement;
  const btnStop = document.getElementById("btnStop") as HTMLElement;
  const btnSnapshot = document.getElementById("btnSnapshot") as HTMLElement;
  const iconPause = document.getElementById("iconPause") as HTMLElement;
  const iconResume = document.getElementById("iconResume") as HTMLElement;
  const recDot = document.getElementById("recDot") as HTMLElement;

  // React to settings update: if floating bar was disabled in settings, hide immediately
  listen<{ floating_bar_enabled: boolean }>("settings-updated", async (event) => {
    if (!event.payload.floating_bar_enabled) {
      try {
        const appWin = getCurrentWindow();
        await appWin.hide();
      } catch (_) {}
    }
  });

  // Poll recording status
  setInterval(async () => {
    try {
      const res = await invoke<{ status: string; elapsed: string; is_video: boolean }>("get_recording_status");
      if (res.status === "recording" || res.status === "paused") {
        timerText.textContent = res.elapsed;
        isPaused = res.status === "paused";

        if (isPaused) {
          iconPause.style.display = "none";
          iconResume.style.display = "block";
          recDot.style.background = "#eab308";
        } else {
          iconPause.style.display = "block";
          iconResume.style.display = "none";
          recDot.style.background = "#f43f5e";
        }
      } else if (res.status === "idle") {
        // If recording is stopped or idle, ensure floating bar is hidden
        try {
          const appWin = getCurrentWindow();
          if (await appWin.isVisible()) {
            await appWin.hide();
          }
        } catch (_) {}
      }
    } catch (e) {
      // Ignore
    }
  }, 1000);

  // Animate live VU meter bars
  const bars = [
    document.getElementById("vuBar1") as HTMLElement,
    document.getElementById("vuBar2") as HTMLElement,
    document.getElementById("vuBar3") as HTMLElement,
    document.getElementById("vuBar4") as HTMLElement,
  ];

  setInterval(() => {
    if (!isPaused) {
      bars.forEach((bar) => {
        const height = Math.floor(Math.random() * 80 + 20);
        bar.style.height = `${height}%`;
      });
    } else {
      bars.forEach((bar) => (bar.style.height = "15%"));
    }
  }, 120);

  // Pause / Resume
  btnPause?.addEventListener("click", async () => {
    if (isPaused) {
      await invoke("resume_recording");
      isPaused = false;
    } else {
      await invoke("pause_recording");
      isPaused = true;
    }
  });

  // Stop recording
  btnStop?.addEventListener("click", async () => {
    try {
      await invoke<{ path: string; duration: string }>("stop_recording");
    } catch (e) {
      console.error("停止录制失败:", e);
    }
  });

  // Snapshot during recording
  btnSnapshot?.addEventListener("click", async () => {
    try {
      await invoke("capture_full_screen");
    } catch (e) {
      console.error(e);
    }
  });
});
