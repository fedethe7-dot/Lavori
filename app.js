'use strict';
/* Lavori di casa — interfaccia dell'app */

const VERSIONE = '1.1';
const STATI = {
  attesa:    { label: 'In attesa', icon: '⏳', cls: 's-attesa' },
  accettato: { label: 'Accettato', icon: '✅', cls: 's-accettato' },
  rifiutato: { label: 'Non può',   icon: '❌', cls: 's-rifiutato' },
  proposta:  { label: 'Proposta',  icon: '🔄', cls: 's-proposta' },
  fatto:     { label: 'Fatto',     icon: '✔️', cls: 's-fatto' }
};
const COLORI = ['#7c8cff', '#ff7ab6', '#3dd68c', '#ffb547', '#4cc9f0', '#ff8a5b'];
const PERSONE_PROVA = ['Federico', 'Mamma', 'Sorella'];
const DURATE = [[30, '30 minuti'], [60, '1 ora'], [90, '1 ora e mezza'], [120, '2 ore'], [180, '3 ore'], [240, 'Mezza giornata'], [480, 'Tutta la giornata']];
const GIORNI_SETT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/* ---------- Memoria del telefono ---------- */
const S = {
  get(k, d) { try { const v = localStorage.getItem('lavori.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lavori.' + k, JSON.stringify(v)); } catch (e) { /* niente */ } }
};

const cfg = { url: S.get('url', ''), pin: S.get('pin', ''), me: S.get('me', '') };
const st = {
  lavori: [], persone: [], storico: [],
  view: S.get('view', 'cal'),
  mese: null, giorno: null,
  filtro: null, mostraFatti: false,
  inCorso: 0, ultimoCaricamento: 0
};

/* ---------- Utilità ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const oggi = () => ymd(new Date());
const piuGiorni = (s, n) => { const d = daYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const ordina = (a, b) => (a.data + (a.ora || '99')).localeCompare(b.data + (b.ora || '99'));

function dataBreve(s) {
  if (!s) return '';
  const t = oggi();
  if (s === t) return 'Oggi';
  if (s === piuGiorni(t, 1)) return 'Domani';
  if (s === piuGiorni(t, -1)) return 'Ieri';
  return daYmd(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}
function dataLunga(s) {
  const t = daYmd(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function durataTesto(min) {
  const f = DURATE.find(d => d[0] === Number(min));
  if (f) return f[1];
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + ' min' : ''}` : `${min} min`;
}
function quandoStorico(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ---------- Persone ---------- */
function persona(nome) {
  return st.persone.find(p => p.nome === nome) || { nome, colore: '#8b93a7' };
}
function avatar(nome, cls = '') {
  const p = persona(nome);
  const ini = (nome || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="av ${cls}" style="background:${esc(p.colore)}">${esc(ini)}</span>`;
}

/* ---------- Cosa tocca a me ---------- */
const miaRisposta = j => (j.risposte && j.risposte[cfg.me]) || null;
const altri = j => j.assegnati.filter(n => n !== j.creatore);
const conStato = (j, s) => altri(j).filter(n => j.risposte[n] && j.risposte[n].stato === s);

function toccaAMe(j) {
  const me = cfg.me;
  if (!me || j.stato === 'fatto') return '';
  const mia = miaRisposta(j);
  if (mia && j.creatore !== me && mia.stato === 'attesa') return 'Tocca a te rispondere';
  if (j.creatore === me) {
    const prop = conStato(j, 'proposta');
    if (prop.length) return prop.length === 1 ? `${prop[0]} propone una modifica` : `${prop.length} proposte da vedere`;
    if (j.stato === 'rifiutato') return 'Nessuno può: cambia giorno o persone';
  }
  return '';
}
function gruppi() {
  const me = cfg.me, t = oggi(), fra7 = piuGiorni(t, 7), L = st.lavori.filter(j => j.stato !== 'fatto');
  return {
    rispondere: L.filter(j => j.creatore !== me && (miaRisposta(j) || {}).stato === 'attesa'),
    valutare: L.filter(j => j.creatore === me && (conStato(j, 'proposta').length || j.stato === 'rifiutato')),
    aspetto: L.filter(j => j.creatore === me && conStato(j, 'attesa').length),
    settimana: L.filter(j => miaRisposta(j) && j.data >= t && j.data <= fra7 && ['accettato', 'proposta'].includes(miaRisposta(j).stato))
  };
}
const CARDS = [
  { k: 'rispondere', ico: '📬', lab: 'Da rispondere', hot: true },
  { k: 'valutare', ico: '🔄', lab: 'Risposte da vedere', hot: true },
  { k: 'aspetto', ico: '⏳', lab: 'Aspetto risposta' },
  { k: 'settimana', ico: '📅', lab: 'I miei prossimi 7 giorni' }
];

/* ---------- Dati: modalità prova (solo telefono) o foglio Google ---------- */
const Prova = {
  leggi() {
    let db = S.get('dbProva', null);
    if (!db) { db = datiDiProva(); S.set('dbProva', db); }
    db.lavori.forEach(normalizza);
    return db;
  },
  pacchetto(db) {
    const nomi = S.get('personeProva', PERSONE_PROVA);
    return { ok: true, lavori: db.lavori, storico: db.storico, persone: nomi.map((n, i) => ({ nome: n, colore: COLORI[i % COLORI.length] })) };
  },
  async chiama(p) {
    const db = this.leggi();
    if (p.action !== 'list') { applica(db, p); S.set('dbProva', db); }
    return this.pacchetto(db);
  }
};

const Foglio = {
  async chiama(p, url = cfg.url, pin = cfg.pin) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, p, { pin }))
      });
    } catch (e) {
      throw new Error('Nessuna connessione con il foglio');
    }
    if (!r.ok) throw new Error('Il foglio non risponde (' + r.status + ')');
    let d;
    try { d = await r.json(); } catch (e) { throw new Error('Il link dello script non sembra giusto'); }
    if (!d.ok) throw new Error(d.error || 'Errore dal foglio');
    return d;
  }
};
const backend = () => (cfg.url ? Foglio : Prova);

function datiDiProva() {
  const t = oggi(), adesso = new Date().toISOString();
  const db = { lavori: [], storico: [] };
  const fai = (chi, p) => applica(db, Object.assign({ chi }, p), adesso).lavoro;
  fai('Mamma', { action: 'crea', titolo: 'Tagliare l\'erba in giardino', descrizione: 'Davanti e dietro casa.\nIl trattorino ha già la benzina.', data: piuGiorni(t, 2), ora: '09:30', durata: 120, assegnati: ['Federico'] });
  const taverna = fai('Federico', { action: 'crea', titolo: 'Pulire la taverna', descrizione: 'Spazzare, lavare il pavimento e buttare i cartoni.', data: piuGiorni(t, 3), ora: '17:00', assegnati: ['Mamma', 'Sorella'] });
  fai('Mamma', { action: 'rispondi', id: taverna.id, tipo: 'accetta' });
  fai('Sorella', { action: 'rispondi', id: taverna.id, tipo: 'data', propData: piuGiorni(t, 5), propOra: '10:00', nota: 'Quel giorno esco tardi dal lavoro, sabato mattina va bene?' });
  fai('Federico', { action: 'crea', titolo: 'Pulire le grondaie', data: piuGiorni(t, 6), assegnati: ['Federico'] });
  fai('Federico', { action: 'crea', titolo: 'Spesa grande', descrizione: 'La lista è sul frigo', data: t, ora: '18:30', assegnati: ['Mamma'] });
  const lamp = fai('Mamma', { action: 'crea', titolo: 'Cambiare la lampadina in taverna', data: piuGiorni(t, -2), assegnati: ['Federico'] });
  fai('Federico', { action: 'rispondi', id: lamp.id, tipo: 'accetta' });
  fai('Federico', { action: 'fatto', id: lamp.id });
  fai('Mamma', { action: 'rispondi', id: db.lavori[3].id, tipo: 'accetta' });
  return db;
}

/* ---------- Chiamate in fila (una alla volta) ---------- */
let coda = Promise.resolve();
function inFila(fn) {
  const p = coda.then(fn, fn);
  coda = p.catch(() => {});
  return p;
}
function occupato(delta) {
  st.inCorso += delta;
  $('#btnSync').classList.toggle('spin', st.inCorso > 0);
  document.querySelectorAll('#sheet button[data-a], #sheet button[type=submit]').forEach(b => { b.disabled = st.inCorso > 0; });
}

function carica(silenzioso) {
  return inFila(async () => {
    occupato(1);
    try {
      usaDati(await backend().chiama({ action: 'list' }));
      return true;
    } catch (e) {
      if (!silenzioso) toast(e.message, true);
      const c = cfg.url && S.get('cache', null);
      if (c && !st.ultimoCaricamento) { usaDati(c, true); }
      return false;
    } finally { occupato(-1); }
  });
}

function azione(p, msgOk) {
  return inFila(async () => {
    occupato(1);
    try {
      usaDati(await backend().chiama(Object.assign({}, p, { chi: cfg.me })));
      if (msgOk) toast(msgOk);
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    } finally { occupato(-1); }
  });
}

function usaDati(d, daCache) {
  st.lavori = (d.lavori || []).map(normalizza);
  st.persone = d.persone || [];
  st.storico = d.storico || [];
  if (!daCache) {
    st.ultimoCaricamento = Date.now();
    if (cfg.url) S.set('cache', { lavori: st.lavori, persone: st.persone, storico: st.storico });
  }
  render();
  aggiornaBadge();
  avvisaNovita();
  if (d.avviso) toast(d.avviso, true);
}

/* ---------- Disegno della pagina ---------- */
function render() {
  const me = cfg.me;
  $('#hello').textContent = me ? `Ciao ${me} 👋` : 'Ciao 👋';
  const btnMe = $('#btnMe');
  btnMe.textContent = me ? me.charAt(0).toUpperCase() : '?';
  btnMe.style.background = me ? persona(me).colore : '';
  btnMe.style.color = me ? '#0b0d12' : '';

  const banner = $('#banner');
  if (!cfg.url) {
    banner.innerHTML = 'Modalità prova: i dati restano solo su questo telefono. <button data-go="impostazioni">Collega il foglio</button>';
    banner.classList.remove('hidden');
  } else banner.classList.add('hidden');

  const g = gruppi();
  $('#cards').innerHTML = CARDS.map(c => {
    const n = g[c.k].length;
    return `<button class="card ${c.hot && n ? 'hot' : ''} ${st.filtro === c.k ? 'on' : ''}" data-filtro="${c.k}">
      <span class="ico">${c.ico}</span><span class="num">${n}</span><span class="lab">${c.lab}</span></button>`;
  }).join('');

  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === st.view));
  if (st.view === 'cal') renderCalendario(); else renderLista();
}

function nomiCorti(nomi) {
  if (nomi.length <= 2) return nomi.join(' e ');
  return nomi[0] + ' +' + (nomi.length - 1);
}
function riga(j, conData = true) {
  const s = STATI[j.stato] || STATI.attesa;
  const tocca = toccaAMe(j);
  const quando = conData ? dataBreve(j.data) + (j.ora ? ' · ' + j.ora : '') : (j.ora || 'In giornata');
  return `<button class="job ${s.cls} ${j.stato === 'fatto' ? 'done' : ''}" data-id="${esc(j.id)}">
    <span class="bar"></span>
    <span class="job-main">
      <span class="job-t">${esc(j.titolo)}</span>
      <span class="job-m">${esc(quando)} · <span class="avs">${j.assegnati.slice(0, 3).map(n => avatar(n, 'sm')).join('')}</span> ${esc(nomiCorti(j.assegnati))}</span>
      ${tocca ? `<span class="tocca">${esc(tocca)}</span>` : ''}
    </span>
    <span class="pill ${s.cls}">${s.icon} ${s.label}</span>
  </button>`;
}

function renderCalendario() {
  if (!st.mese) { const d = new Date(); st.mese = new Date(d.getFullYear(), d.getMonth(), 1); }
  if (!st.giorno) st.giorno = oggi();
  const m = st.mese, t = oggi();
  const primo = new Date(m.getFullYear(), m.getMonth(), 1);
  const offset = (primo.getDay() + 6) % 7;
  const giorniMese = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const celle = Math.ceil((offset + giorniMese) / 7) * 7;
  const inizio = new Date(primo); inizio.setDate(1 - offset);

  const perGiorno = {};
  st.lavori.slice().sort(ordina).forEach(j => { (perGiorno[j.data] = perGiorno[j.data] || []).push(j); });

  let html = `<div class="cal" id="cal">
    <div class="cal-head">
      <button class="cal-nav" data-mese="-1" aria-label="Mese prima">‹</button>
      <div class="cal-title">${m.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
      <button class="chip-btn" data-oggi>Oggi</button>
      <button class="cal-nav" data-mese="1" aria-label="Mese dopo">›</button>
    </div>
    <div class="cal-grid">${GIORNI_SETT.map(g => `<div class="cal-wd">${g}</div>`).join('')}`;

  for (let i = 0; i < celle; i++) {
    const d = new Date(inizio); d.setDate(inizio.getDate() + i);
    const k = ymd(d);
    const lav = perGiorno[k] || [];
    const evs = lav.slice(0, 3).map(j => `<i class="ev ${(STATI[j.stato] || STATI.attesa).cls} ${j.stato === 'fatto' ? 'done' : ''}"><span class="ev-t">${esc(j.titolo)}</span></i>`).join('')
      + (lav.length > 3 ? `<span class="more">+${lav.length - 3}</span>` : '');
    html += `<button class="cell ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${k === t ? 'today' : ''} ${k === st.giorno ? 'sel' : ''}" data-giorno="${k}">
      <span class="n">${d.getDate()}</span><span class="evs">${evs}</span></button>`;
  }
  html += `</div></div>`;

  const delGiorno = perGiorno[st.giorno] || [];
  html += `<section class="agenda"><h3>${esc(dataLunga(st.giorno))}${st.giorno === t ? ' <span class="tag">oggi</span>' : ''}</h3>
    ${delGiorno.length ? delGiorno.map(j => riga(j, false)).join('') : '<div class="empty">Nessun lavoro in questo giorno</div>'}
    <button class="add-day" data-nuovo="${st.giorno}">+ Aggiungi un lavoro per questo giorno</button></section>`;

  $('#main').innerHTML = html;
}

function renderLista() {
  const g = gruppi();
  const t = oggi();
  let L;
  let barra = '';
  if (st.filtro) {
    L = g[st.filtro].slice();
    const c = CARDS.find(x => x.k === st.filtro);
    barra = `<div class="filter-bar"><span class="filter-chip">${c.ico} ${c.lab}<button data-filtro-via aria-label="Togli filtro">×</button></span></div>`;
  } else {
    L = st.lavori.filter(j => st.mostraFatti || j.stato !== 'fatto');
    barra = `<div class="filter-bar"><label class="toggle"><input type="checkbox" id="chkFatti" ${st.mostraFatti ? 'checked' : ''}> Mostra anche i lavori fatti</label></div>`;
  }
  L.sort(ordina);

  let html = barra;
  if (!L.length) {
    html += `<div class="empty">${st.filtro ? 'Niente qui, tutto a posto 👌' : 'Nessun lavoro. Tocca + per aggiungerne uno.'}</div>`;
  } else {
    let ultimo = null;
    L.forEach(j => {
      if (j.data !== ultimo) {
        ultimo = j.data;
        const etichetta = j.data === t ? 'oggi' : j.data < t ? 'passato' : '';
        html += `<div class="group-h">${esc(dataLunga(j.data))}${etichetta ? ` <span class="tag">${etichetta}</span>` : ''}</div>`;
      }
      html += riga(j, false);
    });
  }
  $('#main').innerHTML = html;
}

/* ---------- Pannello dal basso ---------- */
function apriPannello(html) {
  const bg = $('#sheetBg');
  const giaAperto = !bg.classList.contains('hidden');
  $('#sheet').onclick = null;
  $('#sheet').innerHTML = html;
  $('#sheet').scrollTop = 0;
  bg.classList.remove('hidden');
  document.body.classList.add('noscroll');
  if (!giaAperto) history.pushState({ pannello: 1 }, '');
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

const testata = titolo => `<div class="sheet-h"><h2>${titolo}</h2><button class="x" data-close aria-label="Chiudi">×</button></div>`;
const btn = (a, testo, cls = '') => `<button class="btn ${cls}" data-a="${a}">${testo}</button>`;

/* ---------- Dettaglio di un lavoro ---------- */
const STATI_PERSONA = {
  attesa: { label: 'Deve rispondere', icon: '⏳', cls: 's-attesa' },
  accettato: { label: 'Va bene', icon: '✅', cls: 's-accettato' },
  rifiutato: { label: 'Non può', icon: '❌', cls: 's-rifiutato' },
  proposta: { label: 'Propone', icon: '🔄', cls: 's-proposta' }
};

function dettagliProposta(j, r) {
  const parti = [];
  if (r.propData) parti.push(`<div><b>Nuovo giorno:</b> ${esc(dataLunga(r.propData))}${r.propOra ? ' alle ' + esc(r.propOra) : ''}</div>`);
  if (r.propTitolo) {
    if (r.propTitolo !== j.titolo) parti.push(`<div><b>Nuovo titolo:</b> ${esc(r.propTitolo)}</div>`);
    if (r.propDescrizione !== j.descrizione) parti.push(`<div><b>Nuovi dettagli:</b><div class="pre">${r.propDescrizione ? esc(r.propDescrizione) : '<i>(nessuno)</i>'}</div></div>`);
  }
  return parti.join('');
}

function apriDettaglio(id) {
  const j = st.lavori.find(x => x.id === id);
  if (!j) { chiudiPannello(); return; }
  st.aperto = id;
  const me = cfg.me, s = STATI[j.stato] || STATI.attesa;
  const sonoCre = j.creatore === me;
  const mia = miaRisposta(j);
  const sonoAss = !!mia;
  const chiuso = j.stato === 'fatto';

  // una riga per ogni persona del lavoro, con la sua risposta
  const persone = j.assegnati.map(n => {
    const r = j.risposte[n] || { stato: 'attesa' };
    const sp = n === j.creatore ? { label: 'Ha creato il lavoro', icon: '✍️', cls: 's-accettato' } : (STATI_PERSONA[r.stato] || STATI_PERSONA.attesa);
    let extra = '';
    if (r.stato === 'proposta') extra += `<div class="p-extra">${dettagliProposta(j, r)}</div>`;
    if (r.nota) extra += `<div class="p-extra nota">“${esc(r.nota)}”</div>`;
    if (sonoCre && r.stato === 'proposta' && !chiuso) {
      extra += `<div class="mini-actions">
        <button class="btn ok sm" data-a="approva" data-p="${esc(n)}">👍 Va bene</button>
        <button class="btn no sm" data-a="respingi" data-p="${esc(n)}">↩️ Non va bene</button></div>`;
    }
    return `<div class="p-row-wrap"><div class="p-row">${avatar(n, 'xs')}<b>${esc(n)}${n === me ? ' <span class="muted">(io)</span>' : ''}</b>
      <span class="pill ${sp.cls}">${sp.icon} ${sp.label}</span></div>${extra}</div>`;
  }).join('');

  const az = [];
  if (sonoAss && !sonoCre && !chiuso) {
    if (mia.stato === 'attesa') { az.push(btn('accetta', '✅ Va bene', 'ok')); az.push(btn('rifiuta', '❌ Non posso', 'no')); }
    if (mia.stato === 'accettato') az.push(btn('rifiuta', '❌ Non posso più', 'no full'));
    if (mia.stato === 'rifiutato') az.push(btn('accetta', '✅ Adesso posso', 'ok full'));
    if (mia.stato === 'proposta') az.push(`<div class="info-line">Aspetti la risposta di ${esc(j.creatore)} alla tua proposta</div>`);
    az.push(btn('data', '📅 Altro giorno'));
    az.push(btn('modifica', '✏️ Proponi modifica'));
  }
  if ((sonoCre || sonoAss) && j.stato === 'accettato') az.push(btn('fatto', '✔️ Segna come fatto', 'main full'));
  if ((sonoCre || sonoAss) && chiuso) az.push(btn('riapri', '↺ Riapri', 'full'));
  if (sonoCre) {
    const rifiutato = j.stato === 'rifiutato';
    az.push(btn('edita', rifiutato ? '✏️ Cambia e rimanda' : 'Modifica lavoro', rifiutato ? 'main' : 'ghost'));
    az.push(btn('elimina', 'Elimina', 'ghost danger'));
  }
  if (!sonoCre && !sonoAss) az.push(`<div class="info-line">Lavoro creato da ${esc(j.creatore)}: non è per te</div>`);

  const storia = st.storico.filter(h => h.id === j.id).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));

  apriPannello(`
    <div class="sheet-h"><span class="pill ${s.cls}">${s.icon} ${s.label}</span><button class="x" data-close aria-label="Chiudi">×</button></div>
    <div class="det-title">${esc(j.titolo)}</div>
    <div class="det-when">📅 ${esc(dataLunga(j.data))}${j.ora ? ` · ${esc(j.ora)} <span class="muted">(${esc(durataTesto(j.durata))})</span>` : ' <span class="muted">· in giornata</span>'}</div>
    <div class="people"><span class="p">${avatar(j.creatore, 'xs')} Creato da <b>${esc(j.creatore)}</b></span></div>
    ${j.descrizione ? `<div class="box"><div class="box-t">Dettagli</div><div class="pre">${esc(j.descrizione)}</div></div>` : ''}
    <div class="box" id="persone"><div class="box-t">${j.assegnati.length > 1 ? `Chi lo fa (${j.assegnati.length})` : 'Chi lo fa'}</div>${persone}</div>
    ${j.nota ? `<div class="box"><div class="box-t">💬 Nota di ${esc(j.creatore)}</div><div class="pre">${esc(j.nota)}</div></div>` : ''}
    <div class="actions" id="azioni">${az.join('')}</div>
    ${storia.length ? `<div class="storia"><div class="box-t">Cronologia</div>${storia.map(h => `
      <div class="st-r">${avatar(h.chi, 'xs')}<div><b>${esc(h.chi)}</b> ${esc(h.azione)}${h.dettaglio ? ` <span class="muted">— ${esc(h.dettaglio)}</span>` : ''}
      <div class="muted small">${esc(quandoStorico(h.quando))}</div></div></div>`).join('')}</div>` : ''}
  `);

  $('#sheet').onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a, persona = b.dataset.p;
    if (a === 'accetta') { if (await azione({ action: 'rispondi', id: j.id, tipo: 'accetta' }, 'Accettato 👍')) chiudiPannello(); }
    else if (a === 'rifiuta') formNota('Non posso', 'Vuoi dire perché? (facoltativo)', 'Invia', nota => azione({ action: 'rispondi', id: j.id, tipo: 'rifiuta', nota }, 'Risposta inviata'));
    else if (a === 'data') formAltroGiorno(j);
    else if (a === 'modifica') formProponiModifica(j);
    else if (a === 'approva') {
      const cambia = j.assegnati.filter(n => n !== persona && n !== j.creatore && j.risposte[n].stato !== 'proposta').length;
      if (cambia && !confirm(`Accettando la proposta di ${persona}, gli altri dovranno riconfermare il lavoro. Va bene?`)) return;
      if (await azione({ action: 'decidi', id: j.id, persona, approva: true }, 'Proposta accettata 👍')) apriDettaglio(j.id);
    }
    else if (a === 'respingi') formNota(`Non va bene (${persona})`, 'Scrivi cosa non va (facoltativo)', 'Invia', nota => azione({ action: 'decidi', id: j.id, persona, approva: false, nota }, 'Risposta inviata'));
    else if (a === 'fatto') { if (await azione({ action: 'fatto', id: j.id }, 'Fatto! 🎉')) chiudiPannello(); }
    else if (a === 'riapri') { if (await azione({ action: 'riapri', id: j.id }, 'Lavoro riaperto')) apriDettaglio(j.id); }
    else if (a === 'edita') formLavoro(j);
    else if (a === 'elimina') {
      if (confirm(`Eliminare "${j.titolo}"? Sparisce anche dal calendario.`)) {
        if (await azione({ action: 'elimina', id: j.id }, 'Lavoro eliminato')) chiudiPannello();
      }
    }
  };
}

/* ---------- Moduli ---------- */
function sceltaPersone(nome, scelti, multipla) {
  if (!st.persone.length) return '<div class="muted small">Nessuna persona: aggiungile nel foglio (scheda Persone).</div>';
  const lista = [].concat(scelti || []);
  return `<div class="chips">${st.persone.map(p => `
    <label><input type="${multipla ? 'checkbox' : 'radio'}" name="${nome}" value="${esc(p.nome)}" ${lista.includes(p.nome) ? 'checked' : ''}>
    <span class="chip">${avatar(p.nome, 'xs')} ${esc(p.nome)}${p.nome === cfg.me ? ' (io)' : ''}</span></label>`).join('')}
    ${multipla && st.persone.length > 2 ? '<button type="button" class="chip-btn" id="tutti">Tutti</button>' : ''}</div>`;
}

function elencoNomi(nomi) {
  return nomi.length <= 1 ? (nomi[0] || '') : nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];
}

function formLavoro(j, giorno) {
  const nuovo = !j;
  const primo = (st.persone.find(p => p.nome !== cfg.me) || {}).nome || cfg.me;
  const v = j || { titolo: '', descrizione: '', data: giorno || oggi(), ora: '', durata: 60, assegnati: primo ? [primo] : [] };
  apriPannello(`${testata(nuovo ? 'Nuovo lavoro' : 'Modifica lavoro')}
    <form id="f" autocomplete="off">
      <label>Cosa c'è da fare<input name="titolo" required maxlength="120" placeholder="Es. Tagliare l'erba" value="${esc(v.titolo)}"></label>
      <label><span>Dettagli <span class="muted small">(facoltativi)</span></span><textarea name="descrizione" rows="3" placeholder="Cosa serve, dove, come…">${esc(v.descrizione)}</textarea></label>
      <div class="row2">
        <label>Giorno<input type="date" name="data" required value="${esc(v.data)}"></label>
        <label><span>Ora <span class="muted small">(facoltativa)</span></span><input type="time" name="ora" value="${esc(v.ora)}"></label>
      </div>
      <label id="rigaDurata">Quanto dura<select name="durata">${DURATE.map(d => `<option value="${d[0]}" ${Number(v.durata) === d[0] ? 'selected' : ''}>${d[1]}</option>`).join('')}</select></label>
      <div class="lbl"><span>Per chi <span class="muted small">(puoi sceglierne più di uno)</span></span></div>
      ${sceltaPersone('assegnati', v.assegnati, true)}
      ${!nuovo ? '<div class="muted small">Salvando, tutti devono rispondere di nuovo e ricevono un avviso.</div>' : ''}
      <div class="err" id="err"></div>
      <button class="btn main big" type="submit">${nuovo ? 'Salva e avvisa' : 'Salva modifiche'}</button>
    </form>`);
  const f = $('#f');
  const durata = () => $('#rigaDurata').classList.toggle('hidden', !f.ora.value);
  f.ora.addEventListener('input', durata); durata();
  const tutti = $('#tutti');
  if (tutti) tutti.onclick = () => {
    const box = [...f.querySelectorAll('input[name=assegnati]')];
    const accendi = box.some(b => !b.checked);
    box.forEach(b => { b.checked = accendi; });
  };
  if (nuovo) setTimeout(() => f.titolo.focus(), 250);
  f.onsubmit = async e => {
    e.preventDefault();
    const scelti = [...f.querySelectorAll('input[name=assegnati]:checked')].map(x => x.value);
    if (!scelti.length) { $('#err').textContent = 'Scegli almeno una persona'; return; }
    const dati = { titolo: f.titolo.value, descrizione: f.descrizione.value, data: f.data.value, ora: f.ora.value, durata: f.durata.value, assegnati: scelti };
    const altriScelti = scelti.filter(n => n !== cfg.me);
    const ok = await azione(nuovo ? Object.assign({ action: 'crea' }, dati) : Object.assign({ action: 'modifica', id: j.id }, dati),
      nuovo ? (altriScelti.length ? `Inviato a ${elencoNomi(altriScelti)} 📨` : 'Lavoro salvato') : 'Modifiche salvate');
    if (ok) {
      st.giorno = dati.data;
      const d = daYmd(dati.data); st.mese = new Date(d.getFullYear(), d.getMonth(), 1);
      chiudiPannello();
      render();
    }
  };
}

function formAltroGiorno(j) {
  apriPannello(`${testata('Proponi un altro giorno')}
    <div class="muted">${esc(j.titolo)} — ora è ${esc(dataLunga(j.data))}${j.ora ? ' alle ' + esc(j.ora) : ''}</div>
    <form id="f">
      <div class="row2">
        <label>Nuovo giorno<input type="date" name="data" required min="${oggi()}" value="${esc(j.data)}"></label>
        <label><span>Ora <span class="muted small">(facoltativa)</span></span><input type="time" name="ora" value="${esc(j.ora)}"></label>
      </div>
      <label><span>Messaggio <span class="muted small">(facoltativo)</span></span><textarea name="nota" rows="2" placeholder="Es. Sabato mattina sono libero"></textarea></label>
      <div class="err" id="err"></div>
      <button class="btn main big" type="submit">Invia proposta</button>
    </form>`);
  const f = $('#f');
  f.onsubmit = async e => {
    e.preventDefault();
    if (f.data.value === j.data && f.ora.value === (j.ora || '')) { $('#err').textContent = 'Scegli un giorno o un\'ora diversi'; return; }
    if (await azione({ action: 'rispondi', id: j.id, tipo: 'data', propData: f.data.value, propOra: f.ora.value, nota: f.nota.value }, `Proposta inviata a ${j.creatore}`)) apriDettaglio(j.id);
  };
}

function formProponiModifica(j) {
  apriPannello(`${testata('Proponi una modifica')}
    <div class="muted small">Cambia quello che vuoi: ${esc(j.creatore)} vedrà la proposta e potrà accettarla.</div>
    <form id="f">
      <label>Cosa c'è da fare<input name="titolo" required maxlength="120" value="${esc(j.titolo)}"></label>
      <label>Dettagli<textarea name="descrizione" rows="4">${esc(j.descrizione)}</textarea></label>
      <label><span>Messaggio <span class="muted small">(facoltativo)</span></span><textarea name="nota" rows="2" placeholder="Es. Serve anche il decespugliatore"></textarea></label>
      <div class="err" id="err"></div>
      <button class="btn main big" type="submit">Invia proposta</button>
    </form>`);
  const f = $('#f');
  f.onsubmit = async e => {
    e.preventDefault();
    if (await azione({ action: 'rispondi', id: j.id, tipo: 'modifica', propTitolo: f.titolo.value, propDescrizione: f.descrizione.value, nota: f.nota.value }, `Proposta inviata a ${j.creatore}`)) apriDettaglio(j.id);
  };
}

function formNota(titolo, etichetta, testoBtn, invia) {
  const id = st.aperto;
  apriPannello(`${testata(titolo)}
    <form id="f"><label>${esc(etichetta)}<textarea name="nota" rows="3"></textarea></label>
    <button class="btn main big" type="submit">${testoBtn}</button></form>`);
  const f = $('#f');
  setTimeout(() => f.nota.focus(), 250);
  f.onsubmit = async e => {
    e.preventDefault();
    if (await invia(f.nota.value)) apriDettaglio(id);
  };
}

/* ---------- Impostazioni ---------- */
function apriImpostazioni(messaggio) {
  const prova = !cfg.url;
  apriPannello(`${testata('Impostazioni')}
    ${messaggio ? `<div class="box"><div>${esc(messaggio)}</div></div>` : ''}
    <form id="f" autocomplete="off">
      <div class="lbl">Chi sei?</div>
      <div id="sceltaMe">${sceltaPersone('me', cfg.me)}</div>
      ${prova ? `<label><span>Persone della famiglia <span class="muted small">(separate da virgola, solo modalità prova)</span></span>
        <input name="persone" value="${esc(S.get('personeProva', PERSONE_PROVA).join(', '))}"></label>` : ''}
      <div class="box">
        <div class="box-t">Collegamento al foglio Google</div>
        <label>Link dello script (App web)<input name="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cfg.url)}"></label>
        <label>PIN di famiglia<input name="pin" type="password" inputmode="numeric" value="${esc(cfg.pin)}"></label>
        <div class="muted small">Senza link l'app resta in modalità prova e i dati non lasciano questo telefono.</div>
        <div class="err" id="err"></div>
      </div>
      <button class="btn main big" type="submit">Salva</button>
      ${cfg.url ? '<button class="btn" type="button" id="btnInvito">🔗 Copia il link per la famiglia</button>' : ''}
      ${prova ? '<button class="btn ghost" type="button" id="btnReset">Ricomincia con i dati di prova</button>' : ''}
      <div class="muted small center">Lavori di casa · versione ${VERSIONE}</div>
    </form>`);

  const f = $('#f');
  if (prova) {
    f.persone.addEventListener('change', () => {
      const nomi = f.persone.value.split(',').map(x => x.trim()).filter(Boolean);
      S.set('personeProva', nomi.length ? nomi : PERSONE_PROVA);
      st.persone = Prova.pacchetto(Prova.leggi()).persone;
      const scelto = (f.querySelector('input[name=me]:checked') || {}).value;
      $('#sceltaMe').innerHTML = sceltaPersone('me', scelto);
    });
    $('#btnReset').onclick = () => {
      if (!confirm('Cancellare i dati di prova e ricominciare?')) return;
      S.set('dbProva', null);
      carica();
      chiudiPannello();
    };
  }
  const inv = $('#btnInvito');
  if (inv) inv.onclick = async () => {
    const link = location.origin + location.pathname + '#collega=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ u: cfg.url, p: cfg.pin })))));
    try { await navigator.clipboard.writeText(link); toast('Link copiato: mandalo solo nel gruppo di famiglia'); }
    catch (e) { prompt('Copia questo link e mandalo alla famiglia:', link); }
  };

  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('#err');
    err.textContent = '';
    const url = f.url.value.trim();
    const pin = f.pin.value.trim();
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { err.textContent = 'Il link deve iniziare con https://script.google.com/'; return; }
    let datiNuovi = null;
    if (url && (url !== cfg.url || pin !== cfg.pin)) {
      try { datiNuovi = await Foglio.chiama({ action: 'list' }, url, pin); }
      catch (ex) { err.textContent = ex.message; return; }
    }
    cfg.url = url; cfg.pin = pin;
    S.set('url', url); S.set('pin', pin);
    if (datiNuovi) { usaDati(datiNuovi); }
    else if (!url) { await carica(); }
    const scelto = (f.querySelector('input[name=me]:checked') || {}).value || '';
    if (scelto) { cfg.me = scelto; S.set('me', scelto); }
    if (!cfg.me || !st.persone.some(p => p.nome === cfg.me)) {
      apriImpostazioni(datiNuovi ? 'Collegato al foglio ✅ Ora scegli chi sei.' : 'Scegli chi sei per continuare.');
      return;
    }
    chiudiPannello();
    render();
    toast(datiNuovi ? 'Collegato al foglio ✅' : 'Salvato');
  };
}

/* Link d'invito: #collega=... imposta link dello script e PIN in automatico */
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

/* ---------- Avvisi ---------- */
let timerToast;
function toast(msg, male) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (male ? ' bad' : '');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.add('hidden'), male ? 4500 : 2600);
}

function aggiornaBadge() {
  const g = gruppi();
  const n = g.rispondere.length + g.valutare.length;
  document.title = (n ? `(${n}) ` : '') + 'Lavori di casa';
  try {
    if ('setAppBadge' in navigator) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); }
  } catch (e) { /* non supportato */ }
}

function avvisaNovita() {
  if (!cfg.me) return;
  const g = gruppi();
  const ora = [...g.rispondere, ...g.valutare].map(j => j.id + j.aggiornato);
  const visti = S.get('visti.' + cfg.me, null);
  S.set('visti.' + cfg.me, ora);
  if (!visti) return;
  const nuovi = ora.filter(x => !visti.includes(x)).length;
  if (nuovi) toast(nuovi === 1 ? '🔔 C\'è una novità che ti riguarda' : `🔔 Ci sono ${nuovi} novità che ti riguardano`);
}

/* ---------- Tocchi e clic ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-close]')) { chiudiPannello(); return; }
  if (t.id === 'sheetBg') { chiudiPannello(); return; }
  const go = t.closest('[data-go]');
  if (go) { apriImpostazioni(); return; }
  const job = t.closest('.job[data-id]');
  if (job) { apriDettaglio(job.dataset.id); return; }
  const card = t.closest('[data-filtro]');
  if (card) {
    st.filtro = st.filtro === card.dataset.filtro ? null : card.dataset.filtro;
    st.view = 'list'; S.set('view', 'list');
    render(); return;
  }
  if (t.closest('[data-filtro-via]')) { st.filtro = null; render(); return; }
  const tab = t.closest('#tabs button');
  if (tab) { st.view = tab.dataset.view; st.filtro = null; S.set('view', st.view); render(); return; }
  const cell = t.closest('.cell[data-giorno]');
  if (cell) {
    st.giorno = cell.dataset.giorno;
    const d = daYmd(st.giorno);
    if (d.getMonth() !== st.mese.getMonth()) st.mese = new Date(d.getFullYear(), d.getMonth(), 1);
    render(); return;
  }
  const nav = t.closest('[data-mese]');
  if (nav) { cambiaMese(Number(nav.dataset.mese)); return; }
  if (t.closest('[data-oggi]')) {
    const d = new Date(); st.mese = new Date(d.getFullYear(), d.getMonth(), 1); st.giorno = oggi(); render(); return;
  }
  const add = t.closest('[data-nuovo]');
  if (add) { formLavoro(null, add.dataset.nuovo); return; }
});
document.addEventListener('change', e => {
  if (e.target.id === 'chkFatti') { st.mostraFatti = e.target.checked; render(); }
});

function cambiaMese(n) {
  st.mese = new Date(st.mese.getFullYear(), st.mese.getMonth() + n, 1);
  render();
}

// scorrimento a destra/sinistra sul calendario per cambiare mese
let tocco = null;
document.addEventListener('touchstart', e => {
  if (!e.target.closest('#cal')) { tocco = null; return; }
  tocco = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!tocco) return;
  const dx = e.changedTouches[0].clientX - tocco.x, dy = e.changedTouches[0].clientY - tocco.y;
  tocco = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cambiaMese(dx < 0 ? 1 : -1);
}, { passive: true });

$('#fab').onclick = () => formLavoro(null, st.view === 'cal' && st.giorno ? st.giorno : oggi());
$('#btnSync').onclick = () => carica();
$('#btnMe').onclick = () => apriImpostazioni();

// quando riapri l'app, aggiorna da solo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - st.ultimoCaricamento > 30000) carica(true);
});
setInterval(() => {
  if (document.visibilityState === 'visible' && $('#sheetBg').classList.contains('hidden') && Date.now() - st.ultimoCaricamento > 120000) carica(true);
}, 30000);

/* ---------- Avvio ---------- */
(async function avvio() {
  const invito = leggiInvito();
  if (cfg.url) {
    const c = S.get('cache', null);
    if (c) usaDati(c, true); else render();
  } else render();
  await carica(!!cfg.url && !invito);
  if (!cfg.me || !st.persone.some(p => p.nome === cfg.me)) {
    apriImpostazioni(invito ? 'Benvenuto! Scegli chi sei per iniziare.' : 'Per iniziare dimmi chi sei.');
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
