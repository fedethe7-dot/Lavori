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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applica: applica, nuovoId: nuovoId, STATI_LAVORO: STATI_LAVORO };
}
