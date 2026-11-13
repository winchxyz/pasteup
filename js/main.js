import { h, icon, drag } from './dom.js';
import { postLayout, GAP, MAX_HEIGHT } from './layout.js';
import { clamp, loadPic, newCrop, cropRect, panCrop, evenCuts, pieceRect, gapShareFor, showRect, rectToBlob, saveBlob, nextId } from './pics.js';
import { column, contentWidth, frame, DEVICES } from './preview.js';
import * as samples from './samples.js';
import { zip } from './zip.js';

const LIMIT = 20; // pictures in one post on X since November 2026
const RATIOS = [['Original', null], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9]];
const STORE = 'pasteup.v1';
const SAMPLE_TEXT = 'One picture, cut in eleven.';

const state = {
  mode: 'post',
  theme: 'dark',
  device: 'desktop',
  profile: { name: 'Pasteup', handle: 'pasteup', bio: 'Lay it out before you post it.', shape: 'circle', avatar: null, banner: null },
  post: { text: SAMPLE_TEXT, items: [], sample: true },
  selected: null,
};

const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
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

const groupsOf = (items) => [...new Set(items.map((item) => item.group).filter(Boolean))];
const aspectOf = (rect) => rect.w / rect.h;

// Work out which part of its picture every item shows, and the row they make.
function resolve(width) {
  const { items } = state.post;
  const rectsAt = (rowHeight) => items.map((item) => (item.group
    ? pieceRect(item.group, item.index, rowHeight && item.group.seamless ? gapShareFor(item.group, rowHeight) : 0)
    : cropRect(item.pic, item.crop)));
  let rects = rectsAt(0);
  let layout = postLayout(rects.map(aspectOf), width);
  if (layout && layout.kind === 'row' && items.some((item) => item.group && item.group.seamless)) {
    for (let pass = 0; pass < 2; pass++) {
      rects = rectsAt(layout.height);
      layout = postLayout(rects.map(aspectOf), width);
    }
  }
  return { rects, layout };
}

function slotView(slot) {
  return slot ? { pic: slot.pic, rect: cropRect(slot.pic, slot.crop) } : null;
}

function viewFor(device) {
  const { rects, layout } = resolve(contentWidth(device));
  return {
    profile: state.profile,
    avatar: slotView(state.profile.avatar),
    banner: slotView(state.profile.banner),
    text: state.post.text,
    media: state.post.items.map((item, i) => ({ id: item.id, pic: item.pic, rect: rects[i] })),
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

function clearSamples() {
  if (!state.post.sample) return;
  state.post.items = [];
  state.post.sample = false;
  state.selected = null;
  if (state.post.text === SAMPLE_TEXT) state.post.text = '';
}

async function readFiles(files) {
  const pics = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try { pics.push(await loadPic(file, file.name)); } catch (error) { toast(error.message); }
  }
  return pics;
}

async function addPictures(files) {
  const pics = await readFiles(files);
  if (!pics.length) return;
  clearSamples();
  const room = LIMIT - state.post.items.length;
  const taken = pics.slice(0, room);
  for (const pic of taken) state.post.items.push({ id: nextId(), pic, crop: newCrop(), group: null, index: 0 });
  if (taken.length) state.selected = state.post.items[state.post.items.length - 1].id;
  if (pics.length > room) toast(`A post holds ${LIMIT} pictures. ${pics.length - room} left out.`);
  render();
}

function addGroup(pic, pieces, at = state.post.items.length) {
  // 4:5 is the widest shape a cut picture can have and still show whole in the feed
  const group = { id: nextId(), pic, crop: newCrop(pic.w / pic.h > 0.8 ? 4 / 5 : null), cuts: evenCuts(pieces), seamless: true };
  const made = Array.from({ length: pieces }, (_, index) => ({ id: nextId(), pic, crop: null, group, index }));
  state.post.items.splice(at, 0, ...made);
  return made;
}

async function addCut(files) {
  const [pic] = await readFiles(files);
  if (!pic) return;
  clearSamples();
  const room = LIMIT - state.post.items.length;
  if (room < 2) { toast(`A post holds ${LIMIT} pictures. Remove some to cut another one.`); return; }
  state.selected = addGroup(pic, Math.min(4, room))[0].id;
  render();
}

function setPieces(group, pieces) {
  const { items } = state.post;
  const others = items.filter((item) => item.group !== group).length;
  pieces = clamp(pieces, 2, LIMIT - others);
  const at = items.findIndex((item) => item.group === group);
  state.post.items = items.filter((item) => item.group !== group);
  group.cuts = evenCuts(pieces);
  const made = Array.from({ length: pieces }, (_, index) => ({ id: nextId(), pic: group.pic, crop: null, group, index }));
  state.post.items.splice(at, 0, ...made);
  state.selected = made[0].id;
  render();
}

function removeSelected() {
  const item = selectedItem();
  if (!item) return;
  state.post.items = state.post.items.filter((other) => (item.group ? other.group !== item.group : other !== item));
  state.selected = null;
  render();
}

function move(item, step) {
  const { items } = state.post;
  const from = items.indexOf(item);
  const to = clamp(from + step, 0, items.length - 1);
  if (from === to) return;
  items.splice(from, 1);
  items.splice(to, 0, item);
  render();
}

// Three or more pictures all show at once only as a row of narrow strips at full
// height. Narrow the crops until the row is exactly as wide as the post.
function fitAll() {
  const { items } = state.post;
  const width = contentWidth(state.device) - 0.5;
  const height = MAX_HEIGHT * width;
  const loose = items.filter((item) => !item.group);
  const groups = groupsOf(items);
  const shape = (group) => aspectOf(cropRect(group.pic, group.crop));
  // a group that carries on behind the gaps already counts its own gaps
  const inner = groups.filter((group) => group.seamless).reduce((sum, group) => sum + group.cuts.length, 0);
  const room = width - GAP * (items.length - 1 - inner);
  const cut = groups.reduce((sum, group) => sum + shape(group), 0);
  if (loose.length) {
    const each = (room / height - cut) / loose.length;
    if (each < 0.03) { toast('The cut picture leaves no room for the rest. Crop it narrower first.'); return; }
    for (const item of loose) item.crop.ratio = each;
  } else {
    const scale = room / height / cut;
    for (const group of groups) group.crop.ratio = shape(group) * scale;
  }
  render();
}

const selectedItem = () => state.post.items.find((item) => item.id === state.selected) || null;

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

// ---------- panel: post ----------

function tray() {
  const { items } = state.post;
  const view = viewFor(state.device);
  let dragged = null;
  return h('div', { class: 'tray' }, items.map((item, i) => {
    const rect = view.media[i].rect;
    const width = clamp(Math.round(52 * aspectOf(rect)), 12, 96);
    return h('button', {
      type: 'button', class: `thumb ${item.id === state.selected ? 'is-on' : ''} ${item.group ? 'is-piece' : ''}`,
      style: { width: `${width}px` }, draggable: true, 'aria-label': `Picture ${i + 1}`, 'aria-pressed': String(item.id === state.selected),
      onclick: () => { state.selected = item.id; render(); },
      ondragstart: (event) => { dragged = item; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(item.id)); },
      ondragover: (event) => { if (dragged && dragged !== item) event.preventDefault(); },
      ondrop: (event) => {
        if (!dragged || dragged === item) return;
        event.preventDefault();
        event.stopPropagation();
        const list = state.post.items;
        list.splice(list.indexOf(dragged), 1);
        const box = event.currentTarget.getBoundingClientRect();
        list.splice(list.indexOf(item) + (event.clientX > box.left + box.width / 2 ? 1 : 0), 0, dragged);
        render();
      },
    }, frame(item.pic, rect), h('i', null, String(i + 1)));
  }));
}

function readout() {
  const width = contentWidth(state.device);
  const { rects, layout } = resolve(width);
  const count = state.post.items.length;
  if (!layout) return h('p', { class: 'readout' }, `Add up to ${LIMIT} pictures. Two or more sit in one row; the row scrolls when they do not fit.`);
  if (layout.kind === 'single') return h('p', { class: 'readout' }, 'One picture keeps its own shape, up to 510 px tall.');

  const total = rects.reduce((sum, rect) => sum + aspectOf(rect), 0);
  const lines = [];
  if (!layout.scrolls) {
    lines.push(h('p', { class: 'readout is-good' }, layout.used > 0.985
      ? `All ${count} show at once, edge to edge.`
      : `All ${count} show at once. The row covers ${Math.round(layout.used * 100)}% of the width.`));
    const other = Object.keys(DEVICES).find((device) => device !== state.device);
    if (resolve(contentWidth(other)).layout.scrolls) {
      lines.push(h('p', { class: 'note' }, other === 'phone' ? 'On a phone the row is a little too wide and scrolls.' : 'On a computer the row scrolls.'));
    }
  } else {
    const shown = Math.floor(layout.inView * 10) / 10;
    lines.push(h('p', { class: 'readout is-warn' }, `${shown} of ${count} in view, the rest scrolls.`));
    lines.push(h('p', { class: 'note' }, count > 2
      ? `From three pictures up, X leaves the second one cut off as a hint to scroll. All show at once only as narrow strips whose width ÷ height add up to about 0.80. Now ${total.toFixed(2)}.`
      : 'Two pictures show side by side unless they are wide. Crop them narrower to see both.'));
  }
  const trimmed = rects.findIndex((rect, i) => layout.items[i].aspect < aspectOf(rect) - 0.01);
  if (trimmed >= 0) lines.push(h('p', { class: 'note' }, `Picture ${trimmed + 1} loses its sides: one picture takes at most 80% of the width.`));
  if (count > 2 && (layout.scrolls || layout.used < 0.985)) {
    lines.push(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: fitAll }, 'Fit all in view')));
  }
  return h('div', { class: 'stack' }, lines);
}

function ratioChips(crop, onPick) {
  const known = RATIOS.some(([, value]) => value === crop.ratio);
  return h('div', { class: 'chips' },
    RATIOS.map(([label, value]) => h('button', { type: 'button', class: `chip ${crop.ratio === value ? 'is-on' : ''}`, onclick: () => onPick(value) }, label)),
    known ? null : h('span', { class: 'chip is-on is-static' }, 'Fitted'));
}

function pictureEditor(item) {
  const number = state.post.items.indexOf(item) + 1;
  const box = cropbox({ pic: item.pic, crop: item.crop, onChange: renderStage });
  return section(`Picture ${number}`, `${item.pic.w} × ${item.pic.h}`,
    ratioChips(item.crop, (ratio) => { item.crop.ratio = ratio; render(); }),
    h('div', { class: 'cropwrap' }, box.el),
    zoomSlider('zoom-picture', item.crop, () => { box.redraw(); renderStage(); }),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: () => move(item, -1), 'aria-label': 'Move earlier' }, '←'),
      h('button', { type: 'button', class: 'btn', onclick: () => move(item, 1), 'aria-label': 'Move later' }, '→'),
      h('button', { type: 'button', class: 'btn', onclick: () => saveOne(item) }, 'Download'),
      h('button', { type: 'button', class: 'btn is-quiet', onclick: removeSelected }, 'Remove')));
}

function cutEditor(item) {
  const { group } = item;
  const pieces = group.cuts.length + 1;
  const box = cropbox({ pic: group.pic, crop: group.crop, height: 320, onChange: renderStage });
  const lines = group.cuts.map((at, i) => {
    const grip = h('b', { role: 'slider', 'aria-label': `Cut ${i + 1}`, 'aria-valuenow': Math.round(at * 100), tabindex: 0 });
    const line = h('div', { class: 'cut', style: { left: `${at * 100}%` } }, grip);
    const place = (value) => {
      const min = (group.cuts[i - 1] ?? 0) + 0.01;
      const max = (group.cuts[i + 1] ?? 1) - 0.01;
      group.cuts[i] = clamp(value, min, max);
      line.style.left = `${group.cuts[i] * 100}%`;
      renderStage();
    };
    let from = at;
    drag(grip, {
      cursor: 'ew-resize',
      start: () => { from = group.cuts[i]; return true; },
      move: (dx) => place(from + dx / box.el.getBoundingClientRect().width),
      end: renderPanel,
    });
    grip.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      place(group.cuts[i] + (event.key === 'ArrowLeft' ? -0.005 : 0.005));
    });
    return line;
  });
  box.el.append(...lines);
  const stepper = h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'Fewer pieces', onclick: () => setPieces(group, pieces - 1) }, '−'),
    h('output', null, String(pieces)),
    h('button', { type: 'button', 'aria-label': 'More pieces', onclick: () => setPieces(group, pieces + 1) }, '+'));
  return section('Cut picture', `${group.pic.w} × ${group.pic.h}`,
    h('div', { class: 'row is-split' }, h('span', { class: 'hint' }, 'Pieces'), stepper),
    ratioChips(group.crop, (ratio) => { group.crop.ratio = ratio; render(); }),
    h('div', { class: 'cropwrap' }, box.el),
    h('p', { class: 'note' }, 'Drag the picture to move it. Drag a grip to move a cut.'),
    zoomSlider('zoom-cut', group.crop, () => { box.redraw(); renderStage(); }),
    h('label', { class: 'check' },
      h('input', { id: 'seamless', type: 'checkbox', checked: group.seamless, onchange: (event) => { group.seamless = event.target.checked; render(); } }),
      h('span', null, 'Carry the picture on behind the gaps')),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: () => { group.cuts = evenCuts(pieces); render(); } }, 'Even pieces'),
      h('button', { type: 'button', class: 'btn is-quiet', onclick: removeSelected }, 'Remove')));
}

function postPanel() {
  const { items, sample } = state.post;
  const item = selectedItem();
  return [
    section('Pictures', `${items.length} / ${LIMIT}`,
      sample ? h('p', { class: 'note' }, 'A sample chart, cut in eleven. Your first picture replaces it.') : null,
      items.length ? tray() : null,
      h('div', { class: 'row' },
        filePicker('Add pictures', { multiple: true, primary: true, onFiles: addPictures }),
        filePicker('Cut one picture', { onFiles: addCut })),
      readout()),
    item ? (item.group ? cutEditor(item) : pictureEditor(item)) : null,
    section('Text', null,
      h('textarea', { id: 'post-text', rows: 3, placeholder: 'What the post says', value: state.post.text, oninput: (event) => { state.post.text = event.target.value; renderStage(); remember(); } })),
    items.length ? section('Files', null,
      h('button', { type: 'button', class: 'btn is-primary is-wide', onclick: saveAll }, items.length > 1 ? `Download ${items.length} pictures (.zip)` : 'Download the picture'),
      items.length > 1 ? h('p', { class: 'note' }, 'Numbered in post order. Attach them to the post in the same order.') : null) : null,
  ];
}

// ---------- panel: profile ----------

function slotEditor(key, { title, size, ratio, height, mask }, extra = null) {
  const slot = state.profile[key];
  const choose = async (files) => {
    const [pic] = await readFiles(files);
    if (!pic) return;
    state.profile[key] = { pic, crop: newCrop(ratio), sample: false };
    render();
  };
  if (!slot) return section(title, size, h('div', { class: 'row' }, filePicker('Choose a picture', { primary: true, onFiles: choose })), extra);
  const box = cropbox({ pic: slot.pic, crop: slot.crop, height, mask, onChange: renderStage, drop: key });
  return section(title, size,
    slot.sample ? h('p', { class: 'note' }, 'A sample. Choose your own picture to replace it.') : null,
    h('div', { class: 'cropwrap' }, box.el),
    zoomSlider(`zoom-${key}`, slot.crop, () => { box.redraw(); renderStage(); }),
    h('div', { class: 'row' },
      filePicker('Choose a picture', { onFiles: choose }),
      h('button', { type: 'button', class: 'btn', onclick: () => saveSlot(key) }, 'Download')),
    extra);
}

function field(id, label, key, multiline = false) {
  const props = { id, value: state.profile[key], oninput: (event) => { state.profile[key] = event.target.value; renderStage(); remember(); } };
  return h('label', { class: 'field' }, h('span', null, label), multiline ? h('textarea', { ...props, rows: 2 }) : h('input', { ...props, type: 'text', autocomplete: 'off' }));
}

function profilePanel() {
  const who = state.profile;
  return [
    slotEditor('avatar', { title: 'Avatar', size: '400 × 400', ratio: 1, height: 168, mask: who.shape === 'square' ? 'is-rounded' : 'is-round' },
      h('div', { class: 'row is-split' }, h('span', { class: 'hint' }, 'Shape'),
        seg('Avatar shape', who.shape, [['Circle', 'circle'], ['Square', 'square']], (shape) => { who.shape = shape; remember(); render(); }))),
    slotEditor('banner', { title: 'Banner', size: '1500 × 500', ratio: 3, height: 104 }),
    section('Words', null, field('profile-name', 'Name', 'name'), field('profile-handle', 'Handle', 'handle'), field('profile-bio', 'Bio', 'bio', true)),
  ];
}

// ---------- saving files ----------

const stamp = (i) => String(i + 1).padStart(2, '0');

async function saveOne(item) {
  const i = state.post.items.indexOf(item);
  const { rects } = resolve(contentWidth(state.device));
  saveBlob(await rectToBlob(item.pic, rects[i]), `pasteup-${stamp(i)}.png`);
}

async function saveAll() {
  const { items } = state.post;
  const { rects } = resolve(contentWidth(state.device));
  try {
    if (items.length === 1) { saveBlob(await rectToBlob(items[0].pic, rects[0]), 'pasteup-01.png'); return; }
    const files = [];
    for (let i = 0; i < items.length; i++) files.push({ name: `pasteup-${stamp(i)}.png`, blob: await rectToBlob(items[i].pic, rects[i]) });
    saveBlob(await zip(files), 'pasteup-post.zip');
    toast(`${files.length} pictures saved, numbered in post order.`);
  } catch (error) { toast(error.message); }
}

async function saveSlot(key) {
  const slot = state.profile[key];
  const size = key === 'avatar' ? { w: 400, h: 400 } : { w: 1500, h: 500 };
  try { saveBlob(await rectToBlob(slot.pic, cropRect(slot.pic, slot.crop), size), `pasteup-${key}.png`); } catch (error) { toast(error.message); }
}

// ---------- drawing ----------

function renderPanel() {
  const keep = panel.scrollTop;
  panel.replaceChildren(...(state.mode === 'post' ? postPanel() : profilePanel()).flat().filter(Boolean));
  panel.scrollTop = keep;
}

function renderStage() {
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
  const board = stage.firstElementChild;
  if (!board) return;
  board.style.zoom = '1';
  const room = stage.clientWidth - 48;
  board.style.zoom = String(Math.min(1, room / board.scrollWidth));
}

function renderBar() {
  const set = (key) => (value) => { state[key] = value; remember(); render(); };
  document.getElementById('modes').replaceChildren(seg('View', state.mode, [['Post', 'post'], ['Profile', 'profile']], set('mode')));
  document.getElementById('switches').replaceChildren(
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
  const slot = state.profile[target.dataset.pan];
  down.preventDefault();
  const size = target.getBoundingClientRect();
  let last = [down.clientX, down.clientY];
  const onMove = (event) => {
    panCrop(slot.pic, slot.crop, (event.clientX - last[0]) / size.width, (event.clientY - last[1]) / size.height);
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
  if (state.mode === 'post') { addPictures(files); return; }
  const key = event.target.closest?.('[data-drop]')?.dataset.drop || event.target.closest?.('[data-pan]')?.dataset.pan;
  if (!key) { toast('Drop the picture on the avatar or on the banner.'); return; }
  const [pic] = await readFiles(files);
  if (!pic) return;
  state.profile[key] = { pic, crop: newCrop(key === 'avatar' ? 1 : 3), sample: false };
  render();
});

window.addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (files.length && state.mode === 'post') addPictures(files);
});

window.addEventListener('resize', fitStage);

async function start() {
  restore();
  render();
  const [chart, avatar, banner] = await Promise.all([samples.chart(11), samples.avatar(), samples.banner()]);
  state.profile.avatar = { pic: avatar, crop: newCrop(1), sample: true };
  state.profile.banner = { pic: banner, crop: newCrop(3), sample: true };
  if (state.post.sample && !state.post.items.length) addGroup(chart, 11);
  render();
}

start();

// for checks from the console
window.PU = { state, resolve, viewFor, render, addPictures, addCut, setPieces, fitAll };
