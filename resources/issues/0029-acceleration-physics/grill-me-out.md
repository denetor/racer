# Grill-me — Issue #29: grip/traiettoria da `acceleration.y` invece di `weightTransfer`

## Obiettivo

In `DriveInputSystem` i calcoli di grip e traiettoria usano la proprietà `weightTransfer`.
Vanno riscritti per usare `acceleration.y`, e vanno rimossi **tutti** i riferimenti a
`weightTransfer` da `DriveInputSystem` e da `VehicleActor`.

## Contesto rilevato

- Oggi `weightTransfer` è un valore **normalizzato [-1, 1]**: `updateWeightTransfer()` lo fa
  tendere (con `moveToward` a `weightTransferRate = 0.5`) verso `throttleInput - brakeInput`.
  Viene passato a `computeGripFactors`, che lo moltiplica per `speedDampening` e
  `weightTransferStrength` (0.4).
- `acceleration.y` è in **px/s²**: a regime ~ `+500` a tutto gas (`accelerationForce/weight`)
  e ~ `-1600` in frenata (`brakingForce*grip/weight`). È calcolata da
  `computeLongitudinalAcceleration` in `updateAcceleration()`, che gira **dopo** `computeSpeed`
  e **prima** di `applyKinematics` (ordine già corretto per l'uso nel grip).
- Altrove la UI usa `ACCEL_FULL_SCALE = 800` come fondo scala dell'accelerometro
  (`src/ui/acceleration-applet.actor.ts`).
- I segni sono già coerenti: accelerazione positiva = gas = peso al posteriore, come
  `weightTransfer` positivo.
- Riferimenti a `weightTransfer` nel codice: `vehicle.actor.ts` (`weightTransfer`,
  `weightTransferRate`, `weightTransferStrength`), `drive-input.system.ts`
  (`updateWeightTransfer`, uso in `applyKinematics`), `math.service.ts` (param di
  `computeGripFactors`) più i relativi test.

---

## Question 1: Come normalizzare `acceleration.y` (px/s²) nel dominio [-1,1] atteso da `computeGripFactors`?

### Decision:
Si riusa il fondo scala **800** già in uso lato UI: `acceleration.y / 800`, poi clamp a [-1, 1].
(La collocazione fisica della costante è decisa nella Q5.)

**Conseguenza nota:** a tutto gas l'accelerazione (~500) mappa a un load ~0.625, mentre in
frenata (~-1600) satura a -1. Rispetto al vecchio `weightTransfer` (che raggiungeva ±1 in
entrambi i casi), lo spostamento di grip in accelerazione sarà più debole di quello in frenata.
Inoltre a velocità massima `acceleration.y → 0`, quindi il grip torna neutro (col vecchio
modello restava sbilanciato al posteriore). Comportamento accettato come intrinseco al modello
basato sull'accelerazione.

---

## Question 2: Manteniamo un lisciamento temporale del valore (come faceva `moveToward` su `weightTransfer`)?

### Decision:
**No.** Si usa il valore **istantaneo** di `acceleration.y` (normalizzato e clampato).
Di conseguenza **non si introduce alcuna nuova proprietà di stato** sull'actor, e spariscono
sia `weightTransfer` sia `weightTransferRate`. Il calcolo del carico longitudinale è inline in
`applyKinematics` (tramite l'helper della Q8).

> Nota: durante la grigliatura si era inizialmente optato per un valore lisciato, poi la
> decisione è stata corretta a favore del valore istantaneo.

---

## Question 3: Naming della (eventuale) nuova proprietà di stato e del suo rate

### Decision:
**Non applicabile.** Vista la Q2 (valore istantaneo, niente stato persistente), non c'è alcuna
nuova proprietà da nominare. `weightTransfer` e `weightTransferRate` vengono **rimosse** da
`VehicleActor`.

---

## Question 4: Gestione del segno in retromarcia

### Decision:
Si usa **`acceleration.y` grezzo** (già segnato dalla retromarcia in
`computeLongitudinalAcceleration`). Nessun caso speciale su `isReverse`. In retro il bilancio
del grip differirà dal vecchio comportamento di `weightTransfer`, ma le velocità in retro sono
basse e l'effetto è marginale; si privilegia semplicità e coerenza con l'accelerometro.

---

## Question 5: Dove collocare la costante di fondo scala 800

### Decision:
**Proprietà su `VehicleActor`**: aggiungere `accelerationFullScale: number = 800`.
Usata dal system per normalizzare il carico longitudinale ed evita la dipendenza
fisica→UI (un service/system non deve importare dal layer UI).

---

## Question 6: Quanto refactoring dell'applet per evitare la duplicazione di 800

### Decision:
**Refactor completo dell'applet** per avere un'unica fonte di verità:
- `calcDotOffset` riceve `fullScale` come parametro (invece della costante modulo).
- `AccelerationAppletActor` legge `vehicle.accelerationFullScale`.
- Si rimuove la costante `ACCEL_FULL_SCALE` da `acceleration-applet.actor.ts`.
- Si aggiornano i test in `acceleration-applet.actor.test.ts` (passare `fullScale` a
  `calcDotOffset`, incluso il caso di clamp over-range).

> Estende lo scope oltre `DriveInputSystem` + `VehicleActor`, ma è conseguenza diretta della Q5
> e accettato esplicitamente.

---

## Question 7: Rinominare `weightTransferStrength`?

### Decision:
**Sì → `loadTransferStrength`** (valore invariato 0.4). È un guadagno, non lo stato rimosso, ma
il nome conteneva "weightTransfer". Aggiornare la prop su `VehicleActor` e l'uso in
`applyKinematics`.

---

## Question 8: Rinominare il parametro di `computeGripFactors`?

### Decision:
**Sì → `longitudinalLoad`** (variabile interna `effectiveWT` → `effectiveLoad`).
Aggiornare `math.service.ts`, i commenti e `math.service.test.ts` (es. il test
"returns neutral grip when weightTransfer is zero").

---

## Question 9: Dove mettere il calcolo `clamp(acceleration.y / fullScale, -1, 1)`?

### Decision:
**Helper in `math.service.ts`**: es. `computeLongitudinalLoad(accelY, fullScale)` con test
dedicato, coerente con lo stile testabile del modulo (`computeGripFactors`,
`computeLongitudinalAcceleration`). `applyKinematics` lo invoca passando `drivable.acceleration.y`
e `drivable.accelerationFullScale`.

---

## Riepilogo operativo delle modifiche

**`src/services/math.service.ts`**
- Nuova funzione `computeLongitudinalLoad(accelY: number, fullScale: number): number`
  → `clamp(accelY / fullScale, -1, 1)`.
- `computeGripFactors`: rinomina param `weightTransfer` → `longitudinalLoad`,
  variabile `effectiveWT` → `effectiveLoad`. Aggiornare commenti.

**`src/actors/vehicle.actor.ts`**
- Rimuovere `weightTransfer` e `weightTransferRate`.
- Rinominare `weightTransferStrength` → `loadTransferStrength`.
- Aggiungere `accelerationFullScale: number = 800`.

**`src/systems/drive-input.system.ts`**
- Rimuovere il metodo `updateWeightTransfer()` e la sua chiamata in `update()`.
- In `applyKinematics`: calcolare
  `const longitudinalLoad = computeLongitudinalLoad(drivable.acceleration.y, drivable.accelerationFullScale);`
  e passarlo a `computeGripFactors` (al posto di `drivable.weightTransfer`), usando
  `drivable.loadTransferStrength`.
- Rimuovere l'import ora inutilizzato `moveToward`; aggiungere import `computeLongitudinalLoad`.
- L'ordine attuale (`updateAcceleration` prima di `applyKinematics`) è già corretto.

**`src/ui/acceleration-applet.actor.ts`**
- `calcDotOffset(acceleration, boundaryRadius, fullScale)`.
- L'actor legge `vehicle.accelerationFullScale`.
- Rimuovere `ACCEL_FULL_SCALE`.

**Test**
- `src/services/math.service.test.ts`: aggiornare nomi/commenti `weightTransfer`; aggiungere
  test per `computeLongitudinalLoad`.
- `src/ui/acceleration-applet.actor.test.ts`: passare `fullScale` a `calcDotOffset`.

**Verifica finale**
- `npm run test:unit`.
- Possibile aggiornamento delle baseline degli screenshot (`npm run test:integration-update`)
  se la dinamica modifica il rendering — da valutare a valle.