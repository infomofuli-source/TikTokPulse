const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

function loadConfig() {
  const configPath = path.join(app.getAppPath(), "config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    return { serverUrl: "http://localhost:4100" };
  }
}

function offlineHtml(serverUrl, reason) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html><body style="font-family:system-ui;background:#15131a;color:#f1eff5;
      display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;max-width:420px;">
        <h2 style="color:#ff5c82;">Can't reach TikTok Pulse</h2>
        <p>Tried: <code>${serverUrl}</code></p>
        <p style="color:#aca7b8;font-size:0.85rem;">${reason || "Make sure the backend is running, or check desktop/config.json points at the right URL."}</p>
      </div>
    </body></html>
  `)}`;
}

function createWindow() {
  const config = loadConfig();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "TikTok Pulse",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(config.serverUrl);

  win.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    win.loadURL(offlineHtml(config.serverUrl, errorDescription));
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
