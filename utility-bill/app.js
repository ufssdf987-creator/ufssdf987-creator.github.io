/*!
 * app.js — 2026 전기요금·도시가스·복지할인 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.UBCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'ub.state.v1';
  var THEME_KEY = 'ctx.theme';
  var TABS = ['elec', 'gas', 'welfare', 'guide'];
  var L = S.LIMITS;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function mjNum(v) {
    var n = Math.round((Number(v) || 0) * 10) / 10;
    return nf.format(n);
  }

  /** 2억 6,400만원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      return sign + eok + '억' + (man ? ' ' + nf.format(man) + '만' : '') + '원';
    }
    if (n >= 10000) {
      var m = Math.floor(n / 10000);
      var rest = Math.round(n % 10000);
      if (rest === 0) return sign + nf.format(m) + '만원';
      return sign + nf.format(m) + '만 ' + nf.format(rest) + '원';
    }
    return sign + nf.format(n) + '원';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'elec',
    elec: { usage: 350, type: 'low', month: 11 },
    gas: { region: 'seoul', month: 11, mode: 'cubic', usage: 50, heat: 42.5, correction: 0.994, usageType: 'combined' },
    welfare: { keys: [], household: 4, usage: 350, mj: 2000, region: 'seoul', usageType: 'combined', voucherOn: false },
    checks: {}
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    if (raw.elec && typeof raw.elec === 'object') {
      var eu = parseFloat(raw.elec.usage);
      if (isFinite(eu)) state.elec.usage = clamp(eu, L.usage.min, L.usage.max);
      state.elec.type = raw.elec.type === 'high' ? 'high' : 'low';
      var em = parseInt(raw.elec.month, 10);
      if (em >= 1 && em <= 12) state.elec.month = em;
    }
    if (raw.gas && typeof raw.gas === 'object') {
      if (['seoul', 'gyeonggi', 'incheon'].indexOf(raw.gas.region) >= 0) state.gas.region = raw.gas.region;
      state.gas.mode = raw.gas.mode === 'mj' ? 'mj' : 'cubic';
      var gu = parseFloat(raw.gas.usage);
      if (isFinite(gu)) state.gas.usage = clamp(gu, 0, 30000);
      var gh = parseFloat(raw.gas.heat);
      if (isFinite(gh)) state.gas.heat = clamp(gh, 41, 44.4);
      var gc = parseFloat(raw.gas.correction);
      if (isFinite(gc)) state.gas.correction = clamp(gc, 0.9, 1.1);
      var gm = parseInt(raw.gas.month, 10);
      if (gm >= 1 && gm <= 12) state.gas.month = gm;
      state.gas.usageType = raw.gas.usageType === 'cooking' ? 'cooking' : 'combined';
    }
    if (raw.welfare && typeof raw.welfare === 'object') {
      if (Array.isArray(raw.welfare.keys)) {
        state.welfare.keys = raw.welfare.keys.filter(function (k) { return typeof k === 'string'; });
      }
      var wh = parseInt(raw.welfare.household, 10);
      if (wh >= 1 && wh <= 4) state.welfare.household = wh;
      var wu = parseFloat(raw.welfare.usage);
      if (isFinite(wu)) state.welfare.usage = clamp(wu, L.usage.min, L.usage.max);
      var wm = parseFloat(raw.welfare.mj);
      if (isFinite(wm)) state.welfare.mj = clamp(wm, 0, L.mj.max);
      if (['seoul', 'gyeonggi', 'incheon'].indexOf(raw.welfare.region) >= 0) state.welfare.region = raw.welfare.region;
      state.welfare.usageType = raw.welfare.usageType === 'cooking' ? 'cooking' : 'combined';
      state.welfare.voucherOn = !!raw.welfare.voucherOn;
    }
    if (raw.checks && typeof raw.checks === 'object') {
      Object.keys(raw.checks).forEach(function (key) {
        if (raw.checks[key]) state.checks[key] = true;
      });
    }
    if (TABS.indexOf(raw.tab) >= 0) state.tab = raw.tab;
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  var saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  }

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var el = {};
  function cacheEls() {
    el.tabElec = $('#tabElec');
    el.tabGas = $('#tabGas');
    el.tabWelfare = $('#tabWelfare');
    el.tabGuide = $('#tabGuide');
    el.panelElec = $('#panelElec');
    el.panelGas = $('#panelGas');
    el.panelWelfare = $('#panelWelfare');
    el.panelGuide = $('#panelGuide');

    /* 전기 */
    el.elUsage = $('#elUsage');
    el.elUsageBadge = $('#elUsageBadge');
    el.elTypeGroup = $('#elTypeGroup');
    el.elMonth = $('#elMonth');
    el.elSeasonBadge = $('#elSeasonBadge');
    el.elTotal = $('#elTotal');
    el.elSub = $('#elSub');
    el.elVerdict = $('#elVerdict');
    el.elRows = $('#elRows');
    el.elStatBase = $('#elStatBase');
    el.elStatEnergy = $('#elStatEnergy');
    el.elStatExtra = $('#elStatExtra');
    el.elStatAvg = $('#elStatAvg');
    el.elElig = $('#elElig');
    el.elNext = $('#elNext');
    el.elInsight = $('#elInsight');
    el.elScaleHint = $('#elScaleHint');
    el.elScaleBody = $('#elScaleTable tbody');
    el.elBill = $('#elBill');
    el.elBillFind = $('#elBillFind');
    el.elBillResult = $('#elBillResult');
    el.elShare = $('#elShare');

    /* 가스 */
    el.gsRegion = $('#gsRegion');
    el.gsRegionBadge = $('#gsRegionBadge');
    el.gsUsageGroup = $('#gsUsageGroup');
    el.gsUsage = $('#gsUsage');
    el.gsUsageFieldLabel = $('#gsUsageFieldLabel');
    el.gsUsageHint = $('#gsUsageHint');
    el.gsUsageHelp = $('#gsUsageHelp');
    el.gsUsageBadge = $('#gsUsageBadge');
    el.gsUnit = $('#gsUnit');
    el.gsTypeGroup = $('#gsTypeGroup');
    el.gsMonth = $('#gsMonth');
    el.gsSeasonBadge = $('#gsSeasonBadge');
    el.gsHeat = $('#gsHeat');
    el.gsHeatBadge = $('#gsHeatBadge');
    el.gsCorr = $('#gsCorr');
    el.gsCorrBadge = $('#gsCorrBadge');
    el.gsTotal = $('#gsTotal');
    el.gsSub = $('#gsSub');
    el.gsVerdict = $('#gsVerdict');
    el.gsRows = $('#gsRows');
    el.gsStatMj = $('#gsStatMj');
    el.gsStatUse = $('#gsStatUse');
    el.gsStatPerMj = $('#gsStatPerMj');
    el.gsStatPerCubic = $('#gsStatPerCubic');
    el.gsElig = $('#gsElig');
    el.gsNext = $('#gsNext');
    el.gsInsight = $('#gsInsight');
    el.gsScaleHint = $('#gsScaleHint');
    el.gsScaleBody = $('#gsScaleTable tbody');
    el.gsShare = $('#gsShare');

    /* 복지 */
    el.wfKeyGroup = $('#wfKeyGroup');
    el.wfHousehold = $('#wfHousehold');
    el.wfHouseholdBadge = $('#wfHouseholdBadge');
    el.wfUsage = $('#wfUsage');
    el.wfUsageBadge = $('#wfUsageBadge');
    el.wfMj = $('#wfMj');
    el.wfMjBadge = $('#wfMjBadge');
    el.wfRegion = $('#wfRegion');
    el.wfTypeGroup = $('#wfTypeGroup');
    el.wfVoucher = $('#wfVoucher');
    el.wfTotal = $('#wfTotal');
    el.wfSub = $('#wfSub');
    el.wfVerdict = $('#wfVerdict');
    el.wfRows = $('#wfRows');
    el.wfStatElec = $('#wfStatElec');
    el.wfStatGas = $('#wfStatGas');
    el.wfStatVoucher = $('#wfStatVoucher');
    el.wfStatWinter = $('#wfStatWinter');
    el.wfElig = $('#wfElig');
    el.wfNext = $('#wfNext');
    el.wfInsight = $('#wfInsight');
    el.wfTableBody = $('#wfTableBody');
    el.wfShare = $('#wfShare');

    /* 가이드 */
    el.gdBar = $('#gdBar');
    el.gdCount = $('#gdCount');
    el.gdList = $('#gdList');
    el.gdReset = $('#gdReset');

    el.promoSection = $('#promoSection');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
    el.appVersion = $('#appVersion');
    el.toast = $('#toast');
    el.installBtn = $('#installBtn');
    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
  }

  /* ── 탭 전환 ─────────────────────────────────────────── */
  function setTab(tab) {
    state.tab = tab;
    var map = {
      elec: [el.tabElec, el.panelElec],
      gas: [el.tabGas, el.panelGas],
      welfare: [el.tabWelfare, el.panelWelfare],
      guide: [el.tabGuide, el.panelGuide]
    };
    TABS.forEach(function (key) {
      var pair = map[key];
      var active = key === tab;
      pair[0].classList.toggle('is-active', active);
      pair[0].setAttribute('aria-selected', active ? 'true' : 'false');
      pair[0].tabIndex = active ? 0 : -1;
      pair[1].classList.toggle('is-active', active);
      pair[1].hidden = !active;
    });
    persist();
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function setInsight(node, html, tone) {
    node.className = 'insight' + (tone ? ' ' + tone : '');
    node.innerHTML = html;
  }

  function setBadge(node, text, tier) {
    node.textContent = text;
    node.setAttribute('data-tier', String(tier));
  }

  function renderElig(node, reasons) {
    node.innerHTML = reasons.map(function (r) {
      return '<div class="elig-item ' + (r.ok ? 'is-pass' : 'is-fail') + '">' +
        '<span class="elig-mark" aria-hidden="true">' + (r.ok ? '✓' : '!') + '</span>' +
        '<span class="elig-body"><span class="elig-name">' + r.label + '</span>' +
        '<span class="elig-note">' + r.note + '</span></span></div>';
    }).join('');
  }

  function syncGroup(group, attr, value) {
    if (!group) return;
    $$('[data-' + attr + ']', group).forEach(function (btn) {
      var on = btn.getAttribute('data-' + attr) === String(value);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function syncMulti(group, attr, values) {
    if (!group) return;
    $$('[data-' + attr + ']', group).forEach(function (btn) {
      var on = values.indexOf(btn.getAttribute('data-' + attr)) >= 0;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function bindGroup(group, attr, onPick) {
    if (!group) return;
    group.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-' + attr + ']');
      if (!btn || !group.contains(btn)) return;
      onPick(btn.getAttribute('data-' + attr));
    });
  }

  /* ══════════════ 탭 1: 전기요금 ══════════════ */
  function elecOpts(extra) {
    var o = {
      usage: state.elec.usage,
      type: state.elec.type,
      month: state.elec.month,
      keys: []
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  function renderElec() {
    var e = state.elec;
    var bill = S.electricityBill(elecOpts());

    el.elUsageBadge.textContent = nf.format(e.usage) + 'kWh';
    el.elSeasonBadge.textContent = S.seasonLabel(e.month);
    syncGroup(el.elTypeGroup, 'type', e.type);

    el.elTotal.textContent = won(bill.total);
    el.elSub.textContent = nf.format(bill.usage) + 'kWh · ' + bill.tierLabel + ' · ' + bill.season +
      ' · 기본 ' + won(bill.baseFee) + '원 + 전력량 ' + won(bill.energyFee) + '원';

    var rows = [];
    rows.push(row('사용량', nf.format(bill.usage) + 'kWh', bill.typeLabel + ' · ' + bill.season));
    rows.push(row('누진 구간', bill.tierLabel,
      '구간 ' + bill.bounds[0] + 'kWh·' + bill.bounds[1] + 'kWh' + (bill.isSummer ? ' (하계 완화)' : '')));
    rows.push(row('기본요금', won(bill.baseFee) + '원', '마지막 구간 금액 하나만 부과'));
    var energyNote = bill.energyLines.map(function (l) {
      return l.kwh + 'kWh×' + nf.format(l.rate) + '원';
    }).join(' + ');
    rows.push(row('전력량요금', won(bill.energyFee) + '원', energyNote));
    rows.push(row('기후환경요금', won(bill.climateFee) + '원', nf.format(bill.climateRate) + '원 × ' + nf.format(bill.usage) + 'kWh'));
    rows.push(row('연료비조정요금', won(bill.fuelFee) + '원', '+' + nf.format(bill.fuelRate) + '원 × ' + nf.format(bill.usage) + 'kWh'));
    rows.push(row('전기요금계', won(bill.chargeBase) + '원', '부가세·기금 전'));
    rows.push(row('부가가치세', won(bill.vat) + '원', '전기요금계 × 10%'));
    rows.push(row('전력산업기반기금', won(bill.fund) + '원', '전기요금계 × 2.7% · 10원 미만 절사'));
    rows.push(row('청구금액', won(bill.total) + '원', '10원 미만 절사', 'total'));
    el.elRows.innerHTML = rows.join('');

    el.elStatBase.textContent = won(bill.baseFee) + '원';
    el.elStatEnergy.textContent = won(bill.energyFee) + '원';
    el.elStatExtra.textContent = won(bill.climateFee + bill.fuelFee) + '원';
    el.elStatAvg.textContent = won(bill.avgRate) + '원';

    var info = S.tierInfo(elecOpts());
    var elig = [];
    elig.push({
      ok: true,
      label: bill.tierLabel + ' · ' + bill.season,
      note: bill.isSummer
        ? '하계(7~8월)는 구간이 300kWh·450kWh로 넓어 2단계 진입이 100kWh 늦어집니다.'
        : (bill.superSeason ? '동계(12~2월)는 1,000kWh 초과분에 슈퍼유저 단가가 적용됩니다.' : '기타계절은 200kWh·400kWh에서 구간이 바뀝니다.')
    });
    if (bill.superKwh > 0) {
      elig.push({
        ok: false,
        label: '슈퍼유저 단가 적용',
        note: '1,000kWh를 넘은 ' + nf.format(bill.superKwh) + 'kWh에 ' +
          (bill.type === 'high' ? '593.3' : '736.2') + '원/kWh가 붙었습니다.'
      });
    }
    if (info.remaining != null) {
      elig.push({
        ok: true,
        label: info.nextThreshold + 'kWh까지 ' + nf.format(info.remaining) + 'kWh 남음',
        note: '다음 1kWh는 ' + won(info.marginal) + '원입니다. 경계를 넘으면 기본요금이 올라 한 번에 ' + won(info.jump) + '원 늘어납니다.'
      });
    }
    elig.push({
      ok: true,
      label: '월 최저요금 1,000원',
      note: '사용량이 아주 적어도 기본공급약관상 월 최저요금 1,000원이 적용됩니다(이 계산기는 사용량 0일 때 0원).'
    });
    renderElig(el.elElig, elig);

    var next = [];
    if (info.remaining != null) {
      next.push(info.nextThreshold + 'kWh까지 ' + nf.format(info.remaining) + 'kWh 남았습니다. 다음 1kWh는 ' + won(info.marginal) + '원, 경계를 넘으면 기본요금까지 올라 ' + won(info.jump) + '원이 늘어납니다.');
    } else if (bill.superKwh > 0) {
      var cut = S.electricityBill(elecOpts({ usage: Math.max(0, bill.usage - 100) }));
      next.push('이미 1,000kWh를 넘어 슈퍼유저 구간입니다. 100kWh를 줄이면 약 ' + won(Math.max(0, bill.total - cut.total)) + '원 줄어듭니다.');
    } else {
      next.push('구간 경계를 넘지 않았습니다. 다음 달 사용량이 같다면 요금도 비슷합니다.');
    }
    if (info.lowerSave != null && info.lowerTo != null) {
      next.push(info.lowerTo + 'kWh로 ' + nf.format(info.lowerNeed) + 'kWh 줄이면 ' + won(info.lowerSave) + '원 아낍니다.');
    }
    el.elNext.textContent = next.join(' ');

    var otherMonth = bill.isSummer ? 11 : 7;
    var other = S.electricityBill(elecOpts({ month: otherMonth }));
    var diff = bill.total - other.total;
    if (bill.isSummer) {
      setInsight(el.elInsight,
        '같은 ' + nf.format(bill.usage) + 'kWh를 하계가 아닌 달에 쓰면 <strong>' + won(other.total) + '원</strong>으로 ' +
        won(Math.abs(diff)) + '원 더 나옵니다. 여름 구간 완화가 ' + won(Math.abs(diff)) + '원을 아껴 주는 셈입니다.');
    } else {
      setInsight(el.elInsight,
        '같은 ' + nf.format(bill.usage) + 'kWh를 7월에 쓰면 <strong>' + won(other.total) + '원</strong>으로 ' +
        won(Math.abs(diff)) + '원 적습니다. 7~8월에는 구간이 300kWh·450kWh로 넓어지기 때문입니다.');
    }

    el.elScaleHint.textContent = bill.typeLabel + ' · ' + bill.season;
    var tbody = el.elScaleBody;
    tbody.innerHTML = '';
    S.electricityScale({ type: e.type, month: e.month }).forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<th scope="row">' + nf.format(s.usage) + 'kWh</th><td>' + s.tier + '단계</td><td>' +
        won(s.baseFee) + '원</td><td>' + won(s.total) + '원</td>';
      tbody.appendChild(tr);
    });

    setBadge(el.elVerdict, bill.superKwh > 0 ? '슈퍼유저' : bill.tierLabel, bill.tier);
  }

  /* ══════════════ 탭 2: 도시가스 ══════════════ */
  function gasOpts(extra) {
    var g = state.gas;
    var o = {
      region: g.region,
      mode: g.mode,
      month: g.month,
      heat: g.heat,
      correction: g.correction,
      usageType: g.usageType,
      keys: []
    };
    if (g.mode === 'mj') o.mj = g.usage;
    else o.cubic = g.usage;
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  function renderGas() {
    var g = state.gas;
    var bill = S.gasBill(gasOpts());
    var region = S.gasRegion(g.region);

    el.gsRegionBadge.textContent = region.label + ' ' + region.cooking.toFixed(4) + '원';
    el.gsSeasonBadge.textContent = bill.seasonLabel;
    el.gsUnit.textContent = g.mode === 'mj' ? 'MJ' : '㎥';
    el.gsUsageBadge.textContent = g.mode === 'mj' ? mjNum(bill.mj) + 'MJ' : mjNum(bill.cubic) + '㎥';
    el.gsUsageFieldLabel.childNodes[0].nodeValue = g.mode === 'mj' ? '월 사용열량 ' : '월 사용량 ';
    el.gsUsageHint.textContent = g.mode === 'mj' ? '고지서 사용열량' : '계량기 지침 차이';
    el.gsUsageHelp.textContent = g.mode === 'mj'
      ? '고지서의 사용열량(MJ)을 그대로 넣으면 가장 정확합니다. '
      : '보정계수와 평균열량을 곱해 사용열량(MJ)을 계산합니다. ';
    el.gsHeatBadge.textContent = bill.heat.toFixed(3);
    el.gsCorrBadge.textContent = bill.correction.toFixed(4);
    syncGroup(el.gsUsageGroup, 'mode', g.mode);
    syncGroup(el.gsTypeGroup, 'usage', g.usageType);

    el.gsTotal.textContent = won(bill.total);
    el.gsSub.textContent = region.label + ' · ' + bill.seasonLabel + ' · ' + mjNum(bill.mj) + 'MJ (' +
      mjNum(bill.cubic) + '㎥ 환산) · ' + (bill.usageType === 'cooking' ? '취사 전용' : '취사·난방 겸용');

    var rows = [];
    rows.push(row('사용량', mjNum(bill.cubic) + '㎥', g.mode === 'mj' ? 'MJ에서 환산' : '검침량(계량기 차이)'));
    rows.push(row('평균열량·보정계수', bill.heat.toFixed(3) + 'MJ/㎥ · ' + bill.correction.toFixed(4), '고지서 값으로 바꿀 수 있음'));
    rows.push(row('사용열량', mjNum(bill.mj) + 'MJ', '㎥ × 보정계수 × 평균열량'));
    if (bill.usageType === 'cooking') {
      rows.push(row('취사요금', won(bill.cookingCharge) + '원', mjNum(bill.mj) + 'MJ × ' + bill.cookingRate.toFixed(4) + '원'));
    } else {
      rows.push(row('취사요금', won(bill.cookingCharge) + '원', '516MJ까지 · ' + bill.cookingRate.toFixed(4) + '원/MJ'));
      rows.push(row('난방요금', won(bill.heatingCharge) + '원', '516MJ 초과 ' + mjNum(bill.heatingMj) + 'MJ × ' + bill.heatingRate.toFixed(4) + '원'));
    }
    rows.push(row('사용요금', won(bill.usageCharge) + '원', '열량 × 단가 · 원 미만 버림'));
    rows.push(row('기본요금', won(bill.baseFee) + '원', '주택용 가구당 월'));
    rows.push(row('공급가액', won(bill.supply) + '원', '기본요금 + 사용요금'));
    rows.push(row('부가가치세', won(bill.vat) + '원', '공급가액 × 10%'));
    rows.push(row('청구금액', won(bill.total) + '원', '10원 미만 절사', 'total'));
    el.gsRows.innerHTML = rows.join('');

    el.gsStatMj.textContent = mjNum(bill.mj) + 'MJ';
    el.gsStatUse.textContent = won(bill.usageCharge) + '원';
    el.gsStatPerMj.textContent = bill.perMj.toFixed(2) + '원';
    el.gsStatPerCubic.textContent = won(bill.perCubic) + '원';

    var elig = [];
    elig.push({
      ok: true,
      label: '주택용 ' + region.label + ' ' + region.cooking.toFixed(4) + '원/MJ',
      note: '도매요금 ' + region.wholesale.toFixed(4) + '원 + 소매공급비용 ' + region.retail.toFixed(4) + '원. 기본요금 월 ' + won(region.base) + '원.'
    });
    if (bill.usageType !== 'cooking') {
      elig.push({
        ok: bill.mj >= 516,
        label: bill.mj >= 516 ? '516MJ 넘어 난방 단가 적용' : '516MJ 이하 — 전부 취사 단가',
        note: '취사·난방 겸용은 516MJ까지 취사 단가, 초과분은 난방 단가입니다. 서울·경기·인천은 두 단가가 같습니다.'
      });
    }
    elig.push({
      ok: bill.winter,
      label: bill.winter ? '동절기(12~3월)' : '기타월(4~11월)',
      note: bill.winter
        ? '수급자·장애인·다자녀 가구는 동절기 요금경감 한도가 커집니다(최대 148,000원).'
        : '동절기(12~3월)에는 같은 사용량도 난방 수요가 늘고 경감 한도가 커집니다.'
    });
    elig.push({
      ok: true,
      label: '평균열량 ' + bill.heat.toFixed(3) + 'MJ/㎥',
      note: '공급 열량은 41.0~44.4MJ/㎥ 범위에서 달마다 다릅니다. 고지서 값과 다르면 직접 넣어 주세요.'
    });
    renderElig(el.gsElig, elig);

    var nextMonth = g.month === 12 ? 1 : g.month + 1;
    var nextBill = S.gasBill(gasOpts({ month: nextMonth }));
    el.gsNext.textContent = '다음 달(' + nextMonth + '월)에 같은 ' + mjNum(bill.mj) + 'MJ를 쓰면 ' +
      (nextBill.total === bill.total ? '요금도 ' + won(nextBill.total) + '원으로 같습니다.' :
        won(nextBill.total) + '원으로 ' + won(Math.abs(nextBill.total - bill.total)) + '원 ' +
        (nextBill.total > bill.total ? '더 나옵니다.' : '줄어듭니다.')) +
      (nextBill.winter && !bill.winter ? ' 12월부터 3월은 동절기 경감 한도가 적용됩니다.' : '');

    var others = ['seoul', 'gyeonggi', 'incheon'].map(function (key) {
      return { key: key, label: S.gasRegion(key).label, bill: S.gasBill(gasOpts({ region: key })) };
    }).sort(function (a, b) { return a.bill.total - b.bill.total; });
    var cheap = others[0];
    if (cheap.key !== g.region) {
      setInsight(el.gsInsight,
        '같은 ' + mjNum(bill.mj) + 'MJ를 ' + cheap.label + '에서 쓰면 <strong>' + won(cheap.bill.total) + '원</strong>으로 ' +
        won(Math.abs(bill.total - cheap.bill.total)) + '원 차이입니다. 소매공급비용이 지역마다 달라 생기는 차이입니다.');
    } else {
      setInsight(el.gsInsight,
        '지금 조건이 서울·경기·인천 중 가장 쌉니다. 경기와는 ' + won(Math.abs(bill.total - S.gasBill(gasOpts({ region: 'gyeonggi' })).total)) +
        '원 차이입니다. 실제 금액은 고지서의 평균열량·보정계수로 다시 확인하세요.');
    }

    el.gsScaleHint.textContent = region.label + ' · ' + (g.usageType === 'cooking' ? '취사 전용' : '겸용') + ' · ' + bill.seasonLabel;
    var tbody = el.gsScaleBody;
    tbody.innerHTML = '';
    S.gasScale({ region: g.region, month: g.month, usageType: g.usageType }).forEach(function (s) {
      var tr = document.createElement('tr');
      var cubic = s.mj / (bill.heat * bill.correction);
      tr.innerHTML = '<th scope="row">' + nf.format(s.mj) + 'MJ</th><td>' + mjNum(cubic) + '㎥</td><td>' +
        won(s.usageCharge) + '원</td><td>' + won(s.total) + '원</td>';
      tbody.appendChild(tr);
    });

    setBadge(el.gsVerdict, bill.winter ? '동절기' : '기타월', bill.winter ? 1 : 2);
  }

  /* ══════════════ 탭 3: 복지할인 ══════════════ */
  function welfareOpts() {
    var w = state.welfare;
    return {
      keys: w.keys,
      household: w.household,
      usage: w.usage,
      type: 'low',
      region: w.region,
      mj: w.mj,
      usageType: w.usageType,
      voucherOn: w.voucherOn
    };
  }

  function renderWelfare() {
    var w = state.welfare;
    var r = S.welfareSummary(welfareOpts());

    el.wfHouseholdBadge.textContent = r.household >= 4 ? '4인 이상' : r.household + '인';
    el.wfUsageBadge.textContent = nf.format(r.usage) + 'kWh';
    el.wfMjBadge.textContent = nf.format(r.mj) + 'MJ';
    syncMulti(el.wfKeyGroup, 'key', w.keys);

    el.wfTotal.textContent = won(r.annual);
    el.wfSub.textContent = (w.keys.length ? '자격 ' + w.keys.length + '개 · ' : '자격 없음 · ') +
      '전기 연 ' + won(r.elec.annualDiscount) + '원 + 가스 연 ' + won(r.gas.annualDiscount) + '원' +
      (r.voucherAnnual ? ' + 바우처 ' + won(r.voucherAnnual) + '원' : '');

    var rows = [];
    rows.push(row('전기 할인 (기타계절)', won(r.elec.generalDiscount) + '원/월',
      '전기요금계 ' + won(r.elec.general.chargeBase) + '원 기준'));
    rows.push(row('전기 할인 (여름 6~8월)', won(r.elec.summerDiscount) + '원/월',
      '여름철 한도 적용'));
    rows.push(row('전기 할인 (연간)', won(r.elec.annualDiscount) + '원', '기타 9개월 + 여름 3개월'));
    rows.push(row('가스 경감 (동절기)', won(r.gas.winter.discountAmount) + '원/월',
      r.gas.winter.discount.key ? r.gas.winter.discount.note : '적용 자격 없음'));
    rows.push(row('가스 경감 (기타월)', won(r.gas.other.discountAmount) + '원/월',
      r.gas.other.discount.key ? r.gas.other.discount.note : '적용 자격 없음'));
    rows.push(row('가스 경감 (연간)', won(r.gas.annualDiscount) + '원', '동절기 4개월 + 기타 8개월'));
    rows.push(row('에너지바우처', won(r.voucherAnnual) + '원',
      r.voucherOn ? (r.voucherEligible ? r.voucher.label + ' · ' + r.voucher.period : '수급자·차상위만 대상') : '신청 안 함'));
    rows.push(row('연간 합계', won(r.annual) + '원', '전기 + 가스 + 바우처', 'total'));
    el.wfRows.innerHTML = rows.join('');

    el.wfStatElec.textContent = won(r.elec.annualDiscount) + '원';
    el.wfStatGas.textContent = won(r.gas.annualDiscount) + '원';
    el.wfStatVoucher.textContent = won(r.voucherAnnual) + '원';
    el.wfStatWinter.textContent = won(r.monthlyWinter) + '원';

    var elig = [];
    if (!w.keys.length) {
      elig.push({
        ok: false,
        label: '복지할인 자격을 아직 고르지 않았습니다',
        note: '다자녀·대가족·출산가구·장애인·수급자·차상위·유공자·생명유지장치 중 해당하는 것을 눌러 주세요.'
      });
    }
    var list = S.qualificationList();
    w.keys.forEach(function (key) {
      var q = null;
      for (var i = 0; i < list.length; i++) if (list[i].key === key) q = list[i];
      if (!q) return;
      var elecItems = [];
      if (q.group === 'fixed') {
        elecItems.push('월 ' + won(q.elec) + '원(여름 ' + won(q.elecSummer) + '원)');
      } else if (q.group === 'rate') {
        elecItems.push('30% · 월 16,000원 한도' + (key === 'life_support' ? '(한도 없음)' : ''));
      }
      var gasRow = q.gas;
      elig.push({
        ok: true,
        label: q.label,
        note: (elecItems.length ? '전기 ' + elecItems.join(' · ') : '전기 할인 없음') +
          (gasRow ? ' / 가스 동절기 최대 ' + won(gasRow.winter) + '원' : ' / 가스 경감 없음')
      });
    });
    if (w.keys.indexOf('livelihood') >= 0 || w.keys.indexOf('housing') >= 0 || w.keys.indexOf('education') >= 0 || w.keys.indexOf('near_poor') >= 0) {
      elig.push({
        ok: true,
        label: '수급자·차상위 중복 적용',
        note: '다자녀·대가족·출산·생명유지장치 할인과 중복해서 받을 수 있습니다. 전기 할인은 정액 + 정률로 계산했습니다.'
      });
    }
    if (r.voucherOn && r.voucherEligible) {
      elig.push({
        ok: true,
        label: '에너지바우처 ' + r.voucher.label,
        note: '연 ' + won(r.voucher.total) + '원 · 사용기간 ' + r.voucher.period + ' · 신청 ' + r.voucher.apply
      });
    } else if (r.voucherOn && !r.voucherEligible) {
      elig.push({
        ok: false,
        label: '에너지바우처 대상 아님',
        note: '생계·의료·주거·교육급여 수급자이면서 노인·영유아·장애인·임산부·중증질환·한부모·다자녀 세대원이 있어야 합니다.'
      });
    }
    elig.push({
      ok: false,
      label: '신청하지 않으면 적용되지 않습니다',
      note: '전기 할인은 한전ON·고객센터 123·행정복지센터, 가스 경감은 도시가스사·정부24·주민센터, 바우처는 주민센터·복지로에서 신청합니다.'
    });
    renderElig(el.wfElig, elig);

    var apply = [];
    if (w.keys.length) {
      apply.push('전기 복지할인은 한전ON(online.kepco.co.kr)이나 고객센터 123, 행정복지센터에서 신청하면 신청한 달부터 적용됩니다.');
      if (r.gas.winter.discount.key) {
        apply.push('도시가스 요금경감은 도시가스사 고객센터·정부24·주민센터에서 신청하면 다음 날 사용분부터 적용됩니다.');
      }
      if (r.voucherEligible) {
        apply.push('에너지바우처는 2026년 6월 15일~12월 31일 주민센터나 복지로에서 신청할 수 있습니다.');
      }
      apply.push('이사하거나 자녀·소득이 바뀌면 자격이 달라지므로 새로 신청해야 합니다.');
    } else {
      apply.push('해당하는 자격을 고르면 신청처와 시기를 알려 드립니다. 전기 할인은 한전ON·123, 가스 경감은 도시가스사·정부24, 바우처는 주민센터·복지로입니다.');
    }
    el.wfNext.textContent = apply.join(' ');

    if (!w.keys.length) {
      setInsight(el.wfInsight, '자격이 없어도 <strong>에너지바우처</strong>는 수급자·차상위 가구라면 세대원 특성에 따라 받을 수 있습니다. 4인 이상 세대는 연 701,300원입니다.');
    } else if (r.voucherOn && r.voucherEligible) {
      setInsight(el.wfInsight,
        '바우처를 받으면 도시가스 동절기 경감 한도가 148,000원에서 86,000원으로 줄지만, 바우처 <strong>' + won(r.voucher.total) +
        '원</strong>이 따로 들어와 합치면 더 큽니다. 전기·가스 요금에서 자동 차감됩니다.');
    } else {
      setInsight(el.wfInsight,
        '동절기 한 달 기준으로 전기 ' + won(r.elec.generalDiscount) + '원, 가스 ' + won(r.gas.winter.discountAmount) +
        '원이 줄어 <strong>' + won(r.monthlyWinter) + '원</strong> 혜택입니다. 1년으로 보면 ' + won(r.annual) + '원입니다.');
    }

    var tb = el.wfTableBody;
    tb.innerHTML = '';
    list.forEach(function (q) {
      var tr = document.createElement('tr');
      var elec = q.group === 'fixed' ? won(q.elec) + '원' :
        (q.group === 'rate' ? '30%' : '—');
      var gas = q.gas ? won(q.gas.winter) + '원' : '—';
      tr.innerHTML = '<th scope="row">' + q.label + '</th><td>' + elec + '</td><td>' + gas + '</td>';
      tb.appendChild(tr);
    });

    setBadge(el.wfVerdict, r.annual > 0 ? '연 ' + wonShort(r.annual) : '자격 없음', r.annual > 0 ? 1 : 3);
  }

  /* ══════════════ 탭 4: 체크리스트 ══════════════ */
  function renderGuide() {
    var boxes = $$('#gdList input[type=checkbox]');
    var done = 0;
    boxes.forEach(function (box) {
      var key = box.getAttribute('data-check');
      box.checked = !!state.checks[key];
      if (box.checked) done += 1;
    });
    el.gdCount.textContent = done + ' / ' + boxes.length;
    el.gdBar.style.width = (boxes.length ? (done / boxes.length) * 100 : 0) + '%';
  }

  function renderAll() {
    renderElec();
    renderGas();
    renderWelfare();
    renderGuide();
  }

  /* ── 이벤트 ──────────────────────────────────────────── */
  function bindAll() {
    el.tabElec.addEventListener('click', function () { setTab('elec'); });
    el.tabGas.addEventListener('click', function () { setTab('gas'); });
    el.tabWelfare.addEventListener('click', function () { setTab('welfare'); });
    el.tabGuide.addEventListener('click', function () { setTab('guide'); });

    function onChange(node, fn) {
      node.addEventListener('input', fn);
      node.addEventListener('change', fn);
    }

    onChange(el.elUsage, function () {
      state.elec.usage = readNum(el.elUsage, 350, L.usage.min, L.usage.max);
      renderElec();
      saveState();
    });
    bindGroup(el.elTypeGroup, 'type', function (v) {
      state.elec.type = v === 'high' ? 'high' : 'low';
      renderElec();
      saveState();
    });
    onChange(el.elMonth, function () {
      state.elec.month = parseInt(el.elMonth.value, 10) || 11;
      renderElec();
      saveState();
    });
    el.elBillFind.addEventListener('click', function () {
      var target = parseFloat(el.elBill.value);
      if (!isFinite(target) || target <= 0) {
        el.elBillResult.textContent = '청구금액을 먼저 넣어 주세요.';
        return;
      }
      var found = S.usageForBill(target, elecOpts({ usage: 0 }));
      if (found.diff > Math.max(500, target * 0.02)) {
        el.elBillResult.textContent = '이 조건에서는 ' + won(target) + '원에 맞는 사용량을 찾기 어렵습니다. 계약종별과 사용 월을 확인해 주세요.';
        return;
      }
      el.elBillResult.textContent = '약 ' + nf.format(found.usage) + 'kWh입니다. 같은 조건으로 계산하면 ' + won(found.total) + '원입니다.';
    });
    el.elShare.addEventListener('click', function () { copyText(shareElec(), el.elShare); });

    onChange(el.gsRegion, function () {
      state.gas.region = el.gsRegion.value;
      var region = S.gasRegion(state.gas.region);
      state.gas.heat = region.heat;
      state.gas.correction = region.correction;
      el.gsHeat.value = region.heat;
      el.gsCorr.value = region.correction;
      renderGas();
      saveState();
    });
    bindGroup(el.gsUsageGroup, 'mode', function (v) {
      var next = v === 'mj' ? 'mj' : 'cubic';
      if (next !== state.gas.mode) {
        if (next === 'mj') {
          var cubic = state.gas.usage;
          state.gas.usage = Math.round(S.mjFromCubic(cubic, { region: state.gas.region, heat: state.gas.heat, correction: state.gas.correction }));
        } else {
          state.gas.usage = Math.round((state.gas.usage / (state.gas.heat * state.gas.correction)) * 10) / 10;
        }
        state.gas.mode = next;
        el.gsUsage.value = state.gas.usage;
        el.gsUsage.step = next === 'mj' ? '10' : '1';
      }
      renderGas();
      saveState();
    });
    onChange(el.gsUsage, function () {
      var max = state.gas.mode === 'mj' ? L.mj.max : L.cubic.max;
      state.gas.usage = readNum(el.gsUsage, 50, 0, max);
      renderGas();
      saveState();
    });
    bindGroup(el.gsTypeGroup, 'usage', function (v) {
      state.gas.usageType = v === 'cooking' ? 'cooking' : 'combined';
      renderGas();
      saveState();
    });
    onChange(el.gsMonth, function () {
      state.gas.month = parseInt(el.gsMonth.value, 10) || 11;
      renderGas();
      saveState();
    });
    onChange(el.gsHeat, function () {
      state.gas.heat = readNum(el.gsHeat, 42.5, 41, 44.4);
      renderGas();
      saveState();
    });
    onChange(el.gsCorr, function () {
      state.gas.correction = readNum(el.gsCorr, 0.994, 0.9, 1.1);
      renderGas();
      saveState();
    });
    el.gsShare.addEventListener('click', function () { copyText(shareGas(), el.gsShare); });

    bindGroup(el.wfKeyGroup, 'key', function (v) {
      var i = state.welfare.keys.indexOf(v);
      if (i >= 0) state.welfare.keys.splice(i, 1);
      else state.welfare.keys.push(v);
      renderWelfare();
      saveState();
    });
    onChange(el.wfHousehold, function () {
      state.welfare.household = parseInt(el.wfHousehold.value, 10) || 4;
      renderWelfare();
      saveState();
    });
    onChange(el.wfUsage, function () {
      state.welfare.usage = readNum(el.wfUsage, 350, L.usage.min, L.usage.max);
      renderWelfare();
      saveState();
    });
    onChange(el.wfMj, function () {
      state.welfare.mj = readNum(el.wfMj, 2000, 0, L.mj.max);
      renderWelfare();
      saveState();
    });
    onChange(el.wfRegion, function () {
      state.welfare.region = el.wfRegion.value;
      renderWelfare();
      saveState();
    });
    bindGroup(el.wfTypeGroup, 'usage', function (v) {
      state.welfare.usageType = v === 'cooking' ? 'cooking' : 'combined';
      renderWelfare();
      saveState();
    });
    el.wfVoucher.addEventListener('change', function () {
      state.welfare.voucherOn = el.wfVoucher.checked;
      renderWelfare();
      saveState();
    });
    el.wfShare.addEventListener('click', function () { copyText(shareWelfare(), el.wfShare); });

    el.gdList.addEventListener('change', function (ev) {
      var box = ev.target.closest('input[type=checkbox]');
      if (!box) return;
      state.checks[box.getAttribute('data-check')] = box.checked;
      renderGuide();
      saveState();
    });
    el.gdReset.addEventListener('click', function () {
      state.checks = {};
      renderGuide();
      saveState();
      toast('체크를 초기화했습니다.');
    });
  }

  /* ── 공유 문구 ────────────────────────────────────────── */
  function shareElec() {
    var e = state.elec;
    var b = S.electricityBill(elecOpts());
    return '[2026 전기요금] ' + b.typeLabel + ' ' + nf.format(b.usage) + 'kWh · ' + b.season + '\n' +
      '청구금액 ' + won(b.total) + '원 (' + b.tierLabel + ')\n' +
      '기본 ' + won(b.baseFee) + ' + 전력량 ' + won(b.energyFee) + ' + 기후환경 ' + won(b.climateFee) + ' + 연료비 ' + won(b.fuelFee) + '\n' +
      '부가세 ' + won(b.vat) + ' + 기금 ' + won(b.fund) + ' · kWh당 ' + won(b.avgRate) + '원\n' +
      (CFG.siteUrl || '') + '\n' + ((CFG.share && CFG.share.hashtag) || '');
  }

  function shareGas() {
    var g = state.gas;
    var b = S.gasBill(gasOpts());
    return '[2026 도시가스] ' + b.regionLabel + ' ' + mjNum(b.mj) + 'MJ(' + mjNum(b.cubic) + '㎥) · ' + b.seasonLabel + '\n' +
      '청구금액 ' + won(b.total) + '원\n' +
      '사용요금 ' + won(b.usageCharge) + ' + 기본요금 ' + won(b.baseFee) + ' + 부가세 ' + won(b.vat) + '\n' +
      'MJ당 ' + b.perMj.toFixed(2) + '원 · ㎥당 ' + won(b.perCubic) + '원\n' +
      (CFG.siteUrl || '') + '\n' + ((CFG.share && CFG.share.hashtag) || '');
  }

  function shareWelfare() {
    var r = S.welfareSummary(welfareOpts());
    return '[2026 복지할인] 1년 예상 혜택 ' + won(r.annual) + '원\n' +
      '전기 연 ' + won(r.elec.annualDiscount) + '(월 기타 ' + won(r.elec.generalDiscount) + '·여름 ' + won(r.elec.summerDiscount) + ')\n' +
      '가스 연 ' + won(r.gas.annualDiscount) + '(동절기 월 ' + won(r.gas.winter.discountAmount) + ')\n' +
      (r.voucherAnnual ? '에너지바우처 ' + won(r.voucherAnnual) + '\n' : '') +
      (CFG.siteUrl || '') + '\n' + ((CFG.share && CFG.share.hashtag) || '');
  }

  /* ── 토스트·복사 ─────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 2200);
  }

  function copyText(text, button) {
    var done = function () {
      toast('결과를 복사했습니다.');
      if (button) {
        var old = button.textContent;
        button.textContent = '복사됨 ✓';
        setTimeout(function () { button.textContent = old; }, 1600);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했습니다. 길게 눌러 선택해 주세요.'); }
    document.body.removeChild(ta);
  }

  /* ── 테마·설치·제휴 ──────────────────────────────────── */
  function bindTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    el.themeIcon.textContent = current === 'dark' ? '☀️' : '🌙';
    el.themeBtn.addEventListener('click', function () {
      var next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      el.themeIcon.textContent = next === 'dark' ? '☀️' : '🌙';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 무시 */ }
    });
  }

  function bindInstall() {
    var prompt = null;
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      prompt = ev;
      el.installBtn.hidden = false;
    });
    el.installBtn.addEventListener('click', function () {
      if (!prompt) return;
      prompt.prompt();
      prompt.userChoice.then(function () {
        prompt = null;
        el.installBtn.hidden = true;
      });
    });
    window.addEventListener('appinstalled', function () { el.installBtn.hidden = true; });
  }

  function renderPromo() {
    var cfg = CFG.coupang || {};
    var items = (cfg.items || []).filter(function (it) { return it && it.url; });
    if (!items.length) {
      el.promoSection.hidden = true;
      return;
    }
    el.promoSection.hidden = false;
    if (cfg.heading) el.promoHeading.textContent = cfg.heading;
    if (cfg.subheading) el.promoSub.textContent = cfg.subheading;
    el.promoList.innerHTML = items.map(function (it) {
      return '<a class="promo-item" href="' + it.url + '" target="_blank" rel="sponsored nofollow noopener">' +
        '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '🛒') + '</span>' +
        '<span class="promo-body"><span class="promo-name">' + it.name + '</span>' +
        '<span class="promo-meta">' + (it.tag || '') + '</span>' +
        '<span class="promo-cta">' + (it.cta || '쿠팡에서 보기') + '</span></span></a>';
    }).join('');
    el.promoDisclosure.textContent = cfg.disclosure || '';
    el.footerDisclosure.textContent = cfg.disclosure || '';
    el.footerDisclosure.hidden = !cfg.disclosure;
  }

  function syncInputs() {
    el.elUsage.value = state.elec.usage;
    el.elMonth.value = String(state.elec.month);
    el.gsRegion.value = state.gas.region;
    el.gsUsage.value = state.gas.usage;
    el.gsUsage.step = state.gas.mode === 'mj' ? '10' : '1';
    el.gsHeat.value = state.gas.heat;
    el.gsCorr.value = state.gas.correction;
    el.gsMonth.value = String(state.gas.month);
    el.wfHousehold.value = String(state.welfare.household);
    el.wfUsage.value = state.welfare.usage;
    el.wfMj.value = state.welfare.mj;
    el.wfRegion.value = state.welfare.region;
    el.wfVoucher.checked = state.welfare.voucherOn;
    if (el.appVersion) el.appVersion.textContent = CFG.version || '1.0.0';
  }

  function init() {
    cacheEls();
    loadState();
    syncInputs();
    renderPromo();
    bindAll();
    bindTheme();
    bindInstall();
    setTab(state.tab);
    renderAll();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 오프라인 미지원 환경 무시 */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
