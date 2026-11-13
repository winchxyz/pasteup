import { h, icon, drag } from './dom.js';
import { postLayout, GAP } from './layout.js';
import { clamp, loadPic, newCrop, cropRect, panCrop, artRects, showRect, rectToBlob, savedSize, saveBlob, nextId } from './pics.js';
import { column, viewer, contentWidth, innerWidth, frame, DEVICES } from './preview.js';
import { FORMATS, formatOf, ratioLabel, variants, fullHeightSum } from './variants.js';
import { sizeSheet } from './sizes.js';
import { zip } from './zip.js';

const LIMIT = 20; // pictures in one post on X since November 2026
const HEAVY = 5 * 1024 * 1024; // the largest picture file X takes
const STORE = 'pasteup.v2';
const OWN = 'pasteup.layouts';

const state = {
  mode: 'post',
  look: 'feed',   // the post in the feed, or one picture opened
  theme: 'dark',
  device: 'desktop',
  focus: false,   // side panels put away
  profile: { name: '', handle: '', bio: '', shape: 'circle', avatar: null, banner: null },
  // a post is a row of places; each has a shape and, once filled, its own picture.
  // `art` is one picture spread over all of them instead.
  post: { text: '', slots: [], art: null, variant: 'strips', gallery: true, save: { size: 'format', type: 'png' } },
  selected: null,
  lifted: null,   // the place being carried to a new spot in the preview
};
let own = []; // layouts the visitor saved: [{ id, ratios }]

const $ = (id) => document.getElementById(id);
const desk = $('desk');
const stage = $('stage');
const panel = $('panel');
const tools = $('tools');
const backdrop = $('backdrop');
const memos = { dark: {}, light: {} };
// with room to spare the layouts sit left of the preview and the picture controls right of it
const roomy = window.matchMedia('(min-width: 1240px)');
const stacked = window.matchMedia('(max-width: 860px)');

const ICON = {
  post: '<path d="M6 4v10M12 4v16M18 4v7" stroke-width="2.6"/>',
  profile: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.7-3.6 3.4-5.5 7-5.5s6.300 1.900 7 5.5"/>',
  sizes: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3"/>',
  wider: '<path d="m7 7 5 5-5 5M13 7l5 5-5 5"/>',
  closer: '<path d="m17 7-5 5 5 5M11 7l-5 5 5 5"/>',
  add: '<path d="M12 16V5M8 9l4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
  down: '<path d="M12 4v11M8 11l4 4 4-4M5 19h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="M10 3.5 11.600 8 16 9.500 11.600 11 10 15.500 8.400 11 4 9.500 8.400 8ZM17.500 14l.9 2.100 2.100.9-2.100.9-.9 2.100-.9-2.100-2.100-.9 2.100-.9Z"/>',
  bin: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
};

// ---------- saved between visits: words, switches and own layouts, never pictures ----------

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) {
      for (const key of ['mode', 'theme', 'device']) if (typeof saved[key] === 'string') state[key] = saved[key];
      for (const key of ['name', 'handle', 'bio', 'shape']) if (typeof saved[key] === 'string') state.profile[key] = saved[key];
      if (typeof saved.text === 'string') state.post.text = saved.text;
      if (saved.size === 'format' || saved.size === 'source') state.post.save.size = saved.size;
      if (saved.type === 'png' || saved.type === 'jpg') state.post.save.type = saved.type;
    }
    const layouts = JSON.parse(localStorage.getItem(OWN) || '[]');
    own = layouts.filter((one) => one && typeof one.id === 'string' && Array.isArray(one.ratios) && one.ratios.every((ratio) => ratio > 0));
  } catch { /* storage is a convenience */ }
}

function remember() {
  try {
    const { name, handle, bio, shape } = state.profile;
    const { size, type } = state.post.save;
    localStorage.setItem(STORE, JSON.stringify({ mode: state.mode, theme: state.theme, device: state.device, name, handle, bio, shape, text: state.post.text, size, type }));
    localStorage.setItem(OWN, JSON.stringify(own));
  } catch { /* same */ }
}

// ---------- the post ----------

const newSlot = (ratio) => ({ id: nextId(), pic: null, crop: newCrop(ratio), size: null });
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
    ratios,
  };
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-on'), 5200);
}

async function readFiles(files) {
  const pics = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try { pics.push(await loadPic(file, file.name)); } catch (error) { toast(error.message); }
  }
  return pics;
}

// One file chooser for the whole page.
const chooser = h('input', { type: 'file', accept: 'image/*', hidden: true });
let chosen = null;
chooser.addEventListener('change', () => {
  const files = [...chooser.files];
  chooser.value = '';
  if (files.length && chosen) chosen(files);
});
document.body.append(chooser);

function choose(multiple, then) {
  chooser.multiple = multiple;
  chosen = then;
  chooser.click();
}

// Use a ready layout: keep the pictures already placed, change the shapes around them.
function applyVariant(variant) {
  const old = state.post.slots;
  state.post.slots = variant.ratios.map((ratio, i) => {
    const slot = old[i] || newSlot(ratio);
    slot.crop.ratio = ratio;
    slot.size = null;
    return slot;
  });
  state.post.variant = variant.id;
  if (!state.post.slots.some((slot) => slot.id === state.selected)) state.selected = state.post.slots[0].id;
  render();
}

const ownFor = (count) => own.filter((one) => one.ratios.length === count).map((one, i) => ({ ...one, name: `Own ${i + 1}`, own: true }));
const layoutsFor = (count, width) => [...ownFor(count), ...variants(count, width)];

function setCount(count) {
  const list = layoutsFor(count, contentWidth(state.device));
  applyVariant(list.find((variant) => variant.id === state.post.variant) || list.find((variant) => !variant.own));
}

function keepLayout() {
  const one = { id: `own-${Date.now().toString(36)}`, ratios: state.post.slots.map(slotRatio) };
  own.push(one);
  state.post.variant = one.id;
  remember();
  render();
  toast('Saved. It stays with your layouts on this computer.');
}

function dropLayout(id) {
  own = own.filter((one) => one.id !== id);
  if (state.post.variant === id) state.post.variant = null;
  remember();
  render();
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

// size: the pixels to save at when they were asked for by hand, as { w, h }
function setRatio(slot, ratio, size = null) {
  slot.crop.ratio = ratio;
  slot.size = size;
  state.post.variant = null;
  render();
}

// From three pictures up they all show at once only as narrow strips at full height.
// Keep how wide they are next to each other and narrow the whole set until it fits.
function fitAll() {
  const { slots } = state.post;
  const ratios = slots.map(slotRatio);
  const scale = fullHeightSum(slots.length, contentWidth(state.device)) / total(ratios);
  slots.forEach((slot, i) => { slot.crop.ratio = ratios[i] * scale; slot.size = null; });
  state.post.variant = null;
  render();
}

const selectedSlot = () => state.post.slots.find((slot) => slot.id === state.selected) || null;

// Changing the row right in the preview: pull a border, carry a picture.
let pulled = null;
const edit = {
  get picked() { return state.selected; },
  get lifted() { return state.lifted; },
  edge(i, phase, dx) {
    const { slots } = state.post;
    if (phase === 'start') {
      const { layout } = resolve(contentWidth(state.device));
      pulled = { a: slotRatio(slots[i]), b: slotRatio(slots[i + 1]), height: layout.height };
      return;
    }
    if (phase === 'end') { pulled = null; render(); return; }
    const step = clamp(dx / pulled.height, 0.012 - pulled.a, pulled.b - 0.012);
    slots[i].crop.ratio = pulled.a + step;
    slots[i + 1].crop.ratio = pulled.b - step;
    slots[i].size = null;
    slots[i + 1].size = null;
    state.post.variant = null;
    renderStage();
  },
  lift(id, x, y) {
    const { slots } = state.post;
    const first = state.lifted !== id;
    state.lifted = id;
    const under = document.elementFromPoint(x, y)?.closest?.('[data-item]');
    const from = slots.findIndex((slot) => slot.id === id);
    const to = under ? slots.findIndex((slot) => slot.id === Number(under.dataset.item)) : -1;
    let changed = false;
    if (to >= 0 && to !== from) {
      const box = under.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      // only once the pointer is past the middle of the neighbour, so the two do not swap back and forth
      if ((to < from && x < middle) || (to > from && x > middle)) {
        const [carried] = slots.splice(from, 1);
        slots.splice(to, 0, carried);
        state.post.variant = null;
        changed = true;
      }
    }
    if (first || changed) renderStage();
  },
  drop() { state.selected = state.lifted || state.selected; state.lifted = null; render(); },
};

// ---------- small controls ----------

const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(Boolean));

function seg(name, value, options, onPick) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': name }, options.map(([label, key]) =>
    h('button', { type: 'button', class: key === value ? 'is-on' : '', 'aria-pressed': String(key === value), onclick: () => onPick(key) }, label)));
}

function button(label, onclick, { kind = '', glyph = null, title = null } = {}) {
  return h('button', { type: 'button', class: `btn ${kind}`, title, onclick }, glyph ? icon(glyph, 18) : null, label);
}

function section(title, aside, ...kids) {
  return h('section', { class: 'block' }, h('header', null, h('h2', null, title), aside != null ? h('span', { class: 'aside' }, aside) : null), kids);
}

function zoomSlider(id, crop, onInput) {
  return h('label', { class: 'slider' }, h('span', null, 'Zoom'),
    h('input', { id, type: 'range', min: 1, max: 5, step: 0.01, value: crop.zoom, oninput: (event) => { crop.zoom = Number(event.target.value); onInput(); } }));
}

// A frame you drag the picture around in. Returns the element and a way to redraw it.
// trim() tells how much of each side the feed cuts off, as shares of the frame: { side, cap }.
function cropbox({ pic, crop, height = 220, mask = '', onChange, drop, trim = null, over = null }) {
  const img = h('img', { src: pic.url, alt: '', draggable: false });
  const dims = trim ? ['is-left', 'is-right', 'is-top', 'is-bottom'].map((name) => h('i', { class: `trim ${name}` })) : [];
  const box = h('div', { class: `cropbox ${mask}`, 'data-drop': drop || null }, img, dims, over);
  const redraw = () => {
    const rect = cropRect(pic, crop);
    box.style.aspectRatio = String(rect.w / rect.h);
    box.style.width = `${Math.round(height * (rect.w / rect.h))}px`;
    showRect(img, pic, rect);
    if (trim) {
      const { side, cap } = trim();
      dims[0].style.width = dims[1].style.width = `${side * 100}%`;
      dims[2].style.height = dims[3].style.height = `${cap * 100}%`;
    }
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
function miniRow(ratios, width, size = 72) {
  const layout = postLayout(ratios, width);
  const scale = size / width;
  return h('div', { class: `mini ${layout.scrolls ? 'is-scrolling' : ''}`, style: { width: `${size}px`, height: `${Math.max(8, layout.height * scale)}px` } },
    layout.items.map((item) => h('i', { style: { width: `${Math.max(1, (item.width + GAP) * scale - 1)}px` } })));
}

// ---------- panel: post ----------

function gallery() {
  const { slots, variant, gallery: open } = state.post;
  const width = contentWidth(state.device);
  const list = layoutsFor(slots.length || 1, width);
  const shown = open || roomy.matches;
  const toggle = roomy.matches ? null : h('button', { type: 'button', class: 'link', onclick: () => { state.post.gallery = !open; renderPanel(); } }, open ? 'Hide' : 'Show');
  const head = h('header', null, h('h2', null, 'Layout', h('span', { class: 'badge' }, String(list.length))), toggle);
  if (!shown) return h('section', { class: 'block' }, head);
  const counts = h('div', { class: 'counts', role: 'group', 'aria-label': 'Number of pictures' }, Array.from({ length: LIMIT }, (_, i) =>
    h('button', { type: 'button', class: i + 1 === slots.length ? 'is-on' : '', 'aria-pressed': String(i + 1 === slots.length), onclick: () => setCount(i + 1) }, String(i + 1))));
  const cards = list.map((one) => {
    const layout = postLayout(one.ratios, width);
    const card = h('button', { type: 'button', class: `variant ${one.id === variant ? 'is-on' : ''}`, 'aria-pressed': String(one.id === variant), onclick: () => applyVariant(one) },
      h('span', { class: 'variant-view' }, miniRow(one.ratios, width)),
      h('b', null, one.name),
      h('small', null, layout.kind === 'single' ? 'one picture' : layout.scrolls ? 'swipe' : 'all in view'));
    if (!one.own) return card;
    return h('div', { class: 'variant-own' }, card,
      h('button', { type: 'button', class: 'variant-drop', 'aria-label': `Delete ${one.name}`, title: 'Delete this layout', onclick: () => dropLayout(one.id) }, icon(ICON.bin, 14)));
  });
  // a row changed by hand can be kept next to the ready ones
  const keep = variant === null
    ? h('button', { type: 'button', class: 'variant is-new', onclick: keepLayout }, h('span', { class: 'variant-view' }, icon(ICON.plus, 22)), h('b', null, 'Save this layout'), h('small', null, 'yours'))
    : null;
  return h('section', { class: 'block' }, head,
    h('p', { class: 'note' }, 'How many pictures, then how they sit in the feed.'),
    counts,
    h('div', { class: 'variants' }, keep, cards));
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
    ? h('button', { type: 'button', class: 'thumb is-add', style: { width: '28px' }, 'aria-label': 'Add a place', title: 'Add a place', onclick: addSlot }, h('span', { class: 'frame' }, '+'), h('i', null, ' '))
    : null;
  return h('div', { class: 'tray' }, thumbs, more);
}

// What the feed does with the row, in words.
function standing() {
  const { layout, ratios } = resolve(contentWidth(state.device));
  const count = state.post.slots.length;
  if (!layout) return null;
  if (layout.kind === 'single') return { tone: 'plain', line: 'One picture keeps its own shape, up to 510 px tall.', notes: [] };
  const notes = [];
  let tone = 'good';
  let line;
  let short;
  if (!layout.scrolls) {
    short = `All ${count} in view`;
    line = layout.used > 0.985 ? `All ${count} show at once, edge to edge.` : `All ${count} show at once. The row covers ${Math.round(layout.used * 100)}% of the width.`;
    const other = Object.keys(DEVICES).find((device) => device !== state.device);
    if (postLayout(ratios, contentWidth(other)).scrolls) notes.push(other === 'phone' ? 'On a phone the row is a little too wide and scrolls.' : 'On a computer the row scrolls.');
  } else {
    tone = 'warn';
    const shown = Math.floor(layout.inView * 10) / 10;
    short = `${shown} of ${count} in view`;
    line = `${shown} of ${count} in view, the rest is a swipe away.`;
    notes.push(count > 2
      ? `From three pictures up, X leaves the second one cut off as a hint to swipe. All show at once only as narrow strips whose width ÷ height add up to about 0.80. Now ${total(ratios).toFixed(2)}.`
      : 'Two pictures show side by side unless they are wide. Narrower shapes show both.');
  }
  const trimmed = ratios.findIndex((ratio, i) => layout.items[i].aspect < ratio - 0.01);
  if (trimmed >= 0) notes.push(`Picture ${trimmed + 1} loses its sides in the feed: one picture takes at most 80% of the width.`);
  return { tone, line, short, notes, canFit: count > 2 && (layout.scrolls || layout.used < 0.985) };
}

function readout() {
  const now = standing();
  if (!now) return null;
  return h('div', { class: 'stack' }, h('p', { class: `readout is-${now.tone}` }, now.line), now.notes.map((note) => h('p', { class: 'note' }, note)));
}

// The floating line under the preview: the state of the row, or the way to fix it.
function statusPill() {
  const now = standing();
  if (!now || !now.short) return null;
  if (now.canFit) return h('button', { type: 'button', class: 'status is-action', onclick: fitAll }, icon(ICON.spark, 18), 'Fit all in view');
  return h('div', { class: `status is-${now.tone}` }, h('i'), now.short);
}

// The pixels a picture is saved at, when the format or the visitor names them.
function askedSize(slot) {
  if (state.post.save.size !== 'format' || !slot.crop.ratio) return null;
  if (slot.size && Math.abs(slot.size.w / slot.size.h - slot.crop.ratio) < 0.004) return slot.size;
  const format = formatOf(slot.crop.ratio);
  return format ? { w: format.size[0], h: format.size[1] } : null;
}

// Named shapes with the size to make them at.
function formatList(slot) {
  const current = slotRatio(slot);
  const cells = FORMATS.map((format) => h('button', {
    type: 'button', class: `format ${slot.crop.ratio && formatOf(current) === format ? 'is-on' : ''}`, onclick: () => setRatio(slot, format.ratio),
  }, h('span', { class: 'shape' }, h('i', { style: { aspectRatio: String(format.ratio) } })), h('b', null, format.name), h('em', null, format.id), h('small', null, `${format.size[0]} × ${format.size[1]}`)));
  if (slot.pic) {
    cells.push(h('button', { type: 'button', class: `format ${slot.crop.ratio ? '' : 'is-on'}`, onclick: () => setRatio(slot, null) },
      h('span', { class: 'shape' }, h('i', { style: { aspectRatio: String(slot.pic.w / slot.pic.h) } })), h('b', null, 'As it is'), h('em', null, ratioLabel(slot.pic.w / slot.pic.h)), h('small', null, `${slot.pic.w} × ${slot.pic.h}`)));
  }
  const start = slot.size || { w: Math.round(current >= 1 ? 1200 : 1200 * current), h: Math.round(current >= 1 ? 1200 / current : 1200) };
  const wide = h('input', { id: 'own-width', type: 'number', min: 1, max: 4096, value: start.w, 'aria-label': 'Width' });
  const tall = h('input', { id: 'own-height', type: 'number', min: 1, max: 4096, value: start.h, 'aria-label': 'Height' });
  const apply = () => {
    const w = Math.round(Number(wide.value));
    const t = Math.round(Number(tall.value));
    if (w > 0 && t > 0) setRatio(slot, clamp(w / t, 0.01, 20), { w, h: t });
  };
  return [
    h('div', { class: 'formats' }, cells),
    h('form', { class: 'own', onsubmit: (event) => { event.preventDefault(); apply(); } },
      h('span', { class: 'hint' }, 'Own size'), wide, h('span', null, '×'), tall, h('button', { type: 'submit', class: 'btn' }, 'Set')),
  ];
}

function slotEditor(slot) {
  const { slots } = state.post;
  const at = slots.indexOf(slot);
  const rect = slot.pic ? cropRect(slot.pic, slot.crop) : null;
  const saved = rect ? savedSize(rect, askedSize(slot)) : null;
  const stretched = saved && saved.w > rect.w * 1.02;
  // the feed shows less than the file when it trims the picture
  const trim = () => {
    const { layout } = resolve(contentWidth(state.device));
    const shown = layout.items[slots.indexOf(slot)].aspect;
    const ratio = slotRatio(slot);
    if (shown < ratio - 0.005) return { side: (1 - shown / ratio) / 2, cap: 0 };
    if (shown > ratio + 0.005) return { side: 0, cap: (1 - ratio / shown) / 2 };
    return { side: 0, cap: 0 };
  };
  const cut = trim();
  const box = slot.pic ? cropbox({ pic: slot.pic, crop: slot.crop, onChange: renderStage, trim }) : null;
  return section(`Picture ${at + 1}`, saved ? `saves ${saved.w} × ${saved.h}` : ratioLabel(slotRatio(slot)),
    formatList(slot),
    box ? h('div', { class: 'cropwrap' }, box.el) : null,
    box ? zoomSlider('zoom-picture', slot.crop, () => { box.redraw(); renderStage(); }) : null,
    box && (cut.side || cut.cap) ? h('p', { class: 'note' }, 'The dimmed part is cut off in the feed. It shows when the picture is opened.') : null,
    stretched ? h('p', { class: 'note' }, `This part of the picture is ${Math.round(rect.w)} × ${Math.round(rect.h)}, so it is stretched to reach the size.`) : null,
    h('div', { class: 'row' },
      button(slot.pic ? 'Replace' : 'Choose a picture', () => choose(false, (files) => addPictures(files.slice(0, 1), slot)), { kind: slot.pic ? '' : 'is-primary' }),
      slot.pic ? button('Download', () => saveOne(slot)) : null,
      h('button', { type: 'button', class: 'btn is-square', onclick: () => move(slot, -1), 'aria-label': 'Move earlier', title: 'Move earlier' }, '←'),
      h('button', { type: 'button', class: 'btn is-square', onclick: () => move(slot, 1), 'aria-label': 'Move later', title: 'Move later' }, '→')),
    slots.length > 1 ? h('div', { class: 'row' },
      button('Use this shape for all', () => { const ratio = slotRatio(slot); for (const other of slots) { other.crop.ratio = ratio; other.size = slot.size; } state.post.variant = null; render(); }),
      button('Remove', () => removeSlot(slot), { kind: 'is-quiet' })) : null);
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
      button('Replace', () => choose(false, setArt)),
      button('Take it off', () => { state.post.art = null; render(); }, { kind: 'is-quiet' })));
}

function savingBlock() {
  const { save } = state.post;
  const list = filesToSave();
  if (!list.length) return null;
  const set = (key) => (value) => { save[key] = value; remember(); render(); };
  return section('Saving', `${list.length} ${list.length > 1 ? 'files' : 'file'}`,
    h('div', { class: 'row is-split' }, h('span', { class: 'hint' }, 'Size'), seg('Size of the files', save.size, [['Format size', 'format'], ['As loaded', 'source']], set('size'))),
    h('div', { class: 'row is-split' }, h('span', { class: 'hint' }, 'File'), seg('Kind of file', save.type, [['PNG', 'png'], ['JPG', 'jpg']], set('type'))),
    h('p', { class: 'note' }, save.size === 'format'
      ? 'A picture with a named format or an own size is saved at exactly that size. Strips and other shapes keep the pixels of the picture.'
      : 'Every picture keeps its own pixels.',
    ' X takes up to 5 MB a picture; JPG is the lighter one.'));
}

function postPanel() {
  const { slots, art } = state.post;
  const slot = selectedSlot();
  return [
    gallery(),
    section('Pictures', `${slots.length} / ${LIMIT}`,
      tray(),
      h('div', { class: 'row' },
        button('Add pictures', () => choose(true, (files) => addPictures(files))),
        button('One picture across all', () => choose(false, setArt))),
      readout()),
    art ? artEditor() : null,
    slot && !art ? slotEditor(slot) : null,
    section('Text', null,
      h('textarea', { id: 'post-text', rows: 3, placeholder: 'What the post says', value: state.post.text, oninput: (event) => { state.post.text = event.target.value; renderStage(); remember(); } })),
    savingBlock(),
  ];
}

// ---------- panel: profile ----------

// Where the avatar lands on the banner, as shares of the banner's width.
function avatarMark() {
  const inner = innerWidth(state.device);
  return h('i', { class: `avatar-mark ${state.profile.shape === 'square' ? 'is-square' : ''}`, style: { left: `${(16 / inner) * 100}%`, width: `${(((inner - 32) * 0.25) / inner) * 100}%` } });
}

function faceEditor(key, { title, size, ratio, height, mask, over = null, note = null }, extra = null) {
  const face = state.profile[key];
  const take = async (files) => {
    const [pic] = await readFiles(files);
    if (!pic) return;
    state.profile[key] = { pic, crop: newCrop(ratio) };
    render();
  };
  if (!face) return section(title, size, h('div', { class: 'row' }, button('Choose a picture', () => choose(false, take), { kind: 'is-primary' })), extra);
  const box = cropbox({ pic: face.pic, crop: face.crop, height, mask, onChange: renderStage, drop: key, over });
  return section(title, size,
    h('div', { class: 'cropwrap' }, box.el),
    zoomSlider(`zoom-${key}`, face.crop, () => { box.redraw(); renderStage(); }),
    note ? h('p', { class: 'note' }, note) : null,
    h('div', { class: 'row' },
      button('Replace', () => choose(false, take)),
      button('Download', () => saveFace(key))),
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
    faceEditor('banner', { title: 'Banner', size: '1500 × 500', ratio: 3, height: 96, over: avatarMark(), note: 'The dashed mark is where the avatar covers the banner.' }),
    section('Words', null, field('profile-name', 'Name', 'name', 'Your name'), field('profile-handle', 'Handle', 'handle', 'handle'), field('profile-bio', 'Bio', 'bio', 'A line about you', true)),
  ];
}

// ---------- saving files ----------

const stamp = (i) => String(i + 1).padStart(2, '0');
const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

function filesToSave() {
  const { slots, art } = state.post;
  const { rects } = resolve(contentWidth(state.device));
  return slots.map((slot, i) => ({ i, pic: art ? art.pic : slot.pic, rect: rects[i], size: art ? null : askedSize(slot) })).filter((one) => one.pic);
}

async function render1(one) {
  const { type } = state.post.save;
  return { name: `pasteup-${stamp(one.i)}.${type}`, number: one.i + 1, blob: await rectToBlob(one.pic, one.rect, one.size, type) };
}

function weigh(files) {
  const heavy = files.filter((file) => file.blob.size > HEAVY);
  if (!heavy.length) return null;
  const names = heavy.length > 3 ? `${heavy.length} pictures are` : `Picture ${heavy.map((file) => file.number).join(', ')} ${heavy.length > 1 ? 'are' : `is ${megabytes(heavy[0].blob.size)},`}`;
  return `${names} over the 5 MB X takes. ${state.post.save.type === 'png' ? 'Save as JPG to make them lighter.' : 'Pick a smaller size.'}`;
}

async function saveOne(slot) {
  const i = state.post.slots.indexOf(slot);
  try {
    const file = await render1({ i, pic: slot.pic, rect: cropRect(slot.pic, slot.crop), size: askedSize(slot) });
    saveBlob(file.blob, file.name);
    const warning = weigh([file]);
    if (warning) toast(warning);
  } catch (error) { toast(error.message); }
}

async function saveAll() {
  const list = filesToSave();
  if (!list.length) { toast('Add a picture first.'); return; }
  const empty = state.post.slots.length - list.length;
  try {
    const files = [];
    for (const one of list) files.push(await render1(one));
    if (files.length === 1) saveBlob(files[0].blob, files[0].name);
    else saveBlob(await zip(files), 'pasteup-post.zip');
    const done = files.length === 1 ? 'Saved.'
      : empty ? `${files.length} pictures saved. ${empty} empty ${empty > 1 ? 'places were' : 'place was'} skipped.`
        : `${files.length} pictures saved, numbered in post order.`;
    toast([weigh(files), done].filter(Boolean).reverse().join(' '));
  } catch (error) { toast(error.message); }
}

async function saveFace(key) {
  const face = state.profile[key];
  const size = key === 'avatar' ? { w: 400, h: 400 } : { w: 1500, h: 500 };
  try { saveBlob(await rectToBlob(face.pic, cropRect(face.pic, face.crop), size), `pasteup-${key}.png`); } catch (error) { toast(error.message); }
}

async function saveFaces() {
  const keys = ['avatar', 'banner'].filter((key) => state.profile[key]);
  if (!keys.length) { toast('Choose an avatar or a banner first.'); return; }
  for (const key of keys) await saveFace(key);
}

// ---------- drawing ----------

function fill(el, parts) {
  const keep = el.scrollTop;
  put(el, parts);
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
  desk.classList.toggle('is-focus', state.focus && state.mode !== 'sizes');
  if (state.mode === 'sizes') { put(stage, h('div', { class: 'scroll' }, sizeSheet())); return; }
  const view = viewFor(state.device);
  const opened = state.mode === 'post' && state.look === 'open' && view.layout;
  let sheets;
  let columns = [];
  if (opened) {
    const { slots } = state.post;
    const at = Math.max(0, slots.findIndex((slot) => slot.id === state.selected));
    const onStep = (by) => { state.selected = slots[at + by].id; render(); };
    sheets = [h('figure', { class: 'sheet' }, viewer({ device: state.device, view, at, onStep }), h('figcaption', { 'data-label': `Opened · ${at + 1} of ${slots.length}` }))];
  } else {
    const themes = state.theme === 'both' ? ['dark', 'light'] : [state.theme];
    columns = themes.map((theme) => column({ theme, device: state.device, mode: state.mode, view, memo: memos[theme], edit }));
    sheets = columns.map((one, i) => h('figure', { class: 'sheet' }, one.el, h('figcaption', { 'data-label': themes.length > 1 ? themes[i] : '' })));
  }
  const old = stage.querySelector('.scroll');
  const keep = old ? [old.scrollLeft, old.scrollTop] : [0, 0];
  const scroll = h('div', { class: 'scroll' }, h('div', { class: 'board' }, sheets));
  put(stage, scroll, state.mode === 'post' && !opened ? statusPill() : null);
  fitStage();
  scroll.scrollLeft = keep[0];
  scroll.scrollTop = keep[1];
  columns.forEach((one) => one.mount());
}

// Shrink the preview until the whole of it is in view; say so under it.
function fitStage() {
  const scroll = stage.querySelector('.scroll');
  const board = scroll && scroll.querySelector('.board');
  if (!board) return;
  board.style.zoom = '1';
  const wide = (scroll.clientWidth - 16) / board.scrollWidth;
  // a post is shrunk a little to show whole; a profile is long by nature and scrolls
  const tall = stacked.matches || state.mode !== 'post' ? 1 : Math.max(0.72, (scroll.clientHeight - 84) / board.scrollHeight);
  const zoom = clamp(Math.min(1, wide, tall), 0.4, 1);
  board.style.zoom = String(zoom);
  for (const caption of board.querySelectorAll('figcaption')) {
    caption.textContent = [caption.dataset.label, zoom < 0.995 ? `${Math.round(zoom * 100)}%` : ''].filter(Boolean).join(' · ');
  }
}

function renderBar() {
  const set = (key) => (value) => { state[key] = value; remember(); render(); };
  const opened = state.mode === 'post' && state.look === 'open';
  put($('modes'), [['Post', 'post', ICON.post], ['Profile', 'profile', ICON.profile], ['Sizes', 'sizes', ICON.sizes]].map(([label, key, glyph]) =>
    h('button', { type: 'button', class: `rail-btn ${state.mode === key ? 'is-on' : ''}`, title: label, 'aria-label': label, 'aria-pressed': String(state.mode === key), onclick: () => set('mode')(key) }, icon(glyph, 22))));
  put($('rail-foot'), state.mode === 'sizes' ? null : h('button', {
    type: 'button', class: 'rail-btn', title: state.focus ? 'Show the panels' : 'Hide the panels', 'aria-label': state.focus ? 'Show the panels' : 'Hide the panels', 'aria-pressed': String(state.focus),
    onclick: () => { state.focus = !state.focus; render(); },
  }, icon(state.focus ? ICON.closer : ICON.wider, 20)));
  put($('title'), h('h1', null, { post: 'Post', profile: 'Profile', sizes: 'Sizes' }[state.mode]),
    state.mode === 'post' ? seg('What to show', state.look, [['Feed', 'feed'], ['Opened', 'open']], set('look')) : null);
  put($('switches'), state.mode === 'sizes' ? null : [
    opened ? null : seg('Theme', state.theme, [['Dark', 'dark'], ['Light', 'light'], ['Both', 'both']], set('theme')),
    seg('Screen', state.device, [['Computer', 'desktop'], ['Phone', 'phone']], set('device'))]);
  put($('actions'),
    state.mode === 'post' ? button('Add pictures', () => choose(true, (files) => addPictures(files)), { kind: 'is-ghost', glyph: ICON.add }) : null,
    state.mode === 'post' ? button('Download', saveAll, { kind: 'is-white', glyph: ICON.down }) : null,
    state.mode === 'profile' ? button('Download', saveFaces, { kind: 'is-white', glyph: ICON.down }) : null);
}

// The room behind the glass takes its colours from the picture being worked on.
function renderBackdrop() {
  const { post, profile } = state;
  const pic = state.mode === 'profile'
    ? (profile.banner || profile.avatar || {}).pic
    : post.art ? post.art.pic : (post.slots.find((slot) => slot.pic) || {}).pic;
  const url = pic ? pic.url : '';
  if (backdrop.dataset.url === url) return;
  backdrop.dataset.url = url;
  put(backdrop, url ? h('img', { src: url, alt: '' }) : null);
}

function render() {
  renderBar();
  renderPanel();
  renderStage();
  renderBackdrop();
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

// A click on a place picks it; an empty one asks for its picture straight away.
stage.addEventListener('click', (event) => {
  const target = event.target.closest('[data-item]');
  if (!target || state.mode !== 'post') return;
  const slot = state.post.slots.find((one) => one.id === Number(target.dataset.item));
  if (!slot) return;
  state.selected = slot.id;
  render();
  if (!slot.pic && !state.post.art) choose(false, (files) => addPictures(files.slice(0, 1), slot));
});

window.addEventListener('keydown', (event) => {
  if (state.mode !== 'post' || state.look !== 'open' || event.target.closest('input, textarea')) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const { slots } = state.post;
  const at = Math.max(0, slots.findIndex((slot) => slot.id === state.selected));
  const next = slots[at + (event.key === 'ArrowLeft' ? -1 : 1)];
  if (!next) return;
  event.preventDefault();
  state.selected = next.id;
  render();
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
stacked.addEventListener('change', render);

restore();
state.post.slots = variants(4, contentWidth(state.device))[0].ratios.map(newSlot);
state.selected = state.post.slots[0].id;
render();

// for checks from the console
window.PU = { state, resolve, viewFor, render, addPictures, setArt, setCount, applyVariant, fitAll, variants, edit, filesToSave, askedSize };
