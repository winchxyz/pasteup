# Pasteup

Lay out pictures for X before you post them.

**Open it: https://winchxyz.github.io/pasteup/**

- **Layouts.** Pick how many pictures the post has, 1 to 20, then one of the ready layouts: even strips, a wide first or last picture, steps, squares, portraits, stories and more. Each card is a small drawing of the row X builds, marked "all in view" or "swipe". A row you changed by hand can be saved next to them.
- **Edit in the preview.** Pull the border between two pictures to make one wider and the other narrower. Carry a picture to a new place with the mouse. Click an empty place to fill it.
- **Formats.** Give any picture a named shape with the size to make it at (16:9 at 1600 × 900, 4:5 at 1080 × 1350 and so on), or type your own size.
- **Feed and opened.** See the row as the feed shows it, or one picture as it opens on a tap. Parts the feed cuts off are dimmed in the crop box and outlined in the opened view.
- **One picture across the row.** Spread a single picture over all the places and drag the cuts. It can carry on behind the 4 px gaps so nothing jumps.
- **Saving.** Pictures download at the exact size of their format, as PNG or JPG, numbered in post order, with a warning when a file is over the 5 MB X takes.
- **Profile.** Place an avatar and a banner, drag them right in the preview, download them at 400 × 400 and 1500 × 500. The banner editor marks the corner the avatar covers.
- **Sizes.** One page with the sizes for posts, profile, link cards, and the rules of the feed.
- **Dark and light** X themes, side by side if you like, at computer and phone width.

Everything runs in the browser. Pictures never leave your machine.

## How X lays pictures out

Measured on x.com in November 2026, after the limit went from 4 to 20 pictures. The rules live in [`js/layout.js`](js/layout.js).

- One picture keeps its shape, up to 510 px tall.
- Two or more sit in one row with 4 px gaps. No picture takes more than 80% of the post width.
- Two pictures shrink to fit side by side, unless they are so wide that the second would be mostly hidden.
- From three pictures up, X leaves the second one cut off as a hint to scroll. They all show at once only as narrow strips: the row is 1.244 × the post width tall at most, so the widths ÷ heights have to add up to about 0.80 or less.
- A picture cut into strips shows whole, edge to edge, when it is cropped to 4:5.

The phone preview uses the same rules at a 390 px column. The X apps were not measured.

## Run it locally

No build step.

```bash
node tools/serve.mjs
```

Then open http://localhost:8940.

## Licence

MIT. Fonts: Inter and Geist Mono, both under the SIL Open Font License (see `fonts/`).
