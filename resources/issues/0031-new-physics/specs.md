# Sistema di fisica veicolare a 4 ruote

> Documento di lavoro per pianificare, codice alla mano, la riscrittura del layer fisico
> del veicolo nel gioco di corse 2D top-down (framework **ExcaliburJS**, TypeScript).

---

## 1. Il problema (abstract)

Il modello attuale funziona ma simula la fisica in modo approssimato: tiene una velocità
sostanzialmente scalare e fa ruotare l'`heading` con un modello cinematico (bicicletta di
Ackermann), in cui la velocità "insegue" la direzione del muso tramite una `lerp`. Effetti
come sovrasterzo, sottosterzo, pattinamento e scivolate non esistono davvero: sono finti,
ottenuti barando sul grip.

L'obiettivo è passare a una **simulazione a forze su modello a 4 ruote indipendenti**, in cui
quei comportamenti **emergano dalla fisica** invece di essere scriptati. La leva concettuale è
una sola: smettere di trattare la velocità come uno scalare legato all'heading, e modellare il
veicolo come un **corpo rigido planare** con velocità vettoriale, direzione (`heading`) e
velocità di imbardata (`yawRate`) come stati indipendenti. L'angolo tra dove punta il muso e
dove va davvero la velocità è lo **slip angle**, ed è da lì che nasce tutto.

La scelta del modello a 4 ruote (anziché a bicicletta) è motivata dal fatto che il gioco sa già
**su quale superficie si trova ogni singola gomma**: il grip asimmetrico tra le quattro ruote è
quindi un input reale della simulazione, non un dettaglio da mediare via.

---

## 2. Situazione di partenza (codebase esistente)

### Classi e attori

- **`VehicleActor`** (`actors/vehicle.actor.ts`)
  Attore cinematico attuale. Stato e parametri principali:
  - **Massa e forze:** `weight` (kg), `accelerationForce`, `brakingForce`, `frictionForce`.
  - **Velocità:** `maxSpeed`/`maxReverseSpeed` (px/s, tetti rigidi), `isReverse` (toggle retromarcia),
    `previousSpeed` (modulo velocità comandata al frame precedente).
  - **Direzione e moto:** `heading` (vettore muso, distinto da `Actor.vel`), `acceleration`
    (vettore: `y` = longitudinale px/s², `x` = laterale, lasciata a 0 per ora).
  - **Sterzo:** `steeringAngle` con `maxSteeringAngle`, rampa `steeringSpeed` e ritorno
    `steeringReturnSpeed`, più `understeerAngleStrength` (riduzione efficacia ad angolo alto).
  - **Pedali smussati:** `throttleInput`/`brakeInput` ∈ [0,1] con `throttlePressRate`/`releaseRate`
    e `brakePressRate`/`releaseRate`.
  - **Approssimazione del trasferimento di carico:** `loadTransferStrength`, `accelerationFullScale`,
    `frontGripCap`, `baseLerpFactor`.
  - **Geometria:** `frontAxlePosition`/`rearAxlePosition` e `frontAxleWidth`/`rearAxleWidth`.
  - **Ruote/superfici:** `wheelFactors` come `Map<string, WheelFactor>` per le quattro ruote
    (`frontLeftWheel`, `frontRightWheel`, `rearLeftWheel`, `rearRightWheel`); helper
    `getAverageWheelFactors()` che ne media drag/grip/power.
  - **Attori-figli e grafica:** le quattro ruote, gli assi (creati ma non aggiunti alla scena),
    il `laptimeTransponder`, gli emitter di fumo (`idleEmitters`/`throttleEmitters`) gestiti da
    `setEmitters()`, i collider compositi.
  - **Render:** `rotateToHeading()` (sprite verso l'heading) e `getWheelAxisRotation()` per le
    ruote anteriori sterzanti, applicati in `onPostUpdate`.

- **`SurfaceActor`** (`actors/surface.actor.ts`)
  Superficie con `dragFactor`, `powerFactor`, `gripFactor`, `surfaceName`.

### Servizi

- **`SurfacesService`** (`services/surfaces.service.ts`)
  Su mappa Tiled assegna a ogni superficie i fattori per tipo di terreno (tarmac/grass/graveltrap)
  e, su `collisionstart` di una ruota, aggiorna il `WheelFactor` corrispondente con grip/drag/power
  della superficie. **Non gestisce `collisionend`:** una ruota conserva l'ultimo grip finché non
  entra in una nuova superficie.

- **`math.service.ts`** (`services/math.service.ts`)
  Funzioni pure usate dalla pipeline di guida: `sumClamp`, `smoothPedal`, `computeGripFactors`,
  `computeLongitudinalLoad`, `computeLongitudinalAcceleration`. Presenti ma non usate nel flusso
  attuale: `moveToward`, `getHeadingFromRadians`.

### Sistemi e componenti

- **`DriveInputSystem`** (`systems/drive-input.system.ts`)
  Sistema `Update` a priorità `Higher`. Interroga `[DrivableComponent]` e opera sul primo entity.
  Ogni frame, in `update()`, esegue in ordine: `readInput` (tastiera via `KeybindingsService`),
  `handleReverseToggle` (toggle retromarcia solo a veicolo quasi fermo), `updateSteeringAngle`
  (rampa/ritorno con `sumClamp`), `updatePedalInputs` (`smoothPedal`), `updateThrottleEffects`
  (emitter di scarico), `computeSpeed` (velocità **scalare** da forze + grip/drag/power medi),
  `updateAcceleration` (accelerazione longitudinale → `acceleration.y`, aggiorna `previousSpeed`),
  `applyKinematics` (modello a bicicletta: ruota l'`heading`, ricava `frontGrip`/`rearGrip` dal
  carico longitudinale, fa la `lerp` di `vel` verso `heading * speed` e corregge `pos` attorno
  all'asse posteriore).

- **`WheelFactor`** (`models/wheel-factor.model.ts`) — `drag`, `grip`, `power` per ruota.
- **`DrivableComponent`** (`components/drivable.component.ts`) — componente marcatore (vuoto) per
  la query del sistema.

### Cosa si riusa / cosa si sostituisce

| Si riusa | Si sostituisce |
| --- | --- |
| Smussamento pedali (`smoothPedal`, `throttleInput`/`brakeInput`) | Velocità scalare (`computeSpeed`, `previousSpeed`, tetti `maxSpeed`/`maxReverseSpeed`) |
| Rampa e ritorno dello sterzo (`updateSteeringAngle`, `steeringAngle`, `sumClamp`) | `applyKinematics` (bicicletta + `lerp` di `vel` verso l'heading) |
| Attori-figli ruote/assi e rotazione sprite (`rotateToHeading`, `onPostUpdate`) | Approssimazione del carico (`computeGripFactors`, `computeLongitudinalLoad`, `loadTransferStrength`, `frontGripCap`, `accelerationFullScale`, `baseLerpFactor`) |
| Tracciamento superficie per ruota via `collisionstart` (`wheelFactors`, chiavi ruota) | Media dei fattori ruota (`getAverageWheelFactors`) e `understeerAngleStrength` |
| Pattern di query con `DrivableComponent` | `powerFactor` nel calcolo della spinta (la superficie darà solo `gripFactor`) |

> Le due nuove classi target sono **`PhysicVehicleActor`** e **`PhysicDriveInputSystem`**, con la
> fisica pura raccolta in un service dedicato (estensione di `math.service` o nuovo
> `vehicle-physics.service`).

---

## 3. Approfondimenti tecnici

### 3.1 Il cambio di paradigma: corpo rigido planare con imbardata

Lo stato del veicolo diventa:

- `pos` (vec, mondo) e `vel` (vec, mondo) — la velocità è un vettore vero
- `heading` / yaw `θ` — dove punta il muso
- `yawRate` `ω` (rad/s) — velocità di rotazione del corpo, **stato indipendente da `vel`**

È la separazione tra `ω` e direzione di `vel` a rendere possibili sovra/sottosterzo: lo slip
angle è proprio l'angolo tra heading e velocità. Finché i due restano incatenati (come ora), quei
fenomeni non possono esistere.

### 3.2 Unità di misura e scala

Si definisce `lengthMeters` sul veicolo; con la dimensione dello sprite si ricava
`pxPerMeter`. Tutta la fisica si calcola in **SI** (kg, m/s, N, rad) e si converte in pixel solo
al momento del rendering (scrivendo `actor.pos`/`actor.vel`). Questo rende possibili statistiche
metriche reali (velocità in km/h, distanza percorsa, spazi di frenata).

> **Mappatura sul codice.** Oggi le grandezze sono in pixel: `maxSpeed`/`maxReverseSpeed` in px/s
> e la geometria (`frontAxlePosition`/`rearAxlePosition`, `frontAxleWidth`/`rearAxleWidth`) in px
> dal centro dell'actor; `weight` è già in kg. Lo sprite del veicolo misura 70×121 px (sourceView
> in `vehicle.actor.ts`): da `lengthMeters` e l'altezza sprite (121 px) si ricava `pxPerMeter`, con
> cui convertire **una volta sola** le costanti px esistenti in SI.

### 3.3 Ripartizione statica del carico

Da `cogPosition` e posizioni assi si ricava la quota di peso su ogni gomma. Con `a` = distanza
baricentro→asse anteriore, `b` = baricentro→posteriore, passo `L = a + b`:

- frazione anteriore = `b / L`, posteriore = `a / L`
- ripartizione sinistra/destra analoga, da offset laterale del baricentro e carreggiate

Risultano quattro `Fz_static` (in Newton).

> **Mappatura sul codice.** `a` e `b` derivano dalle posizioni assi già presenti
> (`frontAxlePosition` ≈ −33 px, `rearAxlePosition` ≈ 35 px → passo ~68 px); le carreggiate da
> `frontAxleWidth`/`rearAxleWidth` (60/62 px). Manca `cogPosition`: va aggiunto su
> `PhysicVehicleActor` (default = centro geometrico, l'assunzione implicita di oggi). Le quattro
> chiavi ruota restano `frontLeftWheel`/`frontRightWheel`/`rearLeftWheel`/`rearRightWheel`, le
> stesse della `wheelFactors` Map.
>
> Tutte queste misure sono **relative al centro dello sprite**: in ExcaliburJS l'`anchor` (punto di
> posizionamento e centro di rotazione) è di default al centro, e conviene **mantenerlo così**. In
> questo modo `cogPosition` e i bracci `r_i` vivono nello stesso sistema di coordinate dell'actor,
> senza riallineamenti tra origine fisica e origine di rendering.

### 3.4 Trasferimento di carico (il baricentro NON si muove)

Il carico statico è solo il punto di partenza. Sotto accelerazione/frenata e in curva il carico
si ridistribuisce:

- longitudinale: `ΔFz = m · a_x · h / L`
- laterale: `ΔFz = m · a_y · h / track`

dove `h = cogHeight`. La `Fz` per ruota = statico + trasferimenti, con **clamp a `≥ 0`** (una
ruota scaricata ha grip zero — fenomeno reale).

> **Punto critico.** In un corpo rigido il baricentro **resta fisso nel corpo**: non scivola in
> avanti in frenata. Ciò che si sposta è il *carico* (`Fz`) tra le gomme. Spostare il punto
> baricentro a ogni frame (a) conterebbe due volte l'effetto già catturato dal trasferimento di
> carico, e (b) corromperebbe i bracci `r_i` delle ruote (calcolati rispetto al baricentro), che
> entrano nella coppia di imbardata → dinamica rotatoria sbagliata. Regola: **baricentro fisso,
> tutta la dinamica nelle quattro `Fz`.** L'unica eccezione legittima è un cambio di massa *lento*
> (carburante), aggiornato su cadenza di minuti, non nella fisica per-frame.

### 3.5 Il cerchio di aderenza (cuore del modello)

Ogni gomma può produrre una forza con modulo massimo `μ · Fz`, dove
`μ = grip_superficie × usura_gomma`. La forza ha due componenti: longitudinale `Fx`
(trazione/freno) e laterale `Fy` (dallo slip angle). Il vincolo è che il loro modulo combinato non
superi il raggio del cerchio. Se la forza richiesta esce dal cerchio, la gomma **scivola**.

Un solo meccanismo genera tutti i comportamenti, a seconda di dove la richiesta esce dal cerchio e
di **quale ruota** esce per prima:

- esce in alto → pattinamento in accelerazione (motore chiede più trazione del grip)
- esce in basso → bloccaggio in frenata
- esce di lato → perdita di tenuta laterale
- saturano le anteriori → sottosterzo; le posteriori → sovrasterzo; tutte e quattro → scivolata
- superfici diverse sotto le gomme → forze laterali/longitudinali asimmetriche → coppia di
  imbardata: l'auto "tira" o sbanda da sola

### 3.6 Velocità per ruota (perché il modello a 4 ruote ha senso)

Ogni ruota è in un punto diverso di un corpo che ruota, quindi vede una velocità diversa. Con
braccio `r_i` (posizione ruota **rispetto al baricentro**):

```
v_i_x = v_x − ω · r_i_y
v_i_y = v_y + ω · r_i_x
```

Da qui ogni ruota ha il **suo** slip angle (per le anteriori si sottrae lo sterzo `δ`):

```
α_i = atan2(v_i_y, v_i_x) − δ_i
```

> **Mappatura sul codice.** I bracci `r_i` coincidono con le posizioni dei quattro attori-figli
> ruota già creati in `onInitialize` (poste su assi/carreggiate), convertite in metri e riferite a
> `cogPosition`. `δ` è lo `steeringAngle` esistente (max `maxSteeringAngle` = 0.4 rad), applicato
> solo alle ruote anteriori — la stessa logica con cui oggi `getWheelAxisRotation` ruota le anteriori.

### 3.7 La pipeline di un frame (ordine di calcolo)

1. **Velocità nel sistema corpo**: ruota `vel` di `−θ` → `v_x` (avanti), `v_y` (laterale).
2. **Velocità di ogni ruota**: formula 3.6.
3. **Slip angle per ruota**: formula 3.6.
4. **Carico `Fz` per ruota**: statico + trasferimenti (3.4), clamp `≥ 0`.
5. **Forza pneumatica per ruota**: laterale dallo slip (`Fy = −Cα · α_i`, satura), longitudinale
   da motore/freno, poi **clamp combinato** a `μ_i · Fz_i` con `μ_i = grip_superficie_i · usura_i`.
6. **Somma forze e coppia**: forza netta `= Σ F_i` (ruotando prima le forze anteriori di `δ`) +
   resistenze al baricentro; coppia di imbardata `= Σ (r_i_x · F_i_y − r_i_y · F_i_x)`.
7. **Integrazione** (attenzione ai termini incrociati del sistema corpo):
   ```
   v̇_x = F_x/m + v_y · ω
   v̇_y = F_y/m − v_x · ω
   ω  += (coppia / Iz) · dt
   θ  += ω · dt
   ```
   Poi riconverti `v` in coordinate mondo e aggiorna `pos`.

> **Mappatura sul codice.** Questa pipeline sostituisce interamente `applyKinematics` +
> `computeSpeed` + `updateAcceleration` del `DriveInputSystem`. Attenzione alla convenzione assi:
> qui il sistema corpo è **x = avanti, y = laterale**, mentre l'attuale `VehicleActor.acceleration`
> tiene il longitudinale su `y`. Il `PhysicVehicleActor` deve adottare la convenzione corpo per
> evitare ambiguità. La scrittura finale di `pos`/`vel` (in px) resta l'unico punto di contatto col
> rendering, come oggi.

### 3.8 Motore e resistenze (il plateau emergente)

Modello **potenza-limitata**, senza simulare il cambio:

- forza di trazione richiesta: `F_drive = min(F_max, P / v)` (forte da fermo, cala con la velocità)
- resistenza aerodinamica: `F_aero = ½ · ρ · Cd · A · v²`
- attrito di rotolamento: `F_roll = Crr · m · g`

La velocità massima è l'equilibrio dove `P/v = F_aero + F_roll`: il **plateau emerge da solo**,
non si impone un tetto rigido. La `F_drive` passa comunque dentro il cerchio di aderenza, e
l'eccesso diventa pattinamento.

> **Mappatura sul codice.** Sostituisce `accelerationForce`/`frictionForce` e i tetti
> `maxSpeed`/`maxReverseSpeed`: `F_max` prende il posto di `accelerationForce`, il plateau quello
> del clamp su `maxSpeed`, `F_roll`/`F_aero` quello di `frictionForce`. La `F_drive` non scrive più
> una `speed` scalare (via `computeSpeed`) ma entra come `Fx` nel cerchio di aderenza.

### 3.9 Trazione come distribuzione della forza motrice

La trazione **non aggiunge fisica nuova**: definisce solo a quali ruote arriva `F_drive`.

- `drivetrain`: `fwd` / `rwd` / `awd`, con `driveBias` (frazione all'anteriore) per l'integrale
- la **frenata è separata e indipendente**: agisce su tutte e quattro le ruote, con bias anteriore
- i caratteri di guida emergono dalla combinazione cerchio + trasferimento di carico:
  posteriore → sovrasterzo di potenza; anteriore → sottosterzo e tendenza a pattinare (in
  accelerazione l'avantreno si scarica); integrale → più trazione e bilanciamento neutro,
  regolabile col `driveBias`
- i **differenziali** (aperto/autobloccante) sono rimandati a uno step successivo: per partire,
  split 50/50 dentro l'asse e il clamp per-ruota gestisce il pattinamento individuale

> **Mappatura sul codice.** `drivetrain` e `driveBias` sono nuovi parametri su `PhysicVehicleActor`;
> la frenata sostituisce `brakingForce` distribuendola sulle quattro ruote (bias anteriore) invece
> di sottrarla alla `speed` scalare in `computeSpeed`.

### 3.10 Blend cinematico a bassa velocità (priorità)

Sotto una soglia di velocità (es. ~1–2 m/s) gli slip angle diventano rumore numerico (`atan2` di
velocità quasi nulle) e l'auto vibra o parte per la tangente. Si fonde verso il modello cinematico
(forze laterali → 0 al calare di `v`, heading agganciato alla direzione di marcia). Con quattro
ruote ci sono quattro `atan2` instabili invece di due, quindi va previsto **dal primo strato**.

### 3.11 Manopole di taratura principali

- `Iz` (momento d'inerzia di imbardata, `≈ m·(L²+W²)/12`): più basso = auto nervosa/rotante, più
  alto = stabile/pigra
- `Cα` (rigidezza in deriva): quanta forza laterale per unità di slip
- `cogHeight`: guadagno del trasferimento di carico (alto = trasferimenti marcati)

---

## 4. Caratteristiche da implementare ed effetti da considerare

> Le aggiunte rispetto alla discussione iniziale sono marcate con ★.

### Fondamenta e unità
- [ ] Lunghezza veicolo in metri + dimensione sprite → `pxPerMeter`
- [ ] Calcoli interni in SI, conversione in pixel solo per il rendering
- [ ] Statistiche metriche: velocità reale, distanza percorsa, spazi di frenata

### Architettura e stato
- [ ] Nuove classi `PhysicVehicleActor` + `PhysicDriveInputSystem` (affiancano gli attuali
  `VehicleActor`/`DriveInputSystem`, non li toccano finché non si fa lo switch nella scena)
- [ ] Riuso di: smussamento pedali (`smoothPedal`, `throttleInput`/`brakeInput`), rampa sterzo
  (`updateSteeringAngle`, `sumClamp`), attori-figli ruote, rotazione sprite (`rotateToHeading`,
  `onPostUpdate`)
- [ ] Funzioni fisiche pure in un service (`math.service` o nuovo `vehicle-physics.service`); stato
  sull'actor; orchestrazione nel system; query via `DrivableComponent`
- [ ] Stato a corpo rigido planare: `vel` (vettore mondo), `heading`, `yawRate` indipendente
- [ ] Modello a **4 ruote** indipendenti, con le chiavi ruota esistenti
  (`frontLeftWheel`/`frontRightWheel`/`rearLeftWheel`/`rearRightWheel`)
- [ ] **Parametrizzazione spinta:** costanti generiche (ρ aria, `g`, soglie, ...) in un file
  condiviso; costanti per-veicolo (`maxSteeringAngle`, massa, attriti, capacità serbatoio, consumi,
  ...) nel file del singolo veicolo. Niente magic number nel system
- [ ] **Helper puri** per grandezze derivate (es. massa totale = `mass` + carburante), in un solo
  punto e testabili
- [ ] Mantenere l'`anchor` di ExcaliburJS al **centro dello sprite** (origine fisica = origine di
  rendering = centro di rotazione)

### Massa e baricentro
- [ ] `mass` in kg (riuso/rinomina di `weight`, già in kg)
- [ ] `cogPosition` (avanti/indietro + offset laterale) e `cogHeight` statici per veicolo (nuovi;
  oggi il COG è implicitamente il centro dell'actor)
- [ ] Ripartizione statica del peso sulle 4 gomme
- [ ] Baricentro **fisso nel corpo**: la dinamica vive nel trasferimento di carico
- [ ] ★ **Peso del carburante** concentrato **al baricentro**, consumato nel tempo: riduce la
  massa totale senza alterare il bilanciamento (semplificazione voluta); aggiornato su cadenza
  lenta, fuori dalla fisica per-frame. La massa usata dalla fisica passa da un helper puro
  (`getTotalMass = mass + fuelMass`), unico punto di verità

### Trasferimento di carico
- [ ] Longitudinale: `ΔFz = m·a_x·h / L`
- [ ] Laterale: `∝ m·a_y·h / track`
- [ ] `Fz` per ruota = statico + trasferimenti, clamp `≥ 0` (ruota scaricata = grip zero)

### Modello pneumatico (cerchio di aderenza)
- [ ] Forza per ruota limitata da `μ·Fz`
- [ ] `μ` = grip superficie (per ruota) × usura gomma
- [ ] Forza laterale da slip angle per ruota; longitudinale da motore/freno
- [ ] Clamp combinato (slip misto) sul cerchio

### Comportamenti emergenti (non scriptati)
- [ ] Pattinamento in accelerazione (richiesta motrice > grip)
- [ ] Bloccaggio in frenata (richiesta frenante > grip)
- [ ] Sottosterzo / sovrasterzo / scivolata a 4 ruote
- [ ] Superfici asimmetriche → coppia di imbardata, auto che "tira" o sbanda

### Superficie per ruota
- [ ] Ogni gomma legge la sua superficie via `collisionstart` su `SurfacesService`; la superficie
  fornisce **solo il grip** (`gripFactor`), `powerFactor` esce dal flusso
- [ ] Gestione `collisionend` (oggi assente), così una ruota non si porta dietro il grip di una
  superficie già lasciata
- [ ] Estendere/ripulire `WheelFactor`: via `power` e `drag` (vestigiali col nuovo flusso), dentro
  `gripSurface`, `wear`, `load` (`Fz`), `slipAngle` e flag di pattinamento

### Motore e resistenze
- [ ] Modello potenza-limitata: `F_drive = min(F_max, P/v)`
- [ ] Resistenza aerodinamica (`½·ρ·Cd·A·v²`) + attrito di rotolamento
- [ ] Plateau alla velocità massima emergente dall'equilibrio

### Trazione
- [ ] `drivetrain`: anteriore / posteriore / integrale, con `driveBias`
- [ ] Trazione = distribuzione forza motrice; frenata separata (tutte le ruote, bias anteriore)
- [ ] Differenziali (aperto/autobloccante) rimandati

### Usura gomme
- [ ] `wear ∈ [0,1]`, parte da ~1.0 e cala con i km
- [ ] Incide sul grip: `μ_eff = grip_superficie · wear`
- [ ] ★ Lo **slittamento accelera il consumo**: guidare in scivolata o pattinamento usura più in
  fretta

### Bassa velocità (priorità)
- [ ] Sotto soglia, blend verso modello cinematico per evitare l'instabilità degli slip angle

---

## 5. Ordine di costruzione (a strati)

L'implementazione procede a strati, verificando la stabilità a ogni passo: una fisica a forze con
imbardata è quasi impossibile da debuggare se è già completa quando appare il primo bug.

1. **Modello a 4 ruote lineare stabile** con blend cinematico a bassa velocità
   (modello pneumatico lineare, niente cerchio ancora): verifica che guidi e curvi stabile.
2. **Cerchio di aderenza** + carico statico → arrivano scivolate e sovra/sottosterzo.
3. **Trasferimento di carico** longitudinale e laterale.
4. **Motore** (potenza-limitata) + aerodinamica → compare il plateau; qui entra anche la
   distribuzione per **trazione** (FWD/RWD/AWD).
5. **Pattinamento e bloccaggio** come saturazione longitudinale del cerchio.
6. **Usura gomme, carburante e statistiche metriche**.

**Rimandato:** modellazione dei differenziali (aperto/autobloccante).

---

## 6. Note operative per l'intervento sulla codebase

- Mantenere il pattern attuale: **parametri e stato** su `PhysicVehicleActor`, **funzioni pure**
  nel service (testabili a tavolino — con una fisica così è oro), **orchestrazione** in
  `PhysicDriveInputSystem`.
- **Affiancare, non sostituire in-place.** Le nuove classi convivono con `VehicleActor`/
  `DriveInputSystem`; lo switch avviene in `PlaygroundScene` (registra il nuovo system e istanzia
  il nuovo actor) quando il modello è stabile. Riusare `DrivableComponent` per la query, così il
  nuovo sistema si aggancia come quello esistente.
- **Scala e unità.** Derivare `pxPerMeter` dall'altezza sprite (121 px) e da `lengthMeters`;
  convertire una volta sola in SI le costanti px esistenti (`maxSpeed`, posizioni/larghezze assi).
- **Convenzione assi.** Adottare il sistema corpo **x = avanti, y = laterale**: l'attuale
  `acceleration` (dove `y` è il longitudinale) non si riusa così com'è.
- **Anchor al centro.** Mantenere l'`anchor` di default di ExcaliburJS (centro dello sprite, che è
  anche il centro di rotazione): assi e ruote sono già posizionati rispetto ad esso, quindi
  `cogPosition` e bracci `r_i` non richiedono riallineamenti tra fisica e rendering.
- **Parametrizzazione.** Separare nettamente le **costanti generiche** (ρ aria, `g`, soglie del
  blend a bassa velocità, ...) in un file condiviso (es. `physics.constants.ts`) dalle **costanti
  per-veicolo** (`mass`, attriti, `maxSteeringAngle`, `drivetrain`/`driveBias`, `lengthMeters`,
  `cogPosition`/`cogHeight`, `Iz`, `Cα`, capacità serbatoio, consumo, ...) che restano sul file del
  singolo veicolo. Obiettivo: nessun magic number sparso nel system, e veicoli diversi ottenuti
  cambiando solo i parametri.
- **Helper puri.** Esporre nel `vehicle-physics.service` funzioni pure per le grandezze derivate, con
  un unico punto di verità e testabili a tavolino. Esempio cardine: `getTotalMass(vehicle) = mass +
  fuelMass`, usata da carico statico, `F_roll` e integrazione — così il consumo del carburante (che
  cala la massa nel tempo) si riflette ovunque senza duplicare il calcolo.
- **Superfici.** Estendere `SurfaceActor`/`SurfacesService` rimuovendo `powerFactor` dal flusso (la
  superficie fornisce solo `gripFactor`) e aggiungendo `collisionend`. Decidere il destino di
  `dragFactor` (oggi alimenta sia drag sia attrito): o confluisce nell'attrito di rotolamento
  globale `Crr`, o resta come moltiplicatore per-superficie di quest'ultimo.
- **Stato per ruota.** Ripulire `WheelFactor` da `power`/`drag` (vestigiali) e aggiungere
  `gripSurface`, `wear`, `load` (`Fz`), `slipAngle` e flag di pattinamento per effetti
  grafici/sonori (gli emitter `idle`/`throttle` già presenti, gestiti da `setEmitters`).
- **Pattinamento.** Parte in versione **"clamp"** (taglio della `Fx` al limite + flag); lo
  **slip ratio** vero (con velocità angolare di ruota come stato) è un'estensione successiva.

### Mappatura vecchio → nuovo

| Oggi (`VehicleActor`/`DriveInputSystem`/`math.service`) | Nuovo |
| --- | --- |
| `weight` (kg) | `mass` (kg) — riuso |
| `acceleration` (`y`=long.) | `vel` vettore + `yawRate`, accel. in sistema corpo (`x`=avanti) |
| `computeSpeed` / `previousSpeed` / `maxSpeed` cap | motore potenza-limitata + plateau emergente (3.8) |
| `applyKinematics` (bicicletta + `lerp`) | pipeline a forze + imbardata (3.7) |
| `computeGripFactors`/`computeLongitudinalLoad`, `loadTransferStrength`, `frontGripCap`, `accelerationFullScale`, `baseLerpFactor`, `understeerAngleStrength` | trasferimento di carico reale `ΔFz` (3.4) + cerchio di aderenza (3.5) |
| `getAverageWheelFactors` | forze per-ruota indipendenti (niente media) |
| `accelerationForce` / `frictionForce` | `F_max` / `F_aero` + `F_roll` |
| `brakingForce` | frenata distribuita a 4 ruote, bias anteriore |
| `frontAxlePosition`/`rearAxlePosition`/`frontAxleWidth`/`rearAxleWidth` (px) | `cogPosition` + bracci `r_i` (m), passo `L`, carreggiate |
| `steeringAngle`/`maxSteeringAngle` | `δ` per le anteriori — riuso |
| `smoothPedal`, `updateSteeringAngle`, `sumClamp`, `rotateToHeading`, `onPostUpdate` | riuso diretto |
| `SurfaceActor.powerFactor`/`dragFactor` | solo `gripFactor` (drag → `Crr` globale) |
| `WheelFactor.power`/`drag` | rimossi; aggiunti `gripSurface`/`wear`/`load`/`slipAngle`/flag |
