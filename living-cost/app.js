/* =========================================================================
   고정비 체크기 — app.js
   2026년 기준 · 빌드 도구 없이 동작하는 정적 PWA
   구성: ① 기준 데이터 ② 계산 로직(순수 함수) ③ 지원금 매칭 ④ 화면 렌더링
   ========================================================================= */
'use strict';

const APP_VERSION = '1.0.0';
const AS_OF = '2026-11-25';

/* ------------------------------------------------------------------ *
 * ① 기준 데이터
 * ------------------------------------------------------------------ */

/**
 * 가구 형태별 기준선.
 * consumption: 국가데이터처 「2026년 2분기 가계동향조사」 가구원수별 월평균 소비지출
 * bench: 같은 조사의 항목별 지출을 고정비 항목에 맞춰 재구성한 월 참고선
 *   - 주거·수도·광열 / 정보통신: 조사표의 가구원수별 값 그대로
 *   - 보험 / 구독: 조사표에 따로 없어(보험은 '기타상품·서비스', 구독은 '오락·문화'에 섞임)
 *     실제 가구에서 흔한 고정 성격만 추려 만든 참고 추정치
 */
const HOUSEHOLDS = {
  single: {
    label: '1인 자취',
    short: '1인',
    consumption: 1767000,
    benchmark: 602000,
    bench: { housing: 317000, telecom: 105000, insurance: 80000, subscription: 100000, debt: 0 }
  },
  couple: {
    label: '신혼·2인',
    short: '2인',
    consumption: 2687000,
    benchmark: 735000,
    bench: { housing: 333000, telecom: 142000, insurance: 130000, subscription: 130000, debt: 0 }
  },
  family: {
    label: '3인 육아',
    short: '3인',
    consumption: 3943000,
    benchmark: 963000,
    bench: { housing: 420000, telecom: 223000, insurance: 180000, subscription: 140000, debt: 0 }
  }
};

/** 구독 체크리스트. 가격은 2026년 11월 대표 요금제 예시이며 화면에서 수정할 수 있다. */
const SUBSCRIPTIONS = [
  { id: 'netflix', name: '넷플릭스', tag: '영상', price: 13500 },
  { id: 'youtube', name: '유튜브 프리미엄', tag: '영상', price: 14900 },
  { id: 'tving', name: '티빙', tag: '영상', price: 13900 },
  { id: 'wavve', name: '웨이브', tag: '영상', price: 13900 },
  { id: 'disney', name: '디즈니+', tag: '영상', price: 9900 },
  { id: 'coupang', name: '쿠팡 와우 멤버십', tag: '쇼핑', price: 7890 },
  { id: 'naver', name: '네이버플러스 멤버십', tag: '쇼핑', price: 4900 },
  { id: 'baemin', name: '배달 멤버십', tag: '쇼핑', price: 3900 },
  { id: 'melon', name: '멜론 스트리밍', tag: '음악', price: 10900 },
  { id: 'milky', name: '밀리의 서재', tag: '독서', price: 9900 },
  { id: 'chatgpt', name: 'ChatGPT Plus', tag: 'AI', price: 29000 },
  { id: 'icloud', name: 'iCloud+ 200GB', tag: '저장', price: 3300 },
  { id: 'water', name: '생수·커피 정기배송', tag: '생활', price: 15000 },
  { id: 'fitness', name: '헬스장·요가 회원권', tag: '운동', price: 60000 },
  { id: 'news', name: '신문·잡지 구독', tag: '독서', price: 10000 }
];

/** 고정비 항목별 절감률·난이도. 절감률은 '점검했을 때 현실적으로 줄어드는 비율'의 보수적 가정. */
const CATEGORY_META = [
  {
    key: 'subscription', label: '구독·멤버십', rate: 0.40, ease: 3, easeLabel: '아주 쉬움',
    tip: '지난달에 한 번도 열지 않은 구독부터 해지하세요. 3개 이상 겹치면 1~2개만 남겨도 체감이 커요.'
  },
  {
    key: 'telecom', label: '통신·인터넷', rate: 0.22, ease: 3, easeLabel: '아주 쉬움',
    tip: '선택약정 25%가 빠져 있으면 바로 신청하고, 쓰는 데이터가 적다면 알뜰폰 요금제와 비교해 보세요.'
  },
  {
    key: 'insurance', label: '보험', rate: 0.12, ease: 2, easeLabel: '보통',
    tip: '중복 보장·만기 지난 특약을 정리하세요. 해지는 신중하게, 보장 공백은 먼저 확인하세요.'
  },
  {
    key: 'housing', label: '주거·관리비', rate: 0.06, ease: 1, easeLabel: '노력 필요',
    tip: '관리비 부과 내역서에서 오래된 옵션·공용 전기 항목을 확인하고, 대기전력·난방 효율을 점검하세요.'
  },
  {
    key: 'debt', label: '대출·할부', rate: 0.015, ease: 1, easeLabel: '노력 필요',
    tip: '금리 0.5%p만 낮춰도 이자 부담이 줄어요. 대환·부분 상환 조건을 비교해 보세요.'
  }
];

const HOUSEHOLD_BENCH_KEYS = ['housing', 'telecom', 'insurance', 'subscription', 'debt'];

/** 진단 예시값 */
const EXAMPLES = {
  single: {
    housingCost: 450000, utilityCost: 90000, mobileCost: 55000, internetCost: 22000,
    insuranceCost: 80000, loanCost: 0,
    subs: { netflix: { on: true, amount: 13500 }, youtube: { on: true, amount: 14900 }, coupang: { on: true, amount: 7890 }, melon: { on: true, amount: 10900 } }
  },
  couple: {
    housingCost: 700000, utilityCost: 130000, mobileCost: 110000, internetCost: 33000,
    insuranceCost: 160000, loanCost: 200000,
    subs: { netflix: { on: true, amount: 13500 }, tving: { on: true, amount: 13900 }, coupang: { on: true, amount: 7890 }, naver: { on: true, amount: 4900 }, icloud: { on: true, amount: 3300 } }
  },
  family: {
    housingCost: 850000, utilityCost: 180000, mobileCost: 150000, internetCost: 38000,
    insuranceCost: 220000, loanCost: 350000,
    subs: { netflix: { on: true, amount: 13500 }, youtube: { on: true, amount: 14900 }, coupang: { on: true, amount: 7890 }, melon: { on: true, amount: 10900 }, milky: { on: true, amount: 9900 } }
  }
};

/* ------------------------------------------------------------------ *
 * ② 공통 유틸
 * ------------------------------------------------------------------ */

const MAX_INPUT = 100000000;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** '1,200,000' · 1200000 · '' → 숫자 */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const digits = value.replace(/[^\d.-]/g, '');
  if (!digits || digits === '-' || digits === '.') return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(n) {
  const v = String(Math.round(Number(n) || 0));
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1,740,000 → '174만원' / 9,500 → '9,500원' */
function manwon(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) < 10000) return formatNumber(v) + '원';
  const man = v / 10000;
  const rounded = Math.round(man * 10) / 10;
  if (Number.isInteger(rounded)) return formatNumber(rounded) + '만원';
  const parts = rounded.toFixed(1).split('.');
  return formatNumber(Number(parts[0])) + '.' + parts[1] + '만원';
}

/** 금액을 {num, unit}으로 분리해 큰 숫자 + 작은 단위로 표시 */
function manwonParts(n) {
  const text = manwon(n);
  if (text.endsWith('만원')) return { num: text.slice(0, -2), unit: '만원' };
  if (text.endsWith('원')) return { num: text.slice(0, -1), unit: '원' };
  return { num: text, unit: '' };
}

function formatWon(n) {
  return formatNumber(n) + '원';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 오늘 기준 마감 정보 (한국 날짜 기준으로 일수 계산) */
function deadlineInfo(iso, now) {
  const parts = String(iso).split('-').map(Number);
  const endUtc = Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  const base = now instanceof Date ? now.getTime() : Date.now();
  const shifted = new Date(base + 9 * 3600 * 1000);
  const todayUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const days = Math.round((endUtc - todayUtc) / 86400000);
  if (days < 0) return { state: 'passed', days, label: '접수 종료' };
  if (days === 0) return { state: 'today', days, label: '오늘 마감' };
  if (days <= 14) return { state: 'soon', days, label: 'D-' + days };
  return { state: 'open', days, label: 'D-' + days };
}

/* ------------------------------------------------------------------ *
 * ③ 고정비 진단 (순수 함수)
 * ------------------------------------------------------------------ */

function normalizeDiagnosisInput(raw) {
  const src = raw || {};
  const household = HOUSEHOLDS[src.household] ? src.household : 'single';
  const num = (v) => clamp(toNumber(v), 0, MAX_INPUT);
  const subs = {};
  SUBSCRIPTIONS.forEach((s) => {
    const saved = (src.subs && src.subs[s.id]) || {};
    const amount = saved.amount === undefined || saved.amount === null ? s.price : toNumber(saved.amount);
    subs[s.id] = { on: !!saved.on, amount: clamp(amount, 0, 1000000) };
  });
  return {
    household,
    bundleDiscount: !!src.bundleDiscount,
    housingCost: num(src.housingCost),
    utilityCost: num(src.utilityCost),
    mobileCost: num(src.mobileCost),
    internetCost: num(src.internetCost),
    insuranceCost: num(src.insuranceCost),
    loanCost: num(src.loanCost),
    subs
  };
}

function statusForRatio(ratio, hasValues) {
  if (!hasValues) {
    return {
      key: 'empty', label: '입력 대기', headline: '값을 적으면 바로 계산돼요',
      message: '월 주거비부터 하나씩 적어보세요. 예시값으로 먼저 체험해 볼 수도 있어요.'
    };
  }
  if (ratio <= 0.85) {
    return {
      key: 'good', label: '여유 있는 편', headline: '고정비가 평균보다 적어요',
      message: '지금 구조는 꽤 탄탄해요. 남는 돈으로 숨은 지원금을 채워보세요.'
    };
  }
  if (ratio <= 1.1) {
    return {
      key: 'normal', label: '평균과 비슷', headline: '평균과 비슷하게 쓰고 있어요',
      message: '크게 새지는 않지만, 구독과 통신만 손봐도 1년에 꽤 남아요.'
    };
  }
  if (ratio <= 1.35) {
    return {
      key: 'warn', label: '조금 새는 중', headline: '고정비가 조금 새고 있어요',
      message: '같은 형태 평균보다 매달 더 나가고 있어요. 아래 TOP 3부터 하나씩 줄여보세요.'
    };
  }
  return {
    key: 'danger', label: '고정비 과다', headline: '고정비 비중이 높아요',
    message: '평균보다 많이 나가요. 큰 항목부터 차근차근 점검해 보세요.'
  };
}

function computeDiagnosis(raw) {
  const input = normalizeDiagnosisInput(raw);
  const hh = HOUSEHOLDS[input.household];
  const bundleDiscount = input.bundleDiscount;

  const subMonthly = SUBSCRIPTIONS.reduce((sum, s) => sum + (input.subs[s.id].on ? input.subs[s.id].amount : 0), 0);
  const subCount = SUBSCRIPTIONS.filter((s) => input.subs[s.id].on).length;

  const monthly = {
    housing: input.housingCost + input.utilityCost,
    telecom: input.mobileCost + input.internetCost,
    insurance: input.insuranceCost,
    subscription: subMonthly,
    debt: input.loanCost
  };

  const living = monthly.housing + monthly.telecom + monthly.insurance + monthly.subscription;
  const total = living + monthly.debt;
  const hasValues = total > 0;

  const ratio = hh.benchmark > 0 ? living / hh.benchmark : 0;
  const status = statusForRatio(ratio, hasValues);
  const gap = living - hh.benchmark;
  const overrun = Math.max(0, gap);
  const shareOfConsumption = hh.consumption > 0 ? total / hh.consumption : 0;

  const savings = CATEGORY_META.map((meta) => {
    const amount = monthly[meta.key];
    const monthlySaving = Math.round((amount * meta.rate) / 1000) * 1000;
    return {
      key: meta.key,
      label: meta.label,
      tip: meta.tip,
      ease: meta.ease,
      easeLabel: meta.easeLabel,
      rate: meta.rate,
      currentMonthly: amount,
      monthly: monthlySaving,
      annual: monthlySaving * 12,
      benchMonthly: (hh.bench[meta.key] || 0)
    };
  }).filter((s) => s.monthly > 0);

  const savingsMonthly = savings.reduce((sum, s) => sum + s.monthly, 0);
  const savingsAnnual = savingsMonthly * 12;

  const easeWeight = { 3: 1, 2: 0.7, 1: 0.15 };
  const top3 = savings
    .slice()
    .sort((a, b) => (b.annual * (easeWeight[b.ease] || 0.5)) - (a.annual * (easeWeight[a.ease] || 0.5)))
    .slice(0, 3);

  const chart = {
    before: total * 12,
    after: Math.max(0, (total - savingsMonthly) * 12),
    saved: savingsAnnual
  };

  return {
    input,
    bundleDiscount,
    household: input.household,
    householdLabel: hh.label,
    benchmark: hh.benchmark,
    consumption: hh.consumption,
    monthly,
    subCount,
    living,
    total,
    hasValues,
    ratio,
    percent: Math.round(ratio * 100),
    shareOfConsumption,
    status,
    gap,
    overrun,
    overrunAnnual: overrun * 12,
    savings,
    savingsMonthly,
    savingsAnnual,
    top3,
    chart,
    debtIncluded: monthly.debt > 0
  };
}

/* ------------------------------------------------------------------ *
 * ④ 숨은 지원금 데이터 & 매칭
 * ------------------------------------------------------------------ */

const INCOME_OPTIONS = [
  { value: 'i1200', label: '1,200만 미만', amount: 12000000 },
  { value: 'i2200', label: '1,200~2,200만', amount: 22000000 },
  { value: 'i3200', label: '2,200~3,200만', amount: 32000000 },
  { value: 'i4400', label: '3,200~4,400만', amount: 44000000 },
  { value: 'i7000', label: '4,400~7,000만', amount: 70000000 },
  { value: 'i7500', label: '7,000~7,500만', amount: 75000000 },
  { value: 'i10000', label: '7,500만~1억', amount: 100000000 },
  { value: 'iover', label: '1억 이상', amount: 200000000 },
  { value: 'unknown', label: '모름', amount: null }
];

const OPTIONS = {
  household: [
    { value: 'single', label: '1인 자취' },
    { value: 'couple', label: '신혼·2인' },
    { value: 'family', label: '3인 육아' }
  ],
  dual: [
    { value: 'no', label: '외벌이' },
    { value: 'yes', label: '맞벌이' }
  ],
  region: [
    { value: 'metro', label: '수도권' },
    { value: 'nonmetro', label: '비수도권' },
    { value: 'declining', label: '인구감소지역' }
  ],
  income: INCOME_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  worker: [
    { value: 'employee', label: '직장인' },
    { value: 'self', label: '자영업·사업자' },
    { value: 'freelance', label: '프리랜서·부업(3.3%)' },
    { value: 'none', label: '주부·학생·무직' }
  ],
  age: [
    { value: 'youth', label: '만 19~34세' },
    { value: 'adult', label: '만 35~64세' },
    { value: 'senior', label: '만 65세 이상' }
  ],
  housing: [
    { value: 'monthly', label: '월세' },
    { value: 'jeonse', label: '전세·반전세' },
    { value: 'owned', label: '자가' },
    { value: 'family', label: '가족 집·기타' }
  ],
  children: [
    { value: '0', label: '없음' },
    { value: '1', label: '1명' },
    { value: '2', label: '2명' },
    { value: '3', label: '3명 이상' }
  ],
  youngest: [
    { value: '0', label: '0세' },
    { value: '1', label: '1세' },
    { value: '2-8', label: '2~8세' },
    { value: '9+', label: '9세 이상' }
  ],
  transit: [
    { value: 'yes', label: '월 15회 이상' },
    { value: 'no', label: '거의 안 씀' }
  ],
  telecom: [
    { value: 'none', label: '해당 없음' },
    { value: 'basic_liv', label: '생계·의료급여' },
    { value: 'basic_other', label: '주거·교육급여' },
    { value: 'near_poor', label: '차상위계층' },
    { value: 'senior', label: '기초연금' },
    { value: 'disabled', label: '장애인·유공자' }
  ],
  contract: [
    { value: 'yes', label: '받고 있음' },
    { value: 'no', label: '미적용' },
    { value: 'unknown', label: '모름' }
  ],
  medical: [
    { value: 'low', label: '100만 미만' },
    { value: 'mid', label: '100~300만' },
    { value: 'high', label: '300만 이상' }
  ],
  voucherMember: [
    { value: 'yes', label: '있음' },
    { value: 'no', label: '없음' }
  ]
};

const DEFAULT_BENEFIT_STATE = {
  household: 'single',
  dual: 'no',
  region: 'metro',
  income: 'unknown',
  worker: 'employee',
  age: 'youth',
  housing: 'monthly',
  children: '0',
  youngest: 'none',
  transit: 'yes',
  transitSpend: 60000,
  telecom: 'none',
  contract: 'unknown',
  medical: 'low',
  voucherMember: 'no'
};

function incomeAmount(id) {
  const found = INCOME_OPTIONS.find((o) => o.value === id);
  return found ? found.amount : null;
}

function incomeLabel(id) {
  const found = INCOME_OPTIONS.find((o) => o.value === id);
  return found ? found.label : '모름';
}

function normalizeBenefitCtx(raw) {
  const src = Object.assign({}, DEFAULT_BENEFIT_STATE, raw || {});
  const household = HOUSEHOLDS[src.household] ? src.household : 'single';
  const children = clamp(parseInt(src.children, 10) || 0, 0, 3);
  const youngest = children === 0 ? 'none' : (['0', '1', '2-8', '9+'].indexOf(src.youngest) >= 0 ? src.youngest : '9+');
  return {
    household,
    dual: src.dual === 'yes',
    region: ['metro', 'nonmetro', 'declining'].indexOf(src.region) >= 0 ? src.region : 'metro',
    income: incomeAmount(src.income),
    incomeLabel: incomeLabel(src.income),
    incomeKnown: incomeAmount(src.income) !== null,
    worker: ['employee', 'self', 'freelance', 'none'].indexOf(src.worker) >= 0 ? src.worker : 'employee',
    age: ['youth', 'adult', 'senior'].indexOf(src.age) >= 0 ? src.age : 'adult',
    housing: ['monthly', 'jeonse', 'owned', 'family'].indexOf(src.housing) >= 0 ? src.housing : 'monthly',
    children,
    youngest,
    transit: src.transit === 'yes',
    transitSpend: clamp(toNumber(src.transitSpend) || 60000, 0, 1000000),
    telecom: ['none', 'basic_liv', 'basic_other', 'near_poor', 'senior', 'disabled'].indexOf(src.telecom) >= 0 ? src.telecom : 'none',
    contract: ['yes', 'no', 'unknown'].indexOf(src.contract) >= 0 ? src.contract : 'unknown',
    medical: ['low', 'mid', 'high'].indexOf(src.medical) >= 0 ? src.medical : 'low',
    voucherMember: src.voucherMember === 'yes'
  };
}

function householdSize(ctx) {
  if (ctx.household === 'single') return 1;
  if (ctx.household === 'couple') return 2;
  return clamp(2 + ctx.children, 3, 5);
}

function eitcType(ctx) {
  if (ctx.household === 'single') return { name: '단독', limit: 22000000, max: 1650000 };
  if (ctx.dual) return { name: '맞벌이', limit: 44000000, max: 3300000 };
  return { name: '홑벌이', limit: 32000000, max: 2850000 };
}

function kpassRate(ctx) {
  if (ctx.telecom === 'basic_liv' || ctx.telecom === 'basic_other' || ctx.telecom === 'near_poor') return 0.533;
  if (ctx.children >= 3) return 0.5;
  if (ctx.age === 'youth' || ctx.children === 2) return 0.3;
  return 0.2;
}

/** 지원제도 목록. match()가 null을 돌려주면 해당 없음. */
const PROGRAMS = [
  {
    id: 'eitc',
    name: '근로장려금',
    category: '소득·세금',
    cash: true,
    period: '5월 1~31일 정기신청 · 3월·9월 반기신청',
    where: '국세청 홈택스',
    link: 'https://www.hometax.go.kr',
    linkLabel: '홈택스에서 확인',
    docs: '소득·재산은 대부분 자동 확인, 환급 계좌만 등록',
    caution: '재산 2억 4천만원 미만이어야 하고, 1억 7천만원 이상이면 산정액의 50%만 지급돼요. 소득이 기준금액에 가까울수록 지급액은 줄어들고, 프리랜서는 사업자등록 여부에 따라 사업소득 인정이 달라질 수 있어요.',
    match(ctx) {
      if (ctx.worker === 'none') return null;
      const t = eitcType(ctx);
      if (!ctx.incomeKnown) {
        return {
          confidence: 'check',
          est: t.max,
          reason: t.name + '가구 기준 총소득 ' + manwon(t.limit) + ' 미만이면 최대 ' + manwon(t.max) + '까지 받을 수 있어요. 소득·재산 요건 확인이 필요해요.'
        };
      }
      if (ctx.income >= t.limit) return null;
      return {
        confidence: ctx.worker === 'freelance' ? 'check' : 'high',
        est: t.max,
        reason: '가구 합산 소득 ' + manwon(ctx.income) + '은 ' + t.name + '가구 기준(' + manwon(t.limit) + ' 미만)에 들어요. 재산 2억 4천만원 미만이면 신청할 수 있어요.'
      };
    }
  },
  {
    id: 'ctc',
    name: '자녀장려금',
    category: '육아',
    cash: true,
    period: '5월 1~31일 정기신청(근로장려금과 함께)',
    where: '국세청 홈택스',
    link: 'https://www.hometax.go.kr',
    linkLabel: '홈택스에서 확인',
    docs: '부양자녀 확인, 환급 계좌',
    caution: '부부합산 총소득 7,000만원 미만이어야 하고, 자녀 1명당 50만~100만원이에요. 소득이 높을수록 지급액은 줄어들고, 근로·사업소득이 있어야 신청할 수 있어요.',
    match(ctx) {
      if (ctx.children === 0 || ctx.worker === 'none') return null;
      const limit = 70000000;
      if (ctx.incomeKnown && ctx.income >= limit) return null;
      return {
        confidence: ctx.incomeKnown ? 'high' : 'check',
        est: 1000000 * ctx.children,
        reason: '자녀 ' + ctx.children + '명이면 1명당 최대 100만원, 합계 ' + manwon(1000000 * ctx.children) + '까지 가능해요. 총소득 7,000만원 미만이 기준이에요.'
      };
    }
  },
  {
    id: 'childAllowance',
    name: '아동수당',
    category: '육아',
    cash: true,
    period: '상시 신청 · 출생 60일 안에 신청하면 출생월부터',
    where: '복지로 · 정부24 · 주민센터',
    link: 'https://www.bokjiro.go.kr',
    linkLabel: '복지로에서 신청',
    docs: '보호자 신분증, 아동 명의 계좌',
    caution: '2026년에는 9세 미만 아동에게 월 10만원이에요. 비수도권은 월 5천원, 인구감소지역은 월 1만원(고시 지역 2만원)을 더 줘요.',
    match(ctx) {
      if (ctx.children === 0 || !['0', '1', '2-8'].includes(ctx.youngest)) return null;
      const extra = ctx.region === 'declining' ? 10000 : ctx.region === 'nonmetro' ? 5000 : 0;
      const monthly = 100000 + extra;
      return {
        confidence: 'high',
        est: monthly * 12,
        reason: '9세 미만 자녀 1명당 월 ' + manwon(monthly) + (extra ? '(지역 추가 ' + formatWon(extra) + ' 포함)' : '') + '이 매달 들어와요.'
      };
    }
  },
  {
    id: 'parentBenefit',
    name: '부모급여',
    category: '육아',
    cash: true,
    period: '출생 후 상시 신청',
    where: '복지로 · 주민센터',
    link: 'https://www.bokjiro.go.kr',
    linkLabel: '복지로에서 신청',
    docs: '출생신고 시 행복출산 통합신청 가능',
    caution: '0세는 월 100만원, 1세는 월 50만원이에요. 어린이집을 이용하면 보육료로 차감되고 차액만 지급돼요.',
    match(ctx) {
      if (ctx.children === 0) return null;
      if (ctx.youngest === '0') {
        return { confidence: 'high', est: 12000000, reason: '0세 자녀는 부모급여로 월 100만원, 1년에 1,200만원을 받아요. 아동수당은 별도예요.' };
      }
      if (ctx.youngest === '1') {
        return { confidence: 'high', est: 6000000, reason: '1세 자녀는 부모급여로 월 50만원, 1년에 600만원을 받아요. 아동수당은 별도예요.' };
      }
      return null;
    }
  },
  {
    id: 'firstMeet',
    name: '첫만남이용권',
    category: '육아',
    cash: true,
    period: '출생 후 2년 안에 사용',
    where: '복지로 · 정부24 · 주민센터',
    link: 'https://www.gov.kr',
    linkLabel: '정부24에서 확인',
    docs: '출생신고 시 통합신청',
    caution: '첫째 200만원, 둘째 이상 300만원이 국민행복카드 포인트로 지급돼요. 유흥·레저 등 일부 업종에서는 쓸 수 없어요.',
    match(ctx) {
      if (ctx.children === 0 || ctx.youngest !== '0') return null;
      const amount = ctx.children >= 2 ? 3000000 : 2000000;
      return {
        confidence: 'high',
        est: amount,
        reason: (ctx.children >= 2 ? '둘째 이상 출생아' : '첫째 출생아') + '는 ' + manwon(amount) + ' 상당의 이용권을 받을 수 있어요.'
      };
    }
  },
  {
    id: 'youthSave',
    name: '청년미래적금',
    category: '소득·세금',
    cash: true,
    deadline: '2026-11-27',
    period: '2026년 2차 가입신청 10월 7~16일 · 계좌개설 11월 16~27일',
    where: '서민금융진흥원 · 취급은행 앱',
    link: 'https://fill4young.kinfa.or.kr/yfs/main',
    linkLabel: '청년미래적금 안내',
    docs: '소득확인증명서, 가구원 동의',
    caution: '만 19~34세, 총급여 7,500만원 이하(또는 연매출 3억원 이하 소상공인), 가구 기준중위소득 200% 이하 등 심사를 통과해야 해요. 우대형은 기여금 12%로 최대 216만원까지 받을 수 있어요.',
    match(ctx, now) {
      if (ctx.age !== 'youth') return null;
      if (ctx.incomeKnown && ctx.income > 75000000) return null;
      const dl = deadlineInfo('2026-11-27', now);
      if (dl.state === 'passed') {
        return {
          confidence: 'check', est: 1080000, status: 'closed', deadlineLabel: '다음 모집 공고 확인',
          reason: '만 19~34세이고 총급여 7,500만원 이하라면 대상이에요. 2026년 2차 접수는 끝났고, 다음 모집 공고를 확인해 보세요.'
        };
      }
      return {
        confidence: 'check',
        est: 1080000,
        deadlineLabel: dl.label,
        reason: '이미 가입신청했다면 11월 27일까지 계좌를 열어야 해요. 월 50만원씩 3년 납입하면 정부기여금 6%(일반형)만 ' + manwon(1080000) + ', 이자 비과세까지 붙어요. 아직 신청 전이라면 다음 모집 공고를 확인하세요.'
      };
    }
  },
  {
    id: 'youthRent',
    name: '청년월세 지원',
    category: '주거',
    cash: true,
    period: '2026년 접수 3월 30일~5월 29일 마감 · 2027년 정기 모집 예정',
    where: '복지로',
    link: 'https://www.bokjiro.go.kr',
    linkLabel: '복지로에서 확인',
    docs: '임대차계약서, 월세 이체 내역, 소득·재산 신고서',
    caution: '부모와 따로 사는 만 19~34세 무주택 청년이 대상이고, 청년가구 중위소득 60%·원가구 100% 이하를 심사해요. 생애 1회, 최대 24개월이에요.',
    match(ctx) {
      if (ctx.age !== 'youth' || ctx.household !== 'single' || ctx.housing !== 'monthly') return null;
      const limit = 15380000;
      if (ctx.incomeKnown && ctx.income > limit) return null;
      return {
        confidence: 'check',
        est: 4800000,
        status: 'closed',
        deadlineLabel: '2027 모집 예정',
        reason: '월세 사는 만 19~34세 무주택 청년이면 월 20만원씩 최대 24개월, 480만원까지 받을 수 있어요. 2026년 접수는 끝나 2027년 모집을 기다려야 해요.'
      };
    }
  },
  {
    id: 'kpass',
    name: 'K-패스(모두의 카드)',
    category: '교통',
    cash: true,
    period: '상시 · 카드 발급 후 등록',
    where: 'K-패스 누리집 · 카드사',
    link: 'https://main.kotsa.or.kr/portal/contents.do?menuCode=01080300',
    linkLabel: 'K-패스 안내',
    docs: '전용 카드 발급, 회원가입·카드 등록',
    caution: '월 15회 이상 대중교통을 이용해야 하고, 환급률은 일반 20%·청년 30%·2자녀 30%·3자녀 50%·저소득 53.3%예요. 기본형과 모두의 카드 중 유리한 쪽이 자동 적용돼요.',
    match(ctx) {
      if (!ctx.transit) return null;
      const rate = kpassRate(ctx);
      const est = Math.round(ctx.transitSpend * rate * 12);
      return {
        confidence: 'high',
        est,
        reason: '월 교통비 ' + manwon(ctx.transitSpend) + '의 ' + Math.round(rate * 1000) / 10 + '%를 돌려받으면 1년에 약 ' + manwon(est) + '이에요.'
      };
    }
  },
  {
    id: 'telecomDiscount',
    name: '취약계층 통신요금 감면',
    category: '통신',
    cash: true,
    period: '상시 신청(신청한 달부터 적용)',
    where: 'ARS 1523 · 통신사 · 복지로 · 정부24',
    link: 'https://www.bokjiro.go.kr',
    linkLabel: '복지로에서 신청',
    docs: '본인 명의 회선, 신분증(대부분 전산 확인)',
    caution: '생계·의료급여 월 최대 3만 3,500원, 주거·교육급여·차상위 월 최대 2만 1,500원, 기초연금 월 최대 1만 1,000원이에요. 신청하지 않으면 적용되지 않아요.',
    match(ctx, now, extra) {
      const table = { basic_liv: 33500, basic_other: 21500, near_poor: 21500, senior: 11000 };
      if (ctx.telecom === 'disabled') {
        const mobile = (extra && extra.mobileCost) || 40000;
        return {
          confidence: 'high',
          est: Math.round(mobile * 0.35) * 12,
          reason: '등록 장애인·국가유공자는 기본료와 통화료의 35%를 감면받아요. 지금 요금 기준으로 1년에 약 ' + manwon(mobile * 0.35 * 12) + '이에요.'
        };
      }
      const monthly = table[ctx.telecom];
      if (!monthly) return null;
      return {
        confidence: 'high',
        est: monthly * 12,
        reason: '대상이면 매달 최대 ' + formatWon(monthly) + ', 1년에 ' + manwon(monthly * 12) + '을 감면받아요.'
      };
    }
  },
  {
    id: 'contractDiscount',
    name: '선택약정 25% 할인',
    category: '통신',
    cash: true,
    period: '상시(12·24개월 약정)',
    where: '통신사 고객센터 · 대리점',
    link: 'https://www.smartchoice.or.kr',
    linkLabel: '대상 단말기 조회',
    docs: '휴대폰에서 *#06#으로 IMEI 확인',
    caution: '지원금을 받지 않은 단말기이거나 약정이 끝난 뒤 같은 단말기를 쓰면 대상이에요. 복지할인과 중복 적용될 수 있어요.',
    match(ctx, now, extra) {
      if (ctx.contract === 'yes') return null;
      const actualMobile = extra && extra.mobileCost ? extra.mobileCost : 0;
      const mobile = actualMobile || 50000;
      const est = Math.round(mobile * 0.25) * 12;
      return {
        confidence: ctx.contract === 'no' ? 'high' : 'check',
        est,
        reason: actualMobile
          ? '지금 내는 휴대폰 요금 ' + manwon(mobile) + '의 25%를 매달 돌려받으면 1년에 ' + manwon(est) + '이에요.'
          : '휴대폰 요금을 아직 입력하지 않아 월 5만원 기준으로 계산했어요. 1년에 약 ' + manwon(est) + ', 요금이 높을수록 더 커요.'
      };
    }
  },
  {
    id: 'appliance',
    name: '고효율 가전 구매지원',
    category: '에너지',
    cash: true,
    deadline: '2026-12-31',
    period: '2026년 2월 9일~12월 31일(예산 소진 시 조기 종료)',
    where: '한전 고효율가전 홈페이지',
    link: 'https://www.en-ter.co.kr/support/main/main.do',
    linkLabel: '한전 고효율가전',
    docs: '거래내역서·영수증·효율등급 라벨·명판 사진',
    caution: '한전 전기요금 복지할인을 받는 가구만 신청할 수 있어요. 30% 환급군(수급·차상위·장애인·유공자) 또는 15% 환급군(3자녀·출산 3년·5인 이상), 가구당 누적 30만원 한도예요.',
    match(ctx) {
      const isHigh = ['basic_liv', 'basic_other', 'near_poor', 'disabled'].includes(ctx.telecom);
      const isLow = ctx.children >= 3;
      if (!isHigh && !isLow) return null;
      const est = isHigh ? 300000 : 150000;
      return {
        confidence: 'high',
        est,
        cost: true,
        reason: (isHigh ? '복지할인 30% 환급군' : '3자녀 이상 15% 환급군') + '이에요. 가전을 사면 구매가의 ' + (isHigh ? '30' : '15') + '%, 최대 30만원까지 돌려받아요.'
      };
    }
  },
  {
    id: 'energyVoucher',
    name: '에너지바우처',
    category: '에너지',
    cash: true,
    deadline: '2026-12-31',
    period: '2026년 6월 15일~12월 31일 신청 · 2027년 5월 31일까지 사용',
    where: '주민센터 · 복지로',
    link: 'https://www.energyv.or.kr',
    linkLabel: '에너지바우처 안내',
    docs: '신분증, 세대원 특성 확인서류',
    caution: '기초생활수급자이면서 세대원에 노인·영유아·장애인·임산부·다자녀 등이 있어야 해요. 1인 295,200원부터 4인 이상 701,300원까지 세대원 수에 따라 달라요.',
    match(ctx) {
      if (!['basic_liv', 'basic_other'].includes(ctx.telecom)) return null;
      if (!ctx.voucherMember) return null;
      const size = householdSize(ctx);
      const table = { 1: 295200, 2: 407500, 3: 532700, 4: 701300, 5: 701300 };
      const est = table[size] || 532700;
      return {
        confidence: 'high',
        est,
        reason: size + '인 세대 기준 ' + formatWon(est) + '을 냉·난방비로 쓸 수 있어요. 신청 기간이 지나면 못 받으니 서두르세요.'
      };
    }
  },
  {
    id: 'copay',
    name: '본인부담상한제 환급',
    category: '의료',
    cash: true,
    period: '진료한 해 다음 해 8월경 안내·지급',
    where: '국민건강보험공단 · 건강보험25시 앱',
    link: 'https://www.nhis.or.kr',
    linkLabel: '공단에서 조회',
    docs: '지급신청서, 본인 명의 계좌',
    caution: '2026년 진료분 상한액은 90만~843만원(요양병원 120일 초과 143만~1,096만원)이에요. 비급여·선별급여는 합산에서 빠지고, 지급동의계좌를 등록하면 자동으로 들어와요.',
    match(ctx) {
      if (ctx.medical === 'low') return null;
      const est = ctx.medical === 'high' ? 1500000 : 500000;
      return {
        confidence: 'check',
        est,
        reason: '한 해 병원비가 소득분위별 상한액을 넘으면 초과분을 돌려받아요. ' + (ctx.medical === 'high' ? '300만원 이상' : '100만~300만원') + ' 썼다면 환급 가능성을 확인해 보세요.'
      };
    }
  },
  {
    id: 'hometown',
    name: '고향사랑기부 세액공제',
    category: '소득·세금',
    cash: false,
    period: '연중(개인 연 2,000만원 한도)',
    where: '고향사랑e음',
    link: 'https://www.ilovegohyang.go.kr',
    linkLabel: '고향사랑e음',
    docs: '본인 인증, 기부금 영수증',
    caution: '10만원까지 100%, 10만원 초과~20만원 44%, 20만원 초과분 16.5% 세액공제(2026년 기부분부터). 답례품은 기부액의 30% 한도예요. 내가 사는 지역에는 기부할 수 없어요.',
    match() {
      return {
        confidence: 'high',
        est: 130000,
        cost: true,
        display: '10만원 기부 → 13만원 상당',
        reason: '10만원을 기부하면 세액공제 10만원 + 답례품 3만원, 사실상 13만원 상당을 돌려받아요.'
      };
    }
  },
  {
    id: 'refundClaim',
    name: '놓친 공제 경정청구',
    category: '소득·세금',
    cash: false,
    period: '법정신고기한 후 5년 이내',
    where: '국세청 홈택스',
    link: 'https://www.hometax.go.kr',
    linkLabel: '홈택스 경정청구',
    docs: '소득·세액공제 증빙자료',
    caution: '월세·의료비·교육비·중소기업 취업자 감면 등을 빠뜨렸다면 5년 안에 돌려받을 수 있어요. 홈택스의 미리보기로 확인해 보세요.',
    match(ctx) {
      if (ctx.worker !== 'employee') return null;
      return {
        confidence: 'check',
        est: 0,
        display: '환급액 조회',
        reason: '직장인이라면 지난 5년치 연말정산에서 빠뜨린 공제가 있는지 홈택스에서 확인할 수 있어요.'
      };
    }
  },
  {
    id: 'hrd',
    name: '국민내일배움카드',
    category: '소득·세금',
    cash: false,
    period: '상시(발급 후 5년)',
    where: '고용24 · HRD-Net',
    link: 'https://www.hrd.go.kr',
    linkLabel: 'HRD-Net 안내',
    docs: '본인 인증, 발급 신청',
    caution: '훈련비를 최대 300만~500만원까지 지원해요(유형별). 자비 부담과 훈련 과정에 따라 달라요.',
    match(ctx) {
      if (ctx.worker === 'none') return null;
      return {
        confidence: 'high',
        est: 0,
        display: '훈련비 최대 300~500만원',
        reason: '직장인·자영업·프리랜서 모두 신청할 수 있어요. 이직·부업에 필요한 교육을 지원받아 보세요.'
      };
    }
  },
  {
    id: 'yellowUmbrella',
    name: '노란우산공제',
    category: '자영업',
    cash: false,
    period: '상시',
    where: '중소기업중앙회 · 은행',
    link: 'https://www.kbiz.or.kr/ko/contents/contents/contents.do?mnSeq=337',
    linkLabel: '노란우산 안내',
    docs: '사업자등록증, 자동이체 계좌',
    caution: '월 5만~150만원을 납입하고 연 최대 600만원 소득공제를 받아요(소득 구간별). 중도해지하면 세금이 붙을 수 있어요.',
    match(ctx) {
      if (ctx.worker !== 'self') return null;
      return {
        confidence: 'high',
        est: 990000,
        cost: true,
        display: '소득공제 최대 600만원',
        reason: '소득공제 600만원을 16.5% 세율로 계산하면 약 99만원의 세금을 아낄 수 있어요. 폐업·노령 대비 목돈도 됩니다.'
      };
    }
  },
  {
    id: 'smallbizAppliance',
    name: '소상공인 고효율기기 지원',
    category: '자영업',
    cash: false,
    period: '2026년 예산 소진 시까지',
    where: '한전 에너지마켓플레이스',
    link: 'https://www.en-ter.co.kr/support/main/main.do',
    linkLabel: '한전 에너지마켓플레이스',
    docs: '중소기업확인서, 사업자등록증, 구매 증빙',
    caution: '에너지효율 1등급 냉난방기·냉장고는 구매가의 40%, 최대 160만원. 세탁기·건조기는 최대 80만원이에요. 사업장에 설치한 경우만 가능해요.',
    match(ctx) {
      if (ctx.worker !== 'self') return null;
      return {
        confidence: 'high',
        est: 1600000,
        cost: true,
        display: '구매가의 40% · 최대 160만원',
        reason: '사업장용 냉난방기·냉장고를 바꿀 계획이라면 구매가의 40%를 돌려받을 수 있어요.'
      };
    }
  },
  {
    id: 'jeonseLoan',
    name: '청년·신혼 전세자금대출',
    category: '주거',
    cash: false,
    period: '상시',
    where: '주택도시기금',
    link: 'https://enhuf.molit.go.kr',
    linkLabel: '기금e든든',
    docs: '임대차계약서, 소득·자산 확인',
    caution: '금리·한도는 소득·보증금·지역에 따라 달라요. 청년·신혼부부는 우대 금리와 한도가 적용될 수 있어요.',
    match(ctx) {
      if (ctx.housing !== 'jeonse') return null;
      if (ctx.age !== 'youth' && ctx.household === 'single') return null;
      return {
        confidence: 'high',
        est: 0,
        display: '전세대출 금리·한도 우대',
        reason: '전세·반전세라면 버팀목 전세자금의 청년·신혼 우대 조건을 확인해 보세요. 같은 전세라도 이자가 크게 달라져요.'
      };
    }
  },
  {
    id: 'telecomRefund',
    name: '해지한 통신·유료방송 미환급액',
    category: '숨은 돈',
    cash: false,
    period: '상시 조회',
    where: '스마트초이스',
    link: 'https://www.smartchoice.or.kr',
    linkLabel: '미환급액 조회',
    docs: '본인 인증',
    caution: '번호이동·해지 후 남은 잔액이 있으면 돌려받을 수 있어요. 가족 명의로 해지한 건도 확인해 보세요.',
    match() {
      return {
        confidence: 'high',
        est: 0,
        display: '잔액 조회',
        reason: '통신사를 옮기거나 해지하면서 남은 돈이 있으면 지금도 찾을 수 있어요.'
      };
    }
  },
  {
    id: 'hiddenMoney',
    name: '숨은 보험금 · 잊은 계좌',
    category: '숨은 돈',
    cash: false,
    period: '상시 조회',
    where: '금융감독원 파인 · 계좌정보통합관리서비스',
    link: 'https://fine.fss.or.kr',
    linkLabel: '파인에서 조회',
    docs: '본인 인증',
    caution: '가족이 남긴 보험금, 오래된 적금·예금도 조회할 수 있어요. 본인 명의 계좌를 미리 정리해 두세요.',
    match() {
      return {
        confidence: 'high',
        est: 0,
        display: '보험금·계좌 조회',
        reason: '잊고 있던 보험금, 휴면 계좌, 퇴직연금을 한 번에 조회할 수 있어요.'
      };
    }
  }
];

function matchBenefits(rawCtx, opts) {
  const ctx = normalizeBenefitCtx(rawCtx);
  const options = opts || {};
  const now = options.now instanceof Date ? options.now : new Date();
  const extra = { mobileCost: options.mobileCost || 0 };

  const items = [];
  PROGRAMS.forEach((program) => {
    let result = null;
    try {
      result = program.match(ctx, now, extra);
    } catch (err) {
      result = null;
    }
    if (!result) return;
    const status = result.status || (result.deadlineLabel ? 'soon' : 'open');
    items.push({
      id: program.id,
      name: program.name,
      category: program.category,
      cash: !!program.cash,
      est: Math.max(0, Math.round(result.est || 0)),
      confidence: result.confidence || 'high',
      status,
      deadlineLabel: result.deadlineLabel || '',
      display: result.display || '',
      cost: !!result.cost,
      payLabel: result.payLabel || '',
      reason: result.reason || '',
      period: program.period,
      where: program.where,
      link: program.link,
      linkLabel: program.linkLabel,
      docs: program.docs,
      caution: program.caution
    });
  });

  const order = { soon: 0, open: 1, closed: 2 };
  const rank = (status) => (Object.prototype.hasOwnProperty.call(order, status) ? order[status] : 1);
  items.sort((a, b) => {
    const statusDiff = rank(a.status) - rank(b.status);
    if (statusDiff !== 0) return statusDiff;
    return b.est - a.est;
  });

  const claimable = items.filter((i) => i.cash && !i.cost && i.status !== 'closed');
  const totalCash = claimable.reduce((sum, i) => sum + i.est, 0);
  const checkCount = items.filter((i) => i.confidence === 'check').length;
  const categories = [];
  items.forEach((i) => { if (categories.indexOf(i.category) < 0) categories.push(i.category); });

  return {
    ctx,
    items,
    count: items.length,
    claimableCount: claimable.length,
    totalCash,
    checkCount,
    categories,
    totalPrograms: PROGRAMS.length,
    hasClosed: items.some((i) => i.status === 'closed')
  };
}

/* ------------------------------------------------------------------ *
 * ⑤ 공유 문구
 * ------------------------------------------------------------------ */

function buildShareText(diag, benefits, url) {
  const lines = [];
  lines.push('[2026 고정비 체크기 진단 결과]');
  lines.push('가구: ' + diag.householdLabel + '가구');
  if (diag.debtIncluded) {
    lines.push('월 고정비: ' + formatWon(diag.total) + ' (생활 고정비 ' + formatWon(diag.living) + ')');
    lines.push('생활 고정비는 같은 형태 평균 ' + formatWon(diag.benchmark) + '의 ' + diag.percent + '%');
  } else {
    lines.push('월 고정비: ' + formatWon(diag.total) + ' (같은 형태 평균 ' + formatWon(diag.benchmark) + '의 ' + diag.percent + '%)');
  }
  if (diag.savingsAnnual > 0) {
    lines.push('1년에 아낄 수 있는 돈: ' + formatWon(diag.savingsAnnual));
    diag.savings
      .slice()
      .sort((a, b) => b.annual - a.annual)
      .slice(0, 3)
      .forEach((s) => lines.push('· ' + s.label + ' ' + formatWon(s.annual)));
  }
  if (diag.top3.length) {
    lines.push('가장 쉬운 절감 TOP3: ' + diag.top3.map((t) => t.label).join(' · '));
  }
  if (benefits && benefits.count) {
    lines.push('');
    lines.push('숨은 지원금 ' + benefits.count + '개 · 최대 ' + formatWon(benefits.totalCash));
    benefits.items
      .filter((i) => i.cash && !i.cost && i.status !== 'closed')
      .slice(0, 4)
      .forEach((i) => lines.push('· ' + i.name + ' ' + manwon(i.est)));
  }
  if (url) {
    lines.push('');
    lines.push('진단: ' + url);
  }
  return lines.join('\n');
}

function buildBenefitShareText(benefits, url) {
  const lines = [];
  lines.push('[2026 숨은 지원금 체크 결과]');
  lines.push('해당 제도 ' + benefits.count + '개 · 지금 신청 가능한 최대 ' + formatWon(benefits.totalCash));
  benefits.items
    .filter((i) => i.cash && !i.cost && i.status !== 'closed')
    .slice(0, 6)
    .forEach((i) => lines.push('· ' + i.name + ' — 최대 ' + manwon(i.est)));
  if (benefits.hasClosed) lines.push('※ 접수 시기가 지난 제도는 합계에서 뺐어요.');
  if (url) {
    lines.push('');
    lines.push('확인: ' + url);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * ⑥ 화면 (브라우저에서만 실행)
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'lcc.state.v1';

const state = {
  tab: 'diagnosis',
  diagnosis: normalizeDiagnosisInput({}),
  benefit: Object.assign({}, DEFAULT_BENEFIT_STATE),
  benefitFilter: '전체',
  openPrograms: []
};

const el = {};
let diagTimer = null;

function $(id) { return document.getElementById(id); }

function cacheEls() {
  [
    'tab-diagnosis', 'tab-benefits', 'panel-diagnosis', 'panel-benefits',
    'householdChips', 'householdHint',
    'housingCost', 'utilityCost', 'mobileCost', 'internetCost', 'insuranceCost', 'loanCost',
    'bundleDiscount', 'subList', 'subTotal', 'diagResult', 'calcBtn', 'exampleBtn', 'resetBtn',
    'benefitForm', 'benefitResult', 'benefitCount', 'benefitProgress', 'benefitProgressNote',
    'transitSpend', 'transitSpendRow', 'toast'
  ].forEach((id) => { el[id] = $(id); });
  el.moneyInputs = {
    housingCost: el.housingCost, utilityCost: el.utilityCost, mobileCost: el.mobileCost,
    internetCost: el.internetCost, insuranceCost: el.insuranceCost, loanCost: el.loanCost,
    transitSpend: el.transitSpend
  };
}

/* ---------- 저장 ---------- */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tab: state.tab,
      diagnosis: state.diagnosis,
      benefit: state.benefit
    }));
  } catch (e) { /* 저장 실패는 무시 */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && (saved.tab === 'benefits' || saved.tab === 'diagnosis')) state.tab = saved.tab;
    if (saved && saved.diagnosis) state.diagnosis = normalizeDiagnosisInput(saved.diagnosis);
    if (saved && saved.benefit) state.benefit = Object.assign({}, DEFAULT_BENEFIT_STATE, saved.benefit);
    if (saved && saved.benefit && !saved.benefit.transitSpend) {
      state.benefit.transitSpend = 60000;
    }
  } catch (e) { /* 무시 */ }
}

/* ---------- 칩 ---------- */
function chipButton(field, option, selected) {
  return '<button type="button" class="chip' + (selected ? ' is-on' : '') + '"' +
    ' role="radio" aria-checked="' + (selected ? 'true' : 'false') + '"' +
    ' data-field="' + field + '" data-value="' + escapeHtml(option.value) + '">' +
    escapeHtml(option.label) + '</button>';
}

function renderChips(container, field, options, value) {
  if (!container) return;
  container.innerHTML = options.map((o) => chipButton(field, o, o.value === value)).join('');
}

function renderAllChips() {
  // 진단 탭
  renderChips(el.householdChips, 'household', OPTIONS.household, state.diagnosis.household);
  // 지원금 탭
  const groups = el.benefitForm ? el.benefitForm.querySelectorAll('[data-field]') : [];
  groups.forEach((group) => {
    const field = group.getAttribute('data-field');
    const box = group.querySelector('.chips');
    if (!box || !OPTIONS[field]) return;
    const value = field === 'household' ? state.benefit.household : state.benefit[field];
    renderChips(box, field, OPTIONS[field], value);
  });
  syncConditionalRows();
  syncChips();
}

function syncChips() {
  document.querySelectorAll('.chip').forEach((chip) => {
    const field = chip.getAttribute('data-field');
    const value = chip.getAttribute('data-value');
    const current = field === 'household' && chip.closest('#householdChips')
      ? state.diagnosis.household
      : state.benefit[field];
    const on = String(current) === String(value);
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  // 진단 탭 가구 칩은 state.diagnosis 기준으로 다시 맞춘다
  if (el.householdChips) {
    el.householdChips.querySelectorAll('.chip').forEach((chip) => {
      const on = chip.getAttribute('data-value') === state.diagnosis.household;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
}

/** 조건부 질문 표시 */
function syncConditionalRows() {
  document.querySelectorAll('[data-show-if]').forEach((row) => {
    const rule = row.getAttribute('data-show-if');
    const [field, values] = rule.split(':');
    const allowed = values.split(',');
    const current = field === 'household' ? state.benefit.household : state.benefit[field];
    row.hidden = allowed.indexOf(String(current)) < 0;
  });
  // 자녀가 없으면 막내 나이 질문 숨김
  const youngest = document.querySelector('[data-field="youngest"]');
  if (youngest) youngest.hidden = Number(state.benefit.children) === 0;
  if (el.transitSpendRow) el.transitSpendRow.hidden = state.benefit.transit !== 'yes';
  const voucher = document.querySelector('[data-field="voucherMember"]');
  if (voucher) {
    const t = state.benefit.telecom;
    voucher.hidden = !(t === 'basic_liv' || t === 'basic_other');
  }
}

/* ---------- 구독 목록 ---------- */
function renderSubscriptions() {
  if (!el.subList) return;
  el.subList.innerHTML = SUBSCRIPTIONS.map((s) => {
    const st = state.diagnosis.subs[s.id];
    return '<div class="sub' + (st.on ? '' : ' is-off') + '" data-sub="' + s.id + '">' +
      '<label class="sub__toggle">' +
        '<input type="checkbox" data-sub-toggle="' + s.id + '"' + (st.on ? ' checked' : '') + '>' +
        '<span class="switch" aria-hidden="true"></span>' +
        '<span class="sub__name">' + escapeHtml(s.name) + '</span>' +
        '<span class="sub__tag">' + escapeHtml(s.tag) + '</span>' +
      '</label>' +
      '<label class="sub__amount">' +
        '<input type="text" inputmode="numeric" data-sub-amount="' + s.id + '" value="' + formatNumber(st.amount) + '" aria-label="' + escapeHtml(s.name) + ' 월 요금"' + (st.on ? '' : ' disabled') + '>' +
        '<span>원</span>' +
      '</label>' +
    '</div>';
  }).join('');
  updateSubTotal();
}

function updateSubTotal() {
  const total = SUBSCRIPTIONS.reduce((sum, s) => {
    const st = state.diagnosis.subs[s.id];
    return sum + (st.on ? st.amount : 0);
  }, 0);
  if (el.subTotal) el.subTotal.textContent = formatWon(total);
  return total;
}

/* ---------- 진단 결과 ---------- */
function gaugeSvg(percent) {
  const capped = clamp(percent, 0, 160);
  const circumference = 2 * Math.PI * 54;
  const dash = (capped / 160) * circumference;
  return '<svg class="gauge" viewBox="0 0 128 128" role="img" aria-label="같은 형태 평균 대비 ' + percent + '%">' +
    '<circle class="gauge__track" cx="64" cy="64" r="54" fill="none" stroke-width="12"></circle>' +
    '<circle class="gauge__value" cx="64" cy="64" r="54" fill="none" stroke-width="12" stroke-linecap="round" ' +
      'stroke-dasharray="' + dash.toFixed(1) + ' ' + circumference.toFixed(1) + '"></circle>' +
    '<text class="gauge__num" x="64" y="60" text-anchor="middle">' + percent + '<tspan class="gauge__pct">%</tspan></text>' +
    '<text class="gauge__cap" x="64" y="80" text-anchor="middle">평균 대비</text>' +
  '</svg>';
}

function renderDiagnosis() {
  if (!el.diagResult) return;
  const diag = computeDiagnosis(state.diagnosis);

  if (!diag.hasValues) {
    el.diagResult.innerHTML =
      '<div class="card empty">' +
        '<div class="empty__icon" aria-hidden="true">🧾</div>' +
        '<h3>' + diag.status.headline + '</h3>' +
        '<p>' + diag.status.message + '</p>' +
        '<button class="btn btn--primary btn--sm" type="button" data-action="example">예시값으로 체험하기</button>' +
      '</div>';
    return;
  }

  const savingParts = manwonParts(diag.savingsAnnual);
  const overrunText = diag.gap > 0
    ? '평균보다 매달 ' + formatWon(diag.gap) + ' 더 나가요.'
    : diag.gap < 0
      ? '평균보다 매달 ' + formatWon(Math.abs(diag.gap)) + ' 적게 나가요.'
      : '같은 형태 평균과 거의 같아요.';

  const maxBar = Math.max(diag.chart.before, 1);

  const top3Html = diag.top3.map((item, index) =>
    '<li class="top3__item">' +
      '<span class="top3__rank">' + (index + 1) + '</span>' +
      '<div class="top3__text">' +
        '<h4>' + escapeHtml(item.label) + ' <span class="pill pill--soft">' + item.easeLabel + '</span></h4>' +
        '<p>' + escapeHtml(item.tip) + '</p>' +
      '</div>' +
      '<strong class="top3__amount">' + manwon(item.annual) + '<span>연</span></strong>' +
    '</li>'
  ).join('');

  const catHtml = CATEGORY_META.map((meta) => {
    const s = diag.savings.find((x) => x.key === meta.key);
    const monthly = diag.monthly[meta.key];
    const bench = diag.input.household ? HOUSEHOLDS[diag.input.household].bench[meta.key] : 0;
    const width = diag.total > 0 ? Math.round((monthly / diag.total) * 100) : 0;
    const savingAnnual = s ? s.annual : 0;
    return '<div class="cat">' +
      '<div class="cat__head"><span>' + escapeHtml(meta.label) + '</span><b>' + formatWon(monthly) + '</b></div>' +
      '<div class="bar bar--thin"><i style="width:' + width + '%"></i></div>' +
      '<div class="cat__foot">' +
        '<span>연 ' + manwon(savingAnnual) + ' 절감 가능</span>' +
        '<span>' + (bench ? '평균 ' + formatWon(bench) : '평균 비교 없음') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  const tips = [];
  if (diag.monthly.telecom > 0 && !diag.bundleDiscount) {
    tips.push('인터넷과 휴대폰을 같은 통신사로 묶으면 결합할인이 붙어요. 지금 조건과 비교해 보세요.');
  }
  if (diag.monthly.subscription > 0) {
    tips.push('구독 ' + diag.subCount + '개 중 지난달에 안 쓴 게 있나요? 3개월에 한 번만 열어도 정리 대상이에요.');
  }
  if (diag.monthly.telecom > 0) {
    tips.push('휴대폰 요금은 선택약정 25%와 알뜰폰을 같은 조건으로 비교해 보세요. 5분이면 확인됩니다.');
  }
  if (diag.monthly.insurance > 0) {
    tips.push('보험은 해지보다 중복 특약 정리가 먼저예요. 보장 공백이 생기지 않게 확인하세요.');
  }
  if (diag.monthly.housing > 0) {
    tips.push('관리비 내역서에서 오래된 옵션·공용 전기 항목을 확인하면 매달 조금씩 줄일 수 있어요.');
  }

  el.diagResult.innerHTML =
    '<section class="card score score--' + diag.status.key + '">' +
      '<div class="score__gauge">' + gaugeSvg(diag.percent) + '</div>' +
      '<div class="score__body">' +
        '<span class="pill pill--' + diag.status.key + '">' + diag.status.label + '</span>' +
        '<h3>' + diag.status.headline + '</h3>' +
        '<p>' + overrunText + '</p>' +
        '<p class="score__sub">월 소비지출의 ' + Math.round(diag.shareOfConsumption * 100) + '%가 고정비예요.</p>' +
      '</div>' +
    '</section>' +

    '<section class="stat-strip" aria-label="고정비 요약">' +
      '<div><span>월 고정비</span><b>' + manwon(diag.total) + '</b></div>' +
      '<div><span>같은 형태 평균</span><b>' + manwon(diag.benchmark) + '</b></div>' +
      '<div><span>1년 누수</span><b class="' + (diag.overrun > 0 ? 'is-over' : '') + '">' + (diag.overrun > 0 ? manwon(diag.overrunAnnual) : '없음') + '</b></div>' +
      (diag.debtIncluded ? '<p class="stat-strip__note">평균 비교와 누수는 대출·할부를 뺀 생활 고정비 기준이에요.</p>' : '') +
    '</section>' +

    '<section class="savings-hero">' +
      '<p class="savings-hero__label">1년에 아낄 수 있는 돈</p>' +
      '<p class="savings-hero__value">' + savingParts.num + '<small>' + savingParts.unit + '</small></p>' +
      '<p class="savings-hero__sub">월 ' + manwon(diag.savingsMonthly) + ' · 지금 고정비의 ' + Math.round(diag.savingsMonthly / diag.total * 100) + '%</p>' +
    '</section>' +

    '<section class="card">' +
      '<h3 class="card__title">1년 아끼면 얼마?</h3>' +
      '<div class="chart" role="img" aria-label="현재 연 고정비 ' + formatWon(diag.chart.before) + ', 줄인 뒤 ' + formatWon(diag.chart.after) + ', 절감 ' + formatWon(diag.chart.saved) + '">' +
        '<div class="chart__row">' +
          '<span class="chart__label">지금</span>' +
          '<div class="bar"><i style="width:' + Math.round(diag.chart.before / maxBar * 100) + '%"></i></div>' +
          '<b class="chart__value">' + manwon(diag.chart.before) + '</b>' +
        '</div>' +
        '<div class="chart__row chart__row--after">' +
          '<span class="chart__label">줄인 뒤</span>' +
          '<div class="bar"><i style="width:' + Math.round(diag.chart.after / maxBar * 100) + '%"></i></div>' +
          '<b class="chart__value">' + manwon(diag.chart.after) + '</b>' +
        '</div>' +
        '<div class="chart__row chart__row--save">' +
          '<span class="chart__label">아낀 돈</span>' +
          '<div class="bar"><i style="width:' + Math.round(diag.chart.saved / maxBar * 100) + '%"></i></div>' +
          '<b class="chart__value">' + manwon(diag.chart.saved) + '</b>' +
        '</div>' +
      '</div>' +
      '<p class="hint">막대는 1년 합계예요. 절감액은 항목별로 현실적으로 줄일 수 있는 비율을 보수적으로 잡은 값이에요.</p>' +
    '</section>' +

    (diag.top3.length ?
    '<section class="card card--accent">' +
      '<h3 class="card__title">가장 줄이기 쉬운 TOP 3</h3>' +
      '<ol class="top3">' + top3Html + '</ol>' +
    '</section>' : '') +

    '<section class="card">' +
      '<h3 class="card__title">항목별로 보기</h3>' +
      '<div class="cat-list">' + catHtml + '</div>' +
      (diag.debtIncluded ? '<p class="hint">대출·할부는 같은 형태 평균에 없어서 \'평균 대비\' 계산에서 뺐어요. 원금은 자산이 되지만 이자는 매달 사라지는 돈이에요.</p>' : '') +
    '</section>' +

    (tips.length ?
    '<section class="card">' +
      '<h3 class="card__title">이번 주에 할 수 있는 점검</h3>' +
      '<ul class="tips">' + tips.map((t) => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul>' +
    '</section>' : '') +

    '<section class="card share-card">' +
      '<h3>진단 결과 저장해 두기</h3>' +
      '<p>카카오톡·문자에 붙여넣으면 표로 정리돼요. 다음 달에 다시 비교해 보세요.</p>' +
      '<button class="btn btn--primary btn--block" type="button" data-action="share-diagnosis">진단 결과 복사하기</button>' +
    '</section>' +

    '<button class="next-cta" type="button" data-action="go-benefits">' +
      '<span>이 조건으로 받을 수 있는 숨은 지원금 찾기</span><span aria-hidden="true">→</span>' +
    '</button>' +

    '<p class="fineprint">입력값은 이 브라우저에만 저장되고 서버로 보내지 않아요. 결과는 참고용이며, 평균은 가구원수별 통계를 바탕으로 한 추정치예요.</p>';
}

/* ---------- 지원금 결과 ---------- */
function programCard(item, isOpen) {
  const badges = [];
  if (item.status === 'closed') badges.push('<span class="badge badge--muted">' + escapeHtml(item.deadlineLabel || '접수 종료') + '</span>');
  else if (item.deadlineLabel && item.status === 'soon') badges.push('<span class="badge badge--urgent">' + escapeHtml(item.deadlineLabel) + '</span>');
  if (item.confidence === 'check') badges.push('<span class="badge badge--check">확인 필요</span>');
  if (item.cost) badges.push('<span class="badge badge--cost">' + escapeHtml(item.payLabel || '지출 필요') + '</span>');

  const amount = item.est > 0
    ? (item.cash ? '최대 ' + manwon(item.est) : (item.display || manwon(item.est)))
    : (item.display || '조회·확인');

  return '<details class="prog' + (item.status === 'closed' ? ' is-closed' : '') + '" data-program="' + item.id + '"' + (isOpen ? ' open' : '') + '>' +
    '<summary class="prog__sum">' +
      '<span class="prog__cat">' + escapeHtml(item.category) + '</span>' +
      '<span class="prog__main">' +
        '<span class="prog__name">' + escapeHtml(item.name) + '</span>' +
        '<span class="prog__amount">' + escapeHtml(amount) + '</span>' +
        '<span class="prog__badges">' + badges.join('') + '</span>' +
      '</span>' +
      '<span class="prog__chev" aria-hidden="true"></span>' +
    '</summary>' +
    '<div class="prog__body">' +
      '<p class="prog__reason">' + escapeHtml(item.reason) + '</p>' +
      '<dl class="prog__meta">' +
        '<div><dt>신청처</dt><dd>' + escapeHtml(item.where) + '</dd></div>' +
        '<div><dt>시기</dt><dd>' + escapeHtml(item.period) + '</dd></div>' +
        '<div><dt>준비물</dt><dd>' + escapeHtml(item.docs) + '</dd></div>' +
      '</dl>' +
      '<p class="prog__caution">' + escapeHtml(item.caution) + '</p>' +
      '<div class="prog__actions">' +
        '<a class="btn btn--primary btn--sm" href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener">' + escapeHtml(item.linkLabel || '신청처 열기') + '</a>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="share-benefit" data-id="' + item.id + '">공유</button>' +
      '</div>' +
    '</div>' +
  '</details>';
}

function renderBenefits() {
  if (!el.benefitResult) return;
  const result = matchBenefits(state.benefit, {
    mobileCost: state.diagnosis.mobileCost,
    now: new Date()
  });

  const maxCount = result.totalPrograms || 1;
  if (el.benefitCount) el.benefitCount.textContent = result.count;
  if (el.benefitProgress) el.benefitProgress.style.width = Math.min(100, Math.round(result.count / maxCount * 100)) + '%';
  if (el.benefitProgressNote) {
    el.benefitProgressNote.textContent = result.checkCount > 0
      ? result.checkCount + '개는 소득·요건 확인이 더 필요해요.'
      : '조건을 바꾸면 결과가 바로 달라져요.';
  }

  if (!result.count) {
    el.benefitResult.innerHTML =
      '<div class="card empty">' +
        '<div class="empty__icon" aria-hidden="true">🔍</div>' +
        '<h3>지금 조건에서는 맞는 제도가 없어요</h3>' +
        '<p>소득 구간이나 자녀 수를 바꿔 보세요. 대부분의 지원금은 소득·가구 조건으로 갈려요.</p>' +
      '</div>';
    return;
  }

  const filter = state.benefitFilter;
  const filtered = filter === '전체' ? result.items : result.items.filter((i) => i.category === filter);
  const totalParts = manwonParts(result.totalCash);

  const filters = ['전체'].concat(result.categories).map((c) =>
    '<button type="button" class="filter' + (c === filter ? ' is-on' : '') + '" data-action="filter" data-category="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>'
  ).join('');

  const cards = filtered.map((item) => programCard(item, state.openPrograms.indexOf(item.id) >= 0)).join('');

  el.benefitResult.innerHTML =
    '<section class="total-card">' +
      '<p>지금 신청할 수 있는 지원금</p>' +
      '<p class="total-card__value">최대 ' + totalParts.num + '<small>' + totalParts.unit + '</small></p>' +
      '<p class="total-card__sub">' + result.count + '개 제도 해당 · 그중 ' + result.claimableCount + '개는 바로 신청 가능' +
        (result.hasClosed ? ' · 접수 지난 제도는 합계에서 제외' : '') + '<br>' +
        (result.items.some((i) => i.id === 'youthSave') ? '구매·기부형 제도는 뺐고, 청년미래적금은 3년 적립 후 받는 정부기여금이에요.' : '구매·기부가 필요한 제도는 합계에서 제외했어요.') + '</p>' +
    '</section>' +

    '<div class="filters" role="group" aria-label="카테고리 필터">' + filters + '</div>' +

    '<div class="prog-list">' + cards + '</div>' +

    '<section class="card share-card">' +
      '<h3>친구·가족에게도 알려주기</h3>' +
      '<p>조건이 비슷한 사람에게 보내면 같이 신청할 수 있어요.</p>' +
      '<button class="btn btn--primary btn--block" type="button" data-action="share-benefits">지원금 목록 복사하기</button>' +
    '</section>' +

    '<p class="fineprint">금액은 조건을 모두 채웠을 때의 최대치예요. 실제 수령 여부와 금액은 각 기관 심사로 정해지고, 제도는 예고 없이 바뀔 수 있어요. 신청 전 공고를 꼭 확인하세요.</p>';
}

/* ---------- 입력 동기화 ---------- */
function syncDiagnosisInputs() {
  Object.keys(el.moneyInputs).forEach((key) => {
    if (!el.moneyInputs[key]) return;
    const value = state.diagnosis[key];
    el.moneyInputs[key].value = value ? formatNumber(value) : '';
  });
  if (el.bundleDiscount) el.bundleDiscount.checked = !!state.diagnosis.bundleDiscount;
  renderSubscriptions();
}

function syncBenefitInputs() {
  if (el.transitSpend) el.transitSpend.value = state.benefit.transitSpend ? formatNumber(state.benefit.transitSpend) : '';
  renderAllChips();
}

/* ---------- 탭 ---------- */
function setTab(tab, opts) {
  const isBenefits = tab === 'benefits';
  state.tab = isBenefits ? 'benefits' : 'diagnosis';
  if (el['tab-diagnosis']) {
    el['tab-diagnosis'].classList.toggle('is-active', !isBenefits);
    el['tab-diagnosis'].setAttribute('aria-selected', String(!isBenefits));
    el['tab-diagnosis'].tabIndex = isBenefits ? -1 : 0;
  }
  if (el['tab-benefits']) {
    el['tab-benefits'].classList.toggle('is-active', isBenefits);
    el['tab-benefits'].setAttribute('aria-selected', String(isBenefits));
    el['tab-benefits'].tabIndex = isBenefits ? 0 : -1;
  }
  if (el['panel-diagnosis']) el['panel-diagnosis'].hidden = isBenefits;
  if (el['panel-benefits']) el['panel-benefits'].hidden = !isBenefits;
  const tabs = document.querySelector('.tabs');
  if (tabs) tabs.style.setProperty('--tab', isBenefits ? '1' : '0');
  if (isBenefits) renderBenefits();
  if (!opts || !opts.silent) {
    const target = document.querySelector('.tabs-wrap');
    if (target) {
      const top = target.getBoundingClientRect().top + window.pageYOffset - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }
  saveState();
}

/* ---------- 토스트 ---------- */
let toastTimer = null;
function toast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.hidden = false;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('is-on');
    setTimeout(() => { el.toast.hidden = true; }, 220);
  }, 2600);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function shareDiagnosis() {
  const diag = computeDiagnosis(state.diagnosis);
  const benefits = matchBenefits(state.benefit, { mobileCost: state.diagnosis.mobileCost, now: new Date() });
  const text = buildShareText(diag, benefits, location.href.split('#')[0]);
  copyText(text).then((ok) => toast(ok ? '진단 결과를 복사했어요. 붙여넣기만 하면 됩니다.' : '복사가 안 됐어요. 화면을 길게 눌러 복사해 주세요.'));
}

function shareBenefits() {
  const benefits = matchBenefits(state.benefit, { mobileCost: state.diagnosis.mobileCost, now: new Date() });
  const text = buildBenefitShareText(benefits, location.href.split('#')[0]);
  copyText(text).then((ok) => toast(ok ? '지원금 목록을 복사했어요.' : '복사가 안 됐어요. 화면을 길게 눌러 복사해 주세요.'));
}

/* ---------- 예시 / 초기화 ---------- */
function fillExample() {
  const hh = state.diagnosis.household;
  const ex = EXAMPLES[hh] || EXAMPLES.single;
  state.diagnosis = normalizeDiagnosisInput(Object.assign({}, state.diagnosis, ex, { household: hh, subs: JSON.parse(JSON.stringify(ex.subs)) }));
  syncDiagnosisInputs();
  renderDiagnosis();
  saveState();
  const result = el.diagResult;
  if (result) result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('예시값을 채웠어요. 우리 집 숫자로 바꿔보세요.');
}

function resetDiagnosis() {
  state.diagnosis = normalizeDiagnosisInput({ household: state.diagnosis.household });
  syncDiagnosisInputs();
  renderDiagnosis();
  saveState();
  toast('입력을 지웠어요.');
}

/** 가구 형태를 바꾸면 두 탭의 조건을 함께 맞춘다 */
function applyHousehold(value) {
  state.diagnosis.household = value;
  state.benefit.household = value;
  if (value === 'single') {
    state.benefit.children = '0';
    state.benefit.youngest = 'none';
  } else if (value === 'family' && state.benefit.children === '0') {
    state.benefit.children = '1';
    state.benefit.youngest = '2-8';
  }
  syncChips();
  syncConditionalRows();
  renderDiagnosis();
  renderBenefits();
  saveState();
}

/* ---------- 이벤트 ---------- */
function bindEvents() {
  // 돈 입력
  Object.keys(el.moneyInputs).forEach((key) => {
    const input = el.moneyInputs[key];
    if (!input) return;
    input.addEventListener('input', () => {
      const value = formatMoneyInput(input);
      if (key === 'transitSpend') {
        state.benefit.transitSpend = value;
        renderBenefits();
      } else {
        state.diagnosis[key] = value;
        scheduleDiagnosisRender();
      }
      saveState();
    });
    input.addEventListener('blur', () => {
      if (input.value && toNumber(input.value) === 0) input.value = '';
    });
  });

  if (el.bundleDiscount) {
    el.bundleDiscount.addEventListener('change', () => {
      state.diagnosis.bundleDiscount = el.bundleDiscount.checked;
      renderDiagnosis();
      saveState();
    });
  }

  // 가구 형태 칩
  if (el.householdChips) {
    el.householdChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      applyHousehold(chip.getAttribute('data-value'));
    });
  }

  // 지원금 질문 칩
  const benefitForm = el.benefitForm;
  if (benefitForm) {
    benefitForm.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const field = chip.getAttribute('data-field');
      const value = chip.getAttribute('data-value');
      if (!field || OPTIONS[field] === undefined) return;
      if (field === 'household') {
        applyHousehold(value);
        return;
      } else {
        state.benefit[field] = value;
      }
      if (field === 'children') {
        if (value === '0') state.benefit.youngest = 'none';
        else if (state.benefit.youngest === 'none') state.benefit.youngest = '2-8';
      }
      syncChips();
      syncConditionalRows();
      renderBenefits();
      saveState();
    });
  }

  // 구독 토글 / 금액
  if (el.subList) {
    el.subList.addEventListener('change', (e) => {
      const toggle = e.target.closest('[data-sub-toggle]');
      if (!toggle) return;
      const id = toggle.getAttribute('data-sub-toggle');
      state.diagnosis.subs[id].on = toggle.checked;
      const row = toggle.closest('.sub');
      if (row) row.classList.toggle('is-off', !toggle.checked);
      const amountInput = el.subList.querySelector('[data-sub-amount="' + id + '"]');
      if (amountInput) amountInput.disabled = !toggle.checked;
      updateSubTotal();
      scheduleDiagnosisRender();
      saveState();
    });
    el.subList.addEventListener('input', (e) => {
      const input = e.target.closest('[data-sub-amount]');
      if (!input) return;
      const id = input.getAttribute('data-sub-amount');
      const value = formatMoneyInput(input);
      state.diagnosis.subs[id].amount = clamp(value, 0, 1000000);
      updateSubTotal();
      scheduleDiagnosisRender();
      saveState();
    });
  }

  // 폼 제출로 페이지가 새로고침되지 않게
  ['diagForm', 'benefitForm'].forEach((id) => {
    const form = document.getElementById(id);
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
  });

  // 버튼들
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    if (action === 'example') fillExample();
    if (action === 'share-diagnosis') shareDiagnosis();
    if (action === 'share-benefits') shareBenefits();
    if (action === 'share-benefit') {
      const id = actionEl.getAttribute('data-id');
      const result = matchBenefits(state.benefit, { mobileCost: state.diagnosis.mobileCost, now: new Date() });
      const item = result.items.find((i) => i.id === id);
      if (item) {
        const text = '[' + item.name + '] 최대 ' + manwon(item.est) + '\n' + item.reason + '\n신청: ' + item.where + ' (' + item.link + ')';
        copyText(text).then((ok) => toast(ok ? item.name + ' 정보를 복사했어요.' : '복사가 안 됐어요.'));
      }
    }
    if (action === 'go-benefits') {
      setTab('benefits');
    }
    if (action === 'jump-benefits') {
      renderBenefits();
      if (el.benefitResult) el.benefitResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (action === 'filter') {
      state.benefitFilter = actionEl.getAttribute('data-category');
      renderBenefits();
      saveState();
      const next = el.benefitResult && el.benefitResult.querySelector('.filter[data-category="' + state.benefitFilter + '"]');
      if (next) next.focus();
    }
  });

  if (el.calcBtn) {
    el.calcBtn.addEventListener('click', () => {
      renderDiagnosis();
      if (el.diagResult) el.diagResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (el.exampleBtn) el.exampleBtn.addEventListener('click', fillExample);
  if (el.resetBtn) el.resetBtn.addEventListener('click', resetDiagnosis);

  // details 열림 상태 기억
  if (el.benefitResult) {
    el.benefitResult.addEventListener('toggle', (e) => {
      const details = e.target;
      if (!details.matches('details.prog')) return;
      const id = details.getAttribute('data-program');
      if (details.open) {
        if (state.openPrograms.indexOf(id) < 0) state.openPrograms.push(id);
      } else {
        state.openPrograms = state.openPrograms.filter((x) => x !== id);
      }
    }, true);
  }

  // 탭
  if (el['tab-diagnosis']) el['tab-diagnosis'].addEventListener('click', () => setTab('diagnosis'));
  if (el['tab-benefits']) el['tab-benefits'].addEventListener('click', () => setTab('benefits'));
  const tablist = document.querySelector('.tabs');
  if (tablist) {
    tablist.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = state.tab === 'benefits' ? 'diagnosis' : 'benefits';
      setTab(next);
      const btn = el[next === 'benefits' ? 'tab-benefits' : 'tab-diagnosis'];
      if (btn) btn.focus();
    });
  }

  // 단축키: 숫자 1·2
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === '1') setTab('diagnosis');
    if (e.key === '2') setTab('benefits');
  });
}

function formatMoneyInput(input) {
  const before = input.value;
  const caret = input.selectionStart === null ? before.length : input.selectionStart;
  const digits = before.replace(/\D/g, '').slice(0, 9);
  const formatted = digits ? formatNumber(Number(digits)) : '';
  if (formatted !== before) {
    input.value = formatted;
    try {
      if (caret >= before.length) {
        input.setSelectionRange(formatted.length, formatted.length);
      } else {
        const digitsBeforeCaret = before.slice(0, caret).replace(/\D/g, '').length;
        let pos = 0;
        let counted = 0;
        while (pos < formatted.length && counted < digitsBeforeCaret) {
          if (/\d/.test(formatted[pos])) counted += 1;
          pos += 1;
        }
        input.setSelectionRange(pos, pos);
      }
    } catch (err) { /* setSelectionRange 미지원 무시 */ }
  }
  return digits ? Number(digits) : 0;
}

function scheduleDiagnosisRender() {
  clearTimeout(diagTimer);
  diagTimer = setTimeout(renderDiagnosis, 220);
}

/* ---------- 시작 ---------- */
function init() {
  cacheEls();
  loadState();
  syncDiagnosisInputs();
  syncBenefitInputs();
  bindEvents();
  renderDiagnosis();
  renderBenefits();
  setTab(state.tab, { silent: true });

  // URL 해시/쿼리로 탭 열기 (?tab=benefits · #benefits)
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === 'benefits' || location.hash === '#benefits') setTab('benefits', { silent: true });
  } catch (e) { /* 무시 */ }

  // 빈 광고 슬롯 숨김 (AdSense 코드가 들어가면 자동으로 보임)
  document.querySelectorAll('.ad').forEach((ad) => {
    const box = ad.querySelector('.ad__box');
    if (box && !box.children.length && !box.textContent.trim()) ad.hidden = true;
  });

  // 서비스 워커
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* file:// 등 미지원 무시 */ });
    });
  }
}

const API = {
  APP_VERSION, AS_OF,
  HOUSEHOLDS, SUBSCRIPTIONS, CATEGORY_META, EXAMPLES, OPTIONS, INCOME_OPTIONS,
  PROGRAMS, DEFAULT_BENEFIT_STATE,
  toNumber, formatNumber, manwon, manwonParts, formatWon, clamp, deadlineInfo,
  normalizeDiagnosisInput, computeDiagnosis, statusForRatio,
  normalizeBenefitCtx, matchBenefits, incomeAmount,
  buildShareText, buildBenefitShareText, kpassRate, eitcType, householdSize,
  state, renderDiagnosis, renderBenefits, setTab, fillExample
};

if (typeof globalThis !== 'undefined') globalThis.__LCC__ = API;

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
