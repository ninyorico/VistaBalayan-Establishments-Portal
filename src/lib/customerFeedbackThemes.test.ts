import { describe, expect, it } from 'vitest';
import { classifyFeedbackThemes } from './customerFeedbackThemes';

describe('classifyFeedbackThemes', () => {
  it('uses only eligible published non-suspicious comments', () => {
    const themes = classifyFeedbackThemes([
      { verified: true, status: 'published', suspicious: false, comment: 'Friendly staff and clean rooms' },
      { verified: false, status: 'published', suspicious: false, comment: 'Very clean' },
      { verified: true, status: 'rejected', suspicious: false, comment: 'Great service' },
      { verified: true, status: 'published', suspicious: true, comment: 'Excellent service' },
    ]);
    expect(themes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'service', count: 1 }),
      expect.objectContaining({ key: 'cleanliness', count: 1 }),
    ]));
    expect(themes.reduce((sum, theme) => sum + theme.count, 0)).toBe(2);
  });

  it('supports multiple themes while keeping deterministic ordering and shares', () => {
    const themes = classifyFeedbackThemes([
      { verified: true, status: 'published', suspicious: false, comment: 'Friendly staff, clean room, great pool' },
      { verified: true, status: 'published', suspicious: false, comment: 'Affordable price and quiet experience' },
      { verified: true, status: 'published', suspicious: false, comment: 'Something else' },
    ]);
    expect(themes[0]).toMatchObject({ key: 'amenities', count: 1, share: 33.33 });
    expect(themes).toContainEqual({ key: 'other', label: 'Other published comments', count: 1, share: 33.33 });
  });

  it('returns no themes when there are no eligible comments', () => {
    expect(classifyFeedbackThemes([])).toEqual([]);
  });
});
