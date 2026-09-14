// Electron main process — creates the game window and loads the renderer.
// In dev, `npm run dev` starts Vite and sets ELECTRON_START_URL; otherwise
// the production build in dist/ is loaded from disk.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 780,
    title: "Botris",
    backgroundColor: "#0f1117",
    resizable: true,
    webPreferences: {
      // The game is fully client-side; no node access needed in the renderer.
      // The preload script exposes only `window.botris.quit` (for the Q key).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    const dist = path.join(__dirname, "..", "dist", "index.html");
    if (fs.existsSync(dist)) {
      win.loadFile(dist);
    } else {
      // No build yet — point at the dev server if it's running.
      win.loadURL("http://127.0.0.1:5173");
    }
  }

  // The game never navigates or opens windows; block both so a stray link
  // can't load remote content into the app window. Reloads are allowed.
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

// Renderer asks to quit (Q key).
ipcMain.on("app-quit", () => app.quit());

// Leaderboard persistence — a flat JSON file in the app's userData dir
// (~/Library/Application Support/botris/leaderboard.json on macOS).
// The top-10 logic lives in the renderer; main only does file I/O.
const LEADERBOARD_FILE = path.join(app.getPath("userData"), "leaderboard.json");

// One-time migration: the app was renamed, which also moves the userData
// dir. Carry over a pre-rename leaderboard so old scores survive.
(function migrateLegacyLeaderboard() {
  const legacy = path.join(
    path.dirname(app.getPath("userData")),
    "tetris",
    "leaderboard.json"
  );
  if (!fs.existsSync(LEADERBOARD_FILE) && fs.existsSync(legacy)) {
    fs.copyFileSync(legacy, LEADERBOARD_FILE);
  }
})();

function readLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf8"));
  } catch {
    return []; // missing or corrupt file — start with an empty board
  }
}

ipcMain.handle("leaderboard:get", () => readLeaderboard());

// Sanity-check renderer input before it touches disk: a top-10 list of
// plain score records. Anything else is rejected.
function isValidBoard(entries) {
  return (
    Array.isArray(entries) &&
    entries.length <= 10 &&
    entries.every(
      (e) =>
        e &&
        typeof e.name === "string" &&
        e.name.length <= 32 &&
        Number.isFinite(e.score) &&
        Number.isFinite(e.lines) &&
        Number.isFinite(e.level) &&
        typeof e.date === "string" &&
        e.date.length <= 40
    )
  );
}

ipcMain.handle("leaderboard:save", (_event, entries) => {
  if (!isValidBoard(entries)) return false;
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2));
  return true;
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
