# Rewind Music Player 🎵

A modern, retro-futuristic desktop & web music player built with **Next.js 16**, **React 19**, and **Electron 44**. Stream complete audio recordings without video overhead, download tracks for offline listening, and enjoy a distraction-free native desktop experience.

---

## ✨ Features

- **🎧 Pure Audio Playback**: Eliminates video streaming in favor of native HTML5 audio. Fast loading, instant timeline seeking (HTTP 206 Partial Content), and low resource usage.
- **📥 Local Music Downloads**: Download any song directly to your computer. On the desktop app, files save automatically to `%USERPROFILE%\Music\Rewind Downloads`.
- **🖥️ Dedicated Desktop App**: Clean native window without browser bars or default Electron menus (`File`, `Edit`, etc.).
- **💿 Curated Playlists**: Over 220 tracks across categories:
  - **K-Pop 2026**
  - **Indie India**
  - **English Songs & Hits**
- **🔍 Universal Search**: Instant search across millions of tracks with live album artwork.
- **❤️ Collection & History**: Save favorites and track listening history backed by SQLite (`better-sqlite3`) and local storage.
- **📦 Windows Setup Installer**: Includes an official NSIS installer that creates Windows Desktop and Start Menu shortcuts.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (Turbopack, App Router)
- **Library**: [React 19](https://react.dev/)
- **Desktop Runtime**: [Electron 44](https://www.electronjs.org/) & [electron-builder](https://www.electron.build/)
- **Database**: SQLite with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) & [Drizzle ORM](https://orm.drizzle.team/)
- **Audio Extraction**: `yt-dlp` streaming engine
- **Icons**: [Lucide React](https://lucide.dev/)
- **Language**: TypeScript 5

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Python 3](https://www.python.org/) with `yt-dlp` installed:
  ```bash
  pip install -U yt-dlp
  ```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/rewind-music-player.git
   cd rewind-music-player
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## 💻 Running the App

### Web Mode (Development)
Run the local Next.js dev server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Desktop Mode (Electron)
Launch the Electron desktop application window:
```bash
npm run electron
```

---

## 📦 Building the Windows Executable (.exe)

### 1. Build the Windows Setup Installer (.exe)
Generates an installer wizard that automatically sets up Desktop and Start Menu shortcuts:
```bash
npm run electron:build
```
The output will be created at:
```
dist-electron/Rewind Music Player Setup 1.0.0.exe
```

### 2. Build the Standalone Portable (.exe)
Generates a single `.exe` file that can be copied anywhere and runs without installation:
```bash
npx electron-builder --win portable
```
The output will be created at:
```
dist-electron/Rewind Music Player 1.0.0.exe
```

---

## 📂 Project Structure

```
├── electron/
│   ├── main.cjs               # Electron main process (clean window, IPC, download router)
│   └── preload.cjs            # Electron preload contextBridge script
├── src/
│   ├── app/                   # Next.js App Router (pages & API routes)
│   │   ├── api/
│   │   │   ├── download/      # Audio download streaming endpoint
│   │   │   ├── library/       # SQLite favorites & history API
│   │   │   ├── search/        # Track search API
│   │   │   └── stream/        # Direct audio extraction and streaming
│   │   ├── globals.css        # Global design system & retro-futuristic theme
│   │   └── page.tsx           # Main application entry
│   ├── components/time/       # Player components, state hooks, and UI
│   │   ├── time-machine.tsx   # Core music player UI & views
│   │   ├── use-time-player.ts # Native HTML5 audio playback hook
│   │   └── album-object.tsx   # Album art & vinyl rendering
│   └── lib/time/              # Playlists, track metadata, and era definitions
├── scripts/
│   └── prepare-standalone.cjs # Standalone server asset preparation script
└── package.json
```

---

## 📜 License

MIT License. Designed and developed with care.
