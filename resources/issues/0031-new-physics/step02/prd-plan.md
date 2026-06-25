# Plan: Step 2 — Cerchio di aderenza + carico statico + superfici per-ruota (fisica a 4 ruote, issue #31)

> Source PRD: `resources/issues/0031-new-physics/step02/prd.md`
> Specs del risultato finale: `resources/issues/0031-new-physics/specs.md` (§3.3, §3.5, §3.6, §3.7)
> Ordine degli step: `resources/issues/0031-new-physics/plan-steps.md`
> Decisioni di dettaglio: `resources/issues/0031-new-physics/step02/grill-me-out.md`

Piano a **slice verticali (tracer bullet)**: ogni fase attraversa l'intera catena
input → contratto → fisica → integrazione → rendering → HUD ed è **dimostrabile a sé**, guidando la
scena dev e/o con gli unit test. Lo Step 2 introduce la **prima non-linearità** sopra il modello
lineare dello Step 1: il **cerchio di aderenza** (`|F_i| ≤ μ_i·Fz_i`) con `Fz` **statico** e
`μ_i = grip_superficie_i`. Da qui emergono scivolate, sotto/sovrasterzo e — con superfici diverse
sotto le gomme — la **coppia di imbardata**. La propulsione *longitudinale* resta la **tracer** dello
Step 0–1, al baricentro e **non clampata**.

## Architectural decisions

Decisioni durature, valide per tutte le fasi (ereditano quelle degli Step 0–1):

- **Coesistenza, non sostituzione.** `VehicleActor`/`DriveInputSystem`/`PlaygroundScene` e
  `BaseVehicleActor` restano **byte-identici** (baseline Playwright). Il nuovo modello vive in
  `PhysicsPlaygroundScene`, selezionata da `START_SCENE` in `main.ts`, **committata sempre su
  `'playground'`** (flip a `'physics'` solo in locale).
- **Ruote sensori `Passive`, confinate al nuovo attore.** Le 4 ruote-figlie del `PhysicVehicleActor`
  diventano `CollisionType.Passive` (impostato dopo `super.onInitialize()` sui membri `protected`
  della base): generano `collisionstart`/`collisionend` con le superfici **senza** risposta fisica
  (i muri restano gestiti dal corpo `Active`). La classe base e il vecchio attore non si toccano →
  baseline non a rischio. Regola Excalibur (verificata, `Pair.canCollide`): un contatto/evento scatta
  per ogni coppia tranne se uno è `PreventCollision` o entrambi `Fixed`.
- **Stato per-ruota separato: `WheelState`.** Modello nuovo per il **solo** path fisico (`gripSurface`,
  `load`=Fz, `slipAngle`, `saturated`, stack superfici), su `PhysicVehicleActor.wheelStates`
  (`Map<string, WheelState>`, 4 chiavi `frontLeftWheel`/…). Il `WheelFactor` esistente resta intatto
  per il vecchio path (ancora letto da `getAverageWheelFactors`/`DriveInputSystem`). Rinomina/rimozione
  di `WheelFactor.power`/`drag` rimandate (Step 4/6).
- **Co-proprietà del `WheelState`.** Superficie ↦ `gripSurface` + stack (via `SurfacesService`);
  update system ↦ `load`/`slipAngle`/`saturated` (ogni frame); HUD legge.
- **Fisica pura nel service.** Le nuove funzioni (`staticLoad`, `clampToFrictionCircle`) vivono in
  `vehicle-physics.service` (modulo deep, indipendente da Excalibur), con unit test colocati. Lo stack
  superfici "last-wins" resta **inline** negli handler (glue, verifica manuale).
- **`μ` = `gripFactor` diretto.** `SurfaceActor.gripFactor` è `μ` così com'è (tarmac 1.0 / grass 0.5 /
  graveltrap 1.3). Costante generica nuova **`DEFAULT_SURFACE_GRIP = 1.0`** in `physics.constants.ts`
  per la ruota fuori da ogni superficie. **Niente magic number nei system.**
- **Clamp per ruota, prima della somma.** È la saturazione **asimmetrica** (ant./post., lato erba/lato
  tarmac) a far nascere sotto/sovrasterzo e coppia di imbardata. Clampare la forza netta li
  cancellerebbe. Ordine in `integrateMotion`: clamp per-ruota (limite fisico) → somma forze/coppia →
  **blend a bassa velocità** (stabilizzatore numerico, scala per `k`) → `integrateBody`.
- **Cerchio solo laterale allo Step 2.** La spinta longitudinale resta la tracer al baricentro, **non**
  clampata. `clampToFrictionCircle(Fx, Fy, mu, Fz)` è scritta **generale** (riuso Step 4) ma chiamata
  con `Fx = 0` per ruota.
- **Source of truth del moto invariato.** `velBody`/`yawRate` nostri; `actor.vel` scritto in px;
  **`actor.pos` non scritto** (posizione/collisioni a Excalibur). Riconciliazione `velBody`↔muri fuori
  scope. Timestep fisso 60 Hz. Convenzione corpo `x`=avanti, `y`=laterale; anchor al centro.
- **Contratto input/fisica invariato.** `PhysicDriveInputSystem`/`DriverInputComponent` intatti;
  `PhysicDriveUpdateSystem` resta **agnostico alla sorgente** dell'intento (umano/AI). Retromarcia
  invariata (il cerchio è sul **modulo** della forza, indifferente al segno della velocità).
- **Strategia di test.** Unit test (Jest, `node`) **solo** sulle funzioni pure del service
  (`staticLoad`, `clampToFrictionCircle`). Attori/system/scena/HUD/superfici = glue Excalibur, validati
  **manualmente** guidando. Non-regressione della scena vecchia garantita dalla baseline Playwright.

---

## Phase 1: Grip per-ruota reale (rilevazione superficie live)

**User stories**: 7, 10, 11, 12, 13, 14, 15, 27, 31 (parziale)

### What to build

La fetta verticale che **risuscita** la rilevazione della superficie per-ruota (oggi codice morto:
ruote `PreventCollision` → il filtro per-nome del `SurfacesService` non scatta mai). Si danno alle 4
ruote del `PhysicVehicleActor` collider `Passive`; si introduce il modello `WheelState` e la mappa
`wheelStates` sull'attore; si estende il `SurfacesService` perché su `collisionstart` (gateato
`instanceof PhysicVehicleActor`) faccia push della superficie sullo stack della ruota e ne ricalcoli
`gripSurface`, e su **`collisionend`** (nuovo) la rimuova e ricalcoli ("last-wins", fallback
`DEFAULT_SURFACE_GRIP`). L'HUD mostra il **grip per ruota** così da poter verificare end-to-end che il
sensing funzioni. **Nessuna forza cambia ancora** (il grip non è ancora consumato dalla fisica):
l'auto guida esattamente come allo Step 1, ma il grip per ruota nell'HUD reagisce alle superfici.

### Acceptance criteria

- [ ] Le 4 ruote del `PhysicVehicleActor` sono `Passive`; `BaseVehicleActor` e `VehicleActor`
  invariati. Il corpo `Active` continua a gestire i muri; nessun passaggio di giro spurio
  (`CheckpointActor` filtra su `laptimeTransponder`).
- [ ] Esiste `WheelState` (`gripSurface`, `load`, `slipAngle`, `saturated`, stack superfici) e
  `PhysicVehicleActor.wheelStates` con le 4 chiavi ruota; `DEFAULT_SURFACE_GRIP = 1.0` in
  `physics.constants.ts`.
- [ ] `SurfacesService` aggiorna `gripSurface` per ruota su `collisionstart` (via
  `instanceof PhysicVehicleActor`) e gestisce `collisionend`; lo stack "last-wins" è robusto a overlap
  di confine; ruota fuori da ogni superficie → `DEFAULT_SURFACE_GRIP`. Il ramo legacy `wheelFactors`
  resta inerte per il nuovo attore.
- [ ] Guidando: passando su erba/tarmac/graveltrap il **grip per ruota** nell'HUD cambia in modo
  coerente per ciascuna ruota e **torna** al valore corretto quando la ruota lascia la superficie;
  mezza auto sull'erba mostra grip diversi tra i due lati.
- [ ] La **guida è invariata** rispetto allo Step 1 (il grip non è ancora consumato); da fermo non
  vibra.
- [ ] `npm run build` verde; `npm run test:unit` verde (invariato); baseline Playwright invariata
  (`START_SCENE='playground'`).

---

## Phase 2: Carico statico per-ruota (`staticLoad`) + HUD `Fz`

**User stories**: 8, 21, 22, 23, 24, 25, 28, 31 (parziale)

### What to build

Si aggiunge il **carico statico** sulle quattro gomme. Funzione pura `staticLoad(...)` che ripartisce
`totalMass·G` (massa telaio + carburante via `getTotalMass`) con split **longitudinale** (anteriore =
`b/L`, posteriore = `a/L`) **e laterale** (da `cogPosition.y` e dalle carreggiate per asse),
restituendo quattro `Fz` (N). `cogHeight` **non** entra (è trasferimento di carico, Step 3). Il
`PhysicDriveUpdateSystem` calcola `staticLoad` ogni frame e scrive `load` su ciascun `WheelState`.
L'HUD cresce nella **griglia 2×2** (FL/FR sopra, RL/RR sotto) mostrando `Fz` per ruota. **Ancora
nessuna forza cambia**: `Fz` è solo calcolato e mostrato (a COG centrato ≈ quarti uguali), pronto per
il cerchio della Phase 3. Validazione end-to-end della catena geometria → carico → HUD, isolata dalla
saturazione.

### Acceptance criteria

- [ ] `staticLoad` (funzione pura) testata: COG centrato → quattro `Fz` uguali (`totalMass·G/4`); COG
  spostato in avanti → anteriori più cariche delle posteriori; somma dei quattro `Fz` = `totalMass·G`.
  Unit test verdi.
- [ ] Il carico statico usa `totalMass` (telaio + carburante) come unico punto di verità; `cogHeight`
  non è coinvolta; supporta un COG decentrato (long. e lat.).
- [ ] L'update system scrive `load` (Fz) su ogni `WheelState` ogni frame; l'HUD mostra la griglia 2×2
  con `Fz` per ruota coerente (≈ quarti uguali a COG centrato).
- [ ] La **guida resta invariata** rispetto alla Phase 1 (`Fz` non ancora consumato dalle forze).
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovo test `staticLoad`); baseline Playwright
  invariata.

---

## Phase 3: Cerchio di aderenza laterale + comportamenti emergenti

**User stories**: 1, 2, 3, 4, 5, 6, 9, 16, 17, 18, 19, 20, 26, 29, 30, 31 (parziale)

### What to build

Si chiude lo Step 2 **consumando** grip (Phase 1) e carico (Phase 2) nel **cerchio di aderenza**.
Funzione pura `clampToFrictionCircle(Fx, Fy, mu, Fz)` (forma generale, riuso Step 4) che taglia la
forza al raggio `μ·Fz` preservando la direzione e segnala la saturazione. Nel `PhysicDriveUpdateSystem`,
per ogni ruota: si calcola la forza laterale lineare (Step 1) e la si **clampa** a `μ_i·Fz_i`
(`μ_i = wheelStates[name].gripSurface`, `Fz_i = load`, `Fx = 0`), settando `saturated` e memorizzando
lo `slipAngle` per ruota. Il clamp avviene **per ruota, prima della somma**; poi si ruota la forza
anteriore di `δ`, si accumulano forza netta e **coppia** `Mz`, si applica il **blend a bassa velocità**
(dopo il clamp) e si integra. Ora emergono: **scivolate** in curva stretta ad alta velocità,
**sotto/sovrasterzo** da saturazione, e la **coppia di imbardata** quando le gomme di un lato (es.
sull'erba) saturano prima. L'HUD evidenzia in rosso le ruote saturate e mostra lo slip per ruota.

### Acceptance criteria

- [ ] `clampToFrictionCircle` (funzione pura) testata: forza **dentro** il cerchio invariata; forza
  **fuori** scalata a modulo `μ·Fz` con direzione preservata e flag `saturated`; casi `Fz = 0`
  (forza 0) e `Fx = 0` (caso Step 2). Unit test verdi.
- [ ] Il clamp è applicato **per ruota, prima della somma**; `saturated` e `slipAngle` per-ruota scritti
  su `WheelState`. Il **blend a bassa velocità** resta **dopo** il clamp; la spinta longitudinale
  tracer al baricentro resta **non clampata**.
- [ ] Guidando: in **curva stretta ad alta velocità** l'auto **scivola** (allarga/scoda) invece di
  girare su binari; con **metà auto sull'erba** l'auto **"tira"** verso un lato (coppia di imbardata da
  grip asimmetrico); il flag di **saturazione** si accende (rosso nell'HUD) sulle ruote che perdono
  tenuta.
- [ ] A velocità di crociera e in curva dolce il comportamento resta **stabile** (come Step 1 finché
  non satura); da ferma/lentissima **non vibra** (blend attivo).
- [ ] L'HUD 2×2 mostra `Fz`, slip e saturazione per ruota coerenti col moto; `PhysicDriveUpdateSystem`
  resta agnostico alla sorgente dell'intento; `actor.pos` non scritto.
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovo test `clampToFrictionCircle`); baseline
  Playwright invariata; con `START_SCENE='playground'` la scena vecchia è identica.