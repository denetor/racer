# PRD — Step 1: Modello pneumatico lineare + blend a bassa velocità (fisica a 4 ruote, issue #31)

> Documento di requisiti per il **secondo step** della riscrittura del layer fisico del veicolo.
> Le decisioni qui formalizzate derivano dall'interview in `step01/grill-me-out.md`, dalle specifiche
> in `../specs.md` (in particolare §3.1, §3.6, §3.7, §3.10) e dal piano in `../plan-steps.md`.
> Applicazione: gioco di corse 2D top-down, framework **ExcaliburJS** (v0.32.0), TypeScript, Vite.
> Costruisce sull'impalcatura completata nello **Step 0** (`PhysicVehicleActor`, due system,
> `vehicle-physics.service`, `PhysicsPlaygroundScene`, HUD di debug).

## Problem Statement

Dopo lo Step 0 l'auto a fisica nuova si muove solo **in linea retta**: la propulsione "tracer"
esercita la catena longitudinale (gas/freno → `Fx` → integrazione SI → `actor.vel`), ma l'auto **non
curva**. Lo sterzo viene letto e smussato, fa ruotare visivamente le ruote anteriori, ma non genera
alcuna rotazione del corpo: `yawRate` è sempre 0 e la velocità laterale `v_y` è sempre 0.

Lo sviluppatore ha bisogno del **primo strato di fisica laterale reale**: un modello a 4 ruote in cui
la forza di curva **emerga** dallo slip angle di ciascuna gomma (non sia scriptata), con la velocità
di imbardata (`yawRate`) come **stato indipendente** dalla direzione della velocità — è questa
separazione a rendere possibili, negli step successivi, sovra/sottosterzo e scivolate. Il rischio è
la **stabilità numerica**: una fisica a forze con imbardata oscilla o "parte per la tangente" se
introdotta male, soprattutto a bassa velocità dove gli slip angle (quattro `atan2` di velocità quasi
nulle) diventano rumore. Serve quindi uno strato **lineare** (senza ancora il cerchio di aderenza) e
**stabile**, verificabile guidando, su cui i prossimi step innesteranno saturazione, carico statico e
trasferimento di carico.

## Solution

Costruire lo **Step 1**: sostituire la sola propulsione *laterale* con un vero **modello pneumatico
lineare a 4 ruote**, lasciando invariata la propulsione *longitudinale* tracer dello Step 0.

Concretamente:

- Ogni frame, per le quattro ruote si calcola la **velocità della singola gomma** (perché ogni ruota
  è in un punto diverso di un corpo che ruota), il suo **slip angle** e una **forza laterale lineare**
  `Fy = −Cα · α` (proporzionale allo slip, **senza** saturazione/cerchio).
- Le forze si sommano in **forza netta** (`Fx`, `Fy`) e **coppia di imbardata** `Mz`; l'integrazione
  a corpo rigido planare (§3.7, con i **termini incrociati** `v_y·ω` e `v_x·ω`) aggiorna `velBody` e
  `yawRate`; l'orientamento (`heading`) ruota di `ω·dt`.
- Sotto una **soglia di bassa velocità** si fonde gradualmente verso un modello **cinematico** (a
  bicicletta) e si scalano a zero le forze laterali, per evitare l'instabilità degli `atan2` quasi
  nulli: l'auto riparte da ferma e manovra in modo morbido.
- Tutta la matematica nuova vive come **funzioni pure** nel `vehicle-physics.service` (testabili a
  tavolino); l'orchestrazione nel `PhysicDriveUpdateSystem`; lo stato/datasheet sull'attore; l'HUD di
  debug cresce con `yawRate` e slip angle.

Il risultato è guidabile a mano: l'auto va dritta a sterzo 0, curva con raggio finito coerente, non
vibra da ferma, ed è stabile a velocità di crociera — pronto a ricevere il cerchio di aderenza nello
Step 2.

## User Stories

1. Come giocatore/tester, voglio che l'auto **curvi** quando sterzo, così da guidarla davvero lungo
   il tracciato invece di muovermi solo in linea retta.
2. Come giocatore/tester, voglio che a **sterzo 0 l'auto vada dritta** senza derivare da sola, così da
   avere una base di guida prevedibile.
3. Come giocatore/tester, voglio che la curva abbia un **raggio finito e coerente** con la velocità e
   l'angolo di sterzo, così da percepire una guida plausibile.
4. Come sviluppatore, voglio che la **velocità di imbardata** (`yawRate`) sia uno **stato
   indipendente** dalla direzione della velocità, così da rendere possibili negli step successivi
   sovra/sottosterzo e scivolate (che nascono dall'angolo tra muso e velocità).
5. Come sviluppatore, voglio che la **forza di curva emerga dallo slip angle** di ciascuna gomma e non
   sia scriptata, così da avere un comportamento fisico e non un trucco sul grip.
6. Come sviluppatore, voglio un **modello a 4 ruote** (non a bicicletta) fin da questo strato, così che
   la geometria e il grip per-ruota siano già al loro posto per gli step con superfici asimmetriche.
7. Come sviluppatore, voglio che la forza laterale sia **lineare** (`Fy = −Cα · α`, senza
   saturazione), così da isolare la stabilità del modello prima di introdurre il cerchio di aderenza.
8. Come sviluppatore, voglio l'integrazione a **corpo rigido planare con i termini incrociati**
   (`v̇_x = Fx/m + v_y·ω`, `v̇_y = Fy/m − v_x·ω`, `ω += (Mz/Iz)·dt`), così da simulare correttamente la
   dinamica rotatoria.
9. Come sviluppatore, voglio che la **coppia di imbardata** sia la somma dei momenti delle forze di
   ogni ruota rispetto al baricentro, così che la rotazione nasca dalla geometria reale dei bracci.
10. Come sviluppatore, voglio usare i **bracci `r_i`** già derivati (`wheelArmsBody`, in metri,
    frame-corpo, riferiti al baricentro), così da non duplicare la conversione geometria→fisica.
11. Come sviluppatore, voglio che lo **sterzo `δ`** si applichi **solo alle ruote anteriori** (le
    posteriori hanno `δ = 0`), riusando lo `steeringAngle` esistente.
12. Come sviluppatore, voglio che la **forza delle ruote anteriori sia ruotata di `δ`** prima di
    sommarla, così che la curva resti fedele anche a sterzo ampio (~23°).
13. Come giocatore/tester, voglio che da **ferma o lentissima** l'auto **non vibri** né "parta per la
    tangente", così da poter manovrare a bassa velocità senza artefatti.
14. Come giocatore/tester, voglio che a bassa velocità l'auto **sterzi comunque in modo morbido**, così
    che ripartire e fare manovre strette sia naturale.
15. Come sviluppatore, voglio un **blend graduale** tra modello dinamico e cinematico sotto una soglia
    di velocità condivisa, così da gestire l'instabilità dei quattro `atan2` quasi nulli.
16. Come sviluppatore, voglio mantenere la **propulsione longitudinale tracer** dello Step 0 (gas/freno
    → `Fx` al baricentro, attrito lineare), così da non mescolare il motore reale (Step 4) con
    l'introduzione della fisica laterale.
17. Come sviluppatore, voglio che la **spinta in avanti agisca al baricentro** e non generi coppia di
    imbardata, così che la rotazione dell'auto in questo step dipenda solo dalle forze laterali delle
    gomme.
18. Come sviluppatore, voglio che l'auto abbia un **leggero sottosterzo** di partenza (gomme posteriori
    che mordono più delle anteriori), così da avere un comportamento stabile e sicuro da tarare.
19. Come sviluppatore/tester, voglio poter **regolare a mano** il morso laterale anteriore/posteriore e
    i parametri del blend, così da rifinire la sensazione di guida provando.
20. Come sviluppatore, voglio che le **funzioni di fisica nuove siano pure** e raccolte nel
    `vehicle-physics.service`, così da testarle a tavolino indipendentemente da Excalibur.
21. Come sviluppatore, voglio una funzione pura per la **velocità della singola ruota** dato il moto
    del corpo e il braccio `r_i`, così da derivarla in modo testabile.
22. Come sviluppatore, voglio una funzione pura per lo **slip angle** della ruota, così da isolarne il
    calcolo (incluso il sottrarre `δ`).
23. Come sviluppatore, voglio una funzione pura per la **forza laterale lineare** dato lo slip e `Cα`,
    così da testarne il segno e la proporzionalità.
24. Come sviluppatore, voglio una funzione pura per il **passo di integrazione a corpo rigido**
    (termini incrociati), così da verificarne il comportamento su casi noti.
25. Come sviluppatore, voglio una funzione pura per il **blend a bassa velocità**, così da testarne gli
    estremi (fermo → cinematico, sopra soglia → dinamico).
26. Come giocatore/tester, voglio che l'**HUD di debug** mostri la **velocità di rotazione** (`yawRate`)
    e lo **slip angle medio anteriore/posteriore** (in gradi), così da leggere a colpo d'occhio se
    l'auto sotto/sovrasterza mentre guido.
27. Come responsabile della qualità, voglio che la **scena vecchia** (`START_SCENE='playground'`) resti
    identica e la baseline Playwright intatta, così da non introdurre regressioni.
28. Come sviluppatore, voglio che `actor.pos` **non venga scritto** e che posizione/collisioni restino
    di Excalibur, così da non duplicare l'integrazione (coerente con lo Step 0).
29. Come futuro sviluppatore dell'AI, voglio che `PhysicDriveUpdateSystem` resti **agnostico rispetto
    alla sorgente dell'intento**, così da poter guidare auto senza tastiera anche col nuovo modello
    laterale.
30. Come sviluppatore, voglio mantenere la **convenzione assi corpo** (`x`=avanti, `y`=laterale) e i
    due soli punti di disaccoppiamento arte↔fisica (`+π/2` in `rotateToHeading`, `localToBody` per i
    bracci), così da non ruotare lo spritesheet.

## Implementation Decisions

### Rappresentazione dell'orientamento (Q1)
- La **freccia `heading`** (vettore unitario) resta il **dato canonico** dell'orientamento. Ogni frame
  ruota di `yawRate · dt` e viene normalizzata (evita la deriva numerica, come il vecchio
  `VehicleActor`). L'angolo `θ = atan2(heading.y, heading.x)` si ricava solo per le conversioni
  corpo↔mondo. **Nessun nuovo campo `theta`**: `CameraFollowPlayerSystem` e `rotateToHeading`
  continuano a leggere `heading` senza modifiche. `yawRate` resta lo stato indipendente.

### Modulo deep: `vehicle-physics.service` (funzioni pure, SI, frame-corpo)
Si aggiungono, con interfaccia semplice e stabile, indipendente da Excalibur:
- **`wheelVelocity(v_x, v_y, omega, r_i)`** → velocità della ruota: `{ x: v_x − ω·r_i_y,
  y: v_y + ω·r_i_x }` (§3.6).
- **`slipAngle(v_i_x, v_i_y, delta_i)`** → `atan2(v_i_y, v_i_x) − δ_i`.
- **`lateralForceLinear(alpha, Calpha)`** → `−Cα · α` (lineare, **senza** saturazione).
- **`integrateBody(...)`** → un passo dell'integrazione a corpo rigido planare con i termini incrociati
  (§3.7): da `(v_x, v_y, ω)` e forze nette `(Fx, Fy, Mz)` con `mass`/`Iz`/`dt` produce il nuovo
  `(v_x, v_y, ω)`. L'aggiornamento di `θ`/`heading` avviene **fuori** (rotazione di `heading`, Q1).
  `dt ≤ 0` lascia lo stato invariato.
- **`lowSpeedKinematicBlend(...)`** → fattore di blend `k = clamp(speed / soglia, 0, 1)` e imbardata
  cinematica a bicicletta `θ̇ = v_x · tan(δ) / L`; sotto soglia le forze laterali sono scalate verso 0
  e l'imbardata fonde verso il valore cinematico. Formula tarabile.
- **Riuso senza duplicati:** `velBody` è **già** lo stato nel frame-corpo, quindi `v_x`/`v_y` si
  leggono direttamente (niente nuova `bodyVelocity`); `bodyToWorld` resta per scrivere `actor.vel`,
  `worldToBody` resta disponibile. `integrateLongitudinalStep` **resta nel service** (con i suoi test)
  ma non è più nel flusso Step 1 (superata da `integrateBody`); potatura rimandata.

### Stato e datasheet: `PhysicVehicleActor`
- Il campo unico `corneringStiffness` diventa **`corneringStiffnessFront`** e
  **`corneringStiffnessRear`** (N/rad, **per-ruota**; il totale emerge sommando le 4 gomme). Valori
  placeholder con **leggero sottosterzo** (posteriore ≳ anteriore).
- Lo stato a corpo rigido (`velBody`, `yawRate`, `heading`) e i getter geometrici (`wheelArmsBody`,
  `Iz`, `wheelbaseMeters`, `trackMeters`, `totalMass`) **esistono già** dallo Step 0 e si riusano.

### Orchestrazione: `PhysicDriveUpdateSystem` (glue Excalibur)
Ogni frame, per l'entità con `DriverInputComponent` (agnostico alla sorgente):
1. smoothing pedali/sterzo (invariato dallo Step 0);
2. legge `v_x`/`v_y` da `velBody`, `ω` da `yawRate`;
3. per le 4 ruote (`wheelArmsBody`; `δ = steeringAngle` sulle anteriori, `0` sulle posteriori):
   `wheelVelocity` → `slipAngle` → `lateralForceLinear`, **ruotando la forza anteriore di `δ`**;
4. somma **forza netta** `Fx`/`Fy` (con spinta tracer longitudinale al baricentro + attrito lineare
   espresso come forza `−mass·dragCoeff·v_x`) e **coppia** `Mz = Σ(r_i_x·F_i_y − r_i_y·F_i_x)`;
5. applica il **blend a bassa velocità**;
6. `integrateBody` → aggiorna `velBody` e `yawRate`;
7. ruota `heading` di `ω·dt` e normalizza;
8. scrive `actor.vel = bodyToWorld(velBody, θ)·pxPerMeter`. **`actor.pos` non viene scritto**
   (posizione/collisioni a Excalibur). La riconciliazione `velBody`↔collisioni resta **fuori scope**
   (rimandata, come da Decision Step 0).

### Costanti e parametri
- Soglia del blend: riuso di **`LOW_SPEED_BLEND_THRESHOLD`** in `physics.constants.ts`; eventuali
  ulteriori costanti generiche del blend vivono lì. **Nessun magic number nei system**: i parametri
  per-veicolo (morso gomme, ...) stanno sul datasheet dell'attore.

### UI di debug: `PhysicsDebugHud`
- Aggiunge **`yawRate`** (in °/s) e lo **slip angle medio anteriore/posteriore** (in gradi), leggendo
  direttamente i campi dell'attore. Resta l'unica UI di guida della scena dev; la `DrivingDashboard`
  non si tocca.

### Retromarcia
- Invariata dallo Step 0 (inverte la spinta longitudinale tracer). Il **segno** della velocità
  longitudinale gestisce automaticamente slip angle e blend cinematico anche in retromarcia.

### Stabilità
- **Fisica pura + taratura a mano**: nessuno smorzamento artificiale di imbardata. Ci si affida al
  passo fisso a 60 Hz e al blend a bassa velocità; se in verifica l'auto oscilla, si ritoccano morso
  gomme/`Iz`. Uno smorzamento dolce resta come rete di sicurezza fuori-specifica, solo se necessario.

## Testing Decisions

- **Cosa rende buono un test:** si testa il **comportamento esterno** (input → output) delle funzioni
  pure, non i dettagli implementativi. Niente test che ispezionano stato interno o sequenze di
  chiamate.
- **Cosa si testa:** solo il **modulo deep** `vehicle-physics.service`, in
  `vehicle-physics.service.test.ts`, con casi mirati per ogni funzione introdotta dallo Step 1:
  - `wheelVelocity` — i termini `−ω·r_i_y` / `+ω·r_i_x` con `ω` noto e bracci noti (incluso `ω = 0`).
  - `slipAngle` — angolo da `v_i_y`/`v_i_x` noti, con e senza `δ`; segno coerente.
  - `lateralForceLinear` — proporzionalità e **segno** (forza che si oppone allo slip); zero a slip 0.
  - `integrateBody` — accelerazione sotto forza/coppia note, presenza dei **termini incrociati**
    (es. `v_y·ω` che ruota la velocità), comportamento a `dt ≤ 0`.
  - `lowSpeedKinematicBlend` — estremi del fattore di blend (`speed = 0` → cinematico,
    `speed ≥ soglia` → dinamico) e imbardata cinematica a `δ`/`v` noti.
- **Cosa NON si testa con unit:** `PhysicVehicleActor`, `PhysicDriveUpdateSystem`, scena e HUD restano
  **glue accoppiato a Excalibur**, non unit-testati (Jest gira in `node`, senza Engine/DOM). La
  stabilità, le curve e il blend si validano **manualmente** guidando nella scena dev (vedi checklist
  in `grill-me-out.md`).
- **Prior art:** `vehicle-physics.service.test.ts` (Step 0: `pxPerMeter`, `bodyToWorld`/`worldToBody`,
  `localToBody`, `getTotalMass`, `integrateLongitudinalStep`) e `math.service.test.ts` (`sumClamp`,
  `smoothPedal`, ...). Stesso stile: `describe`/`it`, `toBeCloseTo` per i float.
- **Regressione della scena esistente:** garantita dalla **baseline Playwright** invariata (la scena di
  produzione non cambia).

## Out of Scope

- **Cerchio di aderenza** (`|F_i| ≤ μ·Fz`), **saturazione** delle forze e relativi comportamenti
  (scivolate, sotto/sovrasterzo *da saturazione*): Step 2. In Step 1 la forza laterale è **lineare e
  illimitata**.
- **Carico statico `Fz`** e **superfici per-ruota** (grip via `collisionstart`/`collisionend`, refactor
  `WheelFactor`/`SurfacesService`): Step 2.
- **Trasferimento di carico** longitudinale/laterale: Step 3.
- **Motore power-limited**, aerodinamica, attrito di rotolamento per-superficie e **distribuzione di
  trazione** (FWD/RWD/AWD): Step 4. In Step 1 la propulsione longitudinale resta la **tracer** dello
  Step 0, applicata al baricentro (niente split per-ruota, niente coppia di imbardata dalla trazione).
- **Pattinamento/bloccaggio** espliciti, **usura gomme**, **carburante** consumato, **statistiche
  metriche**: Step 5–6.
- **Riconciliazione `velBody` ↔ collisioni** dopo l'urto di un muro: rimandata (limite noto accettato).
- **Dettaglio HUD per-ruota** (slip sinistra/destra separati): rimandato allo Step 2 (superfici
  asimmetriche), quando le differenze laterali contano davvero.
- **Smorzamento artificiale di imbardata** come meccanismo stabile: non previsto (solo rete di
  sicurezza eventuale).
- **Switch della scena principale** e rimozione del vecchio codice: fine piano.

## Further Notes

- Lo Step 1 è il secondo di una sequenza a 7 step (`../plan-steps.md`): introduce il **primo strato
  fisico laterale** sul quale lo Step 2 innesta il cerchio di aderenza. L'ordine "a strati" è voluto —
  una fisica a forze con imbardata è quasi impossibile da debuggare se appare già completa.
- La separazione **`yawRate` indipendente da `vel`** è il cuore concettuale: è l'angolo tra muso
  (`heading`) e direzione della velocità (lo slip angle del veicolo) a rendere possibili, dagli step
  successivi, sovra/sottosterzo e scivolate. In Step 1 questa separazione esiste già nel modello anche
  se i comportamenti emergenti completi arriveranno con la saturazione.
- **Convenzione assi** invariata: frame-corpo `x`=avanti, `y`=laterale; sprite muso-su lasciato com'è;
  disaccoppiamento arte↔fisica confinato all'offset `+π/2` di `rotateToHeading` e a `localToBody` (per
  i bracci `r_i`). **Anchor al centro**.
- **Verifica manuale** (flippando `START_SCENE` su `'physics'` in locale): auto dritta a sterzo 0;
  curva a raggio finito coerente; nessuna vibrazione/partenza per la tangente da ferma (blend attivo);
  curva morbida e stabile a regime; HUD con `yawRate` e slip anteriore/posteriore coerenti; con la
  costante su `'playground'` la scena vecchia è identica.
- **Nota committal (eredità Step 0):** `main.ts` deve restare committato con `START_SCENE='playground'`
  (flip a `'physics'` solo in locale), altrimenti la build Playwright screenshotta la scena dev e rompe
  la baseline.