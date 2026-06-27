
# PRD — Step 4: Motore power-limited + aerodinamica + trazione (issue #31)

> Deriva da `step04/grill-me-out.md` (10 decisioni di design) e da `specs.md` (§3.5, §3.8, §3.9,
> §3.10). Quarto strato del modello a corpo rigido planare a 4 ruote. Presuppone lo stato **post
> Step 3** (cerchio di aderenza + carico statico + trasferimento di carico dinamico già attivi).

---

## Problem Statement

Dal punto di vista del giocatore, l'auto della scena di fisica (`PhysicsPlaygroundScene`) si muove
ancora con una **propulsione finta** ("tracer"): una forza longitudinale costante applicata al
baricentro, un freno costante e un attrito lineare. Conseguenze percepibili:

- l'accelerazione non cala con la velocità (niente "ripresa" realistica) e la velocità massima è
  governata da una resistenza lineare arbitraria invece che da un vero **plateau** aerodinamico;
- il tipo di trazione (anteriore / posteriore / integrale) **non esiste**: tutte le auto si
  comportano uguale, senza sovrasterzo di potenza (RWD) né sottosterzo/pattinamento in uscita (FWD);
- la frenata è un'unica forza al baricentro: niente bias anteriore, niente bloccaggio per-ruota,
  nessun effetto del freno in curva;
- le superfici a bassa aderenza non rallentano l'auto in rettilineo (l'erba non "frena" e mezza auto
  fuori pista non "tira").

In sintesi: il motore, le resistenze e la trazione sono ancora dei segnaposto, e i comportamenti che
dovrebbero **emergere dalla fisica** sono assenti.

## Solution

Sostituire la propulsione tracer con il **modello motore reale potenza-limitata** descritto in
`specs.md` §3.8–§3.9, mantenendo l'architettura esistente (funzioni pure nel service, stato/parametri
sull'attore, orchestrazione nei due system, split SI ↔ pixel).

Dal punto di vista del giocatore, dopo questo step:

- l'auto **spinge forte da ferma** e l'accelerazione **cala con la velocità**; la velocità massima si
  **assesta da sola** (plateau) all'equilibrio `P/v = F_aero + ΣF_roll`, senza tetto rigido;
- la **trazione** conta: RWD tende al sovrasterzo di potenza, FWD al sottosterzo/pattinamento, AWD è
  più neutro e regolabile via `driveBias`;
- la **frenata** è decisa, con bias anteriore (le anteriori si caricano e saturano prima), distribuita
  sulle quattro ruote; non manda mai l'auto in retromarcia da sola;
- le **superfici lente** (erba) rallentano in rettilineo e, sotto mezza auto, fanno "tirare" il
  veicolo.

La leva tecnica è una sola e nuova per questo step: la **forza longitudinale entra per-ruota dentro il
cerchio di aderenza** (finora `clampToFrictionCircle` era sempre chiamata con `fx = 0`). È questo a far
emergere potenza-sterzo, bloccaggio e — allo Step 5 — pattinamento espliciti. L'aerodinamica invece
resta una forza netta al baricentro (l'aria agisce sul corpo, non sul contatto gomma).

## User Stories

1. Come pilota, voglio che l'auto acceleri **forte da ferma** e sempre meno man mano che va veloce,
   così che la ripresa sembri quella di un'auto vera.
2. Come pilota, voglio che la **velocità massima si assesti da sola** a un plateau, così che non ci sia
   un tetto artificiale ma un limite fisico credibile.
3. Come pilota, voglio che cambiando potenza/coefficiente aerodinamico la velocità massima si sposti,
   così che auto diverse abbiano allunghi diversi.
4. Come pilota di un'auto a **trazione posteriore**, voglio sentire il **sovrasterzo di potenza** in
   uscita di curva, così che la guida abbia carattere.
5. Come pilota di un'auto a **trazione anteriore**, voglio sentire **sottosterzo e pattinamento**
   dell'avantreno in accelerazione, così che il comportamento sia distinto dalla RWD.
6. Come pilota di un'auto a **trazione integrale**, voglio più trazione e un bilanciamento più neutro,
   regolabile spostando la coppia avanti/dietro (`driveBias`).
7. Come pilota, voglio una **frenata decisa con bias anteriore**, così che l'auto rallenti
   realisticamente e l'anteriore lavori di più.
8. Come pilota, voglio che **frenando in curva** l'interno si alleggerisca e possa **saturare prima**,
   così che il freno in curva sia rischioso come nella realtà.
9. Come pilota, voglio che il **freno non mi mandi in retromarcia** da fermo, così che frenare porti
   solo all'arresto.
10. Come pilota, voglio poter **frenare e accelerare insieme** con effetti che in parte si annullano,
    senza scatti o discontinuità.
11. Come pilota, voglio che **sull'erba** l'auto **rallenti in rettilineo**, così che uscire di pista
    abbia un costo.
12. Come pilota, voglio che con **mezza auto sull'erba** il veicolo **tiri** verso un lato, così che la
    superficie asimmetrica si senta nello sterzo.
13. Come pilota, voglio poter **partire da fermo e arrestarmi dolcemente** senza vibrazioni né "scatti
    alla tangente" a bassa velocità.
14. Come pilota, voglio poter andare in **retromarcia** con lo stesso motore (naturalmente più lenta),
    senza un tetto di velocità dedicato.
15. Come sviluppatore che tara il veicolo, voglio un **HUD** che mostri il tipo di trazione, la forza
    motrice corrente (kN) e quando il motore è **power-limited**, così da capire il regime al volo.
16. Come sviluppatore, voglio vedere la **forza longitudinale per ruota** nell'HUD, così da
    diagnosticare distribuzione di trazione, frenata e saturazione.
17. Come sviluppatore, voglio tutta la **fisica nuova in funzioni pure testabili** (motore,
    aerodinamica, rotolamento, distribuzione trazione), così da verificarne la correttezza a tavolino.
18. Come sviluppatore, voglio definire un'auto **cambiando solo i parametri** (potenza, forza max,
    freno, bias, Cd, area), senza magic number nel system.
19. Come sviluppatore, voglio che la **scena vecchia resti identica** (baseline Playwright intatta) e
    che il nuovo modello viva solo nella scena di fisica selezionabile via flag.
20. Come sviluppatore, voglio che `build` e `test:unit` restino verdi, così che lo step sia mergeabile.

## Implementation Decisions

### Funzioni pure nuove (in `vehicle-physics.service.ts`, con test colocati)

Modulo profondo già esistente; si estende con quattro funzioni SI, framework-independent, che riusano
i tipi `WheelLoads`/`Vec2`:

- **`driveForce(power, fMax, v)`** → `min(fMax, power / max(v, V_FLOOR))`. `v` è `|v_x|` (velocità
  longitudinale di corpo, ≥ 0). Rende `fMax` da fermo (forte) e decade come `P/v` ad alta velocità.
  Il `V_FLOOR` evita la divisione per zero. (Decisione 2)
- **`aeroDrag(rho, cd, a, v)`** → `½·ρ·Cd·A·v²` (modulo). Il segno (opposto a `v_x`) lo applica il
  system. (Decisione 4)
- **`rollingResistance(crr, rollFactor, fz)`** → `Crr·rollFactor·Fz` (modulo, per ruota). Il segno
  (opposto a `v_i_x`) lo applica il system. (Decisione 4/5)
- **`distributeDrive(fDrive, drivetrain, driveBias)`** → `WheelLoads` (4 quote `Fx` per ruota). `fwd`
  → tutto all'asse anteriore; `rwd` → tutto al posteriore; `awd` → `driveBias·fDrive` anteriore +
  `(1−driveBias)·fDrive` posteriore; **50/50 dentro ciascun asse** (surrogato di differenziale aperto).
  `fwd`/`rwd` ignorano `driveBias`. (Decisione 8)

`clampToFrictionCircle` **non cambia**: è già in forma combinata `fx`/`fy` direzione-preservante; lo
Step 4 la chiama con `fx ≠ 0`. **Nessun nuovo flag** longitudinale: si riusa `saturated` (Step 5
introdurrà la distinzione wheelspin/lockup ed effetti).

### Costanti generiche (in `physics.constants.ts`)

- **`CRR`** — coefficiente di attrito di rotolamento (gomma/superficie, non per-veicolo).
- **`V_FLOOR`** — velocità minima (≈ 1 m/s) per il termine `P/v` del motore.

`RHO_AIR` e `G` già presenti. Nessun magic number nel system.

### Parametri per-veicolo (su `PhysicVehicleActor`)

- **Rimuovere** i tre placeholder tracer: `tracerDriveForce`, `tracerBrakeForce`, `linearDragCoeff`.
- **Aggiungere**: `enginePower` `P` (W), `maxDriveForce` `F_max` (N, eredita il ruolo di
  `tracerDriveForce`), `brakeForce` (N totale), `brakeBias` (frazione anteriore, es. 0.6),
  `dragCoefficient` `Cd`, `frontalArea` `A` (m²).
- **Attivare** `drivetrain` e `driveBias` (già dichiarati).
- **Readout HUD**: `driveForce` (N corrente) esposto come `longitudinalAccel`.
- Nessun `maxSpeed`/`maxReverseSpeed`: il plateau emerge.

### Stato per ruota (`WheelState`)

- **Aggiungere** `rollFactor` (default 1.0, scritto dal `SurfacesService`).
- **Aggiungere** `longitudinalForce` (`Fx` per ruota, scritto ogni frame dall'update, per l'HUD).

### Superfici (`SurfacesService`)

- In `collisionstart`/`collisionend` per `PhysicVehicleActor`, accanto a `gripSurface` risolvere anche
  `rollFactor` dallo stack (top `dragFactor` della superficie, default 1.0, stessa logica "last-wins").
- `powerFactor` resta fuori dal flusso. Il rename `dragFactor → rollFactor` su `SurfaceActor` è
  **rimandato** (toccherebbe il path legacy `WheelFactor.drag` e la baseline Playwright).
- Path legacy `VehicleActor` invariato.

### Orchestrazione (`PhysicDriveUpdateSystem.integrateMotion`)

Sostituisce il blocco tracer. Per ciascun frame:

1. **Forza motrice totale**: `driveForce(P, F_max, |v_x|)`, firmata da `isReverse`, distribuita con
   `distributeDrive(...)` → quota `Fx` per ruota. (Decisioni 1, 2, 8)
2. **Freno per ruota**: `brakeForce` ripartito da `brakeBias` tra gli assi, 50/50 dentro l'asse;
   opposto al segno di `v_i_x`. (Decisione 3)
3. **Attrito di rotolamento per ruota**: `rollingResistance(CRR, rollFactor_i, Fz_i)`, opposto a
   `v_i_x`. (Decisione 4)
4. **Domanda longitudinale per ruota** (somma firmata, Decisione 9):
   `Fx_long = drive_i − sign(v_i_x)·brake_i − sign(v_i_x)·roll_i`.
5. **Domanda laterale**: `Fy = k · (−Cα·α_i)` — **solo la laterale è scalata dal blend `k`**
   (Decisione 7).
6. **Cerchio di aderenza per ruota**: `clampToFrictionCircle(Fx_long, k·Fy, μ_i, Fz_i)`; le anteriori
   ruotate di `δ` prima della somma; scrive `slipAngle`/`saturated`/`longitudinalForce`/`load`.
7. **Somma** forze (`fxTyre`/`fyTyre`) e **coppia** `mz` (la coppia resta scalata da `k` come oggi).
8. **Aerodinamica al baricentro** (fuori dal loop e dal blend): `Fx += −sign(v_x)·aeroDrag(...)`.
9. **Integrazione** con `integrateBody` (invariata), **guardia standstill** (se `drive==0`, `brake>0`
   e `v_x` cambierebbe segno → `v_x = 0`), `bodyAccel = (fx/m, fy/m)`, aggiornamento heading/`θ`,
   scrittura di `actor.vel`. `actor.pos` resta **non scritto** (collisioni a Excalibur).

### HUD (`PhysicsDebugHud`)

- Riga globale: etichetta drivetrain (FWD/RWD/AWD) + `F_drive` (kN) + flag **power-limited**
  (`P/v < F_max`).
- Cella per ruota: aggiungere la **forza longitudinale `Fx`**; riusare la colorazione `saturated`.

### Selezione scena

`main.ts` committato con `START_SCENE='playground'` (flip a `'physics'` solo in locale per la verifica
manuale), per non rompere la baseline Playwright.

## Testing Decisions

**Cosa rende buono un test (strategia consolidata del progetto):** si testa **solo il comportamento
esterno delle funzioni pure** in `vehicle-physics.service.ts` (input → output, invarianti, segni),
mai i dettagli implementativi. Attore, system, HUD e superfici sono **glue** e si validano con la
**verifica manuale guidando** (memoria utente: l'utente verifica di persona; si automatizzano solo le
funzioni pure). Prior art: i test colocati esistenti `vehicle-physics.service.test.ts` (es.
`staticLoad`, `dynamicLoad`, `clampToFrictionCircle`, `lowSpeedKinematicBlend`) e `math.service.test.ts`.

**Moduli testati (nuove funzioni pure):**

- **`driveForce`** — `fMax` da fermo (`v ≤ V_FLOOR`); ramo `P/v` ad alta velocità; floor che evita la
  divisione per zero; monotonia decrescente in `v`.
- **`aeroDrag`** — proporzionale a `v²` (raddoppiando `v` la forza quadruplica); zero a `v = 0`;
  scala con `Cd·A·ρ`.
- **`rollingResistance`** — proporzionale a `Fz` e a `rollFactor`; zero a `Fz = 0`.
- **`distributeDrive`** — `fwd`/`rwd` azzerano l'asse opposto; `awd` rispetta `driveBias`; **somma
  delle 4 quote = `fDrive`**; **split 50/50 dentro l'asse**; `driveBias` ignorato per fwd/rwd.

**Non testati automaticamente:** wiring di `rollFactor` nel `SurfacesService`, composizione delle
forze nel system, guardia standstill, aero al baricentro, righe/celle dell'HUD → verifica manuale.

## Out of Scope

- **Pattinamento e bloccaggio espliciti** con flag alto/basso ed effetti grafici/sonori (fumo,
  emitter): Step 5. Qui il cerchio già limita la `Fx`, ma l'eccesso non diventa pattinamento esplicito.
- **Slip ratio reale** (velocità angolare di ruota come stato): estensione futura; il pattinamento
  parte in versione "clamp".
- **Differenziali** (aperto/autobloccante): rimandati; split 50/50 dentro l'asse.
- **Usura gomme, carburante, statistiche metriche** e **switch della scena principale**: Step 6.
- **Rename `SurfaceActor.dragFactor → rollFactor`** e refactor pieno di `WheelFactor`: rimandati per
  non toccare il path legacy e la baseline Playwright.
- **Potenza/`F_max` di retromarcia dedicati**: la retromarcia usa gli stessi `P`/`F_max`.

## Further Notes

- **Punto critico di correttezza (Decisione 7):** il blend a bassa velocità scala **solo** la
  componente laterale e la coppia di imbardata; la longitudinale (drive/freno/rotolamento) e l'aero
  restano piene. Scalare l'intera forza clampata per `k` azzererebbe la trazione sotto soglia
  (impossibile partire da fermo). Conviene scalare la **domanda laterale prima del clamp**, così il
  cerchio resta quasi tutto disponibile per la trazione a bassa velocità.
- **Coerenza con §3.8:** il rotolamento è per-ruota (`Crr·rollFactor_i·Fz_i`) per far emergere il
  rallentamento sull'erba e il "tira"; su superficie uniforme `Σ ≈ Crr·m·g`, equivalente alla forma
  netta della spec.
- **Parametri da tarare a mano (verifica):** `enginePower`/`maxDriveForce` (accelerazione e plateau),
  `dragCoefficient`/`frontalArea` (plateau), `brakeForce`/`brakeBias` (frenata e bloccaggio anteriore),
  `CRR` e i `dragFactor` delle superfici (freno dell'erba), `V_FLOOR` (dolcezza near-zero),
  `drivetrain`/`driveBias` (carattere). Interagiscono con `cogHeight`/`corneringStiffness*`/grip dello
  Step 3 (la potenza-sterzo dipende dal trasferimento di carico).
- **Definizione di "done":** (1) `npm run build` verde; (2) `npm run test:unit` verde con i nuovi test
  `driveForce`/`aeroDrag`/`rollingResistance`/`distributeDrive`; (3) checklist di verifica manuale dello
  `step04/grill-me-out.md` soddisfatta guidando con `START_SCENE='physics'`; (4) con
  `START_SCENE='playground'` la scena vecchia resta identica.