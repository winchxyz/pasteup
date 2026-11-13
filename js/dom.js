// h('button', { class: 'btn', onclick: fn }, 'Label') -> element
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && !key.includes('-')) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...kids.flat(Infinity).filter((kid) => kid != null && kid !== false));
  return el;
}

export function icon(path, size = 18) {
  const box = document.createElement('span');
  box.className = 'icon';
  box.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  return box;
}

// Track a pointer drag. start() may return false to ignore the press.
// move gets the distance since the press, in px.
export function drag(el, { start, move, end, cursor }) {
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || (start && start(down) === false)) return;
    down.preventDefault();
    if (cursor) document.documentElement.style.cursor = cursor;
    const onMove = (event) => move(event.clientX - down.clientX, event.clientY - down.clientY, event);
    const onUp = (event) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.documentElement.style.cursor = '';
      if (end) end(event);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}
