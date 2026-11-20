export const cleanAiText = (value?: string | null) =>
  String(value || '')
    .replace(/\s*Confidence:\s*[^\n.]+(?:\([^)]*\))?\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

export const splitAiRecommendation = (description?: string | null, recommendedAction?: string | null) => {
  const raw = String(description || '');
  const match = raw.match(/^(.*?)(?:\s*Recommended action:\s*)(.*)$/i);

  const summary = cleanAiText(match ? match[1] : raw);
  const action = cleanAiText(recommendedAction || (match ? match[2] : ''));

  return { summary, action };
};
