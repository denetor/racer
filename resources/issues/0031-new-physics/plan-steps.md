# Piano di implementazione — Fisica veicolare a 4 ruote (issue #31)

> Elenco ordinato degli step per implementare `specs.md`. Deriva da `grill-me-out.md`, che contiene
> le decisioni di design discusse. Principio guida: **ogni step è autoconsistente, mergeabile e
> verificabile** — build verde, unit test sulle funzioni pure introdotte, e **verifica manuale
> dell'utente** che guida nella scena dev osservando un HUD di debug.

## Convenzioni trasversali (valgono per tutti gli step)

- **Coesistenza, non sostituzione.** Le nuove classi affiancano `VehicleActor`/`DriveInputSystem`,
  che restano la baseline Playwright fino allo Step 6. Il nuovo modello vive in una scena dev
  dedicata `PhysicsPlaygroundScene`, selezionata in `main.ts` via env/flag.
- **Split input/fisica.** `PhysicDriveInputSystem` (priorità più alta) traduce tastiera →
  `DriverInputComponent` (target normalizzati); `PhysicDriveUpdateSystem` legge il component e fa
  smoothing + fisica + rendering. Il component è l'unico contratto: apre la strada a un futuro
  `AiDriveInputSystem` senza toccare l'update.
- **Funzioni pure** in `vehicle-physics.service.ts` (con `.test.ts` colocato); **stato/parametri**
  su `PhysicVehicleActor`; **orchestrazione** nei due system.
- **Unità SI** internamente (kg, m/s, N, rad); conversione in pixel solo alla scrittura di
  `actor.pos`/`actor.vel`. `pxPerMeter` derivato da `lengthMeters` e altezza sprite (121 px).
- **Convenzione corpo:** `x` = avanti, `y` = laterale per tutta la matematica fisica (standard).
- **Sprite muso in alto: si lascia com'è.** L'arte è disegnata col muso verso l'alto, quindi nel
  frame locale dell'actor l'avanti è `−y`. Non si ruota lo spritesheet (romperebbe la base visiva
  condivisa col vecchio attore, per zero benefici fisici). Il disaccoppiamento arte↔fisica vive in
  **due punti soli**: l'offset `+ π/2` in `rotateToHeading()` (mondo) e una **funzione pura
  `localToBody(v)` = `{x: −v.y, y: v.x}`** nel `vehicle-physics.service`, usata per i bracci `r_i`.
- **Anchor al centro** (default Excalibur): `cogPosition` e bracci `r_i` condividono l'*origine* col
  rendering; resta solo la rotazione di 90° locale↔corpo gestita da `localToBody`.
- **Niente magic number nei system:** costanti generiche in `physics.constants.ts`, costanti
  per-veicolo sul file dell'attore.
- **HUD di debug** nella scena dev: cresce step dopo step, mostra le grandezze appena introdotte.
- **Definizione di "done" per step:** (1) `npm run build` verde; (2) `npm run test:unit` verde con i
  nuovi test delle funzioni pure; (3) checklist di verifica manuale soddisfatta guidando.

---

## Step 0 — Impalcatura + propulsione "tracer"

**Obiettivo.** Mettere in piedi tutta l'architettura nuova e poter **lanciare il gioco e muovere
l'auto** con una propulsione banale, validando end-to-end la pipeline input → component → fisica →
integrazione → rendering. Nessuna fisica a forze reale ancora.

**Lavoro.**
1. **Refactor a comportamento invariato:** estrarre `BaseVehicleActor` da `VehicleActor` con il solo
   setup visivo (sprite, 4 ruote-figlie, assi, emitter, collider composito) e gli hook di rendering
   (`rotateToHeading`, `getWheelAxisRotation`, `onPostUpdate`, `setEmitters`, mappa `wheelFactors`).
   `VehicleActor extends BaseVehicleActor`, comportamento identico → verificabile contro la baseline
   Playwright esistente *prima* di introdurre fisica nuova.
2. `PhysicVehicleActor extends BaseVehicleActor`: aggiunge lo stato a corpo rigido (`vel` vettore
   mondo, `heading`, `yawRate`) e i parametri SI per-veicolo (`mass` ex `weight`, `lengthMeters`,
   `cogPosition`, `cogHeight`, `Iz`, `Cα`, `drivetrain`/`driveBias`, ...). Convenzione corpo
   `x`=avanti.
3. `DriverInputComponent` (`components/driver-input.component.ts`): `throttleTarget`∈[0,1],
   `brakeTarget`∈[0,1], `steerTarget`∈[−1,1], `reverseToggleRequested`.
4. `PhysicDriveInputSystem` (priorità `Higher`): query `[DrivableComponent]`, tastiera via
   `KeybindingsService` → scrive `DriverInputComponent`. Nessuno smoothing, nessuna fisica.
5. `PhysicDriveUpdateSystem`: query `[DriverInputComponent]`. Smoothing pedali/sterzo (riuso
   `smoothPedal`, `updateSteeringAngle`, `sumClamp`), **propulsione tracer** (throttle → `Fx`
   costante, attrito lineare), integrazione minima di `pos`/`vel`, hook rendering (`rotateToHeading`).
6. `vehicle-physics.service.ts` + test: prime funzioni pure (conversione `pxPerMeter`, `getTotalMass`,
   `localToBody(v) = {x: −v.y, y: v.x}` per il ponte frame-locale → frame-corpo, integrazione di un
   passo). `physics.constants.ts` (ρ aria, `g`, soglie — anche se usate dopo).
7. `PhysicsPlaygroundScene` (riusa mappa/camera/superfici della scena attuale) + `main.ts` con
   selezione scena via env/flag. HUD minimo: km/h, `throttle`/`brake`/`steer` target.

**HUD mostra.** Velocità (km/h), target pedali e sterzo.

**Verifica manuale.** Lanciare la scena dev: l'auto accelera/decelera/sterza in modo grezzo ma
stabile; lo sprite ruota verso l'heading; le ruote anteriori ruotano con lo sterzo; gli emitter
funzionano. La vecchia scena resta identica (baseline Playwright intatta).

**ExcaliburJS.** System `Update` con `world.query`; priorità input > update così l'intento è pronto
prima della fisica. Child-actor per le ruote già nel `BaseVehicleActor`. Anchor di default.

---

## Step 1 — Modello pneumatico lineare + blend a bassa velocità

**Obiettivo.** Sostituire la propulsione tracer *laterale* con un vero modello a 4 ruote **lineare**
(forza laterale proporzionale allo slip angle, senza cerchio di aderenza): l'auto curva in modo
fisicamente plausibile e **stabile**, con `yawRate` come stato indipendente da `vel`.

**Lavoro (funzioni pure in `vehicle-physics.service`).**
- `bodyVelocity(vel, theta)` → `v_x`, `v_y` (rotazione di `−θ`).
- `wheelVelocity(v_x, v_y, omega, r_i)` → `v_i_x`, `v_i_y` (formula 3.6).
- `slipAngle(v_i_x, v_i_y, delta_i)` → `α_i = atan2(v_i_y, v_i_x) − δ_i`.
- `lateralForceLinear(alpha_i, Calpha)` → `Fy = −Cα · α_i` (ancora **senza** saturazione).
- `integrateBody(...)` con i termini incrociati (3.7): `v̇_x = Fx/m + v_y·ω`, `v̇_y = Fy/m − v_x·ω`,
  `ω += (coppia/Iz)·dt`, `θ += ω·dt`.
- `lowSpeedKinematicBlend(...)`: sotto soglia (≈1–2 m/s, costante condivisa) le forze laterali → 0 e
  l'heading si aggancia alla direzione di marcia, per evitare l'instabilità dei 4 `atan2`.
- La propulsione longitudinale resta quella **tracer** dello Step 0 (`Fx` costante da throttle).

**HUD aggiunge.** `yawRate`, slip angle per ruota.

**Verifica manuale.** L'auto va dritta senza derivare a sterzo 0; curva con raggio finito coerente;
da fermo/lentissimo non vibra né "parte per la tangente" (blend attivo); a velocità di crociera la
curva è morbida e stabile. Nessun comportamento esplosivo.

**ExcaliburJS.** I bracci `r_i` = posizioni dei 4 child-actor ruota convertite in metri, riferite a
`cogPosition`, e mappate dal frame locale (muso-su, avanti=`−y`) al frame corpo (avanti=`+x`) con
`localToBody`. `δ` = `steeringAngle` esistente, solo anteriori.

---

## Step 2 — Cerchio di aderenza + carico statico + superfici per-ruota

**Obiettivo.** Introdurre il **cerchio di aderenza** (`|F_i| ≤ μ_i · Fz_i`) con `Fz` **statico** e
`μ_i = grip_superficie_i`. Da qui emergono scivolate, sotto/sovrasterzo e — con superfici diverse
sotto le gomme — la **coppia di imbardata** ("l'auto tira"). Niente trasferimento di carico ancora.

**Lavoro.**
- `staticLoad(mass, cogPosition, axlePositions, tracks)` → 4 `Fz_static` (3.3).
- `clampToFrictionCircle(Fx, Fy, mu, Fz)` → forza tagliata al raggio `μ·Fz` + flag "satura".
- Integrazione delle forze nette e della **coppia** `Σ(r_i_x·F_i_y − r_i_y·F_i_x)` (ruotando prima
  le forze anteriori di `δ`).
- **Refactor `WheelFactor`:** rimuovere `power`; rinominare `drag`→`rollFactor`; aggiungere
  `gripSurface`, `load` (`Fz`), `slipAngle`, flag pattinamento. (`wear` arriva allo Step 6.)
- **`SurfacesService`/`SurfaceActor`:** la superficie fornisce `gripFactor` **e** `rollFactor`
  (ex `dragFactor`, per-superficie — vedi Decisione 8); `powerFactor` esce dal flusso. Gestire
  `collisionend` (oggi assente) così una ruota non si porta dietro il grip di una superficie lasciata.

**HUD aggiunge.** `Fz` per ruota, flag pattinamento/saturazione per ruota.

**Verifica manuale.** In curva stretta a velocità alta l'auto scivola invece di girare su binari;
guidare metà auto sull'erba la fa "tirare" verso un lato (coppia di imbardata); il flag di
saturazione si accende sulle ruote che perdono tenuta.

**ExcaliburJS.** Grip/`rollFactor` per-ruota già tracciati via `collisionstart` sui nomi
`frontLeftWheel`/...; aggiungere il simmetrico `collisionend`.

---

## Step 3 — Trasferimento di carico

**Obiettivo.** Rendere dinamico `Fz`: il **baricentro resta fisso**, ma il carico si ridistribuisce
tra le gomme sotto accelerazione/frenata e in curva, dando il guadagno realistico al cerchio.

**Lavoro (funzioni pure).**
- `longitudinalLoadTransfer(mass, a_x, cogHeight, L)` → `ΔFz = m·a_x·h/L`.
- `lateralLoadTransfer(mass, a_y, cogHeight, track)` → `ΔFz = m·a_y·h/track`.
- `Fz_i = static_i + Δlong_i + Δlat_i`, **clamp `≥ 0`** (ruota scaricata = grip zero).
- `a_x`/`a_y` presi dall'accelerazione del corpo (dallo step di integrazione precedente; attenzione a
  non reintrodurre lo spostamento del baricentro — solo `Fz` cambia).

**HUD aggiunge.** Evidenziare la variazione di `Fz` rispetto allo statico (es. barre per ruota).

**Verifica manuale.** In frenata forte il carico si sposta in avanti (anteriori più cariche); in
accelerazione all'indietro; in curva verso le ruote esterne. Frenando in curva l'interno si alleggerisce
e può saturare prima. L'effetto scala con `cogHeight`.

---

## Step 4 — Motore power-limited + aerodinamica + trazione

**Obiettivo.** Sostituire la **propulsione tracer** col modello motore reale, far **emergere il
plateau** di velocità massima e introdurre la distribuzione di trazione (FWD/RWD/AWD).

**Lavoro (funzioni pure).**
- `driveForce(P, F_max, v)` → `F_drive = min(F_max, P/v)`.
- `aeroDrag(rho, Cd, A, v)` → `½·ρ·Cd·A·v²`; `rollingResistance(Crr, rollFactor_i, Fz_i)` per-ruota.
- `distributeDrive(F_drive, drivetrain, driveBias)` → quota di `Fx` per ruota (split 50/50 dentro
  l'asse; differenziali rimandati).
- La `F_drive` per ruota entra come `Fx` **dentro il cerchio** (clamp dello Step 2): l'eccesso non
  diventa ancora pattinamento esplicito (Step 5), ma è già limitato.
- **Frenata** separata e indipendente: distribuita su tutte e quattro le ruote con bias anteriore
  (sostituisce `brakingForce`).
- Rimuovere i tetti `maxSpeed`/`maxReverseSpeed` dal nuovo flusso (il plateau emerge da `P/v =
  F_aero + F_roll`).

**HUD aggiunge.** `F_drive`/regime, indicazione drivetrain.

**Verifica manuale.** Accelerazione forte da fermo che cala con la velocità; velocità massima che si
assesta da sola (plateau) senza tetto rigido; con `drivetrain` posteriore tendenza al sovrasterzo di
potenza, anteriore a sottosterzo/pattinamento; sull'erba (`rollFactor` alto) l'auto rallenta in
rettilineo.

---

## Step 5 — Pattinamento e bloccaggio (saturazione longitudinale)

**Obiettivo.** Rendere espliciti **pattinamento** (richiesta motrice > grip) e **bloccaggio**
(richiesta frenante > grip) come saturazione **longitudinale** del cerchio, in versione "clamp" +
flag (lo slip ratio vero con velocità angolare di ruota è estensione futura).

**Lavoro.**
- Quando `Fx` richiesto eccede il margine del cerchio dato `Fy`, taglialo e alza il flag
  `wheelspin`/`lockup` per ruota.
- Collegare i flag agli effetti grafici/sonori esistenti (emitter `idle`/`throttle` via
  `setEmitters`): fumo in pattinamento.

**HUD aggiunge.** Flag pattinamento/bloccaggio per ruota (già presente come saturazione; qui
distingue alto vs basso).

**Verifica manuale.** Accelerazione brusca da fermo su bassa aderenza → le ruote motrici pattinano
(fumo, flag); frenata a fondo → bloccaggio e perdita di sterzabilità; su superfici asimmetriche il
bloccaggio/pattinamento è per-ruota.

---

## Step 6 — Usura, carburante, statistiche + switch della scena principale

**Obiettivo.** Aggiungere le dinamiche lente (usura gomme, carburante) e le statistiche metriche,
poi **promuovere** il nuovo modello a scena principale (tenendo il vecchio come orfano).

**Lavoro.**
- **Usura:** `wear`∈[0,1] per gomma su `WheelFactor`, parte ~1.0, cala coi km; `μ_eff =
  grip_superficie · wear`; lo **slittamento accelera il consumo** (usa i flag dello Step 5).
- **Carburante:** `fuelMass` al baricentro, consumato su cadenza lenta (fuori dalla fisica per-frame);
  `getTotalMass = mass + fuelMass` come unico punto di verità (già introdotto allo Step 0), usato da
  carico statico, `F_roll`, integrazione.
- **Statistiche metriche:** velocità km/h, distanza percorsa, spazi di frenata (derivano dallo stato
  SI). Eventuale potatura degli helper morti rimandata (vedi sotto).
- **Switch:** `main.ts`/`PlaygroundScene` puntano al nuovo attore/system. `VehicleActor`,
  `DriveInputSystem` e gli helper di `math.service` **restano in repo** come fallback (Decisione 7).
  Ribaselina Playwright **una sola volta** (`npm run test:integration-update`), commit dei PNG.

**HUD aggiunge.** Usura per gomma, carburante, statistiche.

**Verifica manuale.** Su lunga distanza il grip cala con l'usura, più in fretta se si guida in
scivolata; il serbatoio cala e l'auto diventa lievemente più leggera/reattiva; le statistiche
mostrano km/h e spazi di frenata realistici. Dopo lo switch la scena principale guida col nuovo
modello.

---

## Rimandato (fuori scope)

- **Differenziali** (aperto/autobloccante): per ora split 50/50 dentro l'asse.
- **Slip ratio reale** (velocità angolare di ruota come stato): il pattinamento parte in versione
  "clamp".
- **Rimozione del vecchio codice** (`VehicleActor`/`DriveInputSystem`/helper morti): decisione futura.
