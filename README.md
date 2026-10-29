# 🏠 Lavori di casa · v2.2

App semplice per dividere i lavori di casa in famiglia.

- 🗓️ **Calendario in primo piano**: in ogni giorno vedi i lavori (con la loro emoji) e i pallini di chi è libero.
- 🙋 **Giorni liberi**: ognuno segna la sua settimana tipo (☀️ tutto il giorno, 🌅 mattina, 🌇 pomeriggio, ❌ no) e può cambiare un singolo giorno.
- ➕ **Nuovo lavoro**: emoji, cosa fare, giorno, quando (in giornata / mattina / pomeriggio / a un'ora) e per chi. Accanto a ogni persona vedi se quel giorno è libera.
- ✅ ❌ 📅 **Risposte**: ognuno dice *Ci sto*, *Non posso* o propone *Un altro giorno*. Chi ha creato il lavoro lo sposta con un tocco.
- ✔️ Alla fine si segna **fatto**.
- 💡 **Progetti**: la lista comune dei lavori da fare per la casa, **senza data**. Ognuno può aggiungere note, foto, scontrini/PDF e le spese (cosa, quanti, prezzo, dove) con il totale. Quando si decide, **📅 Programma**: si sceglie solo il giorno e chi partecipa, il resto è già compilato. Anche dal ＋ normale si può scegliere un progetto dalla tendina.
- 🧰 **Attrezzi**: la nota veloce di attrezzi, utensili e cose che servono, di tutta la famiglia. Scrivi nella casella e premi invio (o ＋): più cose insieme separate da virgola, es. *viti, trapano, nastro*. Tocca una cosa per segnarla presa, **Svuota** toglie quelle prese. Si vede subito, anche prima che il foglio risponda.
- 💸 **Spese in Gestione Casa** (dal 2027): ogni articolo con un prezzo aggiunto a un progetto arriva da solo in Gestione Casa, categoria 💡 Progetti casa, voce "Materiale per lavori".
- 🔔 **Promemoria** nel calendario Google "Lavori di casa": il giorno prima alle 8 e 2 ore prima, sempre tra le 8 e le 22.
- 📧 Email solo per lavori nuovi, spostati, eliminati e per le risposte (si possono spegnere).
- 🎨 Chiara o scura: segue il telefono, oppure la scegli dalle impostazioni.

I dati stanno solo nel foglio Google, protetto dal PIN di famiglia: in questo repository non c'è nessun dato.

## File

| File | Cosa fa |
|---|---|
| `index.html`, `style.css`, `app.js` | L'app |
| `logica.js` | Le regole (le stesse usate dal foglio) |
| `manifest.json`, `sw.js`, icone | Installazione sul telefono |
| `apps-script/Codice.gs` | Il codice da incollare nell'Apps Script del foglio |

## Messa in funzione

1. Crea un foglio Google vuoto chiamato **Lavori di casa**.
2. **Estensioni → Apps Script**, cancella tutto e incolla `apps-script/Codice.gs`. Salva.
3. Scegli la funzione **setup** e premi **Esegui**; concedi i permessi (foglio, calendario, email).
4. Nel foglio: scheda **Persone** → nomi ed email; scheda **Impostazioni** → cambia il PIN e incolla il link dell'app.
5. **Esegui il deployment → Nuovo deployment → App web**: esegui come *Me*, accesso *Chiunque*. Copia il link.
6. Nell'app: tocca il cerchio in alto a destra, incolla il link e il PIN, scegli chi sei.
7. Dalle impostazioni tocca **Copia il link per la famiglia** e mandalo nel gruppo: aprendolo, l'app si collega da sola.
8. In Google Calendar → impostazioni del calendario "Lavori di casa" → **Condividi con persone specifiche** (mamma e sorella).

## 💡 Aggiornare a v2.1 (Progetti) un foglio già in uso

1. **Estensioni → Apps Script**: sostituisci tutto con il nuovo `apps-script/Codice.gs` e salva.
2. Scegli la funzione **preparaProgetti** e premi **Esegui**: Google chiede il permesso per **Drive** (serve per foto e scontrini). Crea la scheda **Progetti** e la cartella Drive *Lavori di casa - Progetti*.
3. **Esegui il deployment → Gestisci deployment → Modifica → Nuova versione** (il link resta uguale).

Le foto e i documenti stanno su Drive, visibili solo a chi ha il link del file (serve per vederli nell'app).

## 🧰 Aggiornare a v2.2 (Attrezzi) un foglio già in uso

1. **Estensioni → Apps Script**: sostituisci tutto con il nuovo `apps-script/Codice.gs` e salva.
2. **Esegui il deployment → Gestisci deployment → Modifica → Nuova versione** (il link resta uguale).

La scheda **Attrezzi** del foglio si crea da sola alla prima volta che l'app parla col foglio.

## 🔔 Promemoria per mamma e sorella

Sul calendario condiviso Google usa le notifiche di ognuno, quindi vanno impostate una volta sola dal loro telefono:

1. App **Google Calendar** → ☰ → **Impostazioni** → **Lavori di casa**.
2. **Notifiche evento**: aggiungi *2 ore prima*.
3. **Notifiche eventi di tutto il giorno**: aggiungi *1 giorno prima alle 08:00*.

## Aggiornamenti

- Cambi all'app: aumenta `CACHE` in `sw.js`.
- Cambi a `Codice.gs`: Esegui il deployment → Gestisci deployment → Modifica → **Nuova versione** (il link resta uguale).
