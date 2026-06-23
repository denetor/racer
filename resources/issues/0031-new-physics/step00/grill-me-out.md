# Grill-me — Step 0 (Impalcatura + propulsione "tracer")

> Interview di dettaglio sull'implementazione dello **Step 0** di `plan-steps.md`, alla luce di
> `specs.md` e della struttura software esistente. Obiettivo dello Step 0: mettere in piedi tutta
> l'architettura nuova (classi, component, due system, service, scena dev, HUD) e poter **lanciare il
> gioco e guidare** l'auto con una propulsione banale, validando end-to-end la pipeline
> input → component → fisica → integrazione → rendering. Nessuna fisica a forze reale ancora.

## Ricognizione codice (punti d'integrazione toccati dallo Step 0)

- `main.ts`: scene in `Engine({ scenes: { playground } })`, avvio con `game.start('playground')`.
  Playwright builda in produzione e fa screenshot della scena di avvio.
- `CameraFollowPlayerSystem`: query per tag `'player'`, legge `.heading`/`.pos` → il nuovo attore
  deve avere tag `player` e `heading`.
- Jest: `testEnvironment: node`, `testMatch: src/**/*.test.ts` → si testano **solo funzioni pure**
  (attori/system non unit-testati). Coerente con la strategia di test decisa.
- `fixedUpdateTimestep` commentato in `main.ts` (oggi `delta` variabile).
- `SurfacesService` fa cast `evt.other.owner.parent as VehicleActor` e tocca `.wheelFactors`:
  funziona a runtime per qualunque sottoclasse di `BaseVehicleActor`.

---

## Question 1: Meccanismo di selezione della scena dev (senza rompere la baseline Playwright).

Query param URL a runtime; env var Vite a build-time; oppure costante hardcoded in `main.ts`.

### Decision:

**Costante hardcoded in `main.ts`** (es. `const START_SCENE = 'playground'`), modificata a mano per
provare la scena dev. Entrambe le scene restano registrate nella mappa `scenes` dell'`Engine`.

**Vincolo operativo (importante):** il valore committato **deve restare `'playground'`**, altrimenti
la build di produzione (e quindi gli screenshot Playwright) partirebbe dalla scena dev e romperebbe
la baseline. Si flippa a `'physics'` solo in locale durante lo sviluppo, mai nei commit.

---

## Question 2: Timestep fisso o variabile per il loop di integrazione?

Fixed timestep ora; clamp del delta nei system; oppure delta variabile e decidere dopo.

### Decision:

**Abilitare il timestep fisso di Excalibur ora**, allo Step 0 (`fixedUpdateFps: 60` in `main.ts`).
`delta` costante (~16.67 ms) → integrazione a forze **stabile e deterministica** fin dalle
fondamenta, evitando esplosioni numeriche da frame lunghi. È best practice Excalibur per le
simulazioni fisiche e benigno per la scena vecchia (cinematica).

**Verificato:** il test Playwright (`tests/main.spec.ts`) fa `click('#excalibur-play')` e screenshotta
**subito**, senza input da tastiera → l'auto è ferma alla posizione di partenza. Il timestep fisso
non altera quel frame statico, quindi **la baseline non va ribaselinata**.

---

## Question 3: Fedeltà della propulsione "tracer".

Integrazione SI reale + yaw cinematico; mover grezzo senza integrazione; oppure solo rettilineo.

### Decision:

**Solo rettilineo, con integrazione SI longitudinale.** Il tracer esercita la catena longitudinale
reale: throttle/brake → `Fx` placeholder nel frame-corpo → `v_x += (Fx/m)·dt` (con attrito lineare)
→ conversione corpo→mondo → scrittura posizione in px → `rotateToHeading`. **Niente yaw allo Step 0:**
`v_y = 0`, `ω = 0`, heading fisso. Lo sterzo viene comunque letto e smussato (le ruote anteriori
possono ruotare visivamente via `onPostUpdate`), ma **non curva** l'auto: la curvatura e le forze
laterali sono interamente Step 1. La camera-follow (legge `heading`+`pos`) funziona su traiettoria
rettilinea.

Razionale: valida l'integrazione longitudinale, il frame-corpo, le conversioni SI↔px e il rendering,
senza introdurre i 4 `atan2` instabili a bassa velocità (che richiedono il blend dello Step 1).

---

## Question 4: Chi possiede l'integrazione della posizione (Excalibur vs noi)?

Excalibur integra `pos` da `actor.vel`; noi possediamo vel/heading/yaw — oppure noi scriviamo `pos`
e azzeriamo `actor.vel` bypassando l'integratore.

### Decision (rivista dall'utente):

**La velocità è nostra (SI), la posizione e le collisioni sono di Excalibur.** Source of truth:
`velM` (m/s, frame-corpo `v_x`/`v_y`), `theta`, `yawRate` sull'attore. Ogni frame:

```
integrate body (v_x, v_y, omega) in SI    -> velM
worldVel = bodyToWorld(velM, theta)
actor.vel = worldVel.scale(pxPerMeter)     // px/s
```

Excalibur fa `pos += vel·dt` e **risolve le collisioni** (muri `Fixed`) da solo. **Non** scriviamo
`actor.pos` ogni frame (solo allo spawn iniziale): la posizione vive in `actor.pos` (px); quando
serve in metri si legge `actor.pos / pxPerMeter`. Niente `posM` separata, niente doppia integrazione.

Razionale (cambio rispetto alla prima scelta): si preferisce **lasciare a Excalibur la gestione
delle collisioni** con gli ostacoli `Fixed`, evitando di reimplementare la risposta ai muri. Si
mantiene comunque l'integrazione a forze nel frame-corpo (3.7) per la velocità: l'unico punto di
contatto col motore è la scrittura di `actor.vel` in px.

> **Nota:** quando un muro ferma l'auto, Excalibur corregge `pos`; la nostra `velM` però conserva la
> velocità precedente. Per Step 0 (rettilineo) è accettabile (l'auto preme contro il muro). La
> riconciliazione `velM` ↔ collisione è un raffinamento per gli step successivi, se necessario.

---

## Question 5: Risposta alle collisioni con i muri (data la scrittura manuale di `pos`).

### Decision:

**Risolta dalla Decision 4 rivista: la gestione delle collisioni è di Excalibur.** Poiché ora
scriviamo `actor.vel` (e non `actor.pos`) e lasciamo che il solver Arcade integri la posizione, gli
ostacoli `Fixed` della mappa fermano l'auto **nativamente**, senza riconciliazione post-solver a
carico nostro. Nessuna azione aggiuntiva richiesta allo Step 0.

---

## Question 6: Confine del `BaseVehicleActor` (heading/steeringAngle/geometria).

Base che possiede anche heading/steeringAngle, vs base solo-visivo con heading/steeringAngle nelle
sottoclassi.

### Decision:

**`BaseVehicleActor` astratto, solo-visivo.** Possiede: setup grafico (sprite, 4 ruote-figlie, assi,
emitter, collider composito, transponder), la **geometria assi in px** (è dove vengono *disegnate* le
ruote: `frontAxlePosition`/`rearAxlePosition`/larghezze) e i metodi di rendering (`rotateToHeading`,
`getWheelAxisRotation`, `onPostUpdate`, `setEmitters`). I metodi di rendering leggono i dati di moto
tramite **getter astratti**: `abstract get heading(): Vector` e `abstract get steeringAngle(): number`.

`heading` e `steeringAngle` sono **dichiarati nelle sottoclassi** (`VehicleActor`,
`PhysicVehicleActor`), così ciascun modello li gestisce a modo suo. `getAverageWheelFactors` e i
parametri della fisica vecchia restano in `VehicleActor`; la fisica nuova (massa SI, `velM`,
`yawRate`, `cogPosition`, ...) sta in `PhysicVehicleActor`, che può leggere la geometria assi
`protected` dalla base per derivare i bracci `r_i`.

Conseguenza: il refactor dello Step 0 estrae la base **a comportamento invariato** e si verifica
contro la baseline Playwright esistente prima di introdurre la fisica nuova.

---

## Question 7: Scope della scena dev `PhysicsPlaygroundScene`.

Minimale (solo guida + superfici) vs parità con `PlaygroundScene`.

### Decision:

**Parità con `PlaygroundScene`.** La scena dev replica tutto (mappa, `SurfacesService`,
`ObstaclesService`, `RaceData`, checkpoint, conteggio giri, laptime), sostituendo attore e system con
`PhysicVehicleActor` + `PhysicDriveInputSystem`/`PhysicDriveUpdateSystem` + `CameraFollowPlayerSystem`,
più l'HUD di debug. (Vedi Decision 8 per il destino della dashboard.)

---

## Question 8: Riconciliare la `DrivingDashboard` (tipizzata su `VehicleActor`) col nuovo attore + HUD debug.

Interfaccia minima + dashboard riusata + HUD a parte; oppure un solo `PhysicsDebugHud` senza riusare
la dashboard.

### Decision:

**Un solo `PhysicsDebugHud` nella scena dev; la `DrivingDashboard` non si riusa.** L'HUD mostra
tutto ciò che serve (pedali, accelerazione, `v` in km/h da Step 0; poi `yawRate`, slip, `Fz`, ...) e
cresce step dopo step. La `DrivingDashboard`/applet restano solo nella vecchia scena: **nessun
refactor della UI esistente**, e `PhysicVehicleActor` **non** deve esporre `acceleration` nella
convenzione dell'applet — l'HUD legge direttamente i campi che vuole.

> Questo **raffina la Decision 7**: la "parità" vale per mappa/superfici/ostacoli/race-data/giri, ma
> la UI di guida nella scena dev è il `PhysicsDebugHud`, non la `DrivingDashboard`.

---

## Question 9: Scope dei parametri per-veicolo su `PhysicVehicleActor` allo Step 0.

Solo quelli usati allo Step 0, vs tutti subito con placeholder.

### Decision:

**Tutti i parametri per-veicolo ora, con placeholder** — il "datasheet" completo del veicolo è
visibile da subito. Valori: dove esiste un corrispettivo px lo si converte in SI una volta sola
(`mass`=1000 kg ex `weight`; `maxSteeringAngle`=0.4 rad; geometria assi → bracci in m); gli altri con
default ragionati: `cogPosition` = centro, `Iz ≈ m·(L²+W²)/12`, `Cα`/`cogHeight`/`drivetrain`
(es. `rwd`)/`driveBias`/`fuelCapacity`/`fuelBurn` come placeholder da tarare. Campi inerti fino al
loro step, ma raccolti in un unico punto di verità sul file del veicolo.

---

## Question 10 (derivata): Funzioni pure di `vehicle-physics.service` per lo Step 0 + test.

### Decision:

Insieme minimo richiesto dalle Decision 3/4/9, ciascuna con unit test in
`vehicle-physics.service.test.ts`:

- `pxPerMeter(lengthMeters, spriteHeightPx=121)` → fattore di scala SI↔px.
- `localToBody(v) = { x: −v.y, y: v.x }` → ponte frame-locale (muso-su) → frame-corpo (avanti=+x).
- `bodyToWorld(v, theta)` / `worldToBody(v, theta)` → rotazioni ±θ tra corpo e mondo.
- `integrateLongitudinalStep(v_x, Fx, mass, dragCoeff, dt)` → un passo SI longitudinale del tracer
  (`v̇_x = Fx/mass − dragCoeff·v_x`), con `v_y = 0`, `ω = 0`.
- `getTotalMass(mass, fuelMass)` → unico punto di verità per la massa (carburante inerte a Step 0).

`physics.constants.ts`: `RHO_AIR`, `G`, soglia blend bassa velocità (dichiarate ora, usate dopo).

---

## Sintesi implementativa dello Step 0

**Ordine dei task (ognuno build-verde):**

1. **Refactor invariante:** estrarre `BaseVehicleActor` (astratto, solo-visivo + geometria assi +
   `rotateToHeading`/`getWheelAxisRotation`/`onPostUpdate`/`setEmitters` + getter astratti
   `heading`/`steeringAngle`); `VehicleActor extends BaseVehicleActor`. **Verifica:** Playwright
   baseline esistente verde.
2. `vehicle-physics.service.ts` + `.test.ts` (funzioni Q10); `physics.constants.ts`.
3. `DriverInputComponent` (`throttleTarget`, `brakeTarget`, `steerTarget`, `reverseToggleRequested`).
4. `PhysicVehicleActor extends BaseVehicleActor` (datasheet completo Q9; stato SI `velM`, `theta`,
   `yawRate`, `heading`, `steeringAngle`; `throttleInput`/`brakeInput`).
5. `PhysicDriveInputSystem` (priorità `Higher`): tastiera → `DriverInputComponent`.
6. `PhysicDriveUpdateSystem`: smoothing pedali (`smoothPedal`) e sterzo (`updateSteeringAngle`,
   `sumClamp`) → tracer longitudinale (Decision 3) → integrazione SI → `actor.vel` in px (Decision 4).
7. `PhysicsDebugHud` (ScreenElement): pedali, accelerazione long., `v` in km/h.
8. `PhysicsPlaygroundScene` (parità Q7, HUD al posto della dashboard Q8) + `Engine.fixedUpdateFps: 60`
   + `const START_SCENE` in `main.ts` (committato `'playground'`).

**File nuovi:** `actors/base-vehicle.actor.ts`, `actors/physic-vehicle.actor.ts`,
`components/driver-input.component.ts`, `systems/physic-drive-input.system.ts`,
`systems/physic-drive-update.system.ts`, `services/vehicle-physics.service.ts`
(+`.test.ts`), `constants/physics.constants.ts`, `scenes/physics-playground.scene.ts`,
`ui/physics-debug-hud.actor.ts`.
**File modificati:** `actors/vehicle.actor.ts` (estende la base), `main.ts` (scene map + `START_SCENE`
+ fixed timestep).

**Checklist di verifica manuale (utente, flippando `START_SCENE='physics'`):**
- L'auto accelera (A) e frena (Z) in **linea retta**, in modo stabile; nessuna esplosione numerica.
- La velocità in km/h nell'HUD sale/scende coerente coi pedali; i pedali nell'HUD seguono i tasti.
- Lo sterzo (frecce) ruota visivamente le ruote anteriori ma **non** curva l'auto (atteso a Step 0).
- L'auto si **ferma contro i muri** (`Fixed`) — collisioni gestite da Excalibur.
- La camera segue l'auto; lo sprite punta lungo l'heading; gli emitter di fumo funzionano.
- La vecchia scena (`START_SCENE='playground'`) è **identica** a prima (baseline intatta).

---
