<div align="center">
  <img src="public/rewindlogo.png" alt="Rewind Music Player Logo" width="110" height="110" />

  # Rewind Music Player

  **A modern, distraction-free desktop music player streaming official YouTube full recordings with high-fidelity sound, custom playlists, and native offline downloads.**

  <p>
    <a href="https://github.com/Esca-Byte/Rewind-Music/releases"><img src="https://img.shields.io/badge/Release-v1.0.1-rose?style=flat-square&color=e11d48" alt="Version 1.0.1" /></a>
    <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Desktop-Tauri_v2-blue?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2" /></a>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Frontend-Next.js_16-black?style=flat-square&logo=next.js" alt="Next.js 16" /></a>
    <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Backend-Rust-orange?style=flat-square&logo=rust" alt="Rust" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-emerald?style=flat-square&color=10b981" alt="GPL-3.0" /></a>
  </p>
</div>

---

## ✨ Features

- 🎧 **100% Full Recordings**: Pure audio streaming with instant playback and zero video overhead.
- 📥 **True Offline Downloads**: Download songs locally with the bundled native sidecar—no external tools needed.
- 🎛️ **Full Playback Queue**: Dynamic reordering, upcoming track previews, and instant queue management.
- 🎨 **5 Curated Color Themes**: Switch between *Midnight Vinyl*, *Cyberpunk Neon*, *Warm Analog*, *Nordic Forest*, and *Tokyo Sunset*.
- 📋 **YouTube Playlist Import**: Paste any public YouTube playlist URL or ID to instantly import all songs.
- ⚡ **Ultra Lightweight**: Built on Tauri v2 and Rust—fast startup and minimal memory usage.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://rustup.rs/) (v1.78+)

### Development
```bash
# 1. Install dependencies
npm install

# 2. Run the desktop app in development
npm run tauri:dev
```

### Production Build
```bash
# Build the optimized desktop binary & setup installer
npm run tauri:build
```
*Installer output will be located in: `src-tauri/target/release/bundle/nsis/`*

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](LICENSE) file for details.
