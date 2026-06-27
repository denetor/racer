# Plan: Step 4 — Motore power-limited + aerodinamica + trazione (fisica a 4 ruote, issue #31)

> Source PRD: `resources/issues/0031-new-physics/step04/prd.md`
> Specs del risultato finale: `resources/issues/0031-new-physics/specs.md` (§3.5, §3.8, §3.9, §3.10)
> Ordine degli step: `resources/issues/0031-new-physics/plan-steps.md`
> Decisioni di dettaglio: `resources/issues/0031-new-physics/step04/grill-me-out.md`

Piano a **slice verticali (tracer bullet)**: ogni fase attraversa l'intera catena
intento → forze per ruota → cerchio di aderenza → integrazione → HUD ed è **dimostrabile a sé**,
guidando la scena dev e/o con gli unit test. Lo Step 4 sostituisce la **propulsione tracer** (Fx
costante al baricentro) col **modello motore reale potenza-limitata** (§3.8–§3.9): il **plateau** di
velocità massima emerge dall'equilibrio `P/v = F_aero + ΣF_roll`, la **trazione** (FWD/RWD/AWD)
distribuisce la spinta, e la **frenata** è separata e distribuita a bias anteriore. La leva nuova è
una sola: la **forza longitudinale entra per-ruota dentro il cerchio di aderenza** (finora
`clampToFrictionCircle` era sempre chiamata con `fx = 0`). Fase 1 introduce motore + aero + trazione;
Fase 2 l'attrito di rotolamento per-ruota; Fase 3 la frenata per-ruota. La frenata resta la **tracer
al baricentro** fino alla Fase 3 (stato transitorio pulito).

## Architectural decisions

Decisioni durature, valide per tutte le fasi (ereditano quelle degli Step 0–3):

- **La spinta longitudinale entra per-ruota dentro il cerchio (§3.5, §3.9).** Drive, freno e
  rotolamento diventano `Fx` **per ruota** e passano per `clampToFrictionCircle(Fx, Fy, μ, Fz)` prima
  della somma; le anteriori sono ruotate di `δ`. Sovra/sottosterzo di potenza, bloccaggio e "tira"
  **emergono** dalla saturazione asimmetrica + trasferimento di carico. L'aerodinamica invece resta
  una **forza netta al baricentro** (l'aria agisce sul corpo, non sul contatto gomma; nessuna coppia).
- **`clampToFrictionCircle` invariata.** È già combinata `fx`/`fy` direzione-preservante: lo Step 4 la
  chiama con `fx ≠ 0`. **Nessun nuovo flag** longitudinale: si riusa `saturated` (la distinzione
  wheelspin/lockup ed effetti grafici/sonori sono Step 5).
- **Blend a bassa velocità: scala SOLO la componente laterale e la coppia di imbardata (§3.10).** La
  domanda laterale (`−Cα·α`) si scala per `k` **prima del clamp**; la longitudinale (drive/freno/
  rotolamento) entra **piena**, l'aero resta piena. Così a bassa velocità il rumore degli `atan2` è
  soppresso ma l'auto **parte da ferma e si arresta** normalmente, e il cerchio resta quasi tutto
  disponibile per la trazione. (Scalare l'intera forza clampata per `k` azzererebbe la trazione sotto
  soglia.) La coppia `mz` resta scalata da `k` come oggi.
- **Motore power-limited (§3.8).** `driveForce(power, fMax, v) = min(fMax, power / max(v, V_FLOOR))`,
  con `v = |v_x|` (longitudinale di corpo). Forte da fermo (= `fMax`), decade come `P/v`; `V_FLOOR`
  evita la divisione per zero. La spinta è firmata da `isReverse`; la retromarcia usa **gli stessi**
  `P`/`F_max` (niente cap dedicato). **Nessun `maxSpeed`/`maxReverseSpeed`**: il plateau emerge.
- **Distribuzione trazione (§3.9).** `distributeDrive(fDrive, drivetrain, driveBias) → WheelLoads`
  (4 quote `Fx`): `fwd` → asse anteriore, `rwd` → posteriore, `awd` → `driveBias` anteriore +
  `(1−driveBias)` posteriore; **50/50 dentro ciascun asse** (surrogato di differenziale aperto; i
  differenziali veri sono rimandati). `fwd`/`rwd` ignorano `driveBias`.
- **Resistenze: aero netta al baricentro, rotolamento per-ruota (§3.8).**
  - `aeroDrag(rho, cd, a, v) = ½·ρ·Cd·A·v²` (modulo); il system applica `−sign(v_x)·aeroDrag` come
    `Fx` al baricentro (0 a `v_x = 0`). `ρ` = `RHO_AIR`.
  - `rollingResistance(crr, rollFactor, fz) = Crr·rollFactor·Fz` (modulo, **per ruota**); il system
    la applica opposta a `v_i_x`, sommandola alla domanda longitudinale della ruota prima del clamp.
    Su superficie uniforme `Σ ≈ Crr·m·g`, coerente con la forma netta della spec.
- **Frenata separata e indipendente (§3.9).** Parametro `brakeForce` (N totale) ripartito da
  `brakeBias` (frazione anteriore) tra gli assi, 50/50 dentro l'asse; ogni quota si oppone al segno di
  `v_i_x` ed entra nel cerchio. **Guardia standstill** mantenuta: se `drive==0`, `brake>0` e il `v_x`
  integrato cambierebbe segno → `v_x = 0` (il freno non manda in retromarcia). Drive e freno si
  **sommano firmati** per ruota (se premuti insieme si annullano in parte).
- **Fisica pura nel service (modulo deep).** Le nuove funzioni vivono in `vehicle-physics.service`
  (indipendente da Excalibur), con unit test colocati, riusando il tipo esistente `WheelLoads`:
  `driveForce`, `aeroDrag`, `rollingResistance`, `distributeDrive`. `clampToFrictionCircle`,
  `wheelVelocity`, `slipAngle`, `lateralForceLinear`, `dynamicLoad`, `integrateBody`, blend: invariate.
- **Costanti generiche in `physics.constants.ts`.** Aggiungere `CRR` (attrito di rotolamento,
  gomma/superficie) e `V_FLOOR` (≈ 1 m/s, per `P/v`). `RHO_AIR`/`G` già presenti. **Niente magic
  number nei system.**
- **Parametri per-veicolo su `PhysicVehicleActor`.** **Rimuovere** i tre placeholder tracer
  (`tracerDriveForce`, `tracerBrakeForce`, `linearDragCoeff`) — `tracerBrakeForce` solo alla Fase 3.
  **Aggiungere** `enginePower` (W), `maxDriveForce` (N), `brakeForce` (N), `brakeBias`,
  `dragCoefficient` (Cd), `frontalArea` (A, m²). **Attivare** `drivetrain`/`driveBias` (già
  dichiarati). Readout HUD `driveForce` (N corrente). Veicoli diversi = solo parametri diversi.
- **Stato per-ruota (`WheelState`).** Aggiungere `rollFactor` (default 1.0, scritto dal
  `SurfacesService`) e `longitudinalForce` (`Fx` per ruota, scritto ogni frame, per l'HUD).
- **Superfici (`SurfacesService`).** Per `PhysicVehicleActor`, accanto a `gripSurface` risolvere anche
  `rollFactor` dallo stack (top `dragFactor`, default 1.0, stessa logica "last-wins") su
  `collisionstart`/`collisionend`. `powerFactor` resta fuori dal flusso; rename
  `SurfaceActor.dragFactor → rollFactor` **rimandato** (toccherebbe il path legacy). Path legacy
  `VehicleActor` invariato.
- **HUD (`PhysicsDebugHud`).** Riga globale: etichetta drivetrain (FWD/RWD/AWD) + `F_drive` (kN) +
  flag **power-limited** (`P/v < F_max`). Cella per ruota: forza longitudinale `Fx`; riuso della
  colorazione `saturated`.
- **Source of truth del moto invariato.** `velBody`/`yawRate` nostri; `actor.vel` scritto in px;
  **`actor.pos` non scritto** (collisioni a Excalibur). Convenzione corpo `x`=avanti, `y`=laterale;
  anchor al centro; baricentro fisso. `bodyAccel` (forza netta/massa, ritardo di un frame) resta la
  fonte del trasferimento di carico dello Step 3. `PhysicDriveUpdateSystem` agnostico alla sorgente
  dell'intento (umano/AI).
- **Coesistenza, non sostituzione.** Toccati solo `PhysicVehicleActor`, `PhysicDriveUpdateSystem`,
  `PhysicsDebugHud`, `vehicle-physics.service`, `physics.constants.ts`, `WheelState`,
  `SurfacesService`. `VehicleActor`, `DriveInputSystem`, `BaseVehicleActor`, `WheelFactor`,
  `SurfaceActor` restano intatti. `main.ts` committato con `START_SCENE='playground'` (flip a
  `'physics'` solo in locale): baseline Playwright non a rischio.
- **Strategia di test.** Unit test (Jest) **solo** sulle funzioni pure del service (`driveForce`,
  `aeroDrag`, `rollingResistance`, `distributeDrive`). Wiring `rollFactor`, composizione forze nel
  system, guardia standstill, aero al baricentro, righe/celle HUD = glue, validati **manualmente**
  guidando.

---

## Phase 1: Motore power-limited + aerodinamica + distribuzione trazione

**User stories**: 1, 2, 3, 4, 5, 6, 13, 14, 15, 16, 17, 18, 19, 20

### What to build

La fetta verticale che sostituisce la **spinta tracer** col **motore reale** e porta la forza motrice
**per-ruota dentro il cerchio**. Funzioni pure nuove: `driveForce(P, F_max, |v_x|)` (con `V_FLOOR`) e
`aeroDrag(ρ, Cd, A, v)`; `distributeDrive(fDrive, drivetrain, driveBias) → WheelLoads`. Nel
`PhysicDriveUpdateSystem.integrateMotion`: la forza motrice totale è `driveForce(...)` firmata da
`isReverse`, distribuita per ruota con `distributeDrive`; la quota `Fx` di ogni ruota entra in
`clampToFrictionCircle(Fx_drive, k·Fy, μ, Fz)` (anteriori ruotate di `δ`); l'**aero** è una forza
netta al baricentro `−sign(v_x)·aeroDrag(...)`, fuori dal loop e dal blend. Si applica il **blend
split** (longitudinale piena, laterale × `k`, coppia × `k`). Si **rimuovono** `tracerDriveForce` e
`linearDragCoeff`; si aggiungono i parametri `enginePower`, `maxDriveForce`, `dragCoefficient`,
`frontalArea` e si **attivano** `drivetrain`/`driveBias`; readout `driveForce`. Costanti `V_FLOOR`.
La **frenata resta transitoriamente** la tracer al baricentro (`tracerBrakeForce` ancora presente),
così l'auto si ferma fino alla Fase 3. L'HUD aggiunge la riga globale drivetrain + `F_drive` (kN) +
flag power-limited, e il campo `longitudinalForce`/`Fx` per ruota (con `WheelState.longitudinalForce`).
Risultato dimostrabile: accelerazione **forte da ferma che cala** con la velocità, **plateau** che si
assesta da solo (da aero), e **carattere** FWD/RWD/AWD distinto (potenza-sterzo emergente dal drive
per-ruota + trasferimento di carico dello Step 3).

### Acceptance criteria

- [ ] `driveForce` (pura) testata: `v ≤ V_FLOOR` → `fMax` (forte da fermo); ramo `P/v` per `v` alto;
  monotonia decrescente in `v`; nessuna divisione per zero a `v = 0`.
- [ ] `aeroDrag` (pura) testata: ∝ `v²` (raddoppiando `v` quadruplica); 0 a `v = 0`; scala con
  `Cd·A·ρ`.
- [ ] `distributeDrive` (pura) testata: `fwd`/`rwd` azzerano l'asse opposto; `awd` rispetta
  `driveBias`; somma delle 4 quote = `fDrive`; split 50/50 dentro l'asse; `driveBias` ignorato per
  fwd/rwd.
- [ ] La forza motrice entra **per-ruota** nel cerchio (`clampToFrictionCircle` con `fx ≠ 0`),
  anteriori ruotate di `δ`; l'aero è una forza netta al baricentro (nessuna coppia); il **blend** scala
  solo la laterale (e la coppia), la longitudinale resta piena.
- [ ] `enginePower`/`maxDriveForce`/`dragCoefficient`/`frontalArea` su `PhysicVehicleActor`;
  `drivetrain`/`driveBias` attivi; `V_FLOOR` in `physics.constants.ts`; `tracerDriveForce`/
  `linearDragCoeff` rimossi; nessun magic number nel system; nessun `maxSpeed`/`maxReverseSpeed`.
- [ ] HUD: riga globale con drivetrain (FWD/RWD/AWD), `F_drive` (kN) e flag **power-limited**
  (`P/v < F_max`); per ruota la forza longitudinale `Fx` (`WheelState.longitudinalForce`).
- [ ] Guidando: accelerazione da fermo **decisa** che **cala** con la velocità; la **velocità massima**
  si **assesta** (plateau) senza tetto, e cambia spostando `P` o `Cd·A`; **RWD** tende al sovrasterzo
  di potenza, **FWD** a sottosterzo/pattinamento in uscita, **AWD** più neutro (regolabile via
  `driveBias`); da fermo si **parte** dolcemente (longitudinale non scalato dal blend) senza vibrazioni;
  la **retromarcia** funziona con lo stesso motore. La frenata transitoria (tracer) ferma ancora l'auto.
- [ ] `actor.pos` non scritto; baricentro fisso; `bodyAccel` (Step 3) invariato; system agnostico alla
  sorgente dell'intento.
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovi test `driveForce`, `aeroDrag`,
  `distributeDrive`); baseline Playwright invariata (`START_SCENE='playground'`).

---

## Phase 2: Attrito di rotolamento per-ruota (l'erba frena e "tira")

**User stories**: 11, 12, 16, 18, 19, 20

### What to build

Si aggiunge l'**attrito di rotolamento per ruota**, completando l'equilibrio del plateau
(`P/v = F_aero + ΣF_roll`) e facendo emergere il costo delle superfici lente. Funzione pura
`rollingResistance(Crr, rollFactor, Fz)`; costante `CRR` in `physics.constants.ts`. Si aggiunge
`rollFactor` a `WheelState` (default 1.0) e si estende il `SurfacesService` perché, accanto a
`gripSurface`, risolva anche `rollFactor` dallo stack (top `dragFactor` della superficie, default 1.0,
stessa logica "last-wins") su `collisionstart`/`collisionend` per `PhysicVehicleActor`. Nel system,
nel loop per-ruota, la `rollingResistance(CRR, rollFactor_i, Fz_i)` (opposta a `v_i_x`, con `Fz`
dinamico dello Step 3) si **somma alla domanda longitudinale** della ruota **prima del clamp**.
Risultato dimostrabile: **sull'erba** (rollFactor alto) l'auto **rallenta in rettilineo** e la velocità
massima si abbassa; con **mezza auto sull'erba** la resistenza asimmetrica genera una coppia che fa
**tirare** il veicolo verso il lato lento.

### Acceptance criteria

- [ ] `rollingResistance` (pura) testata: ∝ `Fz` e ∝ `rollFactor`; 0 a `Fz = 0`.
- [ ] `WheelState.rollFactor` esiste (default 1.0); il `SurfacesService` lo risolve dallo stack
  (top `dragFactor`, default 1.0 fuori superficie) accanto a `gripSurface`, su collisionstart/end, solo
  per `PhysicVehicleActor`; `powerFactor` resta fuori dal flusso; path legacy `VehicleActor` invariato.
- [ ] Il rotolamento entra **per ruota** nella domanda longitudinale (opposto a `v_i_x`, con `Fz`
  dinamico) **prima** del cerchio; `CRR` in `physics.constants.ts`; nessun magic number nel system; su
  superficie uniforme `Σ F_roll ≈ Crr·m·g`.
- [ ] Guidando: **sull'erba** l'auto rallenta in rettilineo e il plateau si abbassa; **mezza auto
  sull'erba** la fa **tirare** verso il lato lento (coppia da rotolamento asimmetrico); su tarmac
  uniforme nessuna deriva indotta.
- [ ] Il blend a bassa velocità resta corretto (la longitudinale, incluso il rotolamento, non è scalata
  da `k`); nessuna instabilità.
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovo test `rollingResistance`); baseline
  Playwright invariata.

---

## Phase 3: Frenata per-ruota a bias anteriore

**User stories**: 7, 8, 9, 10, 16, 18, 19, 20

### What to build

Si completa lo Step 4 sostituendo la **frenata transitoria** (tracer al baricentro) col **freno reale
per-ruota**. Si **rimuove** `tracerBrakeForce`; si aggiungono `brakeForce` (N totale) e `brakeBias`
(frazione anteriore) su `PhysicVehicleActor`. Nel system, il freno è ripartito da `brakeBias` tra gli
assi e 50/50 dentro l'asse; la quota di ogni ruota si **oppone al segno di `v_i_x`** e si **somma
firmata** alla quota motrice (`Fx_long = drive_i − sign(v_i_x)·brake_i − sign(v_i_x)·roll_i`), poi
entra nel cerchio. Si **mantiene** la guardia standstill già presente (se `drive==0`, `brake>0` e il
`v_x` integrato cambierebbe segno → `v_x = 0`), ora coerente col freno per-ruota. Risultato
dimostrabile: **frenata decisa con bias anteriore** (le anteriori si caricano — grazie al
trasferimento dello Step 3 — e **saturano prima**, cella rossa); **frenando in curva** l'interno si
alleggerisce e satura prima (bloccaggio/coppia di imbardata emergenti); **drive + freno insieme** si
annullano in parte senza scatti; il **freno non manda in retromarcia** da fermo.

### Acceptance criteria

- [ ] `brakeForce`/`brakeBias` su `PhysicVehicleActor`; `tracerBrakeForce` rimosso (tutti e tre i
  campi tracer ora eliminati); nessun magic number nel system.
- [ ] Il freno è distribuito per ruota (bias anteriore via `brakeBias`, 50/50 dentro l'asse), opposto a
  `v_i_x`, **sommato firmato** al drive, ed entra nel cerchio (clamp combinato `Fx`/`Fy`); il
  `WheelState.longitudinalForce` riflette il netto.
- [ ] Guardia standstill mantenuta: con `drive==0`, `brake>0` e `v_x` in inversione di segno → `v_x=0`;
  il freno **non** porta l'auto in retromarcia.
- [ ] Guidando: frenata **decisa**, bias anteriore visibile (anteriori più cariche/saturano prima,
  celle rosse); **frenando in curva** l'interno si alleggerisce e satura prima; **gas+freno insieme**
  si compensano senza discontinuità; il freno ferma l'auto allo standstill.
- [ ] `actor.pos` non scritto; baricentro fisso; system agnostico alla sorgente dell'intento; baseline
  Playwright invariata (`START_SCENE='playground'`).
- [ ] `npm run build` verde; `npm run test:unit` verde (la frenata è glue: nessuna nuova funzione pura
  obbligatoria; se si estrae uno split di frenata in funzione pura, va testato come `distributeDrive`).
- [ ] Checklist di verifica manuale dello `step04/grill-me-out.md` interamente soddisfatta guidando con
  `START_SCENE='physics'`.