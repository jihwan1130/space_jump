/**
 * 업적(칭호) — 정의와 판정만 담당해요.
 *
 * 설계 원칙
 *  - **한 번 얻으면 안 잃어요.** 조건이 다시 거짓이 돼도(스킨을 팔거나 하는 일은 없지만)
 *    이미 받은 업적은 그대로 남아요. 판정 함수는 "지금 조건을 만족하는가"만 답하고,
 *    보관은 부르는 쪽(main.js)이 합집합으로 처리해요.
 *  - **보상은 전부 같아요.** 하나에 보석 ACHIEVEMENT_REWARD개이고, 자동으로 들어오지
 *    않아요. 업적 목록에서 「받기」를 눌러야 지갑에 들어옵니다. (아래 ACHIEVEMENTS 참고)
 *  - `secret: true`는 **얻기 전까지 이름도 조건도 안 알려주는** 업적이에요.
 *    목록에는 ??? 와 SECRET_HINT만 보여요. 우연히 마주쳤을 때가 제일 반가우니까요.
 *  - 판정은 **순수 함수**예요. DOM도 네트워크도 안 봐요. 그래야 테스트가 쉬워요.
 *  - id는 DB에 그대로 들어가는 값이라 **절대 바꾸지 마세요.** 이름·설명은 바꿔도 돼요.
 *
 * 판정에 넘기는 것 (ctx)
 *   records   : 누적 기록 (clearCount · ownedSkins · nickname …)
 *   run       : 방금 끝난 판. 없을 수도 있어요. (홈에서 목록만 열어본 경우)
 *   skinCount : 상점에 있는 전체 스킨 수
 */

/** 「나는야 프로그래머」 닉네임 조건 — 영문·숫자가 번갈아 두 번 (예: a1b2, k9z3) */
export const PROGRAMMER_PATTERN = /[a-zA-Z]\d[a-zA-Z]\d/;

/**
 * 업적 하나를 열면 주는 보석. **전부 같은 값이에요.**
 *
 * 예전에는 업적마다 액수가 달랐어요(프로그래머만 500). 그러니까
 *   · 어떤 업적이 얼마인지 아무도 예측을 못 하고,
 *   · 액수가 큰 것만 서버에 지급 기록을 남길지 말지 매번 저울질하게 되고,
 *   · 새 업적을 만들 때마다 "이건 얼마?"를 결정해야 했어요.
 * 하나로 묶으니 규칙이 한 줄로 설명돼요 — "업적 하나 = 보석 100개".
 */
export const ACHIEVEMENT_REWARD = 100;

/**
 * 숨은 업적(`secret: true`)이 아직 안 열렸을 때 목록에 대신 보여주는 문구.
 *
 * 이름은 ???로 가리면서 조건은 그대로 적어두면 가린 의미가 없어요.
 * 그래서 이름·조건을 **둘 다** 이 문구로 덮어요. 각 업적의 hint는 데이터에 그대로
 * 남겨둡니다 — 나중에 "달성 팁 보기" 같은 걸 붙이고 싶어질 때 쓰려고요.
 */
export const SECRET_HINT = '아직 밝혀지지 않은 업적이에요.';

/**
 * 업적 목록 — 보상은 아래에서 전부에게 똑같이 붙여요.
 *
 * 여기 적힌 건 "무엇을 어떻게 얻는가"뿐이에요. 보상 액수와 수령 방식은
 * 파일 맨 아래 한 줄이 일괄로 얹습니다. 업적마다 손으로 적으면 새로 만들 때
 * 하나쯤 빠뜨리고, 그러면 그 업적만 조용히 보석을 안 줘요.
 */
const LIST = [
  /*
    맨 앞에 두는 이유 — 누구나 **가장 먼저** 얻는 업적이라서요.
    목록을 처음 열었을 때 맨 위 칸이 이미 「달성」이면, 이 화면이 뭘 하는 곳인지
    설명 없이 바로 읽혀요. 빈 목록을 먼저 보면 그냥 닫고 나가요.
  */
  {
    id: 'tutorial-clear',
    name: '연습생이지만 괜찮아',
    desc: '연습 비행을 마쳤어요. 첫 업적이에요.',
    hint: '튜토리얼을 끝내거나 건너뛰면 열려요.',
    icon: 'compass',
    // 끝까지 봤든 건너뛰었든 상관없어요. 둘 다 tutorialVersion을 올려요.
    test: ({ records }) => (records.tutorialVersion || 0) > 0,
  },
  {
    id: 'first-clear',
    name: '업적 클리어',
    desc: '관문지기를 처음으로 넘었어요.',
    hint: '본편을 한 번 클리어하면 열려요.',
    icon: 'medal',
    test: ({ records }) => records.clearCount > 0,
  },
  {
    id: 'no-combo',
    name: '노콤보',
    desc: '콤보 한 번 없이 관문까지 갔어요.',
    hint: '콤보를 한 번도 잇지 않고 클리어하면 열려요.',
    icon: 'combo-off',
    // 콤보는 "연달아 착지"라서 최고 콤보가 1이면 한 번도 이어지지 않은 거예요.
    test: ({ run }) => Boolean(run?.cleared) && (run.bestCombo || 0) <= 1,
  },
  {
    id: 'full-combo',
    name: '풀콤보',
    desc: '한 번도 끊지 않고 관문까지 갔어요.',
    hint: '착지를 한 번도 끊지 않고 클리어하면 열려요.',
    icon: 'flame',
    // 100행성 = 99번 옮겨 타요. 그동안 콤보가 한 번도 안 끊겼다는 뜻.
    test: ({ run, totalPlanets }) =>
      Boolean(run?.cleared) && (run.bestCombo || 0) >= totalPlanets - 1,
  },
  {
    id: 'no-revive',
    name: '부활하지않아',
    desc: '이어하기 없이 한 번에 갔어요.',
    hint: '광고 부활을 쓰지 않고 클리어하면 열려요.',
    icon: 'heart',
    test: ({ run }) => Boolean(run?.cleared) && (run.revives || 0) === 0,
  },
  {
    id: 'so-close',
    name: '거의다왔는데..',
    desc: '관문지기 앞에서 무너졌어요.',
    hint: '최종 보스전에서 한 번 지면 열려요.',
    icon: 'heart-crack',
    secret: true,
    test: ({ run }) => run?.finalBattle === true && run.cleared === false,
  },
  {
    id: 'all-skins',
    name: '올스킨유저',
    desc: '우주선을 전부 모았어요.',
    hint: '상점의 모든 스킨을 사면 열려요.',
    icon: 'rocket',
    secret: true,
    test: ({ records, skinCount }) =>
      skinCount > 0 && records.ownedSkins.length >= skinCount,
  },
  {
    id: 'programmer',
    name: '나는야 프로그래머',
    desc: '닉네임에 숨은 규칙을 찾아냈어요.',
    hint: '어딘가에 숨은 조건이 있어요.',
    icon: 'code',
    secret: true,
    test: ({ records }) => PROGRAMMER_PATTERN.test(records.nickname || ''),
  },
];

/**
 * 실제로 쓰는 목록 — 보상을 전부에게 똑같이 얹은 것.
 *
 * `claim: true`라 지갑에 자동으로 안 들어가요. 업적 목록에서 직접 눌러야 받아요.
 * 손으로 받게 하는 이유는 두 가지예요.
 *   1) 업적 화면을 한 번은 열어보게 돼요. 조용히 넣어주면 영영 안 열어봐요.
 *   2) 수령 시점이 명확해서 **서버에 "줬다"를 남길 자리**가 생겨요.
 *      자동 지급은 언제 줬는지가 클라이언트 안에서만 흐르고 지나가서,
 *      앱을 지웠다 깔면 같은 보석을 또 받을 수 있어요.
 */
export const ACHIEVEMENTS = LIST.map((a) => ({
  ...a,
  reward: ACHIEVEMENT_REWARD,
  claim: true,
}));

/** id로 찾기 */
export function getAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

/**
 * 지금 새로 얻은 업적을 골라내요.
 *
 * @param {string[]} owned 이미 가지고 있는 id 목록
 * @param {object} ctx { records, run, skinCount, totalPlanets }
 * @returns {object[]} 이번에 새로 열린 업적들 (이미 있는 건 안 들어가요)
 */
export function checkAchievements(owned, ctx) {
  const have = new Set(owned || []);
  const gained = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.test(ctx) === true;
    } catch {
      // 판정 하나가 터져도 나머지는 계속 봐야 해요.
      ok = false;
    }
    if (ok) gained.push(a);
  }
  return gained;
}
