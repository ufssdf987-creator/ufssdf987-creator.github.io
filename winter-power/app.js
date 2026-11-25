/*!
 * app.js — 겨울 전기요금·누진세 계산기
 * 계산은 tariff.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var T = window.WinterPower;
  var CFG = window.APP_CONFIG || {};
  if (!T) {
    console.error('tariff.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'wpc.state.v1';
  var THEME_KEY = 'wpc.theme';
  var TODAY = new Date();
  var CURRENT_MONTH = TODAY.getMonth() + 1;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n)); }
  function seasonShort(month) {
    var m = T.normalizeMonth(month);
    if (m === 12 || m === 1 || m === 2) return '동계';
    if (m === 7 || m === 8) return '하계';
    return '기타계절';
  }
  function kwh(n) {
    var r = Math.round(n * 10) / 10;
    return (Number.isInteger(r) ? nf.format(r) : r.toFixed(1));
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var STATE_KEY = STORE_KEY;
  var state = {
    tab: 'calc',
    type: 'low',
    month: CURRENT_MONTH,
    mode: 'usage',
    source: 'usage',
    usage: 350,
    bill: 70640,
    discounts: { large: false, multi: false, birth: false, life: false },
    sim: {
      month: ([12, 1, 2].indexOf(CURRENT_MONTH) >= 0) ? CURRENT_MONTH : 12,
      days: 30,
      devices: {},
      custom: { on: false, name: '', watt: '', hours: 4 }
    }
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;
    if (raw.type === 'high' || raw.type === 'low') state.type = raw.type;
    if (raw.mode === 'bill' || raw.mode === 'usage') state.mode = raw.mode;
    if (raw.source === 'bill' || raw.source === 'usage') state.source = raw.source;
    var m = parseInt(raw.month, 10);
    if (m >= 1 && m <= 12) state.month = m;
    var u = parseFloat(raw.usage);
    if (isFinite(u) && u >= 0 && u <= 5000) state.usage = u;
    var b = parseFloat(raw.bill);
    if (isFinite(b) && b >= 0) state.bill = b;
    if (raw.discounts && typeof raw.discounts === 'object') {
      ['large', 'multi', 'birth', 'life'].forEach(function (k) {
        state.discounts[k] = !!raw.discounts[k];
      });
    }
    if (raw.sim && typeof raw.sim === 'object') {
      var sm = parseInt(raw.sim.month, 10);
      if (sm >= 1 && sm <= 12) state.sim.month = sm;
      var d = parseInt(raw.sim.days, 10);
      if (d >= 1 && d <= 31) state.sim.days = d;
      if (raw.sim.devices && typeof raw.sim.devices === 'object') {
        T.DEVICES.forEach(function (dev) {
          var c = raw.sim.devices[dev.id];
          if (c && c.on) {
            var h = parseFloat(c.hours);
            state.sim.devices[dev.id] = {
              on: true,
              hours: isFinite(h) ? clamp(h, 0.5, 24) : dev.defaultHours
            };
          }
        });
      }
      if (raw.sim.custom && typeof raw.sim.custom === 'object') {
        var cu = raw.sim.custom;
        state.sim.custom = {
          on: !!cu.on,
          name: typeof cu.name === 'string' ? cu.name.slice(0, 40) : '',
          watt: isFinite(parseFloat(cu.watt)) ? clamp(parseFloat(cu.watt), 0, 5000) : '',
          hours: isFinite(parseFloat(cu.hours)) ? clamp(parseFloat(cu.hours), 0.5, 24) : 4
        };
      }
    }
    if (raw.tab === 'sim') state.tab = 'sim';
  }

  var saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
    }, 180);
  }

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var el = {};
  function cacheEls() {
    el.tabCalc = $('#tabCalc');
    el.tabSim = $('#tabSim');
    el.panelCalc = $('#panelCalc');
    el.panelSim = $('#panelSim');
    el.monthSelect = $('#monthSelect');
    el.simMonth = $('#simMonth');
    el.seasonNote = $('#seasonNote');
    el.usageField = $('#usageField');
    el.billField = $('#billField');
    el.usageInput = $('#usageInput');
    el.usageRange = $('#usageRange');
    el.billInput = $('#billInput');
    el.billHelp = $('#billHelp');
    el.discountBadge = $('#discountBadge');
    el.totalAmount = $('#totalAmount');
    el.resultSub = $('#resultSub');
    el.tierBadge = $('#tierBadge');
    el.gauge = $('#gauge');
    el.gaugeFill = $('#gaugeFill');
    el.seg1 = $('#seg1');
    el.seg2 = $('#seg2');
    el.seg3 = $('#seg3');
    el.segSuper = $('#segSuper');
    el.gaugeMarker = $('#gaugeMarker');
    el.gaugeMarkerLabel = $('#gaugeMarkerLabel');
    el.scaleB1 = $('#scaleB1');
    el.scaleB2 = $('#scaleB2');
    el.scaleSuper = $('#scaleSuper');
    el.scaleEnd = $('#scaleEnd');
    el.calcInsight = $('#calcInsight');
    el.breakdown = $('#breakdown');
    el.shareCalc = $('#shareCalc');
    el.compareList = $('#compareList');
    el.compareNote = $('#compareNote');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.simBase = $('#simBase');
    el.simDays = $('#simDays');
    el.deviceList = $('#deviceList');
    el.deviceCount = $('#deviceCount');
    el.simDelta = $('#simDelta');
    el.simSub = $('#simSub');
    el.simAddedKwh = $('#simAddedKwh');
    el.simTotalKwh = $('#simTotalKwh');
    el.simTotalBill = $('#simTotalBill');
    el.simDaily = $('#simDaily');
    el.tierFrom = $('#tierFrom');
    el.tierTo = $('#tierTo');
    el.tierFlow = $('#tierFlow');
    el.jumpBadge = $('#jumpBadge');
    el.simInsight = $('#simInsight');
    el.shareSim = $('#shareSim');
    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
    el.installBtn = $('#installBtn');
    el.toast = $('#toast');
    el.appVersion = $('#appVersion');
    el.dataDate = $('#dataDate');
    el.footerDisclosure = $('#footerDisclosure');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  function setTab(tab, focus) {
    state.tab = tab === 'sim' ? 'sim' : 'calc';
    var isCalc = state.tab === 'calc';
    el.tabCalc.classList.toggle('is-active', isCalc);
    el.tabSim.classList.toggle('is-active', !isCalc);
    el.tabCalc.setAttribute('aria-selected', String(isCalc));
    el.tabSim.setAttribute('aria-selected', String(!isCalc));
    el.tabCalc.tabIndex = isCalc ? 0 : -1;
    el.tabSim.tabIndex = isCalc ? -1 : 0;
    el.panelCalc.hidden = !isCalc;
    el.panelSim.hidden = isCalc;
    el.panelCalc.classList.toggle('is-active', isCalc);
    el.panelSim.classList.toggle('is-active', !isCalc);
    if (focus) (isCalc ? el.tabCalc : el.tabSim).focus();
    try {
      var hash = isCalc ? '#calc' : '#sim';
      if (history.replaceState) history.replaceState(null, '', hash);
    } catch (e) { /* file:// 등 */ }
    saveState();
  }

  function initTabs() {
    el.tabCalc.addEventListener('click', function () { setTab('calc'); });
    el.tabSim.addEventListener('click', function () { setTab('sim'); });
    $$('.tabs .tab').forEach(function (tab) {
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          setTab(state.tab === 'calc' ? 'sim' : 'calc', true);
        }
      });
    });
    if (location.hash === '#sim') setTab('sim');
    else setTab('calc');
  }

  /* ── 폼 ↔ 상태 ────────────────────────────────────────── */
  function syncSegments() {
    $$('[data-segment]').forEach(function (group) {
      var key = group.getAttribute('data-segment');
      var value = key === 'mode' ? state.mode : state.type;
      $$('button', group).forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-value') === value);
      });
    });
  }

  function syncForm() {
    el.monthSelect.value = String(state.month);
    el.simMonth.value = String(state.sim.month);
    el.usageInput.value = String(Math.round(state.usage));
    el.usageRange.max = String(Math.max(1000, Math.ceil(state.usage / 100) * 100));
    el.usageRange.value = String(clamp(state.usage, 0, Number(el.usageRange.max)));
    el.simBase.value = String(Math.round(state.usage));
    el.simDays.value = String(state.sim.days);
    el.billInput.value = String(Math.round(state.bill));
    ['large', 'multi', 'birth', 'life'].forEach(function (k) {
      var box = $('#dc' + k.charAt(0).toUpperCase() + k.slice(1));
      if (box) box.checked = !!state.discounts[k];
    });
    syncSegments();
    updateRangeFill(el.usageRange);
  }

  function applyMode() {
    var billMode = state.mode === 'bill';
    el.usageField.hidden = billMode;
    el.billField.hidden = !billMode;
  }

  function updateRangeFill(range) {
    if (!range) return;
    var min = Number(range.min || 0), max = Number(range.max || 100);
    var pct = max > min ? ((Number(range.value) - min) / (max - min)) * 100 : 0;
    range.style.setProperty('--fill', pct + '%');
  }

  /* ── 계산 ─────────────────────────────────────────────── */
  function computeCalc() {
    var inv = null;
    var usage = state.usage;
    if (state.mode === 'bill' && state.source === 'bill') {
      inv = T.usageForBill(state.bill, {
        type: state.type, month: state.month, discounts: state.discounts
      });
      usage = inv.usage;
      state.usage = usage;
    }
    var opts = { usage: usage, type: state.type, month: state.month, discounts: state.discounts };
    var bill = T.calcBill(opts);
    if (state.mode === 'bill' && state.source !== 'bill') {
      // 사용량을 직접 바꾼 경우: 청구 금액 칸도 현재 계산값으로 맞춰 둔다
      state.bill = bill.total;
      if (el.billInput) el.billInput.value = String(bill.total);
    }
    return { bill: bill, info: T.tierInfo(opts), inv: inv, usage: usage };
  }

  function tierColor(tier) {
    return 'var(--tier' + (tier === 4 ? 4 : tier) + ')';
  }

  function renderGauge(bill) {
    var bounds = bill.bounds;
    var usage = bill.usage;
    var superSeason = bill.superSeason;
    var scaleMax = superSeason ? 1200 : 600;
    if (usage > scaleMax) scaleMax = Math.ceil((usage * 1.02) / 200) * 200;
    var pct = function (v) { return clamp((v / scaleMax) * 100, 0, 100); };

    el.seg1.style.left = '0%';
    el.seg1.style.width = pct(bounds[0]) + '%';
    el.seg2.style.left = pct(bounds[0]) + '%';
    el.seg2.style.width = (pct(bounds[1]) - pct(bounds[0])) + '%';
    var seg3End = superSeason ? Math.min(1000, scaleMax) : scaleMax;
    el.seg3.style.left = pct(bounds[1]) + '%';
    el.seg3.style.width = Math.max(0, pct(seg3End) - pct(bounds[1])) + '%';

    if (superSeason && scaleMax > 1000) {
      el.segSuper.hidden = false;
      el.segSuper.style.left = pct(1000) + '%';
      el.segSuper.style.width = (100 - pct(1000)) + '%';
    } else {
      el.segSuper.hidden = true;
    }

    el.gaugeFill.style.width = pct(usage) + '%';
    el.gaugeMarker.style.left = pct(usage) + '%';
    el.gaugeMarkerLabel.textContent = kwh(usage);
    el.gauge.style.setProperty('--tier-color', tierColor(bill.isSuperUser ? 4 : bill.tier));

    el.scaleB1.textContent = nf.format(bounds[0]);
    el.scaleB1.style.left = pct(bounds[0]) + '%';
    el.scaleB2.textContent = nf.format(bounds[1]);
    el.scaleB2.style.left = pct(bounds[1]) + '%';
    if (superSeason) {
      el.scaleSuper.hidden = false;
      el.scaleSuper.textContent = '1,000';
      el.scaleSuper.style.left = pct(1000) + '%';
    } else {
      el.scaleSuper.hidden = true;
    }
    el.scaleEnd.textContent = nf.format(scaleMax);
  }

  function rowHtml(label, small, value, cls) {
    return '<div class="bd-row ' + (cls || '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function renderBreakdown(bill) {
    var html = '';
    html += rowHtml('기본요금', bill.tierLabel, won(bill.baseFee) + '원');
    bill.energyLines.forEach(function (line) {
      html += rowHtml(
        line.label + ' ' + (Math.round(line.kwh * 10) / 10) + 'kWh × ' + line.rate + '원',
        '',
        won(line.amount) + '원',
        'sub'
      );
    });
    html += rowHtml('기후환경요금', kwh(bill.usage) + 'kWh × ' + bill.rates.climate.toFixed(1) + '원', won(bill.climateFee) + '원');
    html += rowHtml('연료비조정액', kwh(bill.usage) + 'kWh × ' + bill.rates.fuel.toFixed(1) + '원', won(bill.fuelFee) + '원');
    html += rowHtml('전기요금계', '', won(bill.chargeBase) + '원', 'sum');
    if (bill.discountAmount > 0) {
      html += rowHtml(
        '복지할인',
        (bill.discount.label || '') + ' ' + (bill.discount.ratePct || 30) + '%' + (bill.discount.capped ? ' (한도 적용)' : ''),
        '-' + won(bill.discountAmount) + '원',
        'discount'
      );
    }
    html += rowHtml('부가가치세', (bill.rates.vat * 100) + '%', won(bill.vat) + '원');
    html += rowHtml('전력산업기반기금', (bill.rates.fund * 100).toFixed(1) + '%', won(bill.fund) + '원');
    html += rowHtml('청구 예상액', '10원 미만 절사', won(bill.total) + '원', 'total');
    html += '<p class="bd-note">전력기금은 2024년 7월 3.2%, 2025년 7월부터 2.7%가 적용됩니다(그 전 3.7%). ' +
      '연료비조정단가는 분기마다 바뀌며 지금은 ' + T.FUEL_QUARTER + ' +' + bill.rates.fuel.toFixed(1) + '원/kWh입니다. ' +
      '1kWh당 평균 ' + won(bill.avgRate) + '원꼴이에요.</p>';
    el.breakdown.innerHTML = html;
  }

  function buildCalcInsight(bill, info) {
    var out = { html: '', warn: false };
    var remaining = info.remaining;
    if (bill.isSuperUser) {
      out.warn = true;
      out.html = '<strong>슈퍼유저 구간</strong>이에요. 1,000kWh를 넘은 ' + kwh(bill.superKwh) +
        'kWh에는 ' + T.RATES[bill.type].superUser + '원/kWh가 붙었습니다. 지금 1kWh를 줄이면 약 <strong>' +
        won(info.marginalCost) + '원</strong>이 줄어요.';
    } else if (bill.tier === 1) {
      out.html = '<strong>1단계</strong> 구간이에요. 2단계까지 <strong>' + kwh(remaining) +
        'kWh</strong> 남았고, 지금 1kWh를 더 쓰면 약 ' + won(info.marginalCost) + '원입니다.';
    } else if (bill.tier === 2) {
      if (remaining === 0) {
        out.warn = true;
        out.html = '<strong>2단계 막차</strong>예요. 1kWh만 더 쓰면 3단계로 넘어가 기본요금이 ' +
          won(bill.baseFee) + '원에서 ' + won(T.RATES[bill.type].tiers[2].base) + '원으로 오릅니다.';
      } else {
        out.html = '<strong>2단계</strong> 구간이에요. 3단계까지 <strong>' + kwh(remaining) +
          'kWh</strong> 남았고, 넘는 순간 기본요금이 ' + won(T.RATES[bill.type].tiers[1].base) + '원에서 ' +
          won(T.RATES[bill.type].tiers[2].base) + '원으로 올라요.';
      }
      if (info.lowerNeed) {
        out.html += ' ' + kwh(info.lowerNeed) + 'kWh를 줄이면 1단계로 내려가 약 <strong>' +
          won(info.saveByLowering) + '원</strong> 아낄 수 있어요.';
      }
    } else {
      out.warn = true;
      out.html = '<strong>3단계(가장 비싼 구간)</strong>이에요. 지금 1kWh는 약 ' +
        won(info.marginalCost) + '원입니다.';
      if (info.lowerNeed) {
        out.html += ' ' + kwh(info.lowerNeed) + 'kWh만 줄이면 2단계로 내려가 약 <strong>' +
          won(info.saveByLowering) + '원</strong> 아껴요.';
      }
    }
    return out;
  }

  function renderCalc() {
    var res = computeCalc();
    var bill = res.bill;

    if (state.mode === 'bill' && state.source === 'bill') {
      el.usageInput.value = String(Math.round(bill.usage));
      el.simBase.value = String(Math.round(bill.usage));
      el.usageRange.max = String(Math.max(1000, Math.ceil(bill.usage / 100) * 100));
      el.usageRange.value = String(clamp(bill.usage, 0, Number(el.usageRange.max)));
      updateRangeFill(el.usageRange);
    }

    el.totalAmount.textContent = won(bill.total);
    el.resultSub.textContent = kwh(bill.usage) + 'kWh · ' + (bill.type === 'high' ? '고압' : '저압') +
      ' · ' + bill.month + '월 (' + seasonShort(bill.month) + ')';
    el.tierBadge.textContent = bill.tierLabel;
    el.tierBadge.setAttribute('data-tier', String(bill.isSuperUser ? 4 : bill.tier));

    var insight = buildCalcInsight(bill, res.info);
    el.calcInsight.innerHTML = insight.html;
    el.calcInsight.classList.toggle('is-warn', insight.warn);

    renderGauge(bill);
    renderBreakdown(bill);

    el.discountBadge.textContent = bill.discountAmount > 0
      ? (bill.discount.label || '할인 적용')
      : '해당 없음';
    el.discountBadge.classList.toggle('is-on', bill.discountAmount > 0);

    if (state.mode === 'bill' && res.inv) {
      el.billHelp.innerHTML = won(state.bill) + '원은 <strong>' + kwh(res.inv.usage) + 'kWh</strong> 사용한 경우와 가장 가깝습니다' +
        (res.inv.exact ? '' : ' (약 ' + won(res.inv.diff) + '원 차이)') + '.';
    } else {
      el.billHelp.textContent = '부가세·전력기금이 포함된 결제 금액을 넣으면 사용량을 거꾸로 계산해요.';
    }

    if (bill.month === 12 || bill.month === 1 || bill.month === 2) {
      el.seasonNote.textContent = '동계(12~2월)는 누진 경계가 200/400kWh 그대로이고, 1,000kWh를 넘으면 초과분에 슈퍼유저 단가가 붙습니다.';
    } else if (bill.month === 7 || bill.month === 8) {
      el.seasonNote.textContent = '하계(7~8월)는 누진 경계가 300/450kWh로 넓어지고, 1,000kWh 초과분에는 슈퍼유저 단가가 붙습니다.';
    } else {
      el.seasonNote.textContent = bill.month + '월은 기타계절이에요. 누진 경계는 200/400kWh이고 슈퍼유저 요금은 없습니다.';
    }

    renderCompare(bill);
    renderPromo(bill);
  }

  /* ── 비교 표 ──────────────────────────────────────────── */
  function unitRate(bill) {
    var tariff = T.RATES[bill.type];
    var rate = bill.isSuperUser ? tariff.superUser : tariff.tiers[bill.tier - 1].rate;
    return rate * (1 + T.CONST.vat + T.CONST.fund);
  }

  var lastCompareRate = null;
  function renderCompare(bill) {
    var rate = unitRate(bill);
    if (lastCompareRate === rate && el.compareList.childElementCount) return;
    lastCompareRate = rate;
    var rows = T.DEVICES.slice().sort(function (a, b) { return a.watt - b.watt; }).map(function (d) {
      var hour = (d.watt / 1000) * rate;
      var month = (d.watt / 1000) * 8 * 30 * rate;
      return {
        name: d.name,
        watt: d.watt,
        hour: hour,
        month: month,
        emoji: d.emoji
      };
    });
    var min = rows.reduce(function (m, r) { return Math.min(m, r.month); }, Infinity);
    el.compareList.innerHTML = rows.map(function (r) {
      return '<div class="compare-row' + (r.month === min ? ' is-best' : '') + '">' +
        '<span class="cmp-name"><span aria-hidden="true">' + r.emoji + '</span><em>' + r.name + '</em></span>' +
        '<span class="cmp-watt">' + nf.format(r.watt) + '</span>' +
        '<span class="cmp-cost">' + won(r.hour) + '원</span>' +
        '<span class="cmp-cost">' + won(r.month) + '원</span>' +
        '</div>';
    }).join('');
    el.compareNote.textContent = '지금 ' + bill.tierLabel + ' 구간의 1kWh당 부담액(약 ' +
      won(rate) + '원, 부가세·기금 포함)으로 계산했어요. 하루 8시간씩 30일 사용 기준입니다.';
  }

  /* ── 제휴 카드 ────────────────────────────────────────── */
  var lastPromoRate = null;
  function renderPromo(bill) {
    var coupang = CFG.coupang || {};
    el.promoHeading.textContent = coupang.heading || '전기 덜 먹는 겨울 가전';
    el.promoSub.textContent = coupang.subheading || '같은 난방이라도 소비전력에 따라 요금 차이가 커요.';
    var disclosure = coupang.disclosure || '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
    el.promoDisclosure.textContent = disclosure;
    el.footerDisclosure.textContent = disclosure;

    var rate = unitRate(bill);
    if (lastPromoRate === rate && el.promoList.childElementCount) return;
    lastPromoRate = rate;
    var items = (coupang.items || []).filter(function (it) { return it && it.url; });
    el.promoList.innerHTML = items.map(function (it) {
      var wattNum = parseFloat(it.watt) || 0;
      var hourly = wattNum ? (wattNum / 1000) * rate : 0;
      var meta = [];
      if (it.tag) meta.push(it.tag);
      if (wattNum) meta.push('1시간 약 ' + won(hourly) + '원');
      return '<div class="promo-item">' +
        '<span class="promo-thumb" aria-hidden="true">' +
        (wattNum ? '<b>' + nf.format(wattNum) + '</b><i>W</i>' : '<b>가전</b>') +
        '</span>' +
        '<div class="promo-body">' +
        '<p class="promo-name">' + it.name + '</p>' +
        '<p class="promo-meta">' + meta.join(' · ') + '</p>' +
        '</div>' +
        '<a class="promo-cta" href="' + it.url + '" target="_blank" rel="sponsored nofollow noopener">' +
        (it.cta || '쿠팡에서 보기') + '</a>' +
        '</div>';
    }).join('');
  }

  /* ── 시뮬레이터 ───────────────────────────────────────── */
  function selectedItems() {
    var items = [];
    T.DEVICES.forEach(function (d) {
      var c = state.sim.devices[d.id];
      if (c && c.on) items.push({ id: d.id, name: d.name, watt: d.watt, hours: c.hours });
    });
    var cu = state.sim.custom;
    if (cu && cu.on && parseFloat(cu.watt) > 0) {
      items.push({
        id: 'custom',
        name: cu.name || '직접 입력',
        watt: parseFloat(cu.watt),
        hours: parseFloat(cu.hours) || 0
      });
    }
    return items;
  }

  function deviceRow(d) {
    var c = state.sim.devices[d.id] || { on: false, hours: d.defaultHours };
    return '<div class="device' + (c.on ? ' is-on' : '') + '" data-device="' + d.id + '">' +
      '<label class="device-head">' +
      '<input type="checkbox" data-toggle="' + d.id + '"' + (c.on ? ' checked' : '') + ' aria-label="' + d.name + ' 사용">' +
      '<span class="device-emoji" aria-hidden="true">' + d.emoji + '</span>' +
      '<span class="device-body">' +
      '<span class="device-name">' + d.name + '</span>' +
      '<span class="device-meta">' + d.note + '</span>' +
      '</span>' +
      '<span class="device-kwh" data-kwh="' + d.id + '"></span>' +
      '</label>' +
      '<div class="device-hours"' + (c.on ? '' : ' hidden') + '>' +
      '<span class="device-hours-label">하루</span>' +
      '<input class="range" type="range" min="0.5" max="24" step="0.5" value="' + c.hours + '"' +
      ' data-hours="' + d.id + '" aria-label="' + d.name + ' 하루 사용 시간">' +
      '<output data-hours-out="' + d.id + '">' + c.hours + '시간</output>' +
      '</div>' +
      '</div>';
  }

  function customRow() {
    var cu = state.sim.custom;
    return '<div class="device device--custom' + (cu.on ? ' is-on' : '') + '" data-device="custom">' +
      '<label class="device-head">' +
      '<input type="checkbox" data-toggle="custom"' + (cu.on ? ' checked' : '') + ' aria-label="직접 입력 기기 사용">' +
      '<span class="device-emoji" aria-hidden="true">➕</span>' +
      '<span class="device-body">' +
      '<span class="device-name">직접 입력</span>' +
      '<span class="device-meta">제품 스펙의 소비전력(W)</span>' +
      '</span>' +
      '<span class="device-kwh" data-kwh="custom"></span>' +
      '</label>' +
      '<div class="custom-fields"' + (cu.on ? '' : ' hidden') + '>' +
      '<label>제품명 (선택)<input type="text" data-custom="name" maxlength="40" placeholder="예: 세라믹 히터" value="' +
      String(cu.name || '').replace(/"/g, '&quot;') + '"></label>' +
      '<label>소비전력(W)<input type="number" inputmode="numeric" data-custom="watt" min="1" max="5000" step="10" placeholder="1300" value="' +
      (cu.watt === '' ? '' : cu.watt) + '"></label>' +
      '<label>하루 사용(시간)<input type="number" inputmode="decimal" data-custom="hours" min="0.5" max="24" step="0.5" value="' +
      (cu.hours || 4) + '"></label>' +
      '</div>' +
      '</div>';
  }

  function buildDeviceList() {
    el.deviceList.innerHTML = T.DEVICES.map(deviceRow).join('') + customRow();
    $$('#deviceList .range').forEach(updateRangeFill);
    updateDeviceUI();
  }

  function updateDeviceUI() {
    T.DEVICES.forEach(function (d) {
      var c = state.sim.devices[d.id] || { on: false, hours: d.defaultHours };
      var row = $('.device[data-device="' + d.id + '"]');
      if (!row) return;
      row.classList.toggle('is-on', !!c.on);
      var box = $('[data-toggle="' + d.id + '"]', row);
      if (box) box.checked = !!c.on;
      var hours = $('.device-hours', row);
      if (hours) hours.hidden = !c.on;
      var range = $('[data-hours="' + d.id + '"]', row);
      if (range) {
        if (range.value !== String(c.hours)) range.value = String(c.hours);
        updateRangeFill(range);
        var out = $('[data-hours-out="' + d.id + '"]', row);
        if (out) out.textContent = c.hours + '시간';
      }
      var badge = $('[data-kwh="' + d.id + '"]', row);
      if (badge) {
        badge.textContent = c.on
          ? kwh(T.deviceKwh(d.watt, c.hours, state.sim.days)) + 'kWh'
          : '';
      }
    });
    var cu = state.sim.custom;
    var crow = $('.device[data-device="custom"]');
    if (crow) {
      crow.classList.toggle('is-on', !!cu.on);
      var cbox = $('[data-toggle="custom"]', crow);
      if (cbox) cbox.checked = !!cu.on;
      var cf = $('.custom-fields', crow);
      if (cf) cf.hidden = !cu.on;
      var ck = $('[data-kwh="custom"]', crow);
      if (ck) {
        ck.textContent = cu.on && parseFloat(cu.watt) > 0
          ? kwh(T.deviceKwh(parseFloat(cu.watt), parseFloat(cu.hours) || 0, state.sim.days)) + 'kWh'
          : '';
      }
    }
  }

  function computeSim() {
    return T.simulate({
      baseUsage: state.usage,
      type: state.type,
      month: state.sim.month,
      discounts: state.discounts,
      days: state.sim.days,
      items: selectedItems()
    });
  }

  function buildSimInsight(sim) {
    if (!sim.items.length) {
      return { html: '전열기기를 고르면 한 달에 늘어나는 요금과 누진 단계 변화를 계산해요.', warn: false };
    }
    if (sim.superEnter) {
      return {
        html: '<strong>슈퍼유저 구간에 들어갑니다.</strong> 1,000kWh를 넘는 순간 초과분에 ' +
          T.RATES[sim.after.type].superUser + '원/kWh가 붙어 요금이 크게 뜁니다. 사용 시간을 줄이거나 ' +
          '낮은 W 기기로 바꾸는 게 좋아요.',
        warn: true
      };
    }
    if (sim.stepChanged) {
      var diff = sim.after.baseFee - sim.before.baseFee;
      return {
        html: '<strong>' + sim.before.tierLabel + ' → ' + sim.after.tierLabel + '</strong>로 넘어갑니다. 기본요금이 ' +
          won(sim.before.baseFee) + '원에서 ' + won(sim.after.baseFee) + '원으로 올라 추가 요금에 ' +
          won(diff) + '원이 포함됐어요.',
        warn: true
      };
    }
    var info = T.tierInfo({
      usage: sim.after.usage, type: sim.after.type, month: sim.after.month, discounts: state.discounts
    });
    var tail = info.remaining != null && info.remaining > 0
      ? ' 다음 구간까지 ' + kwh(info.remaining) + 'kWh 남았어요.'
      : ' 다음 구간이 코앞이에요.';
    return {
      html: '총 ' + kwh(sim.after.usage) + 'kWh로 ' + sim.after.tierLabel + '을 유지합니다.' + tail,
      warn: false
    };
  }

  function renderSim() {
    var sim = computeSim();
    var hasItems = sim.items.length > 0;
    var simCard = document.getElementById('simResult');
    if (simCard) simCard.classList.toggle('is-empty', !hasItems);
    var names = sim.items.map(function (it) { return it.name; });

    el.simDelta.textContent = hasItems ? won(sim.addedCost) : '0';
    el.simAddedKwh.textContent = hasItems ? kwh(sim.addedKwh) + ' kWh' : '0 kWh';
    el.simTotalKwh.textContent = kwh(sim.after.usage) + ' kWh';
    el.simTotalBill.textContent = won(sim.after.total) + '원';
    el.simDaily.textContent = hasItems ? won(sim.dailyCost) + '원' : '0원';

    if (hasItems) {
      var label = names.slice(0, 2).join('·') + (names.length > 2 ? ' 외 ' + (names.length - 2) + '개' : '');
      el.simSub.textContent = label + ' · ' + kwh(sim.addedKwh) + 'kWh 추가 · ' + sim.days + '일 기준';
    } else {
      el.simSub.textContent = '기기를 선택하면 계산됩니다';
    }

    el.tierFrom.textContent = sim.before.tierLabel;
    el.tierFrom.setAttribute('data-tier', String(sim.before.isSuperUser ? 4 : sim.before.tier));
    el.tierTo.textContent = sim.after.tierLabel;
    el.tierTo.setAttribute('data-tier', String(sim.after.isSuperUser ? 4 : sim.after.tier));
    var jumped = sim.stepChanged || sim.superEnter;
    el.tierFlow.setAttribute('data-jump', String(jumped));
    el.jumpBadge.hidden = !jumped;
    el.jumpBadge.textContent = sim.superEnter ? '슈퍼유저 진입' : '누진 점프';

    el.shareSim.disabled = !hasItems;
    el.shareSim.setAttribute('aria-disabled', String(!hasItems));

    var ins = buildSimInsight(sim);
    el.simInsight.innerHTML = ins.html;
    el.simInsight.classList.toggle('is-warn', ins.warn);

    var count = selectedItems().length;
    el.deviceCount.textContent = count + '개';
    el.deviceCount.classList.toggle('is-on', count > 0);

    updateDeviceUI();
  }

  function refresh() {
    renderCalc();
    renderSim();
    saveState();
  }

  /* ── 공유 ─────────────────────────────────────────────── */
  function shareUrl() {
    var url = (CFG.siteUrl || '').trim();
    if (url && /^https?:\/\//.test(url)) return url.replace(/\/?$/, '/');
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin + location.pathname;
    }
    return '';
  }

  function calcShareText() {
    var res = computeCalc();
    var b = res.bill;
    var lines = [
      '⚡ ' + b.month + '월 전기요금 예상 (' + seasonShort(b.month) + ')',
      '· 사용량 ' + kwh(b.usage) + 'kWh · 주택용 ' + (b.type === 'high' ? '고압' : '저압'),
      '· 누진 ' + b.tierLabel + ' 구간',
      '· 예상 청구액 ' + won(b.total) + '원 (1kWh당 ' + won(b.avgRate) + '원)'
    ];
    if (b.discountAmount > 0) {
      lines.push('· 복지할인 ' + b.discount.label + ' -' + won(b.discountAmount) + '원 반영');
    }
    var url = shareUrl();
    if (url) lines.push('', '겨울 전기요금 계산기 → ' + url);
    return lines.join('\n');
  }

  function simShareText() {
    var sim = computeSim();
    if (!sim.items.length) return '';
    var names = sim.items.map(function (it) {
      return it.name + ' ' + nf.format(it.watt) + 'W×' + it.hours + '시간';
    }).join(' + ');
    var lines = [
      '🔥 겨울 난방가전 요금 계산',
      '· 기존 ' + kwh(sim.before.usage) + 'kWh + ' + names + ' × ' + sim.days + '일',
      '· 추가 ' + kwh(sim.addedKwh) + 'kWh → 총 ' + kwh(sim.after.usage) + 'kWh',
      '· 한 달 추가 요금 +' + won(sim.addedCost) + '원 (하루 ' + won(sim.dailyCost) + '원)',
      '· 누진 ' + sim.before.tierLabel + ' → ' + sim.after.tierLabel +
        (sim.stepChanged || sim.superEnter ? ' ⚠️ 점프' : '')
    ];
    var url = shareUrl();
    if (url) lines.push('', '겨울 전기요금 계산기 → ' + url);
    return lines.join('\n');
  }

  function copyText(text) {
    if (!text) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }

  var toastTimer = null;
  function toast(message, actionLabel, onAction) {
    clearTimeout(toastTimer);
    el.toast.textContent = message + (actionLabel ? ' · ' + actionLabel : '');
    el.toast.classList.add('is-visible');
    el.toast.style.pointerEvents = onAction ? 'auto' : 'none';
    el.toast.style.cursor = onAction ? 'pointer' : 'default';
    el.toast.onclick = onAction
      ? function () { hideToast(); onAction(); }
      : null;
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 2600);
  }
  function hideToast() {
    el.toast.classList.remove('is-visible');
    el.toast.onclick = null;
  }

  function doShare(text, label) {
    copyText(text).then(function () {
      toast(label || '결과를 복사했어요. 붙여넣기 해 보세요.');
    }).catch(function () {
      toast('복사가 막혔어요. 화면을 길게 눌러 복사해 주세요.');
    });
  }

  /* ── 테마 ─────────────────────────────────────────────── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    el.themeBtn.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    var meta = $('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070c16' : '#eef2f7');
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 무시 */ }
  }

  function initTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'dark' : 'light');
    el.themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  /* ── 광고 ─────────────────────────────────────────────── */
  function initAds() {
    var ads = CFG.adsense || {};
    var slots = $$('.ad-slot');
    var live = [];
    slots.forEach(function (slot) {
      var key = slot.getAttribute('data-ad-slot');
      var id = ads.slots && ads.slots[key];
      if (ads.client && id) {
        slot.hidden = false;
        slot.classList.add('ad-slot--live');
        slot.removeAttribute('aria-hidden');
        slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + ads.client +
          '" data-ad-slot="' + id + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
        live.push(slot.querySelector('ins'));
      } else if (ads.showPlaceholders) {
        slot.hidden = false;
        slot.removeAttribute('aria-hidden');
        slot.innerHTML = '<span>AD · 광고 영역</span>';
      } else {
        slot.hidden = true;
      }
    });
    if (!ads.client || !live.length) return;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      encodeURIComponent(ads.client);
    script.crossOrigin = 'anonymous';
    script.onload = function () {
      live.forEach(function (ins) {
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) { /* 광고 차단 등 */ }
      });
    };
    document.head.appendChild(script);
  }

  /* ── PWA ──────────────────────────────────────────────── */
  function initInstall() {
    var deferred = null;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isIOS && !standalone) {
      // iOS Safari는 설치 프롬프트가 없어 직접 안내한다
      el.installBtn.hidden = false;
      el.installBtn.addEventListener('click', function () {
        toast('Safari 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 열려요.', '', null);
      });
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      el.installBtn.hidden = false;
    });
    el.installBtn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        el.installBtn.hidden = true;
      });
    });
    window.addEventListener('appinstalled', function () {
      el.installBtn.hidden = true;
      toast('홈 화면에 추가했어요. 앱처럼 열 수 있습니다.');
    });
    if (standalone) el.installBtn.hidden = true;
  }

  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    var hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              toast('새 버전이 준비됐어요', '눌러서 새로고침', function () {
                worker.postMessage({ type: 'SKIP_WAITING' });
              });
            }
          });
        });
      }).catch(function () { /* 오프라인 캐시는 없어도 동작 */ });
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (hadController) location.reload();
      });
    });
  }

  /* ── 이벤트 ───────────────────────────────────────────── */
  function bindEvents() {
    // 계약 종류 / 입력 방식
    $$('.segmented[data-segment]').forEach(function (group) {
      group.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-value]');
        if (!btn) return;
        var key = group.getAttribute('data-segment');
        var value = btn.getAttribute('data-value');
        if (key === 'mode') {
          state.mode = value;
          if (value === 'bill') {
            state.source = 'bill';
            var current = T.calcBill({
              usage: state.usage, type: state.type, month: state.month, discounts: state.discounts
            });
            state.bill = current.total;
            el.billInput.value = String(current.total);
          } else {
            state.source = 'usage';
          }
          applyMode();
          syncForm();
          refresh();
          return;
        } else {
          state.type = value;
        }
        applyMode();
        syncSegments();
        refresh();
      });
    });

    el.monthSelect.addEventListener('change', function () {
      state.month = parseInt(el.monthSelect.value, 10) || CURRENT_MONTH;
      refresh();
    });
    el.simMonth.addEventListener('change', function () {
      state.sim.month = parseInt(el.simMonth.value, 10) || 12;
      refresh();
    });

    el.usageInput.addEventListener('input', function () {
      state.source = 'usage';
      var v = parseFloat(el.usageInput.value);
      state.usage = isFinite(v) ? clamp(v, 0, 5000) : 0;
      el.usageRange.max = String(Math.max(1000, Math.ceil(state.usage / 100) * 100));
      el.usageRange.value = String(clamp(state.usage, 0, Number(el.usageRange.max)));
      updateRangeFill(el.usageRange);
      el.simBase.value = String(Math.round(state.usage));
      refresh();
    });
    el.usageRange.addEventListener('input', function () {
      state.source = 'usage';
      state.usage = Number(el.usageRange.value);
      el.usageInput.value = String(state.usage);
      el.simBase.value = String(Math.round(state.usage));
      updateRangeFill(el.usageRange);
      refresh();
    });
    $$('.chips button[data-usage]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.source = 'usage';
        state.usage = Number(btn.getAttribute('data-usage'));
        el.usageInput.value = String(state.usage);
        el.simBase.value = String(state.usage);
        el.usageRange.max = String(Math.max(1000, state.usage));
        el.usageRange.value = String(state.usage);
        updateRangeFill(el.usageRange);
        refresh();
      });
    });

    el.billInput.addEventListener('input', function () {
      state.source = 'bill';
      var v = parseFloat(el.billInput.value);
      state.bill = isFinite(v) ? clamp(v, 0, 9999999) : 0;
      refresh();
    });

    ['large', 'multi', 'birth', 'life'].forEach(function (k) {
      var box = $('#dc' + k.charAt(0).toUpperCase() + k.slice(1));
      if (!box) return;
      box.addEventListener('change', function () {
        state.discounts[k] = box.checked;
        refresh();
      });
    });

    // 시뮬레이터 입력
    el.simBase.addEventListener('input', function () {
      state.source = 'usage';
      var v = parseFloat(el.simBase.value);
      state.usage = isFinite(v) ? clamp(v, 0, 5000) : 0;
      el.usageInput.value = String(Math.round(state.usage));
      el.usageRange.max = String(Math.max(1000, Math.ceil(state.usage / 100) * 100));
      el.usageRange.value = String(clamp(state.usage, 0, Number(el.usageRange.max)));
      updateRangeFill(el.usageRange);
      refresh();
    });
    el.simDays.addEventListener('input', function () {
      var v = parseInt(el.simDays.value, 10);
      state.sim.days = isFinite(v) ? clamp(v, 1, 31) : 30;
      refresh();
    });

    // 기기 목록 (위임)
    el.deviceList.addEventListener('change', function (e) {
      var box = e.target.closest('input[data-toggle]');
      if (!box) return;
      var id = box.getAttribute('data-toggle');
      if (id === 'custom') {
        state.sim.custom.on = box.checked;
      } else {
        var dev = T.DEVICES.filter(function (d) { return d.id === id; })[0];
        if (!dev) return;
        if (box.checked) {
          state.sim.devices[id] = { on: true, hours: (state.sim.devices[id] && state.sim.devices[id].hours) || dev.defaultHours };
        } else {
          state.sim.devices[id] = { on: false, hours: (state.sim.devices[id] && state.sim.devices[id].hours) || dev.defaultHours };
        }
      }
      refresh();
    });
    el.deviceList.addEventListener('input', function (e) {
      var range = e.target.closest('input[data-hours]');
      if (range) {
        var id = range.getAttribute('data-hours');
        var hours = parseFloat(range.value);
        if (state.sim.devices[id]) state.sim.devices[id].hours = hours;
        var out = $('[data-hours-out="' + id + '"]');
        if (out) out.textContent = hours + '시간';
        updateRangeFill(range);
        refresh();
        return;
      }
      var field = e.target.closest('[data-custom]');
      if (field) {
        var key = field.getAttribute('data-custom');
        if (key === 'name') state.sim.custom.name = field.value.slice(0, 40);
        else if (key === 'watt') state.sim.custom.watt = field.value === '' ? '' : clamp(parseFloat(field.value) || 0, 0, 5000);
        else if (key === 'hours') state.sim.custom.hours = clamp(parseFloat(field.value) || 0, 0, 24);
        refresh();
      }
    });

    // 공유
    el.shareCalc.addEventListener('click', function () { doShare(calcShareText()); });
    el.shareSim.addEventListener('click', function () {
      var text = simShareText();
      if (!text) {
        toast('먼저 난방기기를 골라 주세요.');
        return;
      }
      doShare(text);
    });

    // 키보드 단축키: 숫자 입력 중 Enter로 결과 복사하지 않도록 버튼에만 반응
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideToast();
    });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = T.DATA_DATE;
    el.dataDate.setAttribute('datetime', T.DATA_DATE);
    $('#fuelQuarter').textContent = T.FUEL_QUARTER;

    syncForm();
    applyMode();
    buildDeviceList();
    initTabs();
    bindEvents();
    initTheme();
    initAds();
    initInstall();
    initSW();
    refresh();

    // 한전 요금표에 없는 값이 들어오면 안내
    if (state.usage > 2000) {
      toast('2,000kWh를 넘는 사용량은 계절·복지할인에 따라 실제 고지서와 차이가 클 수 있어요.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
