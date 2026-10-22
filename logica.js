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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applica: applica, normalizza: normalizza, statoComplessivo: statoComplessivo, nuovoId: nuovoId, STATI_LAVORO: STATI_LAVORO };
}
