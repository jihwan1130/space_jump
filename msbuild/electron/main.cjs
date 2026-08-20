/**
 * Electron 메인 프로세스 — MS Store(MSIX) 빌드용.
 *
 * 게임은 세로가 긴 캔버스라 창도 세로로 열어요.
 * 스토어 심사에서 걸리기 쉬운 항목을 기본값으로 잠가 뒀어요.
 *  - 번들된 파일만 로드 (원격 콘텐츠 없음)
 *  - 새 창 열기 금지 (외부 링크는 기본 브라우저로)
 *  - nodeIntegration 끔 / contextIsolation 켬 / sandbox 켬
 */

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const appProtocol = require('./app-protocol.cjs');

/** 창 기본 크기 — 게임 논리 해상도(480×854)의 세로 비율을 따라가요. */
const WIN_W = 480;
const WIN_H = 854;

let win = null;

// app:// 스킴 등록은 whenReady 이전이어야 해요.
appProtocol.registerScheme();

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    minWidth: 360,
    minHeight: 640,
    // 첫 페인트 전까지 흰 화면이 번쩍이지 않게 게임 배경색으로 채워요.
    backgroundColor: '#05060f',
    show: false,
    autoHideMenuBar: true,
    title: '궤도탈출',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 게임에 개발자도구가 필요 없어요. 스토어 빌드에서는 꺼둡니다.
      devTools: !app.isPackaged,
    },
  });

  // 상단 메뉴바 제거 (게임에 File/Edit 메뉴는 어색해요)
  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => win.show());

  // 창이 가려지면 소리를 멈추도록 렌더러에 알려줘요.
  win.on('blur', () => win.webContents.send('window:blur'));
  win.on('focus', () => win.webContents.send('window:focus'));
  win.on('closed', () => {
    win = null;
  });

  /* ── 보안: 번들 밖으로 나가지 못하게 막아요 ── */

  // 새 창 요청은 전부 거부하고, 외부 링크만 기본 브라우저로 넘겨요.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 페이지 자체가 외부 URL로 넘어가는 것도 막아요.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });

  win.loadURL('app://bundle/index.html');
}

/* ── 렌더러가 부르는 기능 ── */

// 종료 확인 모달에서 "종료하기"를 눌렀을 때
ipcMain.handle('app:close', () => {
  win?.close();
});

// 두 번 실행하면 기존 창을 앞으로 가져와요. (스토어 앱 기본 동작)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    appProtocol.handle();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
