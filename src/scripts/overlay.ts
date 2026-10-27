import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point2D {
  x: number;
  y: number;
}

type AnnotationType = "brush" | "eraser" | "arrow" | "rect" | "text";

interface Annotation {
  type: AnnotationType;
  color: string;
  strokeWidth: number;
  points?: Point2D[];
  start?: Point2D;
  end?: Point2D;
  rect?: ScreenRect;
  text?: string;
}

const canvas = document.getElementById("overlayCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const magnifier = document.getElementById("magnifier") as HTMLElement;
const magCanvas = document.getElementById("magnifierCanvas") as HTMLCanvasElement;
const magCtx = magCanvas.getContext("2d")!;
const colorDot = document.getElementById("colorDot") as HTMLElement;
const colorHexText = document.getElementById("colorHexText") as HTMLElement;
const coordText = document.getElementById("coordText") as HTMLElement;
const annotToolbar = document.getElementById("annotationToolbar") as HTMLElement;
const regionToolbar = document.getElementById("regionSelectToolbar") as HTMLElement;
const recordRegionDim = document.getElementById("recordRegionDim") as HTMLElement;
const overlayModeTag = document.getElementById("overlayModeTag") as HTMLElement;
const overlayHintText = document.getElementById("overlayHintText") as HTMLElement;
const btnExitOverlay = document.getElementById("btnExitOverlay") as HTMLElement;

let currentMode: "screenshot" | "record_region" = "screenshot";
let bgImage: HTMLImageElement | null = null;
let isSelecting = false;
let startX = 0;
let startY = 0;
let cropRect: ScreenRect | null = null;
let currentTool: AnnotationType = "brush";
let currentColor = "#f43f5e";
let currentStrokeWidth = 3;
let annotations: Annotation[] = [];
let isDrawingAnnotation = false;
let currentAnnotation: Annotation | null = null;

window.addEventListener("DOMContentLoaded", async () => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  setupExitHandlers();
  setupToolbarEvents();
  setupCanvasEvents();
  setupKeyboardEvents();
  setupModeListener();
  await loadFullScreenCapture();
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  magCanvas.width = 140;
  magCanvas.height = 100;
  render();
}

async function loadFullScreenCapture() {
  try {
    const res = await invoke<{ width: number; height: number; image_data_url: string }>("capture_full_screen");
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      render();
    };
    img.src = res.image_data_url;
  } catch (err) {
    console.error("Failed to load screen capture:", err);
  }
}

function setupModeListener() {
  listen<{ mode: "screenshot" | "record_region" }>("set-overlay-mode", (event) => {
    currentMode = event.payload.mode;
    if (currentMode === "record_region") {
      overlayModeTag.textContent = "录屏选区模式";
      overlayHintText.textContent = "拖拽框选要录制的屏幕区域 | 按 Enter 确认 | 右键或按 ESC 退出";
    } else {
      overlayModeTag.textContent = "截图圈选模式";
      overlayHintText.textContent = "按住鼠标左键拖拽选区 | 右键或按 ESC 退出";
    }
    cropRect = null;
    annotations = [];
    annotToolbar.style.display = "none";
    regionToolbar.style.display = "none";
    render();
  });
}

function setupExitHandlers() {
  // Always-visible exit button
  btnExitOverlay?.addEventListener("click", () => {
    cancelSnipping();
  });

  // Right-click anywhere exits immediately
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    cancelSnipping();
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  }

  if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    ctx.fill("evenodd");

    // Border
    ctx.strokeStyle = currentMode === "record_region" ? "#06b6d4" : "#38bdf8";
    ctx.lineWidth = 2;
    if (currentMode === "record_region") {
      ctx.setLineDash([6, 6]);
    }
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    ctx.setLineDash([]);

    // Dimension label
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(cropRect.x, Math.max(0, cropRect.y - 26), 110, 22);
    ctx.fillStyle = currentMode === "record_region" ? "#06b6d4" : "#38bdf8";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${cropRect.width} × ${cropRect.height}`, cropRect.x + 8, Math.max(16, cropRect.y - 10));

    // Handles
    const handles = [
      { x: cropRect.x, y: cropRect.y },
      { x: cropRect.x + cropRect.width / 2, y: cropRect.y },
      { x: cropRect.x + cropRect.width, y: cropRect.y },
      { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height / 2 },
      { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
      { x: cropRect.x + cropRect.width / 2, y: cropRect.y + cropRect.height },
      { x: cropRect.x, y: cropRect.y + cropRect.height },
      { x: cropRect.x, y: cropRect.y + cropRect.height / 2 },
    ];

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1.5;
    handles.forEach((h) => {
      ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
      ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
    });

    ctx.restore();

    if (currentMode === "screenshot") {
      annotations.forEach(drawAnnotation);
      if (currentAnnotation) {
        drawAnnotation(currentAnnotation);
      }
    }
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawAnnotation(ann: Annotation) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (ann.type === "brush" && ann.points && ann.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(ann.points[0].x, ann.points[0].y);
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x, ann.points[i].y);
    }
    ctx.stroke();
  } else if (ann.type === "rect" && ann.rect) {
    ctx.strokeRect(ann.rect.x, ann.rect.y, ann.rect.width, ann.rect.height);
  } else if (ann.type === "arrow" && ann.start && ann.end) {
    ctx.beginPath();
    ctx.moveTo(ann.start.x, ann.start.y);
    ctx.lineTo(ann.end.x, ann.end.y);
    ctx.stroke();

    const dx = ann.end.x - ann.start.x;
    const dy = ann.end.y - ann.start.y;
    const angle = Math.atan2(dy, dx);
    const headLen = 14;
    const arrowAngle = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(ann.end.x, ann.end.y);
    ctx.lineTo(
      ann.end.x - headLen * Math.cos(angle - arrowAngle),
      ann.end.y - headLen * Math.sin(angle - arrowAngle)
    );
    ctx.lineTo(
      ann.end.x - headLen * Math.cos(angle + arrowAngle),
      ann.end.y - headLen * Math.sin(angle + arrowAngle)
    );
    ctx.closePath();
    ctx.fill();
  } else if (ann.type === "text" && ann.start && ann.text) {
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(ann.text, ann.start.x, ann.start.y);
  }

  ctx.restore();
}

function setupCanvasEvents() {
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      cancelSnipping();
      return;
    }

    if (!cropRect || currentMode === "record_region") {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      cropRect = { x: startX, y: startY, width: 0, height: 0 };
      magnifier.style.display = "none";
    } else {
      isDrawingAnnotation = true;
      const pt: Point2D = { x: e.clientX, y: e.clientY };

      if (currentTool === "brush") {
        currentAnnotation = {
          type: "brush",
          color: currentColor,
          strokeWidth: currentStrokeWidth,
          points: [pt],
        };
      } else if (currentTool === "rect") {
        currentAnnotation = {
          type: "rect",
          color: currentColor,
          strokeWidth: currentStrokeWidth,
          rect: { x: pt.x, y: pt.y, width: 0, height: 0 },
        };
      } else if (currentTool === "arrow") {
        currentAnnotation = {
          type: "arrow",
          color: currentColor,
          strokeWidth: currentStrokeWidth,
          start: pt,
          end: pt,
        };
      } else if (currentTool === "eraser") {
        eraseAtPoint(pt, 12);
      } else if (currentTool === "text") {
        const textStr = prompt("请输入文字标注内容：");
        if (textStr) {
          annotations.push({
            type: "text",
            color: currentColor,
            strokeWidth: 2,
            start: pt,
            text: textStr,
          });
          render();
        }
        isDrawingAnnotation = false;
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const x = e.clientX;
    const y = e.clientY;

    if (!cropRect && !isSelecting) {
      updateMagnifier(x, y);
    }

    if (isSelecting && cropRect) {
      cropRect.x = Math.min(startX, x);
      cropRect.y = Math.min(startY, y);
      cropRect.width = Math.abs(x - startX);
      cropRect.height = Math.abs(y - startY);
      render();
    } else if (isDrawingAnnotation && currentAnnotation) {
      const pt: Point2D = { x, y };

      if (currentAnnotation.type === "brush" && currentAnnotation.points) {
        currentAnnotation.points.push(pt);
      } else if (currentAnnotation.type === "rect" && currentAnnotation.rect) {
        currentAnnotation.rect.width = x - currentAnnotation.rect.x;
        currentAnnotation.rect.height = y - currentAnnotation.rect.y;
      } else if (currentAnnotation.type === "arrow") {
        currentAnnotation.end = pt;
      } else if (currentTool === "eraser") {
        eraseAtPoint(pt, 12);
      }
      render();
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (isSelecting && cropRect) {
      isSelecting = false;
      if (cropRect.width < 10 || cropRect.height < 10) {
        cropRect = null;
        annotToolbar.style.display = "none";
        regionToolbar.style.display = "none";
      } else {
        positionToolbar();
      }
      render();
    } else if (isDrawingAnnotation) {
      isDrawingAnnotation = false;
      if (currentAnnotation) {
        annotations.push(currentAnnotation);
        currentAnnotation = null;
      }
      render();
    }
  });
}

function updateMagnifier(x: number, y: number) {
  magnifier.style.display = "flex";
  magnifier.style.left = `${Math.min(window.innerWidth - 150, x + 15)}px`;
  magnifier.style.top = `${Math.min(window.innerHeight - 150, y + 15)}px`;

  if (bgImage) {
    const zoom = 8;
    const srcSize = 100 / zoom;
    magCtx.imageSmoothingEnabled = false;
    magCtx.drawImage(
      canvas,
      x - srcSize / 2,
      y - srcSize / 2,
      srcSize,
      srcSize,
      0,
      0,
      magCanvas.width,
      magCanvas.height
    );

    magCtx.strokeStyle = "rgba(56, 189, 248, 0.8)";
    magCtx.lineWidth = 1;
    magCtx.beginPath();
    magCtx.moveTo(magCanvas.width / 2, 0);
    magCtx.lineTo(magCanvas.width / 2, magCanvas.height);
    magCtx.moveTo(0, magCanvas.height / 2);
    magCtx.lineTo(magCanvas.width, magCanvas.height / 2);
    magCtx.stroke();

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase()}`;
    colorDot.style.background = hex;
    colorHexText.textContent = hex;
    coordText.textContent = `${x}, ${y}`;
  }
}

function positionToolbar() {
  if (!cropRect) return;

  if (currentMode === "record_region") {
    annotToolbar.style.display = "none";
    regionToolbar.style.display = "flex";
    recordRegionDim.textContent = `${cropRect.width} × ${cropRect.height}`;

    const tbWidth = 340;
    let tx = cropRect.x + cropRect.width - tbWidth;
    if (tx < 10) tx = 10;
    if (tx + tbWidth > window.innerWidth) tx = window.innerWidth - tbWidth - 10;

    let ty = cropRect.y + cropRect.height + 10;
    if (ty + 50 > window.innerHeight) {
      ty = Math.max(10, cropRect.y - 50);
    }

    regionToolbar.style.left = `${tx}px`;
    regionToolbar.style.top = `${ty}px`;
  } else {
    regionToolbar.style.display = "none";
    annotToolbar.style.display = "flex";

    const tbWidth = 420;
    let tx = cropRect.x + cropRect.width - tbWidth;
    if (tx < 10) tx = 10;
    if (tx + tbWidth > window.innerWidth) tx = window.innerWidth - tbWidth - 10;

    let ty = cropRect.y + cropRect.height + 10;
    if (ty + 50 > window.innerHeight) {
      ty = Math.max(10, cropRect.y - 50);
    }

    annotToolbar.style.left = `${tx}px`;
    annotToolbar.style.top = `${ty}px`;
  }
}

function eraseAtPoint(pt: Point2D, radius: number) {
  annotations = annotations.filter((ann) => {
    if (ann.type === "brush" && ann.points) {
      return !ann.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= radius);
    } else if (ann.type === "rect" && ann.rect) {
      return !(
        pt.x >= ann.rect.x - radius &&
        pt.x <= ann.rect.x + ann.rect.width + radius &&
        pt.y >= ann.rect.y - radius &&
        pt.y <= ann.rect.y + ann.rect.height + radius
      );
    } else if (ann.type === "arrow" && ann.start && ann.end) {
      return Math.hypot(ann.start.x - pt.x, ann.start.y - pt.y) > radius &&
             Math.hypot(ann.end.x - pt.x, ann.end.y - pt.y) > radius;
    }
    return true;
  });
}

function setupToolbarEvents() {
  const tools: { id: string; tool: AnnotationType }[] = [
    { id: "toolBrush", tool: "brush" },
    { id: "toolEraser", tool: "eraser" },
    { id: "toolArrow", tool: "arrow" },
    { id: "toolRect", tool: "rect" },
    { id: "toolText", tool: "text" },
  ];

  tools.forEach(({ id, tool }) => {
    document.getElementById(id)?.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
      document.getElementById(id)?.classList.add("active");
      currentTool = tool;
    });
  });

  document.getElementById("btnUndo")?.addEventListener("click", () => {
    annotations.pop();
    render();
  });

  document.querySelectorAll(".palette-color").forEach((pal) => {
    pal.addEventListener("click", () => {
      document.querySelectorAll(".palette-color").forEach((p) => p.classList.remove("selected"));
      pal.classList.add("selected");
      currentColor = pal.getAttribute("data-color") || "#f43f5e";
    });
  });

  // Action: Pin
  document.getElementById("btnPin")?.addEventListener("click", async () => {
    if (!cropRect) return;
    const croppedDataUrl = getCroppedCanvasDataUrl();
    await invoke("create_pin_window", {
      imageDataUrl: croppedDataUrl,
      x: Math.round(cropRect.x),
      y: Math.round(cropRect.y),
      width: Math.round(cropRect.width),
      height: Math.round(cropRect.height),
    });
    cancelSnipping();
  });

  // Action: Copy to clipboard
  document.getElementById("btnCopyConfirm")?.addEventListener("click", async () => {
    if (!cropRect) return;
    const croppedDataUrl = getCroppedCanvasDataUrl();
    const res = await fetch(croppedDataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    cancelSnipping();
  });

  // Action: Save to file
  document.getElementById("btnSave")?.addEventListener("click", async () => {
    if (!cropRect) return;
    const croppedDataUrl = getCroppedCanvasDataUrl();
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    const defaultPath = `C:\\OneCapture_${timestamp}.png`;
    const filePath = prompt("请输入图片保存路径:", defaultPath);
    if (filePath) {
      await invoke("save_image_file", { filePath, dataUrl: croppedDataUrl });
      alert("截图已成功保存！");
    }
    cancelSnipping();
  });

  document.getElementById("btnCancel")?.addEventListener("click", cancelSnipping);

  // Video Region Selection Mode events
  document.getElementById("btnConfirmRecordRegion")?.addEventListener("click", async () => {
    if (!cropRect) return;
    await invoke("set_recording_region", {
      rect: {
        x: Math.round(cropRect.x),
        y: Math.round(cropRect.y),
        width: Math.round(cropRect.width),
        height: Math.round(cropRect.height),
      },
    });
  });

  document.getElementById("btnCancelRecordRegion")?.addEventListener("click", cancelSnipping);
}

function getCroppedCanvasDataUrl(): string {
  if (!cropRect) return "";
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = cropRect.width;
  tempCanvas.height = cropRect.height;
  const tCtx = tempCanvas.getContext("2d")!;

  tCtx.drawImage(
    canvas,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height
  );

  return tempCanvas.toDataURL("image/png");
}

function cancelSnipping() {
  cropRect = null;
  annotations = [];
  annotToolbar.style.display = "none";
  regionToolbar.style.display = "none";
  magnifier.style.display = "none";
  invoke("hide_overlay");
}

function setupKeyboardEvents() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelSnipping();
    } else if (e.key === "Enter") {
      if (currentMode === "record_region") {
        document.getElementById("btnConfirmRecordRegion")?.click();
      } else {
        document.getElementById("btnCopyConfirm")?.click();
      }
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      document.getElementById("btnUndo")?.click();
    } else if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById("btnSave")?.click();
    }
  });
}
