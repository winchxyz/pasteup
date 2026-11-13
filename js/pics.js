// Pictures and crops. A crop never copies pixels: it is a rectangle on the
// source picture, worked out on demand and only rendered when a file is saved.

import { GAP } from './layout.js';

let lastId = 0;
export const nextId = () => ++lastId;
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function loadPic(source, name = 'picture') {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => resolve({ id: nextId(), name, url, img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`${name} could not be read as a picture`));
    img.src = url;
  });
}

export function picFromCanvas(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? loadPic(blob, name).then(resolve, reject) : reject(new Error('empty canvas'))), 'image/png');
  });
}

// ratio: width / height to crop to, or null to keep the picture's own shape.
export const newCrop = (ratio = null) => ({ ratio, zoom: 1, cx: 0.5, cy: 0.5 });

export function cropRect(pic, crop) {
  const ratio = crop.ratio || pic.w / pic.h;
  let w = pic.w;
  let h = w / ratio;
  if (h > pic.h) { h = pic.h; w = h * ratio; }
  w /= crop.zoom;
  h /= crop.zoom;
  return { x: clamp(crop.cx * pic.w - w / 2, 0, pic.w - w), y: clamp(crop.cy * pic.h - h / 2, 0, pic.h - h), w, h };
}

// Move the crop by a share of its own frame (dx = 1 drags a full frame width).
export function panCrop(pic, crop, dx, dy) {
  const rect = cropRect(pic, crop);
  crop.cx = clamp((rect.x + rect.w / 2 - dx * rect.w) / pic.w, 0, 1);
  crop.cy = clamp((rect.y + rect.h / 2 - dy * rect.h) / pic.h, 0, 1);
  const settled = cropRect(pic, crop);
  crop.cx = (settled.x + settled.w / 2) / pic.w;
  crop.cy = (settled.y + settled.h / 2) / pic.h;
}

// Trim a rectangle from its centre until it has the given shape.
export function coverRect(rect, aspect) {
  const own = rect.w / rect.h;
  if (Math.abs(own - aspect) < 1e-4) return rect;
  if (own > aspect) { const w = rect.h * aspect; return { x: rect.x + (rect.w - w) / 2, y: rect.y, w, h: rect.h }; }
  const h = rect.w / aspect;
  return { x: rect.x, y: rect.y + (rect.h - h) / 2, w: rect.w, h };
}

// One picture spread over a whole row. widths are the tiles as X draws them, in px;
// with `seamless` the picture also runs behind the gaps, so nothing jumps between tiles.
// Sets the crop to the row's shape and returns the part of the picture each tile shows.
export function artRects(art, widths, height, seamless) {
  const gap = seamless ? GAP : 0;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  art.crop.ratio = total / height;
  const whole = cropRect(art.pic, art.crop);
  let x = 0;
  return widths.map((width) => {
    const rect = { x: whole.x + (x / total) * whole.w, y: whole.y, w: (width / total) * whole.w, h: whole.h };
    x += width + gap;
    return rect;
  });
}

// Position an <img> inside a frame so that exactly `rect` of the picture shows.
export function showRect(img, pic, rect) {
  img.style.width = `${(pic.w / rect.w) * 100}%`;
  img.style.height = `${(pic.h / rect.h) * 100}%`;
  img.style.left = `${(-rect.x / rect.w) * 100}%`;
  img.style.top = `${(-rect.y / rect.h) * 100}%`;
}

const MAX_SIDE = 4096; // the largest side X keeps

// The size a part of a picture is saved at: the asked size, or its own pixels, never over 4096.
export function savedSize(rect, size = null) {
  const w = size ? size.w : Math.round(rect.w);
  const h = size ? size.h : Math.round(rect.h);
  const shrink = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * shrink)), h: Math.max(1, Math.round(h * shrink)) };
}

// type: 'png' keeps every pixel, 'jpg' is several times lighter (no see-through parts).
export function rectToBlob(pic, rect, size = null, type = 'png') {
  const { w, h } = savedSize(rect, size);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (type === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(pic.img, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be saved'))),
    type === 'jpg' ? 'image/jpeg' : 'image/png', 0.92));
}

export function saveBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
