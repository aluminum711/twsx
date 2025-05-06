const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 580,
    height: 400,
    frame: false,
    resizable: true,
    useContentSize: true,
    maxHeight: 800,
    minHeight: 400,
    movable: true,
    alwaysOnTop: true, // 添加置顶功能
    transparent: true, // 支持透明背景
    hasShadow: false, // 移除窗口阴影
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 修改加载路径
  const indexPath = app.isPackaged
    ? path.join(__dirname, 'stock-monitor', 'dist', 'index.html')
    : path.join(__dirname, 'stock-monitor', 'dist', 'index.html');
    
  mainWindow.loadFile(indexPath);
  
  // 添加开发者工具方便调试
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

function startBackend() {
  const backendPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, 'backend');
    
  // 直接使用 node 进程而不是寻找 node 可执行文件
  const serverPath = path.join(backendPath, 'server.js');
  
  backendProcess = require('child_process').fork(serverPath, [], {
    cwd: backendPath,
    env: {
      ...process.env,
      NODE_ENV: app.isPackaged ? 'production' : 'development'
    }
  });

  backendProcess.on('message', (message) => {
    console.log('Backend message:', message);
  });

  backendProcess.on('error', (err) => {
    console.error('Backend error:', err);
  });

  // 添加退出事件监听
  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

// 修改 resize-window 事件处理
ipcMain.on('resize-window', (event, { width, height }) => {
  if (mainWindow) {
    // 确保高度不低于最小值
    const finalHeight = Math.max(height, 200);
    mainWindow.setSize(width, finalHeight);
  }
});