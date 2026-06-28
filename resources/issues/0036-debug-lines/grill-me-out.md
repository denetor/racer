# Overlay di debug fisica sul veicolo — esito del grill

Sistema attivabile da pulsante che disegna, in sovrimpressione al veicolo del giocatore, dati di
debug della fisica: croce del COG statico, pallino del baricentro del carico, cerchio di attrito
per ruota e le due componenti di forza per ruota.

Riferimenti: modello fisico in `resources/issues/0031-new-physics/specs.md`, implementato da
`PhysicDriveUpdateSystem` + `vehicle-physics.service.ts`, stato per-ruota in
`models/wheel-state.model.ts`, HUD testuale esistente in `ui/physics-debug-hud.actor.ts`.

---

## Question 1: Come va reso l'overlay (deve stare attaccato al veicolo, in coord mondo, ruotare con esso) e come lo si decompone in ECS?

Vincolo Excalibur: un `System` Update non disegna direttamente in modo pulito — il rendering passa
sempre da un `Canvas` graphic montato su un Actor (come fa `PhysicsDebugHud`). Quindi il blit finale
resta comunque su un child Actor+Canvas.

### Decision:
Child Actor di `PhysicVehicleActor`, con decomposizione **ECS leggera**:
- `DebugOverlayComponent` — dato puro: **solo** il flag `visible: boolean`.
- `DebugOverlaySystem` — logica: **solo** il toggle (legge il tasto, ribalta `visible`).
- `VehicleDebugOverlay` (child Actor + `Canvas`) — fa **calcolo + disegno** nel suo draw callback,
  chiamando funzioni pure estratte nel service (testabili a banco).

Disegno nel frame locale dello sprite (stesse coord px delle ruote figlie); il child eredita
posizione e rotazione del veicolo, quindi ruota con esso senza matematica di proiezione.

---

## Question 2: Come si definisce il "centro di gravità virtuale dopo i trasferimenti di carico" (il pallino)?

Nel modello il COG **non si sposta mai** (*"The COG stays fixed — only the load redistributes"*):
il dato non esiste, va costruito. Verificato: con `cogPosition` centrato il baricentro del carico
**statico** cade esattamente sul centro sprite (regola della leva: asse ant. a -33px porta `b/L`,
post. a +35px porta `a/L`, i momenti si annullano).

### Decision:
Pallino = **baricentro del carico** = media delle 4 posizioni ruota pesata per il `Fz` **dinamico**
(`wheelState.load`):

```
centroid = Σ (pos_ruota_i · load_i) / Σ load_i      // pos in px locali, load = Fz dinamico
```

A riposo coincide con la croce del COG statico; accelero → si sposta verso il retro; freno → verso
l'avantreno; curva → verso le ruote esterne. Funzione pura `loadCentroid(posizioniRuote, loads)`.

---

## Question 3: In quale frame salvare la componente laterale della forza (per disegnare le due linee)?

`wheelState.longitudinalForce` (= `clamped.fx`) esiste già; la laterale `clamped.fy` viene calcolata
ma scartata. Va aggiunto un campo a `WheelState` e scritto dal sistema. `clamped.fx/fy` sono nel
frame **ruota** (prima della rotazione di δ usata per sommare nel body frame).

### Decision:
Frame **ruota (pre-δ)**. Nuovo campo:

```ts
// WheelState
public lateralForce: number = 0;   // Fy frame ruota, scritto ogni frame
// PhysicDriveUpdateSystem (dopo il clamp)
wheelState.longitudinalForce = clamped.fx;   // esiste
wheelState.lateralForce      = clamped.fy;   // nuovo
```

Le due linee si disegnano lungo gli assi della ruota; per le anteriori, ruotate di `steeringAngle`,
si allineano alla ruota sterzata — come richiesto. Il cerchio `μ·Fz` è isotropo, non serve frame.

---

## Question 4: Come scalare cerchio di attrito e linee di forza da Newton a pixel?

### Decision:
**Scala unica condivisa** `PX_PER_NEWTON ≈ 0.013` (tarabile a video):

```
raggio_cerchio = μ_eff · Fz · PX_PER_NEWTON         // μ_eff = gripSurface · wear, Fz = load
len_Fx = |clamped.fx| · PX_PER_NEWTON
len_Fy = |clamped.fy| · PX_PER_NEWTON
```

Conseguenze: il cerchio "respira" col trasferimento di carico (cresce sulle ruote caricate); quando
la **risultante** delle due componenti tocca il bordo del cerchio la gomma è **satura**, leggibile a
colpo d'occhio. A riposo `μ·Fz ≈ 2600 N` → raggio ~34px (ruote distanti ~60-68px: leggibile).

---

## Question 5: Quale tasto attiva/disattiva l'overlay?

### Decision:
Tasto **`D`** (`Keys.KeyD`) — mnemonico "debug", libero (occupati: A gas, Z freno, ←/→ sterzo, R
retro). Aggiunto come azione canonica:

```ts
// Keybindings enum
ToggleDebugOverlay,
// KeybindingsService
case Keybindings.ToggleDebugOverlay: return Keys.KeyD;
```

Letto dal `DebugOverlaySystem` con `keyboard.wasPressed(...)`.

---

## Question 6: Il tasto D commuta solo il nuovo overlay o anche il text HUD esistente?

### Decision:
**Commuta entrambi** (overlay grafico + `PhysicsDebugHud` testuale), master toggle unico.

Implementazione: mettere `DebugOverlayComponent` **sul child overlay e sul `PhysicsDebugHud`**
(entrambi attori puramente grafici). Il system, sui risultati della query, fa
`entity.graphics.isVisible = visible` in modo uniforme — così non tocca mai lo sprite dell'auto e,
da spenti, salta anche il calcolo per-frame.

---

## Question 7: A quali veicoli si attacca l'overlay?

### Decision:
**Tutti i `PhysicVehicleActor`**: `addComponent(new DebugOverlayComponent())` +
`addChild(new VehicleDebugOverlay())` in `onInitialize`. Il system li commuta tutti via query.
Oggi nella scena c'è solo il player; le AI car future erediteranno l'overlay automaticamente.

---

## Question 8: Stato di default all'avvio e impatto sul baseline Playwright?

`PhysicsPlaygroundScene` è la scena di avvio ed è quella fotografata dal baseline; il text HUD è già
sempre acceso lì. Accoppiando i toggle, l'overlay grafico sarà visibile all'avvio → comparirà negli
screenshot.

### Decision:
**Entrambi ON all'avvio** (`visible = true`); il primo `D` li spegne. Il baseline Playwright **va
rigenerato** (`npm run test:integration-update`, commit dei nuovi PNG). A vettura ferma il disegno è
deterministico (croce e pallino sovrapposti, 4 cerchi al carico statico, nessuna linea di forza
perché le forze ≈ 0), quindi è baseline-abile senza instabilità.

---

## Question 9: Colori degli elementi?

Il "colore di base dei testi" è `COLOR_NORMAL = rgba(255,255,0,1)` (giallo), oggi costante privata in
`physics-debug-hud.actor.ts` → estrarla in un modulo condiviso importato da entrambi.

### Decision:
**Giallo base + codifica di saturazione**: croce, pallino e default in giallo (`COLOR_NORMAL`);
cerchio e linee di **una** ruota diventano arancione su `wheelspin` (`COLOR_WHEELSPIN`) e rosso su
`lockup` (`COLOR_SATURATED`), riusando le stesse costanti del text HUD. La saturazione salta
all'occhio ed è coerente con la griglia testuale.

---

## Question 10: Lo spostamento del pallino va mostrato 1:1 o amplificato?

### Decision:
**1:1 esatto**, con costante di guadagno `DOT_GAIN` default `1` (tarabile per amplificare a video):

```
dot = centroid_statico + DOT_GAIN · (centroid_dinamico − centroid_statico)
```

Default: posizione reale del baricentro del carico.

---

## Question 11: Estensione della croce del COG statico?

### Decision:
**Estesa alla sagoma del veicolo** (mirino che incornicia l'auto), incrocio sul COG statico:

```
linea X (lungo lateral): da ~-35 a ~+35 px locali
linea Y (lungo forward): da ~-60 a ~+60 px locali
```

---

## Question 12: Le due linee di forza per ruota hanno una punta a freccia?

### Decision:
**Linee semplici sottili**, senza punta; il verso si legge dal segno della componente (posizione
rispetto al centro ruota).

---

## Note implementative / sintesi

**Nuovi file**
- `src/components/debug-overlay.component.ts` — `DebugOverlayComponent { visible: boolean }`.
- `src/systems/debug-overlay.system.ts` — toggle del flag su tasto `D` (query `[DebugOverlayComponent]`,
  `wasPressed`, set `entity.graphics.isVisible`).
- `src/actors/vehicle-debug-overlay.actor.ts` — child Actor + `Canvas`: calcolo + disegno.
- Helper puri (in `vehicle-physics.service.ts` o nuovo `vehicle-debug.service.ts`), unit-tested:
  `loadCentroid(...)`, `forceEndpointsLocal(...)`, `frictionCircleRadiusPx(...)`, transform body→locale.

**Modifiche**
- `WheelState`: aggiungere `lateralForce` (Fy frame ruota).
- `PhysicDriveUpdateSystem`: scrivere `wheelState.lateralForce = clamped.fy`.
- `Keybindings` enum + `KeybindingsService`: azione `ToggleDebugOverlay` → `Keys.KeyD`.
- Estrarre il colore base (`COLOR_NORMAL`) e i colori di saturazione (`COLOR_WHEELSPIN`,
  `COLOR_SATURATED`) in un modulo condiviso; importati da HUD e overlay.
- `PhysicVehicleActor.onInitialize`: aggiungere component + child overlay.
- `PhysicsDebugHud`: aggiungere `DebugOverlayComponent` per essere commutato dal system.
- `PhysicsPlaygroundScene`: registrare `DebugOverlaySystem`.
- Rigenerare i baseline Playwright.

**Frame di riferimento (per gli helper)**
- Body frame: x = forward, y = lateral. Frame locale sprite (nose-up): forward = `-y`, lateral = `+x`.
- Mappa body→locale: `local.x = body.y`, `local.y = -body.x` (inverso di `localToBody`).
- Linee forza: per le ruote anteriori ruotare gli assi di `steeringAngle` (δ); rear δ = 0.

**Costanti tarabili (default proposti)**
- `PX_PER_NEWTON = 0.013`
- `DOT_GAIN = 1`
- spessore linee/croce/cerchio = 1px ("sottili"); raggio pallino ~3px.
- dimensione del `Canvas` del child generosa (es. ~240×240) per non clippare i cerchi che escono
  dalla sagoma.

**Vincolo baseline**: lo stato di default è ON, quindi gli screenshot cambiano → rigenerazione
obbligatoria dei PNG sotto `tests/main.spec.ts-snapshots/`.