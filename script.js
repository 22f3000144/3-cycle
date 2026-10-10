'use strict';
/* TimeBlock — 2-Cycle System. Data: S.days[YYYY-MM-DD][slot] = {name, notes, alerted, tasks:[{id,text,done,doneAt,removed}]}
   Status is always derived from the clock + task timestamps, so it is recalculated automatically on reopen. */
const KEY = 'timeblock2cycle.v1';
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const hl = h => { h %= 24; return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; };
const SL = [...Array(8)].map((_, i) => `${hl(i * 3)}–${hl(i * 3 + 3)}`);
const LBL = { green: 'Completed', red: 'Missed', blue: 'Active', skipped: 'Skipped', upcoming: 'Upcoming' };
let S = load(), view = 'dash', focusSlot = null;

function load() {
  const def = { settings: { theme: matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark', repeat: false }, days: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.days === 'object') return { settings: { ...def.settings, ...s.settings }, days: s.days };
  } catch (e) {}
  return def;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save: browser storage is full or blocked.', 'red'); } }
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (k, s) => { const [y, m, d] = k.split('-').map(Number); return [new Date(y, m - 1, d, s * 3).getTime(), new Date(y, m - 1, d, s * 3 + 3).getTime()]; };
const act = b => b.tasks.filter(t => !t.removed);
const fmt = ms => { ms = Math.max(0, Math.ceil(ms / 1000)); return `${pad(ms / 3600 | 0)}:${pad(ms % 3600 / 60 | 0)}:${pad(ms % 60)}`; };

function status(k, s, b, now = Date.now()) {
  const [st, en] = range(k, s), t = act(b);
  if (t.length && t.every(x => x.done && x.doneAt <= en)) return 'green';
  if (now >= en) return t.length ? 'red' : 'skipped';
  return now >= st ? 'blue' : 'upcoming';
}

function ensureToday() {
  const k = dk(new Date());
  if (!S.days[k]) {
    S.days[k] = {};
    if (S.settings.repeat) {
      const prev = Object.keys(S.days).filter(x => x < k && Object.keys(S.days[x]).length).sort().pop();
      if (prev) for (const [s, b] of Object.entries(S.days[prev]))
        S.days[k][s] = { name: b.name, notes: b.notes, alerted: false, tasks: act(b).map(t => ({ id: uid(), text: t.text, done: false, doneAt: null })) };
    }
    save();
  }
  return S.days[k];
}

/* ---------- Dashboard ---------- */
function card(s, b) {
  const t = act(b), done = t.filter(x => x.done).length;
  return `<article class="card" data-slot="${s}">
  <div class="ch"><div><span class="slot">${SL[s]} · Cycle ${s < 4 ? 1 : 2}</span><h3>${esc(b.name)}</h3></div><span class="badge"></span></div>
  <div class="cd"></div>
  <div class="bar"><i style="width:${t.length ? done / t.length * 100 : 0}%"></i></div>
  <small>${done} of ${t.length} done · ${t.length - done} remaining</small>
  ${b.notes ? `<p class="notes">${esc(b.notes)}</p>` : ''}
  <ul class="tasks">${t.map(x => `<li class="${x.done ? 'done' : ''}"><label><input type="checkbox" data-id="${x.id}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}</span></label><button class="x" data-act="rmtask" data-id="${x.id}" title="Remove task" aria-label="Remove task">×</button></li>`).join('')}</ul>
  <div class="add"><input class="tin" placeholder="Add a task" maxlength="120" aria-label="New task"><button data-act="addtask" type="button">Add</button></div>
  <div class="cf"><button class="ghost" data-act="edit" type="button">Edit</button><button class="ghost danger" data-act="del" type="button">Delete</button></div>
</article>`;
}

function render() {
  document.documentElement.dataset.theme = S.settings.theme;
  const d = ensureToday(), slots = Object.keys(d).map(Number).sort((a, b) => a - b);
  $('#empty').hidden = slots.length > 0;
  $('#summary').hidden = slots.length === 0;
  $('#blocks').innerHTML = slots.map(s => card(s, d[s])).join('');
  tick();
  if (focusSlot != null) { const i = $(`[data-slot="${focusSlot}"] .tin`); if (i) i.focus(); focusSlot = null; }
}

function tick() {
  const n = new Date(), now = n.getTime();
  $('#clock').textContent = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  $('#date').textContent = n.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  checkEnds();
  if (view !== 'dash') return;
  const k = dk(n), d = S.days[k] || {};
  document.querySelectorAll('.card').forEach(c => {
    const s = +c.dataset.slot, b = d[s]; if (!b) return;
    const st = status(k, s, b, now), [a, e] = range(k, s);
    c.dataset.status = st;
    c.querySelector('.badge').textContent = LBL[st];
    c.querySelector('.cd').textContent = st === 'blue' ? `Ends in ${fmt(e - now)}` : st === 'upcoming' ? `Starts in ${fmt(a - now)}`
      : st === 'green' ? 'All tasks done before the deadline' : st === 'red' ? 'Deadline passed with unfinished tasks' : 'Ended with no tasks';
  });
  const cur = Math.floor(n.getHours() / 3), cb = d[cur], all = Object.values(d).flatMap(act), dn = all.filter(t => t.done).length;
  $('#summary').innerHTML = `
    <div class="sum"><small>Current interval · ${SL[cur]}</small><b>${cb ? esc(cb.name) : 'No block configured'}</b><small>${cb ? 'Ends in ' + fmt(range(k, cur)[1] - now) : 'Create a block for this interval to track it.'}</small></div>
    <div class="sum"><small>Tasks remaining today</small><b>${all.length - dn}</b><small>${dn} completed of ${all.length}</small></div>
    <div class="sum"><small>Today's progress</small><b>${all.length ? Math.round(dn / all.length * 100) : 0}%</b><div class="bar"><i style="width:${all.length ? dn / all.length * 100 : 0}%"></i></div></div>`;
}

/* ---------- Block-end alerts ---------- */
function beep() {
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); g.gain.value = .08; o.frequency.value = 660; o.start(); o.stop(a.currentTime + .4); } catch (e) {}
}
function checkEnds() {
  const now = Date.now(), keys = [dk(new Date(now - 864e5)), dk(new Date(now))]; let ch = false;
  for (const k of keys) for (const [s, b] of Object.entries((S.days[k] || {}))) {
    if (!b.alerted && now >= range(k, +s)[1]) {
      b.alerted = true; ch = true;
      const st = status(k, +s, b, now), left = act(b).filter(t => !t.done).length;
      const msg = st === 'green' ? 'All tasks completed on time.' : st === 'red' ? `${left} unfinished task${left === 1 ? '' : 's'}.` : 'No tasks were added.';
      toast(`"${b.name}" (${SL[s]}) has ended. ${msg}`, st === 'green' ? 'green' : st === 'red' ? 'red' : 'blue'); beep();
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`Block ended: ${b.name}`, { body: msg }); } catch (e) {}
    }
  }
  if (ch) { save(); if (view === 'dash') render(); }
}
function toast(msg, cls = 'blue') {
  const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = msg;
  t.onclick = () => t.remove(); $('#toasts').append(t); setTimeout(() => t.remove(), 9000);
}

/* ---------- Block dialog ---------- */
function openDlg(s) {
  const d = ensureToday(), E = $('#blockForm').elements, b = s != null ? d[s] : null;
  if (!b && Object.keys(d).length >= 8) return toast('All 8 intervals already have a block.');
  E.edit.value = s ?? '';
  E.slot.innerHTML = SL.map((l, i) => { const used = d[i] && i !== s; return `<option value="${i}" ${used ? 'disabled' : ''}>${l} (Cycle ${i < 4 ? 1 : 2})${used ? ' — in use' : ''}</option>`; }).join('');
  const cur = Math.floor(new Date().getHours() / 3);
  E.slot.value = s != null ? s : (!d[cur] ? cur : SL.findIndex((_, i) => !d[i]));
  E.bname.value = b ? b.name : ''; E.notes.value = b ? b.notes : '';
  $('#dlgTitle').textContent = b ? 'Edit block' : 'New block';
  $('#blockDlg').showModal(); E.bname.focus();
}
$('#blockForm').addEventListener('submit', e => {
  e.preventDefault();
  const E = e.target.elements, d = ensureToday(), s = +E.slot.value, old = E.edit.value === '' ? null : +E.edit.value, nm = E.bname.value.trim();
  if (!nm) return;
  if (d[s] && s !== old) return toast('That interval already has a block.', 'red');
  const b = old != null ? d[old] : { tasks: [] };
  if (old != null && old !== s) delete d[old];
  b.name = nm; b.notes = E.notes.value.trim(); b.alerted = Date.now() >= range(dk(new Date()), s)[1];
  d[s] = b; save(); $('#blockDlg').close(); focusSlot = s; render();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});
$('#dlgCancel').onclick = () => $('#blockDlg').close();

/* ---------- Task + block actions ---------- */
function addTask(c) {
  const i = c.querySelector('.tin'), v = i.value.trim(); if (!v) return;
  ensureToday()[+c.dataset.slot].tasks.push({ id: uid(), text: v, done: false, doneAt: null });
  save(); focusSlot = +c.dataset.slot; render();
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const c = a.closest('.card'), d = ensureToday(), s = c && +c.dataset.slot, b = c && d[s];
  switch (a.dataset.act) {
    case 'addtask': addTask(c); break;
    case 'rmtask': { const i = b.tasks.findIndex(t => t.id === a.dataset.id); if (i < 0) break;
      if (b.tasks[i].done) b.tasks[i].removed = true; else b.tasks.splice(i, 1); /* completed tasks stay in records */
      save(); render(); break; }
    case 'edit': openDlg(s); break;
    case 'del': if (confirm(`Delete "${b.name}" and its tasks? Its records will be removed from performance history.`)) { delete d[s]; save(); render(); } break;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('tin')) { e.preventDefault(); addTask(e.target.closest('.card')); } });
document.addEventListener('change', e => {
  if (e.target.type !== 'checkbox' || !e.target.dataset.id) return;
  const c = e.target.closest('.card'), t = ensureToday()[+c.dataset.slot].tasks.find(x => x.id === e.target.dataset.id);
  if (!t) return; t.done = e.target.checked; t.doneAt = t.done ? Date.now() : null; save(); render();
});

/* ---------- Performance ---------- */
function calc(from, to) {
  const now = Date.now(), days = [], cyc = [{ c: 0, n: 0, td: 0, tt: 0 }, { c: 0, n: 0, td: 0, tt: 0 }];
  Object.keys(S.days).sort().filter(k => (!from || k >= from) && (!to || k <= to)).forEach(k => {
    const e = Object.entries(S.days[k]); if (!e.length) return;
    const r = { k, c: 0, r: 0, s: 0, td: 0, tt: 0 };
    e.forEach(([s, b]) => {
      s = +s; const st = status(k, s, b, now), dn = b.tasks.filter(t => t.done).length, cy = cyc[s < 4 ? 0 : 1];
      r.td += dn; r.tt += b.tasks.length; cy.td += dn; cy.tt += b.tasks.length;
      if (st === 'green') r.c++; else if (st === 'red') r.r++; else if (st === 'skipped') r.s++;
      if (st === 'green' || st === 'red' || st === 'skipped') { cy.n++; if (st === 'green') cy.c++; }
    });
    days.push(r);
  });
  return { days, cyc };
}
const pct = (a, b) => b ? a / b * 100 : 0;
function renderPerf() {
  const { days, cyc } = calc($('#from').value, $('#to').value);
  const T = days.reduce((o, r) => { for (const k of ['c', 'r', 's', 'td', 'tt']) o[k] += r[k]; return o; }, { c: 0, r: 0, s: 0, td: 0, tt: 0 });
  const st = [[T.c, 'Blocks completed'], [T.r, 'Blocks incomplete'], [T.s, 'Blocks skipped'], [T.td, 'Tasks completed'], [T.tt - T.td, 'Tasks unfinished'], [Math.round(pct(T.td, T.tt)) + '%', 'Task completion']];
  $('#stats').innerHTML = st.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  const shown = days.slice(-30);
  chart($('#cDaily'), shown.map(r => r.k.slice(5)), [{ color: 'var(--green)', v: shown.map(r => pct(r.td, r.tt)) }]);
  chart($('#cCycle'), ['Task completion', 'Block success'], cyc.map((c, i) => ({ color: i ? 'var(--violet)' : 'var(--blue)', v: [pct(c.td, c.tt), pct(c.c, c.n)] })));
  $('#hist').innerHTML = days.length ? `<tr><th>Date</th><th>Blocks done</th><th>Incomplete</th><th>Skipped</th><th>Tasks done</th><th>Unfinished</th><th>Completion</th></tr>` +
    days.slice().reverse().map(r => `<tr><td>${r.k}</td><td>${r.c}</td><td>${r.r}</td><td>${r.s}</td><td>${r.td}</td><td>${r.tt - r.td}</td><td>${Math.round(pct(r.td, r.tt))}%</td></tr>`).join('')
    : '<tr><td class="none">No records in this date range yet.</td></tr>';
}
function chart(cv, labels, sets) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement), css = v => cs.getPropertyValue(v.slice(4, -1)).trim() || v;
  const tx = css('var(--muted)'), ln = css('var(--line)'), L = 38, B = 26, T = 14, pw = w - L - 8, ph = h - B - T;
  g.font = '11px sans-serif'; g.strokeStyle = ln; g.fillStyle = tx; g.textAlign = 'right';
  for (let v = 0; v <= 100; v += 25) { const y = T + ph - ph * v / 100; g.beginPath(); g.moveTo(L, y); g.lineTo(w - 8, y); g.stroke(); g.fillText(v + '%', L - 6, y + 4); }
  if (!labels.length) { g.textAlign = 'center'; g.fillText('No data yet', L + pw / 2, T + ph / 2); return; }
  const gw = pw / labels.length, bw = Math.min(40, gw * .8 / sets.length); g.textAlign = 'center';
  labels.forEach((lb, i) => {
    const x0 = L + gw * i + gw / 2 - bw * sets.length / 2;
    sets.forEach((s, j) => { const bh = ph * s.v[i] / 100; g.fillStyle = css(s.color); g.fillRect(x0 + bw * j, T + ph - bh, bw - 2, bh);
      g.fillStyle = tx; if (gw > 34) g.fillText(Math.round(s.v[i]) + '%', x0 + bw * j + bw / 2 - 1, T + ph - bh - 4); });
    g.fillStyle = tx; if (labels.length < 16 || i % Math.ceil(labels.length / 12) === 0) g.fillText(lb, L + gw * i + gw / 2, h - 8);
  });
}
function show(v) {
  view = v; $('#dashView').hidden = v !== 'dash'; $('#perfView').hidden = v !== 'perf';
  if (v === 'perf') renderPerf(); else render();
  scrollTo(0, 0);
}
$('#btnPerf').onclick = () => show('perf');
$('#btnBack').onclick = () => show('dash');
$('#from').onchange = $('#to').onchange = renderPerf;
document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => {
  const n = +b.dataset.range, t = new Date(), f = new Date(); f.setDate(t.getDate() - n + 1);
  $('#from').value = n ? dk(f) : ''; $('#to').value = n ? dk(t) : ''; renderPerf();
});
addEventListener('resize', () => { if (view === 'perf') renderPerf(); });

/* ---------- Theme, data, location ---------- */
$('#btnTheme').onclick = () => { S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; save(); document.documentElement.dataset.theme = S.settings.theme; if (view === 'perf') renderPerf(); };
$('#btnAdd').onclick = $('#btnAdd2').onclick = () => { if (view !== 'dash') show('dash'); openDlg(null); };
$('#btnData').onclick = () => { $('#repeat').checked = S.settings.repeat; $('#dataDlg').showModal(); };
$('#dataClose').onclick = () => $('#dataDlg').close();
$('#repeat').onchange = e => { S.settings.repeat = e.target.checked; save(); };
$('#btnExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'timeblock-2cycle', version: 1, exportedAt: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' }));
  a.download = `timeblock-backup-${dk(new Date())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#btnImport').onclick = () => $('#file').click();
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result); if (!o || typeof o.days !== 'object' || Array.isArray(o.days)) throw 0;
      if (!confirm('Replace ALL current data with this file?')) return;
      S = { settings: { theme: S.settings.theme, repeat: false, ...(o.settings || {}) }, days: o.days }; save(); $('#dataDlg').close(); show(view); toast('Data imported.', 'green');
    } catch (err) { toast('That file is not a valid TimeBlock backup.', 'red'); }
  };
  r.readAsText(f); e.target.value = '';
};
$('#btnWipe').onclick = () => {
  if (!confirm('Delete ALL blocks, tasks and performance history? This cannot be undone.')) return;
  if (prompt('Type DELETE to confirm.') !== 'DELETE') return toast('Nothing was deleted.');
  localStorage.removeItem(KEY); S = load(); $('#dataDlg').close(); show('dash'); toast('All data deleted.');
};
function locate() {
  if (!navigator.geolocation) { $('#loc').textContent = 'Location not supported'; return; }
  navigator.geolocation.getCurrentPosition(p => {
    $('#loc').textContent = `${p.coords.latitude.toFixed(3)}, ${p.coords.longitude.toFixed(3)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  }, () => { $('#loc').textContent = 'Location blocked — click to retry'; }, { timeout: 10000 });
}
$('#loc').onclick = locate;
if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') locate(); }).catch(() => {});

/* ---------- Start ---------- */
(function init() {
  const now = Date.now();
  for (const [k, d] of Object.entries(S.days)) for (const [s, b] of Object.entries(d)) if (now >= range(k, +s)[1]) b.alerted = true; /* no stale alerts on reopen */
  save(); render();
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
})();
