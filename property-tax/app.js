/*!
 * app.js — 2026 부동산 세금(취득세·양도소득세·증여세) 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.PropertyTaxCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'ptx.state.v1';
  var THEME_KEY = 'ptx.theme';
  var TABS = ['acq', 'gain', 'gift'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function won(n) { return nf.format(Math.round(n || 0)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** 3억 5,000만원 · 2,400만원 · 85만원처럼 읽기 쉽게 */
  function wonShort(v) {
    var n = Math.round(Math.abs(v));
    var sign = v < 0 ? '-' : '';
    if (n >= 100000000) {
      var eok = Math.floor(n / 100000000);
      var man = Math.round((n % 100000000) / 10000);
      if (man === 0) return sign + eok + '억원';
      return sign + eok + '억 ' + (man >= 10000
        ? nf.format(Math.round(man / 10000)) + '억 ' + nf.format(man % 10000) + '만원'
        : nf.format(man) + '만원');
    }
    if (n >= 10000) return sign + nf.format(Math.round(n / 10000)) + '만원';
    return sign + nf.format(n) + '원';
  }

  function percent(v, digits) {
    var d = digits === undefined ? 2 : digits;
    var n = Number(v) || 0;
    var s = n.toFixed(d);
    s = s.replace(/\.?0+$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  function periodLabel(years, months) {
    var y = Math.round(years);
    var m = Math.round(months);
    if (y <= 0 && m <= 0) return '0개월';
    var out = '';
    if (y > 0) out += y + '년';
    if (m > 0) out += (out ? ' ' : '') + m + '개월';
    return out;
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'acq',
    acq: {
      price: 800000000, houses: 1, adjust: false, over85: true,
      temp2: false, first: false, firstLimit: 2000000
    },
    gain: {
      sale: 1500000000, buy: 700000000, expenses: 30000000,
      holdY: 10, holdM: 0, liveY: 10, liveM: 0,
      oneHouse: true, adjustAtBuy: false
    },
    gift: {
      amount: 200000000, relation: 'parent', marriage: false,
      skip: false, credit: true, used: 0
    }
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var a = raw.acq;
    if (a && typeof a === 'object') {
      ['price', 'houses', 'firstLimit'].forEach(function (k) {
        var v = parseFloat(a[k]);
        if (isFinite(v) && v >= 0) state.acq[k] = v;
      });
      if (state.acq.houses < 1) state.acq.houses = 1;
      if (a.firstLimit !== 3000000) state.acq.firstLimit = 2000000;
      ['adjust', 'over85', 'temp2', 'first'].forEach(function (k) {
        if (typeof a[k] === 'boolean') state.acq[k] = a[k];
      });
    }

    var g = raw.gain;
    if (g && typeof g === 'object') {
      ['sale', 'buy', 'expenses', 'holdY', 'holdM', 'liveY', 'liveM'].forEach(function (k) {
        var v = parseFloat(g[k]);
        if (isFinite(v) && v >= 0) state.gain[k] = v;
      });
      ['oneHouse', 'adjustAtBuy'].forEach(function (k) {
        if (typeof g[k] === 'boolean') state.gain[k] = g[k];
      });
    }

    var f = raw.gift;
    if (f && typeof f === 'object') {
      ['amount', 'used'].forEach(function (k) {
        var v = parseFloat(f[k]);
        if (isFinite(v) && v >= 0) state.gift[k] = v;
      });
      if (S.GIFT_RELATION[f.relation]) state.gift.relation = f.relation;
      ['marriage', 'skip', 'credit'].forEach(function (k) {
        if (typeof f[k] === 'boolean') state.gift[k] = f[k];
      });
    }

    if (TABS.indexOf(raw.tab) >= 0) state.tab = raw.tab;
  }

  var saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
    }, 180);
  }

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var el = {};
  function cacheEls() {
    el.tabAcq = $('#tabAcq');
    el.tabGain = $('#tabGain');
    el.tabGift = $('#tabGift');
    el.panelAcq = $('#panelAcq');
    el.panelGain = $('#panelGain');
    el.panelGift = $('#panelGift');

    el.acqPrice = $('#acqPrice');
    el.acqPriceBadge = $('#acqPriceBadge');
    el.acqAdjust = $('#acqAdjust');
    el.acqOver85 = $('#acqOver85');
    el.acqTemp2 = $('#acqTemp2');
    el.acqFirst = $('#acqFirst');
    el.acqTotal = $('#acqTotal');
    el.acqSub = $('#acqSub');
    el.acqVerdict = $('#acqVerdict');
    el.acqRows = $('#acqRows');
    el.acqTax = $('#acqTax');
    el.acqEdu = $('#acqEdu');
    el.acqRural = $('#acqRural');
    el.acqEffective = $('#acqEffective');
    el.acqInsight = $('#acqInsight');
    el.acqTable = $('#acqTable');
    el.acqPriceTable = $('#acqPriceTable');
    el.shareAcq = $('#shareAcq');

    el.gainSale = $('#gainSale');
    el.gainSaleBadge = $('#gainSaleBadge');
    el.gainBuy = $('#gainBuy');
    el.gainBuyBadge = $('#gainBuyBadge');
    el.gainExpense = $('#gainExpense');
    el.gainExpenseBadge = $('#gainExpenseBadge');
    el.gainHoldY = $('#gainHoldY');
    el.gainHoldM = $('#gainHoldM');
    el.gainHoldBadge = $('#gainHoldBadge');
    el.gainLiveY = $('#gainLiveY');
    el.gainLiveM = $('#gainLiveM');
    el.gainLiveBadge = $('#gainLiveBadge');
    el.gainOne = $('#gainOne');
    el.gainAdjustBuy = $('#gainAdjustBuy');
    el.gainTotal = $('#gainTotal');
    el.gainSub = $('#gainSub');
    el.gainVerdict = $('#gainVerdict');
    el.gainRows = $('#gainRows');
    el.gainProfit = $('#gainProfit');
    el.gainTaxed = $('#gainTaxed');
    el.gainDeduction = $('#gainDeduction');
    el.gainBase = $('#gainBase');
    el.gainInsight = $('#gainInsight');
    el.gainTable = $('#gainTable');
    el.shareGain = $('#shareGain');

    el.giftAmount = $('#giftAmount');
    el.giftAmountBadge = $('#giftAmountBadge');
    el.giftRelation = $('#giftRelation');
    el.giftMarriage = $('#giftMarriage');
    el.giftSkip = $('#giftSkip');
    el.giftCredit = $('#giftCredit');
    el.giftUsed = $('#giftUsed');
    el.giftUsedBadge = $('#giftUsedBadge');
    el.giftPayable = $('#giftPayable');
    el.giftSub = $('#giftSub');
    el.giftVerdict = $('#giftVerdict');
    el.giftRows = $('#giftRows');
    el.giftDeduction = $('#giftDeduction');
    el.giftBase = $('#giftBase');
    el.giftTax = $('#giftTax');
    el.giftEffective = $('#giftEffective');
    el.giftInsight = $('#giftInsight');
    el.giftTable = $('#giftTable');
    el.shareGift = $('#shareGift');

    el.themeBtn = $('#themeBtn');
    el.themeIcon = $('#themeIcon');
    el.installBtn = $('#installBtn');
    el.toast = $('#toast');
    el.appVersion = $('#appVersion');
    el.dataDate = $('#dataDate');
    el.promoSection = $('#promoSection');
    el.promoHeading = $('#promoHeading');
    el.promoSub = $('#promoSub');
    el.promoList = $('#promoList');
    el.promoDisclosure = $('#promoDisclosure');
    el.footerDisclosure = $('#footerDisclosure');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  function setTab(name, focus) {
    if (TABS.indexOf(name) < 0) name = 'acq';
    state.tab = name;
    var map = {
      acq: [el.tabAcq, el.panelAcq],
      gain: [el.tabGain, el.panelGain],
      gift: [el.tabGift, el.panelGift]
    };
    TABS.forEach(function (key) {
      var tab = map[key][0];
      var panel = map[key][1];
      var active = key === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
      panel.classList.toggle('is-active', active);
      if (active) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
    if (focus) map[name][0].focus();
    try {
      if (history.replaceState) history.replaceState(null, '', '#' + name);
    } catch (e) { /* file:// 등 */ }
    saveState();
  }

  function initTabs() {
    el.tabAcq.addEventListener('click', function () { setTab('acq'); });
    el.tabGain.addEventListener('click', function () { setTab('gain'); });
    el.tabGift.addEventListener('click', function () { setTab('gift'); });
    $$('.tabs .tab').forEach(function (tab) {
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var i = TABS.indexOf(state.tab);
        var next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i + TABS.length - 1) % TABS.length;
        setTab(TABS[next], true);
      });
    });
    $$('[data-goto]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        setTab(link.getAttribute('data-goto'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    var hash = (location.hash || '').replace('#', '');
    setTab(TABS.indexOf(hash) >= 0 ? hash : 'acq');
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function syncSegments(segment, active) {
    $$('.segmented[data-segment="' + segment + '"] button').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-value')) === Number(active));
    });
  }

  function syncChips(attr, value) {
    $$('.chips [data-' + attr + ']').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-' + attr)) === Number(value));
    });
  }

  function setInsight(node, html, tone) {
    node.className = 'insight' + (tone ? ' ' + tone : '');
    node.innerHTML = html;
  }

  function setBadgeTier(node, tier) {
    node.setAttribute('data-tier', String(tier));
  }

  /* ── 탭 1: 취득세 ────────────────────────────────────── */
  function acqInput() {
    var a = state.acq;
    return {
      price: a.price,
      houses: a.houses,
      adjust: a.adjust,
      over85: a.over85,
      temporary2: a.temp2,
      firstTime: a.first,
      firstTimeLimit: a.firstLimit
    };
  }

  function syncAcqForm() {
    var a = state.acq;
    el.acqPrice.value = String(Math.round(a.price));
    el.acqPriceBadge.textContent = wonShort(a.price);
    el.acqAdjust.checked = !!a.adjust;
    el.acqOver85.checked = !!a.over85;
    el.acqTemp2.checked = !!a.temp2;
    el.acqFirst.checked = !!a.first;
    syncSegments('acqhouses', a.houses);
    syncSegments('acqlimit', a.firstLimit);
    syncChips('acq-price', a.price);
  }

  function renderAcq() {
    var r = S.acquisition(acqInput());
    var regionLabel = r.adjust ? '조정대상지역' : '조정대상지역 아님';
    var areaLabel = r.over85 ? '85㎡ 초과' : '85㎡ 이하';

    el.acqTotal.textContent = won(r.total);
    el.acqSub.textContent = wonShort(r.price) + ' · ' + r.houses + '주택 · ' + regionLabel +
      ' · ' + areaLabel + ' · 세율 ' + percent(r.ratePct, 4);

    var tier = r.kind === 'base' ? 1 : (r.kind === 'mid8' ? 2 : 3);
    el.acqVerdict.textContent = r.kindLabel;
    setBadgeTier(el.acqVerdict, tier);

    var rows = '';
    rows += row('취득가액', won(r.price) + '원', '실거래가 기준');
    rows += row('적용 세율', percent(r.ratePct, 4), r.kindLabel);
    rows += row('취득세', won(r.acq) + '원', r.kind === 'base' ? '취득가액 × 세율' : '중과세율 적용');
    rows += row('지방교육세', '+' + won(r.edu) + '원', r.kind === 'base' ? '취득세의 10%' : '취득가액의 0.4%');
    rows += row('농어촌특별세', r.rural > 0 ? '+' + won(r.rural) + '원' : '0원',
      r.over85 ? (r.kind === 'base' ? '취득가액의 0.2%' : (r.kind === 'mid8' ? '취득가액의 0.6%' : '취득가액의 1.0%')) : '85㎡ 이하 비과세');
    if (r.reduction > 0) {
      rows += row('생애최초 감면', '-' + won(r.reduction) + '원', '취득세에서 공제(한도 ' + wonShort(r.firstTimeLimit) + ')');
    }
    rows += row('총 납부액', won(r.total) + '원', '취득세 + 지방교육세 + 농어촌특별세', 'total');
    el.acqRows.innerHTML = rows;

    el.acqTax.textContent = won(r.acq) + '원';
    el.acqEdu.textContent = won(r.edu) + '원';
    el.acqRural.textContent = won(r.rural) + '원';
    el.acqEffective.textContent = percent(r.effectiveRate, 2);

    var lines = [];
    if (r.valid) {
      if (r.kind === 'base') {
        lines.push('<strong>' + wonShort(r.price) + '</strong> 취득세는 <strong>' + wonShort(r.total) +
          '</strong>입니다. 기본세율 ' + percent(r.ratePct, 4) + '에 지방교육세' +
          (r.rural > 0 ? '와 농어촌특별세' : '') + '를 더한 금액이에요.');
      } else {
        lines.push('중과세율 <strong>' + percent(r.ratePct) + '</strong>가 적용되어 기본세율보다 <strong>' +
          won(r.total - S.acquisition({ price: r.price, houses: 1, adjust: false, over85: r.over85 }).total) +
          '원</strong> 더 냅니다.');
      }
      if (r.reduction > 0) {
        lines.push('생애최초 감면 <strong>' + won(r.reduction) + '원</strong>을 반영했습니다.');
      }
      if (r.total >= 10000000) {
        lines.push('취득일부터 <strong>60일 이내</strong>에 신고·납부해야 하고, 기한을 넘기면 가산세가 붙습니다.');
      }
    } else {
      lines.push('취득가액을 입력하면 세금이 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.acqInsight, lines.join(' '), r.kind === 'mid12' ? 'is-warn' : (r.kind === 'mid8' ? 'is-warn' : ''));

    var table = S.acquisitionTable({ price: r.price, adjust: r.adjust, over85: r.over85, temporary2: state.acq.temp2 });
    el.acqTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.houses === r.houses;
      var label = t.houses >= 4 ? '4주택 이상' : t.houses + '주택';
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + label + '</th>' +
        '<td>' + percent(t.rate * 100, 4) + '</td>' +
        '<td>' + won(t.acq) + '</td>' +
        '<td>' + won(t.edu) + '</td>' +
        '<td>' + won(t.rural) + '</td>' +
        '<td>' + won(t.total) + '</td></tr>';
    }).join('');

    var prices = S.acquisitionPriceTable({ over85: r.over85 });
    el.acqPriceTable.tBodies[0].innerHTML = prices.map(function (p) {
      var now = Math.abs(p.price - r.price) < 1 && r.houses === 1;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + wonShort(p.price) + '</th>' +
        '<td>' + percent(p.rate * 100, 4) + '</td>' +
        '<td>' + won(p.acq) + '</td>' +
        '<td>' + won(p.total) + '</td></tr>';
    }).join('');
  }

  function acqShareText() {
    var r = S.acquisition(acqInput());
    var lines = [
      '2026 취득세 모의 계산',
      '· 취득가액 ' + wonShort(r.price) + ' · ' + r.houses + '주택 · ' + (r.adjust ? '조정대상지역' : '조정대상지역 아님'),
      '· ' + (r.over85 ? '전용 85㎡ 초과' : '전용 85㎡ 이하') + ' · 세율 ' + percent(r.ratePct, 4),
      '· 취득세 ' + won(r.acq) + '원 · 지방교육세 ' + won(r.edu) + '원 · 농특세 ' + won(r.rural) + '원'
    ];
    if (r.reduction > 0) lines.push('· 생애최초 감면 -' + won(r.reduction) + '원');
    lines.push('· 총 납부액 ' + won(r.total) + '원');
    var url = shareUrl();
    if (url) lines.push('', '부동산 세금 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 2: 양도소득세 ────────────────────────────────── */
  function gainInput() {
    var g = state.gain;
    return {
      sale: g.sale,
      buy: g.buy,
      expenses: g.expenses,
      holdMonths: Math.round(g.holdY) * 12 + Math.round(g.holdM),
      liveMonths: Math.round(g.liveY) * 12 + Math.round(g.liveM),
      oneHouse: g.oneHouse,
      adjustAtBuy: g.adjustAtBuy
    };
  }

  function syncGainForm() {
    var g = state.gain;
    el.gainSale.value = String(Math.round(g.sale));
    el.gainBuy.value = String(Math.round(g.buy));
    el.gainExpense.value = String(Math.round(g.expenses));
    el.gainHoldY.value = String(Math.round(g.holdY));
    el.gainHoldM.value = String(Math.round(g.holdM));
    el.gainLiveY.value = String(Math.round(g.liveY));
    el.gainLiveM.value = String(Math.round(g.liveM));
    el.gainSaleBadge.textContent = wonShort(g.sale);
    el.gainBuyBadge.textContent = wonShort(g.buy);
    el.gainExpenseBadge.textContent = g.expenses > 0 ? wonShort(g.expenses) : '없음';
    el.gainHoldBadge.textContent = periodLabel(g.holdY, g.holdM);
    el.gainLiveBadge.textContent = periodLabel(g.liveY, g.liveM);
    el.gainOne.checked = !!g.oneHouse;
    el.gainAdjustBuy.checked = !!g.adjustAtBuy;
    syncChips('gain-sale', g.sale);
    syncChips('gain-buy', g.buy);
    syncChips('gain-expense', g.expenses);
    syncChips('gain-hold', Math.round(g.holdY) * 12 + Math.round(g.holdM));
  }

  function renderGain() {
    var r = S.transfer(gainInput());
    var holdText = periodLabel(r.holdYears, r.holdMonths % 12);
    var liveText = periodLabel(r.liveYears, r.liveMonths % 12);

    el.gainTotal.textContent = won(r.total);
    el.gainSub.textContent = wonShort(r.sale) + ' 양도 · 보유 ' + holdText + ' · 거주 ' + liveText +
      ' · ' + (r.oneHouse ? '1세대 1주택' : '다주택·기타');

    if (r.exempt) {
      el.gainVerdict.textContent = '비과세';
      setBadgeTier(el.gainVerdict, 1);
    } else if (r.ratio < 1) {
      el.gainVerdict.textContent = '고가주택 안분';
      setBadgeTier(el.gainVerdict, 2);
    } else if (r.holdMonths > 0 && r.holdMonths < 24) {
      el.gainVerdict.textContent = '단기 보유';
      setBadgeTier(el.gainVerdict, 3);
    } else {
      el.gainVerdict.textContent = '전액 과세';
      setBadgeTier(el.gainVerdict, 3);
    }

    var rows = '';
    rows += row('양도가액', won(r.sale) + '원', '실지거래가액');
    rows += row('취득가액 + 필요경비', '-' + won(r.buy + r.expenses) + '원', won(r.buy) + ' + ' + won(r.expenses));
    rows += row('양도차익', won(r.gain) + '원', '양도가 − 취득가 − 필요경비');
    if (r.ratio < 1) {
      rows += row('과세 대상 차익', won(r.taxedGain) + '원', '12억 초과분 ' + percent(r.ratio * 100, 2) + ' 안분');
    }
    if (!r.exempt) {
      rows += row('장기보유특별공제', '-' + won(r.deduction) + '원',
        '공제율 ' + percent(r.deductionRate) + (r.deductionTable === '2' ? ' (보유 ' + r.deductionOwnRate + '% + 거주 ' + r.deductionLiveRate + '%)' : ''));
      rows += row('기본공제', '-' + won(r.baseDeduction) + '원', '연 250만원');
      rows += row('과세표준', won(r.taxBase) + '원', '세율 ' + r.rateLabel);
      rows += row('양도소득세', won(r.tax) + '원', '과세표준 × 세율');
      rows += row('개인지방소득세', '+' + won(r.local) + '원', '양도소득세의 10%');
      rows += row('총 납부액', won(r.total) + '원', '양도소득세 + 지방소득세', 'total');
    } else {
      rows += row('총 납부액', '0원', '1세대 1주택 비과세', 'total');
    }
    el.gainRows.innerHTML = rows;

    el.gainProfit.textContent = won(r.gain) + '원';
    el.gainTaxed.textContent = won(r.taxedGain) + '원';
    el.gainDeduction.textContent = won(r.deduction) + '원';
    el.gainBase.textContent = won(r.taxBase) + '원';

    var lines = [];
    if (r.valid) {
      if (r.exempt) {
        lines.push('1세대 1주택 비과세 요건을 모두 채워 <strong>양도소득세가 0원</strong>입니다. 12억원까지는 팔아도 세금이 없습니다.');
      } else {
        lines.push('양도차익 <strong>' + wonShort(r.gain) + '</strong>에서 공제 <strong>' + wonShort(r.deduction) +
          '</strong>와 기본공제 250만원을 빼고, 과세표준 <strong>' + wonShort(r.taxBase) + '</strong>에 ' +
          r.rateLabel + '를 적용했습니다.');
        if (r.ratio < 1) {
          lines.push('12억원 초과분 ' + percent(r.ratio * 100, 2) + '만 과세하고, 장기보유특별공제도 같은 비율로 줄였습니다.');
        }
        if (r.deductionRate >= 80) {
          lines.push('10년 이상 보유·거주로 장기보유특별공제 <strong>80%</strong> 한도를 채웠습니다.');
        }
        if (r.tax > 0) {
          lines.push('양도일이 속한 달의 말일부터 <strong>2개월 이내</strong>에 예정신고해야 합니다.');
        }
      }
    } else {
      lines.push('양도가액을 입력하면 세금이 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.gainInsight, lines.join(' '), r.exempt ? 'is-ok' : (r.ratio < 1 ? '' : 'is-warn'));

    var table = S.transferTable(gainInput());
    el.gainTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.liveMonths === r.liveMonths;
      var label = t.liveMonths === 0 ? '거주 없음' : (t.liveMonths / 12) + '년';
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + label + '</th>' +
        '<td>' + percent(t.deductionRate) + '</td>' +
        '<td>' + won(t.taxBase) + '</td>' +
        '<td>' + (t.exempt ? '비과세' : won(t.total)) + '</td></tr>';
    }).join('');
  }

  function gainShareText() {
    var r = S.transfer(gainInput());
    var lines = [
      '2026 양도소득세 모의 계산',
      '· 양도 ' + wonShort(r.sale) + ' · 취득 ' + wonShort(r.buy) + ' · 필요경비 ' + wonShort(r.expenses),
      '· 보유 ' + r.holdMonths + '개월 · 거주 ' + r.liveMonths + '개월 · ' + (r.oneHouse ? '1세대 1주택' : '다주택')
    ];
    if (r.exempt) {
      lines.push('· 1세대 1주택 비과세 (12억원 이하) → 0원');
    } else {
      if (r.ratio < 1) lines.push('· 과세 대상 차익 ' + won(Math.round(r.taxedGain)) + '원 (12억 초과분 안분)');
      lines.push('· 장특공 ' + percent(r.deductionRate) + ' (' + won(Math.round(r.deduction)) + '원)');
      lines.push('· 과세표준 ' + won(Math.round(r.taxBase)) + '원 → 양도세 ' + won(r.tax) + '원 + 지방세 ' + won(r.local) + '원');
      lines.push('· 총 납부액 ' + won(r.total) + '원');
    }
    var url = shareUrl();
    if (url) lines.push('', '부동산 세금 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 3: 증여세 ────────────────────────────────────── */
  function giftInput() {
    var g = state.gift;
    return {
      amount: g.amount,
      relation: g.relation,
      marriage: g.marriage,
      priorUsed: g.used,
      skipGeneration: g.skip,
      reportCredit: g.credit
    };
  }

  function syncGiftForm() {
    var g = state.gift;
    el.giftAmount.value = String(Math.round(g.amount));
    el.giftAmountBadge.textContent = wonShort(g.amount);
    el.giftRelation.value = g.relation;
    el.giftMarriage.checked = !!g.marriage;
    el.giftSkip.checked = !!g.skip;
    el.giftCredit.checked = !!g.credit;
    el.giftUsed.value = String(Math.round(g.used));
    el.giftUsedBadge.textContent = g.used > 0 ? wonShort(g.used) : '없음';
    syncChips('gift-amount', g.amount);
    syncChips('gift-used', g.used);
  }

  function renderGift() {
    var r = S.gift(giftInput());
    el.giftPayable.textContent = won(r.payable);
    el.giftSub.textContent = wonShort(r.amount) + ' · ' + r.relationLabel + ' · 공제 ' + wonShort(r.baseDeduction + r.extraDeduction);

    if (r.payable === 0) {
      el.giftVerdict.textContent = r.amount > 0 ? '세금 없음' : '계산 중';
      setBadgeTier(el.giftVerdict, 1);
    } else if (r.rate <= 0.20) {
      el.giftVerdict.textContent = '10~20% 구간';
      setBadgeTier(el.giftVerdict, 2);
    } else {
      el.giftVerdict.textContent = r.rate <= 0.30 ? '30% 구간' : '40~50% 구간';
      setBadgeTier(el.giftVerdict, 3);
    }

    var rows = '';
    rows += row('증여재산가액', won(r.amount) + '원', '시가 또는 기준시가');
    rows += row('증여재산공제', '-' + won(r.baseDeduction) + '원', r.relationLabel + ' 한도 ' + wonShort(r.baseLimit));
    if (r.extraDeduction > 0) {
      rows += row('혼인·출산 공제', '-' + won(r.extraDeduction) + '원', '직계존속 증여 · 합산 1억원 한도');
    }
    rows += row('과세표준', won(r.taxBase) + '원', r.taxBase > 0 ? '세율 ' + r.marginalLabel : '과세최저한 미만');
    if (r.tax > 0) {
      rows += row('산출세액', won(r.tax) + '원', '과세표준 × ' + r.marginalLabel + ' − 누진공제');
    }
    if (r.surcharge > 0) {
      rows += row('세대생략 할증', '+' + won(r.surcharge) + '원', Math.round(r.surchargeRate * 100) + '% 가산');
    }
    if (r.credit > 0) {
      rows += row('신고세액공제', '-' + won(r.credit) + '원', '기한 내 신고 3%');
    }
    rows += row('납부할 세액', won(r.payable) + '원', '산출세액 + 할증 − 신고공제', 'total');
    el.giftRows.innerHTML = rows;

    el.giftDeduction.textContent = won(r.baseDeduction + r.extraDeduction) + '원';
    el.giftBase.textContent = won(r.taxBase) + '원';
    el.giftTax.textContent = won(r.tax) + '원';
    el.giftEffective.textContent = percent(r.effectiveRate, 2);

    var lines = [];
    if (r.valid) {
      if (r.payable === 0) {
        lines.push('공제 한도 안이라 <strong>낼 증여세가 없습니다</strong>. 다만 공제 한도를 넘지 않아도 증여 사실은 10년 합산 대상이니 기억해 두세요.');
      } else {
        lines.push('<strong>' + wonShort(r.amount) + '</strong>을 증여받으면 공제 <strong>' + wonShort(r.baseDeduction + r.extraDeduction) +
          '</strong>를 빼고 <strong>' + wonShort(r.taxBase) + '</strong>에 세금을 매겨 <strong>' + won(r.payable) +
          '원</strong>을 냅니다. 실효세율은 ' + percent(r.effectiveRate, 2) + '입니다.');
        lines.push('증여일이 속한 달의 말일부터 <strong>3개월 이내</strong>에 신고하면 3%를 공제받고, 무신고 시 20% 가산세가 붙습니다.');
      }
    } else {
      lines.push('증여재산가액을 입력하면 세금이 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.giftInsight, lines.join(' '), r.payable === 0 ? 'is-ok' : (r.rate >= 0.30 ? 'is-warn' : ''));

    var table = S.giftTable(giftInput());
    el.giftTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.amount === r.amount;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + wonShort(t.amount) + '</th>' +
        '<td>' + won(t.taxBase) + '</td>' +
        '<td>' + won(t.tax + t.surcharge) + '</td>' +
        '<td>' + won(t.payable) + '</td></tr>';
    }).join('');
  }

  function giftShareText() {
    var r = S.gift(giftInput());
    var lines = [
      '2026 증여세 모의 계산',
      '· 증여재산가액 ' + wonShort(r.amount) + ' · ' + r.relationLabel,
      '· 증여재산공제 ' + won(r.baseDeduction) + '원' + (r.extraDeduction > 0 ? ' + 혼인·출산 공제 ' + won(r.extraDeduction) + '원' : ''),
      '· 과세표준 ' + won(r.taxBase) + '원 · 산출세액 ' + won(r.tax) + '원'
    ];
    if (r.surcharge > 0) lines.push('· 세대생략 할증 ' + won(r.surcharge) + '원');
    if (r.credit > 0) lines.push('· 신고세액공제 -' + won(r.credit) + '원');
    lines.push('· 납부할 세액 ' + won(r.payable) + '원');
    var url = shareUrl();
    if (url) lines.push('', '부동산 세금 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 공유 ─────────────────────────────────────────────── */
  function shareUrl() {
    return (CFG.siteUrl || '').replace(/\/$/, '') + '/';
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
  function toast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-visible');
    }, 2600);
  }

  function doShare(text) {
    copyText(text).then(function () {
      toast('결과를 복사했어요. 붙여넣기 해 보세요.');
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
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070c16' : '#eef2f8');
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
    if (document.querySelector('script[src*="adsbygoogle.js"]')) {
      live.forEach(function (ins) {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 광고 차단 등 */ }
      });
      return;
    }
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

  /* ── 제휴 카드 ────────────────────────────────────────── */
  function initPromo() {
    var coupang = CFG.coupang || {};
    var items = (coupang.items || []).filter(function (it) { return it && it.url; });
    if (!items.length) {
      el.promoSection.hidden = true;
      return;
    }
    el.promoSection.hidden = false;
    el.promoHeading.textContent = coupang.heading || '세금 내고 남은 돈, 겨울 고정비부터';
    el.promoSub.textContent = coupang.subheading || '';
    var disclosure = coupang.disclosure || '쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
    el.promoDisclosure.textContent = disclosure;
    el.footerDisclosure.textContent = disclosure;
    el.footerDisclosure.hidden = false;
    el.promoList.innerHTML = items.map(function (it) {
      return '<div class="promo-item">' +
        '<span class="promo-thumb" aria-hidden="true">' + (it.emoji || '🧾') + '</span>' +
        '<div class="promo-body">' +
        '<p class="promo-name">' + it.name + '</p>' +
        '<p class="promo-meta">' + (it.tag || '') + '</p>' +
        '</div>' +
        '<a class="promo-cta" href="' + it.url + '" target="_blank" rel="sponsored nofollow noopener">' +
        (it.cta || '쿠팡에서 보기') + '</a></div>';
    }).join('');
  }

  /* ── PWA ──────────────────────────────────────────────── */
  function initInstall() {
    var deferred = null;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isIOS && !standalone) {
      el.installBtn.hidden = false;
      el.installBtn.addEventListener('click', function () {
        toast('Safari 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 열려요.');
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
              toast('새 버전이 준비됐어요. 새로고침하면 적용됩니다.');
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
  function bindAcqEvents() {
    el.acqPrice.addEventListener('input', function () {
      state.acq.price = readNum(el.acqPrice, 0, 0, 50000000000);
      syncChips('acq-price', state.acq.price);
      refresh();
    });
    $$('.chips [data-acq-price]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.acq.price = Number(b.getAttribute('data-acq-price'));
        el.acqPrice.value = String(state.acq.price);
        syncChips('acq-price', state.acq.price);
        refresh();
      });
    });
    $$('.segmented[data-segment="acqhouses"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.acq.houses = Number(b.getAttribute('data-value'));
        syncSegments('acqhouses', state.acq.houses);
        refresh();
      });
    });
    $$('.segmented[data-segment="acqlimit"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.acq.firstLimit = Number(b.getAttribute('data-value'));
        syncSegments('acqlimit', state.acq.firstLimit);
        refresh();
      });
    });
    [['acqAdjust', 'adjust'], ['acqOver85', 'over85'], ['acqTemp2', 'temp2'], ['acqFirst', 'first']].forEach(function (pair) {
      el[pair[0]].addEventListener('change', function () {
        state.acq[pair[1]] = el[pair[0]].checked;
        if (pair[1] === 'first') setTab('acq');
        refresh();
      });
    });
    el.shareAcq.addEventListener('click', function () { doShare(acqShareText()); });
  }

  function bindGainEvents() {
    [['gainSale', 'sale', 0, 50000000000], ['gainBuy', 'buy', 0, 50000000000],
     ['gainExpense', 'expenses', 0, 10000000000]].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state.gain[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2], cfg[3]);
        syncChips('gain-' + (cfg[1] === 'expenses' ? 'expense' : cfg[1]), state.gain[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-gain-sale]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gain.sale = Number(b.getAttribute('data-gain-sale'));
        el.gainSale.value = String(state.gain.sale);
        syncChips('gain-sale', state.gain.sale);
        refresh();
      });
    });
    $$('.chips [data-gain-buy]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gain.buy = Number(b.getAttribute('data-gain-buy'));
        el.gainBuy.value = String(state.gain.buy);
        syncChips('gain-buy', state.gain.buy);
        refresh();
      });
    });
    $$('.chips [data-gain-expense]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gain.expenses = Number(b.getAttribute('data-gain-expense'));
        el.gainExpense.value = String(state.gain.expenses);
        syncChips('gain-expense', state.gain.expenses);
        refresh();
      });
    });
    [['gainHoldY', 'holdY'], ['gainHoldM', 'holdM'], ['gainLiveY', 'liveY'], ['gainLiveM', 'liveM']].forEach(function (pair) {
      el[pair[0]].addEventListener('input', function () {
        var max = pair[1].indexOf('M') >= 0 ? 11 : 100;
        state.gain[pair[1]] = readNum(el[pair[0]], 0, 0, max);
        refresh();
      });
    });
    $$('.chips [data-gain-hold]').forEach(function (b) {
      b.addEventListener('click', function () {
        var months = Number(b.getAttribute('data-gain-hold'));
        state.gain.holdY = Math.floor(months / 12);
        state.gain.holdM = months % 12;
        refresh();
      });
    });
    el.gainOne.addEventListener('change', function () {
      state.gain.oneHouse = el.gainOne.checked;
      refresh();
    });
    el.gainAdjustBuy.addEventListener('change', function () {
      state.gain.adjustAtBuy = el.gainAdjustBuy.checked;
      refresh();
    });
    el.shareGain.addEventListener('click', function () { doShare(gainShareText()); });
  }

  function bindGiftEvents() {
    el.giftAmount.addEventListener('input', function () {
      state.gift.amount = readNum(el.giftAmount, 0, 0, 50000000000);
      syncChips('gift-amount', state.gift.amount);
      refresh();
    });
    $$('.chips [data-gift-amount]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gift.amount = Number(b.getAttribute('data-gift-amount'));
        el.giftAmount.value = String(state.gift.amount);
        syncChips('gift-amount', state.gift.amount);
        refresh();
      });
    });
    el.giftRelation.addEventListener('change', function () {
      state.gift.relation = S.GIFT_RELATION[el.giftRelation.value] ? el.giftRelation.value : 'parent';
      refresh();
    });
    [['giftMarriage', 'marriage'], ['giftSkip', 'skip'], ['giftCredit', 'credit']].forEach(function (pair) {
      el[pair[0]].addEventListener('change', function () {
        state.gift[pair[1]] = el[pair[0]].checked;
        refresh();
      });
    });
    el.giftUsed.addEventListener('input', function () {
      state.gift.used = readNum(el.giftUsed, 0, 0, 600000000);
      syncChips('gift-used', state.gift.used);
      refresh();
    });
    $$('.chips [data-gift-used]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gift.used = Number(b.getAttribute('data-gift-used'));
        el.giftUsed.value = String(state.gift.used);
        syncChips('gift-used', state.gift.used);
        refresh();
      });
    });
    el.shareGift.addEventListener('click', function () { doShare(giftShareText()); });
  }

  function refresh() {
    syncAcqForm();
    syncGainForm();
    syncGiftForm();
    renderAcq();
    renderGain();
    renderGift();
    saveState();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = S.DATA_DATE;
    el.dataDate.setAttribute('datetime', S.DATA_DATE);

    bindAcqEvents();
    bindGainEvents();
    bindGiftEvents();
    initTabs();
    initTheme();
    initAds();
    initPromo();
    initInstall();
    initSW();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
