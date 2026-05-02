import { spawn } from "node:child_process";
import { Utils } from "electrobun/bun";
import type { RadiusRPC } from "../shared/types";

export function showNewMailNotification(
  message: RadiusRPC["bun"]["requests"]["getMessage"]["response"],
) {
  if (!message || message.isRead) return;

  const sender = message.from?.split("<")[0].trim() || message.from || "Radius";
  Utils.showNotification({
    title: sender,
    subtitle: "New mail in Radius",
    body: message.subject || message.snippet || "You received a new email",
    silent: false,
  });
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