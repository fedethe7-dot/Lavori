'use strict';
/* Lavori di casa v2 — interfaccia */

const VERSIONE = '2.0';
const EMOJI = ['🧹', '🌿', '🛒', '🔧', '💡', '🧺', '🍽️', '🚗', '🐶', '🗑️', '📦', '🧽', '🪴', '🛠️', '🧯', '📋'];
const STATO = {
  attesa: { t: 'In attesa', i: '⏳', c: 's-attesa' },
  ok:     { t: 'Confermato', i: '✅', c: 's-ok' },
  no:     { t: 'Nessuno può', i: '❌', c: 's-no' },
  altro:  { t: 'Altro giorno', i: '📅', c: 's-altro' },
  fatto:  { t: 'Fatto', i: '✔️', c: 's-fatto' }
};
const RISP = {
  attesa: { t: 'Deve rispondere', i: '⏳', c: 's-attesa' },
  ok:     { t: 'Ci sta', i: '✅', c: 's-ok' },
  no:     { t: 'Non può', i: '❌', c: 's-no' },
  altro:  { t: 'Propone', i: '📅', c: 's-altro' }
};
const LIB = {
  tutto:      { i: '☀️', t: 'Tutto il giorno', c: 'l-tutto' },
  mattina:    { i: '🌅', t: 'Mattina', c: 'l-mattina' },
  pomeriggio: { i: '🌇', t: 'Pomeriggio', c: 'l-pomeriggio' },
  no:         { i: '❌', t: 'Occupato', c: 'l-no' },
  '':         { i: '❔', t: 'Non detto', c: 'l-nd' }
};
const QUANDO_T = { giornata: '☀️ In giornata', mattina: '🌅 Mattina', pomeriggio: '🌇 Pomeriggio', ora: '🕐 A un\'ora' };
const DURATE = [[30, '30 min'], [60, '1 ora'], [90, '1 ora e ½'], [120, '2 ore'], [180, '3 ore'], [240, '4 ore']];
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const COLORI = ['#6d7cff', '#ff6fa8', '#22c07a', '#ffa928', '#29b6e8', '#ff7a4d'];
const PROVA_NOMI = ['Federico', 'Mamma', 'Sorella'];

/* ---------- Memoria del telefono ---------- */
const S = {
  get(k, d) { try { const v = localStorage.getItem('lavori2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lavori2.' + k, JSON.stringify(v)); } catch (e) { /* niente */ } }
};
const cfg = { url: S.get('url', ''), pin: S.get('pin', ''), me: S.get('me', ''), tema: S.get('tema', 'auto') };
const st = { lavori: [], persone: [], settimane: {}, eccezioni: {}, admin: '', view: ({ cal: 'liberi', list: 'home' })[S.get('view', 'home')] || S.get('view', 'home'),
  mese: null, giorno: null, soloMiei: false, chiLiberi: '', occupato: 0, caricato: 0 };

/* ---------- Utilità ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const oggi = () => ymd(new Date());
const piu = (s, n) => { const d = daYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const ordineOra = j => j.quando === 'ora' ? j.ora : j.quando === 'mattina' ? '09:00' : j.quando === 'pomeriggio' ? '15:00' : '00:00';
const ordina = (a, b) => (a.data + ordineOra(a)).localeCompare(b.data + ordineOra(b));

function giornoBreve(s) {
  const t = oggi();
  if (s === t) return 'Oggi';
  if (s === piu(t, 1)) return 'Domani';
  if (s === piu(t, -1)) return 'Ieri';
  return daYmd(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}
function giornoLungo(s) {
  const t = daYmd(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function quandoTesto(j) {
  if (j.quando === 'ora') return '🕐 ' + j.ora;
  return QUANDO_T[j.quando] || QUANDO_T.giornata;
}
const persona = n => st.persone.find(p => p.nome === n) || { nome: n, colore: '#8b93a7' };
const av = (n, cls = '') => `<span class="av ${cls}" style="background:${esc(persona(n).colore)}">${esc((n || '?').charAt(0).toUpperCase())}</span>`;
const sonoCapo = () => cfg.me && cfg.me === st.admin;
const puoGestire = j => j.creatore === cfg.me || sonoCapo();
const liberoDi = (n, d) => libero(st, n, d);

/* ---------- Cosa tocca a me ---------- */
function daRispondere() {
  return st.lavori.filter(j => !j.fatto && j.creatore !== cfg.me && (j.risposte[cfg.me] || {}).r === 'attesa');
}
function proposteDaVedere() {
  return st.lavori.filter(j => !j.fatto && puoGestire(j) && (j.stato === 'altro' || j.stato === 'no'));
}

/* ---------- Dati: prova (solo telefono) o foglio Google ---------- */
const Prova = {
  db() {
    let db = S.get('prova', null);
    if (!db) { db = datiDiProva(); S.set('prova', db); }
    db.lavori.forEach(normalizza);
    db.admin = 'Federico';
    return db;
  },
  pacchetto(db) {
    const nomi = S.get('provaNomi', PROVA_NOMI);
    return { ok: true, lavori: db.lavori, settimane: db.settimane, eccezioni: db.eccezioni, admin: db.admin,
      persone: nomi.map((n, i) => ({ nome: n, colore: COLORI[i % COLORI.length] })) };
  },
  async chiama(p) {
    const db = this.db();
    if (p.action !== 'list') { applica(db, p); S.set('prova', db); }
    return this.pacchetto(db);
  }
};
const Foglio = {
  async chiama(p, url = cfg.url, pin = cfg.pin) {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, p, { pin })) });
    } catch (e) { throw new Error('📡 Nessuna connessione con il foglio'); }
    if (!r.ok) throw new Error('Il foglio non risponde (' + r.status + ')');
    let d;
    try { d = await r.json(); } catch (e) { throw new Error('Il link dello script non sembra giusto'); }
    if (!d.ok) throw new Error(d.error || 'Errore dal foglio');
    return d;
  }
};
const backend = () => (cfg.url ? Foglio : Prova);

function datiDiProva() {
  const t = oggi();
  const db = { lavori: [], settimane: {
    Federico: ['pomeriggio', 'pomeriggio', 'no', 'pomeriggio', 'pomeriggio', 'tutto', 'tutto'],
    Mamma: ['mattina', 'tutto', 'mattina', 'tutto', 'mattina', 'mattina', 'no'],
    Sorella: ['no', 'no', 'pomeriggio', 'no', 'pomeriggio', 'tutto', 'tutto']
  }, eccezioni: {}, admin: 'Federico' };
  const fai = (chi, p) => applica(db, Object.assign({ chi }, p)).lavoro;
  fai('Mamma', { action: 'crea', emoji: '🌿', titolo: 'Tagliare l\'erba', descrizione: 'Davanti e dietro casa', data: piu(t, 2), quando: 'mattina', assegnati: ['Federico'] });
  const tav = fai('Federico', { action: 'crea', emoji: '🧹', titolo: 'Pulire la taverna', data: piu(t, 3), quando: 'pomeriggio', assegnati: ['Mamma', 'Sorella'] });
  fai('Mamma', { action: 'rispondi', id: tav.id, tipo: 'ok' });
  fai('Sorella', { action: 'rispondi', id: tav.id, tipo: 'altro', data: piu(t, 5), nota: 'Sabato sono libera tutto il giorno' });
  fai('Federico', { action: 'crea', emoji: '🛒', titolo: 'Spesa grande', descrizione: 'La lista è sul frigo', data: t, quando: 'ora', ora: '18:30', durata: 60, assegnati: ['Mamma'] });
  const lamp = fai('Mamma', { action: 'crea', emoji: '💡', titolo: 'Cambiare la lampadina', data: piu(t, -1), assegnati: ['Federico'] });
  fai('Federico', { action: 'fatto', id: lamp.id });
  return db;
}

/* ---------- Chiamate una alla volta ---------- */
let coda = Promise.resolve();
function inFila(fn) { const p = coda.then(fn, fn); coda = p.catch(() => {}); return p; }
function occupato(n) {
  st.occupato += n;
  $('#btnSync').classList.toggle('spin', st.occupato > 0);
  document.querySelectorAll('#sheet button[data-a], #sheet button[type=submit]').forEach(b => { b.disabled = st.occupato > 0; });
}
function carica(zitto) {
  return inFila(async () => {
    occupato(1);
    try { usa(await backend().chiama({ action: 'list' })); return true; }
    catch (e) { if (!zitto) toast(e.message, true); return false; }
    finally { occupato(-1); }
  });
}
function azione(p, ok) {
  return inFila(async () => {
    occupato(1);
    try {
      usa(await backend().chiama(Object.assign({}, p, { chi: cfg.me })));
      if (ok) toast(ok);
      return true;
    } catch (e) { toast(e.message, true); return false; }
    finally { occupato(-1); }
  });
}
function usa(d, daCache) {
  st.lavori = (d.lavori || []).map(normalizza);
  st.persone = d.persone || [];
  st.settimane = d.settimane || {};
  st.eccezioni = d.eccezioni || {};
  st.admin = d.admin || '';
  if (!daCache) { st.caricato = Date.now(); if (cfg.url) S.set('cache', d); }
  render();
  badge();
  if (d.avviso) toast(d.avviso, true);
}

/* ---------- Pagina ---------- */
function render() {
  const me = cfg.me;
  $('#hello').innerHTML = me ? `Ciao <b>${esc(me)}</b> 👋` : 'Ciao 👋';
  const b = $('#btnMe');
  b.innerHTML = me ? av(me, 'lg') : '⚙️';

  let avv = '';
  const dr = daRispondere().length, pv = proposteDaVedere().length;
  if (dr && st.view !== 'home') avv += `<button class="banner hot" data-vai="home">📬 ${dr} da rispondere ›</button>`;
  if (pv && st.view !== 'home') avv += `<button class="banner hot" data-vai="home">🔔 ${pv} ${pv === 1 ? 'risposta' : 'risposte'} ›</button>`;
  if (!cfg.url) avv += `<button class="banner prova" data-go="imp">🧪 Prova · collega il foglio ›</button>`;
  $('#avvisi').innerHTML = avv;

  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.view === st.view));
  $('#fab').classList.toggle('hidden', st.view === 'fatti');
  if (st.view === 'liberi') renderLiberi();
  else if (st.view === 'fatti') renderFatti();
  else renderHome();
}

/* Pallino della disponibilità: pieno, metà sopra (mattina), metà sotto (pomeriggio) */
function pallino(n, v) {
  return `<i class="dot ${LIB[v || ''].c}" style="--c:${esc(persona(n).colore)}"></i>`;
}

function riga(j, conGiorno) {
  const s = STATO[j.fatto ? 'fatto' : j.stato];
  const mia = j.risposte[cfg.me];
  const tocca = !j.fatto && mia && j.creatore !== cfg.me && mia.r === 'attesa';
  const quando = (conGiorno ? giornoBreve(j.data) + ' · ' : '') + quandoTesto(j);
  return `<button class="job ${s.c} ${j.fatto ? 'done' : ''}" data-id="${esc(j.id)}">
    <span class="job-em">${esc(j.emoji)}</span>
    <span class="job-main"><span class="job-t">${esc(j.titolo)}</span>
      <span class="job-m">${esc(quando)} · ${j.assegnati.map(n => av(n, 'sm')).join('')}</span>
      ${tocca ? '<span class="tocca">👉 Tocca a te rispondere</span>' : ''}</span>
    <span class="pill ${s.c}">${s.i}</span></button>`;
}
const mio = j => j.assegnati.includes(cfg.me) || j.creatore === cfg.me;
function filtroMiei() {
  return `<div class="seg big2">
    <button class="${!st.soloMiei ? 'on' : ''}" data-miei="0">👨‍👩‍👧 Tutti</button>
    <button class="${st.soloMiei ? 'on' : ''}" data-miei="1">🙋 Solo i miei</button></div>`;
}
/* lavori raggruppati per giorno */
function perGiorni(arr) {
  const t = oggi();
  let h = '', ultimo = null;
  arr.forEach(j => {
    if (j.data !== ultimo) {
      ultimo = j.data;
      h += `<div class="when-h">${esc(giornoLungo(j.data))}${j.data === t ? ' · <span class="tag">oggi</span>' : j.data < t && !j.fatto ? ' · <span class="late">passato</span>' : ''}</div>`;
    }
    h += riga(j);
  });
  return h;
}

/* ---------- 🏠 Home: i lavori da fare ---------- */
function renderHome() {
  const L = st.lavori.filter(j => !j.fatto && (!st.soloMiei || mio(j)));
  const dr = daRispondere().sort(ordina), pv = proposteDaVedere().sort(ordina);
  const sopra = new Set([...dr, ...pv].map(j => j.id));
  const prossimi = L.filter(j => !sopra.has(j.id)).sort(ordina);
  let h = filtroMiei();
  if (dr.length) h += `<div class="box hot"><div class="box-t">📬 Da rispondere</div>${dr.map(j => riga(j, true)).join('')}</div>`;
  if (pv.length) h += `<div class="box hot"><div class="box-t">🔔 Risposte da vedere</div>${pv.map(j => riga(j, true)).join('')}</div>`;
  if (prossimi.length) h += `<div class="box"><div class="box-t">🧰 Lavori da fare</div>${perGiorni(prossimi)}</div>`;
  if (!dr.length && !pv.length && !prossimi.length) h += '<div class="empty big">Niente da fare 🎉<br><span class="muted">Tocca ＋ per aggiungere un lavoro</span></div>';
  $('#main').innerHTML = h;
}

/* ---------- ✔️ Fatti ---------- */
function renderFatti() {
  const L = st.lavori.filter(j => j.fatto && (!st.soloMiei || mio(j))).sort((a, b) => ordina(b, a));
  let h = filtroMiei();
  h += L.length ? `<div class="box"><div class="box-t">✔️ Lavori fatti <span class="muted small">(ultimi 2 mesi)</span></div>${perGiorni(L)}</div>`
    : '<div class="empty big">Ancora nessun lavoro fatto 💪</div>';
  $('#main').innerHTML = h;
}

/* ---------- 🙋 Giorni liberi: calendario con chi è libero ---------- */
function renderLiberi() {
  if (!st.mese) { const d = new Date(); st.mese = new Date(d.getFullYear(), d.getMonth(), 1); }
  if (!st.giorno) st.giorno = oggi();
  const m = st.mese, t = oggi();
  const primo = new Date(m.getFullYear(), m.getMonth(), 1);
  const off = (primo.getDay() + 6) % 7;
  const celle = Math.ceil((off + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7) * 7;
  const per = {};
  st.lavori.slice().sort(ordina).forEach(j => { (per[j.data] = per[j.data] || []).push(j); });

  let h = `<div class="cal" id="cal"><div class="cal-head">
    <button class="nav" data-mese="-1" aria-label="Mese prima">‹</button>
    <div class="cal-title">${m.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
    <button class="nav" data-mese="1" aria-label="Mese dopo">›</button></div>
    <div class="grid">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(g => `<div class="wd">${g}</div>`).join('')}`;
  for (let i = 0; i < celle; i++) {
    const d = new Date(primo); d.setDate(1 - off + i);
    const k = ymd(d), L = per[k] || [];
    const em = L.slice(0, 2).map(j => `<span class="em ${j.fatto ? 'done' : ''}">${esc(j.emoji)}</span>`).join('') + (L.length > 2 ? `<span class="more">+${L.length - 2}</span>` : '');
    const dots = st.persone.map(p => pallino(p.nome, liberoDi(p.nome, k))).join('');
    h += `<button class="cell ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${k === t ? 'today' : ''} ${k === st.giorno ? 'sel' : ''} ${k < t ? 'past' : ''}" data-giorno="${k}">
      <span class="n">${d.getDate()}</span><span class="ems">${em}</span><span class="dots">${dots}</span></button>`;
  }
  h += `</div><div class="legenda"><span><i class="dot l-tutto"></i>tutto il giorno</span><span><i class="dot l-mattina"></i>mattina</span><span><i class="dot l-pomeriggio"></i>pomeriggio</span></div>
    <div class="legenda">${st.persone.map(p => `<span><i class="dot l-tutto" style="--c:${esc(persona(p.nome).colore)}"></i>${esc(p.nome)}</span>`).join('')}</div></div>
    <button class="btn" data-settimana>📆 La mia settimana tipo</button>`;

  const g = st.giorno;
  h += `<section class="day"><div class="day-h"><h2>${esc(giornoLungo(g))}</h2>${g === t ? '<span class="tag">oggi</span>' : `<button class="chip-btn" data-oggi>Torna a oggi</button>`}</div>
    <div class="box"><div class="box-t">🙋 Chi è libero</div>
    ${st.persone.map(p => {
      const v = liberoDi(p.nome, g), puo = p.nome === cfg.me || sonoCapo();
      const ecc = ((st.eccezioni[p.nome] || {})[g]) ? ' <span class="muted small">(diverso dal solito)</span>' : '';
      return `<${puo ? 'button' : 'div'} class="free-row" ${puo ? `data-ecc="${esc(p.nome)}"` : ''}>${av(p.nome)}<b>${esc(p.nome)}${ecc}</b>
        <span class="lib ${LIB[v].c}">${LIB[v].i} ${LIB[v].t}</span>${puo ? '<span class="edit">✏️</span>' : ''}</${puo ? 'button' : 'div'}>`;
    }).join('') || '<div class="muted">Nessuna persona</div>'}</div>
    <div class="box"><div class="box-t">🧰 Lavori del giorno</div>
    ${(per[g] || []).map(j => riga(j)).join('') || '<div class="empty">Nessun lavoro in questo giorno 😌</div>'}
    <button class="btn add" data-nuovo="${g}">➕ Aggiungi un lavoro</button></div></section>`;
  $('#main').innerHTML = h;
}

/* ---------- 📆 Settimana tipo (pannello) ---------- */
function htmlSettimana() {
  const capo = sonoCapo();
  const chi = (capo && st.chiLiberi) || cfg.me;
  const sett = (st.settimane[chi] || []).concat(['', '', '', '', '', '', '']).slice(0, 7);
  let h = testata('📆 Settimana tipo');
  if (capo) h += `<div class="chips">${st.persone.map(p => `<button type="button" class="chip ${p.nome === chi ? 'on' : ''}" data-chi-liberi="${esc(p.nome)}">${av(p.nome, 'xs')} ${esc(p.nome)}</button>`).join('')}</div>`;
  h += `<div class="box"><div class="box-t">${chi === cfg.me ? '🙋 Quando sei libero di solito?' : '🙋 ' + esc(chi)}</div>
    <div class="muted small">Tocca per cambiare, si salva da solo.</div>
    ${GIORNI.map((g, i) => `<div class="wk-row"><div class="wk-d">${g}</div><div class="seg">${['tutto', 'mattina', 'pomeriggio', 'no'].map(v =>
      `<button type="button" class="${sett[i] === v ? 'on ' + LIB[v].c : ''}" data-sett="${i}" data-v="${v}" aria-label="${LIB[v].t}"><span>${LIB[v].i}</span><small>${v === 'tutto' ? 'Tutto' : v === 'no' ? 'No' : LIB[v].t}</small></button>`).join('')}</div></div>`).join('')}
  </div>`;
  const ecc = st.eccezioni[chi] || {};
  const giorni = Object.keys(ecc).filter(d => d >= oggi()).sort();
  h += `<div class="box"><div class="box-t">📌 Giorni diversi dal solito</div>
    ${giorni.map(d => `<div class="free-row"><b>${esc(giornoBreve(d))}</b><span class="lib ${LIB[ecc[d]].c}">${LIB[ecc[d]].i} ${LIB[ecc[d]].t}</span>
      <button type="button" class="x sm" data-via-ecc="${d}" aria-label="Togli">×</button></div>`).join('') || '<div class="muted">Nessuno. Puoi segnarli anche toccando il tuo nome sotto il calendario.</div>'}
    <button type="button" class="btn" data-nuova-ecc>➕ Segna un giorno diverso</button></div>`;
  h += `<div class="box"><div class="box-t">👨‍👩‍👧 La famiglia</div><div class="fam">
    <div></div>${GIORNI.map(g => `<div class="fam-h">${g.slice(0, 3)}</div>`).join('')}
    ${st.persone.map(p => `<div class="fam-n">${av(p.nome, 'xs')}</div>${(st.settimane[p.nome] || []).concat(['', '', '', '', '', '', '']).slice(0, 7).map(v => `<div class="fam-c">${LIB[v || ''].i}</div>`).join('')}`).join('')}
  </div></div>`;
  return h;
}
function apriSettimana() {
  if (!cfg.me) return apriImpostazioni('Prima dimmi chi sei 🙋');
  apriPannello(htmlSettimana());
  $('#sheet').onclick = async e => {
    const t = e.target, q = s => t.closest(s);
    let x;
      if ((x = q('[data-chi-liberi]'))) { st.chiLiberi = x.dataset.chiLiberi; return aggiornaSettimana(); }
      if ((x = q('[data-via-ecc]'))) {
      if (await azione({ action: 'eccezione', nome: (sonoCapo() && st.chiLiberi) || cfg.me, data: x.dataset.viaEcc, valore: '' }, 'Tolto 👍')) aggiornaSettimana();
    }
  };
}
function aggiornaSettimana() {
  if ($('#sheetBg').classList.contains('hidden')) return;
  const sh = $('#sheet'), y = sh.scrollTop;
  sh.innerHTML = htmlSettimana();
  sh.scrollTop = y;
}

let timerSett = null;
function cambiaSettimana(i, v) {
  const chi = (sonoCapo() && st.chiLiberi) || cfg.me;
  const s = (st.settimane[chi] || []).concat(['', '', '', '', '', '', '']).slice(0, 7);
  s[i] = s[i] === v ? '' : v;
  st.settimane[chi] = s;
  aggiornaSettimana();
  clearTimeout(timerSett);
  timerSett = setTimeout(() => azione({ action: 'settimana', nome: chi, settimana: st.settimane[chi] }, 'Settimana salvata 👍'), 900);
}

function formEccezione(nome, data) {
  data = data || oggi();
  const solito = (st.settimane[nome] || [])[giornoSett(data)] || '';
  apriPannello(`${testata(nome === cfg.me ? '📌 Un giorno diverso' : '📌 ' + esc(nome))}
    <form id="f">
      <label>Giorno<input type="date" name="data" value="${esc(data)}" min="${oggi()}" required></label>
      <div class="muted" id="solito">Di solito: ${LIB[solito].i} ${LIB[solito].t}</div>
      <div class="lbl">Quel giorno sei libero…</div>
      <div class="pick4">${['tutto', 'mattina', 'pomeriggio', 'no'].map(v => `<button type="button" class="pick ${LIB[v].c}" data-a="ecc" data-v="${v}"><span>${LIB[v].i}</span>${LIB[v].t}</button>`).join('')}</div>
      <button type="button" class="btn ghost" data-a="ecc" data-v="">↩️ Come al solito</button>
    </form>`);
  const f = $('#f');
  f.data.onchange = () => { const s = (st.settimane[nome] || [])[giornoSett(f.data.value)] || ''; $('#solito').textContent = `Di solito: ${LIB[s].i} ${LIB[s].t}`; };
  $('#sheet').onclick = async e => {
    const b = e.target.closest('[data-a=ecc]');
    if (!b || !f.data.value) return;
    if (await azione({ action: 'eccezione', nome, data: f.data.value, valore: b.dataset.v }, 'Fatto 👍')) chiudiPannello();
  };
}

/* ---------- Pannello dal basso ---------- */
function apriPannello(html) {
  const bg = $('#sheetBg'), aperto = !bg.classList.contains('hidden');
  $('#sheet').onclick = null;
  $('#sheet').innerHTML = html;
  $('#sheet').scrollTop = 0;
  bg.classList.remove('hidden');
  document.body.classList.add('noscroll');
  if (!aperto) history.pushState({ pannello: 1 }, '');
  occupato(0);
}
function chiudiPannello(daIndietro) {
  const bg = $('#sheetBg');
  if (bg.classList.contains('hidden')) return;
  bg.classList.add('hidden');
  document.body.classList.remove('noscroll');
  $('#sheet').innerHTML = '';
  if (!daIndietro && history.state && history.state.pannello) history.back();
}
window.addEventListener('popstate', () => chiudiPannello(true));
const testata = t => `<div class="sheet-h"><h2>${t}</h2><button class="x" data-close aria-label="Chiudi">×</button></div>`;
const btn = (a, t, c = '') => `<button class="btn ${c}" data-a="${a}">${t}</button>`;

/* ---------- Dettaglio ---------- */
function apriDettaglio(id) {
  const j = st.lavori.find(x => x.id === id);
  if (!j) { chiudiPannello(); return; }
  st.aperto = id;
  const s = STATO[j.fatto ? 'fatto' : j.stato];
  const mia = j.risposte[cfg.me], gestisco = puoGestire(j);
  const rispondo = mia && j.creatore !== cfg.me && !j.fatto;

  const persone = j.assegnati.map(n => {
    const r = j.risposte[n] || { r: 'attesa' };
    const rs = n === j.creatore ? { t: 'Ha creato il lavoro', i: '✍️', c: 's-ok' } : RISP[r.r] || RISP.attesa;
    const v = liberoDi(n, j.data);
    let extra = '';
    if (r.r === 'altro') extra += `<div class="p-extra">📅 Propone <b>${esc(giornoLungo(r.data))}</b>${r.ora ? ' alle ' + esc(r.ora) : ''}</div>`;
    if (r.nota) extra += `<div class="p-extra nota">💬 ${esc(r.nota)}</div>`;
    if (gestisco && r.r === 'altro' && !j.fatto) extra += `<button class="btn ok sm" data-a="sposta" data-p="${esc(n)}">📅 Sposta a ${esc(giornoBreve(r.data))}</button>`;
    return `<div class="p-wrap"><div class="p-row">${av(n)}<b>${esc(n)}</b><span class="pill ${rs.c}">${rs.i} ${rs.t}</span></div>
      <div class="p-lib muted small">Quel giorno: ${LIB[v].i} ${LIB[v].t}</div>${extra}</div>`;
  }).join('');

  const az = [];
  if (rispondo) {
    az.push(`<div class="lbl">${mia.r === 'attesa' ? '👉 Rispondi' : '✏️ Cambia risposta'}</div><div class="pick3">
      <button class="pick ${mia.r === 'ok' ? 'on' : ''} s-ok" data-a="ok"><span>✅</span>Ci sto</button>
      <button class="pick ${mia.r === 'no' ? 'on' : ''} s-no" data-a="no"><span>❌</span>Non posso</button>
      <button class="pick ${mia.r === 'altro' ? 'on' : ''} s-altro" data-a="altro"><span>📅</span>Altro giorno</button></div>`);
  }
  const coinvolto = mia || gestisco;
  if (coinvolto && !j.fatto) az.push(btn('fatto', '✔️ Segna come fatto', 'main'));
  if (coinvolto && j.fatto) az.push(btn('riapri', '↺ Riapri'));
  if (gestisco) az.push(`<div class="row2">${btn('edita', '✏️ Modifica', 'ghost')}${btn('elimina', '🗑️ Elimina', 'ghost danger')}</div>`);

  apriPannello(`<div class="sheet-h"><span class="pill ${s.c}">${s.i} ${s.t}</span><button class="x" data-close aria-label="Chiudi">×</button></div>
    <div class="det-em">${esc(j.emoji)}</div>
    <div class="det-t">${esc(j.titolo)}</div>
    <div class="det-w">📅 ${esc(giornoLungo(j.data))} · ${esc(quandoTesto(j))}${j.quando === 'ora' ? ` <span class="muted">(${esc((DURATE.find(d => d[0] === j.durata) || [0, j.durata + ' min'])[1])})</span>` : ''}</div>
    <div class="muted">✍️ Creato da ${esc(j.creatore)}</div>
    ${j.descrizione ? `<div class="box"><div class="box-t">📝 Dettagli</div><div class="pre">${esc(j.descrizione)}</div></div>` : ''}
    <div class="box"><div class="box-t">🙋 Chi lo fa</div>${persone}</div>
    <div class="actions">${az.join('')}</div>`);

  $('#sheet').onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'ok') { if (await azione({ action: 'rispondi', id: j.id, tipo: 'ok' }, 'Grazie! 👍')) chiudiPannello(); }
    else if (a === 'no') formNota(j);
    else if (a === 'altro') formAltroGiorno(j);
    else if (a === 'sposta') { if (await azione({ action: 'sposta', id: j.id, persona: b.dataset.p }, 'Lavoro spostato 📅')) apriDettaglio(j.id); }
    else if (a === 'fatto') { if (await azione({ action: 'fatto', id: j.id }, 'Fatto! 🎉')) chiudiPannello(); }
    else if (a === 'riapri') { if (await azione({ action: 'riapri', id: j.id }, 'Riaperto')) apriDettaglio(j.id); }
    else if (a === 'edita') formLavoro(j);
    else if (a === 'elimina') { if (confirm(`Eliminare "${j.titolo}"?`) && await azione({ action: 'elimina', id: j.id }, 'Eliminato 🗑️')) chiudiPannello(); }
  };
}

function formNota(j) {
  apriPannello(`${testata('❌ Non posso')}
    <form id="f"><label>Vuoi dire perché? <span class="muted small">(facoltativo)</span><textarea name="nota" rows="3" placeholder="Es. quel giorno lavoro"></textarea></label>
    <button class="btn main big" type="submit">📨 Invia</button></form>`);
  const f = $('#f');
  f.onsubmit = async e => { e.preventDefault(); if (await azione({ action: 'rispondi', id: j.id, tipo: 'no', nota: f.nota.value }, 'Risposta inviata')) apriDettaglio(j.id); };
}

function formAltroGiorno(j) {
  const fascia = fasciaLavoro(j);
  const prossimi = [];
  for (let i = 0, d = oggi(); prossimi.length < 8 && i < 21; i++, d = piu(d, 1)) {
    if (d === j.data) continue;
    const v = liberoDi(cfg.me, d);
    if (liberaPer(v, fascia) === 'si' || liberaPer(v, fascia) === 'parte') prossimi.push([d, v]);
  }
  apriPannello(`${testata('📅 Un altro giorno')}
    <div class="muted">${esc(j.emoji + ' ' + j.titolo)} — ora è ${esc(giornoBreve(j.data))}</div>
    ${prossimi.length ? `<div class="lbl">I tuoi prossimi giorni liberi</div><div class="chips">${prossimi.map(([d, v]) =>
      `<button type="button" class="chip" data-giorno-prop="${d}">${LIB[v].i} ${esc(giornoBreve(d))}</button>`).join('')}</div>` : ''}
    <form id="f">
      <div class="row2"><label>Giorno<input type="date" name="data" required min="${oggi()}" value="${esc(prossimi.length ? prossimi[0][0] : j.data)}"></label>
      <label>Ora <span class="muted small">(facolt.)</span><input type="time" name="ora"></label></div>
      <label>Messaggio <span class="muted small">(facoltativo)</span><textarea name="nota" rows="2" placeholder="Es. sabato mattina sono libero"></textarea></label>
      <button class="btn main big" type="submit">📨 Invia proposta</button>
    </form>`);
  const f = $('#f');
  $('#sheet').onclick = e => {
    const c = e.target.closest('[data-giorno-prop]');
    if (!c) return;
    f.data.value = c.dataset.giornoProp;
    document.querySelectorAll('[data-giorno-prop]').forEach(x => x.classList.toggle('on', x === c));
  };
  f.onsubmit = async e => {
    e.preventDefault();
    if (await azione({ action: 'rispondi', id: j.id, tipo: 'altro', data: f.data.value, ora: f.ora.value, nota: f.nota.value }, `Proposta inviata a ${j.creatore} 📨`)) apriDettaglio(j.id);
  };
}

/* ---------- Nuovo / modifica lavoro ---------- */
function formLavoro(j, giorno) {
  const nuovo = !j;
  const primo = (st.persone.find(p => p.nome !== cfg.me) || {}).nome || cfg.me;
  const v = j || { emoji: '🧹', titolo: '', descrizione: '', data: giorno || oggi(), quando: 'giornata', ora: '', durata: 60, assegnati: primo ? [primo] : [] };
  apriPannello(`${testata(nuovo ? '➕ Nuovo lavoro' : '✏️ Modifica lavoro')}
    <form id="f" autocomplete="off">
      <div class="emojis">${EMOJI.map(e => `<label><input type="radio" name="emoji" value="${e}" ${e === v.emoji ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div>
      <label>Cosa c'è da fare<input name="titolo" required maxlength="80" placeholder="Es. Tagliare l'erba" value="${esc(v.titolo)}"></label>
      <label>Giorno<input type="date" name="data" required value="${esc(v.data)}"></label>
      <div class="lbl">Quando</div>
      <div class="pick4 q">${Object.keys(QUANDO_T).map(k => { const [i, ...r] = QUANDO_T[k].split(' '); return `<label><input type="radio" name="quando" value="${k}" ${v.quando === k ? 'checked' : ''}><span class="pick"><span>${i}</span>${r.join(' ')}</span></label>`; }).join('')}</div>
      <div class="row2" id="rigaOra"><label>Ora<input type="time" name="ora" value="${esc(v.ora)}"></label>
        <label>Quanto dura<select name="durata">${DURATE.map(d => `<option value="${d[0]}" ${Number(v.durata) === d[0] ? 'selected' : ''}>${d[1]}</option>`).join('')}</select></label></div>
      <div class="lbl">Per chi <span class="muted small">(anche più di uno)</span></div>
      <div class="chips" id="perChi"></div>
      <label>Dettagli <span class="muted small">(facoltativi)</span><textarea name="descrizione" rows="2" placeholder="Cosa serve, dove…">${esc(v.descrizione)}</textarea></label>
      ${!nuovo ? '<div class="muted small">Se cambi giorno o orario, gli altri riceveranno un avviso e dovranno riconfermare.</div>' : ''}
      <div class="err" id="err"></div>
      <button class="btn main big" type="submit">${nuovo ? '📨 Salva e avvisa' : '💾 Salva'}</button>
    </form>`);
  const f = $('#f');
  let scelti = v.assegnati.slice();
  const disegnaPersone = () => {
    const quando = f.querySelector('input[name=quando]:checked').value;
    const fascia = fasciaLavoro({ quando, ora: f.ora.value || '12:00' });
    $('#perChi').innerHTML = st.persone.map(p => {
      const lv = liberoDi(p.nome, f.data.value), lp = liberaPer(lv, fascia);
      const segno = { si: '✅ libero', parte: '🟡 in parte', no: '❌ occupato', '': '❔' }[lp];
      return `<button type="button" class="chip person ${scelti.includes(p.nome) ? 'on' : ''}" data-persona="${esc(p.nome)}">${av(p.nome, 'xs')} ${esc(p.nome)}${p.nome === cfg.me ? ' (io)' : ''}<small>${segno}</small></button>`;
    }).join('') || '<div class="muted">Aggiungi le persone nel foglio (scheda Persone)</div>';
  };
  const ora = () => { $('#rigaOra').classList.toggle('hidden', f.querySelector('input[name=quando]:checked').value !== 'ora'); disegnaPersone(); };
  f.addEventListener('change', ora);
  ora();
  $('#perChi').onclick = e => {
    const c = e.target.closest('[data-persona]');
    if (!c) return;
    const n = c.dataset.persona;
    scelti = scelti.includes(n) ? scelti.filter(x => x !== n) : scelti.concat(n);
    disegnaPersone();
  };
  if (nuovo) setTimeout(() => f.titolo.focus(), 250);
  f.onsubmit = async e => {
    e.preventDefault();
    const quando = f.querySelector('input[name=quando]:checked').value;
    if (!scelti.length) { $('#err').textContent = 'Scegli almeno una persona 🙋'; return; }
    if (quando === 'ora' && !f.ora.value) { $('#err').textContent = 'Scegli l\'ora 🕐'; return; }
    const dati = { emoji: f.querySelector('input[name=emoji]:checked').value, titolo: f.titolo.value, descrizione: f.descrizione.value,
      data: f.data.value, quando, ora: f.ora.value, durata: f.durata.value, assegnati: scelti };
    const altri = scelti.filter(n => n !== cfg.me);
    const ok = await azione(Object.assign({ action: nuovo ? 'crea' : 'modifica', id: j && j.id }, dati),
      nuovo ? (altri.length ? `Inviato a ${altri.join(', ')} 📨` : 'Salvato 👍') : 'Salvato 👍');
    if (ok) {
      st.giorno = dati.data;
      const d = daYmd(dati.data); st.mese = new Date(d.getFullYear(), d.getMonth(), 1);
      chiudiPannello(); render();
    }
  };
}

/* ---------- Impostazioni ---------- */
function sceltaMe(scelto) {
  return `<div class="chips">${st.persone.map(p => `<label><input type="radio" name="me" value="${esc(p.nome)}" ${p.nome === scelto ? 'checked' : ''}><span class="chip">${av(p.nome, 'xs')} ${esc(p.nome)}</span></label>`).join('')}</div>`;
}
function apriImpostazioni(msg) {
  const prova = !cfg.url;
  apriPannello(`${testata('⚙️ Impostazioni')}
    ${msg ? `<div class="banner">${esc(msg)}</div>` : ''}
    <form id="f" autocomplete="off">
      <div class="lbl">🙋 Chi sei?</div><div id="sceltaMe">${sceltaMe(cfg.me)}</div>
      ${prova ? `<label>Persone della famiglia <span class="muted small">(separate da virgola)</span><input name="persone" value="${esc(S.get('provaNomi', PROVA_NOMI).join(', '))}"></label>` : ''}
      <div class="lbl">🎨 Aspetto</div>
      <div class="seg">${[['auto', '📱 Come il telefono'], ['light', '☀️ Chiaro'], ['dark', '🌙 Scuro']].map(([k, t]) => `<button type="button" class="${cfg.tema === k ? 'on' : ''}" data-tema="${k}">${t}</button>`).join('')}</div>
      <div class="box"><div class="box-t">🔗 Collegamento al foglio Google</div>
        <label>Link dello script<input name="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cfg.url)}"></label>
        <label>PIN di famiglia<input name="pin" type="password" inputmode="numeric" value="${esc(cfg.pin)}"></label>
        <div class="err" id="err"></div></div>
      <button class="btn main big" type="submit">💾 Salva</button>
      ${cfg.url ? '<button class="btn" type="button" id="btnInvito">📲 Copia il link per la famiglia</button>' : ''}
      ${prova ? '<button class="btn ghost" type="button" id="btnReset">🧪 Ricomincia con i dati di prova</button>' : ''}
      <div class="muted small center">Lavori di casa · versione ${VERSIONE}</div>
    </form>`);
  const f = $('#f');
  $('#sheet').onclick = e => {
    const t = e.target.closest('[data-tema]');
    if (!t) return;
    cfg.tema = t.dataset.tema; S.set('tema', cfg.tema); tema();
    document.querySelectorAll('[data-tema]').forEach(x => x.classList.toggle('on', x === t));
  };
  if (prova) {
    f.persone.onchange = () => {
      const nomi = f.persone.value.split(',').map(x => x.trim()).filter(Boolean);
      S.set('provaNomi', nomi.length ? nomi : PROVA_NOMI);
      st.persone = Prova.pacchetto(Prova.db()).persone;
      $('#sceltaMe').innerHTML = sceltaMe((f.querySelector('input[name=me]:checked') || {}).value);
    };
    $('#btnReset').onclick = () => { if (confirm('Cancellare i dati di prova?')) { S.set('prova', null); carica(); chiudiPannello(); } };
  }
  const inv = $('#btnInvito');
  if (inv) inv.onclick = async () => {
    const link = location.origin + location.pathname + '#collega=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ u: cfg.url, p: cfg.pin })))));
    try { await navigator.clipboard.writeText(link); toast('📋 Link copiato: mandalo solo alla famiglia'); }
    catch (e) { prompt('Copia questo link e mandalo alla famiglia:', link); }
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('#err'); err.textContent = '';
    const url = f.url.value.trim(), pin = f.pin.value.trim();
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { err.textContent = 'Il link deve iniziare con https://script.google.com/'; return; }
    let nuovi = null;
    if (url && (url !== cfg.url || pin !== cfg.pin)) {
      try { nuovi = await Foglio.chiama({ action: 'list' }, url, pin); } catch (ex) { err.textContent = ex.message; return; }
    }
    cfg.url = url; cfg.pin = pin; S.set('url', url); S.set('pin', pin);
    if (nuovi) usa(nuovi); else if (!url) await carica();
    const scelto = (f.querySelector('input[name=me]:checked') || {}).value;
    if (scelto) { cfg.me = scelto; S.set('me', scelto); }
    if (!cfg.me || !st.persone.some(p => p.nome === cfg.me)) { apriImpostazioni(nuovi ? 'Collegato ✅ Ora scegli chi sei.' : 'Scegli chi sei per continuare 🙋'); return; }
    chiudiPannello(); render();
    toast(nuovi ? 'Collegato al foglio ✅' : 'Salvato 👍');
  };
}
function leggiInvito() {
  const m = location.hash.match(/collega=([^&]+)/);
  if (!m) return false;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    if (o.u) { cfg.url = o.u; cfg.pin = o.p || ''; S.set('url', cfg.url); S.set('pin', cfg.pin); }
  } catch (e) { /* link rovinato */ }
  history.replaceState(null, '', location.pathname);
  return true;
}
function tema() {
  if (cfg.tema === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = cfg.tema;
}

/* ---------- Avvisi ---------- */
let timerToast;
function toast(msg, male) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (male ? ' bad' : '');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.add('hidden'), male ? 4500 : 2600);
}
function badge() {
  const n = daRispondere().length + proposteDaVedere().length;
  document.title = (n ? `(${n}) ` : '') + 'Lavori di casa';
  try { if ('setAppBadge' in navigator) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) { /* niente */ }
}

/* ---------- Tocchi ---------- */
document.addEventListener('click', e => {
  const t = e.target, q = s => t.closest(s);
  if (q('[data-close]') || t.id === 'sheetBg') { chiudiPannello(); return; }
  if (q('#sheet')) return;                       // il pannello ha i suoi gestori
  let x;
  if (q('[data-go]')) return apriImpostazioni();
  if ((x = q('[data-vai]'))) { st.view = x.dataset.vai; S.set('view', st.view); return render(); }
  if ((x = q('.job[data-id]'))) return apriDettaglio(x.dataset.id);
  if ((x = q('#tabs button'))) { st.view = x.dataset.view; S.set('view', st.view); window.scrollTo(0, 0); return render(); }
  if ((x = q('.cell[data-giorno]'))) {
    st.giorno = x.dataset.giorno;
    const d = daYmd(st.giorno);
    if (d.getMonth() !== st.mese.getMonth()) st.mese = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    const day = document.querySelector('.day');
    if (day && day.getBoundingClientRect().top > innerHeight * 0.75) day.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if ((x = q('[data-mese]'))) return cambiaMese(Number(x.dataset.mese));
  if (q('[data-oggi]')) { const d = new Date(); st.mese = new Date(d.getFullYear(), d.getMonth(), 1); st.giorno = oggi(); return render(); }
  if ((x = q('[data-nuovo]'))) return formLavoro(null, x.dataset.nuovo);
  if ((x = q('[data-ecc]'))) return formEccezione(x.dataset.ecc, st.giorno);
  if (q('[data-settimana]')) return apriSettimana();
  if ((x = q('[data-miei]'))) { st.soloMiei = x.dataset.miei === '1'; return render(); }
});
function cambiaMese(n) { st.mese = new Date(st.mese.getFullYear(), st.mese.getMonth() + n, 1); render(); }

// scorri a destra/sinistra sul calendario per cambiare mese
let tocco = null;
document.addEventListener('touchstart', e => { tocco = e.target.closest('#cal') ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!tocco) return;
  const dx = e.changedTouches[0].clientX - tocco.x, dy = e.changedTouches[0].clientY - tocco.y;
  tocco = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cambiaMese(dx < 0 ? 1 : -1);
}, { passive: true });

$('#fab').onclick = () => formLavoro(null, st.view === 'liberi' ? st.giorno : oggi());
$('#btnSync').onclick = () => carica();
$('#btnMe').onclick = () => apriImpostazioni();
// riaprendo l'app si aggiorna da sola (al massimo una volta al minuto)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - st.caricato > 60000) carica(true);
});

/* ---------- Avvio ---------- */
(async function avvio() {
  tema();
  const invito = leggiInvito();
  const c = cfg.url && S.get('cache', null);
  if (c) usa(c, true); else render();
  await carica(!!cfg.url && !invito);
  if (!cfg.me || !st.persone.some(p => p.nome === cfg.me)) apriImpostazioni(invito ? 'Benvenuto! 👋 Scegli chi sei.' : 'Per iniziare dimmi chi sei 🙋');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
