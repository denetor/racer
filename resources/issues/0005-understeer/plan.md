# Plan: Understeer — Attenuazione diretta di δ

## Context

Attualmente `DriveInputSystem.update()` calcola `deltaTheta = (speed * tan(steeringAngle) / L) * dt`
senza alcuna attenuazione: l'auto risponde allo stesso modo a qualsiasi velocità e angolo di sterzo,
producendo un effetto "carrello della spesa". L'obiettivo è ridurre l'efficacia dello sterzata
all'aumentare della velocità e dell'angolo, simulando il sottosterzo arcade.

## Approccio

Attenuazione diretta di δ (approccio A da `steering.md`): prima di calcolare `deltaTheta`,
si moltiplica `steeringAngle` per due fattori quadratici indipendenti — uno funzione della velocità,
uno funzione dell'angolo di sterzo — ottenendo un `effectiveSteering` ridotto.

Formula:
```
speedFactor        = 1 - (speed / maxSpeed)² * understeerSpeedStrength
angleFactor        = 1 - (|steeringAngle| / maxSteeringAngle)² * understeerAngleStrength
effectiveSteering  = steeringAngle * speedFactor * angleFactor
deltaTheta         = (speed * tan(effectiveSteering) / L) * dt
```

I fattori sono quadratici: l'effetto è quasi nullo a basse velocità/angoli, e diventa deciso
agli estremi. I due `strength` sono moltiplicati tra loro, quindi il sottosterzo peggiora
quando sia velocità che angolo sono alti contemporaneamente.

## Modifiche

### 1. `src/actors/vehicle.actor.ts`

Aggiungere due proprietà pubbliche nella sezione steering, accanto a `maxSteeringAngle`:

```ts
public understeerSpeedStrength: number = 0.5;
public understeerAngleStrength: number = 0.3;
```

### 2. `src/systems/drive-input.system.ts`

Sostituire il calcolo di `deltaTheta` (riga 59-62) con:

```ts
const L = Math.abs(drivable.frontAxlePosition) + Math.abs(drivable.rearAxlePosition);
const speedFactor = 1 - Math.pow(speed / drivable.maxSpeed, 2) * drivable.understeerSpeedStrength;
const angleFactor = 1 - Math.pow(Math.abs(drivable.steeringAngle) / drivable.maxSteeringAngle, 2) * drivable.understeerAngleStrength;
const effectiveSteering = drivable.steeringAngle * speedFactor * angleFactor;
const deltaTheta = (speed * Math.tan(effectiveSteering) / L) * dt;
drivable.heading = drivable.heading.rotate(deltaTheta);
drivable.vel = drivable.heading.normalize().scale(speed);
```

## Valori di default consigliati

| Parametro | Valore | Effetto a max speed + max sterzo |
|---|---|---|
| `understeerSpeedStrength` | 0.5 | `speedFactor = 0.5` |
| `understeerAngleStrength` | 0.3 | `angleFactor = 0.7` |
| **Combinato** | | `effectiveSteering = steeringAngle * 0.35` |

Il contributo maggiore viene dalla velocità (più arcade), l'angolo raffina il feeling.
Da calibrare in-game agendo sui due parametri.

## Verifica

1. Avviare il dev server: `npm run dev` (dentro il container `racer_app_1`)
2. Guidare in rettilineo a velocità bassa — la sterzata deve rispondere normalmente
3. Raggiungere velocità alta e sterzare al massimo — l'auto deve allargare la curva visibilmente
4. Sterzare al massimo a velocità bassa — l'effetto deve essere minimo (fattore quadratico)
5. Verificare che a velocità zero la sterzata non produca rotazione (invariato)
6. Eseguire `npm run test:unit` per verificare assenza di regressioni
