# Egg Studio

Local, browser-only tool for cropping and converting images for 1-bit e-ink panels. Exports
`easter_eggs.h`, which the parent sketch, Crow's Nest (`crows-nest-eink.ino`), shows as an Easter egg
when MENU and EXIT are held together for a second.

**Output panel** (top bar, saved with the project):

| Preset | Size | Bytes per image |
|---|---|---|
| Elecrow CrowPanel 4.2" (default) | 400 x 300 | 15,000 |
| Heltec Vision Master E213 2.13" (the original `cabin_hud` project) | 250 x 122 | 3,904 |
| Custom | any width and height from 8 to 2000 | ceil(w / 8) x h |

Every image in one header shares the size. Changing it keeps each crop's centre and width and lets the
height follow the new aspect ratio, so check the framing afterwards. Projects saved before this setting
existed open as 250 x 122.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (serve it with any static server, e.g. `npx vite preview`)
npm test         # unit tests (Vitest)
```

Nothing is uploaded anywhere. The project auto-saves to IndexedDB in the browser.

## Workflow

1. Drop images or folders on the window, or use **+ Add images** / **+ Folder**.
2. Pick an image in the sidebar. Frame it: drag to pan, wheel or pinch to zoom about the cursor, drag a corner to resize.
3. Tune the conversion on the right while you watch the live 1-bit preview under the editor.
4. Press `D` (done) or `X` (exclude), then `N` for the next image.
5. **Export ▸ Write easter_eggs.h to folder…**: pick the sketch folder (`crows-nest-eink`) once. Chrome or Edge remember it and overwrite the file directly. Other browsers download the file instead.

## Keyboard

| Key | Action |
|---|---|
| Arrows / Shift+arrows | Nudge 1 / 10 output pixels (1 source pixel in pixel-art snap mode) |
| `+` / `-` | Zoom |
| `F` / `G` | Fit / Fill |
| `N` `J` / `P` `K` | Next / previous image |
| `D` / `X` | Toggle done / excluded |
| `F2` | Rename |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo (per image) |
| Ctrl+S | Save `.eggproj` |

## Notes

- **Crop storage.** `crop = { cx, cy, w, h, rot, flip }` in full-resolution source pixels.
  `(cx, cy)` is the source point at the frame centre, `w x h` is the frame size in source pixels,
  `rot` is quarter turns clockwise and `flip` is a horizontal mirror applied before rotation.
  Rotation turns the image around the frame centre, so four rotations return the original crop.
- **Resampling.** The worker builds an area-averaged mip pyramid of the working copy (long edge 2000 px),
  samples the level just above the target resolution bilinearly and finishes with a box filter.
  When you zoom in past the working copy's resolution, it crops from the full-resolution original instead.
  Pixel art always uses nearest-neighbour.
- **Greyscale.** Rec. 709 luma is computed before resampling. That's mathematically identical to the
  spec's order, because both steps are linear. The **Linear light** toggle averages and dithers in linear light.
- **Auto-levels** uses the 0.5% / 99.5% percentiles, with gain capped at 8x so near-flat crops don't explode into noise.
- **`spec.md`** is the original spec, written for the Heltec at a fixed 250 x 122. The format is unchanged;
  only the size is now a setting.
- **Spec erratum.** Section 8 says an all-black row ends in `0xFC`. With 250 px the last byte holds 2 pixels and 6 padding bits,
  so the correct value is `0xC0`, which also matches the spec's own "pixel 249 → `0x40`" rule. The tests check `0xC0`.
- **Header compile test.** Uses `g++` or `clang++` if present, otherwise `g++` inside WSL on Windows, and skips if neither exists.
- **Tests** pin themselves to 250 x 122 where they check the original spec's numbers; `tests/panel.test.ts` covers the selectable size.
- **Hardware check.** **Project ▸ Add test pattern** adds a panel-sized 1:1 image with a border, a diagonal and the text "TOP-LEFT".
  Flash it to confirm there's no offset, mirroring or inversion.
