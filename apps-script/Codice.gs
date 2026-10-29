/* Lavori di casa — Codice.gs v2.2 (regole + server). Incolla TUTTO questo nell'editor Apps Script. */

/*
 * Lavori di casa v2 — le regole.
 * Questo file gira sia nell'app (modalità prova) sia nell'Apps Script del foglio.
 *
 * Lavoro:   per una o più persone, in un giorno, "in giornata", "mattina", "pomeriggio" o a un'ora precisa.
 * Risposte: ognuno (tranne chi l'ha creato) risponde  ok / no / altro (propone un altro giorno).
 * Giorni liberi: ognuno ha una settimana tipo (lun..dom) e può cambiare singoli giorni (eccezioni).
 *   valori: 'tutto' | 'mattina' | 'pomeriggio' | 'no' | '' (non detto)
 * Progetti (wishlist): lavori per la casa senza data, comuni a tutta la famiglia, con note, foto,
 *   documenti (scontrini…) e articoli comprati. Un lavoro può essere "programmato" da un progetto (progettoId).
 */

var FASCE = ['tutto', 'mattina', 'pomeriggio', 'no'];
var QUANDO = ['giornata', 'mattina', 'pomeriggio', 'ora'];
var ORE_FASCIA = { mattina: '09:00', pomeriggio: '15:00' };

function nuovoId() {
  return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function _t(v) { return String(v == null ? '' : v).trim(); }
function _nomi(v) {
  var lista = Array.isArray(v) ? v : _t(v).split(',');
  var out = [];
  lista.forEach(function (n) { n = _t(n); if (n && out.indexOf(n) < 0) out.push(n); });
  return out;
}
function _risposta(r) { return { r: r || 'attesa', data: '', ora: '', nota: '' }; }

/* ---------- Stato del lavoro ---------- */
function statoLavoro(j) {
  if (j.fatto) return 'fatto';
  var altri = j.assegnati.filter(function (n) { return n !== j.creatore; });
  if (!altri.length) return 'ok';
  var s = altri.map(function (n) { return (j.risposte[n] || {}).r || 'attesa'; });
  if (s.indexOf('altro') >= 0) return 'altro';
  if (s.indexOf('attesa') >= 0) return 'attesa';
  if (s.every(function (x) { return x === 'no'; })) return 'no';
  return 'ok';
}

/* Mette un lavoro nella forma giusta (dal foglio arrivano tutte stringhe) */
function normalizza(j) {
  j.assegnati = _nomi(j.assegnati);
  if (typeof j.risposte === 'string') { try { j.risposte = JSON.parse(j.risposte || '{}'); } catch (e) { j.risposte = {}; } }
  if (!j.risposte || typeof j.risposte !== 'object') j.risposte = {};
  j.assegnati.forEach(function (n) { if (!j.risposte[n]) j.risposte[n] = _risposta(n === j.creatore ? 'ok' : 'attesa'); });
  Object.keys(j.risposte).forEach(function (n) { if (j.assegnati.indexOf(n) < 0) delete j.risposte[n]; });
  j.fatto = j.fatto === true || j.fatto === 'true' || j.fatto === 'SÌ' || j.stato === 'fatto';
  if (QUANDO.indexOf(j.quando) < 0) j.quando = _t(j.ora) ? 'ora' : 'giornata';
  if (j.quando !== 'ora') j.ora = '';
  j.durata = Number(j.durata) > 0 ? Math.round(Number(j.durata)) : 60;
  j.emoji = _t(j.emoji) || '📋';
  j.progettoId = _t(j.progettoId);
  j.stato = statoLavoro(j);
  return j;
}

/* ---------- Progetti ---------- */
function _lista(v) {
  if (typeof v === 'string') { try { v = JSON.parse(v || '[]'); } catch (e) { v = []; } }
  return Array.isArray(v) ? v : [];
}
function _euro(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(/[€\s]/g, '').replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function totaleProgetto(p) {
  return Math.round(p.articoli.reduce(function (t, a) { return t + _euro(a.prezzo) * (Number(a.qta) || 1); }, 0) * 100) / 100;
}
function normalizzaProgetto(p) {
  p.emoji = _t(p.emoji) || '💡';
  p.titolo = _t(p.titolo);
  p.descrizione = _t(p.descrizione);
  p.stato = p.stato === 'fatto' ? 'fatto' : 'aperto';
  p.note = _lista(p.note);
  p.articoli = _lista(p.articoli);
  p.allegati = _lista(p.allegati);
  p.cartella = _t(p.cartella);
  p.totale = totaleProgetto(p);
  return p;
}

/**
 * Azioni sui progetti. Restituisce { progetto, eliminato, cestina: [id file da buttare] }
 * Tutti possono aggiungere note, foto, documenti e articoli; modifica ed eliminazione del progetto
 * solo a chi l'ha creato e all'amministratore; ognuno può togliere le cose che ha aggiunto.
 */
function applicaProgetto(db, p, adesso, chi, capo) {
  db.progetti = db.progetti || [];
  var pr = null, cestina = [];
  function trova() {
    for (var i = 0; i < db.progetti.length; i++) if (db.progetti[i].id === p.progettoId) return normalizzaProgetto(db.progetti[i]);
    throw new Error('Progetto non trovato: forse è stato eliminato 🔄');
  }
  function suo(x) { return x.chi === chi || pr.creatore === chi || capo; }
  function togli(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) {
      if (!suo(lista[i])) throw new Error('Può toglierlo solo chi l\'ha aggiunto');
      return lista.splice(i, 1)[0];
    }
    throw new Error('Non c\'è più 🔄');
  }
  function campiProgetto() {
    var c = { emoji: _t(p.emoji) || '💡', titolo: _t(p.titolo), descrizione: _t(p.descrizione) };
    if (!c.titolo) throw new Error('Scrivi che lavoro è ✍️');
    return c;
  }

  switch (p.action) {
    case 'progetto_crea':
      pr = campiProgetto();
      pr.id = 'P' + nuovoId().slice(1); pr.stato = 'aperto'; pr.creatore = chi;
      pr.note = []; pr.articoli = []; pr.allegati = []; pr.cartella = ''; pr.creato = adesso;
      db.progetti.push(pr);
      break;
    case 'progetto_modifica': {
      pr = trova();
      if (chi !== pr.creatore && !capo) throw new Error('Solo ' + pr.creatore + ' può cambiarlo');
      var c = campiProgetto();
      Object.keys(c).forEach(function (k) { pr[k] = c[k]; });
      break;
    }
    case 'progetto_stato':
      pr = trova();
      pr.stato = p.stato === 'fatto' ? 'fatto' : 'aperto';
      break;
    case 'progetto_elimina':
      pr = trova();
      if (chi !== pr.creatore && !capo) throw new Error('Solo ' + pr.creatore + ' può eliminarlo');
      db.progetti.splice(db.progetti.indexOf(pr), 1);
      pr.allegati.forEach(function (a) { if (a.fileId) cestina.push(a.fileId); });
      (db.lavori || []).forEach(function (l) { if (l.progettoId === pr.id) l.progettoId = ''; });
      return { progetto: pr, eliminato: true, cestina: cestina, lavoriToccati: true };
    case 'nota_aggiungi': {
      pr = trova();
      var testo = _t(p.testo);
      if (!testo) throw new Error('Scrivi la nota ✍️');
      pr.note.push({ id: nuovoId(), chi: chi, data: adesso, testo: testo });
      break;
    }
    case 'nota_elimina':
      pr = trova(); togli(pr.note, p.id);
      break;
    case 'articolo_aggiungi': {
      pr = trova();
      var nome = _t(p.nome);
      if (!nome) throw new Error('Scrivi cosa hai comprato 🛒');
      var qta = Number(String(p.qta || '1').replace(',', '.'));
      pr.articoli.push({ id: nuovoId(), chi: chi, data: adesso, nome: nome, qta: qta > 0 ? qta : 1,
        prezzo: _euro(p.prezzo), negozio: _t(p.negozio) });
      break;
    }
    case 'articolo_elimina':
      pr = trova(); togli(pr.articoli, p.id);
      break;
    case 'allegato_aggiungi': {
      pr = trova();
      var f = p.file || {};
      if (!f.url) throw new Error('File non caricato');
      pr.allegati.push({ id: nuovoId(), chi: chi, data: adesso, tipo: f.tipo === 'foto' ? 'foto' : 'doc',
        nome: _t(f.nome) || (f.tipo === 'foto' ? 'Foto' : 'Documento'), descrizione: _t(p.descrizione),
        url: f.url, anteprima: _t(f.anteprima), fileId: _t(f.fileId), mime: _t(f.mime) });
      if (f.cartella) pr.cartella = f.cartella;
      break;
    }
    case 'allegato_elimina': {
      pr = trova();
      var via = togli(pr.allegati, p.id);
      if (via.fileId) cestina.push(via.fileId);
      break;
    }
    default:
      throw new Error('Azione sconosciuta');
  }
  pr.aggiornato = adesso;
  normalizzaProgetto(pr);
  return { progetto: pr, eliminato: false, cestina: cestina };
}

/* ---------- Lista della spesa ---------- */
/* "latte, pane x2" o una lista → nomi puliti e senza doppioni (la virgola prima di una cifra, come in 1,5 kg, non divide) */
function _voci(v) {
  var a = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\n;]+|,(?!\d)/);
  var out = [];
  a.forEach(function (x) {
    x = _t(x).replace(/\s+/g, ' ').slice(0, 80);
    if (x && out.map(function (o) { return o.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) out.push(x);
  });
  return out;
}

/**
 * Azioni sulla spesa: la lista è di tutta la famiglia e tutti possono fare tutto (aggiungere, spuntare, togliere).
 * Se una cosa è già in lista non si duplica: se era già presa torna da comprare.
 */
function applicaSpesa(db, p, adesso, chi) {
  db.spesa = db.spesa || [];
  function trova() {
    for (var i = 0; i < db.spesa.length; i++) if (db.spesa[i].id === p.id) return db.spesa[i];
    return null;
  }
  switch (p.action) {
    case 'spesa_aggiungi': {
      var nomi = _voci(p.nomi);
      if (!nomi.length) throw new Error('Scrivi cosa serve 🧰');
      nomi.forEach(function (n) {
        var gia = db.spesa.filter(function (x) { return String(x.nome).toLowerCase() === n.toLowerCase(); })[0];
        if (gia) { gia.preso = false; gia.presoDa = ''; return; }
        db.spesa.push({ id: nuovoId(), nome: n, chi: chi, creato: adesso, preso: false, presoDa: '' });
      });
      break;
    }
    case 'spesa_preso': {
      var x = trova();
      if (x) { x.preso = !!p.preso; x.presoDa = x.preso ? chi : ''; }      // se non c'è più, qualcuno l'ha già tolto: va bene così
      break;
    }
    case 'spesa_elimina': {
      var y = trova();
      if (y) db.spesa.splice(db.spesa.indexOf(y), 1);
      break;
    }
    case 'spesa_svuota':
      db.spesa = db.spesa.filter(function (z) { return !z.preso; });
      break;
    default:
      throw new Error('Azione sconosciuta');
  }
  return { spesa: true };
}

/* ---------- Giorni liberi ---------- */
function giornoSett(data) {                    // 0 = lunedì … 6 = domenica
  var p = String(data).split('-').map(Number);
  return (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7;
}
function libero(db, nome, data) {
  var ecc = (db.eccezioni || {})[nome] || {};
  if (ecc[data]) return ecc[data];
  var sett = (db.settimane || {})[nome] || [];
  return sett[giornoSett(data)] || '';
}
/* fascia occupata dal lavoro: 'mattina', 'pomeriggio' o 'giornata' */
function fasciaLavoro(j) {
  if (j.quando === 'mattina' || j.quando === 'pomeriggio') return j.quando;
  if (j.quando === 'ora') return j.ora < '13:00' ? 'mattina' : 'pomeriggio';
  return 'giornata';
}
/* 'si' | 'parte' | 'no' | '' : quanto la persona è libera per quella fascia */
function liberaPer(valore, fascia) {
  if (!valore) return '';
  if (valore === 'no') return 'no';
  if (valore === 'tutto') return 'si';
  if (fascia === 'giornata') return 'parte';
  return valore === fascia ? 'si' : 'no';
}

/**
 * Applica un'azione. db = { lavori, settimane, eccezioni, admin }
 * Restituisce { lavoro, notifiche: [{a, tipo}], calendario: 'salva'|'elimina'|null }
 */
function applica(db, p, adesso) {
  adesso = adesso || new Date().toISOString();
  var chi = _t(p.chi);
  if (!chi) throw new Error('Scegli prima chi sei ⚙️');
  db.settimane = db.settimane || {};
  db.eccezioni = db.eccezioni || {};
  var capo = chi === db.admin;
  var notifiche = [], calendario = null, j = null;

  if (/^(progetto_|nota_|articolo_|allegato_)/.test(p.action || '')) {
    var rp = applicaProgetto(db, p, adesso, chi, capo);
    rp.lavoro = null; rp.notifiche = []; rp.calendario = null;
    return rp;
  }

  if (/^spesa_/.test(p.action || '')) {
    var rs = applicaSpesa(db, p, adesso, chi);
    rs.lavoro = null; rs.notifiche = []; rs.calendario = null;
    return rs;
  }

  function avvisa(a, tipo) { if (a && a !== chi) notifiche.push({ a: a, tipo: tipo }); }
  function trova() {
    for (var i = 0; i < db.lavori.length; i++) if (db.lavori[i].id === p.id) return normalizza(db.lavori[i]);
    throw new Error('Lavoro non trovato: forse è stato eliminato 🔄');
  }
  function puoGestire(l) {
    if (chi !== l.creatore && !capo) throw new Error('Solo ' + l.creatore + ' può cambiarlo');
  }
  function campi() {
    var q = QUANDO.indexOf(p.quando) >= 0 ? p.quando : (_t(p.ora) ? 'ora' : 'giornata');
    var c = {
      emoji: _t(p.emoji) || '📋', titolo: _t(p.titolo), descrizione: _t(p.descrizione),
      data: _t(p.data), quando: q, ora: q === 'ora' ? _t(p.ora) : '',
      durata: Number(p.durata) > 0 ? Math.round(Number(p.durata)) : 60, assegnati: _nomi(p.assegnati),
      progettoId: _t(p.progettoId)
    };
    if (!c.titolo) throw new Error('Scrivi cosa c\'è da fare ✍️');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data)) throw new Error('Scegli il giorno 📅');
    if (q === 'ora' && !/^\d{2}:\d{2}$/.test(c.ora)) throw new Error('Scegli l\'ora 🕐');
    if (!c.assegnati.length) throw new Error('Scegli almeno una persona 🙋');
    return c;
  }
  function daCapo(l, tranne) {               // il giorno è cambiato: gli altri devono riconfermare
    l.assegnati.forEach(function (n) {
      if (n === l.creatore || n === tranne) return;
      l.risposte[n] = _risposta('attesa');
      avvisa(n, 'spostato');
    });
  }

  switch (p.action) {
    case 'crea':
      j = campi();
      j.id = nuovoId(); j.creatore = chi; j.fatto = false; j.risposte = {};
      j.eventoId = ''; j.creato = adesso;
      j.assegnati.forEach(function (n) { j.risposte[n] = _risposta(n === chi ? 'ok' : 'attesa'); avvisa(n, 'nuovo'); });
      db.lavori.push(j);
      calendario = 'salva';
      break;

    case 'modifica': {
      j = trova(); puoGestire(j);
      var c = campi();
      var spostato = c.data !== j.data || c.quando !== j.quando || c.ora !== j.ora;
      var vecchi = j.assegnati;
      Object.keys(c).forEach(function (k) { j[k] = c[k]; });
      j.assegnati.forEach(function (n) {
        if (vecchi.indexOf(n) < 0) { j.risposte[n] = _risposta(n === j.creatore ? 'ok' : 'attesa'); avvisa(n, 'nuovo'); }
      });
      normalizza(j);
      if (spostato) daCapo(j);
      calendario = 'salva';
      break;
    }

    case 'rispondi': {
      j = trova();
      if (j.assegnati.indexOf(chi) < 0) throw new Error('Questo lavoro non è per te');
      if (j.fatto) throw new Error('È già fatto ✔️');
      var r = _risposta(p.tipo);
      r.nota = _t(p.nota);
      if (['ok', 'no', 'altro'].indexOf(p.tipo) < 0) throw new Error('Risposta non valida');
      if (p.tipo === 'altro') {
        r.data = _t(p.data);
        r.ora = _t(p.ora);
        if (!r.data) throw new Error('Scegli il giorno che ti va meglio 📅');
        if (r.data === j.data && !r.ora) throw new Error('È lo stesso giorno di adesso');
      }
      j.risposte[chi] = r;
      if (chi !== j.creatore) avvisa(j.creatore, 'risposta_' + p.tipo);
      calendario = 'salva';
      break;
    }

    case 'sposta': {                         // chi ha creato accetta l'altro giorno proposto
      j = trova(); puoGestire(j);
      var rp = j.risposte[_t(p.persona)];
      if (!rp || rp.r !== 'altro') throw new Error('Non c\'è nessuna proposta');
      j.data = rp.data;
      if (rp.ora) { j.quando = 'ora'; j.ora = rp.ora; }
      j.risposte[p.persona] = _risposta('ok');
      daCapo(j, p.persona);
      avvisa(p.persona, 'spostato');
      calendario = 'salva';
      break;
    }

    case 'fatto':
    case 'riapri':
      j = trova();
      if (j.assegnati.indexOf(chi) < 0 && chi !== j.creatore && !capo) throw new Error('Non è un tuo lavoro');
      j.fatto = p.action === 'fatto';
      if (j.fatto) avvisa(j.creatore, 'fatto');
      calendario = 'salva';
      break;

    case 'elimina':
      j = trova(); puoGestire(j);
      db.lavori.splice(db.lavori.indexOf(j), 1);
      j.assegnati.forEach(function (n) { avvisa(n, 'eliminato'); });
      calendario = 'elimina';
      break;

    case 'settimana': {                      // la propria settimana tipo
      var nome = _t(p.nome) || chi;
      if (nome !== chi && !capo) throw new Error('Puoi cambiare solo i tuoi giorni');
      var s = (Array.isArray(p.settimana) ? p.settimana : []).slice(0, 7);
      while (s.length < 7) s.push('');
      db.settimane[nome] = s.map(function (v) { return FASCE.indexOf(v) >= 0 ? v : ''; });
      return { lavoro: null, notifiche: [], calendario: null };
    }

    case 'eccezione': {                      // un giorno diverso dal solito
      var nm = _t(p.nome) || chi;
      if (nm !== chi && !capo) throw new Error('Puoi cambiare solo i tuoi giorni');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(_t(p.data))) throw new Error('Giorno non valido');
      db.eccezioni[nm] = db.eccezioni[nm] || {};
      if (FASCE.indexOf(p.valore) >= 0) db.eccezioni[nm][p.data] = p.valore;
      else delete db.eccezioni[nm][p.data];
      return { lavoro: null, notifiche: [], calendario: null };
    }

    default:
      throw new Error('Azione sconosciuta');
  }

  j.stato = statoLavoro(j);
  j.aggiornato = adesso;
  return { lavoro: j, notifiche: notifiche, calendario: calendario };
}


/* =====================================================================
 * Lavori di casa v2 — server sul foglio Google
 * Schede: Lavori, Progetti, Attrezzi, Persone, Giorni liberi, Eccezioni, Impostazioni
 * Foto e documenti dei progetti: su Google Drive, cartella "Lavori di casa - Progetti" (una sottocartella per progetto).
 * Il calendario Google riceve solo una COPIA dei lavori (non viene mai riletto: app veloce).
 * Il PIN e le email stanno SOLO nel foglio, non in questo codice.
 * ===================================================================== */

var F_LAVORI = 'Lavori', F_PROG = 'Progetti', F_SPESA = 'Attrezzi', F_PERSONE = 'Persone', F_SETT = 'Giorni liberi', F_ECC = 'Eccezioni', F_IMP = 'Impostazioni';

var CAMPI = ['id', 'emoji', 'titolo', 'descrizione', 'data', 'quando', 'ora', 'durata', 'assegnati', 'creatore',
  'stato', 'risposte', 'eventoId', 'creato', 'aggiornato', 'progettoId'];
var INTESTAZIONI = ['ID', 'Emoji', 'Titolo', 'Dettagli', 'Giorno', 'Quando', 'Ora', 'Durata (min)', 'Per chi', 'Creato da',
  'Stato', 'Risposte (non toccare)', 'ID evento (non toccare)', 'Creato il', 'Aggiornato il', 'Progetto (non toccare)'];
var CAMPI_P = ['id', 'emoji', 'titolo', 'descrizione', 'stato', 'creatore', 'totale', 'note', 'articoli', 'allegati', 'cartella', 'creato', 'aggiornato'];
var INTESTAZIONI_P = ['ID', 'Emoji', 'Lavoro', 'Dettagli', 'Stato', 'Creato da', 'Speso €', 'Note (non toccare)', 'Articoli (non toccare)',
  'Foto e documenti (non toccare)', 'Cartella Drive (non toccare)', 'Creato il', 'Aggiornato il'];
var CAMPI_S = ['id', 'nome', 'chi', 'creato', 'preso', 'presoDa'];
var INTESTAZIONI_S = ['ID', 'Cosa', 'Aggiunto da', 'Aggiunto il', 'Preso', 'Preso da'];
var CARTELLA_PROGETTI = 'Lavori di casa - Progetti';
var SCHEMA = '4';
var GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
var TESTO_FASCIA = { tutto: '☀️ Tutto il giorno', mattina: '🌅 Mattina', pomeriggio: '🌇 Pomeriggio', no: '❌ No' };
var ICONA_STATO = { attesa: '⏳', ok: '✅', no: '❌', altro: '📅', fatto: '✔️' };
var NOME_STATO = { attesa: 'In attesa', ok: 'Confermato', no: 'Nessuno può', altro: 'Altro giorno proposto', fatto: 'Fatto' };

/* ---------- Menu nel foglio ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📋 Lavori')
    .addItem('Prepara foglio e calendario', 'setup')
    .addItem('Ricrea gli eventi nel calendario', 'riallineaCalendario')
    .addItem('Prepara i progetti (foto su Drive)', 'preparaProgetti')
    .addToUi();
}

/* ---------- Preparazione (una volta sola) ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var lav = prepara_(ss, F_LAVORI, INTESTAZIONI);
  lav.getRange(1, 1, lav.getMaxRows(), INTESTAZIONI.length).setNumberFormat('@');
  lav.setColumnWidth(3, 220); lav.setColumnWidth(4, 240);
  preparaProgetti_(ss);
  preparaSpesa_(ss);
  cartellaProgetti_();
  PropertiesService.getScriptProperties().setProperty('SCHEMA', SCHEMA);

  var per = prepara_(ss, F_PERSONE, ['Nome', 'Email', 'Colore']);
  if (per.getLastRow() < 2) {
    per.getRange(2, 1, 3, 3).setValues([['Federico', '', '#6d7cff'], ['Mamma', '', '#ff6fa8'], ['Sorella', '', '#22c07a']]);
  }
  per.setColumnWidth(2, 260);

  var sett = prepara_(ss, F_SETT, ['Nome'].concat(GIORNI));
  if (sett.getLastRow() < 2) {
    var nomi = per.getRange(2, 1, per.getLastRow() - 1, 1).getValues();
    sett.getRange(2, 1, nomi.length, 8).setValues(nomi.map(function (r) { return [r[0], '', '', '', '', '', '', '']; }));
  }
  var regola = SpreadsheetApp.newDataValidation()
    .requireValueInList([TESTO_FASCIA.tutto, TESTO_FASCIA.mattina, TESTO_FASCIA.pomeriggio, TESTO_FASCIA.no], true)
    .setAllowInvalid(true).build();
  sett.getRange(2, 2, sett.getMaxRows() - 1, 7).setDataValidation(regola);

  var ecc = prepara_(ss, F_ECC, ['Nome', 'Giorno', 'Libero']);
  ecc.getRange(1, 1, ecc.getMaxRows(), 3).setNumberFormat('@');

  var imp = prepara_(ss, F_IMP, ['Impostazione', 'Valore', 'Cosa fa']);
  if (imp.getLastRow() < 2) {
    imp.getRange(2, 1, 5, 3).setValues([
      ['PIN', '1234', 'Il PIN di famiglia da scrivere nell\'app. CAMBIALO!'],
      ['Amministratore', 'Federico', 'Chi può modificare ed eliminare tutti i lavori'],
      ['Nome calendario', 'Lavori di casa', 'Il calendario Google dove finisce la copia dei lavori'],
      ['Link app', '', 'Incolla qui il link dell\'app su GitHub Pages (va nelle email e nel calendario)'],
      ['Email di avviso', 'SÌ', 'SÌ = email per lavori nuovi, spostati e risposte · NO = niente email']
    ]);
  }
  imp.getRange('B:B').setNumberFormat('@');
  imp.setColumnWidth(1, 160); imp.setColumnWidth(2, 280); imp.setColumnWidth(3, 420);

  var cal = calendario_();
  var msg = 'Tutto pronto! ✅\n\nCalendario: "' + cal.getName() + '"\n\n' +
    'Ora: 1) scrivi le email nella scheda Persone, 2) cambia il PIN in Impostazioni, 3) pubblica come App web.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function preparaProgetti_(ss) {
  var sh = prepara_(ss, F_PROG, INTESTAZIONI_P);
  sh.getRange(1, 1, sh.getMaxRows(), INTESTAZIONI_P.length).setNumberFormat('@');
  sh.setColumnWidth(3, 240); sh.setColumnWidth(4, 260);
  return sh;
}

function preparaSpesa_(ss) {
  var sh = prepara_(ss, F_SPESA, INTESTAZIONI_S);
  sh.getRange(1, 1, sh.getMaxRows(), INTESTAZIONI_S.length).setNumberFormat('@');
  sh.setColumnWidth(2, 240);
  return sh;
}

/* Aggiornamento automatico del foglio alla prima chiamata dopo la nuova versione (schede Progetti e Attrezzi, colonna Progetto) */
function schema_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA') === SCHEMA) return;
  var lav = ss.getSheetByName(F_LAVORI);
  if (lav) {
    lav.getRange(1, 1, 1, INTESTAZIONI.length).setValues([INTESTAZIONI])
      .setFontWeight('bold').setBackground('#1d2230').setFontColor('#ffffff');
    lav.getRange(1, CAMPI.length, lav.getMaxRows(), 1).setNumberFormat('@');
  }
  if (!ss.getSheetByName(F_PROG)) preparaProgetti_(ss);
  if (!ss.getSheetByName(F_SPESA)) preparaSpesa_(ss);
  props.setProperty('SCHEMA', SCHEMA);
}

function prepara_(ss, nome, intestazioni) {
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  sh.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni])
    .setFontWeight('bold').setBackground('#1d2230').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

/* Dal menu o dall'editor, una volta: crea la scheda Progetti e la cartella su Drive (e chiede il permesso per Drive) */
function preparaProgetti() {
  var ss = SpreadsheetApp.getActive();
  preparaProgetti_(ss);
  schema_(ss);
  var c = cartellaProgetti_();
  var msg = 'Progetti pronti ✅\n\nFoto e documenti finiranno su Drive nella cartella "' + c.getName() + '".';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/* ---------- Server per l'app ---------- */
function doGet() { return json_({ ok: true, info: 'Lavori di casa v2.2 attivo ✅' }); }

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActive();
    var imp = impostazioni_(ss);
    if (!imp['PIN'] || String(p.pin) !== String(imp['PIN'])) return json_({ ok: false, error: 'PIN sbagliato 🔒' });

    schema_(ss);
    if (p.action === 'list') return json_(pacchetto_(leggiDb_(ss, imp)));

    // foto o documento di un progetto: prima lo carico su Drive (fuori dal blocco: può metterci qualche secondo)
    var caricato = null;
    if (p.action === 'allegato_aggiungi' && p.base64) {
      caricato = caricaFile_(ss, imp, p);
      p.file = caricato;
      delete p.base64;
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var db = leggiDb_(ss, imp);
      var r;
      try { r = applica(db, p); }
      catch (errAz) { if (caricato) cestina_([caricato.fileId]); throw errAz; }
      var avviso = '';
      if (r.calendario) {
        try { if (r.calendario === 'salva') salvaEvento_(r.lavoro, imp); else eliminaEvento_(r.lavoro, imp); }
        catch (errCal) { avviso = 'Salvato, ma il calendario non si è aggiornato: ' + errCal.message; }
      }
      if (p.action === 'settimana') scriviSettimane_(ss, db);
      else if (p.action === 'eccezione') scriviEccezioni_(ss, db);
      else if (r.spesa) scriviSpesa_(ss, db.spesa);
      else if (r.progetto) {
        scriviProgetti_(ss, db.progetti);
        if (r.lavoriToccati) scriviLavori_(ss, db.lavori);
        if (r.cestina && r.cestina.length) cestina_(r.cestina);
      }
      else scriviLavori_(ss, db.lavori);
      try { inviaEmail_(r, p.chi, db, imp); } catch (errMail) { Logger.log(errMail); }
      var out = pacchetto_(db);
      if (avviso) out.avviso = avviso;
      return json_(out);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Manda all'app solo i lavori recenti o ancora da fare: meno dati, più veloce */
function pacchetto_(db) {
  var limite = Utilities.formatDate(new Date(Date.now() - 60 * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return {
    ok: true,
    lavori: db.lavori.filter(function (l) { return !l.fatto || l.data >= limite || (l.progettoId && hasProgetto_(db, l.progettoId)); }),
    progetti: db.progetti,
    spesa: db.spesa,
    persone: db.persone.map(function (p) { return { nome: p.nome, colore: p.colore }; }),
    settimane: db.settimane, eccezioni: db.eccezioni, admin: db.admin
  };
}

function hasProgetto_(db, id) { return db.progetti.some(function (p) { return p.id === id; }); }

/* ---------- Lettura del foglio (una lettura per scheda) ---------- */
function righe_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1);
}
function testo_(v, tz, formato) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, formato || 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
function impostazioni_(ss) {
  var out = {};
  righe_(ss, F_IMP).forEach(function (r) { if (r[0]) out[String(r[0]).trim()] = String(r[1]).trim(); });
  return out;
}
function daTestoFascia_(v) {
  v = String(v || '').toLowerCase();
  if (v.indexOf('tutt') >= 0) return 'tutto';
  if (v.indexOf('matt') >= 0) return 'mattina';
  if (v.indexOf('pom') >= 0) return 'pomeriggio';
  if (v.indexOf('no') >= 0 || v.indexOf('❌') >= 0) return 'no';
  return '';
}

function leggiDb_(ss, imp) {
  var tz = ss.getSpreadsheetTimeZone();
  var colori = ['#6d7cff', '#ff6fa8', '#22c07a', '#ffa928', '#29b6e8', '#ff7a4d'];
  var persone = righe_(ss, F_PERSONE).filter(function (r) { return String(r[0]).trim(); }).map(function (r, i) {
    return { nome: String(r[0]).trim(), email: String(r[1]).trim(), colore: String(r[2]).trim() || colori[i % colori.length] };
  });

  var lavori = righe_(ss, F_LAVORI).map(function (r) {
    var o = {};
    CAMPI.forEach(function (c, i) { o[c] = testo_(r[i], tz, c === 'ora' ? 'HH:mm' : 'yyyy-MM-dd'); });
    o.fatto = o.stato === 'fatto';
    return o;
  }).filter(function (l) { return l.id; }).map(normalizza);

  var progetti = righe_(ss, F_PROG).map(function (r) {
    var o = {};
    CAMPI_P.forEach(function (c, i) { o[c] = testo_(r[i], tz); });
    return o;
  }).filter(function (p) { return p.id; }).map(normalizzaProgetto);

  var spesa = righe_(ss, F_SPESA).map(function (r) {
    var o = {};
    CAMPI_S.forEach(function (c, i) { o[c] = testo_(r[i], tz); });
    o.preso = /^s/i.test(o.preso);
    return o;
  }).filter(function (x) { return x.id && x.nome; });

  var settimane = {};
  righe_(ss, F_SETT).forEach(function (r) {
    var n = String(r[0]).trim();
    if (n) settimane[n] = r.slice(1, 8).map(daTestoFascia_);
  });

  var oggi = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var eccezioni = {};
  righe_(ss, F_ECC).forEach(function (r) {
    var n = String(r[0]).trim(), d = testo_(r[1], tz), v = daTestoFascia_(r[2]);
    if (n && d >= oggi && v) { eccezioni[n] = eccezioni[n] || {}; eccezioni[n][d] = v; }
  });

  return { lavori: lavori, progetti: progetti, spesa: spesa, persone: persone, settimane: settimane, eccezioni: eccezioni, admin: imp['Amministratore'] || '' };
}

/* ---------- Scrittura ---------- */
function scriviTutto_(sh, righe, colonne) {
  var vecchie = Math.max(sh.getLastRow() - 1, 0);
  if (vecchie) sh.getRange(2, 1, vecchie, colonne).clearContent();
  if (righe.length) sh.getRange(2, 1, righe.length, colonne).setValues(righe);
}
function scriviLavori_(ss, lavori) {
  var sh = ss.getSheetByName(F_LAVORI);
  lavori.sort(function (a, b) { return (a.data + a.ora).localeCompare(b.data + b.ora); });
  var righe = lavori.map(function (l) {
    return CAMPI.map(function (c) {
      if (c === 'assegnati') return l.assegnati.join(', ');
      if (c === 'risposte') return JSON.stringify(l.risposte);
      if (c === 'stato') return l.fatto ? 'fatto' : l.stato;
      return l[c] == null ? '' : String(l[c]);
    });
  });
  if (righe.length) sh.getRange(2, 1, righe.length, CAMPI.length).setNumberFormat('@');
  scriviTutto_(sh, righe, CAMPI.length);
}
function scriviProgetti_(ss, progetti) {
  var sh = ss.getSheetByName(F_PROG) || preparaProgetti_(ss);
  progetti.sort(function (a, b) { return (a.stato + a.creato).localeCompare(b.stato + b.creato); });
  var righe = progetti.map(function (p) {
    return CAMPI_P.map(function (c) {
      if (c === 'note' || c === 'articoli' || c === 'allegati') return JSON.stringify(p[c] || []);
      if (c === 'totale') return String(totaleProgetto(p)).replace('.', ',');
      return p[c] == null ? '' : String(p[c]);
    });
  });
  if (righe.length) sh.getRange(2, 1, righe.length, CAMPI_P.length).setNumberFormat('@');
  scriviTutto_(sh, righe, CAMPI_P.length);
}
function scriviSpesa_(ss, spesa) {
  var sh = ss.getSheetByName(F_SPESA) || preparaSpesa_(ss);
  var righe = spesa.map(function (x) {
    return [x.id, x.nome, x.chi || '', x.creato || '', x.preso ? 'SÌ' : '', x.presoDa || ''];
  });
  scriviTutto_(sh, righe, CAMPI_S.length);
}
function scriviSettimane_(ss, db) {
  var sh = ss.getSheetByName(F_SETT);
  var nomi = db.persone.map(function (p) { return p.nome; });
  Object.keys(db.settimane).forEach(function (n) { if (nomi.indexOf(n) < 0) nomi.push(n); });
  scriviTutto_(sh, nomi.map(function (n) {
    return [n].concat((db.settimane[n] || []).concat(['', '', '', '', '', '', '']).slice(0, 7).map(function (v) { return TESTO_FASCIA[v] || ''; }));
  }), 8);
}
function scriviEccezioni_(ss, db) {
  var righe = [];
  Object.keys(db.eccezioni).forEach(function (n) {
    Object.keys(db.eccezioni[n]).sort().forEach(function (d) { righe.push([n, d, TESTO_FASCIA[db.eccezioni[n][d]] || '']); });
  });
  var sh = ss.getSheetByName(F_ECC);
  if (righe.length) sh.getRange(2, 1, righe.length, 3).setNumberFormat('@');
  scriviTutto_(sh, righe, 3);
}

/* ---------- Foto e documenti dei progetti su Google Drive ---------- */
function cartellaProgetti_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARTELLA_ID'), c = null;
  if (id) { try { c = DriveApp.getFolderById(id); if (c.isTrashed()) c = null; } catch (e) { c = null; } }
  if (!c) {
    var it = DriveApp.getFoldersByName(CARTELLA_PROGETTI);
    c = it.hasNext() ? it.next() : DriveApp.createFolder(CARTELLA_PROGETTI);
    props.setProperty('CARTELLA_ID', c.getId());
  }
  return c;
}
function caricaFile_(ss, imp, p) {
  var db = leggiDb_(ss, imp);
  var pr = db.progetti.filter(function (x) { return x.id === p.progettoId; })[0];
  if (!pr) throw new Error('Progetto non trovato: forse è stato eliminato 🔄');
  var cartella = null;
  if (pr.cartella) { try { cartella = DriveApp.getFolderById(pr.cartella); if (cartella.isTrashed()) cartella = null; } catch (e) { cartella = null; } }
  if (!cartella) cartella = cartellaProgetti_().createFolder((pr.emoji + ' ' + pr.titolo).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80));
  var tipo = p.tipo === 'foto' ? 'foto' : 'doc';
  var mime = String(p.mime || (tipo === 'foto' ? 'image/jpeg' : 'application/octet-stream'));
  var nome = String(p.nome || (tipo === 'foto' ? 'Foto' : 'Documento')).replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);
  var quando = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH.mm');
  var blob = Utilities.newBlob(Utilities.base64Decode(p.base64), mime, quando + ' ' + nome);
  var file = cartella.createFile(blob);
  // visibile a chi ha il link (serve per vedere le foto nell'app); nessuno lo trova senza link
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { Logger.log(e); }
  var id = file.getId();
  return {
    tipo: tipo, nome: nome, mime: mime, fileId: id, cartella: cartella.getId(),
    url: file.getUrl(),
    anteprima: (tipo === 'foto' || /^image\//.test(mime) || mime === 'application/pdf') ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800' : ''
  };
}
function cestina_(ids) {
  (ids || []).forEach(function (id) { try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) { Logger.log(e); } });
}

/* ---------- Copia nel calendario Google ---------- */
function calendario_(imp) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CAL_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    var nome = (imp || impostazioni_(SpreadsheetApp.getActive()))['Nome calendario'] || 'Lavori di casa';
    var trovati = CalendarApp.getOwnedCalendarsByName(nome);
    cal = trovati.length ? trovati[0] : CalendarApp.createCalendar(nome, { timeZone: 'Europe/Rome' });
    props.setProperty('CAL_ID', cal.getId());
  }
  return cal;
}

function orari_(l, tz) {
  var ora = l.quando === 'ora' ? l.ora : ORE_FASCIA[l.quando];
  if (!ora) return null;                               // in giornata
  var inizio = Utilities.parseDate(l.data + ' ' + ora, tz, 'yyyy-MM-dd HH:mm');
  var min = l.quando === 'ora' ? (Number(l.durata) || 60) : 180;
  return { inizio: inizio, fine: new Date(inizio.getTime() + min * 60000) };
}

/* Promemoria: il giorno prima alle 8 e 2 ore prima, sempre tra le 8 e le 22 */
function promemoria_(ev, l, tz, orari) {
  ev.removeAllReminders();
  if (l.fatto) return;
  var inizio = orari ? orari.inizio : Utilities.parseDate(l.data + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
  var p = l.data.split('-').map(Number);
  var ieri = Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] - 1, 12)), 'UTC', 'yyyy-MM-dd');
  var momenti = [Utilities.parseDate(ieri + ' 08:00', tz, 'yyyy-MM-dd HH:mm')];
  if (orari) {
    var due = new Date(inizio.getTime() - 120 * 60000);
    var giorno = Utilities.formatDate(due, tz, 'yyyy-MM-dd');
    var hh = Utilities.formatDate(due, tz, 'HH:mm');
    if (hh < '08:00') due = Utilities.parseDate(giorno + ' 08:00', tz, 'yyyy-MM-dd HH:mm');
    if (hh > '22:00') due = Utilities.parseDate(giorno + ' 22:00', tz, 'yyyy-MM-dd HH:mm');
    momenti.push(due);
  }
  var fatti = [];
  momenti.forEach(function (m) {
    var minuti = Math.round((inizio.getTime() - m.getTime()) / 60000);
    if (minuti > 0 && minuti <= 40320 && fatti.indexOf(minuti) < 0) { ev.addPopupReminder(minuti); fatti.push(minuti); }
  });
}

function salvaEvento_(l, imp) {
  var cal = calendario_(imp);
  var tz = cal.getTimeZone();
  var ev = null;
  if (l.eventoId) { try { ev = cal.getEventById(l.eventoId); } catch (e) { ev = null; } }
  var fascia = { mattina: ' 🌅', pomeriggio: ' 🌇' }[l.quando] || '';
  var titolo = (ICONA_STATO[l.fatto ? 'fatto' : l.stato] || '') + ' ' + l.emoji + ' ' + l.titolo + fascia + ' · ' + l.assegnati.join(', ');
  var righe = [];
  if (l.descrizione) righe.push(l.descrizione, '');
  righe.push('Stato: ' + NOME_STATO[l.fatto ? 'fatto' : l.stato], 'Creato da: ' + l.creatore);
  if (imp['Link app']) righe.push('', 'Apri l\'app: ' + imp['Link app']);
  var orari = orari_(l, tz);
  var giorno = Utilities.parseDate(l.data + ' 12:00', tz, 'yyyy-MM-dd HH:mm');

  if (ev && ev.isAllDayEvent() !== !orari) { ev.deleteEvent(); ev = null; }
  if (!ev) {
    ev = orari ? cal.createEvent(titolo, orari.inizio, orari.fine) : cal.createAllDayEvent(titolo, giorno);
    l.eventoId = ev.getId();
  } else {
    ev.setTitle(titolo);
    if (orari) ev.setTime(orari.inizio, orari.fine); else ev.setAllDayDate(giorno);
  }
  ev.setDescription(righe.join('\n'));
  var C = CalendarApp.EventColor;
  ev.setColor(l.fatto ? C.GRAY : ({ attesa: C.YELLOW, ok: C.GREEN, no: C.RED, altro: C.CYAN }[l.stato] || C.YELLOW));
  promemoria_(ev, l, tz, orari);
}

function eliminaEvento_(l, imp) {
  if (!l.eventoId) return;
  try { var ev = calendario_(imp).getEventById(l.eventoId); if (ev) ev.deleteEvent(); } catch (e) { Logger.log(e); }
}

/* Dal menu: rimette a posto tutti gli eventi */
function riallineaCalendario() {
  var ss = SpreadsheetApp.getActive();
  var imp = impostazioni_(ss);
  var db = leggiDb_(ss, imp);
  var n = 0;
  db.lavori.forEach(function (l) { try { salvaEvento_(l, imp); n++; } catch (e) { Logger.log(l.titolo + ': ' + e); } });
  scriviLavori_(ss, db.lavori);
  try { SpreadsheetApp.getUi().alert('Eventi aggiornati: ' + n); } catch (e) { Logger.log(n); }
}

/* ---------- Email (solo lavori nuovi, spostati, eliminati e risposte) ---------- */
function inviaEmail_(r, chi, db, imp) {
  if (!r.notifiche.length || /^n/i.test(imp['Email di avviso'] || '') || !r.lavoro) return;
  var l = r.lavoro, email = {};
  db.persone.forEach(function (p) { email[p.nome] = p.email; });
  var testi = {
    nuovo: ['📋 Nuovo lavoro: ', chi + ' ti chiede una mano.'],
    spostato: ['📅 Lavoro spostato: ', chi + ' ha cambiato il giorno. Ci sei?'],
    risposta_ok: ['✅ ' + chi + ' ci sta: ', chi + ' ha detto che va bene.'],
    risposta_no: ['❌ ' + chi + ' non può: ', chi + ' non riesce.'],
    risposta_altro: ['📅 ' + chi + ' propone un altro giorno: ', chi + ' preferisce un altro giorno.'],
    eliminato: ['🗑️ Lavoro annullato: ', chi + ' ha tolto questo lavoro.']
  };
  var quando = l.data.split('-').reverse().join('/') + (l.ora ? ' alle ' + l.ora : { mattina: ' di mattina', pomeriggio: ' di pomeriggio' }[l.quando] || '');
  r.notifiche.forEach(function (n) {
    var t = testi[n.tipo], a = email[n.a];
    if (!t || !a) return;
    var nota = (l.risposte[chi] || {}).nota;
    var html = '<div style="font-family:Arial,sans-serif;font-size:17px;max-width:520px">' +
      '<p>' + esc_(t[1]) + '</p><div style="background:#f3f4f8;border-radius:14px;padding:16px;margin:12px 0">' +
      '<div style="font-size:22px;font-weight:bold">' + esc_(l.emoji + ' ' + l.titolo) + '</div>' +
      '<div style="color:#5b6275;margin-top:6px">📅 ' + esc_(quando) + ' · 🙋 ' + esc_(l.assegnati.join(', ')) + '</div>' +
      (nota ? '<p style="font-style:italic">💬 ' + esc_(nota) + '</p>' : '') + '</div>' +
      (imp['Link app'] ? '<p><a href="' + imp['Link app'] + '" style="display:inline-block;background:#6d7cff;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:bold">Apri l\'app</a></p>' : '') +
      '</div>';
    MailApp.sendEmail({ to: a, subject: t[0] + l.titolo, htmlBody: html, name: 'Lavori di casa' });
  });
}
function esc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
