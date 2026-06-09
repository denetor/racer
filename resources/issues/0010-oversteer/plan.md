# Plan: Oversteer / Understeer via Weight Transfer

> Source PRD: `resources/issues/0010-oversteer/prd.md`

## Architectural decisions

- **State ownership**: tutte le variabili di stato fisico (`throttleInput`, `brakeInput`, `weightTransfer`) e i parametri di tuning vivono su `VehicleActor` come proprietà pubbliche, così ogni futuro veicolo può avere carattere di guida diverso.
- **Logic ownership**: tutta la logica di aggiornamento vive in `DriveInputSystem` come metodi privati. Nessun nuovo sistema ECS.
- **Ordine di chiamata in `update()`**: `updatePedalInputs` → `updateWeightTransfer` → `computeSpeed` → `applyKinematics`. Ogni passo dipende dal precedente.
- **Grip moltiplicativi**: `frontGrip` e `rearGrip` dal weight transfer si moltiplicano con `WheelFactor.grip` (grip di superficie). Nessuna logica speciale per superficie.
- **Rimozione**: `understeerSpeedStrength` eliminato da `VehicleActor` (ridondante). `understeerAngleStrength` mantenuto.
- **Invariante di neutralità**: a pedali a riposo, `weightTransfer` converge a 0, `frontGrip = 1`, `rearGrip = 1` → comportamento identico all'attuale in crociera.

---

## Phase 1: Gradual Pedal Inputs

**User stories**: #4, #5, #9, #10

### What to build

Sostituire l'input binario acceleratore/freno con due variabili di stato smoothed — `throttleInput` e `brakeInput` ∈ [0, 1] — che salgono e scendono con rate asimmetrici configurabili per veicolo (pressione più lenta del rilascio). La forza di accelerazione e frenata in `computeSpeed` diventa proporzionale al valore del pedale invece che on/off. I booleani `input.accelerating` e `input.braking` rimangono usati solo per i trigger UI (emitters di fumo).

Al termine di questa fase, l'auto accelera e frena in modo progressivo: si sente il "peso" del pedale nei primi 0.5 s di pressione e il rilascio è più rapido.

### Acceptance criteria

- [ ] Tenendo premuto acceleratore, `throttleInput` sale da 0 a 1 in ~0.5 s (rate 2.0/s).
- [ ] Rilasciando l'acceleratore, `throttleInput` torna a 0 in ~0.25 s (rate 4.0/s).
- [ ] Stesso comportamento simmetrico/asimmetrico per `brakeInput` con i rispettivi rate.
- [ ] La forza di accelerazione in `computeSpeed` è proporzionale a `throttleInput` (a pedale a metà, l'accelerazione è circa la metà).
- [ ] La forza di frenata in `computeSpeed` è proporzionale a `brakeInput`.
- [ ] Gli emitters di fumo si attivano ancora correttamente sul booleano `input.accelerating`.
- [ ] I parametri `throttlePressRate`, `throttleReleaseRate`, `brakePressRate`, `brakeReleaseRate` sono pubblici su `VehicleActor` con i default indicati nel PRD.
- [ ] Unit test: dato `throttleInput = 0`, dopo un tick con `accelerating = true` e `dt = 100 ms`, `throttleInput` avanza di `0.2` (rate 2.0/s × 0.1 s).
- [ ] Unit test: dato `throttleInput = 1`, dopo un tick con `accelerating = false` e `dt = 100 ms`, `throttleInput` scende di `0.4` (rate 4.0/s × 0.1 s), clampato a [0, 1].

---

## Phase 2: Weight Transfer, Grip Factors, and Kinematics Overhaul

**User stories**: #1, #2, #3, #6, #7, #8, #9, #11, #12

### What to build

Aggiungere la simulazione del trasferimento di carico e modificare la cinematica per produrre sottosterzo e sovrasterzo reali.

**Weight transfer**: una variabile di stato `weightTransfer ∈ [-1, +1]` (negativo = carico avanti/frenata, positivo = carico indietro/accelerazione) converge con inerzia verso il target `throttleInput - brakeInput`, smorzata dal parametro `weightTransferRate`. Prima di essere usata, viene scalata quadraticamente con la velocità (`speedDampening = 1 - (speed/maxSpeed)²`), così l'effetto svanisce in rettilineo veloce.

**Grip factors**: dal weight transfer smorzato si derivano due fattori:
- `frontGrip = clamp(1 − effectiveWT × strength, 0, frontGripCap)` — in frenata supera 1.0, rendendo lo sterzo più mordace; in accelerazione scende sotto 1.0, producendo sottosterzo.
- `rearGrip = clamp(1 + effectiveWT × strength, 0, 1)` — in frenata si riduce, destabilizzando il retrotreno.

**Kinematics**: `applyKinematics` viene riscritto per:
- Rimuovere il fattore `speedFactor` basato su `understeerSpeedStrength` (rimosso anche da `VehicleActor`).
- Applicare `frontGrip` all'angolo di sterzata effettivo (moltiplicato con `angleFactor` e `surfaceGrip` già esistenti).
- Sostituire `vel = heading × speed` con `vel = lerp(vel, heading × speed, baseLerpFactor × rearGrip × surfaceGrip)`. Con basso `rearGrip` la velocità non segue immediatamente l'heading: il retrotreno "sguscia" producendo un angolo di deriva visibile.

Al termine di questa fase, il comportamento "telegrafo" (frenata → gas in curva) emerge naturalmente: il retrotreno è già instabile durante la frenata (basso `rearGrip`), e quando il gas sposta il target di `weightTransfer` l'heading continua a puntare dentro la curva mentre la velocità recupera con ritardo.

### Acceptance criteria

- [ ] `weightTransfer` converge verso `throttleInput - brakeInput` con velocità proporzionale a `weightTransferRate`.
- [ ] A velocità massima (`speedDampening ≈ 0`), il weight transfer non ha effetto visibile sulla traiettoria.
- [ ] In accelerazione sostenuta in curva, la traiettoria si allarga rispetto alla baseline senza gas (sottosterzo).
- [ ] In frenata in curva, lo sterzo è più efficace rispetto alla baseline (frontGrip > 1.0).
- [ ] Premendo gas subito dopo una frenata in curva, il retrotreno accenna a sgusciare prima di riallinearsi.
- [ ] Su erba (surfaceGrip ≈ 0.5) gli effetti di sottosterzo/sovrasterzo sono più pronunciati che su asfalto.
- [ ] `understeerSpeedStrength` rimosso da `VehicleActor`; il codice compila senza riferimenti ad essa.
- [ ] `baseLerpFactor`, `weightTransferStrength`, `frontGripCap`, `weightTransferRate` sono pubblici su `VehicleActor` con i default del PRD.
- [ ] Unit test: con `weightTransfer = 1.0`, `weightTransferStrength = 0.4`, `frontGripCap = 1.5`, `speedDampening = 1.0` → `frontGrip = 0.6`, `rearGrip = 1.0` (clampato).
- [ ] Unit test: con `weightTransfer = -1.0`, stessi parametri → `frontGrip = 1.4`, `rearGrip = 0.6`.
- [ ] Unit test: con `weightTransfer = -1.0`, `weightTransferStrength = 0.6` → `frontGrip` clampato a `frontGripCap = 1.5`.
- [ ] Unit test: a `speedDampening = 0` (velocità massima), `frontGrip = 1.0` e `rearGrip = 1.0` indipendentemente da `weightTransfer`.
- [ ] Unit test: dato `weightTransfer = 0`, dopo un tick con `throttleInput = 1`, `brakeInput = 0` e `dt = 100 ms`, `weightTransfer` avanza verso 1 di `weightTransferRate × 0.1`.
