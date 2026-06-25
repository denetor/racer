# Grill-me — Step 2 (Cerchio di aderenza + carico statico + superfici per-ruota)

> Interview di dettaglio sull'implementazione dello **Step 2** di `plan-steps.md`, alla luce di
> `specs.md` (§3.3, §3.5, §3.6, §3.7) e della struttura software esistente (post Step 1). Obiettivo
> dello Step 2: introdurre il **cerchio di aderenza** (`|F_i| ≤ μ_i·Fz_i`) con `Fz` **statico** e
> `μ_i = grip_superficie_i`. Da qui emergono scivolate, sotto/sovrasterzo e — con superfici diverse
> sotto le gomme — la **coppia di imbardata** ("l'auto tira"). **Niente trasferimento di carico**
> ancora (Step 3), **niente distribuzione di trazione** (Step 4): la propulsione longitudinale resta
> la **tracer** al baricentro.

## Ricognizione codice (stato post Step 1)

- `vehicle-physics.service.ts` espone (tutte con unit test): `pxPerMeter`, `bodyToWorld`,
  `worldToBody`, `localToBody`, `getTotalMass`, `integrateLongitudinalStep`, `integrateBody`
  (termini incrociati), `kinematicYawRate`, `wheelVelocity`, `slipAngle`, `lateralForceLinear`,
  `lowSpeedKinematicBlend`.
- `PhysicVehicleActor` ha datasheet e stato a corpo rigido: `mass`, `lengthMeters`, `cogPosition`
  (default centro), `cogHeight` (inerte fino allo Step 3), `corneringStiffnessFront/Rear`,
  `drivetrain`/`driveBias` (inerti), fuel; getter geometrici `wheelbaseMeters`, `trackMeters`,
  `Iz`, `totalMass`, `wheelArmsBody` (4 bracci `r_i` in metri, frame-corpo, già `localToBody`);
  readout `slipAngleFront/Rear`. La pipeline laterale a 4 ruote + blend è completa e **lineare,
  senza saturazione**.
- `PhysicDriveUpdateSystem.integrateMotion` calcola per ruota `wheelVelocity → slipAngle →
  lateralForceLinear`, ruota la forza anteriore di `δ`, somma `fxTyre`/`fyTyre`/`mzTyre`, applica il
  blend (`k`) e integra con `integrateBody`. La spinta longitudinale (tracer) agisce al baricentro.
- **`WheelFactor`** (`models/wheel-factor.model.ts`): `drag`, `power`, `grip`. È **condiviso** col
  vecchio path: `VehicleActor.getAverageWheelFactors()` e `DriveInputSystem.computeSpeed/applyKinematics`
  leggono `.grip`/`.drag`/`.power`.
- **`SurfacesService.setProperties`**: assegna i fattori per terreno (tarmac/grass/graveltrap) e
  registra su ogni `SurfaceActor` un `collisionstart` che, **se `evt.other.owner.name` è il nome di
  una ruota**, aggiorna il `WheelFactor` corrispondente. **Non gestisce `collisionend`.**

### ⚠️ Scoperta critica: la rilevazione superficie **per-ruota oggi non funziona**

Le 4 ruote-figlie (`frontLeftWheel`, …) in `BaseVehicleActor` sono create **senza `collisionType`**.
Il default di Excalibur (`BodyComponent`) è **`CollisionType.PreventCollision`** (verificato nel
bundle, `excalibur.development.js`): un corpo `PreventCollision` **non genera contatti né eventi**.
Quindi l'unico collider reale del veicolo è il `CompositeCollider` `Active` sul **corpo** (owner
`'Vehicle'`), che **non passa** il filtro per-nome-ruota del `SurfacesService`. Conseguenza: il ramo
per-ruota **non scatta mai**, e `getAverageWheelFactors().grip` resta sempre al **default 0.5**. La
feature "grip per-superficie" è di fatto **codice morto** nel gioco attuale.

Regola Excalibur del contatto (verificata, `Pair.canCollide`): un contatto (e quindi
`collisionstart`/`collisionend`) **scatta per qualsiasi coppia** tranne se uno dei due è
`PreventCollision` **o** entrambi sono `Fixed`. Quindi un collider **`Passive`** sulla ruota genera
gli eventi con le superfici **senza** risposta fisica (sensore puro) — esattamente ciò che serve.

---

## Question 1: Come far funzionare la rilevazione della superficie per ogni ruota?

Lo Step 2 ("superfici per-ruota → grip asimmetrico → coppia di imbardata") presuppone che ogni ruota
sappia su che superficie si trova. Ma oggi le ruote sono `PreventCollision` e il ramo per-ruota del
`SurfacesService` non scatta mai.

### Decision:

**Collider `Passive` sulle ruote + si tiene la logica del `SurfacesService`.** Non sono alternative:
la logica del service **dipende già** dai collider delle ruote (filtra per nome ruota), gli mancano
solo le collisioni. Si danno alle 4 ruote del `PhysicVehicleActor` dei collider `CollisionType.Passive`
(sensori: generano `collisionstart`/`collisionend` con le superfici, **nessuna** spinta fisica; il
corpo `Active` continua a gestire i muri). Si **estende** il `SurfacesService` per scrivere lo stato
superficie per-ruota e gestire `collisionend`.

**Scope: solo `PhysicVehicleActor`** (non `BaseVehicleActor`). `PhysicVehicleActor.onInitialize()`
chiama `super` e poi imposta `Passive` sulle 4 ruote (membri `protected` della base). `BaseVehicleActor`
e il vecchio `VehicleActor` restano **byte-identici** → **baseline Playwright non a rischio**.
Effetto collaterale elegante: poiché le ruote del vecchio attore restano `PreventCollision`, il
vecchio path **non innesca mai** l'handler, quindi ogni estensione del `SurfacesService` (scrivere
`gripSurface`, aggiungere `collisionend`) è **inerte** per la baseline anche se il service è condiviso.

**Rischio d'integrazione — verificato nullo.** I nuovi collider `Passive` generano eventi anche con
muri/ostacoli/checkpoint: (a) `CheckpointActor` filtra **strettamente** su
`name === 'laptimeTransponder'` (`checkpoint.actor.ts:22`) → niente passaggi spuri di giro;
(b) gli ostacoli sono `Fixed` senza handler reattivo alle ruote; (c) `Passive` non risolve fisicamente,
quindi il corpo `Active` continua a gestire i muri invariato.

---

## Question 2: Dove vive lo stato fisico per-ruota (carico `Fz`, slip, saturazione)?

`WheelFactor` è **condiviso** col vecchio path (legge `.grip`/`.drag`/`.power`). Il plan-steps voleva
rimuovere `power` e rinominare `drag`→`rollFactor`: ma così si rompe la **compilazione** del vecchio
codice (non solo il comportamento), perché quei campi sono ancora letti.

### Decision:

**Nuovo modello `WheelState`, separato, per il solo path fisico.** `WheelFactor` resta intatto per il
vecchio path. Si introduce `WheelState` (es. `models/wheel-state.model.ts`) con i campi che lo Step 2
consuma:

```
class WheelState {
  gripSurface = DEFAULT_SURFACE_GRIP;  // μ (da SurfacesService)
  load = 0;                            // Fz (N), scritto ogni frame dall'update system
  slipAngle = 0;                       // rad, scritto ogni frame
  saturated = false;                   // flag cerchio, scritto ogni frame
  surfaces: SurfaceActor[] = [];       // stack superfici correnti (vedi Q3)
}
```

`PhysicVehicleActor` tiene una `wheelStates: Map<string, WheelState>` con le 4 chiavi
(`frontLeftWheel`/…), parallela alla `wheelFactors` ereditata. **Co-proprietà chiara:** il
`SurfacesService` scrive `gripSurface` (+ stack); il `PhysicDriveUpdateSystem` scrive
`load`/`slipAngle`/`saturated` ogni frame; l'HUD legge. Rinomina/rimozione di `WheelFactor.power`/`drag`
e `rollFactor` **rimandati** agli Step 4/6 (quando servono davvero).

---

## Question 3: Semantica del `collisionend` (overlap ai bordi e ordine degli eventi)?

Una ruota può **sovrapporsi a due poligoni** superficie al confine, e `collisionstart`/`collisionend`
possono arrivare in **qualsiasi ordine**. Un ingenuo "su `collisionend` resetta al default" perde la
nuova superficie se il suo `start` è già scattato (snap errato al default passando erba→tarmac).

### Decision:

**Stack superfici per ruota, "last-wins".** Ogni `WheelState` tiene una pila delle superfici su cui
si trova: `collisionstart` fa push, `collisionend` rimuove quella superficie.
`gripSurface = top(stack).gripFactor` (la più recente ancora presente), oppure `DEFAULT_SURFACE_GRIP`
se la pila è vuota (ruota fuori da ogni superficie). Robusto a overlap e ordine degli eventi. La
risoluzione del grip dalla pila resta **inline** negli handler (glue, verifica manuale — vedi Q10).

---

## Question 4: Come si applica il cerchio di aderenza allo Step 2 (drive ancora al baricentro)?

Allo Step 2 la spinta longitudinale è ancora la **tracer al baricentro**: la forza longitudinale
**per-ruota** (distribuzione di trazione) arriva allo Step 4. Quindi per ruota esiste **solo** una
forza **laterale**.

### Decision:

**Clamp solo laterale ora; funzione generale, `Fx = 0`.** Si scrive
`clampToFrictionCircle(Fx, Fy, mu, Fz)` in forma **generale** (riuso allo Step 4), ma allo Step 2 si
chiama con `Fx = 0` per ruota: clampa `|Fy| ≤ μ·Fz` e alza il flag `saturated` se la richiesta
eccede. La **tracer longitudinale al baricentro resta non clampata** (l'accelerazione limitata dal
grip è Step 4). Emergono già scivolate **laterali** e sotto/sovrasterzo quando la domanda laterale
supera `μ·Fz`.

```
Fy_raw = -Cα · α
Fy     = clampToFrictionCircle(0, Fy_raw, μ, Fz)   // |F| ≤ μ·Fz
saturated = |Fy_raw| > μ·Fz
```

---

## Question 5: Ordine della pipeline per-ruota in `integrateMotion`?

Il clamp **per ruota, prima della somma** è ciò che fa nascere la coppia di imbardata da grip
asimmetrico (e i flag `saturated` per-ruota). Clampare la forza **netta** cancellerebbe proprio
l'effetto "l'auto tira" che lo Step 2 deve produrre. C'è anche il blend a bassa velocità (`k`) da
ordinare.

### Decision:

**Clamp per ruota, poi blend, poi integra.** Per ogni ruota:
1. `Fy_raw = −Cα·α`;
2. **clamp** a `μ·Fz` nel frame-ruota (`Fx = 0`) → setta `saturated` su `WheelState`;
3. **ruota la forza anteriore di `δ`** e porta nel frame-corpo;
4. accumula `fxTyre`/`fyTyre`/`mzTyre` (la coppia `Σ(r_i_x·F_i_y − r_i_y·F_i_x)`).

Dopo il ciclo: si applica il **blend a bassa velocità** (scala le forze gomma per `k`), poi
`integrateBody`. Il clamp è il limite **fisico** (prima), il blend è lo stabilizzatore **numerico**
(dopo); a bassa velocità le forze sono comunque piccole, quindi il clamp raramente è attivo lì.

---

## Question 6: Come distribuisce `staticLoad` il peso sulle 4 ruote?

Formula §3.3. `cogHeight` **non** serve qui (è il trasferimento di carico, Step 3): il carico statico
usa solo l'offset planare `cogPosition` e le carreggiate. Con COG centrato → quarto di peso per ruota.

### Decision:

**Ripartizione 2D completa da `cogPosition`.** Funzione pura
`staticLoad(...)` che usa `totalMass` (telaio + carburante via `getTotalMass`) × `G`, con split
**longitudinale** (anteriore = `b/L`, posteriore = `a/L`, con `a`/`b` distanze COG→assi e `L` passo)
**e laterale** (da `cogPosition.y` e dalla carreggiata di ciascun asse). Ritorna 4 `Fz` (N). COG
centrato (default) → quattro quarti uguali (`totalMass·G/4`); supporta gratis un COG decentrato.
Clamp `≥ 0` previsto dalla firma ma banale ora (sempre positivo senza trasferimento).

---

## Question 7: Quanto dettaglio per-ruota nell'HUD?

Lo Step 2 aggiunge `Fz` e flag saturazione per ruota; lo Step 1 aveva **rimandato** qui anche lo slip
per-ruota. Sono 4×(Fz, slip, saturated): serve un layout compatto.

### Decision:

**Griglia 2×2 che rispecchia l'auto (FL/FR sopra, RL/RR sotto).** Ogni cella mostra `Fz` (N) e slip
(°), **evidenziata** (es. rosso) quando `saturated`. Sopra restano le righe Step 0/1 (km/h, marcia,
pedali, `aLong`, `yawRate`). Intuitivo per leggere a colpo d'occhio grip asimmetrico e scivolate.

```
v: 42.0 km/h [D]   yaw: 12.3 °/s
        FL            FR
     2453N 3.1°    2453N 3.0°
        RL            RR
     2453N 1.2°    2453N 1.1°     ← rosso se saturata
```

---

## Question 8: Mappatura grip-superficie → coefficiente d'attrito `μ` e fallback?

`μ` = grip superficie (per ruota). Quali valori e cosa usare fuori da ogni superficie?

### Decision:

**`gripFactor` è `μ` direttamente.** Si usa `SurfaceActor.gripFactor` così com'è (tarmac 1.0,
grass 0.5, graveltrap 1.3) come `μ`. Si aggiunge **`DEFAULT_SURFACE_GRIP = 1.0`** in
`physics.constants.ts` per la ruota fuori da ogni superficie. La soglia di scivolamento si tara
guidando, agendo su `Cα` e sui valori di grip — **nessun knob extra**.

```
μ_i      = wheelState.gripSurface     // = surface.gripFactor (o DEFAULT_SURFACE_GRIP)
maxLat_i = μ_i · Fz_i
```

---

## Question 9: Come il `SurfacesService` (condiviso) raggiunge il nuovo `WheelState`?

L'handler oggi fa `vehicle.wheelFactors.get(name)`. Per il nuovo path deve scrivere
`wheelState.gripSurface` e gestire lo stack, senza accoppiarsi male.

### Decision:

**Check `instanceof PhysicVehicleActor`.** Si importa `PhysicVehicleActor` nel `SurfacesService` e si
gatekeepa l'aggiornamento del `WheelState` con `instanceof`. Esplicito e type-safe (niente
`as any`/duck-typing). L'accoppiamento service→attore è accettato: il vecchio `VehicleActor`
(ruote `PreventCollision`) non innesca mai l'handler, quindi il ramo nuovo è naturalmente inerte per
la baseline.

---

## Question 10: Cosa si unit-testa per lo Step 2?

Strategia consolidata (memoria utente + step precedenti): unit test **solo** sulle funzioni pure del
service; attori/system/scena/HUD/superfici = glue Excalibur, validati **manualmente** guidando.

### Decision:

**Funzioni pure: `staticLoad` e `clampToFrictionCircle`.**
- `staticLoad`: COG centrato → 4 `Fz` uguali (`totalMass·G/4`); COG spostato in avanti → anteriori
  più cariche delle posteriori; somma dei 4 `Fz` = `totalMass·G`.
- `clampToFrictionCircle`: forza **dentro** il cerchio invariata; forza **fuori** scalata a modulo
  `μ·Fz` (direzione preservata) con flag `saturated`; casi `Fz = 0` (grip zero → forza 0) e `Fx = 0`
  (caso Step 2).

La risoluzione dello stack superfici "last-wins" resta **inline** negli handler (glue) e si valida
guidando (mezza auto sull'erba → l'auto tira). Niente unit test su di essa per ora.

---

## Decisioni implementative prese per convenzione (non richiedono giudizio dell'utente)

- **Nuove funzioni pure** in `vehicle-physics.service.ts` (con test colocati):
  - `staticLoad(...)` → 4 `Fz` (N) (Q6).
  - `clampToFrictionCircle(Fx, Fy, mu, Fz)` → forza tagliata al raggio `μ·Fz` + flag `saturated` (Q4).
- **`PhysicVehicleActor`:** nuova `wheelStates: Map<string, WheelState>` (4 chiavi); in
  `onInitialize` imposta `CollisionType.Passive` sulle 4 ruote (dopo `super`). Datasheet invariato
  (`cogPosition`/`cogHeight`/`Cα Front/Rear`/`mass` già presenti).
- **`PhysicDriveUpdateSystem`:** ogni frame calcola `staticLoad` (da `totalMass`, cheap), poi nel
  ciclo per-ruota: `wheelVelocity → slipAngle → lateralForceLinear → clampToFrictionCircle(0,·,μ_i,Fz_i)`
  → flag `saturated`, scrive `slipAngle`/`load`/`saturated` su `WheelState`; ruota di `δ`, accumula
  forze e coppia; poi blend e `integrateBody` (Q5). `μ_i` letto da `wheelStates[name].gripSurface`.
- **`SurfacesService`:** estende `collisionstart` (scrive `gripSurface` + push sullo stack, via
  `instanceof PhysicVehicleActor`) e aggiunge `collisionend` (rimuove dallo stack, ricalcola
  `gripSurface`) (Q1, Q3, Q9). Il vecchio ramo `wheelFactors` resta per compatibilità (inerte per il
  nuovo attore: si scrive su `wheelStates`).
- **`physics.constants.ts`:** aggiunge `DEFAULT_SURFACE_GRIP = 1.0` (Q8). Nessun magic number nei
  system.
- **HUD (`PhysicsDebugHud`):** griglia 2×2 con `Fz`/slip per ruota, rosso se `saturated` (Q7),
  leggendo `wheelStates` dall'attore.
- **Retromarcia:** invariata. Il cerchio è basato sul **modulo** della forza, indifferente al segno
  della velocità.
- **`actor.pos` non scritto** (posizione/collisioni a Excalibur); riconciliazione `velBody`↔muri
  resta fuori scope (eredità Step 0/1).
- **`main.ts` committato con `START_SCENE='playground'`** (flip a `'physics'` solo in locale per la
  verifica), per non rompere la baseline Playwright.

---

## Parametri da tarare a mano (durante la verifica)

Valori placeholder ragionati, da rifinire guidando: `gripFactor` per superficie (tarmac/grass/gravel,
oggi 1.0/0.5/1.3), `corneringStiffnessFront`/`Rear` (insieme al grip determinano la **soglia di
scivolamento**), `cogPosition` (bilanciamento statico ant./post.). Obiettivo: in curva stretta ad alta
velocità l'auto **scivola** invece di girare su binari; mezza auto sull'erba la fa **tirare**; nessun
comportamento esplosivo.

---

## Checklist di verifica manuale dello Step 2 (utente, con `START_SCENE='physics'`)

- In **curva stretta ad alta velocità** l'auto **scivola** (allarga/scoda) invece di girare come su
  binari; il flag di **saturazione** si accende sulle ruote che perdono tenuta (rosso nell'HUD).
- Guidando con **metà auto sull'erba** l'auto **"tira"** verso un lato (coppia di imbardata da grip
  asimmetrico).
- A velocità di crociera in rettilineo e in curva dolce il comportamento resta **stabile** (come Step 1
  finché non si satura); da fermo/lentissimo **non vibra** (blend ancora attivo).
- L'HUD mostra `Fz` per ruota coerente (≈ quarti uguali a COG centrato), slip per ruota e i flag di
  saturazione coerenti col moto.
- `npm run build` verde; `npm run test:unit` verde (nuovi test `staticLoad`/`clampToFrictionCircle`).
- Con `START_SCENE='playground'` la scena vecchia resta **identica** (baseline Playwright intatta).