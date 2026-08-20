/**
 * 스토리 모드 대본 — STAGE 1 「지구 → 달」
 *
 * 한 줄(beat)의 생김새
 *  - who   : 'doyun' | 'seorin' | 'orbit' | null(나레이션)
 *  - text  : 대사. 대사창 폭(약 400 논리 px)에 3줄까지 들어가요. 그보다 길면 나눠주세요.
 *  - mood  : 'calm' | 'tense' | 'smile' — 눈썹·입 모양이 바뀌어요
 *  - bg    : 배경을 바꿀 때만. 'earth' | 'cockpit' | 'moon'
 *  - fx    : 'siren-on' | 'siren-off' | 'shake' | 'flash' | 'title'
 *  - side  : 초상화 위치. 기본 'left'
 *  - hold  : 이 줄이 다 나온 뒤 자동으로 넘어갈 시간(초). 없으면 탭할 때까지 기다려요.
 *
 * 대사를 고칠 때 지킬 것: 한 줄에 한 호흡. 휴대폰 세로 화면이라 길면 안 읽혀요.
 */

/** 1장 — 지구가 무너지는 날 */
export const INTRO = [
  { who: null, text: '2045년 3월 14일 · 지구 저궤도', bg: 'earth', hold: 2.2 },
  { who: null, text: '태양이, 아주 조용히 무너지고 있었다.', hold: 2.6 },

  { who: 'orbit', text: '경보. 경보. 지구 자기권 붕괴율 97 퍼센트.', fx: 'siren-on' },
  { who: 'orbit', text: '3차 태양풍 파면 도달까지 38분. 모든 유인 궤도 시설은 즉시 이탈하십시오.' },
  { who: null, text: '자기권이 걷힌 하늘 아래에서, 대기가 타들어 가기 시작했다.', fx: 'shake' },

  { who: 'doyun', mood: 'tense', bg: 'cockpit', text: '…설마 했는데. 진짜 오늘이었네.' },
  { who: 'seorin', mood: 'tense', text: '관측선 데이터 전부 들어왔어. 이건 되돌릴 수 있는 규모가 아니야.' },
  { who: 'doyun', mood: 'tense', text: '지구는?' },
  { who: 'seorin', mood: 'tense', text: '…앞으로 백 년은, 사람이 살 수 없어.' },

  { who: 'doyun', mood: 'tense', text: '그럼 어디로 가지. 화성은 8개월이야. 연료도 시간도 없어.' },
  { who: 'seorin', text: '달.' },
  { who: 'seorin', text: '셀레네 기지. 여기서 사흘이면 닿아. 방주 계획의 마지막 수송선이 거기 남아 있어.' },
  { who: 'doyun', mood: 'smile', text: '사흘이라. …좋아. 그 정도면 이 낡은 배로도 가겠다.' },

  /*
    이 게임의 적이 누구인지 여기서 못 박아요.
    쳐들어온 외계인이 아니라 **우리가 띄운 방어 위성**이에요. 태양풍에 관제가
    끊기고 피아 식별이 타버려서, 지키라고 만든 것이 지나가는 것을 전부 쏴요.
    앞으로 나오는 가디언 01 · 00이 전부 여기서 갈라져 나옵니다.
  */
  { who: 'orbit', text: '보고. 궤도 방어망 「가디언」 전 기체, 관제 링크 상실.' },
  { who: 'seorin', mood: 'tense', text: '가디언? 우리가 지구랑 달 궤도에 띄운 그 요격 위성들?' },
  { who: 'orbit', text: '네. 피아 식별 장치가 태양풍에 타버렸어요. 이제 아군을 못 알아봅니다.' },
  { who: 'doyun', mood: 'tense', text: '…우리가 만든 방패가, 이제 우리한테 총을 겨눈다는 거네.' },
  { who: 'seorin', text: '피해서 가면 돼. 저것들도 원래는 우리 편이었어.' },

  { who: 'doyun', text: '궤도 이탈 시퀀스 개방. 서린, 항법 맡아줘.', fx: 'siren-off' },
  { who: 'seorin', mood: 'smile', text: '맡겨. 지구 중력을 뿌리치는 것부터 — 지금부터가 진짜 탈출이야.' },

  { who: null, text: '두 사람은 지구를 등지고, 달을 향해 기수를 올렸다.', fx: 'title', hold: 2.4 },
];

/**
 * 보스 등장 — 전투를 멈추지 않고 화면 위에 잠깐 떴다 사라지는 짧은 대사예요.
 * `at`은 보스가 등장한 뒤 흐른 시간(초).
 */
export const BOSS_BARKS = [
  { at: 0.2, who: 'seorin', text: '가디언 01! 우리가 달 궤도에 띄운 요격 위성이야 — 아직 살아 있어!' },
  { at: 3.4, who: 'orbit', text: '경고. 미확인 선박. 접근을 중단하고 즉시 이탈하십시오.' },
  { at: 6.6, who: 'seorin', mood: 'tense', text: '우리 코드로 응답했는데 안 먹혀. 우릴 아예 못 알아봐.' },
  { at: 9.4, who: 'doyun', text: '…미안하다. 서린, 조준 맡길게!' },
];

/** 2장 — 달에 내려앉다 */
export const LANDING = [
  { who: null, text: '가디언의 잔해가 달 먼지 위로 천천히 내려앉았다.', bg: 'moon', hold: 2.6 },
  { who: 'seorin', text: '…방어망 침묵. 착륙 경로, 열렸어.' },
  { who: 'doyun', mood: 'tense', text: '우리 손으로 만든 걸, 우리 손으로 부쉈네.' },
  { who: 'seorin', text: '고장 난 거야. 누구 잘못도 아니야.' },
  { who: 'doyun', text: '셀레네 기지. 여기는 탐사선 하늘소. 착륙 허가를 요청한다.' },
  { who: null, text: '응답은, 없었다.', hold: 2.4 },
  { who: 'doyun', mood: 'tense', text: '…기지. 응답하라.' },
  { who: 'seorin', mood: 'tense', text: '도윤아. 기지 통신탑… 불이 전부 꺼져 있어.' },
  { who: 'doyun', mood: 'tense', text: '…' },
  { who: null, text: '달에는 무사히 내려앉았다. 다만, 마중 나온 사람이 아무도 없었다.', hold: 3.2 },
];

/**
 * 최종 보스전 대사 — **본편(100행성 완주) 전용**이에요.
 *
 * 여기 화자는 전부 관제 AI(ORBIT)예요. 본편에는 동승자가 없거든요.
 * `at`은 보스가 등장한 뒤 흐른 시간(초).
 */
export const FINAL_BARKS = [
  { at: 0.3, who: 'orbit', text: '관문 앞이에요. 백 번째 궤도… 여기가 태양계의 끝입니다.' },
  { at: 3.6, who: 'orbit', text: '가디언-00 「오버시어」. 방어망 전체를 지휘하던 관제 위성이에요.' },
  { at: 7.2, who: 'orbit', text: '관제가 끊긴 날의 마지막 명령을 아직 붙들고 있어요 — 「관문을 봉쇄하라」.' },
  { at: 11.0, who: 'orbit', text: '우리가 만들었고, 우리가 두고 갔어요. 이제 우리가 지나가야 해요.' },
  { at: 22.0, who: 'orbit', text: '장갑이 벗겨지고 있어요. 패턴이 바뀝니다 — 집중하세요!' },
  { at: 46.0, who: 'orbit', text: '거의 다 왔어요. 조금만 더 버텨요!' },
];

/** 비행 구간에서 화면 가운데 잠깐 뜨는 표지 */
export const BANNERS = {
  stage: { text: 'STAGE 1', sub: '지구 → 달' },
  exit: { text: '대기권 이탈', sub: 'ATMOSPHERIC EXIT' },
  debris: { text: '잔해 지대', sub: 'DEBRIS FIELD' },
  patrol: { text: '고장 난 요격기', sub: 'DERELICT INTERCEPTORS' },
  boss: { text: '가디언-01', sub: 'LUNAR DEFENSE · MALFUNCTION', warn: true },
  clear: { text: 'STAGE 1 CLEAR', sub: '달 · 셀레네 기지' },
  // 본편 최종 보스 (100번째 행성 「관문」)
  final: { text: '가디언-00 오버시어', sub: 'THE GATEKEEPER · FINAL', warn: true },
};
