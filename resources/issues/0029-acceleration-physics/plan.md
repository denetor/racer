# Plan: Grip e traiettoria pilotati da `acceleration.y` (Issue #29)

> Source PRD: `resources/issues/0029-acceleration-physics/prd.md`

## Architectural decisions

Decisioni durevoli valide per tutte le fasi:

- **Sorgente del carico**: il trasferimento di carico longitudinale deriva dall'accelerazione
  reale `acceleration.y` (px/s²), non più dagli input dei pedali. Si usa il **valore istantaneo**
  del frame corrente (nessun lisciamento, nessuna variabile di stato persistente).
- **Normalizzazione**: `clamp(acceleration.y / accelerationFullScale, -1, 1)`, racchiusa in una
  funzione pura del servizio matematico.
- **Fondo scala**: `accelerationFullScale = 800`, proprietà di `VehicleActor`, unica sorgente di
  verità condivisa tra fisica e UI.
- **Segni**: `acceleration.y` usato grezzo, retromarcia inclusa (nessun caso speciale su
  `isReverse`).
- **Ordine di esecuzione**: il calcolo dell'accelerazione resta prima dell'applicazione della
  cinematica (dipendenza sul frame corrente).
- **Nomenclatura**: spariscono tutti i riferimenti a `weightTransfer`. Lessico nuovo:
  `longitudinalLoad` (carico), `loadTransferStrength` (guadagno), `accelerationFullScale`
  (fondo scala).
- **Testing**: solo funzioni pure del servizio matematico e UI di mapping; nessun nuovo test sul
  `system`. Ogni fase mantiene `npm run test:unit` verde (US 11, trasversale).
- **Out of scope**: carico laterale (`acceleration.x` resta 0), lisciamento, modifiche al modello
  di accelerazione/velocità, baseline screenshot.

---

## Phase 1: Helper puro `computeLongitudinalLoad` + test

**User stories**: 7

### What to build

Aggiunta puramente additiva al servizio matematico: una funzione pura che normalizza
l'accelerazione longitudinale in un carico in [-1, 1] dato un fondo scala
(`computeLongitudinalLoad(accelY, fullScale)`), con il relativo unit test. Nessun consumatore
viene ancora cablato: la fase è completa e verificabile in isolamento eseguendo gli unit test.

### Acceptance criteria

- [ ] Esiste una funzione pura che restituisce `accelY / fullScale` clampato a [-1, 1].
- [ ] Unit test dedicato che copre: segno preservato per accelerazione positiva e negativa;
      clamp a +1 e a -1 oltre il fondo scala; zero a accelerazione nulla; proporzionalità entro
      il range.
- [ ] I test seguono lo stile tabellare già usato per `computeLongitudinalAcceleration` e
      `computeGripFactors`.
- [ ] `npm run test:unit` verde; nessun comportamento di gioco modificato.

---

## Phase 2: Rewire della fisica su `acceleration.y`

**User stories**: 1, 2, 3, 4, 6, 9, 10

### What to build

Sostituzione end-to-end della grandezza che pilota il bilancio di grip. Lo stato del veicolo
perde le proprietà legate al weight transfer (`weightTransfer`, `weightTransferRate`),
rinomina il guadagno `weightTransferStrength` in `loadTransferStrength` (valore 0.4 invariato) e
acquisisce `accelerationFullScale = 800`. Il system di guida rimuove il passo di aggiornamento
del weight transfer e, nel calcolo della cinematica, ricava il carico longitudinale invocando
l'helper della Phase 1 sull'accelerazione corrente del veicolo e sul suo fondo scala, passandolo
al calcolo dei fattori di grip insieme a `loadTransferStrength`. La funzione dei fattori di grip
rinomina il primo parametro in `longitudinalLoad` (e la variabile interna in `effectiveLoad`),
con comportamento numerico invariato. Si puliscono gli import non più usati. Al termine il gioco
gira interamente su grip basato sull'accelerazione, senza alcun riferimento residuo a
`weightTransfer` in `VehicleActor` e `DriveInputSystem`.

### Acceptance criteria

- [ ] `VehicleActor` non contiene più `weightTransfer` né `weightTransferRate`.
- [ ] `weightTransferStrength` è rinominata in `loadTransferStrength` (default 0.4) e usata dal
      system.
- [ ] `VehicleActor` espone `accelerationFullScale` (default 800).
- [ ] `DriveInputSystem` non aggiorna più alcun weight transfer e calcola il carico via l'helper
      `computeLongitudinalLoad`, alimentando il calcolo dei fattori di grip.
- [ ] Il calcolo dell'accelerazione resta eseguito prima dell'applicazione della cinematica.
- [ ] `computeGripFactors` usa il parametro `longitudinalLoad`; il test esistente è aggiornato ai
      nuovi nomi/commenti con assert numerici invariati.
- [ ] Nessuna occorrenza della stringa `weightTransfer` in `VehicleActor` e `DriveInputSystem`.
- [ ] In gioco: frenando il grip si sposta sull'avantreno, accelerando sul retrotreno, a velocità
      massima il bilancio torna neutro.
- [ ] `npm run build` e `npm run test:unit` verdi.

---

## Phase 3: Deduplica del fondo scala lato UI

**User stories**: 5, 8

### What to build

Eliminazione della duplicazione del valore 800 tra fisica e UI. La funzione che mappa
l'accelerazione all'offset del puntino sull'indicatore di plancia riceve il fondo scala come
parametro anziché leggerlo da una costante di modulo; l'actor dell'indicatore legge il fondo
scala dalla proprietà del veicolo introdotta nella Phase 2. La costante locale `ACCEL_FULL_SCALE`
viene rimossa e i test della funzione di mapping aggiornati per passare il fondo scala. Al
termine esiste un'unica sorgente di verità per il fondo scala, condivisa tra fisica e UI.

### Acceptance criteria

- [ ] La funzione di mapping dell'accelerazione accetta il fondo scala come parametro.
- [ ] L'indicatore di accelerazione legge il fondo scala da `vehicle.accelerationFullScale`.
- [ ] La costante `ACCEL_FULL_SCALE` non esiste più nell'applet; il valore 800 non è duplicato.
- [ ] I test dell'indicatore passano il fondo scala, incluso il caso di clamp di un valore oltre
      il fondo scala.
- [ ] Indicatore e fisica usano lo stesso riferimento di fondo scala.
- [ ] `npm run test:unit` verde.

---

## Verifica finale

- `npm run build` + `npm run test:unit` verdi su tutte le fasi.
- Valutare a valle se la nuova dinamica modifica il rendering: in tal caso aggiornare le baseline
  degli screenshot (`npm run test:integration-update`) e committare i nuovi PNG. Non parte
  centrale del piano.