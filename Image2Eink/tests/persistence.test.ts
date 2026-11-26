import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { saveProject, loadProject, putBlobs, getBlobs, closeDB } from '../src/db';
import { DEFAULT_SETTINGS, type ProjectJSON } from '../src/types';

describe('persistence', () => {
  it('restores the image list, crops and settings unchanged after reopening', async () => {
    const project: ProjectJSON = {
      version: 1,
      images: [
        {
          id: 'a',
          name: 'cat',
          fileName: 'cat.jpg',
          status: 'done',
          crop: { cx: 100.5, cy: 50.25, w: 200, h: 97.6, rot: 3, flip: true },
          settings: { ...DEFAULT_SETTINGS, mode: 'dither', algorithm: 'atkinson', gamma: 1.4, autoLevels: false },
          width: 4000,
          height: 3000,
          colorCount: 33,
        },
        {
          id: 'b',
          name: 'sprite',
          fileName: 'sprite.png',
          status: 'excluded',
          crop: { cx: 16, cy: 8, w: 41.666, h: 20.33, rot: 0, flip: false },
          settings: { ...DEFAULT_SETTINGS, mode: 'pixel', invert: true },
          width: 32,
          height: 16,
          colorCount: 4,
        },
      ],
    };
    await saveProject(project);
    await putBlobs('a', { original: new Blob(['x']), thumb: new Blob(['t']) });
    closeDB(); // simulate a page reload
    const loaded = await loadProject();
    expect(loaded).toEqual(project);
    expect(await getBlobs('a')).toBeDefined();
  });
});
