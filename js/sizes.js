// The reference page: what size to make each kind of picture, and how X shows it.

import { h } from './dom.js';

const GROUPS = [
  {
    title: 'In a post',
    note: 'X keeps the picture you upload and only crops the view in the feed. A tap opens the whole picture.',
    rows: [
      ['Landscape', '16:9', '1600 × 900', 'Shows whole on its own. In a row of three or more it is trimmed to 80% of the post width.'],
      ['Square', '1:1', '1200 × 1200', 'Two squares sit side by side. Safe when you do not know the order.'],
      ['Portrait', '4:5', '1080 × 1350', 'The biggest picture that still reads at a glance. Two of them fit side by side.'],
      ['Tall', '3:4', '1200 × 1600', 'On its own it is shown up to 510 px tall on a computer.'],
      ['Story', '9:16', '1080 × 1920', 'Takes the most room in a swipe row.'],
      ['Wide', '2:1', '1600 × 800', 'A short banner across the post.'],
      ['Strip set', '4:5 in all', '1080 × 1350 cut up', 'One picture cut into 3 to 20 strips shows whole, edge to edge, when the whole of it is 4:5.'],
    ],
  },
  {
    title: 'Profile',
    note: 'The avatar sits over the bottom left of the banner and hides that corner.',
    rows: [
      ['Avatar', '1:1', '400 × 400', 'Shown as a circle (a rounded square for organisations). 133 px on the profile, 40 px next to posts.'],
      ['Banner', '3:1', '1500 × 500', 'Runs the full width of the profile. Keep faces and words out of the bottom left corner.'],
    ],
  },
  {
    title: 'Other places',
    note: null,
    rows: [
      ['Link card', '1.91:1', '1200 × 628', 'The picture X pulls from a page you link to.'],
      ['Article cover', '5:2', '1500 × 600', 'The picture at the top of an X Article.'],
    ],
  },
];

const RULES = [
  ['One picture', 'keeps its own shape and takes the full width.'],
  ['Two pictures', 'shrink until they sit side by side. Only two wide ones do not: then the second is a swipe away.'],
  ['Three or more', 'form a row you swipe. X leaves the second picture cut off on purpose, as a hint that there is more.'],
  ['All in view', 'From three pictures up this happens only with narrow strips: the row is at most 1.244 × the post width tall, so the widths ÷ heights have to add up to about 0.80.'],
  ['Gaps and limits', '4 px between pictures. One picture never takes more than 80% of the post width; wider ones lose their sides in the feed.'],
  ['Files', 'Up to 20 pictures in a post. JPG, PNG or WebP up to 5 MB each, GIF up to 15 MB. The longest side X keeps is 4096 px.'],
];

function shape(ratio) {
  const [w, t] = ratio.split(' ')[0].split(':').map(Number);
  return h('span', { class: 'shape' }, h('i', { style: { aspectRatio: String(w / t) } }));
}

export function sizeSheet() {
  return h('div', { class: 'sizes' },
    h('header', null, h('h1', null, 'Picture sizes for X'), h('p', null, 'Sizes to make pictures at, and what the feed does with them. Measured on x.com in November 2026.')),
    GROUPS.map((group) => h('section', null,
      h('h2', null, group.title),
      group.note ? h('p', { class: 'note' }, group.note) : null,
      h('div', { class: 'size-list' }, group.rows.map(([name, ratio, size, note]) =>
        h('div', { class: 'size' }, shape(ratio), h('b', null, name), h('span', { class: 'aside' }, ratio), h('span', { class: 'px' }, size), h('p', null, note)))))),
    h('section', null,
      h('h2', null, 'How the feed lays pictures out'),
      h('dl', { class: 'rules' }, RULES.map(([term, text]) => [h('dt', null, term), h('dd', null, text)]))));
}
