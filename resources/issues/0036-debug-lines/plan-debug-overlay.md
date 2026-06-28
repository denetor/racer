# Plan: Overlay di debug fisica sul veicolo

> Source PRD: `resources/issues/0036-debug-lines/prd.md` (decisioni in `grill-me-out.md`)

## Architectural decisions

Decisioni durevoli valide per tutte le fasi:

- **Pattern ECS**: `DebugOverlayComponent` (solo dato: flag `visible: boolean`) + `DebugOverlaySystem`
  (sola logica di toggle) + `VehicleDebugOverlay` (child Actor con `Canvas` che fa calcolo + disegno
  via funzioni pure). Il component sta sugli attori **puramente grafici** da commutare (overlay del
  veicolo e HUD testuale), mai sullo sprite dell'auto.
- **Vincolo di rendering**: in Excalibur il blit finale passa da un `Canvas` su un Actor; il system non
  disegna. L'overlay è child del veicolo → eredita posizione e rotazione, disegna nel frame locale
  dello sprite (stesse coord px delle ruote figlie).
- **Frame di riferimento**: body = (x avanti, y laterale); locale sprite (nose-up) = (forward `-y`,
  lateral `+x`); mappa body→locale `local.x = body.y`, `local.y = -body.x`. Ruote posteriori `δ = 0`.
- **Modulo puro di calcolo** (deep module, framework-agnostico, testabile a banco — in
  `vehicle-physics.service` o nuovo `vehicle-debug.service`): `loadCentroid`, `frictionCircleRadiusPx`,
  `forceEndpointsLocal`, transform body→locale. L'attore overlay è una shell sottile sopra questi.
- **Input**: azione canonica `ToggleDebugOverlay` in `Keybindings` enum + `KeybindingsService` →
  `Keys.KeyD` (tasto `D`). Letto con `wasPressed`.
- **Scala unica condivisa** `PX_PER_NEWTON` (~0.013) per cerchi **e** linee; raggio `μ_eff·Fz·scala`,
  lunghezze `|componente|·scala`. La risultante al bordo del cerchio = saturazione. `μ_eff =
  gripSurface·wear`, `Fz = load`.
- **Colori**: estrarre in un modulo condiviso `COLOR_NORMAL` (giallo, base), `COLOR_WHEELSPIN`
  (arancione), `COLOR_SATURATED` (rosso), oggi privati in `physics-debug-hud`. Importati da HUD e
  overlay.
- **Scope**: component + child overlay aggiunti in `PhysicVehicleActor.onInitialize` → tutti i veicoli
  fisici. `PhysicsDebugHud` riceve il component per essere commutato dallo stesso system.
  `PhysicsPlaygroundScene` registra il `DebugOverlaySystem`.
- **Stato di default**: entrambi ON all'avvio (`visible = true`); il primo `D` spegne.
- **Baseline Playwright**: dalla Fase 1 in poi l'overlay è disegnato per default → ogni fase che cambia
  ciò che appare a schermo deve rigenerare i baseline (`npm run test:integration-update`) e committare
  i nuovi PNG. A vettura ferma il disegno è deterministico.
- **Costanti tarabili** (default): `PX_PER_NEWTON = 0.013`, `DOT_GAIN = 1`, spessore
  linee/croce/cerchio 1px, raggio pallino ~3px, `Canvas` del child ~240×240 per non clippare i cerchi.
- **Testing**: si automatizzano solo le funzioni pure (Jest), testandone il comportamento esterno
  (input→output), non il rendering. Prior art: `src/services/vehicle-physics.service.test.ts`. Attore,
  system e aspetto grafico verificati a video + non-regressione dello stato iniziale via screenshot.

---

## Phase 1: Infrastruttura di toggle + croce del COG

**User stories**: 1, 2, 3, 4, 14, 18, 19, 20, 21, 22, 23

### What to build

La fetta tracer-bullet che attraversa tutti i layer: ECS plumbing del toggle e primo elemento grafico.
Si crea `DebugOverlayComponent` (flag `visible`), `DebugOverlaySystem` che su pressione di `D`
(`ToggleDebugOverlay`, registrata in enum + service) ribalta `visible` su tutte le entità col component
e ne allinea la visibilità del rendering. Si estrae il colore base in un modulo condiviso. Si introduce
`VehicleDebugOverlay` (child Actor + `Canvas`) aggiunto a ogni `PhysicVehicleActor`, che disegna la
**croce sottile del COG statico** estesa sulla sagoma (linea longitudinale e trasversale, incrocio su
`cogPosition`), nel frame locale così da ruotare con l'auto. Il `PhysicsDebugHud` riceve anch'esso il
component, così `D` commuta insieme overlay e HUD. La scena registra il system. Default ON.

### Acceptance criteria

- [ ] Premendo `D` l'HUD testuale e l'overlay grafico si nascondono/mostrano **insieme**; all'avvio
      entrambi sono visibili.
- [ ] La croce è centrata sul COG statico, estesa sulla sagoma, e **ruota e trasla con il veicolo**.
- [ ] Tutti gli elementi usano il colore base giallo, ora definito in un modulo condiviso e importato
      sia dall'HUD sia dall'overlay (nessuna duplicazione della costante).
- [ ] L'overlay è attaccato a ogni `PhysicVehicleActor` (oggi solo il player; pronto per le AI car).
- [ ] Da spento, l'overlay non esegue il calcolo/disegno per-frame.
- [ ] A vettura ferma il disegno è deterministico (croce sul COG); baseline Playwright **rigenerati** e
      committati; suite di test verde.

---

## Phase 2: Pallino del baricentro del carico

**User stories**: 5, 6, 7, 16, 17

### What to build

Funzione pura `loadCentroid(posizioniRuote, loads)` che calcola il baricentro del carico come media
delle posizioni ruota pesata per il `Fz` dinamico (`wheelState.load`), con il caso degenere (somma
pesi nulla) gestito. L'overlay disegna un **pallino** nella posizione
`centroid_statico + DOT_GAIN·(centroid_dinamico − centroid_statico)`, con `DOT_GAIN` costante tarabile
(default 1). A riposo il pallino coincide con la croce; sotto trasferimento di carico si sposta.

### Acceptance criteria

- [ ] A vettura ferma il pallino **coincide con la croce** del COG statico.
- [ ] In accelerazione il pallino si sposta verso il retro, in frenata verso l'avantreno, in curva
      verso le ruote esterne.
- [ ] `loadCentroid` è una funzione pura con unit test (carichi uguali → centro statico; carico
      arretrato → centroide arretrato; somma pesi nulla → caso gestito).
- [ ] `DOT_GAIN` e l'eventuale scala sono costanti modificabili senza toccare la logica.
- [ ] Baseline Playwright rigenerati (pallino sulla croce a fermo); suite verde.

---

## Phase 3: Cerchi di attrito per ruota

**User stories**: 8, 9, 16

### What to build

Funzione pura `frictionCircleRadiusPx(muEff, fz, scala)` che restituisce il raggio in px del cerchio di
attrito (`μ_eff·Fz·PX_PER_NEWTON`, con `μ_eff = gripSurface·wear`). L'overlay disegna, per ciascuna
delle quattro ruote, un **cerchio centrato sulla ruota** il cui raggio varia col carico dinamico.
`PX_PER_NEWTON` è la scala condivisa (riusata poi dalle linee di forza).

### Acceptance criteria

- [ ] Ogni ruota mostra un cerchio centrato sulla propria posizione.
- [ ] Il raggio **cresce sulle ruote caricate e si stringe su quelle scariche** durante il
      trasferimento di carico.
- [ ] `frictionCircleRadiusPx` è una funzione pura con unit test (proporzionalità a `μ_eff·Fz·scala`;
      zero a carico o μ nulli).
- [ ] `PX_PER_NEWTON` è una costante condivisa tarabile.
- [ ] Baseline Playwright rigenerati (4 cerchi al carico statico a fermo); suite verde.

---

## Phase 4: Linee di forza per ruota

**User stories**: 10, 11, 12, 15, 16

### What to build

Plumbing dati: aggiungere `lateralForce: number` a `WheelState` (componente laterale nel **frame
ruota**, pre-rotazione di δ) e scriverla in `PhysicDriveUpdateSystem` dopo il clamp del cerchio di
attrito (`wheelState.lateralForce = clamped.fy`; la `clamped.fx` è già in `longitudinalForce`).
Funzione pura `forceEndpointsLocal(fx, fy, delta, scala)` che restituisce gli estremi in coordinate
locali delle due componenti, ruotate di `delta` per le ruote sterzanti. L'overlay disegna, per ogni
ruota, **due linee sottili senza freccia** dal centro ruota (verso dato dal segno), con le anteriori
ruotate di `steeringAngle`. Stessa scala `PX_PER_NEWTON` dei cerchi, così la risultante che tocca il
bordo del cerchio indica saturazione.

### Acceptance criteria

- [ ] `WheelState.lateralForce` è popolata ogni frame con la `clamped.fy` (frame ruota).
- [ ] Ogni ruota mostra due linee per le componenti longitudinale e laterale della forza.
- [ ] Le linee delle **ruote anteriori ruotano con l'angolo di sterzo**; quelle posteriori no.
- [ ] Quando la risultante delle due componenti raggiunge il bordo del cerchio, la gomma è in
      saturazione (geometria coerente).
- [ ] `forceEndpointsLocal` è una funzione pura con unit test (componenti lungo gli assi; rotazione
      corretta con `delta`; verso corretto col segno; mappatura body→locale).
- [ ] Baseline Playwright rigenerati (a fermo forze ≈ 0 → nessuna linea); suite verde.

---

## Phase 5: Codifica colore di saturazione

**User stories**: 13

### What to build

Quando una ruota satura longitudinalmente, il suo **cerchio e le sue linee** cambiano colore: arancione
(`COLOR_WHEELSPIN`) su `wheelspin`, rosso (`COLOR_SATURATED`) su `lockup`, riusando le costanti già
estratte nel modulo condiviso. Croce, pallino e gli altri elementi restano nel giallo base.

### Acceptance criteria

- [ ] Cerchio e linee di una ruota diventano arancioni su `wheelspin` e rossi su `lockup`.
- [ ] Le altre ruote e gli elementi globali (croce, pallino) restano nel giallo base.
- [ ] I colori provengono dalle costanti condivise riusate dall'HUD (nessuna duplicazione).
- [ ] Baseline Playwright rigenerati se necessario; suite verde.