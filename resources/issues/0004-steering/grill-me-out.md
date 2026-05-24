# Grill-me: Steering Implementation

## Question 1: Dove vive la logica fisica del modello a bicicletta?

Opzioni:
- A) Nuovo `VehiclePhysicsSystem` separato
- B) Espandi `DriveInputSystem`
- C) `VehicleActor.onPostUpdate` (c'è già un TODO)

### Decision:
**C** — La logica fisica del modello a bicicletta va in `VehicleActor.onPostUpdate`.

## Question 2: Come viene tracciata la velocità scalare?

Opzioni:
- A) Aggiungi `speed: number` su `VehicleActor`; `DriveInputSystem` scrive solo quello, `onPostUpdate` lo legge
- B) Continua a leggere `vel.magnitude` come speed (ambiguità input/output)

### Decision:
**A** — `VehicleActor` avrà un campo `speed: number`. `DriveInputSystem` scrive `drivable.speed`, `onPostUpdate` lo legge per il physics step. `vel` diventa puro output del lerp.

## Question 3: Come viene aggiornato `heading`?

Formula: `Δθ = (speed * tan(steeringAngle) / L) * dt`, con `L = 63 px`.

Opzioni:
- A) Ruota `heading` come Vector: `heading = heading.rotate(Δθ)` — zero breaking changes
- B) Sostituisci `heading: Vector` con `headingAngle: number` — aritmetica più semplice ma riscrive tutto il codice che usa heading come Vector

### Decision:
**A** — `heading.rotate(Δθ)` usando il metodo di Excalibur. Il vettore rimane sempre normalizzato e il codice esistente non cambia.

## Question 4: Come viene aggiornata la posizione — pivot sull'asse posteriore o vel di Excalibur?

Opzioni:
- A) Pivot esatto: calcola posizione rear axle, applica Δθ, ricava nuovo centro — cinematica corretta ma combatte contro Excalibur
- B) Lerp arcade: aggiorna heading con Δθ, poi `vel = vel.lerp(heading * speed, grip)`, Excalibur integra automaticamente

### Decision:
**B** — Lerp arcade. Excalibur integra `vel` in `pos` ogni frame. Nessun calcolo di pivot esplicito.

## Question 5: Grip formula?

Opzioni:
- A) `gripFactor: number = 0.15` costante su VehicleActor
- B) Dipendente dalla velocità: `grip = maxGrip * (1 - speed/maxSpeed)`
- C) Grip = 1 — `vel = heading * speed`, nessun slip

### Decision:
**C** — Nessun lerp. `vel` coincide sempre con `heading * speed`. Implementazione più semplice per il v1; slip e drift vengono dopo.

## Question 6: Come si divide il lavoro tra `DriveInputSystem` e `onPostUpdate`?

Opzioni:
- A) Refactora DriveInputSystem: rimuovi la scrittura di `vel`, scrivi solo `speed`. onPostUpdate gestisce tutto il resto.
- B) Lascia DriveInputSystem com'è, fai sovrascrivere `vel` a onPostUpdate ogni frame.

### Decision:
**A** — DriveInputSystem scrive solo `steeringAngle` e `speed`. `onPostUpdate` calcola heading e vel. Separazione netta.

## Question 7: L'`heading` iniziale va normalizzato?

Valore attuale: `vec(0.5, 0.4)` — non normalizzato, non corrisponde all'orientamento dello sprite (muso in alto = y negativa).

Opzioni:
- A) Correggi a `vec(0, -1)` — semanticamente corretto, allineato allo sprite
- B) Lascia `vec(0.5, 0.4)` — non bloccante poiché si chiama sempre `.normalize()`

### Decision:
**A** — `heading` inizializzato a `vec(0, -1)`. Corretto semanticamente e allineato all'orientamento visivo del car sprite.