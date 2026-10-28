export const CONTACT_NUMBER_ERROR = "Contact number must contain exactly 11 digits.";

export const sanitizeContactNumber = (value: string) => value.replace(/\D/g, "").slice(0, 11);

export const isValidContactNumber = (value: string) => /^\d{11}$/.test(value);
