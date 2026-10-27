import { invoke } from "@tauri-apps/api/core";

let isPaused = false;

window.addEventListener("DOMContentLoaded", () => {
  const timerText = document.getElementById("floatingTimer") as HTMLElement;
  const btnPause = document.getElementById("btnPauseResume") as HTMLElement;
  const btnStop = document.getElementById("btnStop") as HTMLElement;
  const btnSnapshot = document.getElementById("btnSnapshot") as HTMLElement;
  const iconPause = document.getElementById("iconPause") as HTMLElement;
  const iconResume = document.getElementById("iconResume") as HTMLElement;
  const recDot = document.getElementById("recDot") as HTMLElement;

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
      const res = await invoke<{ path: string; duration: string }>("stop_recording");
      alert(`录制完成并保存！\n时长: ${res.duration}\n路径: ${res.path}`);
    } catch (e) {
      alert("停止录制失败: " + e);
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
