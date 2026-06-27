# Plan: Step 6 — Usura, carburante, statistiche + switch della scena principale

> Source PRD: `resources/issues/0031-new-physics/step06/prd.md`
> Specs finali: `resources/issues/0031-new-physics/specs.md` (§3.2 unità/statistiche, §3.4 baricentro
> fisso, §3.5 cerchio `μ = grip · usura`, §4 "Usura gomme"/"Massa e baricentro").
> Decisioni di design: `resources/issues/0031-new-physics/step06/grill-me-out.md`.

Lo Step 6 chiude il piano: aggiunge le **dinamiche lente** (usura gomme, carburante) e le
**statistiche metriche** — tutte **additive**, senza ri-tarare la dinamica veloce dello Step 4/5 — poi
**promuove** il nuovo modello a scena principale tenendo il vecchio come orfano. Quattro tracer bullet
verticali: tre feature autoconsistenti (funzione/modello puro + stato + HUD, verificabili guidando)
sulla scena dev, e infine lo **switch infrastrutturale** isolato con ribaselina Playwright.

## Architectural decisions

Decisioni durature, valide per tutte le fasi:

- **Additività (Step 4/5 intatto).** Usura/carburante/statistiche **non** ri-tarano motore, aero,
  carichi, cornering stiffness né il cerchio. L'unico aggancio fisico è `μ_eff = grip_superficie · wear`
  (Fase 1); il resto è stato/lettura/effetti.
- **Stato per ruota su `WheelState`.** L'usura vive su `WheelState.wear` (default `1.0`), accanto a
  `gripSurface`/`saturated`/`wheelspin`/`lockup`. Il legacy `WheelFactor` **non si tocca** (orfano col
  vecchio `VehicleActor`): il riferimento di `plan-steps.md` a `WheelFactor` è un refuso.
- **Funzioni/modelli puri (deep module) nel solito posto.** Logica non banale e priva di framework in
  unità testabili a tavolino: il **consumo usura** come funzione pura nel `vehicle-physics.service`
  (con `.test.ts` colocato), le **statistiche** come modello `VehicleStats` in `models/` (con
  `.test.ts` colocato). Stato/parametri sull'attore; orchestrazione nei system.
- **Driver dello slittamento per l'usura = `saturated`.** Sovrainsieme di `wheelspin`/`lockup` (include
  la saturazione puramente laterale): moltiplicatore binario `saturated ? slipPenalty : 1`.
- **Determinismo.** Usura legata ai **metri** percorsi dalla ruota e spazio di frenata legato alla
  **distanza** → indipendenti dal frame-rate; carburante a **soglia di tempo**, coerente col
  `fixedUpdateFps: 60` già attivo. `wear = max(MIN_TYRE_WEAR, wear − wearDelta)`.
- **Split costanti ↔ datasheet.** `MIN_TYRE_WEAR` (floor del grip residuo, ~0.5–0.6) è una costante
  generica in `physics.constants`. I parametri di **consumo gomma** (rate per km, penalità di
  slittamento) sono **per-veicolo** sul `PhysicVehicleActor` (mescola). `fuelBurn`/`fuelMass`/
  `fuelCapacity` restano i campi per-veicolo già presenti.
- **`getTotalMass` come unico punto di verità.** Il carburante incide sulla fisica solo facendo calare
  `fuelMass`: `totalMass = getTotalMass(mass, fuelMass)` è già usato da carico statico, rolling
  resistance e integrazione. Nessun nuovo system né `Timer`: il consumo vive nel `PhysicDriveUpdateSystem`.
- **Carburante al COG, semplificazione voluta.** Cala solo la **massa totale**, non il bilanciamento né
  i bracci `r_i` (baricentro fisso, §3.4). A `fuelMass ≤ 0` il **motore si spegne** (`F_drive = 0`);
  sterzo/freno/aero/rolling restano attivi; massa minima = `mass` (chassis).
- **Statistiche separate dalla gara.** `VehicleStats` (distanza percorsa, spazio d'arresto) è distinto
  da `VehicleRaceData`/`LapTime`, che restano invariati. Velocità km/h resta derivata al volo.
- **HUD = `PhysicsDebugHud`.** Le aggiunte vivono solo qui (la `DrivingDashboard` resta legata al
  vecchio attore, adattamento rimandato). La HUD resta `cache:false`; `HUD_HEIGHT` cresce.
- **Switch isolato e ultimo.** Solo nella Fase 4: `main.ts` → `START_SCENE='physics'` stabile; vecchio
  modello (`VehicleActor`, `DriveInputSystem`, helper morti, `DrivingDashboard`/applet) **orfano in
  repo**, nessuna rimozione/rinomina. Ribaselina Playwright **una sola volta**, commit PNG dedicato
  (solo `chromium-linux`; `win32` resta stale).
- **"Done" per fase:** `npm run build` verde; `npm run test:unit` verde (nuovi test puri); checklist di
  verifica manuale soddisfatta guidando nella scena dev (`START_SCENE='physics'`).

---

## Phase 1: Usura gomme

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 21, 22, 31.

### What to build

Il percorso end-to-end **guida → consumo per ruota → grip ridotto → HUD**. Si aggiunge `wear` a
`WheelState` (default `1.0`). Una **funzione pura** di consumo nel `vehicle-physics.service` calcola la
quota di usura del frame da: spazio percorso dalla ruota, flag `saturated`, e i parametri per-veicolo
(rate per km, penalità di slittamento); consumo **base ∝ distanza** moltiplicato per la penalità quando
la ruota slitta. L'update system, nel loop per-ruota, applica `wear = max(MIN_TYRE_WEAR, wear −
wearDelta)` e — **unico aggancio fisico** — passa `μ_eff = gripSurface · wear` a `clampToFrictionCircle`
e `longitudinalSaturation` (oggi passa solo `gripSurface`). La `PhysicsDebugHud` mostra `wear NN%` in
ogni cella della griglia 2×2, con colore di allerta vicino a `MIN_TYRE_WEAR`. `MIN_TYRE_WEAR` entra in
`physics.constants`; i parametri di consumo entrano nel datasheet del `PhysicVehicleActor`.

### Acceptance criteria

- [ ] Esiste una funzione pura di consumo usura nel `vehicle-physics.service`, con test colocati:
      consumo base proporzionale alla distanza; consumo **maggiore** quando `saturated`; distanza zero →
      delta zero.
- [ ] `WheelState` espone `wear` (default `1.0`); l'applicazione rispetta il **floor**
      (`max(MIN_TYRE_WEAR, …)`, non scende sotto), provato da test sull'applicazione/funzione.
- [ ] `MIN_TYRE_WEAR` è in `physics.constants`; i parametri di consumo (rate per km, penalità
      slittamento) sono sul `PhysicVehicleActor`.
- [ ] `μ_eff = gripSurface · wear` è iniettato in **un solo punto** del loop per-ruota (cerchio +
      classificazione saturazione); nessun altro cambio alle forze.
- [ ] Su lunga distanza il grip cala con l'usura (l'auto satura/scivola/blocca prima); guidando in
      scivolata/pattinamento l'usura cala **più in fretta**; l'usura è **per ruota**.
- [ ] Anche con gomme molto consumate l'auto resta guidabile (grip residuo dal floor).
- [ ] L'HUD mostra `wear %` per ruota, evidenziata vicino al floor.
- [ ] `npm run build` e `npm run test:unit` verdi.

---

## Phase 2: Carburante

**User stories**: 10, 11, 12, 13, 14, 15, 23, 31.

### What to build

Il percorso **gas → consumo a cadenza lenta → massa che cala → fisica più reattiva**, più il caso di
serbatoio vuoto. L'update system tiene un **accumulatore** (campo sull'attore) che somma `throttleInput
· Δt` ogni frame; superata una **soglia di tempo** (≈0.5–1 s) applica il consumo a `fuelMass`
(`burn = fuelBurn · throttle_accumulato`, clamp `≥ 0`) e azzera l'accumulatore — così la massa non
cambia ogni tick. Poiché la fisica usa già `getTotalMass`, il calo si riflette ovunque senza altre
modifiche. A `fuelMass ≤ 0` la `F_drive` calcolata è **azzerata** (gate motore); sterzo/freno/aero/
rolling restano attivi. La `PhysicsDebugHud` aggiunge una **riga carburante** (kg / %).

### Acceptance criteria

- [ ] Guidando, `fuelMass` cala in proporzione al gas (molto a gas pieno, poco/nulla in rilascio), su
      cadenza lenta (la massa non cambia ogni frame).
- [ ] Al calare del carburante l'auto diventa lievemente più leggera/reattiva (effetto via `totalMass`,
      senza codice duplicato).
- [ ] A serbatoio vuoto il motore non spinge più (trazione a zero), ma sterzo e freno restano attivi;
      la massa minima resta `mass`.
- [ ] L'HUD mostra la riga carburante (kg / %).
- [ ] Nessun nuovo system/`Timer`; la dinamica veloce è invariata.
- [ ] `npm run build` e `npm run test:unit` verdi.

---

## Phase 3: Statistiche metriche

**User stories**: 16, 17, 18, 19, 20, 24, 31.

### What to build

Il percorso **stato SI → metriche → HUD**. Nuovo modello `VehicleStats` (in `models/`, con `.test.ts`
colocato), referenziato dal `PhysicVehicleActor`, con la logica nei propri metodi chiamati dall'update
system: **distanza percorsa** (`distanceTraveled` += `|vel| · Δt`) e **spazio di frenata** come spazio
d'arresto — l'episodio inizia quando `brakeInput > 0` sopra una soglia di velocità, accumula distanza
fino alla **fermata** (sotto soglia) salvando `lastBrakingDistance`, e si **scarta** se il freno viene
rilasciato prima della fermata. La `PhysicsDebugHud` aggiunge **righe `dist` (km) e `brake` (m)**.

### Acceptance criteria

- [ ] Esiste `VehicleStats` con test colocati: accumulo distanza su più frame; episodio di frenata fino
      alla fermata → `lastBrakingDistance` salvato; rilascio freno prima della fermata → episodio
      **scartato**; avvio freno sotto soglia → nessun episodio; episodi multipli in sequenza.
- [ ] `VehicleStats` è referenziato dal `PhysicVehicleActor` e aggiornato dall'update system con lo
      stato SI; è separato da `VehicleRaceData` (invariato).
- [ ] L'HUD mostra distanza percorsa (km) e ultimo spazio di frenata (m), coerenti guidando (es. lo
      spazio cresce con la velocità iniziale e cala con più grip/carico).
- [ ] La velocità km/h resta derivata al volo (non memorizzata).
- [ ] `npm run build` e `npm run test:unit` verdi.

---

## Phase 4: Switch della scena principale + ribaselina

**User stories**: 25, 26, 27, 28, 29, 30.

### What to build

L'atto infrastrutturale, **isolato e ultimo**. `main.ts` imposta stabilmente `START_SCENE='physics'`
(la scena force-based diventa la principale) e ne aggiorna il commento. `PlaygroundScene`,
`VehicleActor`, `DriveInputSystem`, gli helper morti di `math.service`, `DrivingDashboardActor` + applet
**restano in repo** come orfani (nessuna rimozione né rinomina; nessuna fusione di scene). La scena di
produzione mantiene la `PhysicsDebugHud`. Come **ultimo atto**, si rigenera la baseline Playwright
(`npm run test:integration-update`) e si committano i PNG in un **commit dedicato**.

### Acceptance criteria

- [ ] `main.ts` avvia stabilmente la scena force-based (`'physics'`); avviando il gioco si guida col
      nuovo modello e si vede la `PhysicsDebugHud`.
- [ ] Il vecchio modello (`VehicleActor`, `DriveInputSystem`, helper morti, `DrivingDashboard`/applet,
      `PlaygroundScene`) resta in repo, intatto e orfano (nessuna rimozione/rinomina/fusione).
- [ ] `npm run build` e `npm run test:unit` verdi.
- [ ] La baseline Playwright è rigenerata **una sola volta** (commit PNG dedicato) e
      `npm run test:integration` è verde su `chromium-linux`.
- [ ] È annotato che lo snapshot `chromium-win32` resta stale finché non lo rigenera un ambiente
      Windows/CI.
