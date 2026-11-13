// How x.com lays media out in a post. Rules measured on the live site, November 2026:
// one picture keeps its own shape; two or more sit in one row that scrolls sideways.
// Every size here is a fraction of the post's content width unless it says px.

export const GAP = 4;            // px between pictures in a row
export const MAX_ITEM = 0.8;     // one picture never takes more than 80% of the width
export const BASE_HEIGHT = 0.68; // row height when the pictures do not all fit
export const MAX_HEIGHT = 1.24446;
const PEEK = 0.67;               // how much of the second picture stays in view
const SHY = 0.33;

const sum = (list) => list.reduce((a, b) => a + b, 0);
const lower = (a, b) => (a.ratio <= b.ratio ? a : b);
const higher = (a, b) => (a.ratio >= b.ratio ? a : b);
const itemWidth = (height, aspect) => Math.min(height * aspect, MAX_ITEM);

// Height at which every picture is in view at once, or null when that cannot happen.
function fitAll(aspects) {
  if (aspects.length < 2) return null;
  const gaps = GAP * (aspects.length - 1);
  let open = aspects.slice();
  let capped = 0;
  while (open.length) {
    const height = (1 - capped * MAX_ITEM) / sum(open);
    if (height <= 0) return null;
    const still = open.filter((aspect) => height * aspect <= MAX_ITEM);
    if (still.length === open.length) return { ratio: height, offset: -gaps * height };
    capped += open.length - still.length;
    open = still;
  }
  return null;
}

// Share of the second picture that is in view before any scrolling.
function secondInView(height, aspects) {
  const first = itemWidth(height, aspects[0]);
  const second = itemWidth(height, aspects[1]);
  return second <= 0 ? 0 : Math.min(Math.max(1 - first, 0), second) / second;
}

// Height that leaves the second picture two thirds in view, so the row reads as scrollable.
function peekHeight(aspects) {
  const [a, b] = aspects;
  const found = [];
  const add = (span, width) => {
    if (width > 0 && span / width > 0) found.push({ ratio: span / width, offset: -GAP * (span / width) });
  };
  const plain = 1 / (a + PEEK * b);
  if (plain * a <= MAX_ITEM && plain * b <= MAX_ITEM) add(1, a + PEEK * b);
  const firstCapped = (1 - MAX_ITEM) / (PEEK * b);
  if (firstCapped * a >= MAX_ITEM && firstCapped * b <= MAX_ITEM) add(1 - MAX_ITEM, PEEK * b);
  const secondCapped = (1 - PEEK * MAX_ITEM) / a;
  if (secondCapped * b >= MAX_ITEM && secondCapped * a <= MAX_ITEM) add(1 - PEEK * MAX_ITEM, a);
  return found.length ? found.reduce(lower) : null;
}

// aspects: width / height of each picture, in post order.
// Returns the row height (ratio * width + offset px), the shape each picture is
// shown at (wide ones are trimmed to 80% of the width) and whether the row scrolls.
export function rowLayout(aspects) {
  const top = { ratio: MAX_HEIGHT, offset: 0 };
  let row = { ratio: BASE_HEIGHT, offset: 0 };
  const fit = fitAll(aspects);
  if (fit && fit.ratio >= row.ratio) row = lower(fit, top);

  if (aspects.length === 2) {
    if (fit && fit.ratio < row.ratio && secondInView(row.ratio, aspects) >= SHY) row = fit;
  } else if (aspects.length > 2 && 1 - secondInView(row.ratio, aspects) < SHY) {
    const peek = peekHeight(aspects);
    if (peek) {
      const cap = Math.min(MAX_ITEM / aspects[0], MAX_ITEM / aspects[1]);
      const next = lower(lower(peek, top), higher({ ratio: cap, offset: 0 }, row));
      if (next.ratio > row.ratio) row = next;
    }
  }

  const shown = aspects.map((aspect) => itemWidth(row.ratio, aspect) / row.ratio);
  return { ratio: row.ratio, offset: row.offset, aspects: shown, scrolls: row.ratio * sum(shown) > 1.000001 };
}

// A single picture: full width, portrait ones are limited to 510 px of height.
export function singleLayout(aspect, width) {
  const shown = Math.min(Math.max(aspect, 0.75), 5);
  const w = shown < 1 ? Math.min(width, 510 * shown) : width;
  return { width: w, height: w / shown, aspect: shown };
}

// Everything the preview and the read-out need for one post at one content width.
export function postLayout(aspects, width) {
  if (!aspects.length) return null;
  if (aspects.length === 1) {
    const one = singleLayout(aspects[0], width);
    return { kind: 'single', height: one.height, items: [{ width: one.width, aspect: one.aspect }], scrolls: false, used: one.width / width, inView: 1 };
  }
  const row = rowLayout(aspects);
  const height = row.ratio * width + row.offset;
  const items = row.aspects.map((aspect) => ({ width: aspect * height, aspect }));
  const total = sum(items.map((item) => item.width)) + GAP * (items.length - 1);
  let x = 0;
  let inView = 0;
  for (const item of items) {
    const visible = Math.max(0, Math.min(x + item.width, width) - x);
    inView += item.width > 0 ? visible / item.width : 0;
    x += item.width + GAP;
  }
  return { kind: 'row', height, items, scrolls: row.scrolls, used: Math.min(1, total / width), inView, total };
}
