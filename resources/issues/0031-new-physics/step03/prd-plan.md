# Plan: Step 3 — Trasferimento di carico dinamico (fisica a 4 ruote, issue #31)

> Source PRD: `resources/issues/0031-new-physics/step03/prd.md`
> Specs del risultato finale: `resources/issues/0031-new-physics/specs.md` (§3.3, §3.4, §3.7, §3.11)
> Ordine degli step: `resources/issues/0031-new-physics/plan-steps.md`
> Decisioni di dettaglio: `resources/issues/0031-new-physics/step03/grill-me-out.md`

Piano a **slice verticali (tracer bullet)**: ogni fase attraversa l'intera catena
accelerazione → carico per ruota → cerchio di aderenza → integrazione → HUD ed è **dimostrabile a
sé**, guidando la scena dev e/o con gli unit test. Lo Step 3 rende **dinamico** `Fz`: il carico
statico dello Step 2 diventa la *base*, su cui si sommano il trasferimento **longitudinale** (Fase 1)
e quello **laterale** (Fase 2), con clamp `≥ 0`. Il `Fz` dinamico entra nel **cerchio di aderenza già
esistente** dando il guadagno realistico. Il **baricentro resta fisso nel corpo** (§3.4): si sposta
solo il carico. La propulsione longitudinale resta la **tracer** al baricentro (motore reale → Step 4).

## Architectural decisions

Decisioni durature, valide per tutte le fasi (ereditano quelle degli Step 0–2):

- **Baricentro fisso (§3.4).** `cogPosition` e i bracci `r_i` **non si toccano** mai: tutta la
  dinamica vive nei quattro `Fz`. Nessuno spostamento del punto baricentro per-frame (conterebbe due
  volte l'effetto e corromperebbe la coppia di imbardata).
- **Accelerazione = forza netta / massa, con ritardo di un frame.** L'accelerazione del baricentro nel
  frame corpo è esattamente `(Fx_netto/m, Fy_netto/m)` (i termini di Coriolis di `integrateBody` si
  elidono): è questa la causa del trasferimento, **non** il `v̇` grezzo. Si introduce lo stato
  `bodyAccel` (m/s², frame corpo) sull'attore, scritto a **fine** integrazione (`fx/mass`, `fy/mass`,
  forze nette post-blend) e letto dal frame **successivo** prima del cerchio. Il ritardo di un frame
  spezza la dipendenza circolare `Fz → forza → accelerazione → Fz` (nessuna iterazione intra-frame).
- **`staticLoad` resta la base.** Lo Step 3 **non** sostituisce `staticLoad`: lo usa come input. Il
  punto d'innesto è una sola riga di `integrateMotion` (oggi `const fz = loads[name]` con
  `loads = staticLoad(...)`), dove si interpone `dynamicLoad(staticLoad(...), a_x, a_y, …)`.
- **Fisica pura nel service (modulo deep).** Le nuove funzioni vivono in `vehicle-physics.service`
  (indipendente da Excalibur), con unit test colocati, riusando il tipo esistente `WheelLoads`:
  - `longitudinalLoadTransfer(mass, a_x, cogHeight, L)` → `ΔFz` **totale d'asse** (`m·a_x·h/L`);
  - `lateralLoadTransfer(massAxle, a_y, cogHeight, track)` → `ΔFz` **per ruota** (`m_axle·a_y·h/track`);
  - `dynamicLoad(staticLoads, a_x, a_y, cogHeight, L, trackFront, trackRear)` → 4 `Fz` finali
    (statico + Δlong + Δlat, segni/split per ruota, clamp `≥ 0`). **Unico** punto chiamato dal system.
- **Convenzioni di segno e fattori (documentate nel docstring + asserite dai test).**
  - **Longitudinale**: `a_x>0` (accelera) → posteriori `+ΔL/2`, anteriori `−ΔL/2`; frenata (`a_x<0`)
    → carico in avanti. `ΔL` è totale d'asse → `/2` per ruota.
  - **Laterale**: calcolato **per asse**, con la carreggiata propria dell'asse e la quota di massa
    statica di quell'asse (`m_axle = somma dei due Fz statici dell'asse / g`); nessun knob di
    rigidezza di rollio. `a_y>0` (verso +y/destra) → centro a destra, esterno = sinistra → ruote
    sinistre `+Δlat`, destre `−Δlat`. È già **per ruota** (no `/2`).
- **Clamp `≥ 0`, nessuna ridistribuzione (§3.4).** `Fz_i = max(0, static_i + Δlong_i + Δlat_i)`. Al
  sollevamento ruota la somma può scendere sotto `m·g` (semplificazione accettata). Asse di rollio /
  ridistribuzione fuori scope.
- **`cogHeight` da inerte ad attivo.** Già sul datasheet (`PhysicVehicleActor`, 0.5 m): è il guadagno
  del trasferimento (§3.11). Resta parametro **per-veicolo**; nessuna nuova costante in
  `physics.constants.ts`. **Niente magic number nei system.**
- **Stato per-ruota e baseline HUD.** Il `Fz` dinamico è scritto su `wheelState.load` (come oggi);
  per disegnare la barra centrata sullo statico senza ricalcolo, si espone il carico statico per ruota
  (`loadStatic` su `WheelState`), scritto dal system insieme a `load`.
- **HUD: barra per ruota centrata sullo statico.** In ogni cella della griglia 2×2: barra orizzontale
  col segno centrale = statico, riempimento a destra (verde) quando carica / a sinistra (rosso) quando
  scarica, lunghezza `∝ |ΔFz|`; il numero `Fz` resta. Possibile lieve aggiustamento di altezza
  HUD/spaziatura.
- **Stabilità: nessuna guardia extra.** A bassa velocità le forze laterali sono già scalate da `k→0`
  (blend Step 1) → `a_y→0` → trasferimento laterale auto-soppresso; il clamp `≥ 0` e il cerchio
  limitano i due estremi; l'affondo in frenata resta visibile (`a_x` da tracer reale anche a bassa
  velocità). Eventuali oscillazioni si rivedono solo se emergono in verifica.
- **Source of truth del moto invariato.** `velBody`/`yawRate` nostri; `actor.vel` scritto in px;
  **`actor.pos` non scritto**. Convenzione corpo `x`=avanti, `y`=laterale; anchor al centro. Timestep
  60 Hz. Contratto input/fisica e retromarcia invariati; `PhysicDriveUpdateSystem` agnostico alla
  sorgente dell'intento.
- **Coesistenza, non sostituzione.** Toccati solo `PhysicVehicleActor`, `PhysicDriveUpdateSystem`,
  `PhysicsDebugHud`, `vehicle-physics.service` (+ `WheelState`). `VehicleActor`, `DriveInputSystem`,
  `BaseVehicleActor`, `WheelFactor` restano intatti. `main.ts` committato con
  `START_SCENE='playground'` (flip a `'physics'` solo in locale): baseline Playwright non a rischio.
- **Strategia di test.** Unit test (Jest) **solo** sulle funzioni pure del service
  (`longitudinalLoadTransfer`, `lateralLoadTransfer`, `dynamicLoad`). Wiring `bodyAccel`, getter
  geometrici, scrittura su `WheelState`, barre HUD = glue, validati **manualmente** guidando.

---

## Phase 1: Trasferimento longitudinale (affondo/squat)

**User stories**: 1, 2, 5 (parziale), 6 (parziale), 9, 10, 11, 12 (parziale), 13, 14, 15

### What to build

La fetta verticale che rende `Fz` dinamico lungo l'**asse longitudinale** e lo fa **consumare** dal
cerchio già esistente. Si introduce lo stato `bodyAccel` sull'attore, scritto a fine `integrateMotion`
come `(fx/mass, fy/mass)` e letto dal frame successivo. Si aggiungono le funzioni pure
`longitudinalLoadTransfer` e una prima `dynamicLoad` che assembla `statico + Δlong` (con `a_y = 0`),
applica i segni longitudinali (`/2` per ruota) e clampa `≥ 0`. Nel `PhysicDriveUpdateSystem` si
interpone `dynamicLoad` prima del ciclo per-ruota: il `Fz` **dinamico** entra in
`clampToFrictionCircle` e viene scritto su `wheelState.load`; lo statico va su `wheelState.loadStatic`
per la baseline dell'HUD. L'HUD cresce con la **barra per ruota** centrata sullo statico. `cogHeight`
diventa attiva. Risultato dimostrabile: in **frenata** il carico (e quindi il grip) si sposta in
avanti, in **accelerazione** all'indietro; il fenomeno è visibile sulle barre e percepibile nella
tenuta. Il feedback è minimo (l'`a_x` è guidato dalla tracer, non dal `Fz`), quindi la fase isola la
**correttezza di segni/math/HUD** prima del loop laterale.

### Acceptance criteria

- [ ] `longitudinalLoadTransfer` (pura) testata: valore esatto e segno (`a_x>0` → trasferimento al
  retro); è un totale d'asse.
- [ ] `dynamicLoad` (pura, ramo longitudinale con `a_y = 0`) testata: `a_x = 0` → output identico a
  `staticLoad`; `a_x > 0` → posteriori guadagnano / anteriori perdono con fattore `/2` per ruota;
  somma invariante prima del clamp; clamp `≥ 0` quando il Δ supera lo statico; il Δ scala linearmente
  con `cogHeight`.
- [ ] `bodyAccel` è scritto a fine `integrateMotion` (`fx/mass`, `fy/mass`, forze nette post-blend) e
  letto dal frame successivo prima del cerchio; `longitudinalAccel` resta invariato per la riga
  `aLong` dell'HUD; `cogPosition`/bracci `r_i` non toccati.
- [ ] Il cerchio di aderenza consuma il `Fz` **dinamico** (`wheelState.load`); `wheelState.loadStatic`
  contiene lo statico per la baseline HUD.
- [ ] L'HUD mostra, per ruota, la **barra** centrata sullo statico (verde=carica/rosso=scarica,
  lunghezza ∝ |ΔFz|), col numero `Fz`; a regime/in rettilineo le barre tornano al centro.
- [ ] Guidando: in **frenata forte** le barre/`Fz` anteriori crescono e le posteriori calano (affondo)
  e il grip si sposta di conseguenza; in **accelerazione** l'opposto; l'effetto **scala con
  `cogHeight`**; da fermo/lentissimo nessuna vibrazione.
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovi test `longitudinalLoadTransfer` e
  `dynamicLoad`); baseline Playwright invariata (`START_SCENE='playground'`).

---

## Phase 2: Trasferimento laterale (curva + frenata-in-curva)

**User stories**: 3, 4, 5, 6, 7, 8, 10, 11, 12

### What to build

Si completa lo Step 3 aggiungendo il trasferimento **laterale**, calcolato **per asse**. Funzione pura
`lateralLoadTransfer(massAxle, a_y, cogHeight, track)` (per ruota); `dynamicLoad` si estende per
sommare anche `Δlat` usando `a_y = bodyAccel.y`, la carreggiata propria di ciascun asse
(`trackFront`/`trackRear`, esposte come getter sull'attore accanto a `trackMeters`) e la quota di
massa statica per asse. Si applicano i segni laterali (esterno `+`, interno `−`) e il clamp `≥ 0` sul
risultato finale. Da qui emergono: in **curva** il carico va sulle ruote **esterne** (e con esso il
grip), e **frenando in curva** la ruota **interna** si alleggerisce e può **saturare prima**. Questa
fase introduce il **loop di feedback** `a_y → Fz → grip → forza laterale → a_y`, chiuso col ritardo di
un frame: si verifica esplicitamente la **stabilità** (nessuna oscillazione), confidando su blend a
bassa velocità + clamp `≥ 0` + cerchio (nessuna guardia extra). L'HUD non cambia struttura: le barre
ora reagiscono anche al trasferimento laterale.

### Acceptance criteria

- [ ] `lateralLoadTransfer` (pura) testata: valore esatto e segno; è già per ruota (no `/2`).
- [ ] `dynamicLoad` (pura, completa) testata: `a_x = a_y = 0` → identico a `staticLoad`; `a_y > 0` →
  ruote **sinistre** guadagnano / **destre** perdono; il laterale usa la carreggiata e la massa
  statica **per asse**; somma invariante prima del clamp; clamp `≥ 0` (es. `a_y` grande → una ruota
  interna va a 0); il Δ scala con `cogHeight`. Combinazione long.+lat. coerente.
- [ ] Il laterale usa `a_y = bodyAccel.y`; getter `trackFront`/`trackRear` (m) sull'attore; nessuna
  nuova costante in `physics.constants.ts`; nessun magic number nel system.
- [ ] Guidando: in **curva** le barre/`Fz` esterne crescono e le interne calano; **frenando in curva**
  l'interno (anteriore) si alleggerisce e satura prima (cella rossa); l'effetto **scala con
  `cogHeight`**.
- [ ] **Stabilità**: nessuna oscillazione/instabilità da feedback (ritardo di un frame stabile a
  60 Hz); da fermo/lentissimo il trasferimento laterale resta ≈0 (blend), mentre l'affondo in frenata
  resta visibile; a regime/in rettilineo le barre tornano allo statico.
- [ ] `PhysicDriveUpdateSystem` resta agnostico alla sorgente dell'intento; `actor.pos` non scritto;
  baricentro fisso.
- [ ] `npm run build` verde; `npm run test:unit` verde (nuovo test `lateralLoadTransfer` + `dynamicLoad`
  completa); baseline Playwright invariata; con `START_SCENE='playground'` la scena vecchia è identica.