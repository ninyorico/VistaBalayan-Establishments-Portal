export const MAX_AI_ITEMS = 10;
export const INITIAL_AI_ITEMS_VISIBLE = 5;

export const formatPhilippineDateTime = (value?: string | null) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return `${new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} PHT`;
};
