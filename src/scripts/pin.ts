import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

window.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const pinId = params.get("id");
  if (!pinId) return;

  const pinContainer = document.getElementById("pinContainer") as HTMLElement;
  const pinImage = document.getElementById("pinImage") as HTMLImageElement;
  const btnClose = document.getElementById("btnClosePin") as HTMLElement;
  const btnCopy = document.getElementById("btnCopyPin") as HTMLElement;
  const scaleBadge = document.getElementById("scaleBadge") as HTMLElement;

  let currentScale = 1.0;
  let currentOpacity = 1.0;

  try {
    const pin = await invoke<PinItem>("get_pin_data", { id: pinId });
    pinImage.src = pin.image_data_url;
    currentScale = pin.scale;
    currentOpacity = pin.opacity;
    scaleBadge.textContent = `${Math.round(currentScale * 100)}%`;
  } catch (err) {
    console.error("Failed to fetch pin data:", err);
  }

  // Native window dragging on mousedown (left click)
  pinContainer.addEventListener("mousedown", async (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".pin-btn") || target.closest(".pin-actions")) return;

    try {
      await invoke("start_pin_drag", { id: pinId });
    } catch {
      try {
        const appWin = getCurrentWindow();
        await appWin.startDragging();
      } catch (err) {
        console.error("Window drag error:", err);
      }
    }
  });

  // Mouse wheel zoom (20% - 500%)
  window.addEventListener("wheel", async (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    try {
      const newScale = await invoke<number>("update_pin_zoom", { id: pinId, delta });
      currentScale = newScale;
      scaleBadge.textContent = `${Math.round(currentScale * 100)}%`;
    } catch (err) {
      console.error("Zoom error:", err);
    }
  });

  // Close pin via button
  btnClose?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await invoke("close_pin_window", { id: pinId });
  });

  // Double click to close
  window.addEventListener("dblclick", async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".pin-btn")) return;
    await invoke("close_pin_window", { id: pinId });
  });

  // Right-click to close
  window.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    await invoke("close_pin_window", { id: pinId });
  });

  // ESC to close
  window.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      await invoke("close_pin_window", { id: pinId });
    }
  });

  // Copy to clipboard
  btnCopy?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!pinImage.src) return;
    try {
      const res = await fetch(pinImage.src);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      scaleBadge.textContent = "已复制!";
      scaleBadge.style.opacity = "1";
      setTimeout(() => {
        scaleBadge.textContent = `${Math.round(currentScale * 100)}%`;
        scaleBadge.style.opacity = "";
      }, 1000);
    } catch (err) {
      console.error("Copy error:", err);
    }
  });
});
