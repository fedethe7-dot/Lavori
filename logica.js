/*
 * Lavori di casa v2 — le regole.
 * Questo file gira sia nell'app (modalità prova) sia nell'Apps Script del foglio.
 *
 * Lavoro:   per una o più persone, in un giorno, "in giornata", "mattina", "pomeriggio" o a un'ora precisa.
 * Risposte: ognuno (tranne chi l'ha creato) risponde  ok / no / altro (propone un altro giorno).
 * Giorni liberi: ognuno ha una settimana tipo (lun..dom) e può cambiare singoli giorni (eccezioni).
 *   valori: 'tutto' | 'mattina' | 'pomeriggio' | 'no' | '' (non detto)
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
  j.stato = statoLavoro(j);
  return j;
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
      durata: Number(p.durata) > 0 ? Math.round(Number(p.durata)) : 60, assegnati: _nomi(p.assegnati)
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applica: applica, normalizza: normalizza, statoLavoro: statoLavoro, libero: libero,
    liberaPer: liberaPer, fasciaLavoro: fasciaLavoro, giornoSett: giornoSett, FASCE: FASCE, ORE_FASCIA: ORE_FASCIA };
}
