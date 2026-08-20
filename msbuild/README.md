# 궤도탈출 — Microsoft Store (MSIX) 빌드

게임등급 심의를 받으려고 MS Store에 먼저 출시하기 위한 데스크톱 빌드예요.
**토스 빌드(`../`)는 이 폴더와 완전히 분리돼 있고, 여기서 아무것도 건드리지 않아요.**

---

## 어떻게 분리했나

게임 코드를 복사하지 않았어요. 원본 `../src/`를 그대로 쓰고, **플랫폼 어댑터 한 파일만** 갈아끼웁니다.

```
../src/main.js  ──import './platform.js'──┐
                                          │  vite.config.js가 이 import만 가로채요
../src/platform.js   (토스 SDK)           │
msbuild/src/platform.js (데스크톱)  ◀─────┘
```

- `../src/platform.js` 는 `@apps-in-toss/web-framework` 를 import하는 **유일한** 파일
- `../src/main.js` 는 platform을 import하는 **유일한** 파일

그래서 어댑터만 바꾸면 토스 SDK가 번들에서 완전히 빠져요. 실제로 확인한 결과:

| | 토스 빌드 | MS Store 빌드 |
|---|---|---|
| JS 번들 | 약 137 KB | 약 73 KB (토스 SDK 제거분) |
| `apps-in-toss` 흔적 | 있음 | **0** |

게임 로직(`game.js`·`skins.js`·`audio.js`·`cloud.js`)은 한 줄도 안 고쳤어요.

---

## 토스 빌드와 달라지는 것

| 기능 | 토스 | MS Store | 처리 |
|---|---|---|---|
| 광고 보고 부활 | 있음 | **없음** | `rewardAd.available = false` → 버튼이 항상 숨겨져요 |
| 토스 게임센터 랭킹 | 있음 | 없음 | `leaderboard.available = false` → 버튼이 항상 숨겨져요 |
| 자체 랭킹(Supabase) | 있음 | **그대로** | `cloud.js`가 따로 처리해서 영향 없어요 |
| 사용자 식별 | 토스 해시 | 기기 UUID | `getUserKey()`가 null → `getDeviceKey()`로 넘어가요 |
| 세이브 | 토스 저장소 | localStorage | `app://` origin에 남아 업데이트해도 유지돼요 |
| 햅틱 | 진동 | 없음 | 데스크톱에 진동 장치가 없어요 |
| 뒤로가기 | 시스템 제스처 | **Esc 키** | 시트 닫기 / 종료 확인 모달 |
| 안전영역 | 노치 대응 | 전부 0 | |

> **부활 버튼 요소는 DOM에 남아 있어요.** `main.js`가 `el.btnRevive`를 참조해서
> 요소를 지우면 널 참조로 터집니다. 화면에는 절대 나타나지 않아요.
> (요소를 정말 없애려면 공유 파일인 `../src/main.js`를 고쳐야 하는데, 그러면 토스 빌드에 영향이 가요)

---

## 명령어

```bash
npm install          # 최초 1회

npm run dev          # 브라우저에서 개발 (http://localhost:5273)
npm start            # 빌드 후 Electron 창으로 실행
npm run pack:dir     # 패키징만 (release/win-unpacked/궤도탈출.exe)
npm run pack:store   # 스토어 제출용 .appx 생성 (release/)
```

---

## 파트너 센터 앱 신원 (입력 완료)

`package.json` 의 `build.appx` 에 들어 있어요.
**파트너 센터 → 제품 관리 → 제품 ID** 의 값과 한 글자도 다르면 업로드가 거부됩니다.

```jsonc
"appx": {
  "identityName":        "PixelPicnicGames.496108EF2542F",
  "publisher":           "CN=D9A7311A-9854-4353-9E5A-9845EE3499D6",
  "publisherDisplayName":"픽셀피크닉게임즈 (Pixel Picnic Games)",
  ...
}
```

> 표시 이름은 괄호와 영문까지 포함한 전체가 등록명이에요. 괄호를 빼면 반려됩니다.
> 스토어는 오류를 **하나씩** 알려주기 때문에, 세 값 중 하나만 고치면
> 다음 업로드에서 나머지로 또 반려돼요.

이 값이 파트너 센터와 **정확히** 일치하지 않으면 업로드가 거부돼요.
버전은 `package.json` 최상단 `version` 을 따라갑니다.

값을 채웠는지 확인하려면 만들어진 패키지의 매니페스트를 열어 보세요:

```bash
python -c "import zipfile,glob;print(zipfile.ZipFile(glob.glob('release/*.appx')[0]).read('AppxManifest.xml').decode()[:600])"
```

`Name=` 과 `Publisher=` 에 `REPLACE-WITH-` 가 남아 있으면 **업로드해도 반려돼요.**

### 스토어에 올리는 파일

`release/orbit-jump-1.0.0.appx` **이 파일 하나만** 올려요.
`release/win-unpacked/` 는 앱을 폴더로 푼 것이라 업로드 대상이 아니고,
`dist/` 는 게임 화면 자산일 뿐이에요. `electron/`·`src/`·`package.json` 같은 소스도 마찬가지예요.

---

## 로고 · 타일 이미지

원본은 `build/logo-master.png` (1080×1080) 한 장이에요. 바꾸고 싶으면 이 파일만 교체하고:

```bash
python build/make-icons.py     # pip install pillow
```

- 정사각 타일(44·71·150·310·StoreLogo) — 로고를 그대로 축소
- 가로 타일(Wide310x150·SplashScreen) — 정사각 로고를 가운데 두면 여백만 커 보여서,
  아트에서 가로 밴드를 잘라 꽉 채워요. 자르는 위치는 스크립트의 `WIDE_CROP_CENTER`

---

## 알아두면 좋은 것

**`file://` 가 아니라 `app://` 로 로드해요.** Vite가 뽑는 `<script type="module">` 은
`file://` origin에서 CORS로 차단됩니다. `electron/app-protocol.cjs` 가 커스텀 프로토콜을
등록해 진짜 origin을 만들어 줘요. 덤으로 localStorage가 origin 단위로 안정적으로 유지됩니다.
**`win.loadFile()` 로 되돌리지 마세요.** 흰 화면만 떠요.

**CSP는 응답 헤더로 붙여요.** `index.html` 은 토스 빌드와 공유하는 파일이라 meta 태그를
넣을 수 없어요(넣으면 토스 빌드까지 영향). `app-protocol.cjs` 의 `CSP` 상수를 보세요.

**`npm run pack:store` 가 심볼릭 링크 오류로 멈추면** — `pack:dir` 은 되는데 `appx` 만 실패해요.
electron-builder가 코드 서명 도구(winCodeSign)를 풀 때 macOS용 `.dylib` 심볼릭 링크를
만들려다 권한이 없어 실패합니다. Windows 빌드에는 전혀 안 쓰이는 파일이에요.

해결은 둘 중 하나:

1. **Windows 개발자 모드 켜기** (설정 → 개인 정보 및 보안 → 개발자용) — 권장
2. 캐시를 직접 풀어 두기 (개발자 모드를 못 켜는 환경에서)

```bash
cd "$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
7za x <아무거나>.7z -o"winCodeSign-2.6.0" -xr'!darwin' -y
```

`-xr'!darwin'` 이 문제의 macOS 폴더를 통째로 빼요.
`winCodeSign-2.6.0/windows-10/x64/makeappx.exe` 가 보이면 성공이고,
그 다음부터 `pack:store` 가 그대로 통과합니다.

**스토어 제출용 .appx는 직접 서명하지 않아요.** 파트너 센터가 업로드받아 서명합니다.

---

## 검증 기록

실제 Electron에서 확인한 항목이에요. (`npm run pack:dir` 로 만든 exe 기준)

- 창 제목 · 로고 `궤도탈출`
- 캔버스가 기기 해상도 그대로 (3x 화면이면 3.00배) — 토스 빌드의 해상도 수정이 그대로 적용됨
- 부활 버튼 · 토스 게임센터 버튼 **숨김 확인**
- 설정 · 상점 시트 열림/닫힘, 게임 시작 정상
- localStorage에 `spacejump.device`, `spacejump.save` 저장 확인
- 렌더러 콘솔 오류 **0건** (CSP 경고 포함 없음)
- `app.asar` 안에 토스 SDK 없음
