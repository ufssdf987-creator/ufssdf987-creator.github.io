/*!
 * app.js — 2026 대출 갈아타기(대환) 손익분기 · 중도상환수수료 계산기
 * 계산은 calc.js, 수익화 설정은 config.js 로 분리되어 있습니다.
 */
(function () {
  'use strict';

  var S = window.LoanSwitchCalc;
  var CFG = window.APP_CONFIG || {};
  if (!S) {
    console.error('calc.js 를 불러오지 못했습니다.');
    return;
  }

  var nf = new Intl.NumberFormat('ko-KR');
  var STORE_KEY = 'lsw.state.v1';
  var THEME_KEY = 'lsw.theme';
  var TABS = ['refi', 'prepay', 'partial'];

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

  function todayIso() {
    var d = new Date();
    if (!isFinite(d.getTime())) return S.DATA_DATE;
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /** 기본 실행일: 오늘에서 18개월 전 (36개월 만기 안에서 항상 유효) */
  function defaultStartDate() {
    var base = S.parseDate(todayIso()) || S.parseDate(S.DATA_DATE);
    return S.isoDate(S.addMonths(base, -18));
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    tab: 'refi',
    rf: {
      balance: 300000000, months: 240, method: 'equal',
      oldRate: 5.5, newRate: 4.6, feeRate: 0.55, feeRatio: 67, costs: 200000
    },
    pp: {
      startDate: defaultStartDate(), years: 3, months: 0, payDate: todayIso(),
      amount: 300000000, feeRate: 0.55, principal: 300000000, exempt: 0
    },
    pa: {
      balance: 100000000, months: 36, rate: 5.5, repay: 10000000,
      mode: 'shorten', feeRate: 0.55, feeRatio: 67
    }
  };

  function loadState() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return;

    var r = raw.rf;
    if (r && typeof r === 'object') {
      ['balance', 'months', 'oldRate', 'newRate', 'feeRate', 'feeRatio', 'costs'].forEach(function (k) {
        var v = parseFloat(r[k]);
        if (isFinite(v) && v >= 0) state.rf[k] = v;
      });
      if (S.METHOD_LABEL[r.method]) state.rf.method = r.method;
    }

    var p = raw.pp;
    if (p && typeof p === 'object') {
      if (typeof p.startDate === 'string' && S.parseDate(p.startDate)) state.pp.startDate = p.startDate;
      if (typeof p.payDate === 'string' && S.parseDate(p.payDate)) state.pp.payDate = p.payDate;
      ['years', 'months', 'amount', 'feeRate', 'principal', 'exempt'].forEach(function (k) {
        var v = parseFloat(p[k]);
        if (isFinite(v) && v >= 0) state.pp[k] = v;
      });
    }

    var q = raw.pa;
    if (q && typeof q === 'object') {
      ['balance', 'months', 'rate', 'repay', 'feeRate', 'feeRatio'].forEach(function (k) {
        var v = parseFloat(q[k]);
        if (isFinite(v) && v >= 0) state.pa[k] = v;
      });
      if (q.mode === 'shorten' || q.mode === 'reduce') state.pa.mode = q.mode;
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
    el.tabRefi = $('#tabRefi');
    el.tabPrepay = $('#tabPrepay');
    el.tabPartial = $('#tabPartial');
    el.panelRefi = $('#panelRefi');
    el.panelPrepay = $('#panelPrepay');
    el.panelPartial = $('#panelPartial');

    el.rfBalance = $('#rfBalance');
    el.rfBalanceBadge = $('#rfBalanceBadge');
    el.rfMonths = $('#rfMonths');
    el.rfMonthsBadge = $('#rfMonthsBadge');
    el.rfOldRate = $('#rfOldRate');
    el.rfOldBadge = $('#rfOldBadge');
    el.rfNewRate = $('#rfNewRate');
    el.rfNewBadge = $('#rfNewBadge');
    el.rfFeeRate = $('#rfFeeRate');
    el.rfFeeBadge = $('#rfFeeBadge');
    el.rfFeeRatio = $('#rfFeeRatio');
    el.rfRatioBadge = $('#rfRatioBadge');
    el.rfCosts = $('#rfCosts');
    el.rfCostBadge = $('#rfCostBadge');
    el.rfResultLabel = $('#rfResultLabel');
    el.rfNet = $('#rfNet');
    el.rfSub = $('#rfSub');
    el.rfVerdict = $('#rfVerdict');
    el.rfRows = $('#rfRows');
    el.rfMonthly = $('#rfMonthly');
    el.rfMonthlySave = $('#rfMonthlySave');
    el.rfBep = $('#rfBep');
    el.rfAfterBep = $('#rfAfterBep');
    el.rfInsight = $('#rfInsight');
    el.rfTable = $('#rfTable');
    el.shareRefi = $('#shareRefi');

    el.ppStart = $('#ppStart');
    el.ppYears = $('#ppYears');
    el.ppMonths = $('#ppMonths');
    el.ppTermBadge = $('#ppTermBadge');
    el.ppTermText = $('#ppTermText');
    el.ppPayDate = $('#ppPayDate');
    el.ppElapsedBadge = $('#ppElapsedBadge');
    el.ppAmount = $('#ppAmount');
    el.ppAmountBadge = $('#ppAmountBadge');
    el.ppFeeRate = $('#ppFeeRate');
    el.ppRateBadge = $('#ppRateBadge');
    el.ppPrincipal = $('#ppPrincipal');
    el.ppPrincipalBadge = $('#ppPrincipalBadge');
    el.ppExempt = $('#ppExempt');
    el.ppExemptBadge = $('#ppExemptBadge');
    el.ppResultLabel = $('#ppResultLabel');
    el.ppFee = $('#ppFee');
    el.ppSub = $('#ppSub');
    el.ppBadge = $('#ppBadge');
    el.ppMeterFill = $('#ppMeterFill');
    el.ppMeterStart = $('#ppMeterStart');
    el.ppMeterEnd = $('#ppMeterEnd');
    el.ppRows = $('#ppRows');
    el.ppElapsed = $('#ppElapsed');
    el.ppBase = $('#ppBase');
    el.ppRemain = $('#ppRemain');
    el.ppRatio = $('#ppRatio');
    el.ppInsight = $('#ppInsight');
    el.ppTable = $('#ppTable');
    el.sharePrepay = $('#sharePrepay');

    el.paBalance = $('#paBalance');
    el.paBalanceBadge = $('#paBalanceBadge');
    el.paMonths = $('#paMonths');
    el.paMonthsBadge = $('#paMonthsBadge');
    el.paRate = $('#paRate');
    el.paRateBadge = $('#paRateBadge');
    el.paRepay = $('#paRepay');
    el.paRepayBadge = $('#paRepayBadge');
    el.paFeeRate = $('#paFeeRate');
    el.paFeeBadge = $('#paFeeBadge');
    el.paRatio = $('#paRatio');
    el.paRatioBadge = $('#paRatioBadge');
    el.paResultLabel = $('#paResultLabel');
    el.paNet = $('#paNet');
    el.paSub = $('#paSub');
    el.paBadge = $('#paBadge');
    el.paRows = $('#paRows');
    el.paEffect = $('#paEffect');
    el.paInterestSaved = $('#paInterestSaved');
    el.paFee = $('#paFee');
    el.paBalanceAfter = $('#paBalanceAfter');
    el.paInsight = $('#paInsight');
    el.paTable = $('#paTable');
    el.sharePartial = $('#sharePartial');

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
    if (TABS.indexOf(name) < 0) name = 'refi';
    state.tab = name;
    var map = {
      refi: [el.tabRefi, el.panelRefi],
      prepay: [el.tabPrepay, el.panelPrepay],
      partial: [el.tabPartial, el.panelPartial]
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
    el.tabRefi.addEventListener('click', function () { setTab('refi'); });
    el.tabPrepay.addEventListener('click', function () { setTab('prepay'); });
    el.tabPartial.addEventListener('click', function () { setTab('partial'); });
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
    setTab(TABS.indexOf(hash) >= 0 ? hash : 'refi');
  }

  /* ── 공통 UI ─────────────────────────────────────────── */
  function row(label, value, small, cls) {
    return '<div class="bd-row' + (cls ? ' ' + cls : '') + '">' +
      '<span class="bd-label">' + label + (small ? '<small>' + small + '</small>' : '') + '</span>' +
      '<span class="bd-value">' + value + '</span></div>';
  }

  function syncSegments(segment, active) {
    $$('.segmented[data-segment="' + segment + '"] button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === active);
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

  /* ── 탭 1: 갈아타기 손익 ─────────────────────────────── */
  function syncRefiForm() {
    var r = state.rf;
    el.rfBalance.value = String(Math.round(r.balance));
    el.rfMonths.value = String(Math.round(r.months));
    el.rfOldRate.value = String(r.oldRate);
    el.rfNewRate.value = String(r.newRate);
    el.rfFeeRate.value = String(r.feeRate);
    el.rfFeeRatio.value = String(Math.round(r.feeRatio));
    el.rfCosts.value = String(Math.round(r.costs));
    el.rfBalanceBadge.textContent = wonShort(r.balance);
    el.rfMonthsBadge.textContent = Math.round(r.months) + '개월';
    el.rfOldBadge.textContent = '연 ' + percent(r.oldRate);
    el.rfNewBadge.textContent = '연 ' + percent(r.newRate);
    el.rfFeeBadge.textContent = percent(r.feeRate);
    el.rfRatioBadge.textContent = Math.round(r.feeRatio) + '%';
    el.rfCostBadge.textContent = r.costs > 0 ? wonShort(r.costs) : '없음';
    syncSegments('rfmethod', r.method);
    syncChips('rf-balance', r.balance);
    syncChips('rf-months', r.months);
    syncChips('rf-oldrate', r.oldRate);
    syncChips('rf-newrate', r.newRate);
    syncChips('rf-feerate', r.feeRate);
    syncChips('rf-feeratio', r.feeRatio);
    syncChips('rf-costs', r.costs);
  }

  function renderRefi() {
    var r = S.refinance(state.rf);

    el.rfResultLabel.textContent = r.netSaving < 0 ? '갈아타면 오히려 손해 (순손실)' : '갈아타면 남는 돈 (순절감액)';
    el.rfNet.textContent = won(Math.abs(r.netSaving));
    el.rfSub.textContent = wonShort(r.balance) + ' · ' + r.months + '개월 · 연 ' +
      percent(r.oldRate) + ' → ' + percent(r.newRate) + ' · ' + r.methodLabel;

    if (r.verdict === 'gain') {
      el.rfVerdict.textContent = '갈아타기 유리';
      el.rfVerdict.setAttribute('data-tier', '1');
    } else if (r.verdict === 'loss') {
      el.rfVerdict.textContent = '지금은 손해';
      el.rfVerdict.setAttribute('data-tier', '3');
    } else {
      el.rfVerdict.textContent = '차이 없음';
      el.rfVerdict.setAttribute('data-tier', '2');
    }

    var rows = '';
    rows += row('기존 대출 총 이자', won(r.oldTotalInterest) + '원', r.months + '개월 · 연 ' + percent(r.oldRate));
    rows += row('새 대출 총 이자', won(r.newTotalInterest) + '원', r.months + '개월 · 연 ' + percent(r.newRate) + ' · ' + r.methodLabel);
    rows += row('이자 절감액', won(r.interestSaving) + '원', '금리차 ' + percent(r.rateGap) + ' 기준');
    rows += row('중도상환수수료', '-' + won(r.fee) + '원', percent(r.feeRate) + ' × 남은 기간 ' + Math.round(r.feeRatio) + '%');
    rows += row('부대비용', '-' + won(r.costs) + '원', '인지세·근저당 말소 등');
    rows += row(r.netSaving < 0 ? '순손실' : '순절감액', won(Math.abs(r.netSaving)) + '원', '이자 절감 − 수수료 − 부대비용', 'total');
    el.rfRows.innerHTML = rows;

    el.rfMonthly.textContent = wonShort(r.oldLoan.firstPayment) + ' → ' + wonShort(r.newLoan.firstPayment);
    el.rfMonthlySave.textContent = (r.monthlySaving >= 0 ? won(r.monthlySaving) : '-' + won(-r.monthlySaving)) + '원';
    el.rfBep.textContent = r.bepMonths === null ? '회수 불가' : (r.bepMonths === 0 ? '즉시' : r.bepMonths + '개월');
    el.rfAfterBep.textContent = r.monthsAfterBep === null ? '—' : r.monthsAfterBep + '개월';

    var lines = [];
    if (r.totalCost <= 0) {
      lines.push('중도상환수수료와 부대비용이 없습니다. 같은 기간 이자만 비교하면 새 대출이 <strong>' +
        won(r.interestSaving) + '원</strong> 적습니다.');
    } else if (r.verdict === 'gain') {
      lines.push('수수료·부대비용 <strong>' + won(r.totalCost) + '원</strong>을 내고도 <strong>' + won(r.netSaving) +
        '원</strong>이 남습니다. 손익분기는 <strong>' + r.bepMonths + '개월</strong>로, 남은 ' + r.months +
        '개월 중 ' + r.bepMonths + '개월이 지나면 그 뒤로는 이득입니다.');
    } else if (r.verdict === 'loss') {
      lines.push('이자 절감 <strong>' + won(r.interestSaving) + '원</strong>보다 비용 <strong>' + won(r.totalCost) +
        '원</strong>이 커서 지금 갈아타면 <strong>' + won(-r.netSaving) + '원</strong> 손해입니다.');
      if (r.bepMonths === null) {
        lines.push('남은 ' + r.months + '개월 안에 비용을 회수하지 못합니다. 금리차가 더 벌어지거나 수수료 부과 기간이 끝난 뒤 다시 계산해 보세요.');
      }
    } else {
      lines.push('이자 절감과 비용이 비슷해 갈아타나 그대로 두나 차이가 거의 없습니다.');
    }
    if (r.rateGap <= 0) {
      lines.push('새 금리가 지금 금리와 같거나 높습니다. 금리를 낮추는 것이 목적이라면 다른 상품의 심사 금리를 확인하세요.');
    }
    if (Math.round(r.feeRatio) === 0 || r.fee === 0) {
      lines.push('수수료 부과 기간(3년)이 지나 중도상환수수료가 0원으로 계산됐습니다.');
    }
    if (r.monthlySaving > 0) {
      lines.push('매달 상환액은 약 <strong>' + won(r.monthlySaving) + '원</strong> 줄어듭니다.');
    } else if (r.monthlySaving < 0) {
      lines.push('대신 매달 상환액은 <strong>' + won(-r.monthlySaving) + '원</strong> 늘어납니다(기간이 같아 원금이 빨리 줄어드는 영향).');
    }
    setInsight(el.rfInsight, lines.join(' '), r.verdict === 'loss' ? 'is-warn' : (r.verdict === 'gain' ? 'is-ok' : ''));

    var table = S.refinanceTable({
      balance: r.balance, months: r.months, oldRate: r.oldRate, newRate: r.newRate, method: r.method,
      feeRate: r.feeRate, feeRatio: r.feeRatio, costs: r.costs
    });
    el.rfTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = Math.abs(t.gap - r.rateGap) < 0.001;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">-' + percent(t.gap, 1) + 'p</th>' +
        '<td>' + percent(t.newRate) + '</td>' +
        '<td>' + won(t.interestSaving) + '원</td>' +
        '<td>' + (t.netSaving < 0 ? '-' : '') + won(Math.abs(t.netSaving)) + '원</td>' +
        '<td>' + (t.bepMonths === null ? '—' : (t.bepMonths === 0 ? '즉시' : t.bepMonths + '개월')) + '</td></tr>';
    }).join('');
  }

  function refiShareText() {
    var r = S.refinance(state.rf);
    var lines = [
      '2026 대출 갈아타기 손익 (모의 계산)',
      '· 잔액 ' + wonShort(r.balance) + ' · 남은 ' + r.months + '개월 · ' + r.methodLabel,
      '· 금리 연 ' + percent(r.oldRate) + ' → ' + percent(r.newRate) + ' (차이 ' + percent(r.rateGap) + 'p)',
      '· 기존 총 이자 ' + won(r.oldTotalInterest) + '원 → 새 총 이자 ' + won(r.newTotalInterest) + '원',
      '· 중도상환수수료 ' + won(r.fee) + '원 · 부대비용 ' + won(r.costs) + '원',
      '· 순' + (r.netSaving < 0 ? '손실 ' : '절감 ') + won(Math.abs(r.netSaving)) + '원',
      '· 손익분기 ' + (r.bepMonths === null ? '회수 불가' : r.bepMonths + '개월')
    ];
    var url = shareUrl();
    if (url) lines.push('', '대출 갈아타기 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 2: 중도상환수수료 ────────────────────────────── */
  function ppTermMonths() {
    return clamp(Math.round(state.pp.years) * 12 + Math.round(state.pp.months), 1, 600);
  }

  function syncPrepayForm() {
    var p = state.pp;
    el.ppStart.value = p.startDate;
    el.ppPayDate.value = p.payDate;
    el.ppYears.value = String(Math.round(p.years));
    el.ppMonths.value = String(Math.round(p.months));
    el.ppAmount.value = String(Math.round(p.amount));
    el.ppFeeRate.value = String(p.feeRate);
    el.ppPrincipal.value = String(Math.round(p.principal));
    el.ppExempt.value = String(Math.round(p.exempt));
    el.ppTermText.textContent = ppTermMonths() + '개월';
    el.ppAmountBadge.textContent = wonShort(p.amount);
    el.ppRateBadge.textContent = percent(p.feeRate);
    el.ppPrincipalBadge.textContent = wonShort(p.principal);
    el.ppExemptBadge.textContent = Math.round(p.exempt) + '%';
    syncChips('pp-term', ppTermMonths());
    syncChips('pp-amount', p.amount);
    syncChips('pp-feerate', p.feeRate);
    syncChips('pp-exempt', p.exempt);
  }

  function renderPrepay() {
    var p = state.pp;
    var term = ppTermMonths();
    var r = S.fee({
      amount: p.amount, feeRate: p.feeRate, termMonths: term,
      principal: p.principal, exemptionPct: p.exempt,
      startDate: p.startDate, payDate: p.payDate
    });

    var start = S.parseDate(p.startDate);
    if (start) {
      el.ppTermBadge.textContent = '만기 ' + S.isoDate(S.addMonths(start, term));
    } else {
      el.ppTermBadge.textContent = term + '개월';
    }

    if (!r.valid) {
      el.ppResultLabel.textContent = '중도상환수수료';
      el.ppFee.textContent = '0';
      el.ppSub.textContent = r.reason || '입력값을 확인해 주세요.';
      el.ppBadge.textContent = '확인 필요';
      el.ppBadge.setAttribute('data-tier', '3');
      el.ppRows.innerHTML = row('상환 금액', won(p.amount) + '원', '입력값') +
        row('중도상환수수료', '0원', r.reason || '', 'total');
      el.ppElapsed.textContent = '—';
      el.ppBase.textContent = '—';
      el.ppRemain.textContent = '—';
      el.ppRatio.textContent = '—';
      el.ppMeterFill.style.width = '0%';
      setInsight(el.ppInsight, '대출 실행일과 상환일을 달력 날짜로 넣으면 경과일수로 수수료를 계산합니다.', 'is-warn');
      el.ppTable.tBodies[0].innerHTML = '';
      return;
    }

    el.ppResultLabel.textContent = '중도상환수수료';
    el.ppFee.textContent = won(r.fee);
    el.ppSub.textContent = wonShort(r.amount) + (r.amount >= r.principal ? ' 전액' : '') + ' 상환 · ' +
      percent(r.feeRate) + ' · 잔존 ' + r.remainDays + '일 / ' + r.baseDays + '일';

    if (r.waived) {
      el.ppBadge.textContent = r.remainDays <= 0 ? '3년 경과 면제' : '수수료 0원';
      el.ppBadge.setAttribute('data-tier', '1');
    } else {
      el.ppBadge.textContent = '3년 이내 부과';
      el.ppBadge.setAttribute('data-tier', '2');
    }

    el.ppMeterFill.style.width = Math.round(r.ratio * 1000) / 10 + '%';
    el.ppMeterStart.textContent = r.startDate + ' 실행';
    el.ppMeterEnd.textContent = r.baseEndDate + (r.cappedBy3Years ? ' (3년)' : ' 만기');

    var rows = '';
    rows += row('상환 금액', won(r.amount) + '원', r.amount >= r.principal ? '대출 전액' : '일부 상환');
    rows += row('적용 수수료율', percent(r.feeRate), '약정서의 중도상환해약금률');
    if (r.exemptAmount > 0) {
      rows += row('면제 금액', '-' + won(r.exemptAmount) + '원', '연간 면제 ' + Math.round(r.exemptionPct) + '%');
    }
    rows += row('수수료 기준 금액', won(r.feeBase) + '원', '상환 금액 − 면제 금액');
    rows += row('잔존 기간 비율', Math.round(r.ratio * 1000) / 10 + '%', r.remainDays + '일 ÷ ' + r.baseDays + '일');
    rows += row('중도상환수수료', won(r.fee) + '원', '원 미만 버림', 'total');
    el.ppRows.innerHTML = rows;

    el.ppElapsed.textContent = r.elapsedDays + '일';
    el.ppBase.textContent = r.baseDays + '일';
    el.ppRemain.textContent = r.remainDays + '일';
    el.ppRatio.textContent = Math.round(r.ratio * 1000) / 10 + '%';
    el.ppElapsedBadge.textContent = '경과 ' + r.elapsedDays + '일';

    var lines = [];
    if (r.waived) {
      if (r.remainDays <= 0) {
        lines.push('대출 실행일부터 <strong>3년이 지나</strong> 중도상환수수료가 0원입니다. 금융소비자 보호에 관한 법률 제20조에 따라 3년이 지난 대출은 수수료를 받을 수 없습니다.');
      } else {
        lines.push('수수료율이나 면제 한도 때문에 낼 수수료가 0원입니다.');
      }
      lines.push('이제는 금리차와 부대비용만 따져 갈아타면 됩니다.');
    } else {
      lines.push('지금 갚으면 <strong>' + won(r.fee) + '원</strong>입니다. 수수료는 남은 기간에 비례해 줄어서, 지금은 3년 기준 ' +
        r.remainDays + '일이 남아 <strong>' + (Math.round(r.ratio * 1000) / 10) + '%</strong>만 적용됩니다.');
      var later = S.fee({
        amount: r.amount, feeRate: r.feeRate, termMonths: term,
        principal: r.principal, exemptionPct: r.exemptionPct,
        startDate: r.startDate, payDate: S.isoDate(S.addMonths(S.parseDate(r.payDate), 6))
      });
      if (later.valid && later.fee < r.fee) {
        lines.push('6개월 뒤에 갚으면 수수료가 <strong>' + won(later.fee) + '원</strong>으로 ' + won(r.fee - later.fee) +
          '원 줄어듭니다. 다만 그 6개월 동안 이자를 더 내므로, 갈아타기 이자 절감과 함께 비교해야 합니다.');
      }
    }
    if (r.cappedBy3Years) {
      lines.push('만기가 3년보다 길어 수수료 계산의 대출기간은 3년(' + r.baseDays + '일)으로 잡았습니다.');
    }
    if (r.underThreeMonthsLeft) {
      lines.push('만기까지 3개월 미만이면 수수료를 면제하는 상품도 있습니다(KB국민은행 등). 상환 전에 한 번 확인하세요.');
    }
    if (r.exemptAmount > 0) {
      lines.push('연간 면제 한도 ' + Math.round(r.exemptionPct) + '%(' + won(r.exemptAmount) + '원)를 반영했습니다.');
    }
    setInsight(el.ppInsight, lines.join(' '), r.waived ? 'is-ok' : '');

    var table = S.feeTable({
      amount: r.amount, feeRate: r.feeRate, termMonths: term,
      principal: r.principal, exemptionPct: r.exemptionPct, startDate: r.startDate
    });
    el.ppTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = t.elapsedDays === r.elapsedDays;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + (t.elapsedMonths === 0 ? '실행일' : t.elapsedMonths + '개월') + '</th>' +
        '<td>' + t.payDate + '</td>' +
        '<td>' + t.remainDays + '일</td>' +
        '<td>' + (Math.round(t.ratio * 1000) / 10) + '%</td>' +
        '<td>' + won(t.fee) + '원</td></tr>';
    }).join('');
  }

  function prepayShareText() {
    var p = state.pp;
    var term = ppTermMonths();
    var r = S.fee({
      amount: p.amount, feeRate: p.feeRate, termMonths: term,
      principal: p.principal, exemptionPct: p.exempt,
      startDate: p.startDate, payDate: p.payDate
    });
    var lines = ['2026 중도상환수수료 (모의 계산)'];
    if (!r.valid) {
      lines.push('· ' + (r.reason || '입력값 확인 필요'));
      return lines.join('\n');
    }
    lines.push(
      '· 대출 ' + r.startDate + ' 실행 · ' + term + '개월 · 만기 ' + r.maturityDate,
      '· ' + r.payDate + ' 상환 ' + won(r.amount) + '원 · 수수료율 ' + percent(r.feeRate),
      '· 경과 ' + r.elapsedDays + '일 / 3년 기준 ' + r.baseDays + '일 → 잔존 ' + r.remainDays + '일 (' + (Math.round(r.ratio * 1000) / 10) + '%)',
      '· 중도상환수수료 ' + won(r.fee) + '원' + (r.exemptAmount > 0 ? ' (면제 ' + won(r.exemptAmount) + '원 반영)' : '')
    );
    var url = shareUrl();
    if (url) lines.push('', '대출 갈아타기 계산기 → ' + url);
    return lines.join('\n');
  }

  /* ── 탭 3: 일부 상환 ─────────────────────────────────── */
  function syncPartialForm() {
    var p = state.pa;
    el.paBalance.value = String(Math.round(p.balance));
    el.paMonths.value = String(Math.round(p.months));
    el.paRate.value = String(p.rate);
    el.paRepay.value = String(Math.round(p.repay));
    el.paFeeRate.value = String(p.feeRate);
    el.paRatio.value = String(Math.round(p.feeRatio));
    el.paBalanceBadge.textContent = wonShort(p.balance);
    el.paMonthsBadge.textContent = Math.round(p.months) + '개월';
    el.paRateBadge.textContent = '연 ' + percent(p.rate);
    el.paRepayBadge.textContent = wonShort(p.repay);
    el.paFeeBadge.textContent = percent(p.feeRate);
    el.paRatioBadge.textContent = Math.round(p.feeRatio) + '%';
    syncSegments('pamode', p.mode);
    syncChips('pa-balance', p.balance);
    syncChips('pa-months', p.months);
    syncChips('pa-repay', p.repay);
    syncChips('pa-feerate', p.feeRate);
    syncChips('pa-ratio', p.feeRatio);
  }

  function renderPartial() {
    var p = state.pa;
    var r = S.partial({
      balance: p.balance, months: p.months, annualRate: p.rate, repay: p.repay,
      mode: p.mode, feeRate: p.feeRate, feeRatio: p.feeRatio
    });

    el.paResultLabel.textContent = r.netSaving < 0 ? '갚으면 오히려 손해 (순손실)' : '일부 상환 순이익';
    el.paNet.textContent = won(Math.abs(r.netSaving));
    el.paSub.textContent = wonShort(r.balance) + ' 중 ' + wonShort(r.repay) + ' 상환 · ' + r.months +
      '개월 · 연 ' + percent(r.annualRate) + ' · ' + r.modeLabel;

    if (r.verdict === 'gain') {
      el.paBadge.textContent = '갚는 게 유리';
      el.paBadge.setAttribute('data-tier', '1');
    } else if (r.verdict === 'loss') {
      el.paBadge.textContent = '그대로 유지';
      el.paBadge.setAttribute('data-tier', '3');
    } else {
      el.paBadge.textContent = '차이 없음';
      el.paBadge.setAttribute('data-tier', '2');
    }

    var rows = '';
    rows += row('그대로 둘 때 총 이자', won(r.keepInterest) + '원', r.months + '개월 · 원리금균등');
    rows += row('일부 상환 후 총 이자', won(r.interestAfter) + '원',
      r.mode === 'shorten' ? r.monthsAfter + '개월로 단축' : r.months + '개월 유지');
    rows += row('이자 절감액', won(r.interestSaved) + '원', '상환 전후 차이');
    rows += row('중도상환수수료', '-' + won(r.fee) + '원', percent(r.feeRate) + ' × 남은 기간 ' + Math.round(r.feeRatio) + '%');
    rows += row(r.netSaving < 0 ? '순손실' : '순이익', won(Math.abs(r.netSaving)) + '원', '이자 절감 − 수수료', 'total');
    el.paRows.innerHTML = rows;

    if (r.mode === 'shorten') {
      el.paEffect.textContent = r.monthsShortened > 0 ? r.monthsShortened + '개월 단축' : '단축 없음';
    } else {
      el.paEffect.textContent = r.monthlyCut > 0 ? won(r.monthlyCut) + '원↓' : '감소 없음';
    }
    el.paInterestSaved.textContent = won(r.interestSaved) + '원';
    el.paFee.textContent = won(r.fee) + '원';
    el.paBalanceAfter.textContent = won(r.balanceAfter) + '원';

    var lines = [];
    if (r.verdict === 'gain') {
      lines.push('<strong>' + wonShort(r.repay) + '</strong>을 갚으면 이자 <strong>' + won(r.interestSaved) +
        '원</strong>을 아끼고, 수수료 ' + won(r.fee) + '원을 빼도 <strong>' + won(r.netSaving) + '원</strong>이 남습니다.');
    } else if (r.verdict === 'loss') {
      lines.push('이자 절감 <strong>' + won(r.interestSaved) + '원</strong>보다 수수료 <strong>' + won(r.fee) +
        '원</strong>이 커서 지금 갚으면 <strong>' + won(-r.netSaving) + '원</strong> 손해입니다. 남은 기간이 짧거나 금리가 낮을 때는 그대로 두는 편이 낫습니다.');
    } else {
      lines.push('이자 절감과 수수료가 비슷합니다.');
    }
    if (r.mode === 'shorten' && r.monthsShortened > 0) {
      lines.push('월 상환액 <strong>' + won(r.paymentAfter) + '원</strong>은 그대로 두고 <strong>' + r.monthsShortened +
        '개월</strong> 일찍 끝납니다.');
    } else if (r.mode === 'reduce' && r.monthlyCut > 0) {
      lines.push('기간은 ' + r.months + '개월 그대로 두고 매달 상환액이 <strong>' + won(r.monthlyCut) + '원</strong> 줄어듭니다.');
    }
    if (r.repay > 0 && r.months > 0) {
      lines.push('갚는 돈 대비로는 연 <strong>' + percent(r.effectiveYield, 1) + '</strong> 수익률로 이자를 아낀 셈입니다(대출 금리 ' +
        percent(r.annualRate) + '보다 수수료만큼 낮음).');
    }
    if (r.balanceAfter <= 0) {
      lines.push('잔액을 모두 갚는 계산입니다. 비상금은 남겨 두세요.');
    }
    setInsight(el.paInsight, lines.join(' '), r.verdict === 'loss' ? 'is-warn' : (r.verdict === 'gain' ? 'is-ok' : ''));

    var table = S.partialTable({
      balance: r.balance, months: r.months, annualRate: r.annualRate,
      feeRate: r.feeRate, feeRatio: r.feeRatio
    });
    el.paTable.tBodies[0].innerHTML = table.map(function (t) {
      var now = Math.abs(t.repay - r.repay) < 1;
      return '<tr' + (now ? ' class="is-now"' : '') + '><th scope="row">' + Math.round(t.share * 100) + '%</th>' +
        '<td>' + wonShort(t.repay) + '</td>' +
        '<td>' + won(t.interestSaved) + '원</td>' +
        '<td>' + won(t.fee) + '원</td>' +
        '<td>' + (t.netSaving < 0 ? '-' : '') + won(Math.abs(t.netSaving)) + '원</td>' +
        '<td>' + t.monthsShortened + '개월</td></tr>';
    }).join('');
  }

  function partialShareText() {
    var p = state.pa;
    var r = S.partial({
      balance: p.balance, months: p.months, annualRate: p.rate, repay: p.repay,
      mode: p.mode, feeRate: p.feeRate, feeRatio: p.feeRatio
    });
    var lines = [
      '2026 일부 중도상환 손익 (모의 계산)',
      '· 잔액 ' + wonShort(r.balance) + ' 중 ' + won(r.repay) + '원 상환 · ' + r.months + '개월 · 연 ' + percent(r.annualRate),
      '· ' + r.modeLabel + ' · 수수료 ' + won(r.fee) + '원',
      '· 이자 절감 ' + won(r.interestSaved) + '원 → 순' + (r.netSaving < 0 ? '손실 ' : '이익 ') + won(Math.abs(r.netSaving)) + '원',
      r.mode === 'shorten' ? '· ' + r.monthsShortened + '개월 단축' : '· 월 상환액 ' + won(r.monthlyCut) + '원 감소'
    ];
    var url = shareUrl();
    if (url) lines.push('', '대출 갈아타기 계산기 → ' + url);
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
    el.promoHeading.textContent = coupang.heading || '이자 아낀 돈, 고정비부터';
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
  function bindRefiEvents() {
    el.rfBalance.addEventListener('input', function () {
      state.rf.balance = readNum(el.rfBalance, 0, 0, 10000000000);
      syncChips('rf-balance', state.rf.balance);
      refresh();
    });
    $$('.chips [data-rf-balance]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.balance = Number(b.getAttribute('data-rf-balance'));
        el.rfBalance.value = String(state.rf.balance);
        syncChips('rf-balance', state.rf.balance);
        refresh();
      });
    });
    el.rfMonths.addEventListener('input', function () {
      state.rf.months = readNum(el.rfMonths, 12, 1, 600);
      syncChips('rf-months', state.rf.months);
      refresh();
    });
    $$('.chips [data-rf-months]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.months = Number(b.getAttribute('data-rf-months'));
        el.rfMonths.value = String(state.rf.months);
        syncChips('rf-months', state.rf.months);
        refresh();
      });
    });
    el.rfOldRate.addEventListener('input', function () {
      state.rf.oldRate = readNum(el.rfOldRate, 0, 0, 30);
      syncChips('rf-oldrate', state.rf.oldRate);
      refresh();
    });
    $$('.chips [data-rf-oldrate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.oldRate = Number(b.getAttribute('data-rf-oldrate'));
        el.rfOldRate.value = String(state.rf.oldRate);
        syncChips('rf-oldrate', state.rf.oldRate);
        refresh();
      });
    });
    el.rfNewRate.addEventListener('input', function () {
      state.rf.newRate = readNum(el.rfNewRate, 0, 0, 30);
      syncChips('rf-newrate', state.rf.newRate);
      refresh();
    });
    $$('.chips [data-rf-newrate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.newRate = Number(b.getAttribute('data-rf-newrate'));
        el.rfNewRate.value = String(state.rf.newRate);
        syncChips('rf-newrate', state.rf.newRate);
        refresh();
      });
    });
    el.rfFeeRate.addEventListener('input', function () {
      state.rf.feeRate = readNum(el.rfFeeRate, 0, 0, 5);
      syncChips('rf-feerate', state.rf.feeRate);
      refresh();
    });
    $$('.chips [data-rf-feerate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.feeRate = Number(b.getAttribute('data-rf-feerate'));
        el.rfFeeRate.value = String(state.rf.feeRate);
        syncChips('rf-feerate', state.rf.feeRate);
        refresh();
      });
    });
    el.rfFeeRatio.addEventListener('input', function () {
      state.rf.feeRatio = readNum(el.rfFeeRatio, 0, 0, 100);
      syncChips('rf-feeratio', state.rf.feeRatio);
      refresh();
    });
    $$('.chips [data-rf-feeratio]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.feeRatio = Number(b.getAttribute('data-rf-feeratio'));
        el.rfFeeRatio.value = String(state.rf.feeRatio);
        syncChips('rf-feeratio', state.rf.feeRatio);
        refresh();
      });
    });
    el.rfCosts.addEventListener('input', function () {
      state.rf.costs = readNum(el.rfCosts, 0, 0, 100000000);
      syncChips('rf-costs', state.rf.costs);
      refresh();
    });
    $$('.chips [data-rf-costs]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rf.costs = Number(b.getAttribute('data-rf-costs'));
        el.rfCosts.value = String(state.rf.costs);
        syncChips('rf-costs', state.rf.costs);
        refresh();
      });
    });
    $$('.segmented[data-segment="rfmethod"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        if (!S.METHOD_LABEL[v]) return;
        state.rf.method = v;
        syncSegments('rfmethod', v);
        refresh();
      });
    });
    el.shareRefi.addEventListener('click', function () { doShare(refiShareText()); });
  }

  function bindPrepayEvents() {
    el.ppStart.addEventListener('change', function () {
      var v = el.ppStart.value;
      if (S.parseDate(v)) { state.pp.startDate = v; refresh(); }
      else el.ppStart.value = state.pp.startDate;
    });
    el.ppPayDate.addEventListener('change', function () {
      var v = el.ppPayDate.value;
      if (S.parseDate(v)) { state.pp.payDate = v; refresh(); }
      else el.ppPayDate.value = state.pp.payDate;
    });
    el.ppYears.addEventListener('input', function () {
      state.pp.years = readNum(el.ppYears, 0, 0, 50);
      syncChips('pp-term', ppTermMonths());
      refresh();
    });
    el.ppMonths.addEventListener('input', function () {
      state.pp.months = readNum(el.ppMonths, 0, 0, 11);
      syncChips('pp-term', ppTermMonths());
      refresh();
    });
    $$('.chips [data-pp-term]').forEach(function (b) {
      b.addEventListener('click', function () {
        var total = Number(b.getAttribute('data-pp-term'));
        state.pp.years = Math.floor(total / 12);
        state.pp.months = total % 12;
        syncChips('pp-term', total);
        syncPrepayForm();
        refresh();
      });
    });
    $$('.chips [data-pp-shift]').forEach(function (b) {
      b.addEventListener('click', function () {
        var months = Number(b.getAttribute('data-pp-shift'));
        var base = S.parseDate(todayIso()) || S.parseDate(S.DATA_DATE);
        state.pp.payDate = S.isoDate(S.addMonths(base, months));
        el.ppPayDate.value = state.pp.payDate;
        refresh();
      });
    });
    el.ppAmount.addEventListener('input', function () {
      state.pp.amount = readNum(el.ppAmount, 0, 0, 10000000000);
      syncChips('pp-amount', state.pp.amount);
      refresh();
    });
    $$('.chips [data-pp-amount]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pp.amount = Number(b.getAttribute('data-pp-amount'));
        el.ppAmount.value = String(state.pp.amount);
        syncChips('pp-amount', state.pp.amount);
        refresh();
      });
    });
    el.ppFeeRate.addEventListener('input', function () {
      state.pp.feeRate = readNum(el.ppFeeRate, 0, 0, 5);
      syncChips('pp-feerate', state.pp.feeRate);
      refresh();
    });
    $$('.chips [data-pp-feerate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pp.feeRate = Number(b.getAttribute('data-pp-feerate'));
        el.ppFeeRate.value = String(state.pp.feeRate);
        syncChips('pp-feerate', state.pp.feeRate);
        refresh();
      });
    });
    el.ppPrincipal.addEventListener('input', function () {
      state.pp.principal = readNum(el.ppPrincipal, 0, 0, 10000000000);
      refresh();
    });
    el.ppExempt.addEventListener('input', function () {
      state.pp.exempt = readNum(el.ppExempt, 0, 0, 100);
      syncChips('pp-exempt', state.pp.exempt);
      refresh();
    });
    $$('.chips [data-pp-exempt]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pp.exempt = Number(b.getAttribute('data-pp-exempt'));
        el.ppExempt.value = String(state.pp.exempt);
        syncChips('pp-exempt', state.pp.exempt);
        refresh();
      });
    });
    el.sharePrepay.addEventListener('click', function () { doShare(prepayShareText()); });
  }

  function bindPartialEvents() {
    el.paBalance.addEventListener('input', function () {
      state.pa.balance = readNum(el.paBalance, 0, 0, 10000000000);
      syncChips('pa-balance', state.pa.balance);
      refresh();
    });
    $$('.chips [data-pa-balance]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pa.balance = Number(b.getAttribute('data-pa-balance'));
        el.paBalance.value = String(state.pa.balance);
        syncChips('pa-balance', state.pa.balance);
        refresh();
      });
    });
    el.paMonths.addEventListener('input', function () {
      state.pa.months = readNum(el.paMonths, 12, 1, 600);
      syncChips('pa-months', state.pa.months);
      refresh();
    });
    $$('.chips [data-pa-months]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pa.months = Number(b.getAttribute('data-pa-months'));
        el.paMonths.value = String(state.pa.months);
        syncChips('pa-months', state.pa.months);
        refresh();
      });
    });
    el.paRate.addEventListener('input', function () {
      state.pa.rate = readNum(el.paRate, 0, 0, 30);
      refresh();
    });
    el.paRepay.addEventListener('input', function () {
      state.pa.repay = readNum(el.paRepay, 0, 0, 10000000000);
      syncChips('pa-repay', state.pa.repay);
      refresh();
    });
    $$('.chips [data-pa-repay]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pa.repay = Number(b.getAttribute('data-pa-repay'));
        el.paRepay.value = String(state.pa.repay);
        syncChips('pa-repay', state.pa.repay);
        refresh();
      });
    });
    el.paFeeRate.addEventListener('input', function () {
      state.pa.feeRate = readNum(el.paFeeRate, 0, 0, 5);
      syncChips('pa-feerate', state.pa.feeRate);
      refresh();
    });
    $$('.chips [data-pa-feerate]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pa.feeRate = Number(b.getAttribute('data-pa-feerate'));
        el.paFeeRate.value = String(state.pa.feeRate);
        syncChips('pa-feerate', state.pa.feeRate);
        refresh();
      });
    });
    el.paRatio.addEventListener('input', function () {
      state.pa.feeRatio = readNum(el.paRatio, 0, 0, 100);
      syncChips('pa-ratio', state.pa.feeRatio);
      refresh();
    });
    $$('.chips [data-pa-ratio]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.pa.feeRatio = Number(b.getAttribute('data-pa-ratio'));
        el.paRatio.value = String(state.pa.feeRatio);
        syncChips('pa-ratio', state.pa.feeRatio);
        refresh();
      });
    });
    $$('.segmented[data-segment="pamode"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        state.pa.mode = v === 'reduce' ? 'reduce' : 'shorten';
        syncSegments('pamode', state.pa.mode);
        refresh();
      });
    });
    el.sharePartial.addEventListener('click', function () { doShare(partialShareText()); });
  }

  function refresh() {
    syncRefiForm();
    syncPrepayForm();
    syncPartialForm();
    renderRefi();
    renderPrepay();
    renderPartial();
    saveState();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function init() {
    cacheEls();
    loadState();
    el.appVersion.textContent = CFG.version || '1.0.0';
    el.dataDate.textContent = S.DATA_DATE;
    el.dataDate.setAttribute('datetime', S.DATA_DATE);

    bindRefiEvents();
    bindPrepayEvents();
    bindPartialEvents();
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
