// The stand-in for x.com: one column with a profile header and a post, drawn with
// the site's own measurements so pictures land where they will after posting.

import { h, icon, drag } from './dom.js';
import { GAP } from './layout.js';
import { coverRect, showRect } from './pics.js';

export const DEVICES = {
  desktop: { column: 600, edge: 1, opened: 660 },  // the middle column on a computer, with its hairlines
  phone: { column: 390, edge: 0, opened: 760 },
};
const SIDE = 16;    // padding left and right of a post
const GUTTER = 48;  // 40 px avatar + 8 px gap before the text

export const innerWidth = (device) => DEVICES[device].column - DEVICES[device].edge * 2;
export const contentWidth = (device) => innerWidth(device) - SIDE * 2 - GUTTER;

const ICONS = {
  reply: '<path d="M4 11.5a7.5 7.5 0 0 1 7.5-7.5h1a7.5 7.5 0 0 1 3.6 14.1L11 21v-2.5A7.5 7.5 0 0 1 4 11.5Z"/>',
  repost: '<path d="M4 9.5 7 6.5l3 3M7 7v8a2 2 0 0 0 2 2h4M20 14.5l-3 3-3-3M17 17V9a2 2 0 0 0-2-2h-4"/>',
  like: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  views: '<path d="M5 20V10M10 20V4M15 20v-7M20 20V8"/>',
  save: '<path d="M7 4h10v16l-5-4-5 4Z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  date: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// A window onto part of a picture.
export function frame(pic, rect, className = '', aspect = null) {
  const img = h('img', { src: pic.url, alt: '', draggable: false });
  showRect(img, pic, aspect ? coverRect(rect, aspect) : rect);
  return h('div', { class: `frame ${className}` }, img);
}

function face(slot, shape, className) {
  const box = h('div', { class: `${className} ${shape === 'square' ? 'is-square' : ''}` });
  if (slot) box.append(frame(slot.pic, slot.rect));
  return box;
}

// the shape of a tile inside its 1 px border
const inside = (width, height) => Math.max(1, width - 2) / Math.max(1, height - 2);

// A picture, or a numbered stand-in while the place is still empty.
function tile(entry, width, height) {
  if (entry.pic) return frame(entry.pic, entry.rect, '', inside(width, height));
  return h('div', { class: 'x-empty' }, h('b', null, String(entry.number)), width > 54 ? h('span', null, entry.label) : null);
}

const marks = (entry, edit) => (edit && edit.picked === entry.id ? ' is-picked' : '') + (edit && edit.lifted === entry.id ? ' is-lifted' : '');

function mediaSingle(view, edit) {
  const [item] = view.layout.items;
  const entry = view.media[0];
  return h('div', { class: `x-single${marks(entry, edit)}`, 'data-item': entry.id, style: { width: `${item.width}px`, height: `${view.layout.height}px` } },
    tile(entry, item.width, view.layout.height));
}

function zoomOf(el) {
  const box = el.getBoundingClientRect();
  return el.offsetWidth ? box.width / el.offsetWidth : 1;
}

// Grips in the gaps of the row: pull one to make a picture wider and its neighbour narrower.
function edges(layout, edit, row) {
  let x = SIDE + GUTTER;
  return layout.items.slice(0, -1).map((item, i) => {
    x += item.width + GAP;
    const reach = clamp(Math.min(item.width, layout.items[i + 1].width) * 0.5 + GAP, 6, 16);
    const el = h('span', {
      class: 'x-edge', role: 'separator', 'aria-label': `Border between pictures ${i + 1} and ${i + 2}`,
      style: { left: `${x - GAP / 2 - reach / 2}px`, width: `${reach}px`, height: `${layout.height}px` },
    });
    let zoom = 1;
    drag(el, {
      cursor: 'ew-resize',
      start: () => { zoom = zoomOf(row); edit.edge(i, 'start', 0); return true; },
      move: (dx) => edit.edge(i, 'move', dx / zoom),
      end: () => edit.edge(i, 'end', 0),
    });
    return el;
  });
}

function mediaRow(view, memo, edit) {
  const { layout, media } = view;
  const row = h('div', { class: 'x-row' }, media.map((entry, i) =>
    h('div', { class: `x-item${marks(entry, edit)}`, 'data-item': entry.id, style: { width: `${layout.items[i].width}px` } },
      tile(entry, layout.items[i].width, layout.height))));
  if (edit) row.append(...edges(layout, edit, row));
  const dots = layout.scrolls ? h('div', { class: 'x-dots', 'aria-hidden': 'true' }, media.map(() => h('i'))) : null;
  const before = h('button', { class: 'x-arrow is-left', type: 'button', 'aria-label': 'Previous pictures' }, icon(ICONS.left, 16));
  const after = h('button', { class: 'x-arrow is-right', type: 'button', 'aria-label': 'Next pictures' }, icon(ICONS.right, 16));
  const wrap = h('div', { class: `x-rowwrap ${edit ? 'is-editable' : ''}`, style: { height: `${layout.height + 4}px` } }, row, before, after);

  const sync = () => {
    const room = row.scrollWidth - row.clientWidth;
    before.hidden = row.scrollLeft < 2;
    after.hidden = row.scrollLeft > room - 2;
    memo.left = row.scrollLeft;
    if (dots) {
      const at = room > 0 ? Math.round((row.scrollLeft / room) * (media.length - 1)) : 0;
      [...dots.children].forEach((dot, i) => dot.classList.toggle('is-on', i === at));
    }
  };
  row.addEventListener('scroll', sync, { passive: true });
  before.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' }));
  after.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' }));

  // A mouse has no swipe. In a row that scrolls it pulls the row sideways;
  // in a row that shows whole it picks a picture up and carries it to a new place.
  let from = 0;
  let moved = false;
  let held = null;
  drag(row, {
    start: (event) => {
      if (event.pointerType !== 'mouse' || event.target.closest('.x-edge')) return false;
      held = !layout.scrolls && edit ? Number(event.target.closest('[data-item]')?.dataset.item) || null : null;
      if (!layout.scrolls && !held) return false;
      from = row.scrollLeft;
      moved = false;
      return true;
    },
    move: (dx, dy, event) => {
      if (Math.abs(dx) > 5) moved = true;
      if (!held) { row.scrollLeft = from - dx / zoomOf(row); return; }
      if (moved) edit.lift(held, event.clientX, event.clientY);
    },
    end: () => { if (held && moved) edit.drop(); held = null; },
  });
  row.addEventListener('click', (event) => { if (moved) { event.stopPropagation(); moved = false; } }, true);

  return { nodes: [dots, wrap], mount: () => { row.scrollLeft = memo.left || 0; sync(); } };
}

// view: { profile, avatar, banner, text, media: [{ id, pic, rect, number, label }], layout, ratios }
// edit: null, or { picked, lifted, edge(i, phase, dx), lift(id, x, y), drop() } to change the row in place
function post(view, memo, edit) {
  const mounts = [];
  let media = [];
  if (view.layout && view.media.length === 1) media = [mediaSingle(view, edit)];
  if (view.layout && view.media.length > 1) {
    const row = mediaRow(view, memo, edit);
    media = row.nodes;
    mounts.push(row.mount);
  }
  const count = (path, label) => h('span', { class: 'x-action' }, icon(path, 18), label);
  const el = h('article', { class: 'x-post' },
    face(view.avatar, view.profile.shape, 'x-face'),
    h('div', { class: 'x-body' },
      h('div', { class: 'x-head' },
        h('b', null, view.profile.name || 'Your name'),
        h('span', null, `@${view.profile.handle || 'handle'} · 1h`),
        h('span', { class: 'x-more' }, icon(ICONS.more, 18))),
      view.text ? h('div', { class: 'x-text' }, view.text) : null,
      media,
      h('div', { class: 'x-actions' },
        count(ICONS.reply, '12'), count(ICONS.repost, '48'), count(ICONS.like, '1.2K'), count(ICONS.views, '18K'),
        h('span', { class: 'x-action is-pair' }, icon(ICONS.save, 18), icon(ICONS.share, 18)))));
  return { el, mounts };
}

function profile(view) {
  const { profile: who } = view;
  const banner = h('div', { class: 'x-banner', 'data-face': 'banner', 'data-pan': view.banner ? 'banner' : null });
  if (view.banner) banner.append(frame(view.banner.pic, view.banner.rect));
  const avatar = face(view.avatar, who.shape, 'x-pfp');
  avatar.dataset.face = 'avatar';
  if (view.avatar) avatar.dataset.pan = 'avatar';
  return h('div', { class: 'x-profile' },
    h('div', { class: 'x-top' }, icon(ICONS.back, 20), h('div', null, h('b', null, who.name || 'Your name'), h('small', null, '128 posts'))),
    banner,
    h('div', { class: 'x-about' },
      h('div', { class: 'x-about-row' }, avatar, h('span', { class: 'x-pill' }, 'Edit profile')),
      h('div', { class: 'x-name' }, who.name || 'Your name'),
      h('div', { class: 'x-handle' }, `@${who.handle || 'handle'}`),
      who.bio ? h('div', { class: 'x-bio' }, who.bio) : null,
      h('div', { class: 'x-meta' }, icon(ICONS.date, 17), 'Joined November 2026'),
      h('div', { class: 'x-follow' }, h('span', null, h('b', null, '312'), ' Following'), h('span', null, h('b', null, '4,806'), ' Followers'))),
    h('div', { class: 'x-tabs' }, ['Posts', 'Replies', 'Highlights', 'Articles', 'Media', 'Likes'].map((tab, i) =>
      h('span', { class: i === 0 ? 'is-on' : '' }, tab))));
}

export function column({ theme, device, mode, view, memo, edit = null }) {
  const { column: width, edge } = DEVICES[device];
  const one = post(view, memo, mode === 'post' ? edit : null);
  const el = h('div', { class: `x x-${theme} ${edge ? 'has-edges' : ''}`, style: { width: `${width}px` } },
    mode === 'profile' ? profile(view) : null,
    one.el);
  return { el, mount: () => one.mounts.forEach((run) => run()) };
}

// What a tap on a picture opens: the whole file on black, one picture at a time.
// A dashed outline marks the part the feed shows when the feed trims the picture.
export function viewer({ device, view, at, onStep }) {
  const { column: width, opened: height } = DEVICES[device];
  const entry = view.media[at];
  const ratio = view.ratios[at];
  const shown = view.layout.items[at].aspect;
  const side = device === 'phone' ? 0 : 56;
  const room = { w: width - side * 2, h: height - 53 - 56 };
  const w = Math.min(room.w, room.h * ratio);
  const picture = h('div', { class: 'xv-pic', style: { width: `${w}px`, height: `${w / ratio}px` } },
    entry.pic ? frame(entry.pic, entry.rect) : h('div', { class: 'x-empty' }, h('b', null, String(entry.number)), h('span', null, entry.label)));
  if (Math.abs(shown - ratio) > 0.01) {
    const part = shown < ratio ? { width: `${(shown / ratio) * 100}%`, height: '100%' } : { width: '100%', height: `${(ratio / shown) * 100}%` };
    picture.append(h('div', { class: 'xv-feed', style: part }, h('span', null, 'in the feed')));
  }
  const step = (by, path, label) => h('button', {
    type: 'button', class: `xv-arrow ${by < 0 ? 'is-left' : 'is-right'}`, 'aria-label': label,
    hidden: at + by < 0 || at + by >= view.media.length, onclick: () => onStep(by),
  }, icon(path, 18));
  const count = (path, label) => h('span', { class: 'x-action' }, icon(path, 18), label);
  return h('div', { class: `x x-dark x-view ${device === 'phone' ? 'is-phone' : ''}`, style: { width: `${width}px`, height: `${height}px` } },
    h('div', { class: 'xv-top' }, h('span', { class: 'xv-close' }, icon(ICONS.close, 18))),
    h('div', { class: 'xv-room' }, step(-1, ICONS.left, 'Previous picture'), picture, step(1, ICONS.right, 'Next picture')),
    h('div', { class: 'xv-actions' },
      count(ICONS.reply, '12'), count(ICONS.repost, '48'), count(ICONS.like, '1.2K'), count(ICONS.views, '18K'),
      h('span', { class: 'x-action' }, icon(ICONS.share, 18))));
}

export { GAP };
