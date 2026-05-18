import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Utils } from "electrobun/bun";
import type { RadiusRPC } from "../shared/types";
import { getAttachment } from "./gmail";
import { getValidAccessToken } from "./auth";
import type { NotificationPreferences } from "../shared/types";

let notificationPreferences: NotificationPreferences = {
  enabled: true,
  scope: "all",
  category: "all",
  mutedSenders: [],
  mutedThreads: [],
};

function normalizeSender(sender: string | null | undefined) {
  return (sender ?? "").trim().toLowerCase();
}

function shouldDeliverNotification(
  message: RadiusRPC["bun"]["requests"]["getMessage"]["response"],
) {
  if (!message || !notificationPreferences.enabled || message.isRead) return false;
  if (notificationPreferences.mutedThreads.includes(message.threadId)) return false;
  const sender = normalizeSender(message.from);
  if (sender && notificationPreferences.mutedSenders.includes(sender)) return false;
  if (notificationPreferences.scope === "important") {
    return Boolean(message.isImportant) || message.category === "important";
  }
  if (notificationPreferences.scope === "category") {
    return notificationPreferences.category === "all"
      ? true
      : message.category === notificationPreferences.category;
  }
  return true;
}

export function showNewMailNotification(
  message: RadiusRPC["bun"]["requests"]["getMessage"]["response"],
) {
  if (!message || !shouldDeliverNotification(message)) return;

  const sender = message.from?.split("<")[0].trim() || message.from || "Radius";
  Utils.showNotification({
    title: sender,
    subtitle: "New mail in Radius",
    body: message.subject || message.snippet || "You received a new email",
    silent: false,
  });
}

export function handleSetNotificationPreferences(
  prefs: NotificationPreferences,
) {
  notificationPreferences = {
    ...prefs,
    mutedSenders: prefs.mutedSenders.map((sender) => sender.trim().toLowerCase()).filter(Boolean),
    mutedThreads: prefs.mutedThreads.filter(Boolean),
  };
  return { success: true };
}

export function handleOpenExternalUrl({ url }: { url: string }) {
  try {
    const parsed = new URL(url);
    if (
      ![
        "http:",
        "https:",
        "mailto:",
        "tel:",
        "x-apple.systempreferences:",
      ].includes(parsed.protocol)
    ) {
      return {
        success: false,
        error: `Unsupported protocol: ${parsed.protocol}`,
      };
    }

    spawn("open", [parsed.toString()]);
    return { success: true };
  } catch (err) {
    console.error("openExternalUrl error:", err);
    return { success: false, error: String(err) };
  }
}

export function handleRequestNotificationPermission() {
  try {
    Utils.showNotification({
      title: "Radius notifications enabled",
      subtitle: "New mail alerts",
      body: "Radius will let you know when new email arrives while the app is open.",
      silent: false,
    });
    return { success: true };
  } catch (err) {
    console.error("requestNotificationPermission error:", err);
    return { success: false, error: String(err) };
  }
}

export function handleOpenNotificationSettings() {
  try {
    spawn("open", [
      "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
    ]);
    return { success: true };
  } catch (err) {
    console.error("openNotificationSettings error:", err);
    return { success: false, error: String(err) };
  }
}

export async function handlePreviewAttachment(params: {
  messageId: string;
  attachmentId: string;
  filename: string;
}) {
  try {
    const accessToken = await getValidAccessToken();
    const data = await getAttachment(accessToken, params.messageId, params.attachmentId);

    const tmpPath = join(tmpdir(), `radius-${params.messageId.slice(0, 8)}-${params.filename}`);
    await writeFile(tmpPath, Buffer.from(data, "base64"));

    spawn("open", [tmpPath]);
    return { success: true };
  } catch (err) {
    console.error("previewAttachment error:", err);
    return { success: false, error: String(err) };
  }
}
