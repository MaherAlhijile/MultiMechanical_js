// main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
const { URL } = require('url');

dotenv.config(); // Load .env

let mainWindow; // Reference to main window

// ------------------ CREATE WINDOWS ------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Send environment variables to renderer
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('env', { BROKER_URL: process.env.BROKER_URL });
  });
}

function createMicroscopeWindow() {
  if (mainWindow) mainWindow.hide();

  const microscopeWindow = new BrowserWindow({
    width: 1950,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  microscopeWindow.loadFile(path.join(__dirname, 'windows/microscope/window.html'));

  microscopeWindow.on('closed', () => {
    if (mainWindow) mainWindow.show();
  });
}

// ------------------ GOOGLE OAUTH ------------------
// ------------------ GOOGLE OAUTH INSIDE APP ------------------
async function performGoogleOAuth() {
  return new Promise((resolve, reject) => {
    const authUrl = `${process.env.BROKER_URL}/auth/google`;

    // Create a popup BrowserWindow for OAuth
    const oauthWindow = new BrowserWindow({
      width: 600,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    oauthWindow.loadURL(authUrl);

    // Detect navigation changes (to catch the redirect)
    oauthWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith('http://localhost:4000/auth/success')) {
        event.preventDefault(); // stop default navigation

        const urlObj = new URL(url);
        const token = urlObj.searchParams.get('token');
        const name = urlObj.searchParams.get('name');
        const email = urlObj.searchParams.get('email');

        oauthWindow.close(); // close popup

        if (token && name) {
          resolve({ token, name, email });
        } else {
          reject(new Error('Missing token or user info'));
        }
      }
    });

    oauthWindow.on('closed', () => {
      reject(new Error('OAuth window closed by user'));
    });
  });
}


// ------------------ APP EVENTS ------------------
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------ IPC HANDLERS ------------------
ipcMain.on('toMain', (event, message) => {
  console.log('Message from renderer:', message);
});

ipcMain.on('open-microscope', () => {
  createMicroscopeWindow();
});

ipcMain.handle('google-login', async () => {
  try {
    const userData = await performGoogleOAuth();
    return userData; // { token, name, email }
  } catch (err) {
    console.error('Google login failed:', err);
    throw err;
  }
});
