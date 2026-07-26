import { describe, expect, it } from 'vitest';
import {
  availableSequenceViews, primaryShowcaseCases, visibleStillTabs,
} from './workbench';

describe('workbench source contracts', () => {
  it('excludes the empty diagnostic control from the 12-case primary showcase', () => {
    const ids = [
      'bursting', 'coarse-froth', 'defocus', 'edge-framing', 'empty-control',
      'fine-froth', 'glare-storm', 'high-load', 'low-light-noise', 'mono-clean',
      'motion-fast', 'poly-normal', 'watery',
    ];
    const cases = ids.map((case_id) => ({ case_id, category: case_id, manifest_path: `${case_id}.json` }));
    const primary = primaryShowcaseCases(cases);
    expect(primary).toHaveLength(12);
    expect(primary.some((entry) => entry.case_id === 'empty-control')).toBe(false);
    expect(primary.some((entry) => entry.case_id === 'glare-storm')).toBe(true);
  });

  it('keeps canonical analysis tabs stable and hides upload tabs until a result exists', () => {
    expect(visibleStillTabs('canonical', false)).toHaveLength(9);
    expect(visibleStillTabs('canonical', true)).toHaveLength(9);
    expect(visibleStillTabs('upload', false)).toEqual([]);
    expect(visibleStillTabs('upload', true)).toHaveLength(9);
    expect(visibleStillTabs('canonical', true)).not.toContain('temporal');
  });

  it('never exposes a temporal view without a corresponding artifact', () => {
    const frame = {
      frame_index: 0,
      source_path: 'source.png',
      truth_path: 'truth.rle',
      prediction_path: null,
      overlay_path: 'overlay.png',
    };
    expect(availableSequenceViews(frame)).toEqual(['source', 'truth', 'overlay']);
    expect(availableSequenceViews({ ...frame, prediction_path: 'prediction.rle' }))
      .toEqual(['source', 'truth', 'prediction', 'overlay']);
  });
});
