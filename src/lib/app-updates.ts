import packageJson from "../../package.json";
import { isTauriEnvironment } from "@/lib/tauri-audio";

export const CURRENT_APP_VERSION = packageJson.version;
export const UPDATE_REPOSITORY_URL = "https://github.com/Esca-Byte/Rewind-Music";
const LATEST_RELEASE_API = "https://api.github.com/repos/Esca-Byte/Rewind-Music/releases/latest";

export interface AppReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface AppRelease {
  version: string;
  tagName: string;
  name: string;
  publishedAt: string;
  releaseUrl: string;
  installer?: AppReleaseAsset;
  assets: AppReleaseAsset[];
}

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "error";

function normalizeVersion(value: string): number[] {
  const match = value.match(/\d+(?:\.\d+){0,3}/);
  return (match?.[0] || "0").split(".").map((part) => Number(part) || 0);
}

export function isNewerVersion(latest: string, current: string): boolean {
  const left = normalizeVersion(latest);
  const right = normalizeVersion(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function fetchLatestRelease(signal?: AbortSignal): Promise<AppRelease> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

  const payload = await response.json() as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
  };
  const tagName = payload.tag_name || "";
  const assets = (payload.assets || [])
    .filter((asset): asset is { name: string; browser_download_url: string; size?: number } =>
      Boolean(asset.name && asset.browser_download_url)
    )
    .map((asset) => ({
      name: asset.name,
      browserDownloadUrl: asset.browser_download_url,
      size: asset.size || 0,
    }));
  const installer = assets.find((asset) => /setup\.exe$/i.test(asset.name))
    || assets.find((asset) => /\.exe$/i.test(asset.name))
    || assets.find((asset) => /\.(msi|dmg|appimage)$/i.test(asset.name));

  return {
    version: tagName.replace(/^v/i, "") || payload.name || "Unknown",
    tagName,
    name: payload.name || tagName || "Rewind update",
    publishedAt: payload.published_at || "",
    releaseUrl: payload.html_url || UPDATE_REPOSITORY_URL + "/releases",
    installer,
    assets,
  };
}

export async function openUpdateDownload(url: string): Promise<void> {
  if (isTauriEnvironment()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
