const FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const $ = id => document.getElementById(id);

function copyText(text) { navigator.clipboard.writeText(text); }

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
    this.el.input.value = FMT.format(sum);
    this.calc();
    flashBtn(btn, '已帶入✓', '#16a34a');
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

  formatDays(res) {
    if (!res) return '—';
    return `${res.totalDays.toLocaleString()}日`;
  },

  formatMonths(res) {
    if (!res) return '—';
    const { y, m, remM, daysInM } = res;
    const totalMo = y * 12 + m;
    return remM
      ? `${totalMo ? `${totalMo}月 ` : ''}${remM}/${daysInM}月`
      : `${totalMo}月`;
  },

  formatYears(res) {
    if (!res) return '—';
    const { y, remY, daysInY } = res;
    return remY
      ? `${y ? `${y}年 ` : ''}${remY}/${daysInY}年`
      : `${y}年`;
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
    this.subDaysVal = 'first';
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
   Tab Management
   ══════════════════════════════════════════ */

class TabManager {
  constructor() {
    this.panels = document.querySelectorAll('.tab-panel');
    this.thumb = $('tabSwitchThumb');
    this.texts = document.querySelectorAll('.tab-switch-text');
    this.tabIds = ['tabCalc', 'tabDeadline', 'tabDate'];

    this.texts.forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activate(t.dataset.tab);
      });
    });

    const saved = localStorage.getItem('civilCalc_activeTab');
    this.activate(saved && document.getElementById(saved) ? saved : 'tabCalc');
  }

  activate(tabId) {
    this.active = tabId;
    const idx = this.tabIds.indexOf(tabId);
    this.thumb.className = 'tab-switch-thumb' + (idx > 0 ? ` pos${idx}` : '');
    this.texts.forEach(t => {
      t.style.color = t.dataset.tab === tabId ? '#fff' : '';
    });
    this.panels.forEach(p => p.classList.toggle('active', p.id === tabId));
    localStorage.setItem('civilCalc_activeTab', tabId);
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
const tabManager = new TabManager();
const dateCalc = new DateCalculatorManager();

if (IS_SIDEPANEL) {
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
