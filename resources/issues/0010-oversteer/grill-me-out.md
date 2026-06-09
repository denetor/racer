# Grill-me: Oversteer / Understeer via weight transfer

## Summary — Implementation Plan

### Nuove proprietà su `VehicleActor`

| Proprietà | Tipo | Default | Descrizione |
|---|---|---|---|
| `throttleInput` | number | 0 | Pedale acceleratore [0,1] — stato smoothed |
| `brakeInput` | number | 0 | Pedale freno [0,1] — stato smoothed |
| `throttlePressRate` | number | 2.0 | Velocità pressione acceleratore (1/s) |
| `throttleReleaseRate` | number | 4.0 | Velocità rilascio acceleratore (1/s) |
| `brakePressRate` | number | 2.0 | Velocità pressione freno (1/s) |
| `brakeReleaseRate` | number | 4.0 | Velocità rilascio freno (1/s) |
| `weightTransfer` | number | 0 | Trasferimento di carico [-1=avanti, +1=dietro] — stato smoothed |
| `weightTransferRate` | number | 3.0 | Velocità di spostamento del baricentro (1/s) |
| `weightTransferStrength` | number | 0.4 | Intensità effetto sul grip [0,1] |
| `frontGripCap` | number | 1.5 | Cap superiore per frontGrip |
| `baseLerpFactor` | number | 0.5 | Fattore base lerp vel→heading |

Rimuovere: `understeerSpeedStrength` (ridondante).
Mantenere: `understeerAngleStrength`.

### Nuovi metodi in `DriveInputSystem`

```
updatePedalInputs(drivable, input, dt)
  → aggiorna throttleInput e brakeInput con press/release rate

updateWeightTransfer(drivable, dt)
  → target = throttleInput - brakeInput
  → weightTransfer lerp verso target con weightTransferRate

applyKinematics (modificato)
  → speedDampening = 1 - (speed/maxSpeed)²
  → effectiveWT = weightTransfer * speedDampening
  → frontGrip = clamp(1 - effectiveWT * strength, 0, frontGripCap)
  → rearGrip  = clamp(1 + effectiveWT * strength, 0, 1)
  → rimuove speedFactor (understeerSpeedStrength)
  → effectiveSteering = steeringAngle * angleFactor * surfaceGrip * frontGrip
  → vel = lerp(vel, heading * speed, baseLerpFactor * rearGrip * surfaceGrip)

computeSpeed (modificato)
  → usa throttleInput e brakeInput invece dei booleani
```

---

## Question 1: Meccanismo del sovrasterzo

Usare il **lerp del vettore velocità** verso `heading * speed` con un fattore grip variabile,
disaccoppiando vel da heading per permettere scivolamento laterale reale.

### Decision: A — lerp-based slip

## Question 2: Rappresentazione del trasferimento di carico

Variabile di stato `weightTransfer` (da -1 = carico tutto sull'anteriore, a +1 = tutto sul posteriore)
che si avvicina con lerp al target dettato dall'input. Parametro `weightTransferRate` controlla la velocità.

### Decision: B — smoothed con inerzia

## Question 3: Come il `weightTransfer` influenza grip anteriore e posteriore

Assi separati: `frontGrip` e `rearGrip` calcolati dal `weightTransfer`:
- `frontGrip = baseGrip - weightTransfer * strength` → carico dietro = meno grip davanti = sottosterzo
- `rearGrip  = baseGrip + weightTransfer * strength` → carico dietro = più grip dietro (e viceversa in frenata)
`frontGrip` modifica `effectiveSteering`; `rearGrip` modifica il fattore lerp vel→heading.

### Decision: A — frontGrip e rearGrip separati (frontGrip → effectiveSteering, rearGrip → lerp vel→heading)

## Question 4: Modello dei pedali

Ogni pedale (`throttleInput`, `brakeInput` ∈ [0,1]) ha due rate separati, come già accade per lo sterzo:
- `throttlePressRate` / `throttleReleaseRate`
- `brakePressRate` / `brakeReleaseRate`

### Decision: asimmetrico, 4 parametri distinti (2 per pedale)

## Question 5: Curva di riduzione dell'effetto weight transfer con la velocità

`speedDampening = 1 - (speed / maxSpeed)²` — quadratica, coerente con `understeerSpeedStrength` esistente.

### Decision: B — quadratica

## Question 6: Fattore base del lerp vel → heading

`lerpFactor = baseLerpFactor * rearGrip`. Il `baseLerpFactor` è un parametro pubblico su `VehicleActor`
(per supportare veicoli futuri con caratteristiche diverse).

### Decision: `baseLerpFactor = 0.5` (intermedio tra reattivo e deriva), parametrizzato su VehicleActor

## Question 7: Dove vive la nuova logica

Nuovi metodi privati `updatePedalInputs` e `updateWeightTransfer` in `DriveInputSystem`.
Lo stato (`throttleInput`, `brakeInput`, `weightTransfer`) vive su `VehicleActor` come proprietà pubbliche.
`applyKinematics` viene modificato per usare frontGrip/rearGrip e il lerp vel→heading.

### Decision: A — tutto in DriveInputSystem, nuovi metodi privati

## Question 8: Intensità del weight transfer e clamping del frontGrip

Formula: `frontGrip = clamp(1 - effectiveWT * weightTransferStrength, 0, frontGripCap)`
`rearGrip  = clamp(1 + effectiveWT * weightTransferStrength, 0, 1)`
- `weightTransferStrength` parametro pubblico su VehicleActor (default 0.4)
- `frontGripCap` parametro pubblico su VehicleActor (default 1.5)

### Decision: B — frontGrip può superare 1.0, cap parametrizzabile per vehicle (default 1.5)

## Question 9: I pedali graduali rimpiazzano i booleani anche in `computeSpeed`?

`throttleInput` e `brakeInput` usati sia per `computeSpeed` (forza proporzionale al pedale)
che per `weightTransfer`. I booleani `input.accelerating`/`input.braking` rimangono solo
per trigger UI (es. emitters), non per la fisica.

### Decision: A — sì, pedali graduali anche per velocità

## Question 10: Destino di `understeerSpeedStrength` e `understeerAngleStrength`

Rimuovere `understeerSpeedStrength` (ridondante con `speedDampening` quadratico del weight transfer).
Mantenere `angleFactor` basato su `understeerAngleStrength`: limite fisico indipendente dal carico sull'asse.

### Decision: B — rimuovi solo `understeerSpeedStrength`, mantieni `angleFactor`

## Question 11: Come si combinano `frontGrip`/`rearGrip` con il grip di superficie

Moltiplicativi: surface grip e weight transfer grip si moltiplicano su effectiveSteering e lerpFactor.
Su superfici scivolose il sovrasterzo è più facile da provocare (coerente con la realtà).

```ts
effectiveSteering = steeringAngle * angleFactor * averageWheelFactors.grip * frontGrip;
lerpFactor        = baseLerpFactor * rearGrip * averageWheelFactors.grip;
```

### Decision: A — moltiplicativi
