'use strict';

/* =====================================================================
   Replacement Theory simulator
   Scenario 1: gradual deterioration (Models 1 and 2)
   Scenario 2: sudden failure, individual vs group replacement
   ===================================================================== */

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const inr1 = n => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
const num = sel => { const v = parseFloat($(sel).value); return Number.isFinite(v) ? v : 0; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COL = {};
const FONT = getComputedStyle(document.body).fontFamily;
function loadColours() {
  COL.ink = cssVar('--ink'); COL.inkSoft = cssVar('--ink-soft'); COL.muted = cssVar('--muted');
  COL.grid = cssVar('--grid'); COL.amber = cssVar('--amber'); COL.amberSoft = cssVar('--amber-soft');
  COL.teal = cssVar('--teal'); COL.red = cssVar('--red'); COL.blue = cssVar('--blue');
}

function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;                      // hidden tab
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * e;
}

function drawAxes(ctx, pad, w, h, yMax, yFmt) {
  const ph = h - pad.t - pad.b;
  ctx.font = `13px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const v = yMax * i / 5;
    const y = pad.t + ph * (1 - i / 5);
    ctx.strokeStyle = COL.grid;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = COL.muted;
    ctx.fillText(yFmt(v), pad.l - 8, y);
  }
}

/* =====================================================================
   TABS
   ===================================================================== */
const tabs = { machine: $('#tab-machine'), bulbs: $('#tab-bulbs') };
const panels = { machine: $('#panel-machine'), bulbs: $('#panel-bulbs') };
let activeTab = 'machine';

function showTab(name) {
  activeTab = name;
  for (const k of Object.keys(tabs)) {
    const on = k === name;
    tabs[k].setAttribute('aria-selected', on);
    tabs[k].tabIndex = on ? 0 : -1;
    panels[k].hidden = !on;
  }
  if (name === 'machine') { machinePause(); }
  if (name === 'bulbs') { bulbPause(); }
  redrawAll();
}
tabs.machine.addEventListener('click', () => showTab('machine'));
tabs.bulbs.addEventListener('click', () => showTab('bulbs'));
$$('.tab').forEach(t => t.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const next = activeTab === 'machine' ? 'bulbs' : 'machine';
    showTab(next); tabs[next].focus();
  }
}));

/* =====================================================================
   SCENARIO 1: GRADUAL DETERIORATION
   ===================================================================== */
const MS = { step: 0, timer: null, decided: null, pausedAtBest: false };
let M = null;

const M_PRESET = { mC: 12000, mS: 2000, mR0: 1000, mInc: 400, mH: 10, mRate: 0 };

function calcMachine() {
  const C = num('#mC'), S = num('#mS'), r0 = num('#mR0'), inc = num('#mInc');
  const H = clamp(Math.round(num('#mH')), 2, 20);
  const rate = Math.max(0, num('#mRate')) / 100;
  const v = 1 / (1 + rate);

  const run = [0], cum = [0], tot = [0], avg = [0];
  let pvRun = 0, wsum = 0;
  for (let n = 1; n <= H; n++) {
    const R = r0 + inc * (n - 1);
    pvRun += R * Math.pow(v, n - 1);       // discounted running costs (equals plain sum when rate = 0)
    wsum += Math.pow(v, n - 1);            // weights v^(n-1)
    run.push(R);
    cum.push(pvRun);
    tot.push(C - S * Math.pow(v, n) + pvRun);
    avg.push(tot[n] / wsum);
  }
  let opt = 1;
  for (let n = 2; n <= H; n++) if (avg[n] < avg[opt] - 1e-9) opt = n;

  return {
    C, S, H, rate, run, cum, tot, avg, opt,
    maxRun: Math.max(...run.slice(1)),
    minAvg: Math.min(...avg.slice(1))
  };
}

function readMachine() {
  machinePause();
  M = calcMachine();
  MS.step = 0; MS.decided = null; MS.pausedAtBest = false;
  renderMachine();
}

/* ----- stepping ----- */
function machineNext() {
  if (MS.step >= M.H) return;
  MS.step++;
  if (MS.timer) {
    if (MS.step === M.opt && !MS.pausedAtBest) { MS.pausedAtBest = true; machinePause(); }
    else if (MS.step >= M.H) machinePause();
  }
  renderMachine();
}
function machineBack() {
  if (MS.step <= 0) return;
  machinePause();
  MS.step--;
  if (MS.decided !== null && MS.step < MS.decided) MS.decided = null;
  renderMachine();
}
function machinePlay() {
  if (MS.timer) { machinePause(); renderMachine(); return; }
  if (MS.step >= M.H) { MS.step = 0; MS.decided = null; MS.pausedAtBest = false; }
  MS.timer = setInterval(machineNext, 1100);
  machineNext();
  renderMachine();
}
function machinePause() {
  if (MS.timer) { clearInterval(MS.timer); MS.timer = null; }
}
function machineReplace() {
  if (MS.step < 1 || MS.decided !== null) return;
  machinePause();
  MS.decided = MS.step;
  renderMachine();
}
function machineReset() {
  machinePause();
  MS.step = 0; MS.decided = null; MS.pausedAtBest = false;
  renderMachine();
}

/* ----- rendering ----- */
function renderMachine() {
  if (!M) return;
  renderMachineStatus();
  renderMachineTable();
  renderMachineResult();
  drawMachineChart();

  $('#mBack').disabled = MS.step === 0;
  $('#mNextBtn').disabled = MS.step >= M.H;
  $('#mReplace').disabled = MS.step < 1 || MS.decided !== null;
  $('#mPlay').textContent = MS.timer ? 'Pause' : (MS.step >= M.H ? 'Play again' : 'Play');
}

function renderMachineStatus() {
  const m = M, n = MS.step;
  const card = $('#mStatus');
  const set = (id, t) => { $(id).textContent = t; };

  $('#mGear').style.transform = `rotate(${n * 45}deg)`;

  if (n === 0) {
    card.className = 'card status keep';
    set('#mYear', 'Brand new');
    set('#mSub', `Bought for ${inr(m.C)}. Scrap value ${inr(m.S)} whenever it is sold.`);
    set('#mAvg', '–'); set('#mNext', m.H ? inr(m.run[1]) : '–'); set('#mAvgNext', '–');
    set('#mVerdict', 'Press Next year to age the machine one year at a time.');
    return;
  }

  const avg = m.avg[n];
  const hasNext = n < m.H;
  set('#mYear', `Year ${n} of ${m.H}`);
  set('#mSub', `Running cost this year: ${inr(m.run[n])}`);
  set('#mAvg', inr(avg));
  set('#mNext', hasNext ? inr(m.run[n + 1]) : '–');
  set('#mAvgNext', hasNext ? inr(m.avg[n + 1]) : '–');

  let state, text;
  if (n > m.opt) {
    state = 'late';
    text = `Too late. The lowest average was at year ${m.opt}, at ${inr(m.avg[m.opt])} a year.`;
  } else if (n === m.opt && n < m.H) {
    state = 'replace';
    text = m.rate === 0
      ? `Replace now. Next year costs ${inr(m.run[n + 1])}, more than the ${inr(avg)} average, so keeping it pushes the average up.`
      : `Replace now. Keeping it one more year pushes the weighted average up.`;
  } else if (n === m.opt && n === m.H) {
    state = 'keep';
    text = 'The average is still the lowest at the end of the period. Look further ahead to be sure.';
  } else {
    state = 'keep';
    text = m.rate === 0
      ? `Keep it. Next year's running cost of ${inr(m.run[n + 1])} is below the ${inr(avg)} average, so the average keeps falling.`
      : `Keep it. The weighted average is still falling.`;
  }
  card.className = `card status ${state}`;
  set('#mVerdict', text);
}

function renderMachineTable() {
  const m = M, full = $('#mFull').checked;
  const disc = m.rate > 0;
  let html = `<thead><tr><th>Year</th><th>Running cost</th>
    <th>Cumulative${disc ? ' (discounted)' : ''}</th><th>Total cost</th>
    <th>${disc ? 'Weighted average' : 'Average cost'}</th></tr></thead><tbody>`;
  for (let n = 1; n <= m.H; n++) {
    if (n > MS.step && !full) break;
    const cls = [];
    if (n === MS.step) cls.push('now');
    if (n > MS.step) cls.push('future');
    if (n === m.opt && (MS.step >= m.opt || full)) cls.push('best');
    if (n === MS.decided) cls.push('picked');
    html += `<tr class="${cls.join(' ')}"><td>${n}</td><td>${inr(m.run[n])}</td><td>${inr(m.cum[n])}</td><td>${inr(m.tot[n])}</td><td>${inr(m.avg[n])}</td></tr>`;
  }
  if (MS.step === 0 && !full) html += `<tr class="future"><td colspan="5" style="text-align:left">Rows appear as each year passes.</td></tr>`;
  $('#mTable').innerHTML = html + '</tbody>';
}

function renderMachineResult() {
  const el = $('#mResult');
  if (MS.decided === null) { el.hidden = true; return; }
  const m = M, d = MS.decided, o = m.opt;
  const diff = m.avg[d] - m.avg[o];
  const pct = diff / m.avg[o] * 100;
  let title, why;
  if (d === o) {
    title = `Spot on: you replaced after year ${d}`;
    why = 'This is the year where the average cost per year is lowest.';
  } else if (d < o) {
    title = `A little early: you replaced after year ${d}`;
    why = 'The machine was still cheap to run, so its purchase cost was spread over too few years.';
  } else {
    title = `A little late: you replaced after year ${d}`;
    why = 'Running cost had already climbed above the average, which dragged the average back up.';
  }
  $('#mResTitle').textContent = title;
  $('#mResBody').textContent =
    `Your average cost was ${inr(m.avg[d])} a year. The best was ${inr(m.avg[o])} a year, at year ${o}. ` +
    (diff > 0.5 ? `You paid ${inr(diff)} more each year (${pct.toFixed(1)}% extra). ` : '') + why;
  el.hidden = false;
}

function drawMachineChart() {
  const cv = $('#mChart'), sc = setupCanvas(cv);
  if (!sc || !M) return;
  const { ctx, w, h } = sc, m = M, full = $('#mFull').checked;
  const pad = { l: 66, r: 14, t: 26, b: 46 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const yMax = niceMax(Math.max(m.maxRun * 1.15, m.minAvg * 1.5));
  const band = pw / m.H;
  const X = n => pad.l + (n - 0.5) * band;
  const Y = v => pad.t + ph * (1 - v / yMax);
  const bw = Math.min(52, band * 0.5);

  drawAxes(ctx, pad, w, h, yMax, inr);

  ctx.textAlign = 'center'; ctx.fillStyle = COL.muted; ctx.textBaseline = 'middle';
  for (let n = 1; n <= m.H; n++) ctx.fillText(n, X(n), h - pad.b + 16);
  ctx.fillText('Year of ownership', pad.l + pw / 2, h - 9);

  /* everything inside the plot area is clipped so the early, very high averages run off the top */
  ctx.save();
  ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, pw, ph + 2); ctx.clip();

  for (let n = 1; n <= m.H; n++) {
    const shown = n <= MS.step, ghost = n === MS.step + 1, future = full && n > MS.step;
    const x = X(n) - bw / 2, y = Y(m.run[n]), bh = Y(0) - y;
    if (shown || future) {
      ctx.fillStyle = shown ? COL.amber : COL.amberSoft;
      ctx.fillRect(x, y, bw, bh);
    } else if (ghost) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = COL.amber; ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, bw, bh); ctx.setLineDash([]);
    }
  }

  const trace = (a, b) => {
    ctx.beginPath();
    for (let n = a; n <= b; n++) (n === a ? ctx.moveTo(X(n), Y(m.avg[n])) : ctx.lineTo(X(n), Y(m.avg[n])));
    ctx.stroke();
  };
  if (full && MS.step < m.H) {
    ctx.setLineDash([2, 6]); ctx.strokeStyle = COL.inkSoft; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    trace(Math.max(1, MS.step), m.H); ctx.setLineDash([]);
  }
  if (MS.step >= 1) {
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    trace(1, MS.step);
    for (let n = 1; n <= MS.step; n++) {
      ctx.fillStyle = n === MS.step ? COL.ink : '#fff';
      ctx.beginPath(); ctx.arc(X(n), Y(m.avg[n]), n === MS.step ? 6 : 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();

  /* marker for the lowest average */
  if (MS.step >= m.opt || full) {
    const x = X(m.opt);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = COL.teal; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, pad.t + 4); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.teal; ctx.font = `600 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = `Lowest average: year ${m.opt}`;
    const tw = ctx.measureText(label).width / 2;
    ctx.fillText(label, clamp(x, pad.l + tw, w - pad.r - tw), 11);
  }

  /* player's decision */
  if (MS.decided !== null) {
    const x = X(MS.decided), y = pad.t + ph;
    ctx.fillStyle = COL.red;
    ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x - 8, y + 11); ctx.lineTo(x + 8, y + 11); ctx.closePath(); ctx.fill();
  }

  /* note when the first averages are off the chart */
  if (MS.step >= 1 && m.avg[1] > yMax) {
    ctx.font = `12px ${FONT}`; ctx.fillStyle = COL.inkSoft; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`Year 1 average ${inr(m.avg[1])} is off the top of the chart`, pad.l + 10, pad.t + 12);
  }
}

/* ----- wiring ----- */
['#mC', '#mS', '#mR0', '#mInc', '#mH', '#mRate'].forEach(id => $(id).addEventListener('input', readMachine));
$('#mNextBtn').addEventListener('click', machineNext);
$('#mBack').addEventListener('click', machineBack);
$('#mPlay').addEventListener('click', machinePlay);
$('#mReplace').addEventListener('click', machineReplace);
$('#mReset').addEventListener('click', machineReset);
$('#mFull').addEventListener('change', renderMachine);
$('#mPreset').addEventListener('click', () => {
  for (const [id, v] of Object.entries(M_PRESET)) $('#' + id).value = v;
  readMachine();
});
document.addEventListener('keydown', e => {
  if (activeTab !== 'machine') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.key === 'ArrowRight') { machineNext(); }
  if (e.key === 'ArrowLeft')  { machineBack(); }
});

/* =====================================================================
   SCENARIO 2: SUDDEN FAILURE (BULBS)
   ===================================================================== */
const B_PRESET = { bN: 1000, bCi: 5, bCg: 1.5 };
const B_PROBS = [0.10, 0.25, 0.35, 0.20, 0.10];
let B = null;
const BS = { ind: null, grp: null, timer: null, week: 0 };

function calcBulbs() {
  const N = clamp(Math.round(num('#bN')), 10, 5000);
  const Ci = Math.max(0, num('#bCi')), Cg = Math.max(0, num('#bCg'));
  const raw = $$('.bp').map(i => Math.max(0, parseFloat(i.value) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const sumEl = $('#bSum');
  if (sum <= 0) {
    sumEl.textContent = 'Enter at least one probability above 0.';
    sumEl.className = 'warn';
    return null;
  }
  if (Math.abs(sum - 1) > 0.005) {
    sumEl.textContent = `These add up to ${sum.toFixed(2)}. They are scaled so the total is 1.`;
    sumEl.className = 'warn';
  } else {
    sumEl.textContent = 'These add up to 1, as they should.';
    sumEl.className = '';
  }
  const p = raw.map(x => x / sum);
  const L = p.length;

  /* expected failures in week t: N(t) = N p_t + sum_{i<t} N(i) p_{t-i} */
  const Nt = [N];
  for (let t = 1; t <= L; t++) {
    let f = N * p[t - 1];
    for (let i = 1; i < t; i++) f += Nt[i] * p[t - i - 1];
    Nt.push(f);
  }
  const before = [0, 0];                    // failures before week t
  for (let t = 2; t <= L; t++) before.push(before[t - 1] + Nt[t - 1]);
  const group = [0];
  for (let t = 1; t <= L; t++) group.push((Cg * N + Ci * before[t]) / t);

  const mean = p.reduce((a, pi, i) => a + (i + 1) * pi, 0);
  const perWeek = N / mean;
  const ind = perWeek * Ci;
  let best = 1;
  for (let t = 2; t <= L; t++) if (group[t] < group[best] - 1e-9) best = t;

  /* cumulative distribution for random lifetimes */
  const cdf = []; p.reduce((a, pi, i) => (cdf[i] = a + pi, a + pi), 0);

  return { N, Ci, Cg, p, L, Nt, before, group, mean, perWeek, ind, best, cdf };
}

function readBulbs() {
  bulbPause();
  const b = calcBulbs();
  if (!b) return;
  B = b;
  renderBulbAnalysis();
  const sel = $('#bK'); sel.innerHTML = '';
  for (let t = 1; t <= B.L; t++) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t; if (t === B.best) o.selected = true;
    sel.appendChild(o);
  }
  bulbReset();
}

function renderBulbAnalysis() {
  const b = B;
  const bestCost = b.group[b.best];
  $('#bInd').textContent = inr(b.ind);
  $('#bGrp').textContent = inr(bestCost);
  $('#bGrpLabel').textContent = `Replace all every ${b.best} week${b.best > 1 ? 's' : ''}`;
  const saving = b.ind - bestCost;
  const v = $('#bVerdict');
  if (saving > 0.5) {
    $('#bSave').textContent = inr(saving);
    $('#bSavePct').textContent = `${(saving / b.ind * 100).toFixed(0)}% less, per week`;
    v.className = 'verdict keep';
    v.textContent = `Group replacement wins. Replace every bulb every ${b.best} week${b.best > 1 ? 's' : ''}, and replace any that fail in between one by one.`;
  } else {
    $('#bSave').textContent = '₹0';
    $('#bSavePct').textContent = 'no gain from grouping';
    v.className = 'verdict late';
    v.textContent = 'Group replacement does not beat replacing each bulb when it fails with these costs.';
  }

  let html = `<thead><tr><th>Week t</th>${[...Array(b.L)].map((_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>`;
  html += `<tr><td>Failures N(t)</td>${b.Nt.slice(1).map(x => `<td>${Math.round(x)}</td>`).join('')}</tr>`;
  html += `<tr><td>Failures before week t</td>${b.before.slice(1).map(x => `<td>${Math.round(x)}</td>`).join('')}</tr>`;
  html += `<tr class="best"><td>Group cost per week</td>${b.group.slice(1).map(x => `<td>${inr(x)}</td>`).join('')}</tr>`;
  $('#bTable').innerHTML = html + `</tbody>`;

  const mean = b.mean.toFixed(2);
  $('#bTable').insertAdjacentHTML('beforeend',
    `<caption style="caption-side:bottom;text-align:left;padding-top:.6rem;color:var(--muted);font-size:.88rem">Mean life = ${mean} weeks, so about ${Math.round(b.perWeek)} bulbs fail each week when replaced one by one.</caption>`);
  drawBulbChart();
}

function drawBulbChart() {
  const cv = $('#bChart'), sc = setupCanvas(cv);
  if (!sc || !B) return;
  const { ctx, w, h } = sc, b = B;
  const pad = { l: 66, r: 14, t: 22, b: 46 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const yMax = niceMax(Math.max(b.ind, ...b.group.slice(1)) * 1.12);
  const band = pw / b.L;
  const X = t => pad.l + (t - 0.5) * band;
  const Y = v => pad.t + ph * (1 - v / yMax);
  const bw = Math.min(70, band * 0.55);

  drawAxes(ctx, pad, w, h, yMax, inr);
  ctx.textAlign = 'center'; ctx.fillStyle = COL.muted; ctx.textBaseline = 'middle'; ctx.font = `13px ${FONT}`;
  for (let t = 1; t <= b.L; t++) ctx.fillText(t, X(t), h - pad.b + 16);
  ctx.fillText('Weeks between group replacements', pad.l + pw / 2, h - 9);

  for (let t = 1; t <= b.L; t++) {
    const y = Y(b.group[t]);
    ctx.fillStyle = t === b.best ? COL.teal : '#9fb4b0';
    ctx.fillRect(X(t) - bw / 2, y, bw, Y(0) - y);
    ctx.fillStyle = COL.ink; ctx.font = `600 13px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(inr(b.group[t]), X(t), y - 11);
  }
  const yi = Y(b.ind);
  ctx.setLineDash([7, 5]); ctx.strokeStyle = COL.amber; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(pad.l, yi); ctx.lineTo(w - pad.r, yi); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#9a5f0c'; ctx.font = `600 13px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(`One by one: ${inr(b.ind)} a week`, w - pad.r - 4, yi - 11);
}

/* ----- random simulation ----- */
function sampleLife() {
  const r = Math.random();
  for (let i = 0; i < B.cdf.length; i++) if (r < B.cdf[i]) return i + 1;
  return B.cdf.length;
}
function newSim(k) {
  const N = B.N, s = {
    k, cost: 0, weekCost: 0, hist: [0],
    age: new Uint8Array(N), life: new Uint8Array(N), flag: new Uint8Array(N)
  };
  for (let i = 0; i < N; i++) s.life[i] = sampleLife();
  return s;
}
function stepSim(s, week) {
  const groupWeek = s.k > 0 && week % s.k === 0;
  s.weekCost = 0;
  for (let i = 0; i < B.N; i++) {
    s.age[i]++; s.flag[i] = 0;
    if (groupWeek) {                                  // everything swapped, even bulbs failing this week
      s.flag[i] = 2; s.weekCost += B.Cg; s.age[i] = 0; s.life[i] = sampleLife();
    } else if (s.age[i] >= s.life[i]) {
      s.flag[i] = 1; s.weekCost += B.Ci; s.age[i] = 0; s.life[i] = sampleLife();
    }
  }
  s.cost += s.weekCost;
  s.hist.push(s.cost);
}

const AGE_COLOURS = ['#19e3c0', '#6bff8a', '#d4ff3a', '#ffcc33', '#ff8a2b'];
function drawGrid(cv, s) {
  if (!s || !B) return;
  const cols = Math.max(10, Math.round(Math.sqrt(B.N * 2.5)));
  const rows = Math.ceil(B.N / cols);
  const cell = cv.clientWidth / cols;
  if (!cell) return;
  cv.style.height = Math.ceil(rows * cell) + 'px';
  const sc = setupCanvas(cv);
  if (!sc) return;
  const { ctx } = sc, r = Math.max(1, cell * 0.38);
  for (let i = 0; i < B.N; i++) {
    const cx = (i % cols + 0.5) * cell, cy = (Math.floor(i / cols) + 0.5) * cell;
    ctx.fillStyle = s.flag[i] === 1 ? COL.red
                  : s.flag[i] === 2 ? COL.blue
                  : AGE_COLOURS[clamp(s.age[i] - 1, 0, 4)];
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

function renderSim() {
  const wk = BS.week;
  $('#bWeekLabel').textContent = `Week ${wk}`;
  const fill = (p, s) => {
    $(`#${p}Week`).textContent = wk ? inr(s.weekCost) : '–';
    $(`#${p}Total`).textContent = wk ? inr(s.cost) : '–';
    $(`#${p}Avg`).textContent = wk ? inr(s.cost / wk) : '–';
  };
  if (BS.ind) { fill('i', BS.ind); fill('g', BS.grp); }
  drawGrid($('#gridInd'), BS.ind);
  drawGrid($('#gridGrp'), BS.grp);
  drawSimChart();
  const total = clamp(Math.round(num('#bWeeks')), 4, 52);
  $('#bRun').textContent = BS.timer ? 'Pause' : (BS.week >= total ? 'Run again' : 'Run');
}

function drawSimChart() {
  const cv = $('#bSimChart'), sc = setupCanvas(cv);
  if (!sc || !B || !BS.ind) return;
  const { ctx, w, h } = sc;
  const total = clamp(Math.round(num('#bWeeks')), 4, 52);
  const k = BS.grp.k;
  const pad = { l: 72, r: 16, t: 16, b: 46 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const expInd = B.ind, expGrp = B.group[k];
  const yMax = niceMax(Math.max(expInd, expGrp) * total * 1.1);
  const X = wk => pad.l + pw * wk / total;
  const Y = v => pad.t + ph * (1 - v / yMax);

  drawAxes(ctx, pad, w, h, yMax, inr);
  ctx.textAlign = 'center'; ctx.fillStyle = COL.muted; ctx.textBaseline = 'middle'; ctx.font = `13px ${FONT}`;
  const stepX = total <= 20 ? 1 : total <= 40 ? 2 : 4;
  for (let wk = 0; wk <= total; wk += stepX) ctx.fillText(wk, X(wk), h - pad.b + 16);
  ctx.fillText('Week', pad.l + pw / 2, h - 9);

  /* predicted lines from the table */
  ctx.setLineDash([3, 6]); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  [[expInd, COL.amber], [expGrp, COL.teal]].forEach(([per, c]) => {
    ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(total), Y(per * total)); ctx.stroke();
  });
  ctx.setLineDash([]);

  /* simulated cumulative cost */
  [[BS.ind, COL.amber], [BS.grp, COL.teal]].forEach(([s, c]) => {
    ctx.strokeStyle = c; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    s.hist.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.stroke();
  });
}

function bulbStep() {
  const total = clamp(Math.round(num('#bWeeks')), 4, 52);
  if (BS.week >= total) { bulbPause(); renderSim(); return; }
  BS.week++;
  stepSim(BS.ind, BS.week);
  stepSim(BS.grp, BS.week);
  if (BS.week >= total) bulbPause();
  renderSim();
}
function bulbRun() {
  if (BS.timer) { bulbPause(); renderSim(); return; }
  const total = clamp(Math.round(num('#bWeeks')), 4, 52);
  if (BS.week >= total) bulbReset();
  BS.timer = setInterval(bulbStep, +$('#bSpeed').value);
  bulbStep();
}
function bulbPause() { if (BS.timer) { clearInterval(BS.timer); BS.timer = null; } }
function bulbReset() {
  bulbPause();
  if (!B) return;
  const k = +$('#bK').value || B.best;
  BS.week = 0;
  BS.ind = newSim(0);
  BS.grp = newSim(k);
  $('#gCap').textContent = `Replace all every ${k} week${k > 1 ? 's' : ''}`;
  renderSim();
}

/* ----- wiring ----- */
$$('#panel-bulbs .inputs input').forEach(i => i.addEventListener('input', readBulbs));
$('#bPreset').addEventListener('click', () => {
  for (const [id, v] of Object.entries(B_PRESET)) $('#' + id).value = v;
  $$('.bp').forEach((i, idx) => { i.value = B_PROBS[idx].toFixed(2); });
  readBulbs();
});
$('#bRun').addEventListener('click', bulbRun);
$('#bStep').addEventListener('click', () => { bulbPause(); bulbStep(); });
$('#bReset').addEventListener('click', bulbReset);
$('#bK').addEventListener('change', bulbReset);
$('#bWeeks').addEventListener('input', bulbReset);
$('#bSpeed').addEventListener('change', () => { if (BS.timer) { bulbPause(); BS.timer = setInterval(bulbStep, +$('#bSpeed').value); renderSim(); } });

/* =====================================================================
   WINDOWS, TASKBAR AND START MENU
   ===================================================================== */
function buildWindows() {
  $$('[data-title]').forEach(win => {
    const bar = document.createElement('div');
    bar.className = 'titlebar';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = `<div class="tt"><i class="ti"></i><span></span></div><div class="wb"><i>_</i><i>□</i><i>✕</i></div>`;
    bar.querySelector('.tt span').textContent = win.dataset.title;
    const body = document.createElement('div');
    body.className = 'wbody';
    while (win.firstChild) body.appendChild(win.firstChild);
    win.appendChild(bar);
    win.appendChild(body);
  });
}

function setupTaskbar() {
  const clock = $('#clock'), btn = $('#startBtn'), menu = $('#startMenu');
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  tick(); setInterval(tick, 15000);
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  menu.addEventListener('click', e => {
    const go = e.target.dataset && e.target.dataset.go;
    if (!go) return;
    if (go === 'top') window.scrollTo({ top: 0, behavior: 'smooth' }); else showTab(go);
    close();
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

/* =====================================================================
   START
   ===================================================================== */
function redrawAll() {
  if (activeTab === 'machine') drawMachineChart();
  else { drawBulbChart(); renderSim(); }
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(redrawAll, 120); });

buildWindows();
setupTaskbar();
loadColours();
readMachine();
readBulbs();