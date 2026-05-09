export interface ContactOption {
  name: string;
  email: string;
  label: string;
  source: "recent" | "account" | "manual";
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type AttachmentType = "file" | "image" | "link";

export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string; // File name or Link URL
  url?: string; // Object URL for images or actual link
  size?: number; // File size in bytes
  mimeType?: string;
  dataBase64?: string;
  file?: File; // The actual file object
}

export function isValidUrl(url: string) {
  return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(url.trim());
}
