const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");
const { startServer } = require("./server");

let mainWindow = null;
let localServer = null;
const APP_PORT = 3210;
const WINDOW_ICON = path.join(__dirname, "build", "icon.png");

function registerStartup() {
  if (process.platform !== "win32") {
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
    title: "LoL Next Item Assistant",
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
    mainWindow = null;
  });
}

async function boot() {
  registerStartup();
  localServer = await startServer(APP_PORT);
  createWindow();
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
