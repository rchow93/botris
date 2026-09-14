// Minimal renderer bridge — exposes only what the game needs:
// quit (Q key) and leaderboard load/save.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("botris", {
  quit: () => ipcRenderer.send("app-quit"),
  loadScores: () => ipcRenderer.invoke("leaderboard:get"),
  saveScores: (entries) => ipcRenderer.invoke("leaderboard:save", entries),
});
