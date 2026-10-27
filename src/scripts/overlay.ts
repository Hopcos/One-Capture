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
type HandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "inside" | "none";
type DragMode = "none" | "create" | "move" | "resize";

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

// Selection & Resizing State
let cropRect: ScreenRect | null = null;
let dragMode: DragMode = "none";
let activeHandle: HandleType = "none";
let startX = 0;
let startY = 0;
let dragOffsetX = 0;
let dragOffsetY = 0;
let initialRect: ScreenRect = { x: 0, y: 0, width: 0, height: 0 };
let initialMouse: Point2D = { x: 0, y: 0 };

// Annotation Tools State
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
  setupEventListeners();
  await loadFullScreenCapture();
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  magCanvas.width = 140;
  magCanvas.height = 100;
  render();
}

/**
 * Compute the scale factor between physical screen pixels and CSS logical pixels.
 * This guarantees 1:1 true scale recording without DPI magnification!
 */
function getScaleFactor(): { x: number; y: number } {
  if (bgImage && bgImage.naturalWidth > 0 && canvas.width > 0) {
    return {
      x: bgImage.naturalWidth / canvas.width,
      y: bgImage.naturalHeight / canvas.height,
    };
  }
  const dpr = window.devicePixelRatio || 1;
  return { x: dpr, y: dpr };
}

/**
 * Convert CSS logical pixel rectangle to 1:1 physical screen rectangle.
 * Even dimensions are enforced for hardware codecs (NVENC, AMF, QSV, x264).
 */
function getPhysicalCropRect(): ScreenRect {
  if (!cropRect) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = getScaleFactor();

  const normX = Math.min(cropRect.x, cropRect.x + cropRect.width);
  const normY = Math.min(cropRect.y, cropRect.y + cropRect.height);
  const normW = Math.abs(cropRect.width);
  const normH = Math.abs(cropRect.height);

  const physX = Math.round(normX * scale.x);
  const physY = Math.round(normY * scale.y);
  let physW = Math.round(normW * scale.x);
  let physH = Math.round(normH * scale.y);

  // Even dimensions required by video encoders
  physW = Math.max(2, (physW / 2) * 2);
  physH = Math.max(2, (physH / 2) * 2);

  return {
    x: Math.max(0, physX),
    y: Math.max(0, physY),
    width: physW,
    height: physH,
  };
}

async function loadFullScreenCapture() {
  try {
    const res = await invoke<{ width: number; height: number; image_data_url: string }>("capture_full_screen");
    applyCapturedImage(res.image_data_url);
  } catch (err) {
    console.error("Failed to load screen capture:", err);
  }
}

function applyCapturedImage(dataUrl: string) {
  const img = new Image();
  img.onload = () => {
    bgImage = img;
    render();
  };
  img.src = dataUrl;
}

function setupEventListeners() {
  // Listen for captured image data emitted directly from Rust
  listen<{ width: number; height: number; image_data_url: string }>("overlay-data", (event) => {
    if (event.payload?.image_data_url) {
      applyCapturedImage(event.payload.image_data_url);
    }
  });

  // Listen for mode changes
  listen<{ mode: "screenshot" | "record_region" }>("set-overlay-mode", (event) => {
    currentMode = event.payload.mode;
    if (currentMode === "record_region") {
      overlayModeTag.textContent = "🎥 录屏选区模式 (1:1 比例)";
      overlayHintText.textContent = "拖拽框选录制范围 | 可拖动8个控制把手调整 | 按 Enter 或双击确认 | 按 ESC 退出";
    } else {
      overlayModeTag.textContent = "📸 截图圈选模式";
      overlayHintText.textContent = "按住鼠标左键拖拽选区 | 标注后点击复制或贴图 | 点击右上角或按 ESC 退出";
    }
    cropRect = null;
    annotations = [];
    dragMode = "none";
    annotToolbar.style.display = "none";
    regionToolbar.style.display = "none";
    render();
  });
}

function setupExitHandlers() {
  btnExitOverlay?.addEventListener("click", () => {
    cancelSnipping();
  });

  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    cancelSnipping();
  });

  canvas.addEventListener("dblclick", () => {
    if (!cropRect) {
      cancelSnipping();
    } else if (currentMode === "record_region") {
      confirmRecordingRegion();
    }
  });
}

// 8 Control Handles Geometry & Hit-Testing
function getHandlePositions(rect: ScreenRect): Record<HandleType, Point2D> {
  const x = Math.min(rect.x, rect.x + rect.width);
  const y = Math.min(rect.y, rect.y + rect.height);
  const w = Math.abs(rect.width);
  const h = Math.abs(rect.height);

  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
    inside: { x: x + w / 2, y: y + h / 2 },
    none: { x: 0, y: 0 },
  };
}

function hitTestHandle(mx: number, my: number): HandleType {
  if (!cropRect || cropRect.width === 0 || cropRect.height === 0) {
    return "none";
  }

  const handles = getHandlePositions(cropRect);
  const hitRadius = 10;

  // Check 8 handle points first
  const handleKeys: HandleType[] = ["nw", "ne", "se", "sw", "n", "s", "e", "w"];
  for (const k of handleKeys) {
    const pt = handles[k];
    if (Math.hypot(mx - pt.x, my - pt.y) <= hitRadius) {
      return k;
    }
  }

  // Check inside box for moving
  const x = Math.min(cropRect.x, cropRect.x + cropRect.width);
  const y = Math.min(cropRect.y, cropRect.y + cropRect.height);
  const w = Math.abs(cropRect.width);
  const h = Math.abs(cropRect.height);

  if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
    return "inside";
  }

  return "none";
}

function updateCursor(handle: HandleType) {
  if (dragMode !== "none") return;

  switch (handle) {
    case "nw":
    case "se":
      canvas.style.cursor = "nwse-resize";
      break;
    case "ne":
    case "sw":
      canvas.style.cursor = "nesw-resize";
      break;
    case "n":
    case "s":
      canvas.style.cursor = "ns-resize";
      break;
    case "e":
    case "w":
      canvas.style.cursor = "ew-resize";
      break;
    case "inside":
      canvas.style.cursor = currentMode === "record_region" ? "move" : "default";
      break;
    default:
      canvas.style.cursor = "crosshair";
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  }

  if (cropRect && Math.abs(cropRect.width) > 0 && Math.abs(cropRect.height) > 0) {
    const normX = Math.min(cropRect.x, cropRect.x + cropRect.width);
    const normY = Math.min(cropRect.y, cropRect.y + cropRect.height);
    const normW = Math.abs(cropRect.width);
    const normH = Math.abs(cropRect.height);
    const phys = getPhysicalCropRect();

    // Semi-transparent mask outside crop
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(normX, normY, normW, normH);
    ctx.fill("evenodd");

    // Selection border
    ctx.strokeStyle = currentMode === "record_region" ? "#06b6d4" : "#38bdf8";
    ctx.lineWidth = 2;
    if (currentMode === "record_region") {
      ctx.setLineDash([6, 6]);
    }
    ctx.strokeRect(normX, normY, normW, normH);
    ctx.setLineDash([]);

    // 1:1 Physical Resolution & Offset Label
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(normX, Math.max(0, normY - 28), 150, 24);
    ctx.fillStyle = currentMode === "record_region" ? "#06b6d4" : "#38bdf8";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${phys.width} × ${phys.height} px (1:1)`, normX + 8, Math.max(16, normY - 12));

    // Draw 8 Resizing Handles
    const handles = getHandlePositions({ x: normX, y: normY, width: normW, height: normH });
    const handleKeys: HandleType[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

    handleKeys.forEach((k) => {
      const pt = handles[k];
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();

    if (currentMode === "screenshot") {
      annotations.forEach(drawAnnotation);
      if (currentAnnotation) {
        drawAnnotation(currentAnnotation);
      }
    }
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
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

    const mx = e.clientX;
    const my = e.clientY;
    const hit = hitTestHandle(mx, my);

    if (cropRect && (currentMode === "record_region" || hit !== "none")) {
      if (hit === "inside") {
        // Drag to move whole selection box
        dragMode = "move";
        dragOffsetX = mx - cropRect.x;
        dragOffsetY = my - cropRect.y;
        annotToolbar.style.display = "none";
        regionToolbar.style.display = "none";
      } else if (hit !== "none") {
        // Drag 8 handles to resize selection box
        dragMode = "resize";
        activeHandle = hit;
        initialRect = { ...cropRect };
        initialMouse = { x: mx, y: my };
        annotToolbar.style.display = "none";
        regionToolbar.style.display = "none";
      } else if (currentMode === "record_region") {
        // Click outside in record_region creates new selection
        dragMode = "create";
        startX = mx;
        startY = my;
        cropRect = { x: startX, y: startY, width: 0, height: 0 };
        annotToolbar.style.display = "none";
        regionToolbar.style.display = "none";
      } else {
        // Drawing annotations inside screenshot mode
        isDrawingAnnotation = true;
        handleAnnotationMouseDown(mx, my);
      }
    } else if (!cropRect) {
      // First time creating selection
      dragMode = "create";
      startX = mx;
      startY = my;
      cropRect = { x: startX, y: startY, width: 0, height: 0 };
      magnifier.style.display = "none";
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const mx = e.clientX;
    const my = e.clientY;

    if (dragMode === "none") {
      const hit = hitTestHandle(mx, my);
      updateCursor(hit);

      if (!cropRect) {
        updateMagnifier(mx, my);
      }
    } else if (dragMode === "create" && cropRect) {
      cropRect.x = Math.min(startX, mx);
      cropRect.y = Math.min(startY, my);
      cropRect.width = Math.abs(mx - startX);
      cropRect.height = Math.abs(my - startY);
      render();
    } else if (dragMode === "move" && cropRect) {
      const newX = mx - dragOffsetX;
      const newY = my - dragOffsetY;
      cropRect.x = Math.max(0, Math.min(canvas.width - cropRect.width, newX));
      cropRect.y = Math.max(0, Math.min(canvas.height - cropRect.height, newY));
      render();
    } else if (dragMode === "resize" && cropRect) {
      const dx = mx - initialMouse.x;
      const dy = my - initialMouse.y;
      handleResize(dx, dy);
      render();
    } else if (isDrawingAnnotation && currentAnnotation) {
      handleAnnotationMouseMove(mx, my);
      render();
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (dragMode !== "none" && cropRect) {
      dragMode = "none";
      activeHandle = "none";

      // Normalize rect
      if (cropRect.width < 0) {
        cropRect.x += cropRect.width;
        cropRect.width = Math.abs(cropRect.width);
      }
      if (cropRect.height < 0) {
        cropRect.y += cropRect.height;
        cropRect.height = Math.abs(cropRect.height);
      }

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

function handleResize(dx: number, dy: number) {
  if (!cropRect) return;

  const r = initialRect;
  switch (activeHandle) {
    case "e": {
      cropRect.width = Math.max(10, r.width + dx);
      break;
    }
    case "w": {
      const newW = r.width - dx;
      if (newW >= 10) {
        cropRect.x = r.x + dx;
        cropRect.width = newW;
      }
      break;
    }
    case "s": {
      cropRect.height = Math.max(10, r.height + dy);
      break;
    }
    case "n": {
      const newH = r.height - dy;
      if (newH >= 10) {
        cropRect.y = r.y + dy;
        cropRect.height = newH;
      }
      break;
    }
    case "se": {
      cropRect.width = Math.max(10, r.width + dx);
      cropRect.height = Math.max(10, r.height + dy);
      break;
    }
    case "nw": {
      const newW = r.width - dx;
      const newH = r.height - dy;
      if (newW >= 10) {
        cropRect.x = r.x + dx;
        cropRect.width = newW;
      }
      if (newH >= 10) {
        cropRect.y = r.y + dy;
        cropRect.height = newH;
      }
      break;
    }
    case "ne": {
      cropRect.width = Math.max(10, r.width + dx);
      const newH = r.height - dy;
      if (newH >= 10) {
        cropRect.y = r.y + dy;
        cropRect.height = newH;
      }
      break;
    }
    case "sw": {
      const newW = r.width - dx;
      if (newW >= 10) {
        cropRect.x = r.x + dx;
        cropRect.width = newW;
      }
      cropRect.height = Math.max(10, r.height + dy);
      break;
    }
  }
}

function handleAnnotationMouseDown(mx: number, my: number) {
  const pt: Point2D = { x: mx, y: my };

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

function handleAnnotationMouseMove(mx: number, my: number) {
  if (!currentAnnotation) return;
  const pt: Point2D = { x: mx, y: my };

  if (currentAnnotation.type === "brush" && currentAnnotation.points) {
    currentAnnotation.points.push(pt);
  } else if (currentAnnotation.type === "rect" && currentAnnotation.rect) {
    currentAnnotation.rect.width = mx - currentAnnotation.rect.x;
    currentAnnotation.rect.height = my - currentAnnotation.rect.y;
  } else if (currentAnnotation.type === "arrow") {
    currentAnnotation.end = pt;
  } else if (currentTool === "eraser") {
    eraseAtPoint(pt, 12);
  }
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
  const phys = getPhysicalCropRect();

  const normX = Math.min(cropRect.x, cropRect.x + cropRect.width);
  const normY = Math.min(cropRect.y, cropRect.y + cropRect.height);
  const normW = Math.abs(cropRect.width);
  const normH = Math.abs(cropRect.height);

  if (currentMode === "record_region") {
    annotToolbar.style.display = "none";
    regionToolbar.style.display = "flex";
    recordRegionDim.textContent = `${phys.width} × ${phys.height} px`;

    const tbWidth = 380;
    let tx = normX + normW - tbWidth;
    if (tx < 10) tx = 10;
    if (tx + tbWidth > window.innerWidth) tx = window.innerWidth - tbWidth - 10;

    let ty = normY + normH + 12;
    if (ty + 60 > window.innerHeight) {
      ty = Math.max(10, normY - 60);
    }

    regionToolbar.style.left = `${tx}px`;
    regionToolbar.style.top = `${ty}px`;
  } else {
    regionToolbar.style.display = "none";
    annotToolbar.style.display = "flex";

    const tbWidth = 420;
    let tx = normX + normW - tbWidth;
    if (tx < 10) tx = 10;
    if (tx + tbWidth > window.innerWidth) tx = window.innerWidth - tbWidth - 10;

    let ty = normY + normH + 12;
    if (ty + 60 > window.innerHeight) {
      ty = Math.max(10, normY - 60);
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
    const phys = getPhysicalCropRect();
    const croppedDataUrl = getCroppedCanvasDataUrl();
    await invoke("create_pin_window", {
      imageDataUrl: croppedDataUrl,
      x: phys.x,
      y: phys.y,
      width: phys.width,
      height: phys.height,
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
  document.getElementById("btnConfirmRecordRegion")?.addEventListener("click", () => {
    confirmRecordingRegion();
  });

  document.getElementById("btnCancelRecordRegion")?.addEventListener("click", cancelSnipping);
}

async function confirmRecordingRegion() {
  if (!cropRect) return;
  // Send 1:1 physical pixel coordinates to Rust for exact 1:1 video capture!
  const phys = getPhysicalCropRect();
  await invoke("set_recording_region", { rect: phys });
}

function getCroppedCanvasDataUrl(): string {
  if (!cropRect || !bgImage) return "";
  const phys = getPhysicalCropRect();

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = phys.width;
  tempCanvas.height = phys.height;
  const tCtx = tempCanvas.getContext("2d")!;

  // 1:1 high-resolution crop from physical background image
  tCtx.drawImage(
    bgImage,
    phys.x,
    phys.y,
    phys.width,
    phys.height,
    0,
    0,
    phys.width,
    phys.height
  );

  return tempCanvas.toDataURL("image/png");
}

function cancelSnipping() {
  cropRect = null;
  annotations = [];
  dragMode = "none";
  activeHandle = "none";
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
        confirmRecordingRegion();
      } else {
        document.getElementById("btnCopyConfirm")?.click();
      }
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      document.getElementById("btnUndo")?.click();
    } else if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById("btnSave")?.click();
    } else if (cropRect && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      // Precision 1px (or 10px with Shift) keyboard nudging
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowUp") cropRect.y = Math.max(0, cropRect.y - step);
      if (e.key === "ArrowDown") cropRect.y = Math.min(canvas.height - cropRect.height, cropRect.y + step);
      if (e.key === "ArrowLeft") cropRect.x = Math.max(0, cropRect.x - step);
      if (e.key === "ArrowRight") cropRect.x = Math.min(canvas.width - cropRect.width, cropRect.x + step);
      positionToolbar();
      render();
    }
  });
}
