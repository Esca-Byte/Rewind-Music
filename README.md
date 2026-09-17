# Rewind Music Player 🎵

A lightweight, high-performance, retro-futuristic desktop music player built with **Tauri v2**, **Next.js 16**, **React 19**, and **Rust**.

Rewind provides a distraction-free audio experience with instant seeking, local storage for favorites and history, offline song downloads, and a bundled `yt-dlp` native sidecar.

---

## ⚡ Highlights (Why Tauri v2?)

- **🚀 Ultra-Lightweight Binary**: Setup installer is only **~21 MB** (down from >180 MB in Electron), and memory consumption is drastically reduced.
- **⚡ Fast Native Startup**: Native Windows WebView2 runtime powered by Rust core backend.
- **🎧 Pure Audio Playback**: Zero video decoding overhead. Streams direct audio feeds using native HTML5 `<audio>`.
- **📥 Local Offline Downloads**: Download tracks directly to `%USERPROFILE%\Music\Rewind Downloads` using the bundled `yt-dlp` sidecar without requiring external Python installations.
- **🔍 Native YouTube Search**: Embedded sidecar querying for instant discovery.
- **💿 220+ Preloaded Tracks**: Curated playlists covering **K-Pop**, **Indie India**, and **English Hits**.
- **📦 Clean NSIS Installer**: Creates Windows Desktop and Start Menu shortcuts automatically.

---

## 🛠️ Tech Stack

- **Desktop Framework**: [Tauri v2](https://v2.tauri.app/)
- **Core Native Backend**: Rust 2021 + Tauri Plugins (`shell`, `fs`, `dialog`, `process`)
- **Frontend Framework**: [Next.js 16](https://nextjs.org/) (Static HTML/CSS/JS export)
- **UI Library**: [React 19](https://react.dev/) + [Lucide React](https://lucide.dev/)
- **Styling**: Tailored CSS design tokens & retro-futuristic theme
- **Sidecar Engine**: Bundled `yt-dlp` Windows MSVC binary

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Rust & Cargo](https://rustup.rs/) (v1.78+)
- Microsoft C++ Build Tools (MSVC)

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the Tauri v2 Desktop App in development mode:
   ```bash
   npm run tauri:dev
   ```

3. Or run only the frontend dev server:
   ```bash
   npm run dev
   ```

---

## 📦 Building the Windows Executable & Installer

To build the production release binary and NSIS setup installer:

```bash
npm run tauri:build
```

### Build Artifacts:
- **Installer (.exe)**:
  ```
  src-tauri/target/release/bundle/nsis/Rewind Music Player_1.0.0_x64-setup.exe
  ```
- **Standalone Portable (.exe)**:
  ```
  src-tauri/target/release/Rewind Music Player Standalone.exe
  ```

---

## 📂 Project Structure

```
├── src-tauri/                 # Tauri v2 Rust project
│   ├── binaries/              # Native sidecars (yt-dlp)
│   ├── capabilities/          # Security permissions (shell, fs, dialog)
│   ├── src/                   # Rust entry points (main.rs, lib.rs)
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri v2 configuration & window settings
├── src/
│   ├── app/                   # Next.js App Router (static export)
│   ├── components/time/       # Player components, state hooks, and UI
│   │   ├── time-machine.tsx   # Core music player UI & views
│   │   ├── use-time-player.ts # Native HTML5 audio playback hook
│   │   └── album-object.tsx   # Album art & vinyl rendering
│   └── lib/
│       ├── tauri-audio.ts     # Native Tauri sidecar audio & download bridge
│       └── time/              # Playlists, track metadata, and era definitions
├── out/                       # Next.js static export directory
└── package.json
```

---

## 📜 License

MIT License.
