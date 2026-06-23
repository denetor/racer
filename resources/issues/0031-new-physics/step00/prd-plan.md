# Plan: Step 0 — Impalcatura + propulsione "tracer" (fisica a 4 ruote, issue #31)

> Source PRD: `resources/issues/0031-new-physics/step00/prd.md`
> Specs del risultato finale: `resources/issues/0031-new-physics/specs.md`
> Ordine degli step: `resources/issues/0031-new-physics/plan-steps.md`
> Decisioni di dettaglio: `resources/issues/0031-new-physics/step00/grill-me-out.md`

Piano a **slice verticali (tracer bullet)**: ogni fase attraversa l'intera catena
input → contratto → fisica → integrazione → rendering → collisioni ed è **dimostrabile a sé**,
lanciando il gioco e/o con gli unit test. Lo Step 0 introduce solo l'impalcatura e una propulsione
banale (solo rettilineo): nessuna forza pneumatica reale.

## Architectural decisions

Decisioni durature, valide per tutte le fasi:

- **Coesistenza, non sostituzione.** `VehicleActor`/`DriveInputSystem` e `PlaygroundScene` restano
  intatti e costituiscono la baseline degli screenshot Playwright. Le classi nuove affiancano le
  vecchie. Lo switch della scena principale è fuori scope (fine piano).
- **Gerarchia attori (ECS Excalibur).** `BaseVehicleActor` astratto e solo-visivo (sprite, 4
  ruote-figlie, assi, emitter, collider composito, transponder, geometria assi in px, hook di
  rendering `rotateToHeading`/`getWheelAxisRotation`/`onPostUpdate`/`setEmitters`), con getter
  astratti `heading` e `steeringAngle`. Sottoclassi: `VehicleActor` (fisica vecchia) e
  `PhysicVehicleActor` (fisica nuova). **Anchor al centro** (default Excalibur).
- **Convenzione assi.** Frame-corpo `x` = avanti, `y` = laterale per la fisica. **Sprite muso-su
  lasciato com'è**: disaccoppiamento arte↔fisica nell'offset `+π/2` di `rotateToHeading` e nella
  funzione pura `localToBody` (`{x:−v.y, y:v.x}`).
- **Contratto input/fisica.** `DriverInputComponent` (data-bag) con `throttleTarget` ∈ [0,1],
  `brakeTarget` ∈ [0,1], `steerTarget` ∈ [−1,1], `reverseToggleRequested`. È l'unico punto di
  contatto tra i due system. `PhysicDriveInputSystem` (query su `DrivableComponent`, marker umano)
  scrive; `PhysicDriveUpdateSystem` (query su `DriverInputComponent`, agnostico alla sorgente) legge.
- **Priorità system.** Input a priorità più alta dell'update (l'intento del frame è pronto prima
  della fisica). Lo smoothing (pedali/sterzo) vive nell'update system (attuazione condivisa umano/AI).
- **Source of truth del moto.** La **velocità in SI (m/s)** è nostra (stato `velM`/`v_x`/`v_y`,
  `theta`, `yawRate` sull'attore). Ogni frame scriviamo `actor.vel = bodyToWorld(velM,theta) ·
  pxPerMeter`. **Posizione e collisioni sono di Excalibur** (solver Arcade: `pos += vel·dt`, stop sui
  `Fixed`). Non scriviamo `actor.pos` ogni frame; la posizione in metri = `actor.pos / pxPerMeter`.
- **Timestep fisso.** `Engine.fixedUpdateFps = 60` (config globale, benigna per la scena vecchia).
- **Selezione scena.** Entrambe le scene registrate nella mappa `scenes` dell'`Engine`; costante
  `START_SCENE` in `main.ts`, **committata sempre su `'playground'`** (flip a `'physics'` solo in
  locale).
- **Fisica pura nel service.** `vehicle-physics.service` (modulo deep, indipendente da Excalibur):
  `pxPerMeter`, `localToBody`, `bodyToWorld`/`worldToBody`, `integrateLongitudinalStep`,
  `getTotalMass`. Costanti generiche in `physics.constants.ts`. Costanti per-veicolo (datasheet) sul
  file dell'attore.
- **Strategia di test.** Unit test (Jest, `node`) **solo** sul `vehicle-physics.service` (funzioni
  pure, comportamento esterno). Attori/system/scena/HUD = glue Excalibur, validati **manualmente**
  lanciando il gioco. Non-regressione della scena vecchia garantita dalla baseline Playwright.

---

## Phase 1: Estrazione base a comportamento invariato

**User stories**: 1, 2, 3, 30, 32

### What to build

Estrarre da `VehicleActor` una classe base astratta `BaseVehicleActor` che contiene tutto e solo il
setup **visivo** e i hook di rendering, lasciando in `VehicleActor` la fisica vecchia. `VehicleActor`
diventa una sottoclasse della base. Nessun cambiamento di comportamento: il gioco gira identico.
È il refactor che abilita il riuso del setup grafico da parte del futuro `PhysicVehicleActor` senza
duplicazioni e senza campi fisici morti.

### Acceptance criteria

- [x] `BaseVehicleActor` astratta possiede sprite, 4 ruote-figlie, assi, emitter, collider composito,
  transponder, geometria assi in px e i metodi `rotateToHeading`/`getWheelAxisRotation`/
  `onPostUpdate`/`setEmitters`, con **proprietà astratte** `heading` e `steeringAngle` (scrivibili:
  i drive system le mutano direttamente — la forma scrivibile del contratto "getter astratto").
- [x] `VehicleActor extends BaseVehicleActor`; `heading`/`steeringAngle` e i parametri/metodi della
  fisica vecchia (incluso `getAverageWheelFactors`) restano in `VehicleActor`.
- [x] L'anchor resta al centro; origine fisica = origine rendering = centro di rotazione.
- [x] `npm run build` verde; `npm run test:unit` verde (59 test).
- [x] **Non-regressione visiva provata**: la baseline Playwright era *stale* (lo snapshot del commit
  iniziale era la scena-template, non `PlaygroundScene`, e il test cliccava un `#excalibur-play`
  soppresso da `suppressPlayButton`). Harness sistemato (no click, attesa del canvas, tolleranza per
  le particelle di fumo). Invarianza dimostrata: baseline rigenerata dal codice **pre-refactor** →
  test verde col codice **post-refactor**, stabile su run multipli.

---

## Phase 2: Tracer bullet — guida in avanti end-to-end

**User stories**: 4 (parziale), 5, 6, 7, 8 (accelerazione), 9, 10, 12, 13, 17, 18, 20 (parziale), 21, 23 (parziale), 24, 28 (km/h), 29, 31

### What to build

La slice verticale minima che attraversa tutta la catena: premendo il tasto di accelerazione, una
nuova auto si muove **in avanti in linea retta** in una scena dev raggiungibile. Si crea
`PhysicVehicleActor` (stato SI minimo + `heading`, tag `player`), `DriverInputComponent` (per ora solo
`throttleTarget`), `PhysicDriveInputSystem` (tastiera → component), `PhysicDriveUpdateSystem`
(component → `Fx` tracer → integrazione SI longitudinale → `actor.vel` in px), e le funzioni di
service necessarie (`pxPerMeter`, `bodyToWorld`, `integrateLongitudinalStep`). La posizione e le
collisioni sono di Excalibur; il timestep è fisso; un HUD minimale mostra la velocità in km/h.
`main.ts` registra la scena dev e la seleziona via `START_SCENE` (committato su produzione).

### Acceptance criteria

- [ ] Con `START_SCENE='physics'` (locale) si avvia `PhysicsPlaygroundScene` con la nuova auto;
  con `'playground'` si avvia la scena vecchia. Il valore committato è `'playground'`.
- [ ] `Engine.fixedUpdateFps = 60` attivo; la baseline Playwright resta verde (frame statico invariato).
- [ ] Premendo accelerazione l'auto si muove in avanti lungo l'`heading`, in **linea retta**, in modo
  stabile (nessuna esplosione numerica); rilasciando, l'attrito lineare la rallenta.
- [ ] La velocità è integrata in SI nel frame-corpo e scritta come `actor.vel` in px; **non** si scrive
  `actor.pos` ogni frame; Excalibur integra la posizione.
- [ ] L'auto si **ferma contro i muri** (`Fixed`) senza codice di risposta a carico nostro.
- [ ] La camera segue l'auto; lo sprite punta lungo l'heading; gli emitter di fumo sono attivi.
- [ ] `PhysicDriveInputSystem` ha priorità maggiore di `PhysicDriveUpdateSystem`; l'update system non
  dipende dalla tastiera (gira anche su entity senza input umano).
- [ ] L'HUD di debug mostra la velocità in km/h coerente col moto.
- [ ] Unit test verdi per `pxPerMeter`, `bodyToWorld`, `integrateLongitudinalStep`.

---

## Phase 3: Contratto input completo + attuazione

**User stories**: 8 (freno), 11, 14, 15, 16, 19, 28 (pedali/accelerazione)

### What to build

Completare la superficie di guida riusando lo smoothing esistente. Si estende
`DriverInputComponent` al contratto completo (`brakeTarget`, `steerTarget`, `reverseToggleRequested`),
l'input system traduce tutti i tasti, e l'update system applica lo smoothing di pedali
(`smoothPedal`) e sterzo (`updateSteeringAngle`/`sumClamp`). Il freno decelera; lo sterzo **ruota
visivamente** le ruote anteriori ma **non curva** l'auto (niente imbardata allo Step 0); la
retromarcia si attiva col toggle. L'HUD mostra anche pedali e accelerazione longitudinale.

### Acceptance criteria

- [ ] `DriverInputComponent` espone `throttleTarget`, `brakeTarget`, `steerTarget`,
  `reverseToggleRequested`; l'input system li popola da tastiera, senza smoothing né fisica.
- [ ] L'update system smussa pedali e sterzo riusando `smoothPedal`/`updateSteeringAngle`/`sumClamp`.
- [ ] Premendo il freno l'auto decelera in linea retta in modo stabile.
- [ ] Lo sterzo ruota le ruote anteriori (rendering) ma la traiettoria resta rettilinea.
- [ ] Il toggle retromarcia inverte il verso della spinta tracer a veicolo (quasi) fermo.
- [ ] L'HUD mostra pedali (gas/freno) e accelerazione longitudinale oltre alla km/h.
- [ ] L'update system resta agnostico rispetto alla sorgente dell'intento (umano/AI).

---

## Phase 4: Completamento impalcatura + parità scena

**User stories**: 4 (parità), 20 (resto), 22, 23 (resto), 25, 26, 27

### What to build

Riempire l'impalcatura **pre-costruita per gli step successivi** e portare la scena dev a parità con
`PlaygroundScene`. Si completa il `vehicle-physics.service` con le funzioni non ancora esercitate dal
tracer (`localToBody`, `worldToBody`, `getTotalMass`) e i relativi unit test; si crea
`physics.constants.ts` (densità aria, `g`, soglia blend a bassa velocità); si dichiara il **datasheet
completo** del veicolo su `PhysicVehicleActor` con valori placeholder (massa SI, geometria→bracci in
m, `cogPosition`/`cogHeight`, `Iz`, `Cα`, `drivetrain`/`driveBias`, `fuelCapacity`/`fuelBurn`, costanti
tracer); si aggiungono alla scena dev `RaceData`, checkpoint, conteggio giri e laptime (parità con la
scena di produzione), mantenendo il `PhysicsDebugHud` al posto della `DrivingDashboard`.

### Acceptance criteria

- [ ] `vehicle-physics.service` espone `localToBody`, `worldToBody`, `getTotalMass`, con unit test
  verdi (incluso il round-trip `bodyToWorld`/`worldToBody` e i casi a θ noti).
- [ ] `physics.constants.ts` raccoglie le costanti generiche; nessun magic number nei system.
- [ ] `PhysicVehicleActor` dichiara il datasheet completo (anche i campi inerti) come unico punto di
  verità dei parametri per-veicolo.
- [ ] `PhysicsPlaygroundScene` replica mappa, superfici, ostacoli, race-data, checkpoint, giri e
  laptime, con `PhysicVehicleActor` + i due nuovi system + camera + `PhysicsDebugHud`.
- [ ] `npm run build` e `npm run test:unit` verdi; baseline Playwright invariata.
- [ ] Checklist di verifica manuale dello Step 0 superata: accelera/frena in retta stabile, km/h e
  pedali coerenti, sterzo gira le ruote ma non l'auto, stop sui muri, camera/sprite/emitter corretti;
  con `START_SCENE='playground'` la scena vecchia è identica.
