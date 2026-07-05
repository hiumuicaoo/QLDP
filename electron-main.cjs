/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Tắt tăng tốc phần cứng (Hardware Acceleration) để tránh lỗi đơ màn hình/treo giao diện trên một số dòng máy Windows/Card đồ họa
// Đây là giải pháp triệt để cho lỗi "phải thu nhỏ xong phóng to lại mới sử dụng tiếp được"
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

// Gracefully handle EADDRINUSE if another instance of server is already running
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('Cổng 3000 đã được sử dụng. Electron sẽ kết nối với server hiện tại.');
  } else {
    console.error('Lỗi Uncaught Exception:', err);
  }
});

// Thiết lập môi trường mặc định là production để tối ưu hiệu năng
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const PORT = 3000;
const appPath = app.getAppPath();

// Đảm bảo dữ liệu ghi vào thư mục D:\DANGPHI trên Windows, hoặc thư mục tương đương/mặc định trên OS khác
let targetDataDir;
if (process.platform === 'win32') {
  targetDataDir = 'D:\\DANGPHI';
  try {
    if (!fs.existsSync(targetDataDir)) {
      fs.mkdirSync(targetDataDir, { recursive: true });
    }
  } catch (err) {
    console.warn('Không thể tạo thư mục D:\\DANGPHI (có thể do thiếu ổ D). Chuyển sang dùng thư mục dữ liệu mặc định của hệ thống.');
    targetDataDir = path.join(app.getPath('userData'), 'data');
  }
} else {
  targetDataDir = path.join(app.getPath('userData'), 'data');
}
process.env.DATABASE_DIR = targetDataDir;

// Cấu hình đường dẫn thư mục tĩnh (dist) cho Express
process.env.DIST_PATH = path.join(appPath, 'dist');

// Sao chép cơ sở dữ liệu mẫu ban đầu nếu chưa tồn tại
function copyInitialData() {
  const sourceDataDir = path.join(appPath, 'data');
  
  try {
    if (!fs.existsSync(targetDataDir)) {
      fs.mkdirSync(targetDataDir, { recursive: true });
    }
  } catch (err) {
    console.error('Không thể tạo thư mục dữ liệu:', err);
    return;
  }
  
  if (fs.existsSync(sourceDataDir)) {
    try {
      const files = fs.readdirSync(sourceDataDir);
      for (const file of files) {
        const srcFile = path.join(sourceDataDir, file);
        const destFile = path.join(targetDataDir, file);
        if (!fs.existsSync(destFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`Đã sao chép cơ sở dữ liệu mẫu: ${file}`);
        }
      }
    } catch (err) {
      console.error('Lỗi khi sao chép dữ liệu mẫu:', err);
    }
  }
}

// Thực hiện chuẩn bị dữ liệu
copyInitialData();

// Khởi chạy Express server từ file đóng gói
try {
  console.log('Đang khởi động Express server...');
  require('./dist/server.cjs');
} catch (err) {
  console.error('Lỗi khi nạp server.cjs:', err);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Phần mềm Quản lý Đảng phí',
    autoHideMenuBar: true, // Ẩn thanh menu mặc định
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Hỗ trợ phím tắt F12 để bật DevTools và F5 để reload nhanh
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === 'F5' && input.type === 'keyDown') {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  // Chờ cho Express server sẵn sàng trước khi tải trang giao diện
  const url = `http://localhost:${PORT}`;
  
  function checkServerReady() {
    http.get(`${url}/api/data`, (res) => {
      if (res.statusCode === 200) {
        console.log('Express server đã hoạt động! Đang nạp giao diện...');
        mainWindow.loadURL(url);
      } else {
        setTimeout(checkServerReady, 100);
      }
    }).on('error', () => {
      setTimeout(checkServerReady, 100);
    });
  }

  checkServerReady();

  // Mở các liên kết bên ngoài (như xuất báo cáo Excel) bằng trình duyệt mặc định của hệ thống
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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
