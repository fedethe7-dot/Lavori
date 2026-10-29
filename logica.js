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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applica: applica, normalizza: normalizza, statoLavoro: statoLavoro, libero: libero,
    liberaPer: liberaPer, fasciaLavoro: fasciaLavoro, giornoSett: giornoSett, FASCE: FASCE, ORE_FASCIA: ORE_FASCIA,
    normalizzaProgetto: normalizzaProgetto, applicaProgetto: applicaProgetto, totaleProgetto: totaleProgetto,
    applicaSpesa: applicaSpesa };
}
