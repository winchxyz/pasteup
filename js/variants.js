// Picture formats and ready-made layouts. A layout is only a list of shapes
// (width ÷ height), one per picture; layout.js decides how X shows them.

import { GAP, MAX_HEIGHT } from './layout.js';

export const FORMATS = [
  { id: '16:9', name: 'Landscape', ratio: 16 / 9, size: [1600, 900] },
  { id: '1:1', name: 'Square', ratio: 1, size: [1200, 1200] },
  { id: '4:5', name: 'Portrait', ratio: 4 / 5, size: [1080, 1350] },
  { id: '3:4', name: 'Tall', ratio: 3 / 4, size: [1200, 1600] },
  { id: '9:16', name: 'Story', ratio: 9 / 16, size: [1080, 1920] },
  { id: '2:1', name: 'Wide', ratio: 2, size: [1600, 800] },
];

export const formatOf = (ratio) => FORMATS.find((format) => Math.abs(format.ratio - ratio) < 0.004) || null;

export function ratioLabel(ratio) {
  const format = formatOf(ratio);
  if (format) return format.id;
  return ratio >= 1 ? `${ratio.toFixed(2).replace(/\.?0+$/, '')}:1` : `1:${(1 / ratio).toFixed(1).replace(/\.0$/, '')}`;
}

const sum = (list) => list.reduce((a, b) => a + b, 0);

// The widest set of shapes that still shows whole: the row is at most 1.244 × the
// post width tall, and the gaps take their share of the width.
export const fullHeightSum = (count, width) => (width - GAP * (count - 1) - 0.5) / (MAX_HEIGHT * width);

const spread = (weights, total) => weights.map((weight) => (total * weight) / sum(weights));

// width: the post's content width in px (518 on a computer, 310 on a phone).
export function variants(count, width) {
  if (count === 1) {
    return [...FORMATS.map((format) => ({ id: format.id, name: `${format.name} ${format.id}`, ratios: [format.ratio] })),
      { id: '3:1', name: 'Panorama 3:1', ratios: [3] }];
  }

  const total = fullHeightSum(count, width);
  const each = (fn) => Array.from({ length: count }, (_, i) => fn(i));
  const same = (ratio) => each(() => ratio);

  if (count === 2) {
    return [
      { id: 'squares', name: 'Two squares', ratios: same(1) },
      { id: 'portraits', name: 'Two portraits 4:5', ratios: same(4 / 5) },
      { id: 'tall', name: 'Two tall 3:4', ratios: same(3 / 4) },
      { id: 'stories', name: 'Two stories 9:16', ratios: same(9 / 16) },
      { id: 'strips', name: 'Full height pair', ratios: spread([1, 1], total) },
      { id: 'lead', name: 'Square + strip', ratios: [1, 0.5] },
      { id: 'tail', name: 'Strip + square', ratios: [0.5, 1] },
      { id: 'mix', name: 'Wide + story', ratios: [16 / 9, 9 / 16] },
      { id: 'mix2', name: 'Story + wide', ratios: [9 / 16, 16 / 9] },
      { id: 'third', name: 'Two thirds + third', ratios: spread([2, 1], total) },
      { id: 'wide', name: 'Two landscapes', ratios: same(16 / 9) },
    ];
  }

  const last = count - 1;
  const middle = Math.floor(last / 2);
  const all = [
    { id: 'strips', name: 'Even strips', weights: each(() => 1) },
    { id: 'lead', name: 'Wide first', weights: each((i) => (i === 0 ? last : 1)) },
    { id: 'tail', name: 'Wide last', weights: each((i) => (i === last ? last : 1)) },
    { id: 'centre', name: 'Wide middle', weights: each((i) => (i === middle ? last : 1)) },
    { id: 'ends', name: 'Wide ends', weights: each((i) => (i === 0 || i === last ? Math.max(2, count - 2) : 1)) },
    { id: 'rise', name: 'Steps up', weights: each((i) => 1 + (2 * i) / last) },
    { id: 'fall', name: 'Steps down', weights: each((i) => 3 - (2 * i) / last) },
    { id: 'pulse', name: 'Thick and thin', weights: each((i) => (i % 2 ? 1 : 2)) },
  ].map(({ id, name, weights }) => ({ id, name, ratios: spread(weights, total) }));

  return [
    ...all,
    { id: 'squares', name: 'Squares', ratios: same(1) },
    { id: 'portraits', name: 'Portraits 4:5', ratios: same(4 / 5) },
    { id: 'tall', name: 'Tall 3:4', ratios: same(3 / 4) },
    { id: 'stories', name: 'Stories 9:16', ratios: same(9 / 16) },
    { id: 'wide', name: 'Landscapes 16:9', ratios: same(16 / 9) },
    { id: 'opener', name: 'Wide opener', ratios: each((i) => (i === 0 ? 4 / 3 : 3 / 4)) },
    { id: 'cover', name: 'Square opener', ratios: each((i) => (i === 0 ? 1 : 9 / 16)) },
  ];
}
