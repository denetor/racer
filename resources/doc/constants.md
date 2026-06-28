# Costanti che governano il comportamento di guida

Mappa delle costanti su cui intervenire per modificare il comportamento del veicolo
alla guida, divise per **dove vivono** e **cosa controllano**.

## 1. Datasheet per-veicolo (`PhysicVehicleActor`) — la sorgente di verità per il tuning

Queste sono le **manopole principali** per la sensazione di guida. Vivono sull'attore
perché sono proprietà del singolo veicolo.

### Massa e geometria (base di tutto)

| Costante | Valore | Effetto |
|---|---|---|
| `mass` | 1000 kg | Inerzia: più alta = accelera/frena/curva più pigro |
| `lengthMeters` | 4.5 m | Scala px↔metri; cambia anche il passo derivato |
| `cogPosition` | `(0,0)` | Sposta il baricentro avanti/dietro → sotto/sovrasterzo |
| `cogHeight` | 0.5 m | Guadagno del trasferimento di carico in accel/frenata |

### Tenuta e bilanciamento (il cuore di sotto/sovrasterzo)

| Costante | Valore | Effetto |
|---|---|---|
| `corneringStiffnessFront` | 40000 N/rad | Mordente anteriore. Più basso del posteriore → sottosterzo sicuro |
| `corneringStiffnessRear` | 50000 N/rad | Mordente posteriore. Avvicinandolo all'anteriore il retro diventa nervoso |

> Il rapporto front/rear è la leva più diretta per regolare il carattere in curva.

### Motore e velocità massima

| Costante | Valore | Effetto |
|---|---|---|
| `enginePower` | 150000 W (~200 hp) | Spinta alle alte velocità; alza il plateau di velocità max |
| `maxDriveForce` | 8000 N | Spinta da fermo (trazione); accelerazione iniziale e wheelspin |
| `drivetrain` | `'rwd'` | `rwd`/`fwd`/`awd` cambia da dove emerge il sovra/sottosterzo di potenza |
| `driveBias` | 0 | Solo AWD: frazione di coppia all'anteriore |

### Aerodinamica (dove cade la velocità massima)

| Costante | Valore | Effetto |
|---|---|---|
| `dragCoefficient` | 0.7 | Resistenza aria; più alto = velocità max più bassa |
| `frontalArea` | 2.2 m² | Idem, moltiplica il drag |

### Frenata

| Costante | Valore | Effetto |
|---|---|---|
| `brakeForce` | 12000 N | Forza frenante totale; spazio di arresto |
| `brakeBias` | 0.6 | Frazione all'anteriore; alto = anteriore blocca prima (stabile) |

### Sterzo e pedali (feeling/reattività comandi)

| Costante | Valore | Effetto |
|---|---|---|
| `maxSteeringAngle` | 0.4 rad | Angolo di sterzo massimo |
| `steeringSpeed` | 2.5 rad/s | Quanto rapido lo sterzo raggiunge il target |
| `steeringReturnSpeed` | 2.5 rad/s | Ritorno al centro |
| `throttlePressRate`/`ReleaseRate` | 5.0 | Rampa del gas (gradualità) |
| `brakePressRate`/`ReleaseRate` | 5.0 | Rampa del freno |
| `reverseToggleMaxSpeed` | 0.5 m/s | Soglia per inserire la retromarcia |

### Consumo gomme e carburante (dinamiche lente)

| Costante | Valore | Effetto |
|---|---|---|
| `tyreWearRate` | 0.1 /km | Quanto rapido degradano le gomme (e quindi il grip) |
| `tyreWearSlipPenalty` | 5 | Moltiplicatore usura quando la gomma slitta |
| `fuelCapacity`/`fuelMass` | 60 kg | Carburante (massa al COG) |
| `fuelBurn` | 0.01 kg/s | Consumo a pieno gas |

## 2. Costanti fisiche condivise (`physics.constants.ts`) — proprietà di simulazione/tyre/surface

Non sono per-veicolo ma cambiano comunque la guida:

| Costante | Valore | Effetto |
|---|---|---|
| `DEFAULT_SURFACE_GRIP` | 1.0 | μ di fallback fuori mappa |
| `LOW_SPEED_BLEND_THRESHOLD` | 5 m/s | Sotto questa soglia passa al modello cinematico (curva a bassa velocità) |
| `CRR` | 0.015 | Resistenza al rotolamento (rallenta in coast) |
| `V_FLOOR` | 1 m/s | Evita divisione per zero su `P/v` da fermo |
| `SKID_MIN_SPEED` | 0.5 m/s | Sotto cui si sopprimono wheelspin/lockup (e fumo) |
| `MIN_TYRE_WEAR` | 0.55 | Grip residuo minimo a gomma consumata |
| `FUEL_BURN_THRESHOLD` | 0.5 | Cadenza di consumo carburante |
| `RHO_AIR`, `G` | 1.225, 9.81 | Costanti fisiche reali (meglio non toccare) |

## 3. Costante locale del sistema

- `WHEEL_SMOKE_EMIT_RATE` = 120 (in `physic-vehicle.actor.ts`): solo estetica del fumo,
  non la fisica.

---

**Consiglio pratico** se vuoi modificare il carattere di guida: parti da
`corneringStiffnessFront`/`Rear` (sotto/sovrasterzo), `maxDriveForce`/`enginePower`
(accelerazione/velocità), `mass` (pesantezza), `maxSteeringAngle`/`steeringSpeed`
(reattività sterzo) e `brakeForce`/`brakeBias` (frenata). Sono tutte sull'attore, quindi
le ritocchi in un unico posto senza toccare i sistemi.