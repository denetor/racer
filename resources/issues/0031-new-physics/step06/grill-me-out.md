# Grill-me — Step 6 (Usura, carburante, statistiche + switch della scena principale)

> Interview di dettaglio sull'implementazione dello **Step 6** di `plan-steps.md`, alla luce di
> `specs.md` (§3.2 unità/statistiche, §3.4 baricentro fisso, §3.5 cerchio `μ = grip·usura`,
> carburante al COG) e della struttura software esistente (post Step 5). Obiettivo dello Step 6:
> aggiungere le **dinamiche lente** (usura gomme, carburante) e le **statistiche metriche**, poi
> **promuovere** il nuovo modello a scena principale tenendo il vecchio come orfano.

## Ricognizione codice (stato post Step 5)

- **`PhysicVehicleActor`**: datasheet completo. Già presenti e *inerti*: `fuelCapacity=60`,
  `fuelMass=60`, `fuelBurn=0.01` kg/s; getter `totalMass = getTotalMass(mass, fuelMass)` (single
  source of truth, **già usato** da `staticLoad`/`dynamicLoad`/`integrateBody`/`rollingResistance`).
  **Manca**: consumo del carburante (nessuno scrive `fuelMass`), e l'usura.
- **`WheelState`** (nuovo path): `gripSurface`, `rollFactor`, `load`, `loadStatic`,
  `longitudinalForce`, `slipAngle`, `saturated`, `wheelspin`, `lockup`, `surfaces[]`. **Manca**: `wear`.
- **`WheelFactor`** (legacy): `drag`/`power`/`grip` — usato solo dal vecchio `VehicleActor`.
  ⚠️ Il testo di `plan-steps.md` dice «`wear` su `WheelFactor`», ma il nuovo path usa `WheelState`.
- **`PhysicDriveUpdateSystem.integrateMotion`**: per ruota usa `mu = wheelState.gripSurface ??
  DEFAULT_SURFACE_GRIP` in due punti — `clampToFrictionCircle(...)` e `longitudinalSaturation(...)`.
  È **l'unico punto** dove iniettare `μ_eff = gripSurface · wear`.
- **`PhysicsDebugHud`**: HUD di **debug** (griglia 2×2 con μ/Fz/slip/Fx, righe v/gas/brake/aLong/
  yaw/slip/drivetrain). Usata SOLO da `PhysicsPlaygroundScene`.
- **`PhysicsPlaygroundScene`**: scena dev, istanzia `PhysicVehicleActor` + i due system + la debug
  HUD. Parità di mappa/checkpoint/laptime con `PlaygroundScene`.
- **`PlaygroundScene`** (produzione, baseline Playwright): istanzia `VehicleActor` + `DriveInputSystem`
  + `DrivingDashboardActor`.
- **`DrivingDashboardActor`** (HUD di produzione): legge `vehicle.throttleInput`/`brakeInput` (OK su
  entrambi), ma anche `vehicle.acceleration` (Vector) e `vehicle.accelerationFullScale` — **assenti**
  su `PhysicVehicleActor` (che ha `longitudinalAccel:number` e `bodyAccel:Vector`). ⚠️ Incompatibilità
  da risolvere se la produzione deve usare questa HUD.
- **`main.ts`**: `START_SCENE` con commento «MUST stay 'playground' in committed code». Oggi è
  *temporaneamente* `'physics'` per lo sviluppo. `fixedUpdateFps: 60`.
- **Statistiche**: nessun modello. `RaceData`/`VehicleRaceData`/`LapTime` gestiscono solo giri e
  checkpoint. Nessuna distanza percorsa né spazi di frenata.
- **Audio**: assente (confermato già allo Step 5).

### Osservazione chiave

Lo Step 6 ha **due nature diverse** in un solo step: (a) due *feature fisiche lente* (usura, carburante)
+ statistiche, tutte additive e a basso rischio; (b) uno *switch infrastrutturale* (promozione scena,
HUD di produzione, ribaselina Playwright) a rischio più alto e che tocca la baseline condivisa. La
fasatura (Q finale) le separa.

---
## Question 1: Dove vive lo stato di usura `wear`?

`plan-steps.md` scrive «`wear` per gomma su `WheelFactor`», ma `WheelFactor` è il modello **legacy**
(solo `VehicleActor`); il nuovo path usa `WheelState`. Refuso del piano (come `power`/`drag`).

### Decision:

**Su `WheelState`.** Aggiungere `wear: number = 1.0` a `WheelState`, accanto a
`gripSurface`/`load`/`saturated`/`wheelspin`/`lockup`. È la single source per-ruota del path fisico,
già iterata e scritta ogni frame dal `PhysicDriveUpdateSystem`. `WheelFactor` resta intatto e
destinato a morire come orfano. Default `1.0` (gomma nuova).

## Question 2: Modello di consumo dell'usura

`plan-steps.md`: «parte ~1.0, cala coi km» + «lo slittamento accelera il consumo (usa i flag dello
Step 5)». Serve una funzione pura per-ruota nel `vehicle-physics.service`.

### Decision:

**Base proporzionale alla distanza + moltiplicatore di slittamento.** Funzione pura
`wearDelta(distance, sliding, baseRate, slipPenalty)` (o simile): consumo base `baseRate · distanza`
(km della ruota nel frame), moltiplicato quando la ruota slitta. Deterministica e indipendente dal
frame-rate (legata ai metri, non a `dt`), coerente con la statistica "distanza percorsa" e con la
formulazione «cala coi km». Si applica `wear = max(floor, wear − wearDelta)`.

## Question 3: Cosa pilota il consumo accelerato?

Lo Step 5 espone `wheelspin`/`lockup` (saturazione longitudinale) e `saturated` (qualsiasi
saturazione del cerchio, anche solo laterale).

### Decision:

**Il flag `saturated` (qualsiasi saturazione).** L'usura accelera quando la ruota satura il cerchio
in qualunque direzione — pattinamento, bloccaggio **e** scivolata laterale (sotto/sovrasterzo). È la
lettura corretta di «guidare in scivolata usura di più»: una lunga derapata laterale deve consumare
come un pattinamento. Moltiplicatore binario on/off (`saturated ? slipPenalty : 1`). I flag
`wheelspin`/`lockup` restano per gli effetti grafici dello Step 5; per l'usura `saturated` è il
sovrainsieme giusto.

## Question 4: L'usura ha un pavimento o arriva a 0?

`μ_eff = gripSurface · wear`: con `wear=0` il cerchio è nullo → auto ingovernabile, facile da
raggiungere su lunga distanza nella scena dev.

### Decision:

**Floor a un minimo (es. `0.5`–`0.6`), costante condivisa `MIN_TYRE_WEAR` in `physics.constants.ts`.**
Realistico (una gomma consumata ha grip residuo, non zero) e tiene l'auto guidabile per la verifica
manuale. `wear = max(MIN_TYRE_WEAR, wear − wearDelta)`. Valore esatto rifinibile in tuning guidando.

## Question 5: Dove vivono le costanti di taratura dell'usura?

Convenzione: costanti generiche/fisiche in `physics.constants.ts`, costanti per-veicolo sull'attore.

### Decision:

**Rate di consumo per-veicolo, floor generico.** I parametri di *consumo* (`tyreWearRate` per km e
`tyreWearSlipPenalty`) stanno sul `PhysicVehicleActor` come parte del datasheet — modellano la mescola
gomma, che è una proprietà del veicolo. Il **floor** `MIN_TYRE_WEAR` resta una costante condivisa in
`physics.constants.ts` (limite fisico comune). Coerente con lo split datasheet↔costanti, e prepara
mescole diverse per veicoli futuri.

### Nota di applicazione (μ_eff)

`μ_eff = gripSurface · wear` si inietta in **un solo punto**: il `mu` calcolato per ruota in
`integrateMotion`, oggi `wheelState.gripSurface ?? DEFAULT_SURFACE_GRIP`, passato sia a
`clampToFrictionCircle` sia a `longitudinalSaturation`. Moltiplicando lì per `wheelState.wear`, usura
→ cerchio più piccolo → satura/scivola/blocca prima, in modo emergente, senza altri ritocchi.

## Question 6: Modello di consumo del carburante

`fuelBurn=0.01 kg/s` esiste ma inerte. Il piano: «cadenza lenta, fuori dalla fisica per-frame».

### Decision:

**Proporzionale al gas.** `burn = fuelBurn · throttleInput · Δt`, sottratto da `fuelMass` (clamp `≥ 0`).
Consuma di più a gas pieno, poco/nulla in rilascio — collega il consumo alla guida e rende il calo di
massa (→ auto più leggera/reattiva via `totalMass`) osservabile su lunga distanza, come chiede la
verifica manuale. `fuelBurn` resta il parametro per-veicolo già presente.

## Question 7: Cadenza e sede del consumo carburante

Il piano: «cadenza lenta, fuori dalla fisica per-frame». `totalMass` è già letto ogni frame.

### Decision:

**Accumulatore a soglia dentro `PhysicDriveUpdateSystem`.** Accumula `throttleInput · Δt` ogni frame
in un piccolo accumulatore sull'actor; quando supera una soglia (≈0.5–1 s) applica il `burn` a
`fuelMass` in un colpo e azzera l'accumulatore. Così la massa **non** cambia ogni tick (rispetta «fuori
dal per-frame»), senza introdurre nuovi system/timer e restando deterministico. Il calo si propaga
ovunque via il già esistente `getTotalMass`/`totalMass`.

## Question 8: Comportamento a serbatoio vuoto

### Decision:

**Motore si spegne: a `fuelMass = 0` la `F_drive` va a 0.** Il gas diventa inefficace e l'auto rallenta
per aero + rolling resistance fino a fermarsi; sterzo e freno restano attivi. Realistico, osservabile e
chiude il loop del carburante. Implementazione: gate sul calcolo di `fDriveSigned` quando `fuelMass <= 0`
(o `throttle` effettivo azzerato). La massa minima resta `mass` (chassis), già garantita dal clamp.

## Question 9: Sede e calcolo delle statistiche

Il piano: «velocità km/h, distanza percorsa, spazi di frenata», derivate dallo stato SI.

### Decision:

**Nuovo modello `VehicleStats`** (`models/vehicle-stats.model.ts`), referenziato dal
`PhysicVehicleActor`, con test colocati. Tiene `distanceTraveled` (m), l'episodio di frenata corrente e
`lastBrakingDistance`. La logica di aggiornamento (accumulo distanza = `|vel| · Δt`; rilevazione
inizio/fine frenata) vive in metodi del modello, chiamati dal `PhysicDriveUpdateSystem` con lo stato
SI. Velocità km/h resta derivata al volo (`hypot(velBody)·3.6`). Tiene le metriche fisiche separate dai
dati di gara (`VehicleRaceData`) e le rende testabili a tavolino, coerente con l'ethos del progetto.

## Question 10: Definizione dello spazio di frenata

### Decision:

**Da pressione del freno fino a fermata; annullato sul rilascio anticipato.** Un episodio inizia quando
`brakeInput > 0` e la velocità è sopra una soglia; accumula la distanza percorsa frame per frame
finché l'auto scende sotto una soglia di velocità (fermata) → salva `lastBrakingDistance`. Se il freno
viene rilasciato prima della fermata, l'episodio si scarta (nessun salvataggio). È il classico "spazio
d'arresto" e si presta a verificare l'effetto di carico/usura/superficie sulla frenata. La logica sta
nel modello `VehicleStats`, alimentata da `brakeInput`/velocità SI.

## Question 11: Strategia di switch alla scena principale

Due scene oggi: `PlaygroundScene` (vecchio modello, baseline Playwright) e `PhysicsPlaygroundScene`
(dev, nuovo modello).

### Decision:

**Promuovere `PhysicsPlaygroundScene` a scena di produzione.** `main.ts` punta stabilmente a `'physics'`
come `START_SCENE`; `PlaygroundScene` (+ `VehicleActor`, `DriveInputSystem`, helper `math.service`)
diventa l'**orfana** ma resta in repo come fallback (Decisione 7 del piano). Conseguenze da gestire in
questo step: (a) la **baseline Playwright** va rigenerata fotografando la scena `physics` (Q13); (b) la
scena di produzione eredita oggi la `PhysicsDebugHud` → va deciso quale HUD mostra in produzione (Q12).
Si evita di riscrivere/fondere scene durante lo switch, riducendo il churn sulla scena già validata
manualmente per cinque step.

## Question 12: HUD della scena di produzione

La `DrivingDashboardActor` legge `vehicle.acceleration`/`accelerationFullScale`, assenti su
`PhysicVehicleActor` → incompatibile senza refactor.

### Decision:

**Tenere la `PhysicsDebugHud` per ora** (arricchita in questo step con usura/carburante/statistiche).
Lo Step 6 resta focalizzato sulle dinamiche lente + switch; adattare la `DrivingDashboard` (e i suoi
applet pedali/accelerazione) al nuovo actor è lavoro UI separato e rimandabile, coerente col fatto che
il modello è ancora in collaudo. La baseline Playwright fotograferà quindi la debug HUD. `DrivingDashboard`,
`Pedals/AccelerationApplet` restano in repo legati al vecchio `VehicleActor` (orfani con esso).

## Question 13: Contenuto aggiunto alla HUD

### Decision:

**Tutte e tre le aggiunte:**
- **Usura % nella cella per-ruota** della griglia 2×2 (`wear NN%`), accanto a μ/Fz/slip/Fx; colore di
  allerta quando vicino a `MIN_TYRE_WEAR`. Coerente con la natura per-ruota dell'usura.
- **Riga carburante globale** (`fuel: NN.N kg` / %), per vedere il calo nel tempo e l'auto più leggera.
- **Righe statistiche globali**: `dist: N.N km` (distanza percorsa) e `brake: N.N m` (ultimo spazio di
  frenata).

Va aumentata `HUD_HEIGHT` per le nuove righe/celle. La HUD resta `cache:false` (ridisegno ogni frame),
come oggi.

## Question 14: Gestione della ribaselina Playwright

Il test (`tests/main.spec.ts`) fotografa la root URL = la `START_SCENE` corrente, con tolleranza
`maxDiffPixelRatio: 0.05` (assorbe le particelle di fumo).

### Decision:

**Rigenerare in coda allo step, in un commit dedicato.** Prima tutto il codice (usura, carburante,
statistiche, switch di `main.ts`), poi `npm run test:integration-update` come ultimo atto, con i PNG in
un commit separato ("rebaseline"). La baseline si tocca **una sola volta**, isolata e rivedibile, come
chiede il piano.

**Caveat piattaforma:** esistono due snapshot, `*-chromium-linux.png` e `*-chromium-win32.png`. Il
container di sviluppo è linux → si rigenera solo il linux. Il `win32` (fermo a maggio) va aggiornato su
Windows/CI a parte, oppure si annota che resterà stale finché non lo rigenera l'ambiente Windows.

## Question 15: Fasatura dello Step 6

### Decision:

**Quattro fasi, ciascuna autoconsistente (build+test verdi, verifica manuale sulla scena dev):**

1. **Usura.** `WheelState.wear`; funzione pura di consumo (distanza + moltiplicatore `saturated`) con
   test; parametri `tyreWearRate`/`tyreWearSlipPenalty` sull'actor, `MIN_TYRE_WEAR` in
   `physics.constants.ts`; iniezione `μ_eff = gripSurface · wear` nel singolo punto `mu` di
   `integrateMotion`; celle HUD con `wear %`.
2. **Carburante.** Accumulatore a soglia nel `PhysicDriveUpdateSystem`, consumo gas-proporzionale,
   gate motore a serbatoio vuoto; riga HUD `fuel`. (`totalMass` già propaga ovunque.)
3. **Statistiche.** Modello `VehicleStats` (+ test) per distanza percorsa e spazio di frenata
   (episodio da freno-premuto a fermata, annullato sul rilascio); righe HUD `dist`/`brake`.
4. **Switch + ribaselina.** `main.ts` → `'physics'` stabile; vecchio modello orfano in repo;
   `npm run test:integration-update` e commit PNG dedicato (caveat win32).

Lo switch infrastrutturale (fase 4) resta isolato e ultimo, separato dalle tre feature additive.

---

## Riepilogo decisioni

| # | Tema | Decisione |
| --- | --- | --- |
| 1 | Sede `wear` | Su `WheelState` (default `1.0`); `WheelFactor` resta legacy/orfano |
| 2 | Modello usura | Funzione pura: base ∝ distanza + moltiplicatore di slittamento |
| 3 | Driver slip usura | Flag `saturated` (qualsiasi saturazione del cerchio) |
| 4 | Floor usura | `MIN_TYRE_WEAR` (~0.5) in `physics.constants.ts` |
| 5 | Costanti usura | Rate di consumo per-veicolo sull'actor; floor generico |
| — | μ_eff | `gripSurface · wear` nel singolo `mu` di `integrateMotion` |
| 6 | Modello carburante | Consumo proporzionale al gas |
| 7 | Cadenza carburante | Accumulatore a soglia in `PhysicDriveUpdateSystem` |
| 8 | Serbatoio vuoto | Motore si spegne (`F_drive = 0`) |
| 9 | Sede statistiche | Nuovo modello `VehicleStats` (+ test) |
| 10 | Spazio di frenata | Da freno-premuto a fermata; annullato sul rilascio |
| 11 | Switch | Promuovere `PhysicsPlaygroundScene` a produzione; vecchio orfano |
| 12 | HUD produzione | Tenere `PhysicsDebugHud` (DrivingDashboard rimandata) |
| 13 | Aggiunte HUD | Usura % per cella + riga fuel + righe dist/brake |
| 14 | Ribaselina | In coda, commit dedicato (caveat win32) |
| 15 | Fasatura | 4 fasi: usura → carburante → statistiche → switch+ribaselina |

## Rischi residui / da rivedere in futuro

- **`DrivingDashboard` non adattata.** La HUD da giocatore (e gli applet pedali/accelerazione) restano
  legati a `VehicleActor` (`acceleration`/`accelerationFullScale`). La scena di produzione mostra la
  **debug HUD**: accettabile finché il modello è in collaudo, ma è debito UI dichiarato.
- **Naming scene.** Dopo lo switch la scena di produzione è `'physics'` (`PhysicsPlaygroundScene`) e
  `PlaygroundScene` (`'playground'`) è l'orfana — naming invertito rispetto all'intuizione. Eventuale
  rinomina/pulizia rimandata (coerente col «non rimuovere il vecchio codice ora» del piano).
- **Snapshot `win32` stale.** Si rigenera solo il `chromium-linux` nel container; il `win32` resta
  fermo finché non lo aggiorna un ambiente Windows/CI.
- **Conferma `fixedUpdateFps: 60`.** Usura/statistiche legate alla distanza e carburante per soglia di
  tempo restano deterministici col fixed update già attivo; nessun cambio richiesto.

## Esplicitamente rimandato (invariato dal piano)

- Differenziali (split 50/50 resta).
- Slip ratio reale (pattinamento resta in versione "clamp").
- Rimozione del codice orfano (`VehicleActor`/`DriveInputSystem`/`math.service` helper, `DrivingDashboard`).
