# Grill-me: Understeer Implementation

## Question 1: Quale approccio usare per simulare il sottosterzo?

Il doc `steering.md` descrive due modi:

- **A) Attenuazione diretta di δ** — Moltiplichi `steeringAngle` per un fattore `< 1` prima di calcolarlo nel `deltaTheta`. Il muso dell'auto gira meno, effetto "allargamento curva" visivo immediato.
- **B) Velocity lerp (Heading ≠ Velocity)** — L'heading ruota normalmente, ma `vel` si avvicina a `heading * speed` tramite un Lerp con un `grip` factor basso.

### Decision:

Solo **A** — attenuazione diretta di δ. Modifica minima, parametrizzabile, feedback visivo immediato. Il Lerp sarà un passo separato.

---

## Question 4: Dove mettere i parametri `understeerSpeedStrength` e `understeerAngleStrength`?

- **Su `VehicleActor`** — accanto agli altri parametri fisici.
- **Costanti in `DriveInputSystem`** — hardcoded, non tunabile per veicolo.

### Decision:

Su **`VehicleActor`**, come proprietà pubbliche accanto a `maxSteeringAngle` e `maxSpeed`.

---

## Question 3: Che forma matematica per i due fattori?

- **Lineare**: `1 - (x/xMax) * strength`
- **Quadratica**: `1 - (x/xMax)² * strength` — effetto lieve ai valori bassi, deciso agli estremi

### Decision:

**Quadratica per entrambi:**
- `speedFactor = 1 - (speed / maxSpeed)² * understeerSpeedStrength`
- `angleFactor = 1 - (|steeringAngle| / maxSteeringAngle)² * understeerAngleStrength`
- `effectiveSteering = steeringAngle * speedFactor * angleFactor`

---

## Question 2: Il fattore di attenuazione dipende da velocità, angolo, o entrambi?

- **Solo velocità** — `factor = f(speed)`: più vai forte, meno sterzi.
- **Solo angolo** — `factor = f(steeringAngle)`: più premi sul volante, meno risponde.
- **Entrambi moltiplicati** — `factor = f(speed) * f(angle)`: il sottosterzo peggiora se entri forte *e* sterzi tanto.

### Decision:

**Entrambi moltiplicati** — `effectiveSteering = steeringAngle * speedFactor * angleFactor`.

---
