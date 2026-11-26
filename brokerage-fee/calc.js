/*!
 * calc.js — 복비(부동산 중개보수)·이사비용 계산 엔진
 * ------------------------------------------------------------------
 * 화면(app.js)과 분리된 순수 계산 함수 모음입니다. window.BrokerageCalc 로 노출합니다.
 *
 * 근거 (2026년 11월 26일 확인)
 *  [중개보수 상한요율]
 *  - 공인중개사법 제32조제4항, 같은 법 시행규칙 제20조(시행 2026.8.28., 국토교통부령 제1611호)
 *    및 별표 1: 주택 중개보수는 중개의뢰인 쌍방으로부터 각각 받되, 그 일방으로부터 받을 수
 *    있는 한도는 별표 1과 같고, 그 금액은 시·도 조례로 정하는 요율한도 이내에서
 *    중개의뢰인과 개업공인중개사가 협의해 정합니다. → 표의 요율은 '정가'가 아니라 '상한'입니다.
 *  - 매매·교환 상한요율: 5천만원 미만 0.6%(한도 25만원), 5천만~2억원 0.5%(80만원),
 *    2억~9억원 0.4%, 9억~12억원 0.5%, 12억~15억원 0.6%, 15억원 이상 0.7%.
 *  - 임대차 등 상한요율: 5천만원 미만 0.5%(20만원), 5천만~1억원 0.4%(30만원),
 *    1억~6억원 0.3%, 6억~12억원 0.4%, 12억~15억원 0.5%, 15억원 이상 0.6%.
 *    (서울시를 포함한 대부분 시·도 조례가 시행규칙 별표 1과 같은 숫자입니다.)
 *  - 거래금액 산정(같은 조 제5항): 매매는 매매가격, 교환은 교환대상 중 가액이 큰 쪽,
 *    임대차는 보증금 + (월세 × 100). 다만 그 합이 5천만원 미만이면 보증금 + (월세 × 70)으로
 *    다시 계산합니다. 분양권은 거래당시까지 납입한 금액(융자 포함) + 프리미엄입니다.
 *  - 한도액이 있는 구간은 요율로 계산한 금액이 한도액을 넘을 수 없습니다.
 *  - 주택 면적이 건축물의 2분의 1 이상이면 주택 요율(제6항). 전용 85㎡ 이하이면서
 *    부엌·화장실·목욕시설을 갖춘 주거용 오피스텔은 별표 2(매매 0.5%·임대차 0.4%) 상한입니다.
 *
 *  [부가가치세]
 *  - 일반과세 중개사무소: 중개보수의 10%를 부가세로 별도 청구할 수 있습니다.
 *  - 간이과세: 부동산 관련 서비스업 부가가치율 40%(부가가치세법 시행령 제111조)에
 *    세율 10%를 곱해 공급대가의 약 4%가 됩니다. 직전 연도 공급대가 1억 400만원 미만이면
 *    간이과세 대상입니다(같은 법 시행령 제109조).
 *  - 연 공급대가 4,800만원 미만 간이과세자는 납부의무가 면제됩니다(부가가치세법 제69조).
 *  - 부가세는 상한요율과 별개입니다. 부가세를 뺀 보수가 상한 이하라면 초과 수수가 아닙니다.
 *
 *  [이사·입주 총비용]
 *  - 인지세법 제3조제1항제1호: 1천만원 초과~3천만원 2만원, ~5천만원 4만원, ~1억원 7만원,
 *    ~10억원 15만원, 10억원 초과 35만원. 같은 법 제6조제5호: 주택 소유권 이전 증서로
 *    기재금액 1억원 이하는 비과세. 1통마다 과세(제3조제2항) → 2통 작성 시 2배.
 *  - 등기사항증명서 등 수수료규칙 제5조의2·제5조의5: 매매 소유권이전등기 신청수수료는
 *    매 부동산마다 서면 18,000원, 전자표준양식 15,000원, 전자신청 10,000원.
 *  - 확정일자 600원(주택임대차계약증서상의 확정일자 부여 및 임대차 정보제공에 관한 규칙
 *    제8조), 등기사항증명서 발급 1,000원·열람 700원.
 *  - 전세보증금 반환보증(HUG) 보증료는 연 0.097~0.211%(2025년 3월 개편 기준, 주택 유형·
 *    부채비율에 따라 다름). 계산기는 이용자가 넣은 요율로만 추정합니다.
 *  - 이사·입주청소 시세는 업체 공개 견적 범위를 모은 참고값입니다. 정부 공식 통계가 없고
 *    짐의 양·거리·층수·시기에 따라 달라지므로, 견적을 알고 있으면 그 값을 넣어 덮어쓰세요.
 *
 * 금액은 원 단위에서 버림하고, 모든 결과는 참고용 모의 계산입니다.
 */
(function (root) {
  'use strict';

  var DATA_DATE = '2026-11-26';

  /* ── 상한요율표 (공인중개사법 시행규칙 별표 1) ─────────────────── */
  var SALE_BRACKETS = [
    { to: 50000000, rate: 0.006, cap: 250000, label: '5천만원 미만', short: '5천만원 미만' },
    { to: 200000000, rate: 0.005, cap: 800000, label: '5천만원 이상 ~ 2억원 미만', short: '5천만~2억' },
    { to: 900000000, rate: 0.004, cap: null, label: '2억원 이상 ~ 9억원 미만', short: '2억~9억' },
    { to: 1200000000, rate: 0.005, cap: null, label: '9억원 이상 ~ 12억원 미만', short: '9억~12억' },
    { to: 1500000000, rate: 0.006, cap: null, label: '12억원 이상 ~ 15억원 미만', short: '12억~15억' },
    { to: Infinity, rate: 0.007, cap: null, label: '15억원 이상', short: '15억 이상' }
  ];

  var LEASE_BRACKETS = [
    { to: 50000000, rate: 0.005, cap: 200000, label: '5천만원 미만', short: '5천만원 미만' },
    { to: 100000000, rate: 0.004, cap: 300000, label: '5천만원 이상 ~ 1억원 미만', short: '5천만~1억' },
    { to: 600000000, rate: 0.003, cap: null, label: '1억원 이상 ~ 6억원 미만', short: '1억~6억' },
    { to: 1200000000, rate: 0.004, cap: null, label: '6억원 이상 ~ 12억원 미만', short: '6억~12억' },
    { to: 1500000000, rate: 0.005, cap: null, label: '12억원 이상 ~ 15억원 미만', short: '12억~15억' },
    { to: Infinity, rate: 0.006, cap: null, label: '15억원 이상', short: '15억 이상' }
  ];

  /* 오피스텔(전용 85㎡ 이하, 부엌·화장실·목욕시설) 별표 2 */
  var OFFICE_BRACKETS = {
    sale: [{ to: Infinity, rate: 0.005, cap: null, label: '전용 85㎡ 이하 주거용 오피스텔' }],
    lease: [{ to: Infinity, rate: 0.004, cap: null, label: '전용 85㎡ 이하 주거용 오피스텔' }]
  };

  var VAT_RATES = { general: 0.1, simple: 0.04, none: 0 };

  var LIMITS = {
    money: { min: 0, max: 100000000000 },
    pyeong: { min: 1, max: 200 },
    ratePct: { min: 0, max: 2 },
    houseCount: { min: 1, max: 5 }
  };

  function money(v, fallback) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return fallback === undefined ? 0 : fallback;
    return Math.min(LIMITS.money.max, Math.floor(n));
  }

  function bracketFor(kind, amount) {
    var table = kind === 'lease' ? LEASE_BRACKETS : SALE_BRACKETS;
    for (var i = 0; i < table.length; i++) {
      if (amount < table[i].to) return { index: i, row: table[i], table: table };
    }
    return { index: table.length - 1, row: table[table.length - 1], table: table };
  }

  function bracketList(kind) {
    var table = kind === 'lease' ? LEASE_BRACKETS : SALE_BRACKETS;
    return table.map(function (b, i) {
      return { index: i, label: b.label, short: b.short || b.label, rate: b.rate, cap: b.cap };
    });
  }

  /** 요율과 한도액을 적용한 1인당 상한 계산 */
  function applyFee(amount, bracket, opts) {
    var o = opts || {};
    var capByRate = Math.floor(amount * bracket.rate + 1e-9);
    var legalMax = bracket.cap == null ? capByRate : Math.min(capByRate, bracket.cap);

    var custom = o.ratePct;
    var hasCustom = custom != null && isFinite(Number(custom)) && Number(custom) > 0;
    var rate = hasCustom ? Number(custom) / 100 : bracket.rate;
    var raw = Math.floor(amount * rate + 1e-9);
    var fee = bracket.cap == null ? raw : Math.min(raw, bracket.cap);

    var vatKey = VAT_RATES[o.vat] === undefined ? 'general' : o.vat;
    var vatRate = VAT_RATES[vatKey];
    var vat = Math.round(fee * vatRate);
    var total = fee + vat;

    return {
      rate: rate,
      ratePct: +(rate * 100).toFixed(4),
      custom: hasCustom,
      rawFee: raw,
      limitApplied: bracket.cap != null && raw > bracket.cap,
      legalMax: legalMax,
      fee: fee,
      overCap: hasCustom ? rate > bracket.rate + 1e-12 : false,
      capRate: bracket.rate,
      capAmount: bracket.cap,
      diffFromMax: legalMax - fee,
      vatKey: vatKey,
      vatRate: vatRate,
      vat: vat,
      total: total,
      both: total * 2
    };
  }

  /**
   * 매매·분양권 중개보수
   * opts: { price, kind: 'sale'|'presale', paid, premium, ratePct, vat }
   */
  function saleFee(opts) {
    var o = opts || {};
    var presale = o.kind === 'presale';
    var amount = presale
      ? Math.floor(money(o.paid) + money(o.premium))
      : money(o.price);
    var b = bracketFor('sale', amount);
    var base = applyFee(amount, b.row, o);

    return {
      kind: presale ? 'presale' : 'sale',
      amount: amount,
      paid: presale ? money(o.paid) : amount,
      premium: presale ? money(o.premium) : 0,
      bracketIndex: b.index,
      bracketLabel: b.row.label,
      capRate: b.row.rate,
      capAmount: b.row.cap,
      rate: base.rate,
      ratePct: base.ratePct,
      custom: base.custom,
      legalMax: base.legalMax,
      fee: base.fee,
      vat: base.vat,
      vatRate: base.vatRate,
      total: base.total,
      both: base.both,
      overCap: base.overCap,
      limitApplied: base.limitApplied,
      diffFromMax: base.diffFromMax
    };
  }

  /**
   * 전세·월세 중개보수
   * opts: { deposit, monthly, ratePct, vat }
   * 월세는 보증금 + 월세×100, 그 합이 5천만원 미만이면 보증금 + 월세×70 으로 다시 계산.
   */
  function leaseFee(opts) {
    var o = opts || {};
    var deposit = money(o.deposit);
    var monthly = money(o.monthly);
    var raw100 = deposit + monthly * 100;
    var use70 = monthly > 0 && raw100 < 50000000;
    var amount = use70 ? deposit + monthly * 70 : raw100;

    var b = bracketFor('lease', amount);
    var base = applyFee(amount, b.row, o);

    return {
      deposit: deposit,
      monthly: monthly,
      raw100: raw100,
      used70: use70,
      amount: amount,
      bracketIndex: b.index,
      bracketLabel: b.row.label,
      capRate: b.row.rate,
      capAmount: b.row.cap,
      rate: base.rate,
      ratePct: base.ratePct,
      custom: base.custom,
      legalMax: base.legalMax,
      fee: base.fee,
      vat: base.vat,
      vatRate: base.vatRate,
      total: base.total,
      both: base.both,
      overCap: base.overCap,
      limitApplied: base.limitApplied,
      diffFromMax: base.diffFromMax
    };
  }

  /** 전세보증금 반환보증 보증료 추정 (연 요율 %) */
  function guaranteeFee(deposit, ratePct) {
    var d = money(deposit);
    var r = Number(ratePct);
    if (!isFinite(r) || r <= 0) return { deposit: d, ratePct: 0, fee: 0 };
    return { deposit: d, ratePct: r, fee: Math.round(d * r / 100) };
  }

  /* ── 이사·입주청소 시세 (업체 공개 견적 범위, 2026년 기준) ────────── */
  var MOVE_TABLE = [
    { to: 10, lo: 400000, hi: 700000, label: '원룸·10평 이하' },
    { to: 14, lo: 550000, hi: 850000, label: '10~14평' },
    { to: 16, lo: 600000, hi: 950000, label: '15~16평' },
    { to: 24, lo: 700000, hi: 1100000, label: '17~24평' },
    { to: 34, lo: 900000, hi: 1400000, label: '25~34평' },
    { to: 44, lo: 1300000, hi: 1900000, label: '35~44평' },
    { to: Infinity, lo: 1800000, hi: 2800000, label: '45평 이상' }
  ];

  var METHOD_FACTOR = {
    full: { lo: 1, hi: 1, label: '포장이사' },
    half: { lo: 0.72, hi: 0.8, label: '반포장이사' },
    general: { lo: 0.42, hi: 0.55, label: '일반이사' }
  };

  var SEASON_FACTOR = { lo: 1.1, hi: 1.45 };
  var LADDER = { lo: 250000, hi: 350000 };

  var CLEAN_TABLE = {
    in: { lo: 12000, hi: 15000, label: '입주청소(빈집)' },
    out: { lo: 14000, hi: 18000, label: '이사청소(거주 중)' },
    new: { lo: 15000, hi: 18000, label: '신축 준공청소' }
  };
  var CLEAN_MIN = 150000;

  function roundMan(v) {
    return Math.round(v / 10000) * 10000;
  }

  /**
   * 이사비 추정
   * opts: { pyeong, method, season, ladder, quote }
   */
  function moveEstimate(opts) {
    var o = opts || {};
    var pyeong = Math.min(LIMITS.pyeong.max, Math.max(1, Math.round(Number(o.pyeong) || 1)));
    var row = MOVE_TABLE[MOVE_TABLE.length - 1];
    for (var i = 0; i < MOVE_TABLE.length; i++) {
      if (pyeong <= MOVE_TABLE[i].to) { row = MOVE_TABLE[i]; break; }
    }
    var method = METHOD_FACTOR[o.method] ? o.method : 'full';
    var f = METHOD_FACTOR[method];
    var season = !!o.season;
    var ladder = !!o.ladder;

    var lo = row.lo * f.lo * (season ? SEASON_FACTOR.lo : 1);
    var hi = row.hi * f.hi * (season ? SEASON_FACTOR.hi : 1);
    if (ladder) { lo += LADDER.lo; hi += LADDER.hi; }

    var quote = money(o.quote);
    var used = quote > 0;
    return {
      pyeong: pyeong,
      bracket: row.label,
      method: method,
      methodLabel: f.label,
      season: season,
      ladder: ladder,
      baseLo: row.lo,
      baseHi: row.hi,
      lo: used ? quote : roundMan(lo),
      hi: used ? quote : roundMan(hi),
      usedQuote: used
    };
  }

  /**
   * 입주청소 추정
   * opts: { pyeong, type, quote }
   */
  function cleanEstimate(opts) {
    var o = opts || {};
    var pyeong = Math.min(LIMITS.pyeong.max, Math.max(1, Math.round(Number(o.pyeong) || 1)));
    if (o.type === 'none') {
      return { pyeong: pyeong, type: 'none', typeLabel: '청소 안 함', unitLo: 0, unitHi: 0, lo: 0, hi: 0, usedQuote: false };
    }
    var type = CLEAN_TABLE[o.type] ? o.type : 'in';
    var row = CLEAN_TABLE[type];
    var quote = money(o.quote);
    var used = quote > 0;
    var lo = Math.max(CLEAN_MIN, pyeong * row.lo);
    var hi = Math.max(CLEAN_MIN, pyeong * row.hi);
    return {
      pyeong: pyeong,
      type: type,
      typeLabel: row.label,
      unitLo: row.lo,
      unitHi: row.hi,
      lo: used ? quote : roundMan(lo),
      hi: used ? quote : roundMan(hi),
      usedQuote: used
    };
  }

  /* ── 인지세·등기·서류 비용 ─────────────────────────────────── */
  var STAMP_TABLE = [
    { to: 10000000, amount: 0, label: '1천만원 이하' },
    { to: 30000000, amount: 20000, label: '1천만원 초과 ~ 3천만원 이하' },
    { to: 50000000, amount: 40000, label: '3천만원 초과 ~ 5천만원 이하' },
    { to: 100000000, amount: 70000, label: '5천만원 초과 ~ 1억원 이하' },
    { to: 1000000000, amount: 150000, label: '1억원 초과 ~ 10억원 이하' },
    { to: Infinity, amount: 350000, label: '10억원 초과' }
  ];

  var REG_FEE = { paper: 18000, eform: 15000, online: 10000 };
  var REG_FEE_LABEL = { paper: '서면(방문)', eform: '전자표준양식', online: '전자신청' };
  var FIXED_DATE_FEE = 600;
  var COPY_FEE = 1000;
  var VIEW_FEE = 700;

  /**
   * 인지세 (1통 기준, 주택은 1억원 이하 비과세)
   * opts: { price, copies, isHouse }
   */
  function stampTax(opts) {
    var o = opts || {};
    var price = money(o.price);
    var isHouse = o.isHouse === undefined ? true : !!o.isHouse;
    var copies = Math.min(5, Math.max(1, Math.round(Number(o.copies) || 1)));
    if (isHouse && price <= 100000000) {
      return { price: price, perCopy: 0, copies: copies, total: 0, label: '주택 1억원 이하 비과세' };
    }
    var row = STAMP_TABLE[STAMP_TABLE.length - 1];
    for (var i = 0; i < STAMP_TABLE.length; i++) {
      if (price <= STAMP_TABLE[i].to) { row = STAMP_TABLE[i]; break; }
    }
    return { price: price, perCopy: row.amount, copies: copies, total: row.amount * copies, label: row.label };
  }

  /** 등기신청 수수료 (부동산 1개당 × 개수) */
  function regFee(opts) {
    var o = opts || {};
    var method = REG_FEE[o.method] === undefined ? 'online' : o.method;
    var count = Math.min(5, Math.max(1, Math.round(Number(o.count) || 1)));
    return {
      method: method,
      methodLabel: REG_FEE_LABEL[method],
      unit: REG_FEE[method],
      count: count,
      total: REG_FEE[method] * count
    };
  }

  /**
   * 이사·입주 총비용
   * opts: {
   *   deal: 'sale'|'jeonse'|'monthly',
   *   price, deposit, monthly, vat,
   *   pyeong, moveMethod, season, ladder, moveQuote, cleanType, cleanQuote,
   *   stampCopies, regMethod, regCount, lawyer, fixedDate, copyCount,
   *   depositInsurance, insuranceRate
   * }
   */
  function movingTotal(opts) {
    var o = opts || {};
    var deal = o.deal === 'sale' || o.deal === 'monthly' ? o.deal : 'jeonse';

    var brokerage;
    if (deal === 'sale') {
      brokerage = saleFee({ price: o.price, vat: o.vat || 'general' });
    } else {
      brokerage = leaseFee({
        deposit: o.deposit,
        monthly: deal === 'monthly' ? o.monthly : 0,
        vat: o.vat || 'general'
      });
    }

    var move = moveEstimate({ pyeong: o.pyeong, method: o.moveMethod, season: o.season, ladder: o.ladder, quote: o.moveQuote });
    var clean = cleanEstimate({ pyeong: o.pyeong, type: o.cleanType, quote: o.cleanQuote });

    var stamp = null;
    var reg = null;
    var docs = 0;
    var docsLo = 0;
    var docsHi = 0;
    var lawyer = 0;
    var fixedDate = 0;
    var copies = 0;
    var insurance = null;

    if (deal === 'sale') {
      stamp = stampTax({ price: o.price, copies: o.stampCopies, isHouse: true });
      reg = regFee({ method: o.regMethod, count: o.regCount });
      lawyer = money(o.lawyer);
      docsLo = stamp.total + reg.total + lawyer;
      docsHi = docsLo;
    } else {
      var copyCount = Math.min(5, Math.max(0, Math.round(Number(o.copyCount) || 0)));
      copies = copyCount * COPY_FEE;
      fixedDate = o.fixedDate === false ? 0 : FIXED_DATE_FEE;
      docsLo = copies + fixedDate;
      docsHi = docsLo;
      if (o.depositInsurance) {
        insurance = guaranteeFee(o.deposit, o.insuranceRate);
        docsLo += insurance.fee;
        docsHi += insurance.fee;
      }
    }
    docs = docsLo;

    var items = [
      { key: 'brokerage', label: '중개보수(복비)', min: brokerage.total, max: brokerage.total,
        note: (brokerage.custom ? '협의요율 ' + brokerage.ratePct + '%' : '법정 상한 ' + (brokerage.capRate * 100).toFixed(1) + '%') +
          (brokerage.vat > 0 ? ' + 부가세' : '') },
      { key: 'move', label: '이사비(' + move.methodLabel + ')', min: move.lo, max: move.hi,
        note: move.usedQuote ? '입력한 견적' : move.bracket },
      { key: 'clean', label: clean.type === 'none' ? '청소' : clean.typeLabel, min: clean.lo, max: clean.hi,
        note: clean.type === 'none' ? '선택 안 함' : (clean.usedQuote ? '입력한 견적' : '평당 ' + Math.round(clean.unitLo / 1000) + '천~' + Math.round(clean.unitHi / 1000) + '천원') }
    ];

    if (deal === 'sale') {
      items.push({ key: 'stamp', label: '인지세', min: stamp.total, max: stamp.total, note: stamp.copies + '통 · ' + stamp.label });
      items.push({ key: 'reg', label: '등기신청 수수료', min: reg.total, max: reg.total, note: reg.methodLabel + ' · ' + reg.count + '개 부동산' });
      if (lawyer > 0) items.push({ key: 'lawyer', label: '법무사 대행료', min: lawyer, max: lawyer, note: '입력값' });
    } else {
      if (copies > 0) items.push({ key: 'copy', label: '등기사항증명서 발급', min: copies, max: copies, note: (copies / COPY_FEE) + '통' });
      items.push({ key: 'fixed', label: '확정일자', min: fixedDate, max: fixedDate, note: '전입신고는 무료' });
      if (insurance && insurance.fee > 0) {
        items.push({ key: 'insurance', label: '전세보증금 반환보증료', min: insurance.fee, max: insurance.fee, note: '연 ' + insurance.ratePct + '% 가정' });
      }
    }

    var min = 0;
    var max = 0;
    items.forEach(function (it) { min += it.min; max += it.max; });

    return {
      deal: deal,
      brokerage: brokerage,
      move: move,
      clean: clean,
      stamp: stamp,
      reg: reg,
      lawyer: lawyer,
      fixedDate: fixedDate,
      copyFee: copies,
      insurance: insurance,
      items: items,
      min: min,
      max: max
    };
  }

  /* ── 체크리스트 ─────────────────────────────────────────────── */
  var CHECKLIST = [
    { group: '계약 전', items: [
      ['등기부등본 갑구·을구 확인', '소유자가 계약 상대방과 같은지, 근저당·가압류·신탁등기가 있는지 봅니다.'],
      ['중개사 등록 확인', '중개사무소 등록번호와 공인중개사 자격을 확인하고, 중개보수를 계약 전에 서면으로 정합니다.'],
      ['건축물대장 확인', '위반건축물(불법 증축)이면 보증보험·대출이 막힐 수 있습니다.'],
      ['국세·지방세 완납증명 요청', '임대인의 체납이 있으면 보증금 회수 순위에서 밀립니다.'],
      ['보증금 시세 확인', '주변 시세보다 보증금이 높으면 보증보험 가입이 어렵습니다. 임대인의 기존 대출까지 합쳐 집값 대비 비율을 봅니다.']
    ] },
    { group: '계약서 특약', items: [
      ['잔금일까지 권리변동 시 해제 특약', '"잔금일까지 근저당·가압류 등 권리변동 시 계약을 해제하고 계약금을 반환한다"를 넣습니다.'],
      ['전입신고·확정일자 협조 특약', '임대인이 잔금일 열쇠 인도와 함께 협조하도록 문구를 넣어 둡니다.'],
      ['보증금 반환 계좌 특약', '반환 계좌와 반환 기한을 계약서에 적고, 계좌이체로 받아 증빙을 남깁니다.'],
      ['수리·하자 특약', '누수·곰팡이·보일러 등 입주 전 수리 항목과 기한을 정합니다.'],
      ['중개보수·부가세 명시', '보수와 부가세를 각각 얼마로 정했는지 확인·설명서에 적게 합니다.']
    ] },
    { group: '계약 후', items: [
      ['전입신고 + 확정일자', '잔금 당일 전입신고(무료)와 확정일자(600원)를 함께 받아 대항력과 우선변제권을 갖춥니다.'],
      ['전세보증금 반환보증 가입', 'HUG·SGI 가입 요건을 확인하고, 가능하면 잔금 전에 미리 심사를 받습니다.'],
      ['전세자금대출 실행', '대출 실행일과 잔금일을 맞추고, 질권 설정 여부를 확인합니다.'],
      ['임대차 신고', '보증금 6억원 초과 또는 월세 30만원 초과 계약은 30일 내 신고 대상입니다(주택임대차보호법).'],
      ['이사·청소 예약', '손없는 날·주말은 30~50% 비쌉니다. 평일 오전으로 옮기면 같은 짐도 예산이 줄어듭니다.']
    ] }
  ];

  root.BrokerageCalc = {
    DATA_DATE: DATA_DATE,
    LIMITS: LIMITS,
    VAT_RATES: VAT_RATES,
    SALE_BRACKETS: SALE_BRACKETS,
    LEASE_BRACKETS: LEASE_BRACKETS,
    OFFICE_BRACKETS: OFFICE_BRACKETS,
    MOVE_TABLE: MOVE_TABLE,
    CLEAN_TABLE: CLEAN_TABLE,
    STAMP_TABLE: STAMP_TABLE,
    REG_FEE: REG_FEE,
    FIXED_DATE_FEE: FIXED_DATE_FEE,
    COPY_FEE: COPY_FEE,
    CHECKLIST: CHECKLIST,
    bracketFor: bracketFor,
    bracketList: bracketList,
    saleFee: saleFee,
    leaseFee: leaseFee,
    guaranteeFee: guaranteeFee,
    stampTax: stampTax,
    regFee: regFee,
    moveEstimate: moveEstimate,
    cleanEstimate: cleanEstimate,
    movingTotal: movingTotal
  };
})(typeof window !== 'undefined' ? window : this);
