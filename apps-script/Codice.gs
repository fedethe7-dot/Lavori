/* Lavori di casa — Codice.gs v1.1 (regole + server). Incolla tutto questo nell'editor Apps Script. */

/*
 * Lavori di casa — regole dei lavori.
 * Questo stesso file gira sia nell'app (modalità prova) sia nell'Apps Script del foglio,
 * così le regole sono identiche nei due posti.
 *
 * Un lavoro può essere per una o più persone (assegnati). Ognuna risponde per conto suo:
 *   attesa    -> deve ancora rispondere
 *   accettato -> ha detto sì
 *   rifiutato -> ha detto che non può
 *   proposta  -> propone un altro giorno o una modifica
 * Lo stato del lavoro si calcola dalle risposte; "fatto" chiude il lavoro.
 */

var STATI_LAVORO = ['attesa', 'accettato', 'rifiutato', 'proposta', 'fatto'];

function nuovoId() {
  return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _testo(v) {
  return String(v == null ? '' : v).trim();
}

function _nomi(v) {
  var lista = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  var out = [];
  lista.forEach(function (n) {
    n = _testo(n);
    if (n && out.indexOf(n) < 0) out.push(n);
  });
  return out;
}

function _rispostaVuota(stato) {
  return { stato: stato || 'attesa', nota: '', propData: '', propOra: '', propTitolo: '', propDescrizione: '', quando: '' };
}

/* Stato del lavoro calcolato dalle risposte delle persone */
function statoComplessivo(j) {
  if (j.stato === 'fatto') return 'fatto';
  var stati = j.assegnati.map(function (n) { return (j.risposte[n] || {}).stato || 'attesa'; });
  if (!stati.length) return 'attesa';
  if (stati.indexOf('proposta') >= 0) return 'proposta';
  if (stati.indexOf('attesa') >= 0) return 'attesa';
  if (stati.every(function (s) { return s === 'rifiutato'; })) return 'rifiutato';
  return 'accettato';
}

/* Mette un lavoro nella forma giusta (anche quelli creati con la versione 1, a persona singola) */
function normalizza(j) {
  var vecchio = !j.risposte || j.risposte === '{}' ? j : null;
  if (!Array.isArray(j.assegnati)) j.assegnati = _nomi(j.assegnati != null && j.assegnati !== '' ? j.assegnati : j.assegnato);
  if (typeof j.risposte === 'string') {
    try { j.risposte = JSON.parse(j.risposte || '{}'); } catch (e) { j.risposte = {}; }
  }
  if (!j.risposte || typeof j.risposte !== 'object') j.risposte = {};
  j.assegnati.forEach(function (n) {
    if (j.risposte[n]) return;
    var r = _rispostaVuota(n === j.creatore ? 'accettato' : 'attesa');
    if (vecchio && j.assegnati.length === 1 && n !== j.creatore && j.stato && j.stato !== 'fatto') {
      r.stato = j.stato;
      r.nota = _testo(j.nota);
      r.propData = _testo(j.propData); r.propOra = _testo(j.propOra);
      r.propTitolo = _testo(j.propTitolo); r.propDescrizione = _testo(j.propDescrizione);
    }
    j.risposte[n] = r;
  });
  Object.keys(j.risposte).forEach(function (n) {
    if (j.assegnati.indexOf(n) < 0) delete j.risposte[n];
  });
  if (vecchio && j.assegnati.length === 1) j.nota = '';
  ['assegnato', 'propData', 'propOra', 'propTitolo', 'propDescrizione'].forEach(function (k) { delete j[k]; });
  j.durata = Number(j.durata) > 0 ? Math.round(Number(j.durata)) : 60;
  j.nota = _testo(j.nota);
  j.stato = statoComplessivo(j);
  return j;
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
      if (db.lavori[i].id === p.id) return normalizza(db.lavori[i]);
    }
    throw new Error('Lavoro non trovato: forse è stato eliminato. Aggiorna la pagina.');
  }
  function avvisa(a, tipo, lav) {
    if (a && a !== chi) notifiche.push({ a: a, tipo: tipo, id: lav.id });
  }
  function avvisaTutti(lav, tipo) {
    var tutti = [lav.creatore].concat(lav.assegnati);
    tutti.forEach(function (n, i) { if (tutti.indexOf(n) === i) avvisa(n, tipo, lav); });
  }
  function dataBella(d, o) {
    return d.split('-').reverse().join('/') + (o ? ' alle ' + o : '');
  }
  function durata(v) {
    var n = Number(v);
    return n > 0 ? Math.round(n) : 60;
  }
  function leggiCampi() {
    var a = _nomi(p.assegnati != null ? p.assegnati : p.assegnato);
    if (!_testo(p.titolo)) throw new Error('Scrivi cosa c\'è da fare');
    if (!_testo(p.data)) throw new Error('Scegli il giorno');
    if (!a.length) throw new Error('Scegli almeno una persona');
    return a;
  }
  function perChi(lav) {
    var altri = lav.assegnati.filter(function (n) { return n !== chi; });
    if (!altri.length) return 'per sé';
    return 'per ' + (lav.assegnati.indexOf(chi) >= 0 ? 'sé, ' : '') + altri.join(', ');
  }
  /* tutti tornano "in attesa" (chi ha creato il lavoro e chi è indicato in "tranne" restano com'erano) */
  function ripartiDaCapo(lav, tranne) {
    lav.assegnati.forEach(function (n) {
      if (n === tranne) return;
      lav.risposte[n] = _rispostaVuota(n === lav.creatore ? 'accettato' : 'attesa');
      if (n !== lav.creatore) avvisa(n, 'modificato', lav);
    });
  }

  switch (p.action) {
    case 'crea': {
      var assegnati = leggiCampi();
      j = {
        id: nuovoId(),
        titolo: _testo(p.titolo),
        descrizione: _testo(p.descrizione),
        data: _testo(p.data),
        ora: _testo(p.ora),
        durata: durata(p.durata),
        assegnati: assegnati,
        creatore: chi,
        stato: 'attesa',
        risposte: {},
        nota: '', eventoId: '', creato: adesso, aggiornato: adesso
      };
      assegnati.forEach(function (n) {
        j.risposte[n] = _rispostaVuota(n === chi ? 'accettato' : 'attesa');
        avvisa(n, 'nuovo', j);
      });
      db.lavori.push(j);
      log(j, 'ha creato il lavoro', perChi(j));
      calendario = 'salva';
      break;
    }

    case 'modifica': {
      j = trova();
      if (chi !== j.creatore) throw new Error('Solo ' + j.creatore + ' può modificare questo lavoro');
      var nuovi = leggiCampi();
      var tolti = j.assegnati.filter(function (n) { return nuovi.indexOf(n) < 0; });
      j.titolo = _testo(p.titolo);
      j.descrizione = _testo(p.descrizione);
      j.data = _testo(p.data);
      j.ora = _testo(p.ora);
      j.durata = durata(p.durata);
      j.assegnati = nuovi;
      j.risposte = {};
      j.nota = '';
      if (j.stato === 'fatto') j.stato = '';
      nuovi.forEach(function (n) {
        j.risposte[n] = _rispostaVuota(n === chi ? 'accettato' : 'attesa');
        avvisa(n, 'modificato', j);
      });
      tolti.forEach(function (n) { avvisa(n, 'tolto', j); });
      log(j, 'ha modificato il lavoro', perChi(j));
      calendario = 'salva';
      break;
    }

    case 'rispondi': {
      j = trova();
      if (j.assegnati.indexOf(chi) < 0) throw new Error('Questo lavoro non è per te');
      if (chi === j.creatore) throw new Error('L\'hai creato tu: per cambiarlo usa "Modifica lavoro"');
      if (j.stato === 'fatto') throw new Error('Il lavoro è già fatto');
      var r = _rispostaVuota();
      r.nota = _testo(p.nota);
      r.quando = adesso;
      if (p.tipo === 'accetta') {
        r.stato = 'accettato';
        log(j, 'ha accettato', r.nota);
      } else if (p.tipo === 'rifiuta') {
        r.stato = 'rifiutato';
        log(j, 'non può farlo', r.nota);
      } else if (p.tipo === 'data') {
        if (!_testo(p.propData)) throw new Error('Scegli il nuovo giorno');
        r.stato = 'proposta';
        r.propData = _testo(p.propData);
        r.propOra = _testo(p.propOra);
        log(j, 'propone un altro giorno', dataBella(r.propData, r.propOra) + (r.nota ? ' — ' + r.nota : ''));
      } else if (p.tipo === 'modifica') {
        var t = _testo(p.propTitolo);
        var d = _testo(p.propDescrizione);
        if (!t) throw new Error('Il titolo non può essere vuoto');
        if (t === j.titolo && d === j.descrizione) throw new Error('Non hai cambiato niente');
        r.stato = 'proposta';
        r.propTitolo = t;
        r.propDescrizione = d;
        log(j, 'propone una modifica', r.nota);
      } else {
        throw new Error('Risposta non valida');
      }
      j.risposte[chi] = r;
      avvisa(j.creatore, p.tipo, j);
      calendario = 'salva';
      break;
    }

    case 'decidi': {
      j = trova();
      if (chi !== j.creatore) throw new Error('Solo ' + j.creatore + ' può decidere sulla proposta');
      var proponenti = j.assegnati.filter(function (n) { return j.risposte[n].stato === 'proposta'; });
      var chiPropone = _testo(p.persona) || (proponenti.length === 1 ? proponenti[0] : '');
      var rp = chiPropone && j.risposte[chiPropone];
      if (!rp || rp.stato !== 'proposta') throw new Error('Non c\'è nessuna proposta da valutare');
      if (p.approva) {
        var cambiato = false;
        if (rp.propData) {
          cambiato = rp.propData !== j.data || rp.propOra !== j.ora;
          j.data = rp.propData; j.ora = rp.propOra;
        }
        if (rp.propTitolo) {
          cambiato = cambiato || rp.propTitolo !== j.titolo || rp.propDescrizione !== j.descrizione;
          j.titolo = rp.propTitolo; j.descrizione = rp.propDescrizione;
        }
        j.risposte[chiPropone] = _rispostaVuota('accettato');
        j.risposte[chiPropone].quando = adesso;
        // se il lavoro è cambiato, chi aveva già risposto deve riconfermare (le altre proposte restano)
        if (cambiato) {
          j.assegnati.forEach(function (n) {
            if (n === chiPropone || n === j.creatore || j.risposte[n].stato === 'proposta') return;
            j.risposte[n] = _rispostaVuota('attesa');
            avvisa(n, 'modificato', j);
          });
        }
        log(j, 'ha accettato la proposta di ' + chiPropone, _testo(p.nota));
        avvisa(chiPropone, 'approvata', j);
      } else {
        j.risposte[chiPropone] = _rispostaVuota('attesa');
        log(j, 'non ha accettato la proposta di ' + chiPropone, _testo(p.nota));
        avvisa(chiPropone, 'respinta', j);
      }
      j.nota = _testo(p.nota);
      calendario = 'salva';
      break;
    }

    case 'fatto':
      j = trova();
      if (chi !== j.creatore && j.assegnati.indexOf(chi) < 0) throw new Error('Non è un tuo lavoro');
      j.stato = 'fatto';
      log(j, 'ha segnato come fatto', '');
      avvisaTutti(j, 'fatto');
      calendario = 'salva';
      break;

    case 'riapri':
      j = trova();
      if (chi !== j.creatore && j.assegnati.indexOf(chi) < 0) throw new Error('Non è un tuo lavoro');
      j.stato = '';
      log(j, 'ha riaperto il lavoro', '');
      calendario = 'salva';
      break;

    case 'elimina':
      j = trova();
      if (chi !== j.creatore) throw new Error('Solo ' + j.creatore + ' può eliminarlo');
      db.lavori.splice(db.lavori.indexOf(j), 1);
      log(j, 'ha eliminato il lavoro', '');
      avvisaTutti(j, 'eliminato');
      calendario = 'elimina';
      break;

    default:
      throw new Error('Azione sconosciuta');
  }

  j.stato = statoComplessivo(j);
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

var CAMPI = ['id', 'titolo', 'descrizione', 'data', 'ora', 'durata', 'assegnati', 'creatore', 'stato',
  'risposte', 'nota', 'eventoId', 'creato', 'aggiornato'];
var INTESTAZIONI = ['ID', 'Titolo', 'Descrizione', 'Data', 'Ora', 'Durata (min)', 'Per chi', 'Creato da', 'Stato',
  'Risposte (non toccare)', 'Nota', 'ID evento calendario', 'Creato il', 'Aggiornato il'];
// nomi delle colonne riconosciuti, anche quelli della versione 1 (lavori per una sola persona)
var COLONNE = {
  'ID': 'id', 'Titolo': 'titolo', 'Descrizione': 'descrizione', 'Data': 'data', 'Ora': 'ora', 'Durata (min)': 'durata',
  'Per chi': 'assegnati', 'Creato da': 'creatore', 'Stato': 'stato', 'Risposte (non toccare)': 'risposte', 'Risposte': 'risposte',
  'Proposta: giorno': 'propData', 'Proposta: ora': 'propOra', 'Proposta: titolo': 'propTitolo', 'Proposta: dettagli': 'propDescrizione',
  'Nota': 'nota', 'ID evento calendario': 'eventoId', 'Creato il': 'creato', 'Aggiornato il': 'aggiornato'
};
var CAMPI_STORICO = ['quando', 'id', 'titolo', 'chi', 'azione', 'dettaglio'];
var INTESTAZIONI_STORICO = ['Quando', 'ID lavoro', 'Lavoro', 'Chi', 'Azione', 'Dettaglio'];

var ICONE = { attesa: '⏳', accettato: '✅', rifiutato: '❌', proposta: '🔄', fatto: '✔️' };
var NOMI_STATO = { attesa: 'In attesa di risposta', accettato: 'Accettato', rifiutato: 'Non può', proposta: 'Propone una modifica', fatto: 'Fatto' };

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

  var lav = ss.getSheetByName(FOGLIO_LAVORI);
  if (lav && lav.getLastRow() > 1) {
    scriviLavori_(leggiLavori_(lav, ss.getSpreadsheetTimeZone())); // converte i lavori esistenti
  } else {
    lav = preparaFoglio_(ss, FOGLIO_LAVORI, INTESTAZIONI);
  }
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
    lavori: leggiLavori_(ss.getSheetByName(FOGLIO_LAVORI), tz),
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

/* Legge i lavori in base ai nomi delle colonne, così funziona anche col foglio della versione 1 */
function leggiLavori_(sh, tz) {
  if (!sh || sh.getLastRow() < 2) return [];
  var n = sh.getLastColumn();
  var righe = sh.getRange(1, 1, sh.getLastRow(), n).getValues();
  var campi = righe[0].map(function (h) { return COLONNE[String(h).trim()] || ''; });
  return righe.slice(1).map(function (r) {
    var o = {};
    campi.forEach(function (c, i) {
      if (c && (o[c] === undefined || o[c] === '')) o[c] = valore_(r[i], c, tz);
    });
    return o;
  }).filter(function (l) { return l.id; }).map(normalizza);
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
  var colonne = Math.max(sh.getLastColumn(), CAMPI.length);
  var vecchie = Math.max(sh.getLastRow() - 1, 0);
  if (vecchie) sh.getRange(2, 1, vecchie, colonne).clearContent();
  if (colonne > CAMPI.length) sh.getRange(1, CAMPI.length + 1, 1, colonne - CAMPI.length).clearContent();
  sh.getRange(1, 1, 1, CAMPI.length).setValues([INTESTAZIONI]);
  if (!lavori.length) return;
  var righe = lavori.map(function (l) {
    return CAMPI.map(function (c) {
      if (c === 'assegnati') return (l.assegnati || []).join(', ');
      if (c === 'risposte') return JSON.stringify(l.risposte || {});
      return l[c] == null ? '' : String(l[c]);
    });
  });
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
  var t = (ICONE[l.stato] || '') + ' ' + l.titolo + ' · ' + l.assegnati.join(', ');
  var conData = l.assegnati.filter(function (n) { return l.risposte[n].stato === 'proposta' && l.risposte[n].propData; });
  if (l.stato === 'proposta' && conData.length) t += ' (' + conData[0] + ' propone ' + l.risposte[conData[0]].propData.split('-').reverse().slice(0, 2).join('/') + ')';
  return t;
}

function descrizioneEvento_(l) {
  var link = impostazioni_()['Link app'];
  var righe = [];
  if (l.descrizione) righe.push(l.descrizione, '');
  righe.push('Stato: ' + (NOMI_STATO[l.stato] || l.stato));
  righe.push('Creato da: ' + l.creatore);
  l.assegnati.forEach(function (n) {
    var r = l.risposte[n];
    righe.push('• ' + n + ': ' + (ICONE[r.stato] || '') + ' ' + (NOMI_STATO[r.stato] || r.stato) + (r.nota ? ' — ' + r.nota : ''));
  });
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
    MailApp.sendEmail({ to: a, subject: t.oggetto, htmlBody: htmlEmail_(t, r.lavoro, imp['Link app'], chi), name: 'Lavori di casa' });
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
    eliminato: ['🗑️ Lavoro annullato: ' + l.titolo, chi + ' ha eliminato questo lavoro: non serve più farlo.'],
    tolto: ['👋 Non sei più in questo lavoro: ' + l.titolo, chi + ' ha cambiato le persone del lavoro: non tocca più a te.']
  }[tipo] || ['Lavori di casa: ' + l.titolo, 'Novità su un lavoro.'];
  return { oggetto: T[0], intro: T[1] };
}

function htmlEmail_(t, l, link, chi) {
  function e(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
  var quando = l.data.split('-').reverse().join('/') + (l.ora ? ' alle ' + l.ora : '');
  var prop = '', nota = l.nota;
  var r = l.risposte && l.risposte[chi];
  if (r) {
    nota = r.nota;
    if (r.propData) prop += '<p><b>Nuovo giorno proposto:</b> ' + e(r.propData.split('-').reverse().join('/') + (r.propOra ? ' alle ' + r.propOra : '')) + '</p>';
    if (r.propTitolo) prop += '<p><b>Nuova versione:</b> ' + e(r.propTitolo) + (r.propDescrizione ? '<br>' + e(r.propDescrizione) : '') + '</p>';
  }
  return '<div style="font-family:Arial,sans-serif;max-width:520px;color:#1d2230">' +
    '<p>' + e(t.intro) + '</p>' +
    '<div style="background:#f3f4f8;border-radius:12px;padding:14px 16px;margin:12px 0">' +
    '<div style="font-size:18px;font-weight:bold">' + e(l.titolo) + '</div>' +
    '<div style="color:#5b6275;margin-top:4px">📅 ' + e(quando) + ' · per ' + e(l.assegnati.join(', ')) + '</div>' +
    (l.descrizione ? '<p>' + e(l.descrizione) + '</p>' : '') + prop +
    (nota ? '<p style="font-style:italic">“' + e(nota) + '”</p>' : '') +
    '</div>' +
    (link ? '<p><a href="' + link + '" style="display:inline-block;background:#7c8cff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Apri l\'app e rispondi</a></p>' : '') +
    '</div>';
}

function emailDiProva() {
  var me = Session.getActiveUser().getEmail();
  MailApp.sendEmail({ to: me, subject: '📋 Prova di Lavori di casa', htmlBody: '<p>Le email funzionano 👍</p>', name: 'Lavori di casa' });
  try { SpreadsheetApp.getUi().alert('Email mandata a ' + me); } catch (e) { Logger.log(me); }
}
