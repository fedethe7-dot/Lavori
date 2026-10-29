'use strict';
/* =========================================================
   Lavori di casa — spese dei Progetti in Gestione Casa
   Dal 2027 ogni articolo con un prezzo aggiunto a un progetto
   diventa una spesa in Gestione Casa, categoria 🔨 Progetti casa
   (creata da sola se manca), voce generica "Materiale per lavori"
   (prezzo × quantità, data in cui è stato aggiunto).
   Paga chi paga di solito nella casa (si cambia poi in Gestione Casa).
   Se l'articolo o il progetto vengono tolti, la spesa sparisce anche là.
   Accesso: la sessione di Gestione Casa sullo stesso telefono oppure
   la chiave di sistema (quella dell'hub, o la chiave di famiglia di Lavori).
   ========================================================= */
const SpeseCasa = {
  URL: 'https://script.google.com/macros/s/AKfycbx_UKlBm4SKEYtPWrUO9bh1MuMBBKSzJbpgFQj1j9pbW5oFF3bkJL5DevaKj1rF537-wA/exec',
  DAL: '2027-01-01',
  CAT: { id: 'progetti', name: 'Progetti casa', emoji: '🔨', base: true },
  VOCE: 'Materiale per lavori',
  PREF: 'elav_',                       // id delle spese create da qui: elav_<id articolo>
  K_SESS: 'lavori2.gcSess', K_USATO: 'lavori2.gcUsato', K_FIRMA: 'lavori2.gcFirma',
  _busy: false, _again: false, _t: null,

  ls(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  raw(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } },

  voglio() {
    const out = {};
    (st.progetti || []).forEach(p => (p.articoli || []).forEach(a => {
      const c = Math.round((Number(a.prezzo) || 0) * (Number(a.qta) || 1) * 100), d = String(a.data || '').slice(0, 10);
      if (c > 0 && a.id && d >= this.DAL) out[this.PREF + a.id] = { cent: c, data: d, desc: this.VOCE };
    }));
    return out;
  },
  programma(ms = 2000) { clearTimeout(this._t); this._t = setTimeout(() => this.manda(), ms); },

  async api(action, dati, sess) {
    const r = await fetch(this.URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({}, dati || {}, { action, session: sess ? sess.session : undefined })) });
    const j = await r.json();
    if (!j.ok) { const e = new Error(j.error || 'ERRORE'); e.code = j.error || 'ERRORE'; throw e; }
    return j;
  },
  async sessione(nuova) {
    if (!nuova) {
      const s = this.ls(this.K_SESS) || this.ls('gestioneCasa.sessione');
      if (s && s.session) return s;
    }
    const k = this.raw('eco.chiave') || cfg.pin, chi = cfg.me || this.raw('eco.me');
    if (!k || !chi) throw new Error('CHIAVE');
    const j = await this.api('loginChiave', { chiave: k, chi });
    const s = { session: j.session, admin: j.admin, me: j.me };
    this.put(this.K_SESS, s);
    return s;
  },

  async manda() {
    if (!cfg.url) return;                                         // modalità prova: niente
    const voglio = this.voglio(), firma = JSON.stringify(voglio);
    if (!Object.keys(voglio).length && !this.ls(this.K_USATO)) return;   // prima del 2027 non serve fare niente
    if (firma === this.raw(this.K_FIRMA)) return;                   // nessuna spesa cambiata dall'ultima volta
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try {
      let sess = await this.sessione(), j;
      try { j = await this.api('load', {}, sess); }
      catch (e) {
        if (e.code !== 'NO_LOGIN' && e.code !== 'NON_AUTORIZZATO') throw e;
        try { localStorage.removeItem(this.K_SESS); } catch (er) { /* niente */ }
        sess = await this.sessione(true); j = await this.api('load', {}, sess);
      }
      const s = j.state || {}, set = s.settings;
      if (!set || !(set.houses || []).length) return;               // Gestione Casa non ancora preparata
      if (!(set.categories || []).some(c => c.id === this.CAT.id) && j.admin) {
        await this.api('saveSettings', { settings: Object.assign({}, set, { categories: (set.categories || []).concat([this.CAT]) }) }, sess);
      }
      const casa = set.houses.find(h => h.id === 'h_casa') || set.houses.find(h => /^casa$/i.test(String(h.name).trim())) || set.houses[0];
      const payer = casa.defaultPayer || (casa.members || [])[0] || j.me;
      const resto = Object.assign({}, voglio);
      const esistenti = (s.expenses || []).filter(x => String(x.id).startsWith(this.PREF));
      let n = 0;
      for (const x of esistenti) {
        const v = resto[x.id];
        if (!v) { await this.api('deleteExpense', { id: x.id }, sess); n++; continue; }
        delete resto[x.id];
        if (x.amount === v.cent && x.date === v.data && x.desc === v.desc) continue;
        const shares = x.amount === v.cent ? x.shares : { [x.payer]: v.cent };
        await this.api('saveExpense', { expense: Object.assign({}, x, { amount: v.cent, date: v.data, desc: v.desc, shares, updatedAt: Date.now() }) }, sess); n++;
      }
      for (const id of Object.keys(resto)) {
        const v = resto[id], now = Date.now();
        await this.api('saveExpense', { expense: { id, houseId: casa.id, amount: v.cent, cat: this.CAT.id, desc: v.desc, date: v.data,
          payer, shares: { [payer]: v.cent }, updatedAt: now, createdBy: j.me, createdAt: now } }, sess); n++;
      }
      this.put(this.K_USATO, Object.keys(voglio).length > 0);
      try { localStorage.setItem(this.K_FIRMA, firma); } catch (e) { /* niente */ }
      if (n) toast('💸 Spese aggiornate in Gestione Casa');
    } catch (e) {
      const m = e.message === 'CHIAVE' ? 'manca la chiave di sistema' : e.code === 'CHIAVE_ERRATA' ? 'la chiave non coincide'
        : e.code === 'TROPPI_TENTATIVI' ? 'troppi tentativi, riprova più tardi' : 'nessuna risposta, riprovo più tardi';
      toast('⚠️ Gestione Casa: ' + m, true);
    } finally {
      this._busy = false;
      if (this._again) { this._again = false; this.programma(500); }
    }
  }
};
