# Plan: Step 1 — Modello pneumatico lineare + blend a bassa velocità (fisica a 4 ruote, issue #31)

> Source PRD: `resources/issues/0031-new-physics/step01/prd.md`
> Specs del risultato finale: `resources/issues/0031-new-physics/specs.md` (§3.1, §3.6, §3.7, §3.10)
> Ordine degli step: `resources/issues/0031-new-physics/plan-steps.md`
> Decisioni di dettaglio: `resources/issues/0031-new-physics/step01/grill-me-out.md`

Piano a **slice verticali (tracer bullet)**: ogni fase attraversa l'intera catena
input → contratto → fisica → integrazione → rendering → HUD ed è **dimostrabile a sé**, guidando la
scena dev e/o con gli unit test. Lo Step 1 sostituisce la sola propulsione *laterale* con un vero
**modello a 4 ruote lineare** (forza laterale ∝ slip angle, **senza** cerchio di aderenza): l'auto
curva in modo plausibile e **stabile**, con `yawRate` stato indipendente. La propulsione
*longitudinale* resta la **tracer** dello Step 0.

## Architectural decisions

Decisioni durature, valide per tutte le fasi (ereditano quelle dello Step 0):

- **Coesistenza, non sostituzione.** `VehicleActor`/`DriveInputSystem`/`PlaygroundScene` restano
  intatti (baseline Playwright). Il nuovo modello vive in `PhysicsPlaygroundScene`, selezionata da
  `START_SCENE` in `main.ts`, **committata sempre su `'playground'`** (flip a `'physics'` solo in
  locale).
- **Orientamento canonico = `heading` (vettore).** Ogni frame `heading` ruota di `yawRate·dt` e si
  normalizza (no deriva). `θ = atan2(heading.y, heading.x)` solo per le conversioni corpo↔mondo.
  **Nessun campo `theta`**: `CameraFollowPlayerSystem`/`rotateToHeading` leggono `heading` invariati.
  `yawRate` (ω) è lo stato di rotazione indipendente.
- **Convenzione assi corpo:** `x` = avanti, `y` = laterale. Sprite muso-su lasciato com'è;
  disaccoppiamento arte↔fisica confinato a `+π/2` in `rotateToHeading` e a `localToBody` (bracci
  `r_i`). **Anchor al centro.**
- **Source of truth del moto.** `velBody` (m/s, frame-corpo) e `yawRate` sono nostri; ogni frame
  scriviamo `actor.vel = bodyToWorld(velBody, θ)·pxPerMeter`. **`actor.pos` non scritto**: posizione e
  collisioni a Excalibur (solver Arcade). Riconciliazione `velBody`↔collisioni **fuori scope** (come
  Step 0). Timestep fisso `fixedUpdateFps = 60`.
- **Fisica pura nel service.** Le nuove funzioni (`wheelVelocity`, `slipAngle`, `lateralForceLinear`,
  `integrateBody`, `lowSpeedKinematicBlend`) vivono in `vehicle-physics.service` (modulo deep,
  indipendente da Excalibur), con unit test colocati. `velBody` è **già** nel frame-corpo → niente
  `bodyVelocity` nuova; `integrateLongitudinalStep` resta ma esce dal flusso (superata da
  `integrateBody`). Costanti generiche (soglia blend) in `physics.constants.ts`
  (`LOW_SPEED_BLEND_THRESHOLD`); costanti per-veicolo sul datasheet dell'attore.
- **Contratto input/fisica invariato.** `PhysicDriveInputSystem` (priorità `Higher`) scrive
  `DriverInputComponent`; `PhysicDriveUpdateSystem` (query `[DriverInputComponent]`) legge ed è
  **agnostico alla sorgente** (umano/AI). Lo smoothing pedali/sterzo resta nell'update.
- **Datasheet.** `corneringStiffness` → `corneringStiffnessFront`/`corneringStiffnessRear` (N/rad,
  per-ruota; totale = somma 4 gomme), placeholder con **leggero sottosterzo** (post. ≳ ant.). Stato a
  corpo rigido e getter geometrici (`wheelArmsBody`, `Iz`, `wheelbaseMeters`, `trackMeters`,
  `totalMass`) **già presenti** dallo Step 0, si riusano.
- **Strazia di test.** Unit test (Jest, `node`) **solo** sulle funzioni pure del service
  (comportamento esterno). Attori/system/scena/HUD = glue Excalibur, validati **manualmente**
  guidando. Non-regressione della scena vecchia garantita dalla baseline Playwright.
- **Spinta longitudinale al baricentro.** La tracer (gas/freno → `Fx` + attrito lineare come forza)
  agisce al COG e **non** genera coppia di imbardata: la rotazione nasce solo dalle forze laterali
  delle gomme. Distribuzione di trazione per-ruota = Step 4.

---

## Phase 1: Rotazione end-to-end con imbardata cinematica (tracer della curva)

**User stories**: 1, 2, 3, 8 (impalcatura), 16, 17, 20 (parziale), 24, 26 (parziale), 27, 28, 29, 30

### What to build

La fetta verticale minima che fa **già curvare** l'auto: si collega la nuova impalcatura di rotazione
nel `PhysicDriveUpdateSystem` — integrazione a corpo rigido `integrateBody` (con i termini incrociati
`v_y·ω`/`v_x·ω`) e rotazione di `heading` di `ω·dt` — con l'imbardata guidata da una **formula
cinematica a bicicletta provvisoria** `ω = v_x·tan(δ)/L`, applicata a **tutte** le velocità. La spinta
longitudinale resta la tracer dello Step 0 (al baricentro). Nessuna forza per-ruota ancora. Si
validano end-to-end il percorso rotazione → integrazione → `heading` → rendering/telecamera e il nuovo
readout `yawRate` dell'HUD, **isolando l'impalcatura dalle forze vere** (che arrivano in Phase 2). Il
codice cinematico qui introdotto verrà **riusato** come ramo a bassa velocità nella Phase 3.

### Acceptance criteria

- [ ] `integrateBody` (funzione pura) integra un passo a corpo rigido planare con i termini incrociati
  da `(v_x, v_y, ω)` e forze nette `(Fx, Fy, Mz)`, `mass`/`Iz`/`dt`; `dt ≤ 0` lascia lo stato
  invariato. Unit test verdi.
- [ ] L'imbardata cinematica `ω = v_x·tan(δ)/L` è una funzione pura testata (segno corretto in avanti
  e in retromarcia; `ω = 0` a sterzo 0 o da fermo).
- [ ] Guidando: a **sterzo 0 l'auto va dritta**; sterzando a velocità di crociera **curva** con raggio
  coerente; lo sprite punta lungo `heading`; le ruote anteriori ruotano con lo sterzo; la telecamera
  segue.
- [ ] `velBody`/`yawRate` aggiornati dal nuovo flusso; `actor.vel` scritto in px; **`actor.pos` non
  scritto** (posizione/collisioni a Excalibur).
- [ ] L'HUD mostra `yawRate` (°/s) coerente col moto, oltre a km/h e pedali dello Step 0.
- [ ] `PhysicDriveUpdateSystem` resta agnostico alla sorgente dell'intento; smoothing pedali/sterzo
  invariato.
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovi test inclusi); baseline Playwright
  invariata (`START_SCENE='playground'`).

---

## Phase 2: Modello pneumatico lineare a 4 ruote (imbardata emergente dalle forze)

**User stories**: 4, 5, 6, 7, 9, 10, 11, 12, 18, 19 (parziale), 21, 22, 23, 26 (parziale)

### What to build

Si sostituisce l'imbardata cinematica provvisoria della Phase 1 con il **vero modello pneumatico
lineare a 4 ruote**. Per ogni ruota (`wheelArmsBody`; `δ = steeringAngle` sulle anteriori, `0` sulle
posteriori): `wheelVelocity` → `slipAngle` → `lateralForceLinear` (`Fy = −Cα·α`, **senza**
saturazione), **ruotando di `δ` la forza anteriore** prima di sommarla. Si compongono forza netta
`Fx`/`Fy` (con tracer longitudinale al baricentro + attrito) e **coppia** `Mz = Σ(r_i_x·F_i_y −
r_i_y·F_i_x)`, e si integra con `integrateBody`. Ora `yawRate` è **davvero indipendente** dalla
direzione di `vel` (slip angle del veicolo reale), le gomme hanno morso diverso ant./post.
(`corneringStiffnessFront`/`Rear`, leggero sottosterzo). L'HUD aggiunge lo slip angle medio
anteriore/posteriore. **Dimostrabile a velocità di crociera**; da fermo/lentissimo può ancora vibrare
(atteso, lo risolve la Phase 3).

### Acceptance criteria

- [ ] `wheelVelocity`, `slipAngle`, `lateralForceLinear` (funzioni pure) testate: velocità ruota con
  `ω` e braccio noti (incluso `ω=0`); slip da `v_i_y`/`v_i_x` con e senza `δ`, segno coerente; forza
  laterale proporzionale e **opposta** allo slip, zero a slip 0.
- [ ] La curva **emerge dalle forze** per-ruota (niente imbardata cinematica sopra soglia); la coppia
  `Mz` nasce dai momenti delle forze rispetto al baricentro.
- [ ] La forza delle ruote anteriori è **ruotata di `δ`**; le posteriori hanno `δ = 0`.
- [ ] `corneringStiffnessFront`/`corneringStiffnessRear` sul datasheet, con valori a **leggero
  sottosterzo** di partenza; ritoccabili a mano.
- [ ] Guidando a velocità di crociera: la curva è coerente e l'auto tende ad **allargare** (sottosterzo
  leggero) prima che a scodare; `yawRate` e slip ant./post. nell'HUD coerenti col moto.
- [ ] `npm run build` verde; `npm run test:unit` verde; baseline Playwright invariata.

---

## Phase 3: Blend a bassa velocità (stabilità da fermo)

**User stories**: 13, 14, 15, 19 (parziale), 25

### What to build

Si aggiunge il **blend cinematico a bassa velocità** per eliminare l'instabilità dei quattro `atan2`
quasi nulli. Funzione pura `lowSpeedKinematicBlend`: fattore `k = clamp(speed/soglia, 0, 1)` (soglia =
`LOW_SPEED_BLEND_THRESHOLD`); sotto soglia le **forze laterali sono scalate verso 0** e l'imbardata
**fonde verso il valore cinematico** `ω = v_x·tan(δ)/L` — **riusando** la formula introdotta nella
Phase 1. Sopra soglia il comportamento è quello pieno della Phase 2. Così l'auto riparte da ferma e
manovra in modo morbido, senza vibrare né "partire per la tangente".

### Acceptance criteria

- [ ] `lowSpeedKinematicBlend` (funzione pura) testata agli estremi: `speed = 0` → tutto cinematico
  (forze laterali ≈ 0, ω = valore cinematico); `speed ≥ soglia` → tutto dinamico (forze piene); valore
  intermedio coerente col fattore `k`.
- [ ] Guidando: da **ferma o lentissima l'auto non vibra** né parte per la tangente; **sterza comunque
  in modo morbido** e riparte/manovra naturale; il passaggio sopra soglia al modello pieno è continuo
  (nessuno scatto).
- [ ] A velocità di crociera il comportamento resta quello della Phase 2 (blend inattivo); nessuna
  regressione di stabilità.
- [ ] La soglia (e l'eventuale curva del blend) è una **costante condivisa** in
  `physics.constants.ts`; nessun magic number nei system.
- [ ] `npm run build` verde; `npm run test:unit` verde; baseline Playwright invariata.
- [ ] Checklist di verifica manuale dello Step 1 superata (grill-me-out): dritta a sterzo 0, curva
  coerente, nessuna vibrazione da fermo, curva morbida e stabile a regime, HUD coerente; con
  `START_SCENE='playground'` la scena vecchia è identica.