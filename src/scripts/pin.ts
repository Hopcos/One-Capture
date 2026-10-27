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

  // Prevent browser default HTML5 image dragging
  window.addEventListener("dragstart", (e) => e.preventDefault());

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

  // Dual-mode dragging:
  // 1. Native OS startDragging()
  // 2. High precision delta mouse tracking via Rust IPC move_pin_by()
  const appWin = getCurrentWindow();
  let isTrackingDrag = false;
  let lastScreenX = 0;
  let lastScreenY = 0;

  pinContainer.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".pin-btn") || target.closest(".pin-actions")) return;

    // Trigger native OS window dragging
    try {
      appWin.startDragging().catch(() => {});
    } catch {
      // Ignore
    }

    isTrackingDrag = true;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
  });

  window.addEventListener("mousemove", async (e) => {
    if (!isTrackingDrag || e.buttons !== 1) {
      isTrackingDrag = false;
      return;
    }

    const dx = e.screenX - lastScreenX;
    const dy = e.screenY - lastScreenY;

    if (dx === 0 && dy === 0) return;

    lastScreenX = e.screenX;
    lastScreenY = e.screenY;

    try {
      await invoke("move_pin_by", { id: pinId, deltaX: dx, deltaY: dy });
    } catch (err) {
      console.error("move error:", err);
    }
  });

  window.addEventListener("mouseup", () => {
    isTrackingDrag = false;
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
