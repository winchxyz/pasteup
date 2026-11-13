# Pasteup

Lay out pictures for X before you post them.

**Open it: https://winchxyz.github.io/pasteup/**

- **Post.** Add up to 20 pictures and see the row X builds from them: which ones show, where the row scrolls, what gets trimmed. Crop each picture, drag to reorder, download them numbered in post order.
- **Cut one picture.** Slice a picture into 2 to 20 strips that read as one image in the feed. The cuts can be uneven, and the picture can carry on behind the 4 px gaps so nothing jumps.
- **Profile.** Place an avatar and a banner, drag them right in the preview, download them at 400 × 400 and 1500 × 500.
- **Dark and light**, side by side if you like, at computer and phone width.

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
