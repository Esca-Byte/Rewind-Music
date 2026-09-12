export interface ElectronAPI {
  isElectron: boolean;
  getDownloadsPath: () => Promise<string>;
  openDownloadsFolder: () => Promise<{ success: boolean; error?: string }>;
  openItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  getDirectAudioUrl: (videoId: string) => Promise<string | null>;
  onDownloadProgress: (callback: (data: { state: string; filename: string; received?: number; total?: number; percent?: number }) => void) => () => void;
  onDownloadComplete: (callback: (data: { status: string; filename: string; filePath?: string; error?: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
