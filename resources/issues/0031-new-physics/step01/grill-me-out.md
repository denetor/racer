# Grill-me — Step 1 (Modello pneumatico lineare + blend a bassa velocità)

> Interview di dettaglio sull'implementazione dello **Step 1** di `plan-steps.md`, alla luce di
> `specs.md` e della struttura software esistente (post Step 0 / Fasi 1–4). Obiettivo dello Step 1:
> sostituire la propulsione "tracer" *laterale* con un vero **modello a 4 ruote lineare** (forza
> laterale proporzionale allo slip angle, **senza** cerchio di aderenza), in modo che l'auto **curvi
> in modo fisicamente plausibile e stabile**, con `yawRate` come stato indipendente dalla velocità.
> La propulsione **longitudinale resta quella tracer** dello Step 0.

## Ricognizione codice (stato post Step 0)

- `vehicle-physics.service.ts` espone già: `localToBody`, `pxPerMeter`, `bodyToWorld`,
  `worldToBody`, `getTotalMass`, `integrateLongitudinalStep` (tutte con unit test, 74 verdi).
- `PhysicVehicleActor` ha già lo stato a corpo rigido: `heading` (Vector), `steeringAngle`,
  `velBody` (m/s, frame-corpo x=avanti/y=laterale), `yawRate`, più il datasheet completo
  (`mass`, `lengthMeters`, `cogPosition`, `cogHeight`, `corneringStiffness`, `drivetrain`/`driveBias`,
  fuel) e i **getter geometrici derivati**: `wheelbaseMeters`, `trackMeters`, `Iz`, `totalMass`,
  `wheelArmsBody` (i 4 bracci `r_i` in metri, frame-corpo, già passati per `localToBody`).
- `PhysicDriveUpdateSystem` oggi integra **solo longitudinale** (`integrateLongitudinalStep`), con
  `velBody = vec(vxNew, 0)` e `actor.vel = bodyToWorld(velBody, theta)·pxPerMeter`. Lo sterzo è già
  smussato (`steeringAngle`), ma non curva l'auto.
- `BaseVehicleActor.rotateToHeading()` e `CameraFollowPlayerSystem` leggono **`heading`** (deve
  restare un vettore unitario valido).
- `physics.constants.ts` ha già `LOW_SPEED_BLEND_THRESHOLD = 1.5` (m/s), `RHO_AIR`, `G`.
- Strategia di test consolidata (anche da memoria utente): unit test **solo** sulle funzioni pure del
  service; attori/system/scena/HUD validati **manualmente** guidando nella scena dev.

---

## Question 1: Come si conserva l'orientamento dell'auto (dove punta il muso), ora che curva?

L'auto ruota: serve aggiornare di continuo "da che parte guarda". Due rappresentazioni equivalenti:
la **freccia** `heading` (vettore) oppure l'**angolo** `theta` (un numero, rad). Sono la stessa
informazione in due forme.

### Decision:

**La freccia `heading` è il dato canonico.** Ogni frame la ruoto un pochino:
`heading = heading.rotate(yawRate · dt).normalize()` (il `normalize` evita la deriva numerica, come
faceva già il vecchio `VehicleActor`). L'angolo `theta = atan2(heading.y, heading.x)` lo ricavo solo
dove serve per le conversioni corpo↔mondo. **Nessun nuovo campo di stato**, e
`CameraFollowPlayerSystem`/`rotateToHeading` continuano a funzionare senza modifiche. `yawRate` (ω)
resta lo stato indipendente, come da specifica.

---

## Question 2: Sincronizzare la velocità interna con i muri ora, o rimandare?

Noi possediamo la **velocità** (SI); Excalibur possiede **posizione e collisioni**. Quando l'auto
sbatte un muro, Excalibur la ferma sullo schermo, ma il nostro `velBody` interno "non sa" del muro.
In Step 0 (rettilineo) era accettabile; in Step 1 (curva) può sentirsi impreciso strusciando i muri.

### Decision:

**Rimandare a uno step successivo.** Lo Step 1 resta concentrato sul far curvare l'auto in modo
stabile. `velBody` resta il nostro source of truth, integrato nel frame-corpo; **non** rileggiamo
`actor.vel` per riconciliare le collisioni (coerente con la Decision 4 dello Step 0). Limite noto e
accettato: strusciando un muro la velocità interna e quella vista da Excalibur possono divergere.

---

## Question 3: Comportamento dello sterzo a bassissima velocità (sotto ~5 km/h)?

Lo **slip angle** (angolo tra dove puntano le gomme e dove l'auto scivola davvero) genera la forza
di curva, ma a velocità quasi nulla il suo calcolo (`atan2` di velocità ≈ 0) diventa rumore numerico:
l'auto vibra o "parte per la tangente".

### Decision:

**Sterza comunque, in modo morbido (blend cinematico).** Sotto `LOW_SPEED_BLEND_THRESHOLD`
(≈1,5 m/s) fondo gradualmente verso un modello **cinematico** semplice: l'imbardata segue la
formula a bicicletta `θ̇ = v_x · tan(δ) / L` e le **forze laterali delle gomme vengono scalate verso
0** al calare della velocità. Così l'auto riparte da ferma e manovra in modo naturale, senza
vibrazioni. Funzione pura dedicata `lowSpeedKinematicBlend(...)`; fattore di blend
`k = clamp(speed / threshold, 0, 1)` (k=0 fermo → tutto cinematico; k=1 sopra soglia → tutto
dinamico). La formula esatta del blend è tarabile a mano.

---

## Question 4: Come tratto la spinta delle ruote anteriori quando sono girate?

Le ruote anteriori, quando sterzi, sono **inclinate** di `δ`: la forza che producono esce "di sbieco",
non dritta di lato. Si può calcolare l'inclinazione esattamente o approssimare (spinta sempre
laterale). Lo sterzo massimo è ~0,4 rad (~23°), non trascurabile.

### Decision:

**Calcolarla per bene.** La forza pneumatica anteriore viene **ruotata di `δ`** per riportarla nel
frame-corpo prima di sommarla (come da pipeline 3.7: «ruotando prima le forze anteriori di δ»). Le
ruote posteriori hanno `δ = 0`. Curva più fedele e coerente anche a sterzo ampio.

---

## Question 5: Da dove applico la spinta in avanti (gas/freno) in questo step?

La propulsione longitudinale resta la **tracer** dello Step 0. Domanda: applicarla al centro o
distribuirla sulle ruote?

### Decision:

**Dal centro dell'auto.** La spinta longitudinale agisce al baricentro: muove avanti/indietro e
**non** produce coppia di imbardata. Così la rotazione dell'auto nasce **solo** dalle forze laterali
delle gomme — esattamente ciò che lo Step 1 deve validare. La distribuzione per-ruota (trazione
FWD/RWD/AWD) arriva allo Step 4. La spinta entra comunque come forza `Fx` nel frame-corpo, con
l'attrito lineare (`linearDragCoeff`) dello Step 0 mantenuto sul longitudinale.

---

## Question 6: Come gestisco la stabilità ad alta velocità?

Il modello lineare (forza laterale che cresce illimitata con lo slip, **senza** tetto fino allo
Step 2) può oscillare/scodare da solo se i numeri di taratura non sono buoni.

### Decision:

**Fisica pura + taratura a mano.** Nessuno smorzamento artificiale di imbardata: mi affido alla
fisica, al **passo fisso a 60 Hz** e al **blend a bassa velocità** (Q3). Se durante la verifica
manuale l'auto oscilla, ritocco i parametri (morso gomme, `Iz`). Uno smorzamento dolce resta come
**rete di sicurezza** da introdurre solo se davvero necessario, ed esplicitamente fuori-specifica.

---

## Question 7: Il morso laterale delle gomme (cornering stiffness `Cα`): uguale o diverso davanti/dietro?

`Cα` = quanta forza laterale per unità di slip angle. Se anteriore e posteriore differiscono, cambia
il carattere: anteriore più debole → **sottosterzo** (allarga); posteriore più debole →
**sovrasterzo** (scoda).

### Decision:

**Diverso tra anteriore e posteriore fin da subito.** Il campo unico `corneringStiffness` diventa
due parametri sul datasheet: `corneringStiffnessFront` e `corneringStiffnessRear` (N/rad,
**per-ruota**: il totale emerge sommando le 4 gomme). Valori placeholder scelti per un **leggero
sottosterzo** (posteriore che morde un po' più dell'anteriore) → comportamento **stabile e sicuro**
di partenza. Si ritoccano insieme durante la prova per dare il carattere desiderato.

---

## Question 8: Quanto dettaglio mostro nel cruscotto (HUD) per lo slip angle?

Lo Step 1 aggiunge all'HUD `yawRate` (velocità di rotazione) e lo slip angle. Con 4 gomme, quanti
valori mostrare?

### Decision:

**Riassunto anteriore + posteriore (in gradi).** L'HUD aggiunge: `yawRate` (in °/s, più leggibile) e
**due** slip angle medi — uno per l'asse anteriore, uno per il posteriore — in gradi. Compatto e
sufficiente a leggere sotto/sovrasterzo a colpo d'occhio. Il dettaglio per-ruota (sinistra/destra)
conterà davvero dallo Step 2 (superfici asimmetriche) e si potrà aggiungere allora.

---

## Decisioni implementative prese per convenzione (non richiedono giudizio dell'utente)

Coerenti con gli step precedenti, la strategia di test consolidata e la struttura ExcaliburJS.
Elencate qui per trasparenza — l'utente può comunque obiettare.

- **Niente funzione `bodyVelocity` nuova.** Il plan-steps la elencava, ma `velBody` è **già** lo
  stato nel frame-corpo (x=avanti, y=laterale): `v_x`/`v_y` si leggono direttamente, senza convertire
  dal mondo ogni frame. Le conversioni corpo↔mondo restano `bodyToWorld` (per scrivere `actor.vel`) e
  `worldToBody` (già presente, disponibile se servisse). Niente duplicati.

- **Nuove funzioni pure nel `vehicle-physics.service`** (ciascuna con unit test in
  `vehicle-physics.service.test.ts`, sul comportamento esterno):
  - `wheelVelocity(v_x, v_y, omega, r_i)` → `{x: v_x − ω·r_i_y, y: v_y + ω·r_i_x}` (formula 3.6).
  - `slipAngle(v_i_x, v_i_y, delta_i)` → `atan2(v_i_y, v_i_x) − δ_i`.
  - `lateralForceLinear(alpha, Calpha)` → `−Cα · α` (lineare, **senza** saturazione).
  - `integrateBody(state, Fx, Fy, Mz, mass, Iz, dt)` → nuovo `{v_x, v_y, omega}` con i termini
    incrociati (3.7): `v̇_x = Fx/m + v_y·ω`, `v̇_y = Fy/m − v_x·ω`, `ω += (Mz/Iz)·dt`. L'integrazione
    di `θ` (orientamento) avviene fuori, ruotando `heading` (vedi Q1). `dt ≤ 0` → stato invariato.
  - `lowSpeedKinematicBlend(...)` (Q3): fattore di blend e imbardata cinematica a bicicletta.

- **Attrito lineare come forza.** Il termine `linearDragCoeff` dello Step 0 viene espresso come forza
  longitudinale (`F = −mass · dragCoeff · v_x`) e sommato a `Fx` netto, così `integrateBody` resta
  puramente "a forze".

- **`integrateLongitudinalStep` resta nel service** (con i suoi test) ma **non** è più usata nel
  flusso Step 1: l'evoluzione longitudinale ora passa da `integrateBody` (che include il termine
  incrociato `v_y·ω`). Nessuna rimozione (build/test verdi, potatura rimandata).

- **Orchestrazione nel `PhysicDriveUpdateSystem`** (glue Excalibur, non unit-testato): ogni frame —
  (1) smoothing pedali/sterzo (invariato); (2) leggi `v_x`/`v_y` da `velBody`, `ω` da `yawRate`;
  (3) per le 4 ruote (`wheelArmsBody`, `δ = steeringAngle` sulle anteriori, 0 sulle posteriori):
  `wheelVelocity` → `slipAngle` → `lateralForceLinear`, ruotando la forza anteriore di `δ`;
  (4) somma forze nette `Fx`/`Fy` (+ spinta tracer al centro + attrito) e coppia
  `Mz = Σ(r_i_x·F_i_y − r_i_y·F_i_x)`; (5) applica il **blend a bassa velocità**; (6) `integrateBody`
  → aggiorna `velBody`/`yawRate`; (7) ruota `heading` di `ω·dt` e normalizza; (8) scrivi
  `actor.vel = bodyToWorld(velBody, theta)·pxPerMeter`. **`actor.pos` non viene scritto** (posizione
  e collisioni a Excalibur).

- **Datasheet:** `corneringStiffness` → `corneringStiffnessFront`/`corneringStiffnessRear` (Q7).
  Eventuali nuove costanti generiche (es. parametri del blend, se non già coperti da
  `LOW_SPEED_BLEND_THRESHOLD`) in `physics.constants.ts`; nessun magic number nei system.

- **HUD:** `PhysicsDebugHud` cresce con `yawRate` (°/s) e slip anteriore/posteriore medio (gradi),
  leggendo direttamente i campi dell'attore.

- **Reverse:** invariato dallo Step 0 (inverte la spinta longitudinale); il segno della velocità
  longitudinale gestisce automaticamente lo slip e il blend cinematico in retromarcia.

---

## Parametri da tarare a mano (durante la verifica)

Valori placeholder ragionati, da rifinire guidando: `corneringStiffnessFront`/`Rear` (con leggero
sottosterzo iniziale), `Iz` (già derivato da massa/geometria), la **soglia** e la **curva** del blend
a bassa velocità. Obiettivo: auto dritta a sterzo 0, curva a raggio finito coerente, nessuna
vibrazione da ferma, nessun comportamento esplosivo.

---

## Checklist di verifica manuale dello Step 1 (utente, con `START_SCENE='physics'`)

- A sterzo 0 l'auto va **dritta** senza derivare.
- Sterzando, l'auto **curva** con raggio finito e coerente; lo sprite punta lungo l'heading; le ruote
  anteriori ruotano con lo sterzo.
- Da ferma o lentissima **non vibra** né parte per la tangente (blend attivo); riparte e manovra
  morbida.
- A velocità di crociera la curva è **morbida e stabile**; nessuna oscillazione/testacoda spontaneo.
- L'HUD mostra `yawRate` e slip anteriore/posteriore coerenti col moto.
- Con `START_SCENE='playground'` la scena vecchia resta **identica** (baseline Playwright intatta).