// Example pictures drawn in code, so the editor opens with something to look at.
// They are marked as samples in the panel and step aside for the first real upload.

import { picFromCanvas } from './pics.js';

const BLUE = '#a4dded'; // non-photo blue, the paste-up artist's guide pencil
const INK = '#16262e';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// A candle chart, one candle per strip when it is cut into `candles` pieces.
export function chart(candles = 11) {
  const [c, g] = canvas(1620, 2025);
  const strip = c.width / candles;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);

  const up = '#6fa99b';
  const down = '#d5584f';
  // open, close, low, high as shares of the height, measured from the bottom
  const moves = [
    [0.07, 0.16, 0.06, 0.20], [0.16, 0.09, 0.08, 0.18], [0.09, 0.115, 0.08, 0.16], [0.115, 0.27, 0.09, 0.275],
    [0.26, 0.385, 0.25, 0.545], [0.385, 0.18, 0.17, 0.40], [0.18, 0.36, 0.17, 0.375], [0.36, 0.715, 0.335, 0.82],
    [0.715, 0.675, 0.585, 0.945], [0.675, 0.56, 0.47, 0.745], [0.56, 0.985, 0.53, 0.99],
  ];
  const y = (share) => c.height * (1 - share);

  g.setLineDash([5, 7]);
  g.strokeStyle = 'rgba(213, 88, 79, 0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, y(0.56));
  g.lineTo(c.width, y(0.56));
  g.stroke();
  g.setLineDash([]);

  for (let i = 0; i < candles; i++) {
    const [open, close, low, high] = moves[i % moves.length];
    const mid = strip * (i + 0.5);
    g.fillStyle = g.strokeStyle = close >= open ? up : down;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(mid, y(low));
    g.lineTo(mid, y(high));
    g.stroke();
    const top = y(Math.max(open, close));
    g.fillRect(mid - strip * 0.31, top, strip * 0.62, Math.max(10, y(Math.min(open, close)) - top));
  }
  return picFromCanvas(c, 'sample chart');
}

function registrationMark(g, x, y, r, color, weight) {
  g.strokeStyle = color;
  g.lineWidth = weight;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.moveTo(x - r * 1.7, y);
  g.lineTo(x + r * 1.7, y);
  g.moveTo(x, y - r * 1.7);
  g.lineTo(x, y + r * 1.7);
  g.stroke();
}

export function avatar() {
  const [c, g] = canvas(800, 800);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, 800, 800);
  registrationMark(g, 400, 400, 150, INK, 26);
  return picFromCanvas(c, 'sample avatar');
}

export function banner() {
  const [c, g] = canvas(3000, 1000);
  g.fillStyle = INK;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(164, 221, 237, 0.16)';
  g.lineWidth = 2;
  for (let x = 100; x < c.width; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 100; y < c.height; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }

  // three pasted sheets with crop marks, the way a board looked before the camera
  const sheets = [[1250, 220, 520, 560, -3], [1850, 160, 420, 420, 2], [2340, 330, 460, 500, -1.5]];
  for (const [x, y, w, h, turn] of sheets) {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate((turn * Math.PI) / 180);
    g.fillStyle = BLUE;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = BLUE;
    g.lineWidth = 5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.moveTo(sx * (w / 2 + 22), sy * (h / 2));
      g.lineTo(sx * (w / 2 + 70), sy * (h / 2));
      g.moveTo(sx * (w / 2), sy * (h / 2 + 22));
      g.lineTo(sx * (w / 2), sy * (h / 2 + 70));
      g.stroke();
    }
    g.restore();
  }
  registrationMark(g, 2790, 170, 44, BLUE, 6);
  return picFromCanvas(c, 'sample banner');
}
