const { app, BrowserWindow, Menu, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// Global error handlers to prevent unhandled crash dialogs
process.on('uncaughtException', (err) => {
  console.error('[Rewind Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Rewind Main] Unhandled rejection:', reason);
});

let mainWindow = null;
const audioUrlCache = new Map();

// Download folder: %USERPROFILE%/Music/Rewind Downloads
let downloadsFolder = '';
function getDownloadsFolder() {
  if (!downloadsFolder) {
    try {
      const musicPath = app.getPath('music') || path.join(app.getPath('home'), 'Music');
      downloadsFolder = path.join(musicPath, 'Rewind Downloads');
      if (!fs.existsSync(downloadsFolder)) {
        fs.mkdirSync(downloadsFolder, { recursive: true });
      }
    } catch (err) {
      console.error('[Rewind Main] Failed to resolve music directory, falling back:', err);
      downloadsFolder = path.join(process.cwd(), 'Rewind Downloads');
      try {
        if (!fs.existsSync(downloadsFolder)) {
          fs.mkdirSync(downloadsFolder, { recursive: true });
        }
      } catch {}
    }
  }
  return downloadsFolder;
}

// Direct audio URL extraction
function extractDirectAudioUrl(videoId) {
  const cached = audioUrlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.url);
  }

  return new Promise((resolve) => {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const proc = spawn('python', [
      '-m', 'yt_dlp',
      '-f', 'ba[ext=m4a]/ba/b',
      '-g',
      '--no-warnings',
      '--no-playlist',
      videoUrl,
    ]);

    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.on('close', (code) => {
      if (code === 0 && output.trim()) {
        const lines = output.trim().split('\n');
        const directUrl = lines[lines.length - 1].trim();
        if (directUrl.startsWith('http')) {
          audioUrlCache.set(videoId, { url: directUrl, expires: Date.now() + 45 * 60 * 1000 });
          resolve(directUrl);
          return;
        }
      }
      resolve(null);
    });
    proc.on('error', () => resolve(null));
    setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(null);
    }, 10000);
  });
}

// Completely remove default Electron menu bar across the entire application
Menu.setApplicationMenu(null);

function checkServerReady(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findStandaloneServer() {
  const possiblePaths = [
    path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone', 'server.js'),
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    path.join(process.resourcesPath, '.next', 'standalone', 'server.js'),
    path.join(app.getAppPath(), '.next', 'standalone', 'server.js'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function ensureServerRunning(port = 3000) {
  if (await checkServerReady(port)) {
    console.log(`[Rewind Main] Server already running on port ${port}.`);
    return true;
  }

  const serverPath = findStandaloneServer();
  if (serverPath) {
    console.log(`[Rewind Main] Loading standalone server from: ${serverPath}`);
    try {
      process.env.PORT = String(port);
      process.env.HOSTNAME = '127.0.0.1';
      require(serverPath);

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await checkServerReady(port)) {
          console.log(`[Rewind Main] Standalone server successfully listening on port ${port}.`);
          return true;
        }
      }
    } catch (err) {
      console.error('[Rewind Main] Error executing standalone server:', err);
    }
  } else {
    console.warn('[Rewind Main] Standalone server.js not found, expecting external server.');
  }

  return await checkServerReady(port);
}

function createWindow() {
  const port = process.env.PORT || 3000;
  const startUrl = `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Rewind Music Player',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Intercept downloads and route directly to %USERPROFILE%/Music/Rewind Downloads
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const filename = item.getFilename();
    const targetFilePath = path.join(getDownloadsFolder(), filename);
    item.setSavePath(targetFilePath);

    item.on('updated', (_event, state) => {
      if (webContents.isDestroyed()) return;
      if (state === 'interrupted') {
        webContents.send('download-progress', { state: 'interrupted', filename });
      } else if (state === 'progressing') {
        const received = item.getReceivedBytes();
        const total = item.getTotalBytes();
        webContents.send('download-progress', {
          state: 'progressing',
          filename,
          received,
          total,
          percent: total > 0 ? Math.round((received / total) * 100) : 0,
        });
      }
    });

    item.once('done', (_event, state) => {
      if (webContents.isDestroyed()) return;
      if (state === 'completed') {
        webContents.send('download-complete', {
          status: 'completed',
          filename,
          filePath: targetFilePath,
        });
      } else {
        webContents.send('download-complete', {
          status: 'failed',
          state,
          filename,
        });
      }
    });
  });

  // Load URL with automatic retry if server is still starting
  const loadApp = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(startUrl).catch(() => {});
    }
  };

  mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
    console.log('[Rewind Main] Waiting for app server, code:', errorCode);
    if (errorCode === -102 || errorCode === -105 || errorCode === -106) {
      setTimeout(loadApp, 500);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-downloads-path', () => {
  return getDownloadsFolder();
});

ipcMain.handle('get-direct-audio-url', async (_event, videoId) => {
  return await extractDirectAudioUrl(videoId);
});

ipcMain.handle('open-downloads-folder', async () => {
  try {
    const folder = getDownloadsFolder();
    await shell.openPath(folder);
    return { success: true };
  } catch (err) {
    console.error('[Rewind Main] Failed to open downloads folder:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-item-in-folder', async (_event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    await shell.openPath(getDownloadsFolder());
    return { success: true };
  } catch (err) {
    console.error('[Rewind Main] Failed to show item in folder:', err);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  const port = process.env.PORT || 3000;
  await ensureServerRunning(port);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
