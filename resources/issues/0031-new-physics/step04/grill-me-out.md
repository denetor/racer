# Grill-me — Step 4 (Motore power-limited + aerodinamica + trazione)

> Interview di dettaglio sull'implementazione dello **Step 4** di `plan-steps.md`, alla luce di
> `specs.md` (§3.8, §3.9, §3.5, §3.10) e della struttura software esistente (post Step 3). Obiettivo
> dello Step 4: sostituire la **propulsione "tracer"** (Fx costante al baricentro) col **modello
> motore reale potenza-limitata**, far **emergere il plateau** di velocità massima dall'equilibrio
> `P/v = F_aero + F_roll`, e introdurre la **distribuzione di trazione** (FWD/RWD/AWD) con la
> **frenata separata** distribuita sulle quattro ruote a bias anteriore. Restano fuori scope:
> pattinamento/bloccaggio **espliciti** con flag alto/basso ed effetti (Step 5), usura/carburante
> e statistiche (Step 6), differenziali (rimandati).

## Ricognizione codice (stato post Step 3)

- **`vehicle-physics.service.ts`** espone (test colocati): `pxPerMeter`, `bodyToWorld`, `worldToBody`,
  `localToBody`, `getTotalMass`, `integrateLongitudinalStep`, `integrateBody` (termini incrociati
  §3.7), `kinematicYawRate`, `wheelVelocity`, `slipAngle`, `lateralForceLinear`,
  `lowSpeedKinematicBlend`, `staticLoad`, `longitudinalLoadTransfer`, `lateralLoadTransfer`,
  `dynamicLoad`, `clampToFrictionCircle` (cerchio `μ·Fz` + flag `saturated`, **già scritta in forma
  combinata `fx`/`fy`** pronta per lo Step 4 — oggi chiamata con `fx=0`). Tipi: `Vec2`, `WheelArms`,
  `WheelLoads`, `BodyMotion`, `ClampedForce`, `LowSpeedBlend`.
- **`PhysicDriveUpdateSystem.integrateMotion`** (oggi): la spinta longitudinale è la **tracer**
  (`fxTracer = driveForce − sign(vx)·brakeForce + dragForce`) applicata **al baricentro** (nessuna
  coppia, non clampata); per ruota calcola `wheelVelocity → slipAngle → lateralForceLinear →
  clampToFrictionCircle(0, fLat, μ, Fz_dinamico)`, ruota le anteriori di `δ`, somma
  `fxTyre`/`fyTyre`/`mzTyre`. Il blend `k` (`lowSpeedKinematicBlend`) scala **forze gomma + coppia**;
  `fxTracer` **non** è scalato. Salva `bodyAccel = (fx/m, fy/m)` per il trasferimento del frame dopo.
- **`PhysicVehicleActor`**: datasheet con `mass`, `lengthMeters`, `cogPosition`, `cogHeight`,
  `corneringStiffnessFront/Rear`, `drivetrain: 'rwd'`, `driveBias: 0`, fuel (inerte), pedali/sterzo,
  e i **placeholder tracer** `tracerDriveForce` (6000 N), `tracerBrakeForce` (9000 N),
  `linearDragCoeff` (0.2). Getter geometrici: `wheelbaseMeters` (L), `trackFrontMeters`,
  `trackRearMeters`, `trackMeters`, `Iz`, `totalMass`, `wheelArmsBody`, `pxPerMeter`.
- **`WheelState`**: `gripSurface`, `load` (Fz dinamico), `loadStatic`, `slipAngle`, `saturated`,
  `surfaces[]`. **Manca `rollFactor`** (oggi la superficie espone ancora `dragFactor`, non letto dal
  nuovo flusso).
- **`SurfaceActor`/`SurfacesService`**: la superficie ha `gripFactor`, `dragFactor`, `powerFactor`;
  `setProperties` gestisce `collisionstart`/`collisionend`, per `PhysicVehicleActor` aggiorna lo
  stack `surfaces` e `gripSurface` ("last-wins"). `powerFactor` è fuori dal nuovo flusso.
- **`physics.constants.ts`**: `RHO_AIR = 1.225` (già pronta per l'aero), `G = 9.81`,
  `DEFAULT_SURFACE_GRIP = 1.0`, `LOW_SPEED_BLEND_THRESHOLD = 5`. **Manca `CRR`**.
- **HUD (`PhysicsDebugHud`)**: righe globali (km/h+marcia, gas/brake, `aLong`, `yaw`, slip f/r) +
  griglia 2×2 con `μ`, `Fz` (N) + barra di carico, slip (°); cella rossa se `saturated`.

### Osservazione chiave: la spinta passa **da baricentro a per-ruota dentro il cerchio**

Lo Step 4 è il primo che mette **forza longitudinale dentro la `clampToFrictionCircle`**. Finora il
`fx` del cerchio era sempre `0`; ora ogni ruota motrice riceve una quota di `F_drive` (e ogni ruota
una quota di freno + attrito di rotolamento), e il **clamp combinato `√(Fx²+Fy²) ≤ μ·Fz`** comincia a
mordere. Questo è ciò che apre la strada al sovra/sottosterzo di potenza (§3.9) e — allo Step 5 — al
pattinamento/bloccaggio espliciti. L'aerodinamica invece resta **al baricentro** (agisce sul corpo,
non sul contatto gomma).

---

## Question 1: Dove si applica `F_drive` nella pipeline?

La tracer applica `Fx` costante **al baricentro**, fuori dal cerchio. Lo Step 4 deve decidere se la
spinta reale resta al baricentro o entra **per-ruota dentro il cerchio di aderenza**.

### Decision:

**Per-ruota, dentro il cerchio di aderenza.** `distributeDrive` ripartisce `F_drive` sulle ruote
motrici (split 50/50 dentro l'asse); la quota `Fx` di ogni ruota entra in
`clampToFrictionCircle(Fx, Fy, μ, Fz)` **prima della somma**, le anteriori ruotate di `δ`. Sovra/
sottosterzo di potenza e (Step 5) pattinamento per-ruota **emergono** dalla saturazione asimmetrica +
trasferimento di carico, come vuole §3.9. (Scartata: spinta netta al baricentro non clampata —
semplice ma incapace di produrre potenza-sterzo o pattinamento per-ruota: vanifica Step 4/5.)

---

## Question 2: Quale `v` in `min(F_max, P/v)`, e gestione near-zero / retromarcia?

A `v→0`, `P/v→∞`, quindi `F_drive=F_max` (forte da fermo) — ma serve evitare la divisione per zero, e
decidere se `v` è il longitudinale o il modulo, e come si comporta la retromarcia (i tetti
`maxSpeed`/`maxReverseSpeed` vengono rimossi).

### Decision:

**`|v_x|` con floor; `F_max` da fermo; segno dalla marcia.** Si usa la velocità longitudinale di
corpo `|v_x|`: `F_drive_tot = min(F_max, P / max(|v_x|, V_FLOOR))`, così rende `F_max` da fermo senza
dividere per zero. La spinta totale viene poi distribuita alle ruote motrici e **firmata dalla marcia**
(`isReverse`). La retromarcia usa lo **stesso** `P`/`F_max` (è naturalmente lenta perché l'aero la
frena, nessun cap rigido). (Scartate: modulo `|v|` (hypot) — diverge da `|v_x|` solo in scivolata e
sporca il modello longitudinale; potenza/`F_max` di retromarcia separati — più realistico ma parametri
extra, e il vecchio cap di retromarcia sparisce comunque.)

```ts
const v = Math.max(Math.abs(vehicle.velBody.x), V_FLOOR);   // V_FLOOR generica (es. 1 m/s)
const fDriveTotal = Math.min(vehicle.maxDriveForce, vehicle.enginePower / v);
const driveDir = vehicle.isReverse ? -1 : 1;
// poi distribuita per ruota e firmata da driveDir
```

---

## Question 3: Modello della frenata (sostituisce `tracerBrakeForce`)?

§3.9: la frenata è **separata e indipendente** dalla trazione, su tutte e quattro le ruote con bias
anteriore. Va deciso se per-ruota dentro il cerchio o netta al baricentro.

### Decision:

**`Fx` per-ruota opposta a `v_i_x`, bias anteriore, dentro il cerchio.** Un parametro `brakeForce`
(N totale) ripartito da `brakeBias` (frazione anteriore, es. 0.6) tra i due assi, poi 50/50 dentro
ogni asse. Il `Fx` di freno di ciascuna ruota si oppone al **segno della velocità longitudinale di
quella ruota** e si somma al suo `Fx` motore; il `Fx` combinato entra nel cerchio. Bloccaggio/coppia
di imbardata in frenata **emergono** per-ruota (base per Step 5). Si **mantiene** il clamp di
standstill esistente (il freno non manda l'auto in retromarcia). (Scartata: freno netto al baricentro
— niente bloccaggio per-ruota né effetti freno-in-curva.)

---

## Question 4: Aerodinamica e attrito di rotolamento — dove si applicano?

Tensione tra le fonti: §3.8 dà `F_roll = Crr·m·g` (**netta** al baricentro), mentre `plan-steps`
Step 4 elenca `rollingResistance(Crr, rollFactor_i, Fz_i)` **per-ruota** (per far "rallentare
sull'erba" / "tirare").

### Decision:

**Aero netta al baricentro; attrito di rotolamento per-ruota dentro il cerchio.**
- `aeroDrag = ½·ρ·Cd·A·v²` (modulo) applicata come **unica forza longitudinale al baricentro**,
  opposta a `v_x` (nessuna coppia: l'aria agisce sul corpo). `ρ` = `RHO_AIR`.
- `rollingResistance(Crr, rollFactor_i, Fz_i)` calcolata **per ruota** (usa il `rollFactor` della
  superficie sotto quella ruota e il suo `Fz` dinamico), opposta a `v_i_x`, sommata al `Fx` di quella
  ruota **prima del clamp**.

Segue `plan-steps` (per-ruota) e fa **emergere** "sull'erba l'auto rallenta in rettilineo" e il "tira"
su superfici asimmetriche; su superficie uniforme `Σ Crr·rollFactor·Fz ≈ Crr·m·g`, coerente con §3.8.
(Scartate: entrambe nette al baricentro — letterale a §3.8 ma `rollFactor` non varia per ruota,
contraddice `plan-steps` e la verifica "sull'erba rollFactor alto"; aero anch'essa per-ruota —
fisicamente sbagliato, introduce coppia spuria.)

---

## Question 5: Da dove arriva `rollFactor` per ruota, e dove vive `Crr`?

`rollFactor` è per-superficie ma `WheelState` non lo ha ancora (la superficie espone ancora
`dragFactor`). Va deciso il wiring e la casa di `Crr`.

### Decision:

**Aggiungere `rollFactor` a `WheelState` via `SurfacesService`; `Crr` costante generica.** Si aggiunge
`rollFactor` a `WheelState`, popolato dal `SurfacesService` dal valore `dragFactor` della superficie
(stesso meccanismo "last-wins" di `gripSurface`, dallo stack; default `1.0` fuori superficie). `Crr` è
una costante generica `CRR` in `physics.constants.ts`. `rollingResistance = Crr·rollFactor_i·Fz_i`.
Rinvia il refactor pieno di `WheelFactor` (residuo dello Step 2) ma tiene pulito il nuovo flusso.
(Scartate: rinominare già ora `SurfaceActor.dragFactor → rollFactor` — tocca il path legacy
`WheelFactor.drag` e rischia la baseline Playwright, più scope del necessario; `Crr` per-veicolo — il
coefficiente è gomma/superficie, non veicolo: la costante generica è la casa giusta.)

```ts
// WheelState: + public rollFactor: number = 1.0;
// SurfacesService.resolveGrip-like: state.rollFactor = top ? top.dragFactor : 1.0;
```

---

## Question 6: Destino dei campi tracer e nuovi parametri per-veicolo?

I tre placeholder (`tracerDriveForce`, `tracerBrakeForce`, `linearDragCoeff`) e i tetti
`maxSpeed`/`maxReverseSpeed` (questi ultimi già assenti dal nuovo attore) vanno sostituiti dal modello
reale.

### Decision:

**Rimuovere i campi tracer; aggiungere `enginePower`, `maxDriveForce`, `brakeForce`, `brakeBias`,
`dragCoefficient`, `frontalArea`.** Si cancellano i tre campi tracer (lo Step 4 possiede il modello
reale). Si aggiungono a `PhysicVehicleActor`:
- `enginePower` `P` (W),
- `maxDriveForce` `F_max` (N — eredita il ruolo di `tracerDriveForce`),
- `brakeForce` (N totale),
- `brakeBias` (frazione anteriore, es. 0.6),
- `dragCoefficient` `Cd`,
- `frontalArea` `A` (m²).

`ρ` (`RHO_AIR`) e `Crr` restano costanti generiche. Nessun `maxSpeed`/`maxReverseSpeed`: il **plateau
emerge** dall'equilibrio. (Scartata: tenere i campi tracer come fallback morto — stato inutile e
confusione; il plan dice di sostituire la tracer.)

---

## Question 7: Interazione col blend a bassa velocità (la spinta è ora dentro il cerchio)?

Oggi la forza gomma clampata (solo laterale) è scalata dal blend `k`. Con `Fx` (drive/brake/roll)
**dentro** il clamp per-ruota, scalare l'intera forza clampata per `k` azzererebbe la trazione a bassa
velocità (impossibile partire da fermo).

### Decision:

**Il blend scala solo la componente laterale + la coppia di imbardata; il `Fx` longitudinale resta
pieno.** La domanda laterale (`fLat = −Cα·α`) viene scalata per `k` **prima del clamp**, la domanda
longitudinale (drive + freno + rotolamento) entra **piena**; poi `clampToFrictionCircle(fxLong,
k·fLat, μ, Fz)`. Vantaggio doppio: a bassa velocità (a) il rumore degli `atan2` è soppresso, e (b) il
cerchio è quasi tutto disponibile per la trazione, così l'auto parte da fermo e frena fino
all'arresto normalmente. L'aero (al baricentro) e il clamp standstill restano fuori dal blend. Coerente
con §3.10 (solo le forze laterali da slip angle sono rumore a bassa velocità). (Scartata: scalare
l'intera forza clampata per `k` — l'auto avrebbe trazione ≈0 sotto soglia, non potrebbe accelerare da
fermo.)

```ts
// per ruota:
const fLat = k * lateralForceLinear(alpha, cAlpha);      // laterale scalata dal blend
const fxLong = driveShare - Math.sign(wv.x)*brakeShare - Math.sign(wv.x)*roll_i; // longitudinale piena
const clamped = clampToFrictionCircle(fxLong, fLat, mu, fz);
// la coppia mz resta scalata da k come oggi (componente di imbardata)
```

---

## Question 8: `distributeDrive` — forma di ritorno e semantica di `driveBias`?

`plan-steps`: `distributeDrive(F_drive, drivetrain, driveBias)` → quota di `Fx` per ruota, split 50/50
dentro l'asse, differenziali rimandati.

### Decision:

**Ritorna `WheelLoads` per-ruota; `awd` usa `driveBias` come frazione anteriore.** Ritorna una
`WheelLoads` (4 quote `Fx` per ruota). `fwd` → tutto all'asse anteriore, `rwd` → tutto al posteriore,
`awd` → `driveBias·F_drive` all'anteriore e `(1−driveBias)·F_drive` al posteriore; **50/50 dentro
ciascun asse** (surrogato di differenziale aperto). `fwd`/`rwd` ignorano `driveBias`. Il loop di update
legge la quota della propria ruota. Riusa il pattern `WheelLoads` già usato da `staticLoad`/
`dynamicLoad`. (Scartata: ritorno per-asse `{front, rear}` — meno coerente col loop già chiavato per
ruota, sposta lo split 50/50 nella glue.)

```ts
distributeDrive(fDrive, drivetrain, driveBias): WheelLoads // 4 quote Fx
```

---

## Question 9: Come si combinano drive e freno per ruota, e lo standstill?

La domanda longitudinale di una ruota può contenere sia trazione sia freno; va deciso come si sommano e
come si gestisce l'arresto, ora che il freno è per-ruota dentro il cerchio.

### Decision:

**Somma firmata: `Fx_long = drive_i − sign(v_i_x)·brake_i (− sign(v_i_x)·roll_i)`; si mantiene il clamp
standstill al baricentro.** La domanda longitudinale di ogni ruota = la sua quota motrice meno una
quota frenante opposta al `v_i_x` di quella ruota (più l'attrito di rotolamento, anch'esso opposto a
`v_i_x`). Drive e freno **si sommano** (se premuti insieme si annullano in parte — realistico). Si
mantiene la **guardia di arresto a livello corpo** già presente: se `drive==0`, `brake>0` e il `v_x`
integrato cambierebbe segno, si clampa `v_x` a `0` così il freno non manda l'auto in retromarcia.
(Scartata: il freno sovrascrive il drive quando premuto — più semplice ma perde il left-foot-braking e
crea una discontinuità.)

---

## Question 10: Cosa aggiunge l'HUD e quale stato si espone?

`plan-steps` Step 4 HUD: "`F_drive`/regime, indicazione drivetrain".

### Decision:

**Globale: etichetta drivetrain + `F_drive` (kN) con flag power-limited; per-ruota: `Fx`
longitudinale.** Si aggiunge una riga globale col `drivetrain` (FWD/RWD/AWD) e l'`F_drive` totale
corrente in kN, segnalando quando è **power-limited** (`P/v < F_max`). Si salva `F_drive` sull'attore
(come `longitudinalAccel`). Si aggiunge la **forza longitudinale `Fx` per ruota** a `WheelState` + alla
cella della griglia, così la distribuzione trazione/freno è visibile. Si riusa la colorazione
`saturated` esistente. (Scartata: solo `F_drive` globale + drivetrain senza `Fx` per ruota — meno
diagnostico per tarare potenza-sterzo/pattinamento.)

---

## Decisioni implementative prese per convenzione (non richiedono giudizio dell'utente)

- **Nuove funzioni pure** in `vehicle-physics.service.ts` (con test colocati):
  - `driveForce(power, fMax, v)` → `min(fMax, power / max(v, V_FLOOR))` (`v` già `|v_x|`, `≥0`);
  - `aeroDrag(rho, cd, a, v)` → `½·ρ·Cd·A·v²` (modulo; il segno opposto a `v_x` lo mette il system);
  - `rollingResistance(crr, rollFactor, fz)` → `Crr·rollFactor·Fz` (modulo; segno opposto a `v_i_x`);
  - `distributeDrive(fDrive, drivetrain, driveBias)` → `WheelLoads` (Q8).
  Riusano i tipi `WheelLoads`/`Vec2` esistenti; nessun accesso a Excalibur.
- **`clampToFrictionCircle`** è **già** in forma combinata `fx`/`fy` direzione-preservante: lo Step 4
  la chiama con `fx ≠ 0`. **Nessun nuovo flag** longitudinale (wheelspin/lockup alto/basso) in questo
  step: si **riusa `saturated`** (combinato). La distinzione e gli effetti grafici/sonori sono Step 5.
- **`physics.constants.ts`**: aggiungere `CRR` (attrito di rotolamento, generico) e `V_FLOOR`
  (velocità minima per `P/v`, es. 1 m/s). `RHO_AIR`/`G` già presenti. Nessun magic number nel system.
- **`PhysicVehicleActor`**: rimuovere `tracerDriveForce`/`tracerBrakeForce`/`linearDragCoeff`;
  aggiungere `enginePower`, `maxDriveForce`, `brakeForce`, `brakeBias`, `dragCoefficient`,
  `frontalArea` (Q6); aggiungere readout `driveForce` (N, per l'HUD). `drivetrain`/`driveBias` (già
  presenti) diventano **attivi**.
- **`WheelState`**: aggiungere `rollFactor` (default 1.0, scritto dal `SurfacesService`, Q5) e
  `longitudinalForce` (`Fx`, scritto ogni frame dall'update, per l'HUD).
- **`SurfacesService`**: in `collisionstart`/`collisionend` per `PhysicVehicleActor`, accanto a
  `gripSurface` risolvere anche `rollFactor` dallo stack (top `dragFactor`, default 1.0). `powerFactor`
  resta fuori dal flusso. Path legacy `VehicleActor` invariato.
- **`PhysicDriveUpdateSystem.integrateMotion`**: sostituire il blocco tracer con
  `driveForce(...) → distributeDrive(...)`; nel loop per-ruota comporre `Fx_long` (drive − freno −
  rotolamento, firmati su `v_i_x`) + `Fy` (laterale scalata da `k`), `clampToFrictionCircle`, ruotare
  le anteriori di `δ`, sommare forze/coppia; **aggiungere l'aero al baricentro** (fuori dal loop, fuori
  dal blend). Mantenere `bodyAccel = (fx/m, fy/m)`, la guardia standstill, l'aggiornamento heading/`θ`
  e la scrittura di `actor.vel`. `actor.pos` resta non scritto.
- **Aero — segno**: il system applica `−sign(v_x)·aeroDrag(...)` (oppure `−½ρCdA·v_x·|v_x|`) come `Fx`
  al baricentro; a `v_x=0` l'aero è 0.
- **Unit test** (strategia consolidata: solo funzioni pure; attore/system/HUD/superfici = glue,
  verifica manuale): `driveForce` (limite `F_max` da fermo; ramo `P/v` ad alta velocità; floor);
  `aeroDrag` (∝ `v²`); `rollingResistance` (∝ `Fz`·`rollFactor`); `distributeDrive` (fwd/rwd
  azzerano l'asse opposto; awd rispetta `driveBias`; somma = `F_drive`; 50/50 dentro l'asse).
- **`main.ts` committato con `START_SCENE='playground'`** (flip a `'physics'` solo in locale per la
  verifica), per non rompere la baseline Playwright.
- **Plateau**: nessun tetto rigido; emerge dall'equilibrio `P/v = F_aero + ΣF_roll`. Nessun
  `maxSpeed`/`maxReverseSpeed`.

---

## Parametri da tarare a mano (durante la verifica)

`enginePower` `P` e `maxDriveForce` `F_max` (sagomano accelerazione da fermo vs ripresa, e il punto di
plateau insieme a `Cd·A`); `dragCoefficient` `Cd` e `frontalArea` `A` (posizione del plateau);
`brakeForce` e `brakeBias` (potenza/tendenza al bloccaggio anteriore); `CRR` e i `dragFactor`/
`rollFactor` delle superfici (quanto l'erba rallenta in rettilineo); `V_FLOOR` (dolcezza della spinta
near-zero); `drivetrain`/`driveBias` (carattere FWD/RWD/AWD). Interagiscono con `cogHeight`/
`corneringStiffness*`/grip dello Step 3 (potenza-sterzo dipende dal trasferimento di carico).

---

## Checklist di verifica manuale dello Step 4 (utente, con `START_SCENE='physics'`)

- **Accelerazione forte da fermo** che **cala con la velocità** (regime `P/v` dopo il tratto `F_max`);
  l'HUD mostra `F_drive` che scende e il flag power-limited che si accende.
- **Velocità massima** che si **assesta da sola** (plateau) senza tetto rigido; sale/scende cambiando
  `Cd·A` o `P`.
- Con `drivetrain='rwd'` tendenza al **sovrasterzo di potenza**; `'fwd'` a **sottosterzo/pattinamento**
  in uscita di curva; `'awd'` più trazione/neutro, regolabile con `driveBias`.
- **Sull'erba** (`rollFactor` alto) l'auto **rallenta in rettilineo**; metà auto sull'erba la fa
  **tirare** (coppia da rotolamento asimmetrico).
- **Frenata**: decelerazione decisa, bias anteriore (le anteriori si caricano/saturano prima, cella
  rossa); il freno **non** manda l'auto in retromarcia (clamp standstill).
- Nessuna **instabilità**/oscillazione; da fermo/lentissimo si **parte** normalmente (longitudinale
  non scalato dal blend) e non vibra (laterale scalato).
- L'HUD mostra drivetrain, `F_drive` (kN) + flag power-limited, e `Fx` per ruota coerente con
  trazione/freno.
- `npm run build` verde; `npm run test:unit` verde (nuovi test `driveForce`, `aeroDrag`,
  `rollingResistance`, `distributeDrive`).
- Con `START_SCENE='playground'` la scena vecchia resta **identica** (baseline Playwright intatta).