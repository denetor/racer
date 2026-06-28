# PRD — Overlay di debug fisica sul veicolo

## Problem Statement

Mentre guido nel modello fisico force-based, fatico a capire *perché* l'auto si comporta in un certo
modo: dove si concentra il carico durante accelerazione/frenata/curva, quanto margine di aderenza
resta a ogni ruota, in che direzione e con che intensità ogni gomma sta spingendo, e quale ruota sta
saturando il cerchio di attrito. L'HUD testuale esistente (`PhysicsDebugHud`) mostra numeri per
ruota, ma non li colloca **spazialmente** sul veicolo: devo tradurre mentalmente i valori in geometria
mentre l'auto si muove e ruota. Per tarare le costanti di guida (wheelspin, sovrasterzo in curva,
trasferimento di carico) mi serve vedere le forze e il trasferimento di carico **disegnati sopra
l'auto**, allineati alle ruote e al telaio.

## Solution

Un overlay grafico di debug, attivabile/disattivabile con un tasto, disegnato in sovrimpressione al
veicolo (attaccato ad esso, ruota con esso) che mostra:

- una **croce sottile** centrata sul centro di gravità (COG) statico del veicolo, estesa sulla sagoma
  (una linea lungo l'asse longitudinale, una lungo il trasversale);
- un **pallino** posizionato sul baricentro del carico attuale (dove "si sposta" virtualmente il COG
  per effetto dei trasferimenti di carico): a riposo coincide con la croce, in accelerazione si sposta
  verso il retro, in frenata verso l'avantreno, in curva verso le ruote esterne;
- per ogni ruota, il **cerchio di attrito** corrente (raggio `μ·Fz`) centrato sulla ruota, che cresce
  o si stringe col carico dinamico;
- per ogni ruota, **due linee** che rappresentano le componenti longitudinale e laterale della forza
  della gomma; per le ruote sterzanti gli assi (e quindi le linee) ruotano con l'angolo di sterzo.

Quando la risultante delle due componenti di forza tocca il bordo del cerchio, la gomma è satura: la
saturazione si legge a colpo d'occhio dalla geometria e, in più, cerchio e linee della ruota
interessata cambiano colore (arancione in wheelspin, rosso in lockup). Tutti gli elementi usano il
colore base giallo dei testi del widget di debug fisica.

Lo stesso tasto commuta insieme l'overlay grafico e l'HUD testuale esistente, come unico interruttore
di debug. All'avvio entrambi sono accesi.

## User Stories

1. Come pilota in fase di tuning, voglio attivare/disattivare l'overlay di debug con un solo tasto,
   così da alternare rapidamente vista pulita e vista diagnostica mentre guido.
2. Come pilota, voglio che lo stesso tasto commuti sia l'overlay grafico sia l'HUD testuale, così da
   avere un unico interruttore per tutto il debug a schermo.
3. Come pilota, voglio che l'overlay resti attaccato al veicolo e ruoti con esso, così da leggere i
   dati nel sistema di riferimento dell'auto senza ricalcoli mentali.
4. Come pilota, voglio vedere una croce sottile sul COG statico estesa sulla sagoma, così da avere un
   riferimento fisso del centro geometrico/di massa dell'auto.
5. Come pilota, voglio un pallino sul baricentro del carico attuale, così da vedere in tempo reale
   dove si concentra il peso durante le manovre.
6. Come pilota, voglio che il pallino coincida con la croce a vettura ferma, così da fidarmi che il
   riferimento sia corretto quando non ci sono trasferimenti di carico.
7. Come pilota, voglio che il pallino si sposti verso il retro in accelerazione, verso l'avantreno in
   frenata e verso l'esterno in curva, così da correlare visivamente input e trasferimento di carico.
8. Come pilota, voglio un cerchio di attrito per ogni ruota centrato sulla ruota, così da vedere il
   limite di forza disponibile su quel pneumatico.
9. Come pilota, voglio che il cerchio cresca/si stringa col carico dinamico della ruota, così da
   percepire il trasferimento di carico anche dal raggio del cerchio.
10. Come pilota, voglio due linee per ruota che mostrino le componenti longitudinale e laterale della
    forza, così da capire come la gomma sta spingendo.
11. Come pilota, voglio che le linee di forza delle ruote anteriori ruotino con l'angolo di sterzo,
    così che riflettano l'orientamento reale della ruota sterzata.
12. Come pilota, voglio leggere la saturazione dal fatto che la risultante delle forze raggiunge il
    bordo del cerchio, così da diagnosticare il limite di aderenza senza guardare numeri.
13. Come pilota, voglio che cerchio e linee della ruota diventino arancioni in wheelspin e rossi in
    lockup, così da distinguere a colpo d'occhio il tipo di scivolamento longitudinale.
14. Come pilota, voglio che tutti gli elementi usino il colore base giallo del widget di debug, così
    da avere coerenza visiva con l'HUD testuale.
15. Come pilota, voglio le linee di forza sottili e senza freccia, con il verso dato dalla posizione
    rispetto al centro ruota, per un disegno pulito e leggibile.
16. Come pilota, voglio poter tarare la scala Newton→pixel e il guadagno del pallino tramite costanti,
    così da adattare la leggibilità senza riscrivere codice.
17. Come sviluppatore, voglio che la matematica dell'overlay (baricentro del carico, scala delle
    forze, raggio del cerchio, trasformazioni di frame) viva in funzioni pure testabili, così da
    verificarla a banco senza avviare il gioco.
18. Come sviluppatore, voglio che l'overlay sia disaccoppiato dalla logica di guida del veicolo (un
    component dato + un system per il toggle + un attore di rendering), così da rispettare il pattern
    ECS del progetto.
19. Come sviluppatore, voglio che l'overlay si attacchi automaticamente a ogni veicolo fisico, così
    che le future auto IA lo ereditino senza modifiche.
20. Come sviluppatore, voglio che da spento l'overlay salti il calcolo per-frame, così da non pagare
    costo quando non è visibile.
21. Come manutentore, voglio che il colore base e i colori di saturazione siano costanti condivise tra
    HUD e overlay, così da evitare duplicazioni e divergenze.
22. Come manutentore, voglio che il commit includa i baseline Playwright rigenerati, così che la suite
    di screenshot resti verde dopo l'aggiunta dell'overlay.
23. Come pilota, voglio che a vettura ferma l'overlay mostri un'immagine deterministica (croce e
    pallino sovrapposti, quattro cerchi al carico statico, nessuna linea di forza), così che lo stato
    iniziale sia stabile e prevedibile.

## Implementation Decisions

### Architettura (ECS leggero)
- **`DebugOverlayComponent`** — component di solo dato: un flag `visible: boolean`. Posto sugli attori
  puramente grafici da commutare (l'attore overlay del veicolo e l'HUD testuale), **non** sullo sprite
  dell'auto.
- **`DebugOverlaySystem`** — system con la sola logica di toggle: legge il tasto con `wasPressed`,
  ribalta `visible` su tutte le entità con il component e ne allinea la visibilità del rendering. Non
  esegue calcoli di disegno.
- **`VehicleDebugOverlay`** — child Actor del veicolo con un `Canvas` graphic che, nel proprio draw
  callback, esegue calcolo + disegno chiamando le funzioni pure del service. Disegna nel frame locale
  dello sprite, ereditando posizione e rotazione dal veicolo (nessuna proiezione mondo→schermo).
- Vincolo accettato: in Excalibur il blit finale passa comunque da un `Canvas` su un Actor; il system
  non disegna direttamente.

### Modulo puro di calcolo (deep module, testabile)
Funzioni pure framework-agnostiche (in `vehicle-physics.service` o un nuovo `vehicle-debug.service`):
- **`loadCentroid(posizioniRuote, loads) → punto`** — baricentro del carico:
  `Σ(pos_i·load_i)/Σload_i`. A riposo coincide con il COG statico.
- **`frictionCircleRadiusPx(muEff, fz, scala) → raggio`** — raggio del cerchio di attrito in px.
- **`forceEndpointsLocal(fx, fy, delta, scala) → estremi linee`** — estremi delle due componenti di
  forza in coordinate locali, con rotazione di `delta` per le ruote sterzanti.
- **Trasformazione body→locale**: `local.x = body.y`, `local.y = -body.x` (inverso di `localToBody`).
- L'attore overlay è una shell sottile sopra questo modulo: prende lo stato del veicolo, chiama gli
  helper, disegna le primitive.

### Dati e modello fisico
- **`WheelState`**: aggiungere `lateralForce: number` (componente laterale **nel frame ruota**,
  pre-rotazione di δ), simmetrico a `longitudinalForce` già presente.
- **`PhysicDriveUpdateSystem`**: dopo il clamp del cerchio di attrito, scrivere
  `wheelState.lateralForce = clamped.fy` (la `clamped.fx` è già salvata in `longitudinalForce`).
- Il cerchio usa `μ_eff = gripSurface · wear` e `Fz = load`, già disponibili su `WheelState`.

### Scala e geometria
- **Scala unica condivisa** `PX_PER_NEWTON` (default ~0.013) per cerchio **e** linee: il raggio è
  `μ_eff·Fz·scala`, le lunghezze linee sono `|componente|·scala`. La risultante che tocca il bordo
  indica saturazione.
- **Pallino**: posizione `centroid_statico + DOT_GAIN·(centroid_dinamico − centroid_statico)`, con
  `DOT_GAIN` default 1 (1:1, tarabile).
- **Croce**: estesa alla sagoma del veicolo (linea longitudinale ~±60px, trasversale ~±35px in px
  locali), incrocio sul COG statico.
- **Linee di forza**: segmenti sottili dal centro ruota, senza freccia; verso dato dal segno della
  componente; per le anteriori gli assi ruotano di `steeringAngle`.

### Input
- Nuova azione canonica **`ToggleDebugOverlay`** in `Keybindings` enum + mapping in
  `KeybindingsService` su **`Keys.KeyD`** (tasto `D`).

### Colori
- Estrarre in un modulo condiviso il colore base `COLOR_NORMAL` (giallo) e i colori di saturazione
  `COLOR_WHEELSPIN` (arancione) e `COLOR_SATURATED` (rosso), oggi privati in `physics-debug-hud`.
- Croce, pallino e default in giallo; cerchio e linee della singola ruota in arancione su `wheelspin`,
  rosso su `lockup`.

### Scope di attaccamento e scena
- Component + child overlay aggiunti in `PhysicVehicleActor.onInitialize` → tutti i veicoli fisici.
- `PhysicsDebugHud` riceve anch'esso un `DebugOverlayComponent` per essere commutato dallo stesso
  system.
- `PhysicsPlaygroundScene` registra il `DebugOverlaySystem`.
- Stato di default **ON** all'avvio (`visible = true`); il primo `D` spegne.

### Impatto sul baseline
- Con default ON l'overlay compare negli screenshot della scena baseline → rigenerare i baseline
  Playwright (`npm run test:integration-update`) e committare i nuovi PNG. L'immagine a vettura ferma è
  deterministica.

## Testing Decisions

- **Cosa rende buono un test**: verifica solo il **comportamento esterno** (input → output) delle
  funzioni pure, non i dettagli di implementazione né il rendering. Coerente con la convenzione del
  progetto: si automatizzano solo le funzioni pure; il risultato visivo lo verifica l'utente a video.
- **Moduli sotto test (unit, Jest)**: le funzioni pure del modulo di calcolo —
  - `loadCentroid`: a carichi uguali → centro statico; carico spostato sul retro → centroide
    arretrato; somma pesi nulla → caso degenere gestito.
  - `frictionCircleRadiusPx`: proporzionalità a `μ_eff·Fz·scala`; zero a carico/μ nulli.
  - `forceEndpointsLocal`: componenti pure lungo gli assi; rotazione corretta degli estremi con
    `delta` per le ruote sterzanti; verso corretto col segno.
  - trasformazione body→locale: mappatura assi corretta.
- **Prior art**: `src/services/vehicle-physics.service.test.ts` (stessa forma — helper SI puri,
  framework-free, testati a banco).
- **Non testati automaticamente**: l'attore `VehicleDebugOverlay` (disegno su Canvas), il
  `DebugOverlaySystem` (input/visibilità) e l'aspetto grafico — verificati manualmente a video e,
  per la non-regressione dello stato iniziale, dagli screenshot Playwright rigenerati.

## Out of Scope

- Modifiche al comportamento della fisica di guida (l'unica aggiunta è esporre `lateralForce`; nessun
  cambiamento alle forze applicate).
- Frecce/etichette/legende testuali sulle linee di forza; rappresentazione della forza risultante come
  vettore unico (si disegnano solo le due componenti).
- Amplificazione di default del pallino (resta 1:1; il guadagno è solo una costante tarabile).
- Overlay nella vecchia scena cinematica `PlaygroundScene`/`VehicleActor` (fallback orfano).
- Toggle separati e indipendenti per overlay e HUD testuale (è un interruttore unico).
- UI di configurazione runtime delle costanti (`PX_PER_NEWTON`, `DOT_GAIN`, spessori): restano
  costanti nel codice.
- Persistenza dello stato del toggle tra sessioni.
- Visualizzazione di grandezze diverse da quelle elencate (es. slip angle, vettore velocità, traiettoria).

## Further Notes

- Frame di riferimento: body = (x avanti, y laterale); locale sprite (nose-up) = (forward `-y`,
  lateral `+x`). Le ruote posteriori hanno `δ = 0`.
- Default cosmetici proposti (tarabili): `PX_PER_NEWTON = 0.013`, `DOT_GAIN = 1`, spessore
  linee/croce/cerchio 1px, raggio pallino ~3px, `Canvas` del child dimensionato con margine (~240×240)
  per non clippare i cerchi che escono dalla sagoma.
- A vettura ferma le forze sono ≈ 0 → nessuna linea di forza; i cerchi sono al carico statico; croce e
  pallino coincidono: è lo stato che finirà nei baseline rigenerati.
- Origine delle decisioni: `resources/issues/0036-debug-lines/grill-me-out.md`. Specifiche del modello
  fisico di riferimento: `resources/issues/0031-new-physics/specs.md`.