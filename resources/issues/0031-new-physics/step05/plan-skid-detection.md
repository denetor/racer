# Plan: Step 5 — Pattinamento e bloccaggio (saturazione longitudinale)

> Source PRD: `resources/issues/0031-new-physics/step05/prd.md`
> Specs finali: `resources/issues/0031-new-physics/specs.md` (§3.5, §3.8, §3.10).
> Decisioni di design: `resources/issues/0031-new-physics/step05/grill-me-out.md`.

Lo Step 5 è uno **strato diagnostico + cosmetico** sopra il modello a forze dello Step 4: rende
espliciti e nominati **pattinamento** (`wheelspin`) e **bloccaggio** (`lockup`) per singola ruota,
**senza cambiare le forze**. Due tracer bullet verticali: prima il rilevamento provato via HUD + unit
test, poi il fumo per-ruota appoggiato sopra i flag.

## Architectural decisions

Decisioni durature, valide per entrambe le fasi:

- **Nessun cambio alle forze (Step 4 intatto).** La forza applicata resta il clamp combinato
  direzione-preservante `clampToFrictionCircle(fxLong, k·fLat, μ, Fz)`. I flag **derivano**, non
  alterano l'integrazione. Niente ri-taratura del modello (motore, aero, carichi, cornering stiffness).
- **Funzione pura di classificazione (deep module).** Una sola unità con logica non banale:
  `longitudinalSaturation(driveShare, brakeShare, fRoll, fLat, μ, Fz, isDriven) → {wheelspin, lockup}`,
  nel `vehicle-physics.service`, senza dipendenze framework. È l'unico modulo coperto da unit test.
- **Formula di rilevamento.** Margine longitudinale `marginLong = √(max(0, (μ·Fz)² − fLat²))`.
  **Dominanza:** `|driveShare|` vs `brakeShare + fRoll` decide la direzione (drive ⇒ candidato
  wheelspin, altrimenti candidato lockup); il rotolamento partecipa solo alla direzione. **Gate:** il
  flag si alza solo se l'**attuatore da solo** supera il margine — `wheelspin` se `|driveShare| >
  marginLong` **e** ruota motrice; `lockup` se `brakeShare > marginLong`. L'`fRoll` da solo non alza
  mai un flag; una ruota **non motrice** non può mai segnare `wheelspin`.
- **Modello-dati.** `WheelState` acquista `wheelspin`/`lockup` (default `false`); `saturated` resta
  l'**ombrello** (qualsiasi saturazione, anche solo laterale). I tre coesistono: una ruota può essere
  insieme longitudinalmente e lateralmente satura.
- **Gate di velocità.** Costante generica `SKID_MIN_SPEED` (~0.5 m/s) in `physics.constants`, applicata
  nel system su **entrambi** i flag (azzerati sotto soglia). Conseguenza accettata: niente fumo/flag a
  veicolo fermo.
- **Effetti = solo grafici.** Nessun audio nel progetto (fuori scope). Il fumo è per-ruota e vive
  **solo** sul `PhysicVehicleActor`; `BaseVehicleActor` e il legacy `VehicleActor` restano **identici**
  (baseline Playwright). Trigger del fumo = `wheelspin || lockup` per ruota, che **sostituisce** il
  fumo legato al gas. Gli `idleEmitters` ambientali restano invariati.
- **Convenzioni del progetto.** Funzioni pure (con `.test.ts` colocato) nel service; stato/parametri
  sull'attore; orchestrazione nel system. `main.ts` committato con `START_SCENE='playground'` (flip a
  `'physics'` solo in locale per la verifica). "Done" per fase: `npm run build` verde, `npm run
  test:unit` verde, checklist di verifica manuale soddisfatta.

---

## Phase 1: Rilevamento + HUD (tracer diagnostico)

**User stories**: 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21 (più la verifica visiva di 4, 5, 6
tramite l'HUD).

### What to build

Il percorso end-to-end **tastiera → fisica → flag → HUD**, a forze invariate. La nuova funzione pura
classifica la saturazione longitudinale di ogni ruota in `wheelspin`/`lockup` secondo la formula di
rilevamento (margine, dominanza, gate sull'attuatore); l'update system la invoca nel loop per-ruota
dopo il clamp esistente, applica il gate di velocità `SKID_MIN_SPEED` e scrive i due flag su
`WheelState` (accanto all'ombrello `saturated`). L'HUD di debug mostra, in ogni cella per-ruota, un
token `WSP`/`LCK` (o nessun token per la sola saturazione laterale) con colore distinto
(arancio/rosso/giallo). Nessun emitter, nessun cambio alle forze.

### Acceptance criteria

- [ ] Esiste `longitudinalSaturation(...)` pura nel service, con test colocati che coprono: trazione
      oltre margine → solo `wheelspin`; freno oltre margine (anche con margine ridotto dal laterale) →
      solo `lockup`; `fRoll`-only → nessun flag; ruota non motrice sotto trazione → mai `wheelspin`;
      domanda sotto margine → nessun flag; dominanza drive vs freno+rotolamento con gas+freno insieme.
- [ ] `WheelState` espone `wheelspin`/`lockup` (default `false`); `saturated` resta l'ombrello.
- [ ] `SKID_MIN_SPEED` è definita in `physics.constants` e usata dal system per azzerare entrambi i
      flag sotto soglia.
- [ ] In accelerazione brusca su bassa aderenza, appena l'auto si muove, le celle delle ruote motrici
      mostrano `WSP`; in frenata a fondo le anteriori mostrano `LCK`.
- [ ] In curva veloce senza gas/freno la cella è colorata (saturazione laterale) **senza** token
      WSP/LCK; a veicolo fermo non compare alcun flag.
- [ ] Su superficie asimmetrica i flag sono per-ruota (solo il lato a basso grip).
- [ ] In retromarcia i flag sono coerenti, senza saturazioni spurie andando dritti all'indietro.
- [ ] Le forze/feel dello Step 4 sono invariati; `npm run build` e `npm run test:unit` verdi.

---

## Phase 2: Fumo per-ruota (strato cosmetico)

**User stories**: 1, 2, 3, 7, 19, 22.

### What to build

Sopra i flag della Fase 1, si aggiunge il **fumo localizzato per ruota**. Il `PhysicVehicleActor` crea
quattro emitter di fumo (uno per ruota, posizionati alle ruote nel frame muso-su) nel proprio
`onInitialize`, esposti via `setWheelSmoke(name, enabled)`. L'update system, a fine frame, attiva il
fumo di ciascuna ruota quando `wheelspin || lockup` per quella ruota, **sostituendo** il vecchio fumo
legato al gas. `BaseVehicleActor` e il legacy `VehicleActor` non vengono toccati.

### Acceptance criteria

- [ ] Le ruote che pattinano (`wheelspin`) emettono fumo dalla loro posizione; idem per quelle che
      bloccano (`lockup`).
- [ ] Il fumo è **per-ruota**: su superficie asimmetrica/manovre miste fuma solo la ruota corretta,
      coerente col token HUD della Fase 1.
- [ ] Il fumo non è più legato al gas: accelerando senza pattinare non esce fumo; a veicolo fermo a
      freno pieno non esce fumo (gate di velocità).
- [ ] `BaseVehicleActor` e `VehicleActor` invariati; con `START_SCENE='playground'` la scena vecchia è
      identica e la **baseline Playwright resta verde**.
- [ ] `npm run build` e `npm run test:unit` verdi (nessun nuovo test automatico: la fase è glue,
      verifica manuale).