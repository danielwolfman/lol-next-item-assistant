const path = require("node:path");
const http = require("node:http");
const { app, BrowserWindow, shell } = require("electron");
const { startServer } = require("./server");

let mainWindow = null;
let localServer = null;
let gameStateTimer = null;
let lastGameActive = null;
const APP_PORT = 3210;
const WINDOW_ICON = path.join(__dirname, "build", "icon.png");

function registerStartup() {
  if (process.platform !== "win32" || !app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: []
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 1040,
    minHeight: 760,
    backgroundColor: "#07131c",
    icon: WINDOW_ICON,
    autoHideMenuBar: true,
    title: "LoL Item Coach",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${APP_PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    stopGameStatePolling();
    mainWindow = null;
  });
}

function httpGetJson(targetUrl, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get(targetUrl, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${targetUrl}: ${error.message}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Timed out requesting ${targetUrl}`));
    });
    req.on("error", reject);
  });
}

function syncWindowForGameState(gameActive) {
  if (!mainWindow || mainWindow.isDestroyed() || lastGameActive === gameActive) {
    return;
  }

  lastGameActive = gameActive;

  if (gameActive) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    return;
  }

  if (!mainWindow.isMinimized()) {
    mainWindow.minimize();
  }
}

async function pollGameState() {
  try {
    const payload = await httpGetJson(`http://127.0.0.1:${APP_PORT}/api/state`);
    syncWindowForGameState(payload.gameActive === true);
  } catch {
    // Ignore transient local-server errors and leave the current window state alone.
  }
}

function stopGameStatePolling() {
  if (gameStateTimer) {
    clearInterval(gameStateTimer);
    gameStateTimer = null;
  }
}

function startGameStatePolling() {
  stopGameStatePolling();
  pollGameState();
  gameStateTimer = setInterval(pollGameState, 4000);
}

async function boot() {
  registerStartup();
  localServer = await startServer(APP_PORT);
  createWindow();
  startGameStatePolling();
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopGameStatePolling();
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
