/* Lavori di casa — Codice.gs (regole + server). Incolla tutto questo nell'editor Apps Script. */

/*
 * Lavori di casa — regole dei lavori.
 * Questo stesso file gira sia nell'app (modalità prova) sia nell'Apps Script del foglio,
 * così le regole sono identiche nei due posti.
 *
 * Stati di un lavoro:
 *   attesa    -> creato, aspetta la risposta di chi lo deve fare
 *   accettato -> chi lo deve fare ha detto sì
 *   rifiutato -> chi lo deve fare ha detto che non può
 *   proposta  -> chi lo deve fare propone un altro giorno o una modifica
 *   fatto     -> lavoro completato
 */

var STATI_LAVORO = ['attesa', 'accettato', 'rifiutato', 'proposta', 'fatto'];

function nuovoId() {
  return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _testo(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * Applica un'azione al "database" { lavori: [], storico: [] }.
 * p = { action, chi, id, ... }
 * Restituisce { lavoro, notifiche: [{a, tipo, id}], calendario: 'salva' | 'elimina' }
 */
function applica(db, p, adesso) {
  adesso = adesso || new Date().toISOString();
  var chi = _testo(p.chi);
  if (!chi) throw new Error('Scegli prima chi sei nelle impostazioni');

  var notifiche = [];
  var calendario = null;
  var j = null;

  function log(lav, azione, dettaglio) {
    db.storico.push({
      quando: adesso, id: lav.id, titolo: lav.titolo, chi: chi,
      azione: azione, dettaglio: dettaglio || ''
    });
  }
  function trova() {
    for (var i = 0; i < db.lavori.length; i++) {
      if (db.lavori[i].id === p.id) return db.lavori[i];
    }
    throw new Error('Lavoro non trovato: forse è stato eliminato. Aggiorna la pagina.');
  }
  function avvisa(a, tipo, lav) {
    if (a && a !== chi) notifiche.push({ a: a, tipo: tipo, id: lav.id });
  }
  function pulisciProposta(lav) {
    lav.propData = ''; lav.propOra = ''; lav.propTitolo = ''; lav.propDescrizione = '';
  }
  function durata(v) {
    var n = Number(v);
    return n > 0 ? Math.round(n) : 60;
  }
  function richiediCampi() {
    if (!_testo(p.titolo)) throw new Error('Scrivi cosa c\'è da fare');
    if (!_testo(p.data)) throw new Error('Scegli il giorno');
    if (!_testo(p.assegnato)) throw new Error('Scegli per chi è il lavoro');
  }

  switch (p.action) {
    case 'crea':
      richiediCampi();
      j = {
        id: nuovoId(),
        titolo: _testo(p.titolo),
        descrizione: _testo(p.descrizione),
        data: _testo(p.data),
        ora: _testo(p.ora),
        durata: durata(p.durata),
        assegnato: _testo(p.assegnato),
        creatore: chi,
        stato: _testo(p.assegnato) === chi ? 'accettato' : 'attesa',
        propData: '', propOra: '', propTitolo: '', propDescrizione: '',
        nota: '', eventoId: '', creato: adesso, aggiornato: adesso
      };
      db.lavori.push(j);
      log(j, 'ha creato il lavoro', j.assegnato === chi ? 'per sé' : 'per ' + j.assegnato);
      avvisa(j.assegnato, 'nuovo', j);
      calendario = 'salva';
      break;

    case 'modifica':
      j = trova();
      if (chi !== j.creatore) throw new Error('Solo ' + j.creatore + ' può modificare questo lavoro');
      richiediCampi();
      j.titolo = _testo(p.titolo);
      j.descrizione = _testo(p.descrizione);
      j.data = _testo(p.data);
      j.ora = _testo(p.ora);
      j.durata = durata(p.durata);
      j.assegnato = _testo(p.assegnato);
      pulisciProposta(j);
      j.nota = '';
      j.stato = j.assegnato === chi ? 'accettato' : 'attesa';
      log(j, 'ha modificato il lavoro', '');
      avvisa(j.assegnato, 'modificato', j);
      calendario = 'salva';
      break;

    case 'rispondi':
      j = trova();
      if (chi !== j.assegnato) throw new Error('Può rispondere solo ' + j.assegnato);
      if (j.stato === 'fatto') throw new Error('Il lavoro è già fatto');
      j.nota = _testo(p.nota);
      if (p.tipo === 'accetta') {
        pulisciProposta(j);
        j.stato = 'accettato';
        log(j, 'ha accettato', j.nota);
      } else if (p.tipo === 'rifiuta') {
        pulisciProposta(j);
        j.stato = 'rifiutato';
        log(j, 'non può farlo', j.nota);
      } else if (p.tipo === 'data') {
        if (!_testo(p.propData)) throw new Error('Scegli il nuovo giorno');
        pulisciProposta(j);
        j.propData = _testo(p.propData);
        j.propOra = _testo(p.propOra);
        j.stato = 'proposta';
        log(j, 'propone un altro giorno', j.propData.split('-').reverse().join('/') + (j.propOra ? ' alle ' + j.propOra : '') + (j.nota ? ' — ' + j.nota : ''));
      } else if (p.tipo === 'modifica') {
        var t = _testo(p.propTitolo);
        var d = _testo(p.propDescrizione);
        if (!t) throw new Error('Il titolo non può essere vuoto');
        if (t === j.titolo && d === j.descrizione) throw new Error('Non hai cambiato niente');
        pulisciProposta(j);
        j.propTitolo = t;
        j.propDescrizione = d;
        j.stato = 'proposta';
        log(j, 'propone una modifica', j.nota);
      } else {
        throw new Error('Risposta non valida');
      }
      avvisa(j.creatore, p.tipo, j);
      calendario = 'salva';
      break;

    case 'decidi':
      j = trova();
      if (chi !== j.creatore) throw new Error('Solo ' + j.creatore + ' può decidere sulla proposta');
      if (j.stato !== 'proposta') throw new Error('Non c\'è nessuna proposta da valutare');
      if (p.approva) {
        if (j.propData) { j.data = j.propData; j.ora = j.propOra; }
        if (j.propTitolo) { j.titolo = j.propTitolo; j.descrizione = j.propDescrizione; }
        j.stato = 'accettato';
        log(j, 'ha accettato la proposta', _testo(p.nota));
        avvisa(j.assegnato, 'approvata', j);
      } else {
        j.stato = 'attesa';
        log(j, 'non ha accettato la proposta', _testo(p.nota));
        avvisa(j.assegnato, 'respinta', j);
      }
      pulisciProposta(j);
      j.nota = _testo(p.nota);
      calendario = 'salva';
      break;

    case 'fatto':
      j = trova();
      if (chi !== j.creatore && chi !== j.assegnato) throw new Error('Non è un tuo lavoro');
      j.stato = 'fatto';
      pulisciProposta(j);
      log(j, 'ha segnato come fatto', '');
      avvisa(chi === j.creatore ? j.assegnato : j.creatore, 'fatto', j);
      calendario = 'salva';
      break;

    case 'riapri':
      j = trova();
      if (chi !== j.creatore && chi !== j.assegnato) throw new Error('Non è un tuo lavoro');
      j.stato = 'accettato';
      log(j, 'ha riaperto il lavoro', '');
      calendario = 'salva';
      break;

    case 'elimina':
      j = trova();
      if (chi !== j.creatore) throw new Error('Solo ' + j.creatore + ' può eliminarlo');
      db.lavori.splice(db.lavori.indexOf(j), 1);
      log(j, 'ha eliminato il lavoro', '');
      avvisa(j.assegnato, 'eliminato', j);
      calendario = 'elimina';
      break;

    default:
      throw new Error('Azione sconosciuta');
  }

  j.aggiornato = adesso;
  return { lavoro: j, notifiche: notifiche, calendario: calendario };
}


/* =====================================================================
 * Lavori di casa — server sul foglio Google
 * - Il foglio fa da archivio (schede Lavori, Persone, Storico, Impostazioni)
 * - Ogni lavoro diventa un evento nel calendario Google "Lavori di casa"
 * - Avvisi via email a chi deve rispondere
 * Il PIN e le email stanno SOLO nel foglio, non in questo codice.
 * ===================================================================== */

var FOGLIO_LAVORI = 'Lavori';
var FOGLIO_PERSONE = 'Persone';
var FOGLIO_STORICO = 'Storico';
var FOGLIO_IMPOSTAZIONI = 'Impostazioni';

var CAMPI = ['id', 'titolo', 'descrizione', 'data', 'ora', 'durata', 'assegnato', 'creatore', 'stato',
  'propData', 'propOra', 'propTitolo', 'propDescrizione', 'nota', 'eventoId', 'creato', 'aggiornato'];
var INTESTAZIONI = ['ID', 'Titolo', 'Descrizione', 'Data', 'Ora', 'Durata (min)', 'Per chi', 'Creato da', 'Stato',
  'Proposta: giorno', 'Proposta: ora', 'Proposta: titolo', 'Proposta: dettagli', 'Nota', 'ID evento calendario', 'Creato il', 'Aggiornato il'];
var CAMPI_STORICO = ['quando', 'id', 'titolo', 'chi', 'azione', 'dettaglio'];
var INTESTAZIONI_STORICO = ['Quando', 'ID lavoro', 'Lavoro', 'Chi', 'Azione', 'Dettaglio'];

var ICONE = { attesa: '⏳', accettato: '✅', rifiutato: '❌', proposta: '🔄', fatto: '✔️' };
var NOMI_STATO = { attesa: 'In attesa di risposta', accettato: 'Accettato', rifiutato: 'Non può', proposta: 'Proposta di modifica', fatto: 'Fatto' };

/* ---------- Menu nel foglio ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📋 Lavori')
    .addItem('Prepara foglio e calendario', 'setup')
    .addItem('Ricrea gli eventi nel calendario', 'riallineaCalendario')
    .addItem('Manda un\'email di prova a me', 'emailDiProva')
    .addToUi();
}

/* ---------- Preparazione (da eseguire una volta) ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();

  var lav = preparaFoglio_(ss, FOGLIO_LAVORI, INTESTAZIONI);
  lav.getRange(1, 1, lav.getMaxRows(), INTESTAZIONI.length).setNumberFormat('@');
  lav.setColumnWidth(2, 220); lav.setColumnWidth(3, 260);

  var per = preparaFoglio_(ss, FOGLIO_PERSONE, ['Nome', 'Email', 'Colore']);
  if (per.getLastRow() < 2) {
    per.getRange(2, 1, 3, 3).setValues([
      ['Federico', '', '#7c8cff'],
      ['Mamma', '', '#ff7ab6'],
      ['Sorella', '', '#3dd68c']
    ]);
  }
  per.setColumnWidth(2, 260);

  var sto = preparaFoglio_(ss, FOGLIO_STORICO, INTESTAZIONI_STORICO);
  sto.getRange(1, 1, sto.getMaxRows(), INTESTAZIONI_STORICO.length).setNumberFormat('@');

  var imp = preparaFoglio_(ss, FOGLIO_IMPOSTAZIONI, ['Impostazione', 'Valore', 'Cosa fa']);
  if (imp.getLastRow() < 2) {
    imp.getRange(2, 1, 4, 3).setValues([
      ['PIN', '1234', 'Il PIN di famiglia da scrivere nell\'app. CAMBIALO!'],
      ['Nome calendario', 'Lavori di casa', 'Il calendario Google dove finiscono i lavori'],
      ['Link app', '', 'Il link dell\'app su GitHub Pages (va nel pulsante delle email)'],
      ['Email di avviso', 'SÌ', 'SÌ = manda le email, NO = niente email']
    ]);
  }
  imp.getRange('B:B').setNumberFormat('@');
  imp.setColumnWidth(1, 160); imp.setColumnWidth(2, 260); imp.setColumnWidth(3, 380);

  var cal = calendario_();
  var msg = 'Tutto pronto!\n\nCalendario: "' + cal.getName() + '"\n\n' +
    'Ora: 1) scrivi le email nella scheda Persone, 2) cambia il PIN nella scheda Impostazioni, ' +
    '3) pubblica lo script come App web.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function preparaFoglio_(ss, nome, intestazioni) {
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  sh.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni])
    .setFontWeight('bold').setBackground('#1d2230').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

function impostazioni_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(FOGLIO_IMPOSTAZIONI);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = String(r[1]).trim();
  });
  return out;
}

/* ---------- Server per l'app ---------- */
function doGet() {
  return json_({ ok: true, info: 'Server di Lavori di casa attivo' });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var imp = impostazioni_();
    if (!imp['PIN'] || String(p.pin) !== String(imp['PIN'])) return json_({ ok: false, error: 'PIN sbagliato' });

    if (p.action === 'list') {
      var db0 = leggiDb_();
      sincronizzaDalCalendario_(db0);
      return json_(pacchetto_(db0));
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var db = leggiDb_();
      var nStorico = db.storico.length;
      var r = applica(db, p);
      var avviso = '';
      try {
        if (r.calendario === 'salva') salvaEvento_(r.lavoro);
        else if (r.calendario === 'elimina') eliminaEvento_(r.lavoro);
      } catch (errCal) {
        avviso = 'Salvato, ma il calendario non si è aggiornato: ' + errCal.message;
      }
      scriviLavori_(db.lavori);
      scriviStorico_(db.storico.slice(nStorico));
      try { inviaNotifiche_(r, p.chi); } catch (errMail) { Logger.log(errMail); }
      var out = pacchetto_(db);
      if (avviso) out.avviso = avviso;
      return json_(out);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function pacchetto_(db) {
  return {
    ok: true,
    lavori: db.lavori,
    persone: db.persone.map(function (p) { return { nome: p.nome, colore: p.colore }; }),
    storico: db.storico.slice(-400)
  };
}

/* ---------- Lettura e scrittura del foglio ---------- */
function leggiDb_() {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();
  return {
    lavori: leggiTabella_(ss.getSheetByName(FOGLIO_LAVORI), CAMPI, tz).filter(function (l) { return l.id; }),
    storico: leggiTabella_(ss.getSheetByName(FOGLIO_STORICO), CAMPI_STORICO, tz),
    persone: leggiPersone_()
  };
}

function leggiTabella_(sh, campi, tz) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, campi.length).getValues().map(function (r) {
    var o = {};
    campi.forEach(function (c, i) { o[c] = valore_(r[i], c, tz); });
    return o;
  });
}

function valore_(v, campo, tz) {
  if (v instanceof Date) {
    if (campo === 'ora' || campo === 'propOra') return Utilities.formatDate(v, tz, 'HH:mm');
    if (campo === 'data' || campo === 'propData') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    return v.toISOString();
  }
  if (campo === 'durata') return Number(v) || 60;
  if (campo === 'stato') return String(v || 'attesa').trim().toLowerCase();
  return String(v == null ? '' : v);
}

function leggiPersone_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(FOGLIO_PERSONE);
  if (!sh || sh.getLastRow() < 2) return [];
  var colori = ['#7c8cff', '#ff7ab6', '#3dd68c', '#ffb547', '#4cc9f0', '#ff8a5b'];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r, i) {
      return { nome: String(r[0]).trim(), email: String(r[1]).trim(), colore: String(r[2]).trim() || colori[i % colori.length] };
    });
}

function scriviLavori_(lavori) {
  var sh = SpreadsheetApp.getActive().getSheetByName(FOGLIO_LAVORI);
  var vecchie = Math.max(sh.getLastRow() - 1, 0);
  if (vecchie) sh.getRange(2, 1, vecchie, CAMPI.length).clearContent();
  if (!lavori.length) return;
  var righe = lavori.map(function (l) { return CAMPI.map(function (c) { return l[c] == null ? '' : String(l[c]); }); });
  sh.getRange(2, 1, righe.length, CAMPI.length).setNumberFormat('@').setValues(righe);
}

function scriviStorico_(nuove) {
  if (!nuove.length) return;
  var sh = SpreadsheetApp.getActive().getSheetByName(FOGLIO_STORICO);
  var righe = nuove.map(function (h) { return CAMPI_STORICO.map(function (c) { return h[c] == null ? '' : String(h[c]); }); });
  sh.getRange(sh.getLastRow() + 1, 1, righe.length, CAMPI_STORICO.length).setNumberFormat('@').setValues(righe);
}

/* ---------- Calendario Google ---------- */
function calendario_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CAL_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    var nome = impostazioni_()['Nome calendario'] || 'Lavori di casa';
    var trovati = CalendarApp.getOwnedCalendarsByName(nome);
    cal = trovati.length ? trovati[0] : CalendarApp.createCalendar(nome, { timeZone: Session.getScriptTimeZone() });
    props.setProperty('CAL_ID', cal.getId());
  }
  return cal;
}

function titoloEvento_(l) {
  var t = (ICONE[l.stato] || '') + ' ' + l.titolo + ' · ' + l.assegnato;
  if (l.stato === 'proposta' && l.propData) t += ' (propone ' + l.propData.split('-').reverse().slice(0, 2).join('/') + ')';
  return t;
}

function descrizioneEvento_(l) {
  var link = impostazioni_()['Link app'];
  var righe = [];
  if (l.descrizione) righe.push(l.descrizione, '');
  righe.push('Stato: ' + (NOMI_STATO[l.stato] || l.stato));
  righe.push('Per: ' + l.assegnato + ' · Creato da: ' + l.creatore);
  if (l.nota) righe.push('Nota: ' + l.nota);
  if (link) righe.push('', 'Rispondi dall\'app: ' + link);
  return righe.join('\n');
}

function coloreEvento_(stato) {
  var C = CalendarApp.EventColor;
  return { attesa: C.YELLOW, accettato: C.GREEN, rifiutato: C.RED, proposta: C.CYAN, fatto: C.GRAY }[stato] || C.YELLOW;
}

function salvaEvento_(l) {
  var cal = calendario_();
  var tz = cal.getTimeZone();
  var ev = null;
  if (l.eventoId) { try { ev = cal.getEventById(l.eventoId); } catch (e) { ev = null; } }

  var titolo = titoloEvento_(l);
  var opzioni = { description: descrizioneEvento_(l) };
  var inizio, fine, giorno;
  if (l.ora) {
    inizio = Utilities.parseDate(l.data + ' ' + l.ora, tz, 'yyyy-MM-dd HH:mm');
    fine = new Date(inizio.getTime() + (Number(l.durata) || 60) * 60000);
  } else {
    giorno = Utilities.parseDate(l.data + ' 12:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  }

  if (!ev) {
    ev = l.ora ? cal.createEvent(titolo, inizio, fine, opzioni) : cal.createAllDayEvent(titolo, giorno, opzioni);
    l.eventoId = ev.getId();
  } else {
    ev.setTitle(titolo);
    ev.setDescription(opzioni.description);
    if (l.ora) ev.setTime(inizio, fine); else ev.setAllDayDate(giorno);
  }
  ev.setColor(coloreEvento_(l.stato));
}

function eliminaEvento_(l) {
  if (!l.eventoId) return;
  try {
    var ev = calendario_().getEventById(l.eventoId);
    if (ev) ev.deleteEvent();
  } catch (e) { Logger.log(e); }
}

/* Se qualcuno sposta un lavoro direttamente in Google Calendar, l'app lo vede. */
function sincronizzaDalCalendario_(db) {
  try {
    var attivi = db.lavori.filter(function (l) { return l.eventoId && l.stato !== 'fatto'; });
    if (!attivi.length) return;
    var cal = calendario_();
    var tz = cal.getTimeZone();
    var tzScript = Session.getScriptTimeZone();
    var adesso = new Date();
    var eventi = cal.getEvents(new Date(adesso.getTime() - 120 * 864e5), new Date(adesso.getTime() + 400 * 864e5));
    var mappa = {};
    eventi.forEach(function (ev) { mappa[ev.getId()] = ev; });

    var iso = adesso.toISOString();
    var n0 = db.storico.length;
    var cambiati = 0;
    attivi.forEach(function (l) {
      var ev = mappa[l.eventoId];
      if (!ev) return;
      var data, ora, durata = Number(l.durata) || 60;
      if (ev.isAllDayEvent()) {
        data = Utilities.formatDate(ev.getAllDayStartDate(), tzScript, 'yyyy-MM-dd');
        ora = '';
      } else {
        data = Utilities.formatDate(ev.getStartTime(), tz, 'yyyy-MM-dd');
        ora = Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm');
        durata = Math.round((ev.getEndTime().getTime() - ev.getStartTime().getTime()) / 60000);
      }
      if (data !== l.data || ora !== l.ora || (ora && durata !== Number(l.durata))) {
        l.data = data; l.ora = ora; l.durata = durata; l.aggiornato = iso;
        db.storico.push({ quando: iso, id: l.id, titolo: l.titolo, chi: 'Calendario', azione: 'spostato da Google Calendar', dettaglio: data.split('-').reverse().join('/') + (ora ? ' alle ' + ora : '') });
        cambiati++;
      }
    });
    if (cambiati) {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        scriviLavori_(db.lavori);
        scriviStorico_(db.storico.slice(n0));
      } finally { lock.releaseLock(); }
    }
  } catch (e) {
    Logger.log('Sincronizzazione calendario: ' + e);
  }
}

/* Dal menu: rimette a posto tutti gli eventi (es. se hai cancellato il calendario) */
function riallineaCalendario() {
  var db = leggiDb_();
  var n = 0;
  db.lavori.forEach(function (l) {
    try { salvaEvento_(l); n++; } catch (e) { Logger.log(l.titolo + ': ' + e); }
  });
  scriviLavori_(db.lavori);
  try { SpreadsheetApp.getUi().alert('Eventi aggiornati: ' + n); } catch (e) { Logger.log(n); }
}

/* ---------- Avvisi via email ---------- */
function inviaNotifiche_(r, chi) {
  if (!r.notifiche.length) return;
  var imp = impostazioni_();
  if (/^n/i.test(imp['Email di avviso'] || '')) return;
  var email = {};
  leggiPersone_().forEach(function (p) { email[p.nome] = p.email; });
  r.notifiche.forEach(function (n) {
    var a = email[n.a];
    if (!a) return;
    var t = testoNotifica_(n.tipo, chi, r.lavoro);
    MailApp.sendEmail({ to: a, subject: t.oggetto, htmlBody: htmlEmail_(t, r.lavoro, imp['Link app']), name: 'Lavori di casa' });
  });
}

function testoNotifica_(tipo, chi, l) {
  var T = {
    nuovo: ['📋 Nuovo lavoro: ' + l.titolo, chi + ' ti ha chiesto una mano. Puoi accettare, dire che non puoi o proporre un altro giorno.'],
    modificato: ['✏️ Lavoro cambiato: ' + l.titolo, chi + ' ha modificato il lavoro. Dai un\'occhiata e rispondi.'],
    accetta: ['✅ ' + chi + ' ha accettato: ' + l.titolo, chi + ' ha detto che va bene.'],
    rifiuta: ['❌ ' + chi + ' non può: ' + l.titolo, chi + ' non riesce a fare questo lavoro. Puoi cambiare giorno o persona.'],
    data: ['📅 ' + chi + ' propone un altro giorno: ' + l.titolo, chi + ' propone un altro giorno. Accetti?'],
    modifica: ['✏️ ' + chi + ' propone una modifica: ' + l.titolo, chi + ' propone di cambiare il lavoro. Accetti?'],
    approvata: ['👍 Proposta accettata: ' + l.titolo, chi + ' ha accettato la tua proposta.'],
    respinta: ['↩️ Proposta non accettata: ' + l.titolo, chi + ' preferisce lasciare il lavoro com\'era.'],
    fatto: ['🎉 Fatto: ' + l.titolo, chi + ' ha segnato il lavoro come fatto.'],
    eliminato: ['🗑️ Lavoro annullato: ' + l.titolo, chi + ' ha eliminato questo lavoro: non serve più farlo.']
  }[tipo] || ['Lavori di casa: ' + l.titolo, 'Novità su un lavoro.'];
  return { oggetto: T[0], intro: T[1] };
}

function htmlEmail_(t, l, link) {
  function e(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
  var quando = l.data.split('-').reverse().join('/') + (l.ora ? ' alle ' + l.ora : '');
  var prop = '';
  if (l.stato === 'proposta') {
    if (l.propData) prop += '<p><b>Nuovo giorno proposto:</b> ' + e(l.propData.split('-').reverse().join('/') + (l.propOra ? ' alle ' + l.propOra : '')) + '</p>';
    if (l.propTitolo) prop += '<p><b>Nuova versione:</b> ' + e(l.propTitolo) + (l.propDescrizione ? '<br>' + e(l.propDescrizione) : '') + '</p>';
  }
  return '<div style="font-family:Arial,sans-serif;max-width:520px;color:#1d2230">' +
    '<p>' + e(t.intro) + '</p>' +
    '<div style="background:#f3f4f8;border-radius:12px;padding:14px 16px;margin:12px 0">' +
    '<div style="font-size:18px;font-weight:bold">' + e(l.titolo) + '</div>' +
    '<div style="color:#5b6275;margin-top:4px">📅 ' + e(quando) + ' · per ' + e(l.assegnato) + '</div>' +
    (l.descrizione ? '<p>' + e(l.descrizione) + '</p>' : '') + prop +
    (l.nota ? '<p style="font-style:italic">“' + e(l.nota) + '”</p>' : '') +
    '</div>' +
    (link ? '<p><a href="' + link + '" style="display:inline-block;background:#7c8cff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Apri l\'app e rispondi</a></p>' : '') +
    '</div>';
}

function emailDiProva() {
  var me = Session.getActiveUser().getEmail();
  MailApp.sendEmail({ to: me, subject: '📋 Prova di Lavori di casa', htmlBody: '<p>Le email funzionano 👍</p>', name: 'Lavori di casa' });
  try { SpreadsheetApp.getUi().alert('Email mandata a ' + me); } catch (e) { Logger.log(me); }
}
