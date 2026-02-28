import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import os from 'os'
import { encryptFile, decryptFile, activeControllers, getDirSize, generateRecoveryData } from './cryptoManager'

const configPath = join(app.getPath('userData'), 'cipher-config.json');

const secureTempDir = join(os.tmpdir(), 'cipher-v2-temp');
if (!fs.existsSync(secureTempDir)) {
  fs.mkdirSync(secureTempDir, { recursive: true, mode: 0o700 });
}

function getConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!data.language) data.language = 'en';
      return data;
    }
  } catch (e) { }
  return { isSetup: false, recoveryData: null, language: 'en' };
}

function saveConfig(dataObj: any) {
  fs.writeFileSync(configPath, JSON.stringify(dataObj), 'utf-8');
}

const activeTempFiles: string[] = [];

const initialFiles: string[] = [];

// --- MACOS FILE COLLECTOR ---
let openFileTimeout: NodeJS.Timeout | null = null;
app.on('open-file', (event, path) => {
  event.preventDefault();
  initialFiles.push(path);

  if (app.isReady()) {
    if (openFileTimeout) clearTimeout(openFileTimeout);
    openFileTimeout = setTimeout(() => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow && initialFiles.length > 0) {
        mainWindow.webContents.send('open-file-direct', [...initialFiles]);
        initialFiles.length = 0;
      }
    }, 100);
  }
});

function cleanUpTempFiles() {
  if (activeTempFiles.length > 0) {
    activeTempFiles.forEach((file) => {
      try { if (fs.existsSync(file)) fs.rmSync(file, { recursive: true, force: true }); } catch (e) { }
    });
    activeTempFiles.length = 0;
  }
  try { if (fs.existsSync(secureTempDir)) fs.rmSync(secureTempDir, { recursive: true, force: true }); } catch (e) { }
}

const SECURITY_RULES = {
  win32: { exts: ['.exe', '.dll', '.sys'], paths: ['C:\\Windows'] },
  darwin: { exts: ['.app', '.pkg'], paths: ['/System', '/usr'] },
  linux: { exts: ['.bin', '.sh'], paths: ['/bin', '/usr', '/etc', '/var', '/proc', '/sys', '/dev'] }
};

function validateSecurity(filePath: string): { valid: boolean; reason?: string } {
  const absPath = resolve(filePath);
  const platform = process.platform;
  const rules = SECURITY_RULES[platform as keyof typeof SECURITY_RULES] || SECURITY_RULES.linux;

  if (filePath === '.' || filePath === '..' || absPath === resolve('.')) return { valid: false, reason: "ERR_CRITICAL_ROOT" };

  try {
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink()) return { valid: false, reason: "ERR_SYMLINK" };
    if (stat.isFIFO() || stat.isSocket()) return { valid: false, reason: "ERR_SYSTEM_FILE" };

    if (stat.isDirectory()) {
      const files = fs.readdirSync(absPath, { withFileTypes: true });
      for (const file of files) {
        const childCheck = validateSecurity(join(absPath, file.name));
        if (!childCheck.valid) return childCheck;
      }
    } else {
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (ext && rules.exts.includes('.' + ext)) return { valid: false, reason: `ERR_BLOCKED_EXT|${ext}` };
    }
  } catch (e) { return { valid: false, reason: "ERR_FILE_NOT_ACCESSIBLE" }; }

  const normalizedPath = absPath.toLowerCase();
  for (const blockedPath of rules.paths) {
    if (normalizedPath.startsWith(resolve(blockedPath).toLowerCase())) return { valid: false, reason: `ERR_PROTECTED_SYSTEM_PATH|${blockedPath}` };
  }
  return { valid: true };
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 450, height: 550, show: false, autoHideMenuBar: true,
    transparent: true, titleBarStyle: 'hiddenInset', vibrancy: 'fullscreen-ui',
    backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function parseArgs() {
  const args = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);

  for (let arg of args) {
    if (arg.startsWith('file://')) {
      arg = decodeURIComponent(arg.replace('file://', ''));
    }

    try {
      const resolvedPath = resolve(arg);
      if (
        !arg.startsWith('--') &&
        fs.existsSync(resolvedPath) &&
        resolvedPath !== resolve(process.execPath) &&
        resolvedPath !== resolve('.')
      ) {
        initialFiles.push(resolvedPath);
      }
    } catch (e) { }
  }
}

parseArgs();

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cipher')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()

  ipcMain.handle('get-initial-file', () => {
    const f = [...initialFiles];
    initialFiles.length = 0;
    return f;
  });

  ipcMain.handle('close-app', () => app.quit());

  ipcMain.handle('check-setup', () => {
    const cfg = getConfig();
    return { isSetup: cfg.isSetup, language: cfg.language };
  });

  // Generamos la llave RSA con las respuestas y la guardamos
  ipcMain.handle('save-setup', async (_event, answersHash, language) => {
    const recoveryData = generateRecoveryData(answersHash);
    saveConfig({ isSetup: true, recoveryData: recoveryData, language: language || 'en' });
    return true;
  });

  ipcMain.handle('save-language', async (_event, language) => {
    const cfg = getConfig();
    if (cfg.isSetup && cfg.recoveryData) saveConfig({ ...cfg, language });
    return true;
  });

  ipcMain.handle('encrypt-action', async (event, { files, password }) => {
    let generatedFiles: string[] = [];
    try {
      const config = getConfig();
      if (!config.recoveryData || !config.recoveryData.publicKey) return { success: false, error: "ERR_MISSING_CONFIG" };

      let totalSize = 0;
      let validFiles: string[] = [];

      for (const file of files) {
        const check = validateSecurity(file);
        if (!check.valid) throw new Error(check.reason);
        if (file.endsWith('.cipher')) continue;

        validFiles.push(file);
        const stats = fs.statSync(file);
        totalSize += stats.isDirectory() ? getDirSize(file) : stats.size;
      }

      let processedBytes = 0;
      let lastReportedPercent = 0;

      for (const file of validFiles) {
        // Passing the publicKey (the secure lock) to the encryptor
        const outPath = await encryptFile(file, password, config.recoveryData.publicKey, (chunkLen) => {
          processedBytes += chunkLen;
          let percent = totalSize === 0 ? 99 : Math.round((processedBytes / totalSize) * 100);
          if (percent > 99) percent = 99;
          if (percent > lastReportedPercent) {
            lastReportedPercent = percent;
            event.sender.send('encryption-progress', percent);
          }
        }, 'main-abort');
        generatedFiles.push(outPath);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      for (const file of validFiles) {
        const stats = fs.statSync(file);
        if (stats.isDirectory()) await fs.promises.rm(file, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        else await fs.promises.rm(file, { force: true, maxRetries: 5, retryDelay: 200 });
      }

      return { success: true };
    } catch (e: any) {
      for (const outPath of generatedFiles) {
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (err) { }
      }
      if (e.message === 'CANCELLED') return { success: false, cancelled: true };
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('cancel-action', async () => {
    const ac = activeControllers.get('main-abort');
    if (ac) ac.abort();
    return true;
  });

  ipcMain.handle('cancel-decrypt-action', async () => {
    const ac = activeControllers.get('decrypt-abort');
    if (ac) ac.abort();
    return true;
  });

  ipcMain.handle('decrypt-action', async (event, { files, secret, method, action }) => {
    let generatedFiles: string[] = [];
    try {
      const config = getConfig();
      const restore = action === 'restore';
      let totalSize = 0;

      for (const file of files) {
        const stats = fs.statSync(file);
        totalSize += stats.size;
      }

      let processedBytes = 0;
      let lastReportedPercent = 0;
      let lastTempPath: string | null = null;
      let tempPaths: string[] = [];

      for (const file of files) {
        // Passing config.recoveryData to the RSA method
        const outPath = await decryptFile(file, secret, method, restore, secureTempDir, (chunkLen) => {
          processedBytes += chunkLen;
          let percent = totalSize === 0 ? 99 : Math.round((processedBytes / totalSize) * 100);
          if (percent > 99) percent = 99;
          if (percent > lastReportedPercent) {
            lastReportedPercent = percent;
            event.sender.send('decryption-progress', percent);
          }
        }, 'decrypt-abort', config.recoveryData);

        generatedFiles.push(outPath);

        if (!restore) {
          activeTempFiles.push(outPath);
          tempPaths.push(outPath);
          lastTempPath = outPath;
        }
      }

      if (restore) {
        await new Promise(resolve => setTimeout(resolve, 300));
        for (const file of files) {
          await fs.promises.rm(file, { force: true, maxRetries: 5, retryDelay: 200 });
        }
      }

      if (!restore) {
        if (lastTempPath) shell.openPath(lastTempPath).catch(e => console.error(e));
        return { success: true, tempPath: lastTempPath };
      }
      return { success: true };

    } catch (e: any) {
      for (const outPath of generatedFiles) {
        try {
          const stats = fs.statSync(outPath);
          if (stats.isDirectory()) fs.rmSync(outPath, { recursive: true, force: true });
          else fs.unlinkSync(outPath);
        } catch (err) { }
      }

      if (e.message === 'CANCELLED') return { success: false, cancelled: true };
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('shred-action', async (_event, pathToShred) => {
    try {
      if (fs.existsSync(pathToShred)) {
        await fs.promises.rm(pathToShred, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
      const index = activeTempFiles.indexOf(pathToShred);
      if (index > -1) activeTempFiles.splice(index, 1);
      return true;
    } catch (e) { return false; }
  });

  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  cleanUpTempFiles();
  app.quit()
})

app.on('before-quit', cleanUpTempFiles);