const FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const $ = id => document.getElementById(id);

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function flashBtn(btn, text, color) {
  const orig = btn.textContent, origColor = btn.style.color;
  btn.textContent = text;
  if (color) btn.style.color = color;
  setTimeout(() => { btn.textContent = orig; btn.style.color = origColor; }, 1000);
}

function toFraction(value) {
  if (Number.isInteger(value)) return FMT.format(value);
  const sign = Math.sign(value), abs = Math.abs(value);
  const whole = Math.floor(abs), frac = abs - whole;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = frac;
  for (let i = 0; i < 100; i++) {
    const a = Math.floor(b);
    [h1, h2] = [a * h1 + h2, h1];
    [k1, k2] = [a * k1 + k2, k1];
    if (Math.abs(frac - h1 / k1) < 1e-10) break;
    b -= a;
    if (b < 1e-12) break;
    b = 1 / b;
  }
  const prefix = sign < 0 ? '-' : '';
  return whole ? `${prefix}${FMT.format(whole)} ${h1}/${k1}` : `${prefix}${h1}/${k1}`;
}

class ExprParser {
  constructor(s) { this.s = s; this.i = 0; }
  peek() { while (this.s[this.i] === ' ') this.i++; return this.s[this.i]; }
  eat(ch) { return this.peek() === ch ? (this.i++, true) : false; }
  parse() {
    const v = this.expr();
    return this.i >= this.s.length ? v : NaN;
  }
  expr() {
    let v = this.term();
    for (;;) {
      if (this.eat('+')) v += this.term();
      else if (this.eat('-')) v -= this.term();
      else return v;
    }
  }
  term() {
    let v = this.atom();
    for (;;) {
      if (this.eat('*')) v *= this.atom();
      else if (this.eat('/')) v /= this.atom();
      else return v;
    }
  }
  atom() {
    if (this.eat('(')) { const v = this.expr(); this.eat(')'); return v; }
    if (this.eat('-')) return -this.atom();
    const start = this.i;
    while (this.i < this.s.length && '0123456789.'.includes(this.s[this.i])) this.i++;
    return parseFloat(this.s.slice(start, this.i));
  }
}

function calcTotal(input) {
  if (!input.trim()) return 0;
  let total = 0;
  for (const line of input.split('\n')) {
    const expr = line.replace(/[^0-9.+\-*/() ]/g, '').trim();
    if (!expr || /[+\-*/(]$/.test(expr)) continue;
    const res = new ExprParser(expr).parse();
    if (!isNaN(res) && isFinite(res)) total += res;
  }
  return total;
}

const FEE_SCHEDULE = {
  old: { base: 1000, rates: [[1e5, 1e6, 110], [1e6, 1e7, 99], [1e7, 1e8, 88], [1e8, 1e9, 77], [1e9, Infinity, 66]] },
  new: { base: 1500, rates: [[1e5, 1e6, 130], [1e6, 1e7, 117], [1e7, 1e8, 88], [1e8, 1e9, 77], [1e9, Infinity, 66]] }
};

function calcCourtFee(amt, type) {
  if (amt <= 0) return { first: 0, appeal: 0 };
  const { base, rates } = FEE_SCHEDULE[type];
  let fee = base;
  if (amt > 1e5)
    for (const [min, max, rate] of rates)
      if (amt > min) fee += Math.ceil((Math.min(amt, max) - min) / 1e4) * rate;
  return { first: fee, appeal: Math.floor(fee * 1.5) };
}

class CourtFeeManager {
  constructor(ui) {
    this.ui = ui;
    this.el = {
      input: $('feeInput'), first: $('feeFirst'), appeal: $('feeAppeal'),
      thumb: $('feeToggleThumb'), lblOld: $('lblOld'), lblNew: $('lblNew')
    };
    this.el.input.addEventListener('input', () => this.onInput());
    $('feeToggleContainer').addEventListener('click', () => this.setType(this.type === 'new' ? 'old' : 'new'));
    $('useTotalBtn').addEventListener('click', e => this.useTotal(e.target));
    $('clearFeeBtn').addEventListener('click', e => this.clear(e.target));
    $('copyFirstBtn').addEventListener('click', e => this.copy('first', e.target));
    $('copyAppealBtn').addEventListener('click', e => this.copy('appeal', e.target));
    this.setType('new');
  }

  setType(type) {
    this.type = type;
    const isNew = type === 'new';
    this.el.thumb.style.transform = isNew ? 'translateX(100%)' : 'translateX(0)';
    this.el.lblNew.className = `switch-text ${isNew ? 'active-text' : 'inactive-text'}`;
    this.el.lblOld.className = `switch-text ${isNew ? 'inactive-text' : 'active-text'}`;
    this.calc();
  }

  onInput() {
    const raw = this.el.input.value.replace(/\D/g, '');
    this.el.input.value = raw ? FMT.format(parseInt(raw, 10)) : '';
    this.calc();
  }

  useTotal(btn) {
    const sum = Math.floor(this.ui.currentSum);
    if (sum <= 0) return;
    this.importAmount(sum, btn);
  }

  importAmount(sum, btn) {
    const val = Math.floor(Number(sum) || 0);
    if (val <= 0) return false;
    this.el.input.value = FMT.format(val);
    this.calc();
    if (btn) flashBtn(btn, '已帶入✓', '#16a34a');
    return true;
  }

  clear(btn) {
    this.el.input.value = '';
    this.calc();
    flashBtn(btn, '已清除✓');
  }

  calc() {
    const val = parseInt(this.el.input.value.replace(/,/g, ''), 10) || 0;
    const { first, appeal } = calcCourtFee(val, this.type);
    this.el.first.textContent = first ? FMT.format(first) : '0';
    this.el.appeal.textContent = appeal ? FMT.format(appeal) : '0';
    this.el.first.classList.toggle('active', first > 0);
    this.el.appeal.classList.toggle('active', appeal > 0);
  }

  copy(type, btn) {
    const val = this.el[type].textContent;
    if (val === '0') return;
    copyText(val);
    flashBtn(btn, '已複製✓', '#16a34a');
  }
}

class UIManager {
  constructor() {
    this.inputBox = $('inputBox');
    this.resDisp = $('resultDisplay');
    this.currentSum = 0;
    this.inputBox.addEventListener('input', () => this.onInput());
    $('copyEqBtn').addEventListener('click', e => this.copy('eq', e.target));
    $('copyAnsBtn').addEventListener('click', e => this.copy('ans', e.target));
    $('clearBtn').addEventListener('click', e => this.clear(e.target));
  }

  onInput() {
    const orig = this.inputBox.value;
    const formatted = orig.replace(/,/g, '').replace(/\d+(\.\d*)?/g, m => {
      const p = m.split('.');
      p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return p.join('.');
    });
    if (orig !== formatted) {
      const cursor = this.inputBox.selectionStart + formatted.length - orig.length;
      this.inputBox.value = formatted;
      this.inputBox.setSelectionRange(cursor, cursor);
    }
    this.currentSum = calcTotal(this.inputBox.value);

    let useFraction = false;
    for (const line of this.inputBox.value.split('\n')) {
      const expr = line.replace(/[^0-9.+\-*/() ]/g, '').trim();
      if (!expr.includes('/')) continue;
      if (/^-?\d+(\.\d+)?\/\d+(\.\d+)?$/.test(expr)) {
        useFraction = true;
      } else {
        useFraction = false;
        break;
      }
    }

    if (this.currentSum === 0) {
      this.resDisp.textContent = '0';
    } else if (useFraction && !Number.isInteger(this.currentSum)) {
      this.resDisp.textContent = toFraction(this.currentSum);
    } else if (!Number.isInteger(this.currentSum)) {
      this.resDisp.textContent = FMT.format(Math.round(this.currentSum * 100) / 100);
    } else {
      this.resDisp.textContent = FMT.format(this.currentSum);
    }
    this.resDisp.classList.toggle('empty', this.currentSum === 0);
  }

  copy(type, btn) {
    if (type === 'ans') {
      copyText(this.resDisp.textContent);
    } else {
      const lines = this.inputBox.value.split('\n')
        .map(l => l.replace(/[^0-9.+\-*/() ,]/g, '').trim())
        .filter(Boolean);
      if (!lines.length) return;
      const eq = lines.map(l => {
        const m = l.replace(/,/g, '');
        return /[*/()]/.test(m) || /[+-]/.test(m.slice(1)) ? `(${l})` : l;
      }).join('+').replace(/\+\s*-/g, '-').replace(/\s+/g, '');
      copyText(`${eq}=${this.resDisp.textContent}`);
    }
    flashBtn(btn, '已複製✓', '#16a34a');
  }

  clear(btn) {
    this.inputBox.value = '';
    this.onInput();
    flashBtn(btn, '已清除✓');
  }
}

/* ══════════════════════════════════════════
   Date Calculation Utilities
   ══════════════════════════════════════════ */

const MS_PER_DAY = 86400000;

const DC = {
  parseDate(str) {
    const s = String(str || '').trim().replace(/[\/.\-]/g, '');
    if (!/^\d{6,8}$/.test(s)) return null;
    const yPart = s.slice(0, -4), mPart = s.slice(-4, -2), dPart = s.slice(-2);
    let y = parseInt(yPart, 10), m = parseInt(mPart, 10), d = parseInt(dPart, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    if (y < 1000) y += 1911;
    const date = new Date(y, m - 1, d);
    return (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) ? date : null;
  },

  formatTW(date) {
    if (!date || isNaN(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear() - 1911}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  },

  formatTWFull(date) {
    if (!date || isNaN(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    const w = ['日', '一', '二', '三', '四', '五', '六'];
    return `${date.getFullYear() - 1911}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}（${w[date.getDay()]}）`;
  },

  addDays(date, days) {
    return new Date(date.getTime() + days * MS_PER_DAY);
  },

  addYearsExact(date, yrs) {
    const nd = new Date(date.getTime());
    nd.setFullYear(nd.getFullYear() + yrs);
    if (date.getMonth() === 1 && date.getDate() === 29 && nd.getMonth() === 2) {
      nd.setDate(0);
    }
    return nd;
  },

  calcDateDiff(start, end) {
    if (!start || !end || start > end) return null;
    const endEx = new Date(end.getTime() + MS_PER_DAY);
    let y = 0, m = 0;
    const addM = (d, num) => { const nd = new Date(d); nd.setMonth(nd.getMonth() + num); return nd; };
    while (addM(start, (y + 1) * 12) <= endEx) y++;
    const dY = addM(start, y * 12);
    while (addM(dY, m + 1) <= endEx) m++;
    const dYM = addM(dY, m);
    return {
      totalDays: Math.round((end - start) / MS_PER_DAY) + 1,
      y, m, d: Math.round((endEx - dYM) / MS_PER_DAY),
      remY: Math.round((endEx - dY) / MS_PER_DAY),
      remM: Math.round((endEx - dYM) / MS_PER_DAY),
      daysInY: Math.round((addM(start, (y + 1) * 12) - dY) / MS_PER_DAY),
      daysInM: Math.round((addM(dY, m + 1) - dYM) / MS_PER_DAY)
    };
  },

  formatYMD(res) {
    if (!res) return '—';
    const { y, m, d } = res;
    let s = '';
    if (y) s += `${y}年`;
    if (m) s += `${m}月`;
    if (d || (!y && !m)) s += `${d}日`;
    return s.trim();
  },

  r2(n) {
    return Math.round(n * 100) / 100;
  },

  formatOneLine(res) {
    if (!res) return '—';
    const { totalDays, y, m, remY, daysInY, remM, daysInM } = res;
    const ymd = this.formatYMD(res);
    const totalYears = y + (daysInY > 0 ? remY / daysInY : 0);
    const totalMo = y * 12 + m;
    const totalMonths = totalMo + (daysInM > 0 ? remM / daysInM : 0);
    return `${ymd} ＝ ${this.r2(totalYears)}年 ＝ ${this.r2(totalMonths)}月 ＝ ${totalDays.toLocaleString()}日`;
  },

  nativeDateToTW(val) {
    if (!val) return '';
    const [y, m, d] = val.split('-');
    return `${parseInt(y, 10) - 1911}${m}${d}`;
  },

  todayTW() {
    const t = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${t.getFullYear() - 1911}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
  },

  overlapDays(mainS, mainE, exS, exE) {
    const s = Math.max(mainS.getTime(), exS.getTime());
    const e = Math.min(mainE.getTime(), exE.getTime());
    if (s > e) return 0;
    return Math.round((e - s) / MS_PER_DAY) + 1;
  }
};

/* ══════════════════════════════════════════
   Date Calculator Manager
   ══════════════════════════════════════════ */

class DateCalculatorManager {
  constructor() {
    this.excRows = [];
    this.excIdCounter = 0;
    this.offsetDir = 'back';
    this.bindDateRange();
    this.bindExclude();
    this.bindOffset();
    this.bindAge();
    this.bindCopyOnClick();
  }

  /* ── Helpers ── */

  setupCalendarInput(container) {
    const native = container.querySelector('input[type="date"]');
    const text = container.closest('.d-input, .exc-input').querySelector('input[type="text"]');
    if (!native || !text) return;
    native.addEventListener('change', () => {
      if (!native.value) return;
      text.value = DC.nativeDateToTW(native.value);
      native.value = '';
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  filterDigits(input) {
    input.addEventListener('input', () => {
      const raw = input.value.replace(/\D/g, '').slice(0, 8);
      if (input.value !== raw) input.value = raw;
    });
  }

  setVal(el, text, isPlaceholder = false) {
    el.textContent = text;
    el.classList.toggle('placeholder', isPlaceholder);
  }

  /* ── Section 1: Date Range ── */

  bindDateRange() {
    const elS = $('dateStart'), elE = $('dateEnd');
    this.filterDigits(elS);
    this.filterDigits(elE);

    document.querySelectorAll('#tabDate .d-section:first-child .d-section-body .d-cal').forEach(cal => {
      this.setupCalendarInput(cal);
    });

    const update = () => this.calcRange();
    elS.addEventListener('input', update);
    elE.addEventListener('input', update);

    $('dateStartTodayBtn').addEventListener('click', () => {
      elS.value = DC.todayTW();
      this.calcRange();
    });

    $('dateTodayBtn').addEventListener('click', () => {
      elE.value = DC.todayTW();
      this.calcRange();
    });

    $('dateRangeClear').addEventListener('click', () => {
      elS.value = '';
      elE.value = '';
      this.excRows.forEach(r => r.el.remove());
      this.excRows = [];
      this.calcRange();
    });
  }

  calcRange() {
    const dS = DC.parseDate($('dateStart').value);
    const dE = DC.parseDate($('dateEnd').value);
    const res = DC.calcDateDiff(dS, dE);

    this.setVal($('dateResultText'), res ? DC.formatOneLine(res) : '—', !res);

    this.calcExclude(dS, dE, res);
  }

  /* ── Excluded Periods ── */

  bindExclude() {
    $('excAddBtn').addEventListener('click', () => this.addExcRow());
  }

  addExcRow(startVal = '', endVal = '') {
    this.excIdCounter++;
    const id = this.excIdCounter;
    const row = document.createElement('div');
    row.className = 'exc-row';
    row.dataset.excId = id;

    row.innerHTML = `
      <span class="exc-num">${this.excRows.length + 1}</span>
      <div class="exc-input">
        <input type="text" class="font-mono exc-s" maxlength="8" value="${startVal}">
        <div class="d-cal" title="選擇日期">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <input type="date" tabindex="-1">
        </div>
      </div>
      <span class="exc-sep">~</span>
      <div class="exc-input">
        <input type="text" class="font-mono exc-e" maxlength="8" value="${endVal}">
        <div class="d-cal" title="選擇日期">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <input type="date" tabindex="-1">
        </div>
      </div>
      <span class="exc-days font-mono">—</span>
      <button type="button" class="exc-del" title="刪除">×</button>
    `;

    const excS = row.querySelector('.exc-s');
    const excE = row.querySelector('.exc-e');
    const daysEl = row.querySelector('.exc-days');
    const delBtn = row.querySelector('.exc-del');

    this.filterDigits(excS);
    this.filterDigits(excE);

    row.querySelectorAll('.d-cal').forEach(cal => this.setupCalendarInput(cal));

    const onChange = () => this.calcRange();
    excS.addEventListener('input', onChange);
    excE.addEventListener('input', onChange);

    delBtn.addEventListener('click', () => {
      this.excRows = this.excRows.filter(r => r.id !== id);
      row.remove();
      this.renumberExcRows();
      this.calcRange();
    });

    $('excList').appendChild(row);
    this.excRows.push({ id, el: row, getS: () => excS.value, getE: () => excE.value, daysEl });
    this.calcRange();
  }

  renumberExcRows() {
    this.excRows.forEach((r, i) => {
      r.el.querySelector('.exc-num').textContent = i + 1;
    });
  }

  calcExclude(mainS, mainE, mainRes) {
    const hasExc = this.excRows.length > 0;
    $('excSummary').style.display = hasExc ? '' : 'none';
    $('excResults').style.display = hasExc ? '' : 'none';

    if (!hasExc) return;

    let totalExcDays = 0;
    this.excRows.forEach(r => {
      const s = DC.parseDate(r.getS());
      const e = DC.parseDate(r.getE());
      let days = 0;
      if (s && e && s <= e) {
        if (mainS && mainE) {
          days = DC.overlapDays(mainS, mainE, s, e);
        } else {
          days = Math.round((e - s) / MS_PER_DAY) + 1;
        }
      }
      r.daysEl.textContent = days > 0 ? `${days}日` : '—';
      totalExcDays += days;
    });

    $('excTotalDays').textContent = `${totalExcDays.toLocaleString()}日`;

    if (!mainRes || !mainS) {
      this.setVal($('netResultText'), '—', true);
      return;
    }

    const netDays = mainRes.totalDays - totalExcDays;
    if (netDays <= 0) {
      this.setVal($('netResultText'), netDays < 0 ? '（超過）' : '0日', false);
      return;
    }

    const netEnd = DC.addDays(mainS, netDays - 1);
    const netRes = DC.calcDateDiff(mainS, netEnd);
    this.setVal($('netResultText'), DC.formatOneLine(netRes), false);
  }

  /* ── Section 2: Date Offset ── */

  bindOffset() {
    const elBase = $('offBase');
    const elYY = $('offYY');
    const elMM = $('offMM');
    const elDD = $('offDD');

    this.filterDigits(elBase);
    this.filterDigits(elYY);
    this.filterDigits(elMM);
    this.filterDigits(elDD);

    const calContainer = elBase.closest('.d-input').querySelector('.d-cal');
    if (calContainer) this.setupCalendarInput(calContainer);

    elBase.addEventListener('input', () => this.calcOffset());
    elYY.addEventListener('input', () => this.calcOffset());
    elMM.addEventListener('input', () => this.calcOffset());
    elDD.addEventListener('input', () => this.calcOffset());

    $('offTodayBtn').addEventListener('click', () => {
      elBase.value = DC.todayTW();
      this.calcOffset();
    });

    document.querySelectorAll('.dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.offsetDir = btn.dataset.dir;
        this.calcOffset();
      });
    });

    $('dateOffsetClear').addEventListener('click', () => {
      elBase.value = '';
      elYY.value = '';
      elMM.value = '';
      elDD.value = '';
      this.calcOffset();
    });

    this.calcOffset();
  }

  calcOffset() {
    const base = DC.parseDate($('offBase').value);
    const y = parseInt($('offYY').value, 10) || 0;
    const m = parseInt($('offMM').value, 10) || 0;
    const d = parseInt($('offDD').value, 10) || 0;
    const resEl = $('offResult');

    if (!base || (y === 0 && m === 0 && d === 0)) {
      resEl.textContent = '—';
      return;
    }

    let result;
    if (this.offsetDir === 'back') {
      result = new Date(base.getFullYear() - y, base.getMonth() - m, base.getDate() - d + 1);
    } else {
      result = new Date(base.getFullYear() + y, base.getMonth() + m, base.getDate() + d - 1);
    }

    if (isNaN(result.getTime())) {
      resEl.textContent = '無效日期';
    } else {
      resEl.textContent = DC.formatTWFull(result);
    }
  }

  /* ── Section 3: Age ── */

  bindAge() {
    const elBirth = $('ageBirth');
    this.filterDigits(elBirth);

    const calContainer = elBirth.closest('.d-input').querySelector('.d-cal');
    if (calContainer) this.setupCalendarInput(calContainer);

    elBirth.addEventListener('input', () => this.calcAge());

    $('dateAgeClear').addEventListener('click', () => {
      elBirth.value = '';
      this.calcAge();
    });
  }

  calcAge() {
    const birth = DC.parseDate($('ageBirth').value);
    if (!birth) {
      this.setVal($('ageNow'), '—', true);
      $('ageAdultLabel').textContent = '成年日';
      this.setVal($('ageAdult'), '—', true);
      this.setVal($('age65'), '—', true);
      return;
    }

    const today = new Date();
    let ageY = today.getFullYear() - birth.getFullYear();
    let ageM = today.getMonth() - birth.getMonth();
    let ageD = today.getDate() - birth.getDate();
    if (ageD < 0) {
      ageM--;
      const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      ageD += prevMonth.getDate();
    }
    if (ageM < 0) {
      ageY--;
      ageM += 12;
    }
    this.setVal($('ageNow'), `${ageY}年${ageM}月${ageD}日`, false);

    const d18 = DC.addYearsExact(birth, 18);
    const d20 = DC.addYearsExact(birth, 20);
    const lawDate = new Date(2023, 0, 1);

    let adultDate, adultType;
    if (d20 < lawDate) {
      adultDate = d20;
      adultType = '滿20歲';
    } else if (d18 >= lawDate) {
      adultDate = d18;
      adultType = '滿18歲';
    } else {
      adultDate = lawDate;
      adultType = '修法生效';
    }

    $('ageAdultLabel').textContent = `成年日（${adultType}）`;
    this.setVal($('ageAdult'), DC.formatTWFull(adultDate), false);

    const d65 = DC.addYearsExact(birth, 65);
    this.setVal($('age65'), DC.formatTWFull(d65), false);
  }

  /* ── Copy on Click ── */

  bindCopyOnClick() {
    document.querySelectorAll('.dr-val, .offset-res-val, .age-val').forEach(el => {
      el.addEventListener('click', () => {
        const text = el.textContent;
        if (!text || text === '—') return;
        copyText(text);
        const flash = document.createElement('span');
        flash.className = 'flash-copied';
        flash.textContent = '✓';
        el.parentElement.appendChild(flash);
        setTimeout(() => flash.remove(), 1600);
      });
    });
  }
}

/* ══════════════════════════════════════════
   Holiday Service (CDN)
   ══════════════════════════════════════════ */

class HolidayService {
  constructor() {
    this.cache = {};
  }

  async loadYear(year) {
    if (this.cache[year]) return this.cache[year];
    const url = `https://cdn.jsdelivr.net/gh/imsyuan/taiwan-holidays/data/${year}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const holidays = new Set(data.filter(d => d.isHoliday).map(d => d.date));
    this.cache[year] = holidays;
    return holidays;
  }

  async isHoliday(date) {
    const year = date.getFullYear();
    const set = await this.loadYear(year);
    if (!set) return null;
    const key = `${year}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    return set.has(key);
  }

  async nextWorkday(date) {
    let d = new Date(date);
    let limit = 90;
    while (limit-- > 0) {
      const h = await this.isHoliday(d);
      if (h === null) return { date: d, fallback: true };
      if (!h) return { date: d, fallback: false };
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return { date: d, fallback: true };
  }

  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  nextWorkdayWeekendOnly(date) {
    let d = new Date(date);
    while (this.isWeekend(d)) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return d;
  }
}

/* ══════════════════════════════════════════
   Deadline Calculator - Transit Period Data
   ══════════════════════════════════════════ */

const OVERSEAS_TRANSIT = {
  '大陸或港澳': 37, '亞洲': 37, '歐洲': 44,
  '北美洲': 44, '南美洲': 44, '大洋洲': 44, '非洲': 72
};

const COURT_MAX_TRANSIT = {
  TPD: 2, SLD: 2, PCD: 2, KLD: 2, ILD: 2,
  TYD: 1, SCD: 2,
  MLD: 2, TCD: 3, CHD: 2, NTD: 3, ULD: 2,
  CYD: 2, TND: 2,
  KSD: 4, CTD: 4, KSY: 4, PTD: 4,
  HLD: 3, TTD: 4,
  PHD: 15, KMD: 19, LCD: 19,
  TPH: 4, TCH: 6, TNH: 4, KSH: 8, HLH: 4, KMH: 20,
  TPB: 4, TCB: 6, KSB: 8,
  IPC: 2, TPP: 2
};

const RESIDENCE_MAX_TRANSIT = {
  '臺北市': 2, '新北市': 2, '基隆市': 2, '宜蘭縣': 2,
  '桃園市': 1, '新竹市': 2, '新竹縣': 2,
  '苗栗縣': 2, '臺中市': 3, '彰化縣': 2, '南投縣': 3,
  '雲林縣': 2, '嘉義市': 2, '嘉義縣': 2,
  '臺南市': 2,
  '高雄市': 4, '屏東縣': 4,
  '花蓮縣': 3, '臺東縣': 4,
  '澎湖縣': 15, '金門縣': 19, '連江縣': 19
};

const IN_JURISDICTION_TRANSIT = {
  TPD: {'臺北市': 0},
  SLD: {'臺北市': 0},
  PCD: {'新北市': 2},
  KLD: {'基隆市': 0},
  ILD: {'宜蘭縣': 2},
  TYD: {'桃園市': 1},
  SCD: {'新竹市': 2, '新竹縣': 2},
  MLD: {'苗栗縣': 2},
  TCD: {'臺中市': 3},
  CHD: {'彰化縣': 2},
  NTD: {'南投縣': 3},
  ULD: {'雲林縣': 2},
  CYD: {'嘉義市': 0, '嘉義縣': 2},
  TND: {'臺南市': 2},
  KSD: {'高雄市': 4},
  CTD: {'高雄市': 4},
  KSY: {'高雄市': 4},
  PTD: {'屏東縣': 4},
  HLD: {'花蓮縣': 3},
  TTD: {'臺東縣': 4},
  PHD: {'澎湖縣': 15},
  KMD: {'金門縣': 1},
  LCD: {'連江縣': 19},
  TPH: {'臺北市': 0, '新北市': 2, '基隆市': 2, '宜蘭縣': 4, '桃園市': 3, '新竹市': 4, '新竹縣': 4},
  TCH: {'苗栗縣': 5, '臺中市': 3, '彰化縣': 5, '南投縣': 6},
  TNH: {'雲林縣': 4, '嘉義市': 4, '嘉義縣': 4, '臺南市': 2},
  KSH: {'高雄市': 4, '屏東縣': 8},
  HLH: {'花蓮縣': 3, '臺東縣': 4},
  KMH: {'金門縣': 1, '連江縣': 20},
  TPB: {'臺北市': 0, '新北市': 2, '基隆市': 2, '宜蘭縣': 4, '桃園市': 3, '新竹市': 4, '新竹縣': 4},
  TCB: {'苗栗縣': 5, '臺中市': 3, '彰化縣': 5, '南投縣': 6, '雲林縣': 5, '嘉義市': 5, '嘉義縣': 5},
  KSB: {'高雄市': 4, '屏東縣': 8, '臺南市': 6, '花蓮縣': 7, '臺東縣': 8, '澎湖縣': 19},
  IPC: {'臺北市': 0, '新北市': 2},
  TPP: {'臺北市': 0}
};

function getTransitDays(courtCode, location) {
  if (OVERSEAS_TRANSIT[location] !== undefined) {
    return OVERSEAS_TRANSIT[location];
  }

  const inJuris = IN_JURISDICTION_TRANSIT[courtCode];
  if (inJuris && location in inJuris) {
    return inJuris[location];
  }

  if (['TPD', 'SLD', 'PCD'].includes(courtCode)) {
    if (location === '臺北市') return 0;
    if (location === '新北市') return 2;
  }

  if (courtCode === 'KMD' && location === '連江縣') return 20;
  if (courtCode === 'LCD' && location === '金門縣') return 20;

  const courtMax = COURT_MAX_TRANSIT[courtCode];
  const residenceMax = RESIDENCE_MAX_TRANSIT[location];
  if (courtMax === undefined || residenceMax === undefined) return 0;
  return courtMax + residenceMax;
}

/* ══════════════════════════════════════════
   Deadline Calculator Manager
   ══════════════════════════════════════════ */

class DeadlineCalculatorManager {
  constructor(holidayService) {
    this.hs = holidayService;
    this.appealType = 'hearing';
    this.pendingCalc = 0;

    this.bindSegments();
    this.bindInputs();
    this.restoreCourt();
    this.updateSubDays();
  }

  bindSegments() {
    this.hasAgentAtCourt = false;
    this.setupSeg('dlAppealType', val => {
      this.appealType = val;
      this.updateSubDays();
      this.calc();
    });
    this.subDaysVal = '5';
    this.setupSeg('dlSubDays', val => { this.subDaysVal = val; this.calc(); });
    this.setupSeg('dlAgent', val => {
      this.hasAgentAtCourt = (val === 'yes');
      this.updateLocationLock();
      this.calc();
    });
    this.serviceType = 'normal';
    this.setupSeg('dlService', val => { this.serviceType = val; this.calc(); });
  }

  updateSubDays() {
    const row = $('dlSubDaysRow');
    const label = $('dlSubDaysLabel');
    const container = $('dlSubDays');
    if (!row || !container) return;
    const items = container.querySelectorAll('.dl-switch-item');
    const thumb = container.querySelector('.dl-switch-thumb');

    if (this.appealType === 'hearing') {
      row.style.display = '';
      if (label) label.textContent = '就審天數';
      items[0].textContent = '5日'; items[0].dataset.val = '5';
      items[1].textContent = '10日'; items[1].dataset.val = '10';
    } else {
      row.style.display = 'none';
    }
    items[0].classList.add('active');
    items[1].classList.remove('active');
    thumb.className = 'dl-switch-thumb';
    this.subDaysVal = items[0].dataset.val;

    this.updateAgentRow();
    this.updateLocationLock();
  }

  updateAgentRow() {
    const row = $('dlAgentRow');
    const label = $('dlAgentLabel');
    const container = $('dlAgent');
    if (!row || !container) return;

    if (this.appealType === 'appeal' || this.appealType === 'retrial') {
      row.style.display = '';
      if (label) label.textContent = '受特別委任訴代居住法院所在地';
    } else if (this.appealType === 'protest') {
      row.style.display = '';
      if (label) label.textContent = '得抗告之訴代居住法院所在地';
    } else {
      row.style.display = 'none';
    }

    const items = container.querySelectorAll('.dl-switch-item');
    const thumb = container.querySelector('.dl-switch-thumb');
    items[0].classList.remove('active');
    items[1].classList.add('active');
    thumb.className = 'dl-switch-thumb pos1';
    this.hasAgentAtCourt = false;
  }

  updateLocationLock() {
    const loc = $('dlLocation');
    if (!loc) return;
    const locked = this.appealType === 'hearing' || this.hasAgentAtCourt;
    loc.disabled = locked;
    loc.style.opacity = locked ? '0.4' : '';
  }

  setupSeg(id, onChange) {
    const container = $(id);
    if (!container) return;
    const items = container.querySelectorAll('.dl-switch-item');
    const thumb = container.querySelector('.dl-switch-thumb');
    items.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        items.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        thumb.className = 'dl-switch-thumb' + (idx > 0 ? ` pos${idx}` : '');
        onChange(btn.dataset.val);
      });
    });
  }

  bindInputs() {
    const court = $('dlCourt');
    const location = $('dlLocation');
    const dateInput = $('dlDate');

    court.addEventListener('change', () => {
      localStorage.setItem('civilCalc_court', court.value);
      this.calc();
    });
    location.addEventListener('change', () => this.calc());
    dateInput.addEventListener('input', () => {
      const raw = dateInput.value.replace(/\D/g, '').slice(0, 8);
      if (dateInput.value !== raw) dateInput.value = raw;
      this.calc();
    });

    const calContainer = dateInput.closest('.d-input').querySelector('.d-cal');
    if (calContainer) {
      const native = calContainer.querySelector('input[type="date"]');
      native.addEventListener('change', () => {
        if (!native.value) return;
        dateInput.value = DC.nativeDateToTW(native.value);
        native.value = '';
        this.calc();
      });
    }

    const clearBtn = $('dlClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => this.resetAll());
  }

  resetAll() {
    $('dlDate').value = '';
    $('dlLocation').value = $('dlLocation').querySelector('option').value;

    const resetSeg = (id, targetIdx) => {
      const container = $(id);
      if (!container) return;
      const items = container.querySelectorAll('.dl-switch-item');
      const thumb = container.querySelector('.dl-switch-thumb');
      items.forEach(b => b.classList.remove('active'));
      items[targetIdx].classList.add('active');
      thumb.className = 'dl-switch-thumb' + (targetIdx > 0 ? ` pos${targetIdx}` : '');
    };

    resetSeg('dlAppealType', 0);
    this.appealType = 'hearing';

    resetSeg('dlService', 0);
    this.serviceType = 'normal';

    resetSeg('dlAgent', 1);
    this.hasAgentAtCourt = false;

    this.updateSubDays();
    this.updateLocationLock();
    this.clear();
  }

  restoreCourt() {
    const saved = localStorage.getItem('civilCalc_court');
    if (saved && $('dlCourt').querySelector(`option[value="${saved}"]`)) {
      $('dlCourt').value = saved;
    }
  }

  clear(clearInput = false) {
    if (clearInput) $('dlDate').value = '';
    this.setResult('dlResA', '—', true);
    this.setResult('dlResB', '—', true);
    this.setResult('dlResC', '—', true);
    this.setResult('dlResTotal', '—', true);
    this.setResult('dlResRaw', '—', true);
    this.setResult('dlResFinal', '—', true);
  }

  setResult(id, text, isPlaceholder = false, cls = '') {
    const el = $(id);
    el.textContent = text;
    const base = el.classList.contains('dl-period-val') ? 'dl-period-val' : 'dl-res-val';
    el.className = `${base} font-mono` + (isPlaceholder ? ' placeholder' : '') + (cls ? ` ${cls}` : '');
  }

  getInvariantDays() {
    if (this.appealType === 'appeal') return 20;
    if (this.appealType === 'retrial') return 30;
    if (this.appealType === 'hearing') return parseInt(this.subDaysVal, 10) || 5;
    if (this.appealType === 'protest') return 10;
    return 20;
  }

  getServiceDays() {
    if (this.serviceType === 'deposit') return 10;
    if (this.serviceType === 'public_domestic') return 20;
    if (this.serviceType === 'public_foreign') return 60;
    if (this.serviceType === 'public_again') return 1;
    return 0;
  }

  async calc() {
    const serviceDate = DC.parseDate($('dlDate').value);
    if (!serviceDate) {
      this.clear();
      return;
    }

    const A = this.getInvariantDays();
    const B = (this.appealType === 'hearing' || this.hasAgentAtCourt) ? 0 : getTransitDays($('dlCourt').value, $('dlLocation').value);
    const C = this.getServiceDays();
    const total = A + B + C;

    this.setResult('dlResA', `${A}日`);
    this.setResult('dlResB', `${B}日`);
    this.setResult('dlResC', `${C}日`);
    this.setResult('dlResTotal', `${total}日`);

    const rawDeadline = new Date(
      serviceDate.getFullYear(), serviceDate.getMonth(), serviceDate.getDate() + total
    );
    this.setResult('dlResRaw', DC.formatTWFull(rawDeadline));

    this.setResult('dlResFinal', '查詢中…', false, 'loading');

    const calcId = ++this.pendingCalc;
    try {
      const result = await this.hs.nextWorkday(rawDeadline);
      if (calcId !== this.pendingCalc) return;

      if (result.fallback) {
        const fallbackDate = this.hs.nextWorkdayWeekendOnly(rawDeadline);
        const note = rawDeadline.getTime() === fallbackDate.getTime() ? '' : '（僅判斷週六日）';
        this.setResult('dlResFinal',
          DC.formatTWFull(fallbackDate) + note, false, 'final-val');
      } else {
        this.setResult('dlResFinal', DC.formatTWFull(result.date), false, 'final-val');
      }
    } catch {
      if (calcId !== this.pendingCalc) return;
      const fallbackDate = this.hs.nextWorkdayWeekendOnly(rawDeadline);
      const note = '（假日資料無法載入，僅判斷週六日）';
      this.setResult('dlResFinal',
        DC.formatTWFull(fallbackDate) + note, false, 'error');
    }
  }
}

/* ══════════════════════════════════════════
   Delay Interest (遲延利息)
   ══════════════════════════════════════════ */

const IU = {
  num(val) {
    return Number(String(val || '').replace(/[^\d.-]/g, '')) || 0;
  },

  formatMoney(val) {
    if (!val && val !== 0) return '';
    const parts = String(val).replace(/[^\d.-]/g, '').split('.');
    parts[0] = parts[0] ? Number(parts[0]).toLocaleString('en-US') : '';
    return parts.join('.');
  },

  formatYears(res) {
    if (!res) return '';
    const { y, remY, daysInY } = res;
    return remY ? `${y ? `${y}年 ` : ''}${remY}/${daysInY}年` : `${y}年`;
  },

  calcDelayInterestRaw(p, rAnnual, dateDiffRes) {
    if (!dateDiffRes || p <= 0 || rAnnual <= 0) return { raw: 0, display: '' };
    const { y, remY, daysInY } = dateDiffRes;
    let raw = p * rAnnual * y;
    if (remY > 0 && daysInY > 0) raw += p * rAnnual * (remY / daysInY);
    return { raw, display: IU.formatYears(dateDiffRes) };
  },

  formatInterest(raw) {
    if (!raw && raw !== 0) return '';
    const n = Math.round(Number(raw) * 100) / 100;
    return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }
};

const INT_CAL_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

class InterestCalculatorManager {
  constructor(feeManager, tabManager) {
    this.feeManager = feeManager;
    this.tabManager = tabManager;
    this.container = $('intGroups');
    this.nextId = 1;
    this.groups = [this.newGroup()];

    this.container.addEventListener('input', e => this.onInput(e));
    this.container.addEventListener('click', e => this.onClick(e));
    $('intResetBtn').addEventListener('click', () => this.reset());
    $('intPrintBtn').addEventListener('click', () => this.print());
    $('intImportFeeBtn').addEventListener('click', e => this.importToFee(e.target));

    this.render();
  }

  newGroup() {
    const gid = this.nextId++;
    return {
      id: gid,
      a: '',
      segments: [{ id: this.nextId++, p: '', r: '5', s: '', e: '' }]
    };
  }

  newSegment() {
    return { id: this.nextId++, p: '', r: '5', s: '', e: '' };
  }

  findGroup(gid) {
    return this.groups.find(g => g.id === gid);
  }

  findSegment(g, sid) {
    return g.segments.find(s => s.id === sid);
  }

  compute() {
    let totalA = 0;
    let sumIntRaw = 0;
    let htmlRows = '';
    const rows = [];

    const computedGroups = this.groups.map((g, gIdx) => {
      const aNum = IU.num(g.a);
      totalA += aNum;
      let groupIntRaw = 0;
      const computedSegments = g.segments.map((seg, sIdx) => {
        const bNum = IU.num(seg.p);
        const rDec = IU.num(seg.r) / 100;
        const ds = DC.parseDate(seg.s);
        const de = DC.parseDate(seg.e);
        let interestRaw = 0;
        let hasCalc = false;
        const dateDiffRes = ds && de && ds <= de ? DC.calcDateDiff(ds, de) : null;
        const yearDisplay = IU.formatYears(dateDiffRes);
        if (dateDiffRes && bNum > 0 && IU.num(seg.r) > 0) {
          interestRaw = IU.calcDelayInterestRaw(bNum, rDec, dateDiffRes).raw;
          hasCalc = true;
          sumIntRaw += interestRaw;
          const cell = IU.formatInterest(interestRaw);
          htmlRows += `<tr><td>本金群組 ${gIdx + 1} 期間${sIdx + 1}</td><td class="text-right">${bNum.toLocaleString()}</td><td>${DC.formatTW(ds)}</td><td>${DC.formatTW(de)}</td><td>${seg.r}%</td><td>${yearDisplay}</td><td class="text-right">${cell}</td></tr>`;
          rows.push({ gIdx: gIdx + 1, sIdx: sIdx + 1, bNum, ds, de, rate: seg.r, yearDisplay, cell });
        }
        groupIntRaw += interestRaw;
        return { ...seg, interestRaw, yearDisplay, hasCalc, interestDisplay: hasCalc ? IU.formatInterest(interestRaw) : '' };
      });
      return { ...g, numericA: aNum, computedSegments, groupIntRaw };
    });

    const totalInt = Math.round(sumIntRaw);
    const grandTotal = totalA + totalInt;
    return {
      valid: grandTotal > 0,
      hasPrintRows: rows.length > 0,
      totalA,
      totalInt,
      grandTotal,
      computedGroups,
      htmlRows
    };
  }

  render() {
    const res = this.compute();
    this.container.innerHTML = res.computedGroups.map((g, i) => this.groupHtml(g, i, res.computedGroups.length)).join('');
    this.container.querySelectorAll('.d-cal').forEach(cal => this.setupCalendar(cal));
    this.updateSummary(res);
  }

  refreshResults() {
    const res = this.compute();
    res.computedGroups.forEach(g => {
      const el = this.container.querySelector(`[data-gid="${g.id}"]`);
      if (!el) return;
      g.computedSegments.forEach(seg => {
        const row = el.querySelector(`[data-sid="${seg.id}"]`);
        if (!row) return;
        const years = row.querySelector('.ic-years');
        if (years) years.textContent = this.periodYearsLabel(seg);
      });
      const foot = el.querySelector('.ic-card__foot');
      if (foot) foot.outerHTML = this.cardFootHtml(g);
    });
    this.updateSummary(res);
  }

  updateSummary(res) {
    $('intTotalA').textContent = `$${res.totalA.toLocaleString()}`;
    $('intTotalInt').textContent = `$${res.totalInt.toLocaleString()}`;
    $('intGrandTotal').textContent = `$${res.grandTotal.toLocaleString()}`;
    $('intPrintBtn').disabled = !res.hasPrintRows;
    $('intImportFeeBtn').disabled = !res.valid;
  }

  moneyInput(field, value, accent = false) {
    const cls = accent ? 'ic-money ic-money--p ic-money--w9' : 'ic-money ic-money--w9';
    return `<div class="${cls}">
      <span class="ic-money__pre">$</span>
      <input type="text" data-field="${field}" value="${escHtml(IU.formatMoney(value))}" inputmode="numeric">
    </div>`;
  }

  dateInput(field, value) {
    return `<div class="ic-date-7">
      <input type="text" data-field="${field}" class="font-mono" maxlength="8" value="${escHtml(value)}">
      <div class="d-cal" title="選擇日期">${INT_CAL_SVG}<input type="date" tabindex="-1"></div>
    </div>`;
  }

  cardFootHtml(g) {
    const sum = IU.formatInterest(g.numericA + g.groupIntRaw);
    return `<div class="ic-card__foot">
      <div class="ic-stat">本金<b>$${g.numericA.toLocaleString()}</b></div>
      <div class="ic-stat">利息<b class="accent">$${IU.formatInterest(g.groupIntRaw)}</b></div>
      <div class="ic-stat">合計<b class="grand">$${sum}</b></div>
    </div>`;
  }

  groupHtml(g, index, groupCount) {
    const segs = g.computedSegments.map((seg, sIdx) => this.segHtml(g.id, seg, sIdx)).join('');
    const n = String(index + 1).padStart(2, '0');
    return `
      <article class="ic-card" data-gid="${g.id}">
        <header class="ic-card__head">
          <span class="ic-badge">${n}</span>
          <span class="ic-lbl">本金</span>
          ${this.moneyInput('a', g.a)}
          <div class="ic-tools">
            <button type="button" class="ic-btn" data-action="add-group" title="新增本金群組">+</button>
            <button type="button" class="ic-btn ic-btn--del" data-action="del-group" title="刪除此群組" ${groupCount <= 1 ? 'disabled' : ''}>×</button>
          </div>
        </header>
        ${segs}
        ${this.cardFootHtml(g)}
      </article>`;
  }

  periodYearsLabel(seg) {
    if (!seg.yearDisplay) return '';
    return `${seg.yearDisplay}${seg.interestDisplay ? ` · $${seg.interestDisplay}` : ''}`;
  }

  segHtml(gid, seg, sIdx) {
    const years = this.periodYearsLabel(seg);
    return `
      <section class="ic-period" data-gid="${gid}" data-sid="${seg.id}">
        <div class="ic-period__bar">
          <span class="ic-period__title">利息/違約金 #${sIdx + 1}</span>
          <div class="ic-tools">
            <button type="button" class="ic-btn" data-action="add-seg" title="新增利息/違約金">+</button>
            <button type="button" class="ic-btn ic-btn--del" data-action="del-seg" title="刪除此項">×</button>
          </div>
        </div>
        <div class="ic-form">
          <div class="ic-form__principal">
            <span class="ic-lbl">計息本金</span>
            ${this.moneyInput('p', seg.p, true)}
            <span class="ic-years">${years}</span>
          </div>
          <div class="ic-form__dates">
            <div class="ic-form__dates-row">
              <span class="ic-lbl">起日</span>
              ${this.dateInput('s', seg.s)}
              <span class="ic-date-sep">-</span>
              <span class="ic-lbl">迄日</span>
              ${this.dateInput('e', seg.e)}
            </div>
            <div class="ic-form__rate">
              <span class="ic-lbl">年息</span>
              <input type="text" class="ic-rate" data-field="r" value="${escHtml(seg.r)}">
              <span class="ic-pct">%</span>
            </div>
          </div>
        </div>
      </section>`;
  }

  setupCalendar(calEl) {
    const native = calEl.querySelector('input[type="date"]');
    const text = calEl.closest('.d-input, .ic-date-7').querySelector('input[type="text"]');
    if (!native || !text) return;
    native.addEventListener('change', () => {
      if (!native.value) return;
      text.value = DC.nativeDateToTW(native.value);
      native.value = '';
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  onInput(e) {
    const input = e.target;
    const field = input.dataset.field;
    if (!field) return;
    const row = input.closest('[data-sid]');
    const groupEl = input.closest('[data-gid]');
    if (!row && field !== 'a') return;
    const gid = Number((groupEl || row).dataset.gid);
    const g = this.findGroup(gid);
    if (!g) return;

    if (field === 'a') {
      g.a = input.value.replace(/[^\d]/g, '').slice(0, 9);
      input.value = IU.formatMoney(g.a);
    } else {
      const sid = Number(row.dataset.sid);
      const seg = this.findSegment(g, sid);
      if (!seg) return;
      if (field === 'p') {
        seg.p = input.value.replace(/[^\d]/g, '').slice(0, 9);
        input.value = IU.formatMoney(seg.p);
      } else if (field === 'r') {
        seg.r = input.value.replace(/[^\d.]/g, '');
        input.value = seg.r;
      } else if (field === 's' || field === 'e') {
        seg[field] = input.value.replace(/\D/g, '').slice(0, 8);
        input.value = seg[field];
      }
    }
    this.refreshResults();
  }

  onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const groupEl = btn.closest('[data-gid]');
    const row = btn.closest('[data-sid]');
    const gid = groupEl ? Number(groupEl.dataset.gid) : null;

    if (action === 'add-group') {
      this.groups.push(this.newGroup());
      this.render();
      return;
    }
    if (action === 'del-group' && this.groups.length > 1) {
      this.groups = this.groups.filter(g => g.id !== gid);
      this.render();
      return;
    }
    const g = this.findGroup(gid);
    if (!g) return;
    const sid = row ? Number(row.dataset.sid) : null;
    const sIdx = g.segments.findIndex(s => s.id === sid);

    if (action === 'add-seg') {
      g.segments.splice(sIdx + 1, 0, this.newSegment());
      this.render();
    } else if (action === 'del-seg') {
      if (g.segments.length <= 1) {
        const seg = g.segments[0];
        seg.p = ''; seg.s = ''; seg.e = ''; seg.r = '5';
      } else {
        g.segments = g.segments.filter(s => s.id !== sid);
      }
      this.render();
    }
  }

  reset() {
    this.nextId = 1;
    this.groups = [this.newGroup()];
    this.render();
  }

  print() {
    const res = this.compute();
    if (!res.hasPrintRows) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>遲延利息試算明細</title><style>body{font-family:'Microsoft JhengHei',sans-serif;padding:30px;line-height:1.6;color:#000}table{width:100%;border-collapse:collapse;margin:15px 0;font-size:14px}th,td{border:1px solid #333;padding:8px;text-align:center}th{background:#f4f4f5}.text-right{text-align:right}h2{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:20px;text-align:center}.total-row td{font-weight:bold;background:#fafafa}.summary{border:2px solid #000;padding:20px;margin-top:30px;font-size:16px;background:#f8fafc}</style></head><body><h2>遲延利息試算明細</h2><p><strong>請求金額合計：</strong> ${res.totalA.toLocaleString()} 元　<strong>總利息：</strong> ${res.totalInt.toLocaleString()} 元</p><table><thead><tr><th>列項</th><th class="text-right">計息本金</th><th>計息起日</th><th>計息迄日</th><th>年息</th><th>折算年數</th><th class="text-right">各期利息（元）</th></tr></thead><tbody>${res.htmlRows}<tr class="total-row"><td colspan="6" class="text-right">利息總計</td><td class="text-right">${res.totalInt.toLocaleString()}</td></tr></tbody></table><div class="summary"><strong>請求總額（A＋C）：</strong> <span style="font-size:20px;color:#b91c1c;">${res.grandTotal.toLocaleString()}</span> 元</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 250);
  }

  importToFee(btn) {
    const res = this.compute();
    if (!res.valid) return;
    if (this.feeManager.importAmount(res.grandTotal, btn)) {
      this.tabManager.activate('tabCalc');
    }
  }
}

/* ══════════════════════════════════════════
   Vehicle Depreciation (車輛修復費折舊)
   ══════════════════════════════════════════ */

const DEP_RATES = {
  motorcycle: { rate: 0.536, limitY: 3, label: '機車' },
  transport: { rate: 0.438, limitY: 4, label: '運輸業用客車、貨車' },
  'non-transport': { rate: 0.369, limitY: 5, label: '非運輸業用客車、貨車' }
};

function parseMfgDate(str) {
  let parseTarget = String(str || '').replace(/[^\d]/g, '');
  if (!parseTarget) return null;
  if (parseTarget.length <= 4) parseTarget += '0101';
  else if (parseTarget.length === 5) parseTarget += '01';
  else if (parseTarget.length === 6 && (parseTarget.startsWith('19') || parseTarget.startsWith('20'))) {
    parseTarget += '01';
  }
  return DC.parseDate(parseTarget);
}

function getDepConfig(state) {
  if (state.type === 'custom') {
    const limitY = Math.max(1, parseInt(state.yrs, 10) || 0);
    if (!limitY) return { rate: 0, limitY: 0, label: '系爭車輛' };
    const rate = Math.round((1 - Math.pow(0.1, 1 / limitY)) * 1000) / 1000;
    return { rate, limitY, label: '系爭車輛' };
  }
  return DEP_RATES[state.type] || DEP_RATES['non-transport'];
}

function computeDepreciation(state) {
  const cfg = getDepConfig(state);
  const rate = cfg.rate;
  const limitY = cfg.limitY;

  const dMfg = parseMfgDate(state.mfg);
  const dAcc = DC.parseDate(state.acc);
  const valid = Boolean(dMfg && dAcc && dAcc >= dMfg);

  let usageM = 0;
  if (valid) {
    usageM = (dAcc.getFullYear() - dMfg.getFullYear()) * 12
      + dAcc.getMonth() - dMfg.getMonth()
      + (dAcc.getDate() > dMfg.getDate() ? 1 : 0);
    if (usageM <= 0) usageM = 1;
  }

  const c = {
    p: IU.num(state.parts),
    l: IU.num(state.labor),
    pt: IU.num(state.paint),
    m: IU.num(state.metal),
    o: IU.num(state.other)
  };

  let text = '';
  let tableText = '';
  const preTotal = c.p + c.l + c.pt + c.m + c.o;
  let totalVal = c.l + c.pt + c.m + c.o;
  let residual = c.p;
  let usageText = '';

  if (valid) {
    const y = Math.floor(usageM / 12);
    const m = usageM % 12;
    usageText = `${y > 0 ? `${y}年` : ''}${m > 0 || y === 0 ? `${m}月` : ''}`;
  }

  if (valid && c.p > 0) {
    const typeLabel = cfg.label;
    const mfgStr = `${dMfg.getFullYear() - 1911}年${dMfg.getMonth() + 1}月`;

    tableText = '\n\n附表：\n折舊時間\t\t金額\n';
    let currentVal = c.p;
    let totalDep = 0;
    const limit = Math.round(c.p * 0.9);
    const fullYears = Math.floor(usageM / 12);
    const remMonths = usageM % 12;
    const totalSteps = remMonths > 0 ? fullYears + 1 : fullYears;

    for (let i = 1; i <= Math.max(totalSteps, 1); i++) {
      if (limitY > 0 && i > limitY) {
        tableText += `第${i}年折舊值\t\t0\n第${i}年折舊後價值\t${currentVal.toLocaleString()}-0=${currentVal.toLocaleString()}\n`;
        continue;
      }
      let depVal = 0;
      let calcStr = '';
      const originalCalc = Math.round(currentVal * rate * (i <= fullYears ? 1 : (remMonths / 12)));
      if (totalDep + originalCalc > limit) {
        depVal = Math.max(limit - totalDep, 0);
        calcStr = `${currentVal.toLocaleString()}×${rate}${i <= fullYears ? '' : `×(${remMonths}/12)`}=${originalCalc.toLocaleString()} (受殘值1/10限制，截為${depVal.toLocaleString()})`;
      } else {
        depVal = originalCalc;
        calcStr = `${currentVal.toLocaleString()}×${rate}${i <= fullYears ? '' : `×(${remMonths}/12)`}=${depVal.toLocaleString()}`;
      }
      if (depVal === 0 && currentVal <= c.p - limit) calcStr = '0 (已達殘值下限)';

      tableText += `第${i}年折舊值\t\t${calcStr}\n`;
      const newVal = currentVal - depVal;
      tableText += `第${i}年折舊後價值\t${currentVal.toLocaleString()}-${depVal.toLocaleString()}=${newVal.toLocaleString()}\n`;
      currentVal = newVal;
      totalDep += depVal;
    }
    residual = currentVal;
    totalVal += residual;

    const nonDepItems = [];
    if (c.l > 0) nonDepItems.push(`工資 ${c.l.toLocaleString()} 元`);
    if (c.pt > 0) nonDepItems.push(`烤漆 ${c.pt.toLocaleString()} 元`);
    if (c.m > 0) nonDepItems.push(`鈑金 ${c.m.toLocaleString()} 元`);
    if (c.o > 0) nonDepItems.push(`其他 ${c.o.toLocaleString()} 元`);

    text = `依行政院「固定資產耐用年數表」及「折舊率表」規定，${typeLabel}耐用年數為 ${limitY} 年，依定率遞減法折舊千分之 ${Math.round(rate * 1000)}。查系爭車輛自${mfgStr}出廠，迄折舊基準日已使用${usageText}，零件扣除折舊後估定為 ${residual.toLocaleString()} 元`;

    if (nonDepItems.length > 0) {
      text += `，加計無庸扣除折舊之${nonDepItems.join('、')}後，原告得請求 ${totalVal.toLocaleString()} 元。`;
    } else {
      text += `，原告得請求 ${totalVal.toLocaleString()} 元。`;
    }
  } else if (valid) {
    totalVal += residual;
  }

  return {
    valid,
    text: valid && c.p > 0 ? text + tableText : '',
    total: totalVal,
    preTotal,
    usageText,
    rate,
    limitY
  };
}

class DepreciationCalculatorManager {
  constructor() {
    this.type = 'non-transport';
    this.customYrs = '';
    this.el = {};
    this.bound = false;
    this.bind();
  }

  /** 於 #tabDepreciation 內查詢，避免與其他分頁衝突或 DOM 未就緒 */
  bind() {
    if (this.bound) return true;
    const root = document.getElementById('tabDepreciation');
    if (!root) return false;

    const q = id => root.querySelector('#' + id);
    const map = {
      acc: q('depAcc'),
      mfg: q('depMfg'),
      parts: q('depParts'),
      labor: q('depLabor'),
      paint: q('depPaint'),
      metal: q('depMetal'),
      other: q('depOther'),
      preTotal: q('depPreTotal'),
      total: q('depTotal'),
      usage: q('depUsage'),
      draft: q('depDraft'),
      typeSwitch: q('depTypeSwitch'),
      customWrap: q('depCustomWrap'),
      customYrs: q('depCustomYrs'),
      rate: q('depRate'),
      copyBtn: q('depCopyBtn'),
      resetBtn: q('depResetBtn')
    };

    for (const el of Object.values(map)) {
      if (!el) return false;
    }
    this.el = map;

    ['acc', 'mfg'].forEach(key => {
      this.filterDigits(this.el[key]);
      const cal = this.el[key].closest('.d-input')?.querySelector('.d-cal');
      if (cal) this.setupCalendar(cal, this.el[key]);
    });

    ['parts', 'labor', 'paint', 'metal', 'other'].forEach(key => {
      this.el[key].addEventListener('input', () => {
        this.el[key].value = IU.formatMoney(this.el[key].value);
        this.recalc();
      });
    });

    this.el.acc.addEventListener('input', () => this.recalc());
    this.el.mfg.addEventListener('input', () => this.recalc());

    this.el.customYrs.addEventListener('input', () => {
      this.el.customYrs.value = this.el.customYrs.value.replace(/\D/g, '').slice(0, 2);
      this.customYrs = this.el.customYrs.value;
      if (this.el.customYrs.value && this.type !== 'custom') {
        this.setType('custom', { focus: false });
      } else {
        this.recalc();
      }
    });

    this.setupTypeSwitch();

    this.el.copyBtn.addEventListener('click', e => {
      const t = this.el.draft.value.trim();
      if (!t) return;
      copyText(t);
      flashBtn(e.target, '已複製✓', '#16a34a');
    });

    this.el.resetBtn.addEventListener('click', e => this.reset(e.target));

    this.bound = true;
    this.recalc();
    return true;
  }

  setupTypeSwitch() {
    const container = this.el.typeSwitch;
    if (!container) return;
    container.querySelectorAll('.dl-switch-item').forEach(btn => {
      btn.addEventListener('click', () => this.setType(btn.dataset.val));
    });
  }

  syncTypeSwitchUI(type) {
    const container = this.el.typeSwitch;
    if (!container) return;
    const items = container.querySelectorAll('.dl-switch-item');
    const thumb = container.querySelector('.dl-switch-thumb');
    items.forEach((btn, idx) => {
      const on = btn.dataset.val === type;
      btn.classList.toggle('active', on);
      if (on) thumb.className = 'dl-switch-thumb' + (idx > 0 ? ` pos${idx}` : '');
    });
  }

  filterDigits(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const raw = input.value.replace(/\D/g, '').slice(0, 8);
      if (input.value !== raw) input.value = raw;
    });
  }

  setupCalendar(container, textInput) {
    const native = container.querySelector('input[type="date"]');
    if (!native) return;
    native.addEventListener('change', () => {
      if (!native.value) return;
      textInput.value = DC.nativeDateToTW(native.value);
      native.value = '';
      this.recalc();
    });
  }

  setType(type, opts = {}) {
    this.type = type;
    this.syncTypeSwitchUI(type);
    if (type === 'custom' && opts.focus !== false) this.el.customYrs.focus();
    this.recalc();
  }

  getState() {
    return {
      type: this.type,
      yrs: this.el.customYrs.value,
      acc: this.el.acc.value,
      mfg: this.el.mfg.value,
      parts: this.el.parts.value,
      labor: this.el.labor.value,
      paint: this.el.paint.value,
      metal: this.el.metal.value,
      other: this.el.other.value
    };
  }

  recalc() {
    if (!this.bound && !this.bind()) return;
    const state = this.getState();
    const cfg = getDepConfig(state);
    const res = computeDepreciation(state);
    this.el.preTotal.textContent = `$${res.preTotal.toLocaleString()}`;
    this.el.total.textContent = `$${res.total.toLocaleString()}`;

    if (res.usageText) {
      this.el.usage.textContent = res.usageText;
      this.el.usage.classList.remove('placeholder');
    } else {
      this.el.usage.textContent = '—';
      this.el.usage.classList.add('placeholder');
    }

    if (this.el.rate) {
      if (cfg.limitY > 0 && cfg.rate > 0) {
        this.el.rate.textContent = `${cfg.limitY}年 · ${Math.round(cfg.rate * 1000)}‰`;
        this.el.rate.classList.remove('placeholder');
      } else {
        this.el.rate.textContent = '—';
        this.el.rate.classList.add('placeholder');
      }
    }

    this.el.draft.value = res.text;

    if (this.el.copyBtn) this.el.copyBtn.disabled = !this.el.draft.value.trim();
  }

  reset(btn) {
    if (!this.bound) return;
    ['acc', 'mfg', 'parts', 'labor', 'paint', 'metal', 'other'].forEach(key => {
      this.el[key].value = '';
    });
    this.el.customYrs.value = '';
    this.customYrs = '';
    this.el.draft.value = '';
    this.setType('non-transport', { focus: false });
    if (btn) flashBtn(btn, '已清除✓');
  }
}

/* ══════════════════════════════════════════
   Tab Management
   ══════════════════════════════════════════ */

class TabManager {
  constructor() {
    this.panels = document.querySelectorAll('.tab-panel');
    this.switchEl = $('tabSwitch');
    this.thumb = $('tabSwitchThumb');
    this.primaryTexts = this.switchEl.querySelectorAll('.tab-switch-text');
    this.secondaryTabs = [
      { id: 'tabInterest', btn: $('tabInterestBtn') },
      { id: 'tabDepreciation', btn: $('tabDepreciationBtn') }
    ];
    this.secondaryIds = this.secondaryTabs.map(t => t.id);
    this.primaryIds = ['tabCalc', 'tabDeadline', 'tabDate'];

    this.primaryTexts.forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activate(t.dataset.tab);
      });
    });
    this.secondaryTabs.forEach(({ id, btn }) => {
      btn.addEventListener('click', () => this.activate(id));
    });

    const saved = localStorage.getItem('civilCalc_activeTab');
    this.activate(saved && document.getElementById(saved) ? saved : 'tabCalc');
  }

  activate(tabId) {
    this.active = tabId;
    const isSecondary = this.secondaryIds.includes(tabId);
    this.secondaryTabs.forEach(({ id, btn }) => {
      btn.classList.toggle('active', tabId === id);
    });
    this.switchEl.classList.toggle('inactive', isSecondary);

    const idx = this.primaryIds.indexOf(tabId);
    if (idx >= 0) {
      this.thumb.className = 'tab-switch-thumb' + (idx > 0 ? ` pos${idx}` : '');
      this.primaryTexts.forEach(t => {
        t.style.color = t.dataset.tab === tabId ? '#fff' : '';
      });
    } else {
      this.primaryTexts.forEach(t => { t.style.color = ''; });
    }

    this.panels.forEach(p => p.classList.toggle('active', p.id === tabId));
    localStorage.setItem('civilCalc_activeTab', tabId);
    if (tabId === 'tabDepreciation' && typeof depreciationCalc !== 'undefined') {
      depreciationCalc.bind();
    }
  }
}

/* ══════════════════════════════════════════
   Initialization
   ══════════════════════════════════════════ */

const IS_SIDEPANEL = new URLSearchParams(location.search).has('sidepanel');
const ui = new UIManager();
const feeManager = new CourtFeeManager(ui);
const holidayService = new HolidayService();
const deadlineCalc = new DeadlineCalculatorManager(holidayService);
const dateCalc = new DateCalculatorManager();
const depreciationCalc = new DepreciationCalculatorManager();
const tabManager = new TabManager();
const interestCalc = new InterestCalculatorManager(feeManager, tabManager);

if (IS_SIDEPANEL) {
  document.documentElement.classList.add('sidepanel');
  document.body.classList.add('sidepanel');
  $('pinBtn').classList.add('active');
  $('pinBtn').title = '取消釘選';
  chrome.storage.local.get('_pinnedState', ({ _pinnedState: s }) => {
    if (!s) return;
    if (s.input) { ui.inputBox.value = s.input; ui.onInput(); }
    if (s.feeType) feeManager.setType(s.feeType);
    if (s.feeInput) { feeManager.el.input.value = s.feeInput; feeManager.calc(); }
    if (s.activeTab) tabManager.activate(s.activeTab);
    chrome.storage.local.remove('_pinnedState');
  });
}

$('pinBtn').addEventListener('click', () => {
  if (IS_SIDEPANEL) { window.close(); return; }
  const state = {
    input: ui.inputBox.value,
    feeInput: feeManager.el.input.value,
    feeType: feeManager.type,
    activeTab: localStorage.getItem('civilCalc_activeTab') || 'tabCalc'
  };
  chrome.storage.local.set({ _pinnedState: state }, () => {
    chrome.sidePanel.setOptions({ path: 'popup.html?sidepanel=1', enabled: true });
    chrome.windows.getCurrent(w => {
      chrome.sidePanel.open({ windowId: w.id });
      window.close();
    });
  });
});
