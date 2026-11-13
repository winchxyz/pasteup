import { h, drag } from './dom.js';
import { postLayout, GAP } from './layout.js';
import { clamp, loadPic, newCrop, cropRect, panCrop, artRects, showRect, rectToBlob, saveBlob, nextId } from './pics.js';
import { column, contentWidth, frame, DEVICES } from './preview.js';
import { FORMATS, formatOf, ratioLabel, variants, fullHeightSum } from './variants.js';
import { sizeSheet } from './sizes.js';
import { zip } from './zip.js';

const LIMIT = 20; // pictures in one post on X since November 2026
const STORE = 'pasteup.v2';

const state = {
  mode: 'post',
  theme: 'dark',
  device: 'desktop',
  profile: { name: '', handle: '', bio: '', shape: 'circle', avatar: null, banner: null },
  // a post is a row of places; each has a shape and, once filled, its own picture.
  // `art` is one picture spread over all of them instead.
  post: { text: '', slots: [], art: null, variant: 'strips', gallery: true },
  selected: null,
};

const desk = document.getElementById('desk');
const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
const tools = document.getElementById('tools');
// with room to spare the layouts sit left of the preview and the picture controls right of it
const roomy = window.matchMedia('(min-width: 1240px)');
const memos = { dark: {}, light: {} };

// ---------- saved between visits: words and switches, never pictures ----------

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!saved) return;
    for (const key of ['mode', 'theme', 'device']) if (typeof saved[key] === 'string') state[key] = saved[key];
    for (const key of ['name', 'handle', 'bio', 'shape']) if (typeof saved[key] === 'string') state.profile[key] = saved[key];
    if (typeof saved.text === 'string') state.post.text = saved.text;
  } catch { /* storage is a convenience */ }
}

function remember() {
  try {
    const { name, handle, bio, shape } = state.profile;
    localStorage.setItem(STORE, JSON.stringify({ mode: state.mode, theme: state.theme, device: state.device, name, handle, bio, shape, text: state.post.text }));
  } catch { /* same */ }
}

// ---------- the post ----------

const newSlot = (ratio) => ({ id: nextId(), pic: null, crop: newCrop(ratio) });
const slotRatio = (slot) => slot.crop.ratio || (slot.pic ? slot.pic.w / slot.pic.h : 1);
const total = (list) => list.reduce((a, b) => a + b, 0);

// The row X builds from the places, and the part of a picture each one shows.
function resolve(width) {
  const { slots, art } = state.post;
  if (!slots.length) return { layout: null, rects: [], ratios: [] };
  const ratios = slots.map(slotRatio);
  const layout = postLayout(ratios, width);
  const rects = art
    ? artRects(art, layout.items.map((item) => item.width), layout.height, art.seamless && layout.kind === 'row')
    : slots.map((slot) => (slot.pic ? cropRect(slot.pic, slot.crop) : null));
  return { layout, rects, ratios };
}

function faceView(face) {
  return face ? { pic: face.pic, rect: cropRect(face.pic, face.crop) } : null;
}

function viewFor(device) {
  const { layout, rects, ratios } = resolve(contentWidth(device));
  const { slots, art } = state.post;
  return {
    profile: state.profile,
    avatar: faceView(state.profile.avatar),
    banner: faceView(state.profile.banner),
    text: state.post.text,
    media: slots.map((slot, i) => ({ id: slot.id, pic: art ? art.pic : slot.pic, rect: rects[i], number: i + 1, label: ratioLabel(ratios[i]) })),
    layout,
  };
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-on'), 4200);
}

async function readFiles(files) {
  const pics = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try { pics.push(await loadPic(file, file.name)); } catch (error) { toast(error.message); }
  }
  return pics;
}

// Use a ready layout: keep the pictures already placed, change the shapes around them.
function applyVariant(variant) {
  const old = state.post.slots;
  state.post.slots = variant.ratios.map((ratio, i) => {
    const slot = old[i] || newSlot(ratio);
    slot.crop.ratio = ratio;
    return slot;
  });
  state.post.variant = variant.id;
  if (!state.post.slots.some((slot) => slot.id === state.selected)) state.selected = state.post.slots[0].id;
  render();
}

function setCount(count) {
  const list = variants(count, contentWidth(state.device));
  applyVariant(list.find((variant) => variant.id === state.post.variant) || list[0]);
}

// New pictures go into the empty places first, then onto the end of the row.
// `into` puts the first one in a chosen place.
async function addPictures(files, into = null) {
  const pics = await readFiles(files);
  if (!pics.length) return;
  const { slots } = state.post;
  if (state.post.art) { state.post.art = null; toast('The picture across the row was taken off.'); }
  let left = 0;
  for (const pic of pics) {
    const slot = into || slots.find((one) => !one.pic);
    into = null;
    if (slot) { slot.pic = pic; state.selected = slot.id; continue; }
    if (slots.length >= LIMIT) { left++; continue; }
    const made = newSlot(null);
    made.pic = pic;
    slots.push(made);
    state.post.variant = null;
    state.selected = made.id;
  }
  if (left) toast(`A post holds ${LIMIT} pictures. ${left} left out.`);
  render();
}

async function setArt(files) {
  const [pic] = await readFiles(files);
  if (!pic) return;
  state.post.art = { pic, crop: newCrop(), seamless: true };
  render();
}

function addSlot() {
  const { slots } = state.post;
  if (slots.length >= LIMIT) { toast(`A post holds ${LIMIT} pictures.`); return; }
  const made = newSlot(slots.length ? slotRatio(slots[slots.length - 1]) : 4 / 5);
  slots.push(made);
  state.post.variant = null;
  state.selected = made.id;
  render();
}

function removeSlot(slot) {
  const { slots } = state.post;
  if (slots.length < 2) return;
  const at = slots.indexOf(slot);
  slots.splice(at, 1);
  state.post.variant = null;
  state.selected = slots[Math.min(at, slots.length - 1)].id;
  render();
}

function move(slot, step) {
  const { slots } = state.post;
  const from = slots.indexOf(slot);
  const to = clamp(from + step, 0, slots.length - 1);
  if (from === to) return;
  slots.splice(from, 1);
  slots.splice(to, 0, slot);
  state.post.variant = null;
  render();
}

function setRatio(slot, ratio) {
  slot.crop.ratio = ratio;
  state.post.variant = null;
  render();
}

// From three pictures up they all show at once only as narrow strips at full height.
// Keep how wide they are next to each other and narrow the whole set until it fits.
function fitAll() {
  const { slots } = state.post;
  const ratios = slots.map(slotRatio);
  const scale = fullHeightSum(slots.length, contentWidth(state.device)) / total(ratios);
  slots.forEach((slot, i) => { slot.crop.ratio = ratios[i] * scale; });
  state.post.variant = null;
  render();
}

const selectedSlot = () => state.post.slots.find((slot) => slot.id === state.selected) || null;

// ---------- small controls ----------

function seg(name, value, options, onPick) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': name }, options.map(([label, key]) =>
    h('button', { type: 'button', class: key === value ? 'is-on' : '', 'aria-pressed': String(key === value), onclick: () => onPick(key) }, label)));
}

function filePicker(label, { multiple = false, primary = false, onFiles }) {
  const input = h('input', { type: 'file', accept: 'image/*', multiple, hidden: true, onchange: () => { onFiles([...input.files]); input.value = ''; } });
  return [h('button', { type: 'button', class: primary ? 'btn is-primary' : 'btn', onclick: () => input.click() }, label), input];
}

function section(title, aside, ...kids) {
  return h('section', { class: 'block' }, h('header', null, h('h2', null, title), aside ? h('span', { class: 'aside' }, aside) : null), kids);
}

function zoomSlider(id, crop, onInput) {
  return h('label', { class: 'slider' }, h('span', null, 'Zoom'),
    h('input', { id, type: 'range', min: 1, max: 5, step: 0.01, value: crop.zoom, oninput: (event) => { crop.zoom = Number(event.target.value); onInput(); } }));
}

// A frame you drag the picture around in. Returns the element and a way to redraw it.
function cropbox({ pic, crop, height = 220, mask = '', onChange, drop }) {
  const img = h('img', { src: pic.url, alt: '', draggable: false });
  const box = h('div', { class: `cropbox ${mask}`, 'data-drop': drop || null }, img);
  const redraw = () => {
    const rect = cropRect(pic, crop);
    box.style.aspectRatio = String(rect.w / rect.h);
    box.style.width = `${Math.round(height * (rect.w / rect.h))}px`;
    showRect(img, pic, rect);
  };
  let last = [0, 0];
  drag(box, {
    cursor: 'grabbing',
    start: (event) => { if (event.target.closest('.cut')) return false; last = [0, 0]; return true; },
    move: (dx, dy) => {
      const size = box.getBoundingClientRect();
      panCrop(pic, crop, (dx - last[0]) / size.width, (dy - last[1]) / size.height);
      last = [dx, dy];
      redraw();
      onChange();
    },
  });
  redraw();
  return { el: box, redraw };
}

// A small drawing of the row a set of shapes makes in the feed.
function miniRow(ratios, width, size = 76) {
  const layout = postLayout(ratios, width);
  const scale = size / width;
  return h('div', { class: `mini ${layout.scrolls ? 'is-scrolling' : ''}`, style: { width: `${size}px`, height: `${Math.max(8, layout.height * scale)}px` } },
    layout.items.map((item) => h('i', { style: { width: `${Math.max(1, (item.width + GAP) * scale - 1)}px` } })));
}

// ---------- panel: post ----------

function gallery() {
  const { slots, variant, gallery: open } = state.post;
  const width = contentWidth(state.device);
  const shown = open || roomy.matches;
  const toggle = roomy.matches ? null : h('button', { type: 'button', class: 'link', onclick: () => { state.post.gallery = !open; renderPanel(); } }, open ? 'Hide' : 'Show');
  const head = h('header', null, h('h2', null, 'Layout'), toggle);
  if (!shown) return h('section', { class: 'block' }, head);
  const counts = h('div', { class: 'counts', role: 'group', 'aria-label': 'Number of pictures' }, Array.from({ length: LIMIT }, (_, i) =>
    h('button', { type: 'button', class: i + 1 === slots.length ? 'is-on' : '', 'aria-pressed': String(i + 1 === slots.length), onclick: () => setCount(i + 1) }, String(i + 1))));
  const cards = variants(slots.length || 1, width).map((one) => {
    const layout = postLayout(one.ratios, width);
    return h('button', { type: 'button', class: `variant ${one.id === variant ? 'is-on' : ''}`, 'aria-pressed': String(one.id === variant), onclick: () => applyVariant(one) },
      h('span', { class: 'variant-view' }, miniRow(one.ratios, width)),
      h('b', null, one.name),
      h('small', null, layout.kind === 'single' ? 'one picture' : layout.scrolls ? 'swipe' : 'all in view'));
  });
  return h('section', { class: 'block' }, head,
    h('p', { class: 'note' }, 'How many pictures, then how they sit in the feed.'),
    counts,
    h('div', { class: 'variants' }, cards));
}

function tray() {
  const { slots, art } = state.post;
  const view = viewFor(state.device);
  let dragged = null;
  const thumbs = slots.map((slot, i) => {
    const entry = view.media[i];
    const shape = view.layout.items[i].aspect;
    return h('button', {
      type: 'button', class: `thumb ${slot.id === state.selected ? 'is-on' : ''}`,
      style: { width: `${clamp(Math.round(52 * shape), 12, 96)}px` }, draggable: !art, 'aria-label': `Picture ${i + 1}`, 'aria-pressed': String(slot.id === state.selected),
      onclick: () => { state.selected = slot.id; render(); },
      ondragstart: (event) => { dragged = slot; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(slot.id)); },
      ondragover: (event) => { if (dragged && dragged !== slot) event.preventDefault(); },
      ondrop: (event) => {
        if (!dragged || dragged === slot) return;
        event.preventDefault();
        event.stopPropagation();
        slots.splice(slots.indexOf(dragged), 1);
        const box = event.currentTarget.getBoundingClientRect();
        slots.splice(slots.indexOf(slot) + (event.clientX > box.left + box.width / 2 ? 1 : 0), 0, dragged);
        state.post.variant = null;
        render();
      },
    }, entry.pic ? frame(entry.pic, entry.rect, '', shape) : h('span', { class: 'frame is-empty' }), h('i', null, String(i + 1)));
  });
  const more = slots.length < LIMIT
    ? h('button', { type: 'button', class: 'thumb is-add', style: { width: '28px' }, 'aria-label': 'Add a place', onclick: addSlot }, h('span', { class: 'frame' }, '+'), h('i', null, ' '))
    : null;
  return h('div', { class: 'tray' }, thumbs, more);
}

function readout() {
  const { layout, ratios } = resolve(contentWidth(state.device));
  const count = state.post.slots.length;
  if (!layout) return null;
  if (layout.kind === 'single') return h('p', { class: 'readout' }, 'One picture keeps its own shape, up to 510 px tall.');

  const lines = [];
  if (!layout.scrolls) {
    lines.push(h('p', { class: 'readout is-good' }, layout.used > 0.985
      ? `All ${count} show at once, edge to edge.`
      : `All ${count} show at once. The row covers ${Math.round(layout.used * 100)}% of the width.`));
    const other = Object.keys(DEVICES).find((device) => device !== state.device);
    if (postLayout(ratios, contentWidth(other)).scrolls) {
      lines.push(h('p', { class: 'note' }, other === 'phone' ? 'On a phone the row is a little too wide and scrolls.' : 'On a computer the row scrolls.'));
    }
  } else {
    const shown = Math.floor(layout.inView * 10) / 10;
    lines.push(h('p', { class: 'readout is-warn' }, `${shown} of ${count} in view, the rest is a swipe away.`));
    lines.push(h('p', { class: 'note' }, count > 2
      ? `From three pictures up, X leaves the second one cut off as a hint to swipe. All show at once only as narrow strips whose width ÷ height add up to about 0.80. Now ${total(ratios).toFixed(2)}.`
      : 'Two pictures show side by side unless they are wide. Narrower shapes show both.'));
  }
  const trimmed = ratios.findIndex((ratio, i) => layout.items[i].aspect < ratio - 0.01);
  if (trimmed >= 0) lines.push(h('p', { class: 'note' }, `Picture ${trimmed + 1} loses its sides in the feed: one picture takes at most 80% of the width.`));
  if (count > 2 && (layout.scrolls || layout.used < 0.985)) {
    lines.push(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: fitAll }, 'Fit all in view')));
  }
  return h('div', { class: 'stack' }, lines);
}

// Named shapes with the size to make them at.
function formatList(slot) {
  const current = slotRatio(slot);
  const cells = FORMATS.map((format) => h('button', {
    type: 'button', class: `format ${slot.crop.ratio && formatOf(current) === format ? 'is-on' : ''}`, onclick: () => setRatio(slot, format.ratio),
  }, h('span', { class: 'shape' }, h('i', { style: { aspectRatio: String(format.ratio) } })), h('b', null, format.name, h('em', null, format.id)), h('small', null, `${format.size[0]} × ${format.size[1]}`)));
  if (slot.pic) {
    cells.push(h('button', { type: 'button', class: `format ${slot.crop.ratio ? '' : 'is-on'}`, onclick: () => setRatio(slot, null) },
      h('span', { class: 'shape' }, h('i', { style: { aspectRatio: String(slot.pic.w / slot.pic.h) } })), h('b', null, 'As it is'), h('small', null, `${slot.pic.w} × ${slot.pic.h}`)));
  }
  const wide = h('input', { id: 'own-width', type: 'number', min: 1, max: 4096, value: Math.round(current >= 1 ? 1200 : 1200 * current), 'aria-label': 'Width' });
  const tall = h('input', { id: 'own-height', type: 'number', min: 1, max: 4096, value: Math.round(current >= 1 ? 1200 / current : 1200), 'aria-label': 'Height' });
  const apply = () => { const w = Number(wide.value); const t = Number(tall.value); if (w > 0 && t > 0) setRatio(slot, clamp(w / t, 0.01, 20)); };
  return [
    h('div', { class: 'formats' }, cells),
    h('form', { class: 'own', onsubmit: (event) => { event.preventDefault(); apply(); } },
      h('span', { class: 'hint' }, 'Own size'), wide, h('span', null, '×'), tall, h('button', { type: 'submit', class: 'btn' }, 'Set')),
  ];
}

function slotEditor(slot) {
  const { slots } = state.post;
  const number = slots.indexOf(slot) + 1;
  const rect = slot.pic ? cropRect(slot.pic, slot.crop) : null;
  const size = rect ? `saves ${Math.round(rect.w)} × ${Math.round(rect.h)}` : ratioLabel(slotRatio(slot));
  const box = slot.pic ? cropbox({ pic: slot.pic, crop: slot.crop, onChange: renderStage }) : null;
  return section(`Picture ${number}`, size,
    formatList(slot),
    slots.length > 1 ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => { const ratio = slotRatio(slot); for (const other of slots) other.crop.ratio = ratio; state.post.variant = null; render(); } }, 'Use this shape for all')) : null,
    box ? h('div', { class: 'cropwrap' }, box.el) : null,
    box ? zoomSlider('zoom-picture', slot.crop, () => { box.redraw(); renderStage(); }) : null,
    h('div', { class: 'row' },
      filePicker(slot.pic ? 'Replace' : 'Choose a picture', { primary: !slot.pic, onFiles: (files) => addPictures(files.slice(0, 1), slot) }),
      slot.pic ? h('button', { type: 'button', class: 'btn', onclick: () => saveOne(slot) }, 'Download') : null,
      h('button', { type: 'button', class: 'btn', onclick: () => move(slot, -1), 'aria-label': 'Move earlier' }, '←'),
      h('button', { type: 'button', class: 'btn', onclick: () => move(slot, 1), 'aria-label': 'Move later' }, '→'),
      slots.length > 1 ? h('button', { type: 'button', class: 'btn is-quiet', onclick: () => removeSlot(slot) }, 'Remove') : null));
}

// One picture across the whole row: move it, zoom it, drag the cuts between pieces.
function artEditor() {
  const { art, slots } = state.post;
  const width = contentWidth(state.device);
  const span = (layout) => total(layout.items.map((item) => item.width)) + (art.seamless && layout.kind === 'row' ? GAP * (slots.length - 1) : 0);
  resolve(width);
  const box = cropbox({ pic: art.pic, crop: art.crop, height: 300, onChange: renderStage });
  let grips = [];
  const place = () => {
    const { layout } = resolve(width);
    const gap = art.seamless && layout.kind === 'row' ? GAP : 0;
    let x = 0;
    grips.forEach((line, i) => { x += layout.items[i].width + gap; line.style.left = `${((x - gap / 2) / span(layout)) * 100}%`; });
    box.redraw();
  };
  grips = slots.slice(0, -1).map((slot, i) => {
    const grip = h('b', { role: 'slider', 'aria-label': `Cut ${i + 1}`, tabindex: 0 });
    const shift = (by) => {
      const a = slotRatio(slots[i]);
      const b = slotRatio(slots[i + 1]);
      const step = clamp(by, 0.012 - a, b - 0.012);
      slots[i].crop.ratio = a + step;
      slots[i + 1].crop.ratio = b - step;
      state.post.variant = null;
      place();
      renderStage();
    };
    let done = 0;
    drag(grip, {
      cursor: 'ew-resize',
      start: () => { done = 0; return true; },
      move: (dx) => {
        const { layout } = resolve(width);
        const moved = (dx / box.el.getBoundingClientRect().width) * (span(layout) / layout.height);
        shift(moved - done);
        done = moved;
      },
      end: renderPanel,
    });
    grip.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      shift(event.key === 'ArrowLeft' ? -0.004 : 0.004);
    });
    return h('div', { class: 'cut' }, grip);
  });
  box.el.append(...grips);
  place();
  return section('One picture across the row', `${art.pic.w} × ${art.pic.h}`,
    h('p', { class: 'note' }, `This layout shows a ${ratioLabel(art.crop.ratio)} part of the picture. Drag the picture to move it${slots.length > 1 ? ', drag a grip to move a cut' : ''}.`),
    h('div', { class: 'cropwrap' }, box.el),
    zoomSlider('zoom-art', art.crop, () => { place(); renderStage(); }),
    slots.length > 1 ? h('label', { class: 'check' },
      h('input', { id: 'seamless', type: 'checkbox', checked: art.seamless, onchange: (event) => { art.seamless = event.target.checked; render(); } }),
      h('span', null, 'Carry the picture on behind the gaps')) : null,
    h('div', { class: 'row' },
      filePicker('Replace', { onFiles: setArt }),
      h('button', { type: 'button', class: 'btn is-quiet', onclick: () => { state.post.art = null; render(); } }, 'Take it off')));
}

function postPanel() {
  const { slots, art } = state.post;
  const slot = selectedSlot();
  const filled = art ? slots.length : slots.filter((one) => one.pic).length;
  return [
    gallery(),
    section('Pictures', `${slots.length} / ${LIMIT}`,
      tray(),
      h('div', { class: 'row' },
        filePicker('Add pictures', { multiple: true, primary: true, onFiles: (files) => addPictures(files) }),
        filePicker('One picture across all', { onFiles: setArt })),
      readout()),
    art ? artEditor() : null,
    slot && !art ? slotEditor(slot) : null,
    section('Text', null,
      h('textarea', { id: 'post-text', rows: 3, placeholder: 'What the post says', value: state.post.text, oninput: (event) => { state.post.text = event.target.value; renderStage(); remember(); } })),
    filled ? section('Files', null,
      h('button', { type: 'button', class: 'btn is-primary is-wide', onclick: saveAll }, filled > 1 ? `Download ${filled} pictures (.zip)` : 'Download the picture'),
      filled > 1 ? h('p', { class: 'note' }, 'Numbered in post order. Attach them to the post in the same order.') : null) : null,
  ];
}

// ---------- panel: profile ----------

function faceEditor(key, { title, size, ratio, height, mask }, extra = null) {
  const face = state.profile[key];
  const choose = async (files) => {
    const [pic] = await readFiles(files);
    if (!pic) return;
    state.profile[key] = { pic, crop: newCrop(ratio) };
    render();
  };
  if (!face) return section(title, size, h('div', { class: 'row' }, filePicker('Choose a picture', { primary: true, onFiles: choose })), extra);
  const box = cropbox({ pic: face.pic, crop: face.crop, height, mask, onChange: renderStage, drop: key });
  return section(title, size,
    h('div', { class: 'cropwrap' }, box.el),
    zoomSlider(`zoom-${key}`, face.crop, () => { box.redraw(); renderStage(); }),
    h('div', { class: 'row' },
      filePicker('Replace', { onFiles: choose }),
      h('button', { type: 'button', class: 'btn', onclick: () => saveFace(key) }, 'Download')),
    extra);
}

function field(id, label, key, placeholder, multiline = false) {
  const props = { id, placeholder, value: state.profile[key], oninput: (event) => { state.profile[key] = event.target.value; renderStage(); remember(); } };
  return h('label', { class: 'field' }, h('span', null, label), multiline ? h('textarea', { ...props, rows: 2 }) : h('input', { ...props, type: 'text', autocomplete: 'off' }));
}

function profilePanel() {
  const who = state.profile;
  return [
    faceEditor('avatar', { title: 'Avatar', size: '400 × 400', ratio: 1, height: 168, mask: who.shape === 'square' ? 'is-rounded' : 'is-round' },
      h('div', { class: 'row is-split' }, h('span', { class: 'hint' }, 'Shape'),
        seg('Avatar shape', who.shape, [['Circle', 'circle'], ['Square', 'square']], (shape) => { who.shape = shape; remember(); render(); }))),
    faceEditor('banner', { title: 'Banner', size: '1500 × 500', ratio: 3, height: 104 }),
    section('Words', null, field('profile-name', 'Name', 'name', 'Your name'), field('profile-handle', 'Handle', 'handle', 'handle'), field('profile-bio', 'Bio', 'bio', 'A line about you', true)),
  ];
}

// ---------- saving files ----------

const stamp = (i) => String(i + 1).padStart(2, '0');

function filesToSave() {
  const { slots, art } = state.post;
  const { rects } = resolve(contentWidth(state.device));
  return slots.map((slot, i) => ({ i, pic: art ? art.pic : slot.pic, rect: rects[i] })).filter((one) => one.pic);
}

async function saveOne(slot) {
  const i = state.post.slots.indexOf(slot);
  saveBlob(await rectToBlob(slot.pic, cropRect(slot.pic, slot.crop)), `pasteup-${stamp(i)}.png`);
}

async function saveAll() {
  const list = filesToSave();
  const empty = state.post.slots.length - list.length;
  try {
    if (list.length === 1) { saveBlob(await rectToBlob(list[0].pic, list[0].rect), `pasteup-${stamp(list[0].i)}.png`); return; }
    const files = [];
    for (const one of list) files.push({ name: `pasteup-${stamp(one.i)}.png`, blob: await rectToBlob(one.pic, one.rect) });
    saveBlob(await zip(files), 'pasteup-post.zip');
    toast(empty ? `${files.length} pictures saved. ${empty} empty ${empty > 1 ? 'places were' : 'place was'} skipped.` : `${files.length} pictures saved, numbered in post order.`);
  } catch (error) { toast(error.message); }
}

async function saveFace(key) {
  const face = state.profile[key];
  const size = key === 'avatar' ? { w: 400, h: 400 } : { w: 1500, h: 500 };
  try { saveBlob(await rectToBlob(face.pic, cropRect(face.pic, face.crop), size), `pasteup-${key}.png`); } catch (error) { toast(error.message); }
}

// ---------- drawing ----------

function fill(el, parts) {
  const keep = el.scrollTop;
  el.replaceChildren(...parts.flat(Infinity).filter(Boolean));
  el.scrollTop = keep;
}

function renderPanel() {
  const split = state.mode === 'post' && roomy.matches;
  desk.classList.toggle('has-tools', split);
  tools.hidden = !split;
  if (state.mode === 'sizes') { fill(panel, []); fill(tools, []); return; }
  if (state.mode === 'profile') { fill(panel, profilePanel()); fill(tools, []); return; }
  const [layouts, ...rest] = postPanel();
  fill(panel, split ? [layouts] : [layouts, rest]);
  fill(tools, split ? rest : []);
}

function renderStage() {
  desk.classList.toggle('is-sheet', state.mode === 'sizes');
  if (state.mode === 'sizes') { stage.replaceChildren(sizeSheet()); return; }
  const themes = state.theme === 'both' ? ['dark', 'light'] : [state.theme];
  const view = viewFor(state.device);
  const columns = themes.map((theme) => column({ theme, device: state.device, mode: state.mode, view, memo: memos[theme] }));
  const board = h('div', { class: 'board' }, columns.map((one, i) =>
    h('figure', { class: 'sheet' }, one.el, themes.length > 1 ? h('figcaption', null, themes[i]) : null)));
  stage.replaceChildren(board);
  fitStage();
  columns.forEach((one) => one.mount());
}

function fitStage() {
  const board = stage.querySelector('.board');
  if (!board) return;
  board.style.zoom = '1';
  board.style.zoom = String(Math.min(1, (stage.clientWidth - 48) / board.scrollWidth));
}

function renderBar() {
  const set = (key) => (value) => { state[key] = value; remember(); render(); };
  document.getElementById('modes').replaceChildren(seg('View', state.mode, [['Post', 'post'], ['Profile', 'profile'], ['Sizes', 'sizes']], set('mode')));
  const switches = document.getElementById('switches');
  switches.hidden = state.mode === 'sizes';
  switches.replaceChildren(
    seg('Theme', state.theme, [['Dark', 'dark'], ['Light', 'light'], ['Both', 'both']], set('theme')),
    seg('Screen', state.device, [['Computer', 'desktop'], ['Phone', 'phone']], set('device')));
}

function render() {
  renderBar();
  renderPanel();
  renderStage();
}

// ---------- the page ----------

// Drag the avatar or the banner right in the preview.
stage.addEventListener('pointerdown', (down) => {
  const target = down.target.closest('[data-pan]');
  if (!target || down.button !== 0) return;
  const face = state.profile[target.dataset.pan];
  down.preventDefault();
  const size = target.getBoundingClientRect();
  let last = [down.clientX, down.clientY];
  const onMove = (event) => {
    panCrop(face.pic, face.crop, (event.clientX - last[0]) / size.width, (event.clientY - last[1]) / size.height);
    last = [event.clientX, event.clientY];
    renderStage();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    renderPanel();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
});

stage.addEventListener('click', (event) => {
  const target = event.target.closest('[data-item]');
  if (!target || state.mode !== 'post') return;
  state.selected = Number(target.dataset.item);
  renderPanel();
});

window.addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
window.addEventListener('drop', async (event) => {
  const files = [...event.dataTransfer.files];
  if (!files.length) return;
  event.preventDefault();
  if (state.mode === 'sizes') return;
  if (state.mode === 'post') {
    // a picture dropped on a place in the preview goes into that place
    const place = state.post.slots.find((slot) => slot.id === Number(event.target.closest?.('[data-item]')?.dataset.item));
    addPictures(files, files.length === 1 ? place : null);
    return;
  }
  const key = event.target.closest?.('[data-drop]')?.dataset.drop || event.target.closest?.('[data-face]')?.dataset.face;
  if (!key) { toast('Drop the picture on the avatar or on the banner.'); return; }
  const [pic] = await readFiles(files);
  if (!pic) return;
  state.profile[key] = { pic, crop: newCrop(key === 'avatar' ? 1 : 3) };
  render();
});

window.addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (files.length && state.mode === 'post') addPictures(files);
});

window.addEventListener('resize', fitStage);
roomy.addEventListener('change', render);

restore();
state.post.slots = variants(4, contentWidth(state.device))[0].ratios.map(newSlot);
state.selected = state.post.slots[0].id;
render();

// for checks from the console
window.PU = { state, resolve, viewFor, render, addPictures, setArt, setCount, applyVariant, fitAll, variants };
