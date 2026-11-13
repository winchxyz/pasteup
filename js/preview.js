// The stand-in for x.com: one column with a profile header and a post, drawn with
// the site's own measurements so pictures land where they will after posting.

import { h, icon, drag } from './dom.js';
import { GAP } from './layout.js';
import { coverRect, showRect } from './pics.js';

export const DEVICES = {
  desktop: { column: 600, edge: 1 },  // the middle column on a computer, with its hairlines
  phone: { column: 390, edge: 0 },
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
};

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

function mediaSingle(view) {
  const [item] = view.layout.items;
  const entry = view.media[0];
  return h('div', { class: 'x-single', 'data-item': entry.id, style: { width: `${item.width}px`, height: `${view.layout.height}px` } },
    frame(entry.pic, entry.rect, '', inside(item.width, view.layout.height)));
}

function mediaRow(view, memo) {
  const { layout, media } = view;
  const row = h('div', { class: 'x-row' }, media.map((entry, i) =>
    h('div', { class: 'x-item', 'data-item': entry.id, style: { width: `${layout.items[i].width}px` } },
      frame(entry.pic, entry.rect, '', inside(layout.items[i].width, layout.height)))));
  const dots = layout.scrolls ? h('div', { class: 'x-dots', 'aria-hidden': 'true' }, media.map(() => h('i'))) : null;
  const before = h('button', { class: 'x-arrow is-left', type: 'button', 'aria-label': 'Previous pictures' }, icon(ICONS.left, 16));
  const after = h('button', { class: 'x-arrow is-right', type: 'button', 'aria-label': 'Next pictures' }, icon(ICONS.right, 16));
  const wrap = h('div', { class: 'x-rowwrap', style: { height: `${layout.height + 4}px` } }, row, before, after);

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

  // a mouse has no swipe: let it pull the row sideways
  let from = 0;
  let moved = false;
  drag(row, {
    start: (event) => { if (event.pointerType !== 'mouse' || !layout.scrolls) return false; from = row.scrollLeft; moved = false; return true; },
    move: (dx) => { if (Math.abs(dx) > 4) moved = true; row.scrollLeft = from - dx / zoomOf(row); },
  });
  row.addEventListener('click', (event) => { if (moved) { event.stopPropagation(); moved = false; } }, true);

  return { nodes: [dots, wrap], mount: () => { row.scrollLeft = memo.left || 0; sync(); } };
}

function zoomOf(el) {
  const box = el.getBoundingClientRect();
  return el.offsetWidth ? box.width / el.offsetWidth : 1;
}

// view: { profile, avatar, banner, text, media: [{ id, pic, rect }], layout }
function post(view, memo) {
  const mounts = [];
  let media = [];
  if (view.layout && view.media.length === 1) media = [mediaSingle(view)];
  if (view.layout && view.media.length > 1) {
    const row = mediaRow(view, memo);
    media = row.nodes;
    mounts.push(row.mount);
  }
  const count = (path, label) => h('span', { class: 'x-action' }, icon(path, 18), label);
  const el = h('article', { class: 'x-post' },
    face(view.avatar, view.profile.shape, 'x-face'),
    h('div', { class: 'x-body' },
      h('div', { class: 'x-head' },
        h('b', null, view.profile.name || 'Name'),
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
  const banner = h('div', { class: 'x-banner', 'data-pan': view.banner ? 'banner' : null });
  if (view.banner) banner.append(frame(view.banner.pic, view.banner.rect));
  const avatar = face(view.avatar, who.shape, 'x-pfp');
  if (view.avatar) avatar.dataset.pan = 'avatar';
  return h('div', { class: 'x-profile' },
    h('div', { class: 'x-top' }, icon(ICONS.back, 20), h('div', null, h('b', null, who.name || 'Name'), h('small', null, '128 posts'))),
    banner,
    h('div', { class: 'x-about' },
      h('div', { class: 'x-about-row' }, avatar, h('span', { class: 'x-pill' }, 'Edit profile')),
      h('div', { class: 'x-name' }, who.name || 'Name'),
      h('div', { class: 'x-handle' }, `@${who.handle || 'handle'}`),
      who.bio ? h('div', { class: 'x-bio' }, who.bio) : null,
      h('div', { class: 'x-meta' }, icon(ICONS.date, 17), 'Joined November 2026'),
      h('div', { class: 'x-follow' }, h('span', null, h('b', null, '312'), ' Following'), h('span', null, h('b', null, '4,806'), ' Followers'))),
    h('div', { class: 'x-tabs' }, ['Posts', 'Replies', 'Highlights', 'Articles', 'Media', 'Likes'].map((tab, i) =>
      h('span', { class: i === 0 ? 'is-on' : '' }, tab))));
}

export function column({ theme, device, mode, view, memo }) {
  const { column: width, edge } = DEVICES[device];
  const one = post(view, memo);
  const el = h('div', { class: `x x-${theme} ${edge ? 'has-edges' : ''}`, style: { width: `${width}px` } },
    mode === 'profile' ? profile(view) : null,
    one.el);
  return { el, mount: () => one.mounts.forEach((run) => run()) };
}

export { GAP };
