export type ThemedFeedbackReview = {
  comment?: string | null;
  verified: boolean;
  status: string;
  suspicious: boolean;
};

export type FeedbackTheme = {
  key: string;
  label: string;
  count: number;
  share: number;
};

const THEME_RULES: Array<{ key: string; label: string; words: string[] }> = [
  { key: 'service', label: 'Service and staff', words: ['staff', 'service', 'host', 'owner', 'friendly', 'helpful'] },
  { key: 'cleanliness', label: 'Cleanliness', words: ['clean', 'dirty', 'hygiene', 'room', 'bathroom'] },
  { key: 'location', label: 'Location and access', words: ['location', 'accessible', 'access', 'near', 'far', 'parking', 'road'] },
  { key: 'value', label: 'Value and price', words: ['price', 'value', 'affordable', 'expensive', 'cost', 'worth'] },
  { key: 'amenities', label: 'Amenities and facilities', words: ['pool', 'wifi', 'amenity', 'facility', 'facilities', 'view', 'beach'] },
  { key: 'comfort', label: 'Comfort and experience', words: ['comfortable', 'comfort', 'quiet', 'experience', 'relax', 'enjoy'] },
];

const round = (value: number) => Math.round(value * 100) / 100;

export function classifyFeedbackThemes(reviews: ThemedFeedbackReview[]): FeedbackTheme[] {
  const eligibleComments = (reviews || [])
    .filter((review) => review.verified && review.status === 'published' && !review.suspicious)
    .map((review) => (review.comment || '').trim().toLocaleLowerCase())
    .filter(Boolean);
  const counts = new Map(THEME_RULES.map((theme) => [theme.key, { ...theme, count: 0 }]));
  let unclassified = 0;
  for (const comment of eligibleComments) {
    let matched = false;
    for (const theme of THEME_RULES) {
      if (theme.words.some((word) => comment.includes(word))) {
        counts.get(theme.key)!.count += 1;
        matched = true;
      }
    }
    if (!matched) unclassified += 1;
  }
  const denominator = eligibleComments.length;
  const themes = [...counts.values()]
    .filter((theme) => theme.count > 0)
    .map((theme) => ({ key: theme.key, label: theme.label, count: theme.count, share: denominator ? round((theme.count / denominator) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (unclassified > 0) themes.push({ key: 'other', label: 'Other published comments', count: unclassified, share: denominator ? round((unclassified / denominator) * 100) : 0 });
  return themes;
}
