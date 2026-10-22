# Lavori di casa

App per dividere i lavori di casa in famiglia, collegata a Google Calendar.

- Chi crea un lavoro sceglie giorno, ora (facoltativa), dettagli e **per chi** è: una o più persone.
- Ognuna delle persone, per conto suo, può: **accettare**, **dire che non può**, **proporre un altro giorno** o **proporre una modifica**.
- Chi l'ha creato accetta o no la proposta. Alla fine si segna **fatto**.
- Ogni lavoro diventa un evento nel calendario Google **"Lavori di casa"** (colore = stato). Se lo sposti dal calendario, l'app se ne accorge.
- Avvisi via **email** a ogni novità, numerino sull'icona dell'app e cronologia di ogni lavoro.

I dati stanno solo nel foglio Google, protetto dal PIN di famiglia: in questo repository non c'è nessun dato.

## File

| File | Cosa fa |
|---|---|
| `index.html`, `style.css`, `app.js` | L'app |
| `logica.js` | Le regole dei lavori (le stesse usate dal foglio) |
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

## Aggiornamenti

- Cambi all'app: aumenta `CACHE` in `sw.js`.
- Cambi a `Codice.gs`: Esegui il deployment → Gestisci deployment → Modifica → **Nuova versione** (il link resta uguale).
