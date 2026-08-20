/**
 * 렌더러(게임)와 메인 프로세스를 잇는 최소한의 다리.
 *
 * contextIsolation이 켜져 있어서 게임 코드는 Node API에 직접 접근할 수 없어요.
 * 여기서 **필요한 것만** 골라 window.desktop으로 노출합니다.
 * (msbuild/src/platform.js가 이 객체를 씁니다)
 */

const { contextBridge, ipcRenderer } = require('electron');

/** 이벤트 구독을 만들고 해제 함수를 돌려주는 헬퍼 */
function subscribe(channel, handler) {
  const listener = () => handler();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktop', {
  /** 종료 확인 모달에서 "종료하기" */
  close: () => ipcRenderer.invoke('app:close'),

  /** 창이 뒤로 가면 소리를 멈추고 일시정지하려고 구독해요. */
  onWindowBlur: (handler) => subscribe('window:blur', handler),
  onWindowFocus: (handler) => subscribe('window:focus', handler),
});
