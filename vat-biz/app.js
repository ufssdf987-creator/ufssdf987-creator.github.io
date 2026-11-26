/*!
 * app.js — 2026 부가가치세(일반·간이과세)·노란우산공제 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.VatBizCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'vtz.state.v1';
  var THEME_KEY = 'vtz.theme';
  var TABS = ['gen', 'sim', 'cmp', 'yel'];

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
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s + '%';
  }

  function readNum(input, fallback, min, max) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    return clamp(v, min, max);
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'gen',
    gen: { sales: 100000000, purchases: 60000000, nonDeductible: 0 },
    sim: { industry: 'retail', sales: 70000000, purchases: 20000000, priorYear: 80000000, rental: false },
    cmp: { industry: 'retail', sales: 100000000, purchases: 40000000 },
    yel: { income: 50000000, payment: 5000000, taxBase: 40000000, rental: 0 }
  };

  var MONEY_MAX = S.LIMITS.money.max;

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var g = raw.gen;
    if (g && typeof g === 'object') {
      ['sales', 'purchases', 'nonDeductible'].forEach(function (k) {
        var v = parseFloat(g[k]);
        if (isFinite(v) && v >= 0) state.gen[k] = clamp(v, 0, MONEY_MAX);
      });
    }

    var s = raw.sim;
    if (s && typeof s === 'object') {
      if (S.INDUSTRIES[s.industry]) state.sim.industry = s.industry;
      ['sales', 'purchases', 'priorYear'].forEach(function (k) {
        var v = parseFloat(s[k]);
        if (isFinite(v) && v >= 0) state.sim[k] = clamp(v, 0, MONEY_MAX);
      });
      if (typeof s.rental === 'boolean') state.sim.rental = s.rental;
    }

    var c = raw.cmp;
    if (c && typeof c === 'object') {
      if (S.INDUSTRIES[c.industry]) state.cmp.industry = c.industry;
      ['sales', 'purchases'].forEach(function (k) {
        var v = parseFloat(c[k]);
        if (isFinite(v) && v >= 0) state.cmp[k] = clamp(v, 0, MONEY_MAX);
      });
    }

    var y = raw.yel;
    if (y && typeof y === 'object') {
      var limits = { income: S.LIMITS.income.max, payment: S.LIMITS.payment.max, taxBase: S.LIMITS.taxBase.max, rental: S.LIMITS.income.max };
      ['income', 'payment', 'taxBase', 'rental'].forEach(function (k) {
        var v = parseFloat(y[k]);
        if (isFinite(v) && v >= 0) state.yel[k] = clamp(v, 0, limits[k]);
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
    el.tabGen = $('#tabGen');
    el.tabSim = $('#tabSim');
    el.tabCmp = $('#tabCmp');
    el.tabYel = $('#tabYel');
    el.panelGen = $('#panelGen');
    el.panelSim = $('#panelSim');
    el.panelCmp = $('#panelCmp');
    el.panelYel = $('#panelYel');

    el.genSales = $('#genSales');
    el.genSalesBadge = $('#genSalesBadge');
    el.genBuy = $('#genBuy');
    el.genBuyBadge = $('#genBuyBadge');
    el.genNonDeduct = $('#genNonDeduct');
    el.genNonDeductBadge = $('#genNonDeductBadge');
    el.genAmountLabel = $('#genAmountLabel');
    el.genTotal = $('#genTotal');
    el.genSub = $('#genSub');
    el.genVerdict = $('#genVerdict');
    el.genRows = $('#genRows');
    el.genSaleTax = $('#genSaleTax');
    el.genDeductible = $('#genDeductible');
    el.genNet = $('#genNet');
    el.genEffective = $('#genEffective');
    el.genInsight = $('#genInsight');
    el.genTable = $('#genTable');
    el.shareGen = $('#shareGen');

    el.simIndustry = $('#simIndustry');
    el.simSales = $('#simSales');
    el.simSalesBadge = $('#simSalesBadge');
    el.simBuy = $('#simBuy');
    el.simBuyBadge = $('#simBuyBadge');
    el.simPrior = $('#simPrior');
    el.simPriorBadge = $('#simPriorBadge');
    el.simRental = $('#simRental');
    el.simEligible = $('#simEligible');
    el.simInvoice = $('#simInvoice');
    el.simExempt = $('#simExempt');
    el.simRate = $('#simRate');
    el.simStatusNote = $('#simStatusNote');
    el.simTotal = $('#simTotal');
    el.simSub = $('#simSub');
    el.simVerdict = $('#simVerdict');
    el.simRows = $('#simRows');
    el.simBase = $('#simBase');
    el.simGross = $('#simGross');
    el.simCredit = $('#simCredit');
    el.simEffective = $('#simEffective');
    el.simInsight = $('#simInsight');
    el.simTable = $('#simTable');
    el.shareSim = $('#shareSim');

    el.cmpIndustry = $('#cmpIndustry');
    el.cmpSales = $('#cmpSales');
    el.cmpSalesBadge = $('#cmpSalesBadge');
    el.cmpBuy = $('#cmpBuy');
    el.cmpBuyBadge = $('#cmpBuyBadge');
    el.cmpSaving = $('#cmpSaving');
    el.cmpSub = $('#cmpSub');
    el.cmpVerdict = $('#cmpVerdict');
    el.cmpRows = $('#cmpRows');
    el.cmpGeneral = $('#cmpGeneral');
    el.cmpSimple = $('#cmpSimple');
    el.cmpDiff = $('#cmpDiff');
    el.cmpCrossover = $('#cmpCrossover');
    el.cmpInsight = $('#cmpInsight');
    el.cmpTable = $('#cmpTable');
    el.shareCmp = $('#shareCmp');

    el.yelIncome = $('#yelIncome');
    el.yelIncomeBadge = $('#yelIncomeBadge');
    el.yelPayment = $('#yelPayment');
    el.yelPaymentBadge = $('#yelPaymentBadge');
    el.yelTaxBase = $('#yelTaxBase');
    el.yelTaxBaseBadge = $('#yelTaxBaseBadge');
    el.yelRental = $('#yelRental');
    el.yelRentalBadge = $('#yelRentalBadge');
    el.yelTotal = $('#yelTotal');
    el.yelSub = $('#yelSub');
    el.yelVerdict = $('#yelVerdict');
    el.yelRows = $('#yelRows');
    el.yelLimit = $('#yelLimit');
    el.yelDeduction = $('#yelDeduction');
    el.yelSaving = $('#yelSaving');
    el.yelNetCost = $('#yelNetCost');
    el.yelInsight = $('#yelInsight');
    el.yelTable = $('#yelTable');
    el.shareYel = $('#shareYel');

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
    if (TABS.indexOf(name) < 0) name = 'gen';
    state.tab = name;
    var map = {
      gen: [el.tabGen, el.panelGen],
      sim: [el.tabSim, el.panelSim],
      cmp: [el.tabCmp, el.panelCmp],
      yel: [el.tabYel, el.panelYel]
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
    el.tabGen.addEventListener('click', function () { setTab('gen'); });
    el.tabSim.addEventListener('click', function () { setTab('sim'); });
    el.tabCmp.addEventListener('click', function () { setTab('cmp'); });
    el.tabYel.addEventListener('click', function () { setTab('yel'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : 'gen');
    window.addEventListener('hashchange', function () {
      var next = (location.hash || '').replace('#', '');
      if (TABS.indexOf(next) >= 0 && next !== state.tab) setTab(next);
    });
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
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

  /* ── 탭 1: 일반과세 ─────────────────────────────────── */
  function genInput() {
    var g = state.gen;
    return { sales: g.sales, purchases: g.purchases, nonDeductible: g.nonDeductible };
  }

  function syncGenForm() {
    var g = state.gen;
    el.genSales.value = String(Math.round(g.sales));
    el.genBuy.value = String(Math.round(g.purchases));
    el.genNonDeduct.value = String(Math.round(g.nonDeductible));
    el.genSalesBadge.textContent = wonShort(g.sales);
    el.genBuyBadge.textContent = g.purchases > 0 ? wonShort(g.purchases) : '없음';
    el.genNonDeductBadge.textContent = g.nonDeductible > 0 ? wonShort(g.nonDeductible) : '없음';
    syncChips('gen-sales', g.sales);
    syncChips('gen-buy', g.purchases);
    syncChips('gen-non', g.nonDeductible);
  }

  function renderGen() {
    var r = S.general(genInput());
    var isRefund = r.refund > 0;

    el.genAmountLabel.textContent = isRefund ? '이번 과세기간 환급·이월 예상액' : '이번 과세기간 납부할 부가가치세';
    el.genTotal.textContent = won(isRefund ? r.refund : r.payable);
    el.genSub.textContent = '매출 ' + wonShort(r.sales) + ' · 매입 ' + wonShort(r.purchases) +
      ' · 매입 비중 ' + percent(r.purchaseRatio * 100, 1);

    if (!r.valid) {
      el.genVerdict.textContent = '계산 중';
      setBadgeTier(el.genVerdict, 2);
    } else if (isRefund) {
      el.genVerdict.textContent = '환급 · 이월';
      setBadgeTier(el.genVerdict, 1);
    } else if (r.payable === 0) {
      el.genVerdict.textContent = '낼 세금 없음';
      setBadgeTier(el.genVerdict, 1);
    } else if (r.effectiveRate >= 8) {
      el.genVerdict.textContent = '부담 큼';
      setBadgeTier(el.genVerdict, 3);
    } else {
      el.genVerdict.textContent = '납부';
      setBadgeTier(el.genVerdict, 2);
    }

    var rows = '';
    rows += row('매출 공급가액', won(r.sales) + '원', '부가세 제외');
    rows += row('매출세액', won(r.saleTax) + '원', '공급가액 × 10%');
    rows += row('매입 공급가액', won(r.purchases) + '원', '세금계산서 등 증빙분');
    rows += row('매입세액', won(r.purchaseTax) + '원', '공급가액 × 10%');
    if (r.nonDeductible > 0) {
      rows += row('불공제 매입세액', '-' + won(r.nonDeductible) + '원', '접대비·승용차 등 제39조');
    }
    rows += row('공제 매입세액', '-' + won(r.deductible) + '원', '매입세액 − 불공제');
    rows += row(isRefund ? '환급·이월 예상' : '납부세액', won(isRefund ? r.refund : r.payable) + '원',
      isRefund ? '매입세액이 매출세액보다 큼' : '매출세액 − 공제 매입세액', 'total');
    el.genRows.innerHTML = rows;

    el.genSaleTax.textContent = won(r.saleTax) + '원';
    el.genDeductible.textContent = won(r.deductible) + '원';
    el.genNet.textContent = won(r.payable) + '원';
    el.genEffective.textContent = percent(r.effectiveRate, 2);

    var lines = [];
    if (r.valid) {
      if (isRefund) {
        lines.push('매입세액이 매출세액보다 <strong>' + won(r.refund) + '원</strong> 많습니다. ' +
          '다음 과세기간으로 이월되거나, 수출·시설투자 등 요건을 갖추면 조기환급을 신청할 수 있습니다.');
      } else {
        lines.push('매출세액 <strong>' + won(r.saleTax) + '원</strong>에서 매입세액 공제 <strong>' +
          won(r.deductible) + '원</strong>을 빼서 <strong>' + won(r.payable) + '원</strong>을 냅니다. ' +
          '매출의 ' + percent(r.effectiveRate, 2) + '입니다.');
        if (r.purchaseRatio >= 0.5) {
          lines.push('매입 비중이 ' + percent(r.purchaseRatio * 100, 1) + '로 높아 부가세 부담이 절반 이하로 줄었습니다.');
        }
        lines.push('1기(1~6월)는 7월 27일, 2기(7~12월)는 2027년 1월 25일까지 신고·납부합니다.');
      }
    } else {
      lines.push('매출 공급가액을 입력하면 납부할 부가세가 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.genInsight, lines.join(' '), isRefund ? 'is-ok' : (r.effectiveRate >= 8 ? 'is-warn' : ''));

    var table = S.generalTable({ sales: r.sales, nonDeductible: r.nonDeductible });
    el.genTable.tBodies[0].innerHTML = table.map(function (t) {
      var cls = Math.abs(t.purchases - r.purchases) < 1 ? ' class="is-now"' : '';
      var value = t.refund > 0 ? '환급 ' + won(t.refund) : won(t.payable);
      return '<tr' + cls + '><th scope="row">' + percent(t.ratio * 100, 0) + '</th>' +
        '<td>' + won(t.purchases * 0.1) + '</td>' +
        '<td>' + won(t.deductible) + '</td>' +
        '<td>' + value + '</td></tr>';
    }).join('');
  }

  function genShareText() {
    var r = S.general(genInput());
    var lines = [
      '2026 부가가치세 모의 계산(일반과세)',
      '· 매출 공급가액 ' + won(r.sales) + '원 · 매입 공급가액 ' + won(r.purchases) + '원',
      '· 매출세액 ' + won(r.saleTax) + '원 − 공제 매입세액 ' + won(r.deductible) + '원'
    ];
    if (r.refund > 0) lines.push('· 환급·이월 예상 ' + won(r.refund) + '원');
    else lines.push('· 납부세액 ' + won(r.payable) + '원 (매출의 ' + percent(r.effectiveRate, 2) + ')');
    var url = shareUrl();
    if (url) lines.push('', '부가가치세·노란우산 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 2: 간이과세 ─────────────────────────────────── */
  function simInput() {
    var s = state.sim;
    return {
      industry: s.industry,
      sales: s.sales,
      purchases: s.purchases,
      priorYear: s.priorYear,
      rental: s.rental
    };
  }

  function syncSimForm() {
    var s = state.sim;
    el.simIndustry.value = s.industry;
    el.simSales.value = String(Math.round(s.sales));
    el.simBuy.value = String(Math.round(s.purchases));
    el.simPrior.value = String(Math.round(s.priorYear));
    el.simSalesBadge.textContent = wonShort(s.sales);
    el.simBuyBadge.textContent = s.purchases > 0 ? wonShort(s.purchases) : '없음';
    el.simPriorBadge.textContent = s.priorYear > 0 ? wonShort(s.priorYear) : '신규';
    el.simRental.checked = !!s.rental;
    syncChips('sim-sales', s.sales);
    syncChips('sim-buy', s.purchases);
    syncChips('sim-prior', s.priorYear);
  }

  function renderSim() {
    var r = S.simple(simInput());

    el.simTotal.textContent = won(r.payable);
    el.simSub.textContent = '공급대가 ' + wonShort(r.sales) + ' · ' + r.industryLabel +
      ' ' + percent(r.rate * 100, 0) + ' · 실효 ' + percent(r.effectiveRate, 2);

    if (!r.valid) {
      el.simVerdict.textContent = '계산 중';
      setBadgeTier(el.simVerdict, 2);
    } else if (!r.simpleEligible) {
      el.simVerdict.textContent = '일반과세 전환';
      setBadgeTier(el.simVerdict, 3);
    } else if (r.exempt) {
      el.simVerdict.textContent = '납부면제';
      setBadgeTier(el.simVerdict, 1);
    } else {
      el.simVerdict.textContent = '납부';
      setBadgeTier(el.simVerdict, 2);
    }

    var rows = '';
    rows += row('과세표준(공급대가)', won(r.sales) + '원', '부가세 포함 매출');
    rows += row('업종 부가가치율', percent(r.rate * 100, 0), r.industryLabel);
    rows += row('매출세액', won(r.grossTax) + '원', '공급대가 × ' + percent(r.rate * 100, 0) + ' × 10%');
    rows += row('매입 공제', '-' + won(r.credit) + '원', '세금계산서 받은 공급대가 × 0.5%');
    if (r.exempt) {
      rows += row('납부면제', '-' + won(r.taxBeforeExempt) + '원', '공급대가 4,800만원 미만');
    }
    rows += row('납부세액', won(r.payable) + '원',
      r.exempt ? '납부만 면제 · 신고는 필요' : '매출세액 − 매입 공제', 'total');
    el.simRows.innerHTML = rows;

    el.simBase.textContent = won(r.sales) + '원';
    el.simGross.textContent = won(r.grossTax) + '원';
    el.simCredit.textContent = won(r.credit) + '원';
    el.simEffective.textContent = percent(r.effectiveRate, 2);

    el.simEligible.textContent = r.simpleEligible ? '대상' : '대상 아님';
    el.simInvoice.textContent = r.invoiceRequired ? '발급 가능' : '발급 불가';
    el.simExempt.textContent = r.exempt ? '면제' : '있음';
    el.simRate.textContent = percent(r.rate * 100, 0);

    var statusNote;
    if (!r.simpleEligible) {
      statusNote = '직전연도 공급대가 ' + wonShort(r.priorYear) + '은 간이과세 기준 ' +
        wonShort(r.eligibleThreshold) + ' 이상이라 7월 1일부터 일반과세자입니다. 간이과세 계산은 참고용으로만 보세요.';
    } else if (r.exempt) {
      statusNote = '이번 과세기간 공급대가가 4,800만원 미만이라 <strong>납부의무가 면제</strong>됩니다. ' +
        '낼 세금은 없지만 2027년 1월 25일까지 확정신고와 합계표 제출은 해야 합니다.';
    } else if (!r.invoiceRequired) {
      statusNote = '간이과세 대상이지만 직전연도 공급대가가 4,800만원 미만이라 <strong>세금계산서를 발급할 수 없습니다</strong>. ' +
        '사업자 거래처가 세금계산서를 요구하면 일반과세로 전환해야 합니다.';
    } else {
      statusNote = '간이과세 대상이고 <strong>세금계산서 발급의무</strong>가 있습니다. ' +
        '상반기에 세금계산서를 발급했다면 7월 27일까지 예정신고하고, 2027년 1월 25일까지 확정신고합니다.';
    }
    setInsight(el.simStatusNote, statusNote, !r.simpleEligible ? 'is-warn' : (r.exempt ? 'is-ok' : ''));

    var lines = [];
    if (r.valid) {
      if (r.exempt) {
        lines.push('공급대가 ' + wonShort(r.sales) + '은 납부면제 기준(4,800만원) 미만입니다. ' +
          '납부할 부가세는 0원이지만 신고 의무는 남습니다.');
      } else {
        lines.push('공급대가 <strong>' + won(r.sales) + '원</strong>에 부가가치율 <strong>' +
          percent(r.rate * 100, 0) + '</strong>와 10%를 곱해 매출세액 <strong>' + won(r.grossTax) +
          '원</strong>이 나오고, 매입 공제 ' + won(r.credit) + '원을 빼서 <strong>' +
          won(r.payable) + '원</strong>을 냅니다.');
        lines.push('명목 실효세율은 <strong>' + percent(r.nominalRate, 1) + '</strong>이고, ' +
          '이번 계산의 실제 부담률은 ' + percent(r.effectiveRate, 2) + '입니다.');
      }
    } else {
      lines.push('연 매출(공급대가)을 입력하면 간이과세 부가세가 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.simInsight, lines.join(' '), r.exempt ? 'is-ok' : (!r.simpleEligible ? 'is-warn' : ''));

    var table = S.simpleTable({ sales: r.sales, purchases: r.purchases, priorYear: r.priorYear, rental: r.rental });
    el.simTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.industry === r.industry;
      var value = t.exempt ? '면제' : won(t.payable);
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + S.INDUSTRIES[t.industry].short + '</th>' +
        '<td>' + percent(t.rate * 100, 0) + '</td>' +
        '<td>' + won(t.grossTax) + '</td>' +
        '<td>' + value + '</td></tr>';
    }).join('');
  }

  function simShareText() {
    var r = S.simple(simInput());
    var lines = [
      '2026 간이과세 부가세 모의 계산',
      '· 업종 ' + r.industryLabel + ' (부가가치율 ' + percent(r.rate * 100, 0) + ')',
      '· 연 매출(공급대가) ' + won(r.sales) + '원 · 세금계산서 매입 ' + won(r.purchases) + '원'
    ];
    if (r.exempt) lines.push('· 공급대가 4,800만원 미만 → 납부면제(신고는 필요)');
    else lines.push('· 매출세액 ' + won(r.grossTax) + '원 − 매입 공제 ' + won(r.credit) + '원 = 납부 ' + won(r.payable) + '원');
    lines.push('· 과세유형: ' + (r.simpleEligible ? '간이과세 대상' : '간이과세 대상 아님(일반과세)') +
      ' · 세금계산서 ' + (r.invoiceRequired ? '발급 가능' : '발급 불가'));
    var url = shareUrl();
    if (url) lines.push('', '부가가치세·노란우산 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 3: 간이 vs 일반 ──────────────────────────────── */
  function cmpInput() {
    var c = state.cmp;
    return { industry: c.industry, sales: c.sales, purchases: c.purchases };
  }

  function syncCmpForm() {
    var c = state.cmp;
    el.cmpIndustry.value = c.industry;
    el.cmpSales.value = String(Math.round(c.sales));
    el.cmpBuy.value = String(Math.round(c.purchases));
    el.cmpSalesBadge.textContent = wonShort(c.sales);
    el.cmpBuyBadge.textContent = c.purchases > 0 ? wonShort(c.purchases) : '없음';
    syncChips('cmp-sales', c.sales);
    syncChips('cmp-buy', c.purchases);
  }

  function renderCmp() {
    var r = S.compare(cmpInput());
    var name = r.better === 'simple' ? '간이과세' : (r.better === 'general' ? '일반과세' : '두 제도');

    el.cmpSaving.textContent = won(r.savings);
    el.cmpSub.textContent = '일반 ' + (r.generalRefund > 0 ? '환급 ' : '') +
      wonShort(r.generalRefund > 0 ? r.generalRefund : r.generalPayable) + ' vs 간이 ' + wonShort(r.simplePayable) +
      ' · 매입 비중 ' + percent(r.purchaseRatio * 100, 1);

    if (!r.valid) {
      el.cmpVerdict.textContent = '계산 중';
      setBadgeTier(el.cmpVerdict, 2);
    } else if (r.better === 'same') {
      el.cmpVerdict.textContent = '차이 없음';
      setBadgeTier(el.cmpVerdict, 2);
    } else if (r.better === 'simple') {
      el.cmpVerdict.textContent = '간이과세 유리';
      setBadgeTier(el.cmpVerdict, 1);
    } else {
      el.cmpVerdict.textContent = '일반과세 유리';
      setBadgeTier(el.cmpVerdict, 2);
    }

    var rows = '';
    rows += row('연 매출(공급대가)', won(r.sales) + '원', '부가세 포함');
    rows += row('연 매입(공급대가)', won(r.purchases) + '원', '매입 비중 ' + percent(r.purchaseRatio * 100, 1));
    rows += row('일반과세 ' + (r.generalRefund > 0 ? '환급' : '납부세액'),
      won(r.generalRefund > 0 ? r.generalRefund : r.generalPayable) + '원',
      r.generalRefund > 0 ? '매입이 매출보다 큼 (매출 − 매입) ÷ 11' : '(매출 − 매입) ÷ 11');
    rows += row('간이과세 납부세액', r.exempt ? '0원' : won(r.simplePayable) + '원',
      '공급대가 × ' + percent(r.rate * 100, 0) + ' × 10% − 매입 0.5%');
    rows += row(r.better === 'same' ? '차이' : name + '가 적게 내는 금액', won(r.savings) + '원',
      '손익분기 매입 비중 ' + percent(r.crossover * 100, 1), 'total');
    el.cmpRows.innerHTML = rows;

    el.cmpGeneral.textContent = (r.generalRefund > 0 ? '환급 ' : '') + won(r.generalPayable || r.generalRefund) + '원';
    el.cmpSimple.textContent = won(r.simplePayable) + '원';
    el.cmpDiff.textContent = won(r.savings) + '원';
    el.cmpCrossover.textContent = percent(r.crossover * 100, 1);

    var lines = [];
    if (r.valid) {
      if (r.better === 'same') {
        lines.push('두 제도의 부가세가 같습니다. 세금계산서 발급이 필요하면 일반과세를 고르세요.');
      } else {
        lines.push('같은 매출·매입에서 <strong>' + name + '가 ' + won(r.savings) + '원</strong> 적습니다. ' +
          '일반과세는 ' + won(r.generalPayable) + '원, 간이과세는 ' + won(r.simplePayable) + '원입니다.');
      }
      lines.push('매입 비중이 <strong>' + percent(r.crossover * 100, 1) + '</strong>보다 높아지면 일반과세가 유리해집니다. ' +
        '지금 매입 비중은 ' + percent(r.purchaseRatio * 100, 1) + '입니다.');
      if (r.generalRefund > 0) {
        lines.push('일반과세는 매입이 매출보다 커서 ' + won(r.generalRefund) + '원을 환급·이월받습니다.');
      }
      if (r.sales >= S.CONSTANTS.SIMPLE_ELIGIBLE) {
        lines.push('연 매출이 1억 400만원을 넘으면 간이과세 대상이 아닙니다. 참고용 비교입니다.');
      }
    } else {
      lines.push('연 매출과 매입을 입력하면 유리한 과세유형이 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.cmpInsight, lines.join(' '), r.sales >= S.CONSTANTS.SIMPLE_ELIGIBLE ? 'is-warn' : (r.better === 'simple' ? 'is-ok' : ''));

    var table = S.compareTable({ sales: r.sales, industry: r.industry });
    el.cmpTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = Math.abs(t.ratio - r.purchaseRatio) < 0.001 && Math.abs(t.purchases - r.purchases) < 1;
      var label = t.better === 'simple' ? '간이' : (t.better === 'general' ? '일반' : '동일');
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + percent(t.ratio * 100, 0) + '</th>' +
        '<td>' + (t.generalRefund > 0 ? '환급 ' + won(t.generalRefund) : won(t.general)) + '</td>' +
        '<td>' + (t.simple === 0 && r.exempt ? '면제' : won(t.simple)) + '</td>' +
        '<td>' + label + '</td></tr>';
    }).join('');
  }

  function cmpShareText() {
    var r = S.compare(cmpInput());
    var name = r.better === 'simple' ? '간이과세' : (r.better === 'general' ? '일반과세' : '차이 없음');
    var lines = [
      '2026 간이 vs 일반 부가세 비교',
      '· 업종 ' + r.industryLabel + ' · 연 매출 ' + won(r.sales) + '원 · 연 매입 ' + won(r.purchases) + '원',
      '· 일반과세 ' + (r.generalRefund > 0 ? '환급 ' : '') + won(r.generalRefund > 0 ? r.generalRefund : r.generalPayable) +
        '원 · 간이과세 ' + won(r.simplePayable) + '원',
      '· ' + (r.better === 'same' ? '두 제도 차이 없음' : name + '가 ' + won(r.savings) + '원 유리'),
      '· 손익분기 매입 비중 ' + percent(r.crossover * 100, 1)
    ];
    var url = shareUrl();
    if (url) lines.push('', '부가가치세·노란우산 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 4: 노란우산 ─────────────────────────────────── */
  function yelInput() {
    var y = state.yel;
    return { income: y.income, payment: y.payment, taxBase: y.taxBase, rentalIncome: y.rental };
  }

  function syncYelForm() {
    var y = state.yel;
    el.yelIncome.value = String(Math.round(y.income));
    el.yelPayment.value = String(Math.round(y.payment));
    el.yelTaxBase.value = String(Math.round(y.taxBase));
    el.yelRental.value = String(Math.round(y.rental));
    el.yelIncomeBadge.textContent = wonShort(y.income);
    el.yelPaymentBadge.textContent = y.payment > 0 ? wonShort(y.payment) : '없음';
    el.yelTaxBaseBadge.textContent = wonShort(y.taxBase);
    el.yelRentalBadge.textContent = y.rental > 0 ? wonShort(y.rental) : '없음';
    syncChips('yel-income', y.income);
    syncChips('yel-payment', y.payment);
    syncChips('yel-base', y.taxBase);
  }

  function renderYel() {
    var r = S.yellow(yelInput());

    el.yelTotal.textContent = won(r.saving);
    el.yelSub.textContent = '사업소득 ' + wonShort(r.income) + ' · 납입 ' + wonShort(r.payment) +
      ' · 공제 ' + wonShort(r.deduction) + ' · 절세율 ' + percent(r.savingRate, 1);

    if (!r.valid) {
      el.yelVerdict.textContent = '계산 중';
      setBadgeTier(el.yelVerdict, 2);
    } else if (r.deduction === 0) {
      el.yelVerdict.textContent = '공제 없음';
      setBadgeTier(el.yelVerdict, 3);
    } else if (r.overLimit) {
      el.yelVerdict.textContent = '한도 초과';
      setBadgeTier(el.yelVerdict, 2);
    } else {
      el.yelVerdict.textContent = '한도 내';
      setBadgeTier(el.yelVerdict, 1);
    }

    var rows = '';
    rows += row('1년 납입액', won(r.payment) + '원', '월 ' + won(r.monthly) + '원');
    rows += row('소득공제 한도', won(r.limit) + '원', '사업소득금액 ' + r.limitLabel);
    rows += row('인정 공제액', '-' + won(r.deduction) + '원', '납입액과 한도 중 작은 금액');
    rows += row('공제 전 과세표준', won(r.taxBase) + '원', '한계세율 ' + percent(r.marginalRate, 0));
    rows += row('공제 후 과세표준', won(r.taxBaseAfter) + '원', '과세표준 − 공제액');
    if (r.incomeTaxSaving > 0) {
      rows += row('소득세 감소', won(r.incomeTaxSaving) + '원', '기본세율 누진 적용');
      rows += row('지방소득세 감소', won(r.localSaving) + '원', '소득세의 10%');
    }
    rows += row('절세 합계', won(r.saving) + '원', '소득세 + 지방소득세', 'total');
    el.yelRows.innerHTML = rows;

    el.yelLimit.textContent = won(r.limit) + '원';
    el.yelDeduction.textContent = won(r.deduction) + '원';
    el.yelSaving.textContent = won(r.saving) + '원';
    el.yelNetCost.textContent = won(Math.max(0, r.payment - r.saving)) + '원';

    var lines = [];
    if (r.valid) {
      if (r.deduction === 0) {
        lines.push('사업소득금액이나 공제 대상 소득이 없어 소득공제를 받을 수 없습니다.');
      } else {
        lines.push('납입 <strong>' + won(r.payment) + '원</strong> 중 <strong>' + won(r.deduction) +
          '원</strong>이 소득공제되어 세금 <strong>' + won(r.saving) + '원</strong>이 줄어듭니다. ' +
          '실질 부담은 ' + won(Math.max(0, r.payment - r.saving)) + '원입니다.');
        lines.push('같은 조건으로 10년 넣으면 약 <strong>' + won(r.tenYearSaving) +
          '원</strong>을 아낄 수 있습니다(한도·세율이 그대로일 때).');
        if (r.payment > r.deduction) {
          lines.push('공제되지 않은 ' + won(r.payment - r.deduction) + '원은 나중에 공제금을 받을 때 과세에서 빠집니다.');
        }
      }
    } else {
      lines.push('납입액을 입력하면 절세액이 계산됩니다.');
    }
    r.notes.forEach(function (n) { lines.push(n); });
    setInsight(el.yelInsight, lines.join(' '), r.deduction === 0 ? 'is-warn' : 'is-ok');

    var table = S.yellowTable({ income: r.income, payment: r.payment, rentalIncome: r.rentalIncome });
    el.yelTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.taxBase === r.taxBase;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + wonShort(t.taxBase) + '</th>' +
        '<td>' + percent(t.marginalRate, 0) + '</td>' +
        '<td>' + won(t.deduction) + '</td>' +
        '<td>' + won(t.saving) + '</td></tr>';
    }).join('');
  }

  function yelShareText() {
    var r = S.yellow(yelInput());
    var lines = [
      '2026 노란우산공제 절세 모의 계산',
      '· 연 사업소득금액 ' + won(r.income) + '원 · 연 납입 ' + won(r.payment) + '원',
      '· 소득공제 한도 ' + won(r.limit) + '원 · 인정 공제 ' + won(r.deduction) + '원',
      '· 과세표준 ' + won(r.taxBase) + '원 → ' + won(r.taxBaseAfter) + '원',
      '· 절세액 ' + won(r.saving) + '원 (소득세 ' + won(r.incomeTaxSaving) + ' + 지방소득세 ' + won(r.localSaving) + ')'
    ];
    var url = shareUrl();
    if (url) lines.push('', '부가가치세·노란우산 계산기 → ' + url);
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
    el.promoHeading.textContent = coupang.heading || '부가세 신고 끝나면, 매장·작업실 난방비부터';
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
  function bindGenEvents() {
    [['genSales', 'sales', 0, MONEY_MAX, 'gen-sales'],
     ['genBuy', 'purchases', 0, MONEY_MAX, 'gen-buy'],
     ['genNonDeduct', 'nonDeductible', 0, MONEY_MAX, 'gen-non']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state.gen[cfg[1]] = readNum(el[cfg[0]], 0, cfg[2], cfg[3]);
        syncChips(cfg[4], state.gen[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-gen-sales]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gen.sales = Number(b.getAttribute('data-gen-sales'));
        el.genSales.value = String(state.gen.sales);
        syncChips('gen-sales', state.gen.sales);
        refresh();
      });
    });
    $$('.chips [data-gen-buy]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gen.purchases = Number(b.getAttribute('data-gen-buy'));
        el.genBuy.value = String(state.gen.purchases);
        syncChips('gen-buy', state.gen.purchases);
        refresh();
      });
    });
    $$('.chips [data-gen-non]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gen.nonDeductible = Number(b.getAttribute('data-gen-non'));
        el.genNonDeduct.value = String(state.gen.nonDeductible);
        syncChips('gen-non', state.gen.nonDeductible);
        refresh();
      });
    });
    el.shareGen.addEventListener('click', function () { doShare(genShareText()); });
  }

  function bindSimEvents() {
    el.simIndustry.addEventListener('change', function () {
      state.sim.industry = S.INDUSTRIES[el.simIndustry.value] ? el.simIndustry.value : 'retail';
      refresh();
    });
    [['simSales', 'sales', 'sim-sales'], ['simBuy', 'purchases', 'sim-buy'],
     ['simPrior', 'priorYear', 'sim-prior']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state.sim[cfg[1]] = readNum(el[cfg[0]], 0, 0, MONEY_MAX);
        syncChips(cfg[2], state.sim[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-sim-sales]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.sim.sales = Number(b.getAttribute('data-sim-sales'));
        el.simSales.value = String(state.sim.sales);
        syncChips('sim-sales', state.sim.sales);
        refresh();
      });
    });
    $$('.chips [data-sim-buy]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.sim.purchases = Number(b.getAttribute('data-sim-buy'));
        el.simBuy.value = String(state.sim.purchases);
        syncChips('sim-buy', state.sim.purchases);
        refresh();
      });
    });
    $$('.chips [data-sim-prior]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.sim.priorYear = Number(b.getAttribute('data-sim-prior'));
        el.simPrior.value = String(state.sim.priorYear);
        syncChips('sim-prior', state.sim.priorYear);
        refresh();
      });
    });
    el.simRental.addEventListener('change', function () {
      state.sim.rental = el.simRental.checked;
      refresh();
    });
    el.shareSim.addEventListener('click', function () { doShare(simShareText()); });
  }

  function bindCmpEvents() {
    el.cmpIndustry.addEventListener('change', function () {
      state.cmp.industry = S.INDUSTRIES[el.cmpIndustry.value] ? el.cmpIndustry.value : 'retail';
      refresh();
    });
    [['cmpSales', 'sales', 'cmp-sales'], ['cmpBuy', 'purchases', 'cmp-buy']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state.cmp[cfg[1]] = readNum(el[cfg[0]], 0, 0, MONEY_MAX);
        syncChips(cfg[2], state.cmp[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-cmp-sales]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cmp.sales = Number(b.getAttribute('data-cmp-sales'));
        el.cmpSales.value = String(state.cmp.sales);
        syncChips('cmp-sales', state.cmp.sales);
        refresh();
      });
    });
    $$('.chips [data-cmp-buy]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cmp.purchases = Number(b.getAttribute('data-cmp-buy'));
        el.cmpBuy.value = String(state.cmp.purchases);
        syncChips('cmp-buy', state.cmp.purchases);
        refresh();
      });
    });
    el.shareCmp.addEventListener('click', function () { doShare(cmpShareText()); });
  }

  function bindYelEvents() {
    [['yelIncome', 'income', S.LIMITS.income.max, 'yel-income'],
     ['yelPayment', 'payment', S.LIMITS.payment.max, 'yel-payment'],
     ['yelTaxBase', 'taxBase', S.LIMITS.taxBase.max, 'yel-base'],
     ['yelRental', 'rental', S.LIMITS.income.max, '']].forEach(function (cfg) {
      el[cfg[0]].addEventListener('input', function () {
        state.yel[cfg[1]] = readNum(el[cfg[0]], 0, 0, cfg[2]);
        if (cfg[3]) syncChips(cfg[3], state.yel[cfg[1]]);
        refresh();
      });
    });
    $$('.chips [data-yel-income]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.yel.income = Number(b.getAttribute('data-yel-income'));
        el.yelIncome.value = String(state.yel.income);
        syncChips('yel-income', state.yel.income);
        refresh();
      });
    });
    $$('.chips [data-yel-payment]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.yel.payment = Number(b.getAttribute('data-yel-payment'));
        el.yelPayment.value = String(state.yel.payment);
        syncChips('yel-payment', state.yel.payment);
        refresh();
      });
    });
    $$('.chips [data-yel-base]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.yel.taxBase = Number(b.getAttribute('data-yel-base'));
        el.yelTaxBase.value = String(state.yel.taxBase);
        syncChips('yel-base', state.yel.taxBase);
        refresh();
      });
    });
    el.shareYel.addEventListener('click', function () { doShare(yelShareText()); });
  }

  function refresh() {
    syncGenForm();
    syncSimForm();
    syncCmpForm();
    syncYelForm();
    renderGen();
    renderSim();
    renderCmp();
    renderYel();
    saveState();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = S.DATA_DATE;
    el.dataDate.setAttribute('datetime', S.DATA_DATE);

    bindGenEvents();
    bindSimEvents();
    bindCmpEvents();
    bindYelEvents();
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
