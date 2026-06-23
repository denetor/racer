# Grill-me — Piano di implementazione fisica a 4 ruote (issue #31)

> Sessione di interview per definire, codice alla mano, l'ordine di costruzione e le decisioni
> di design prima di scrivere `plan-steps.md`. Obiettivo dichiarato dall'utente: **ogni step
> dev'essere autoconsistente e verificabile sia con test automatici sia avviando il gioco a mano**,
> rispettando le convenzioni di ExcaliburJS.

## Analisi preliminare di Sezione 5 ("Ordine di costruzione")

Lettura critica rispetto all'obiettivo "ogni step guidabile e verificabile a mano":

- **Manca uno strato 0 di impalcatura.** Sezione 5 parte già dal "modello a 4 ruote lineare".
  Ma prima servono: nuove classi (`PhysicVehicleActor`, i due system, `DriverInputComponent`),
  conversione SI / `pxPerMeter`, file costanti, coesistenza con il vecchio attore e switch in
  `PlaygroundScene`. Senza questo, lo step 1 non è lanciabile.
- **Lo step 1 non è guidabile come scritto.** Il motore (propulsione longitudinale) arriva solo
  allo step 4 (`F_drive = min(F_max, P/v)`). Ma lo step 1 chiede di "verificare che guidi e curvi":
  per guidare serve *una* forza longitudinale. Senza un minimo di propulsione, allo step 1 l'auto
  non si muove e non è verificabile a mano.
- **Dipendenze di rendering/UI.** L'`AccelerationAppletActor` e la `DrivingDashboardActor` leggono
  `vehicle.acceleration` (con `y`=longitudinale) e `accelerationFullScale`. Il nuovo modello adotta
  la convenzione corpo (`x`=avanti). Va deciso il destino di questa UI a ogni step.
- **Test di integrazione (Playwright)** confrontano screenshot contro una build di produzione: ogni
  cambio di traiettoria rompe le baseline. Va deciso quando/come ribaselinare.

Il resto della sequenza (cerchio → trasferimento carico → motore → pattinamento → usura/carburante)
è solido come ordine fisico. Le decisioni qui sotto raffinano granularità, impalcatura e verificabilità.

---

## Question 1: Come ristrutturare Sezione 5 perché ogni step sia lanciabile e guidabile a mano?

Sezione 5 manca di uno strato di impalcatura iniziale e non è guidabile a mano fino allo step 4
(il motore arriva tardi). Tre opzioni: aggiungere Step 0 + propulsione minima riusabile; anticipare
il motore allo Step 1; lasciare Sezione 5 invariata.

### Decision:

**Step 0 (impalcatura) + propulsione "tracer" minima.** Struttura a 7 step:

- **Step 0** — Impalcatura: `PhysicVehicleActor`, `PhysicDriveInputSystem`, `PhysicDriveUpdateSystem`,
  `DriverInputComponent`, conversione SI/`pxPerMeter`, file costanti, switch in `PlaygroundScene`.
  Propulsione "tracer" banale (throttle → `Fx` costante, attrito lineare) solo per muovere l'auto e
  validare la pipeline integrazione/rendering end-to-end.
- **Step 1** — Modello pneumatico **lineare** (`Fy = −Cα·α` per ruota) + blend cinematico a bassa
  velocità. Riusa la propulsione tracer dello Step 0.
- **Step 2** — Cerchio di aderenza + carico statico (le forze vengono clampate a `μ·Fz`).
- **Step 3** — Trasferimento di carico (longitudinale + laterale).
- **Step 4** — Motore power-limited + aerodinamica + distribuzione trazione (FWD/RWD/AWD).
  Sostituisce la propulsione tracer dello Step 0.
- **Step 5** — Pattinamento e bloccaggio (saturazione longitudinale del cerchio, versione "clamp").
- **Step 6** — Usura gomme + carburante + statistiche metriche.

Razionale: ogni step resta autoconsistente e **guidabile a mano** (c'è sempre propulsione), e la
sequenza fisica di Sezione 5 è preservata interamente.

---

## Question 2: Come si relaziona `PhysicVehicleActor` al `VehicleActor` esistente?

Il setup visivo (sprite, 4 ruote-figlie, assi, emitter, collider composito, `rotateToHeading`,
`onPostUpdate`) è ~170 righe da riusare; lo stato fisico va sostituito. Estrarre una base condivisa,
estendere `VehicleActor`, o duplicare in una classe fresca.

### Decision:

**Estrarre una base condivisa `BaseVehicleActor`** col solo setup visivo/figli/emitter/collider e
gli hook di rendering (`rotateToHeading`, `getWheelAxisRotation`, `onPostUpdate`, `setEmitters`,
`wheelFactors`). `VehicleActor` e `PhysicVehicleActor` la estendono entrambi.

Conseguenza operativa: il primo lavoro dello **Step 0** è un **refactor a comportamento invariato**
(estrazione della base dal `VehicleActor` attuale), verificabile contro la **baseline Playwright
esistente** prima ancora che esista fisica nuova. Niente campi fisici morti ereditati, niente
duplicazione da mantenere allineata.

---

## Question 3: Dove vivono le funzioni pure della fisica nuova?

`math.service` o nuovo `vehicle-physics.service`; oppure più service tematici.

### Decision:

**Nuovo `vehicle-physics.service.ts`** con `vehicle-physics.service.test.ts` colocato. Contiene
tutta la fisica nuova (slip angle, forza pneumatica + cerchio, `Fz` statico + trasferimento,
motore/aero/roll, integrazione corpo rigido, helper derivati come `getTotalMass`). `math.service`
resta intatto finché vive il vecchio attore; gli helper morti (`computeGripFactors`,
`computeLongitudinalLoad`, `computeLongitudinalAcceleration`) si potano nello step finale, alla
rimozione del vecchio attore. Separazione netta vecchio/nuovo, un solo file da testare.

---

## Question 4: Strategia di test automatico per step.

Solo unit sulle funzioni pure; unit + harness di simulazione; oppure unit + invarianti fisiche.

### Decision:

**Solo unit test sulle funzioni pure** in `vehicle-physics.service.test.ts` (slip angle, forza
pneumatica con clamp a `μ·Fz`, ripartizione `Fz`, trasferimento di carico, `F_drive`, un passo di
integrazione, `getTotalMass`). I **comportamenti emergenti** (va dritto, curva con raggio finito,
imbarda con grip asimmetrico, pattina, sottosterza/sovrasterza) si validano **a mano lanciando il
gioco**. Conseguenza: ogni step del piano deve includere una **checklist di verifica manuale**
esplicita e osservabile.

---

## Question 5: Attivazione del nuovo attore e gestione delle baseline Playwright.

Flag in `PlaygroundScene` con switch finale; scena dev dedicata; oppure switch subito + ribaselina
ogni step.

### Decision:

**Scena dev dedicata `PhysicsPlaygroundScene`**, scelta in `main.ts` via env/flag. `PlaygroundScene`
e il vecchio attore restano **intatti** e costituiscono la baseline Playwright stabile per tutto lo
sviluppo. La scena dev riusa mappa/camera/superfici e ospita il nuovo attore + i due nuovi system +
strumentazione di debug. Lo switch del flusso principale e l'eventuale ribaselina avvengono **una
sola volta**, alla fine, quando il modello è stabile (o si lascia la scena dev come ambiente di
sviluppo permanente).

---

## Question 6: Strumentazione di verifica manuale nella scena dev.

Chiarimento dell'utente: **la verifica manuale la fa l'utente lanciando l'applicazione** — niente
harness di simulazione automatica. Resta da decidere quanto aiuto a schermo serve, dato che alcuni
effetti (slip, `Fz`, regime) non si vedono guardando solo lo sprite.

### Decision:

**HUD di debug minimo nella scena dev, che cresce per-step.** Un piccolo overlay testuale che a
ogni step mostra le grandezze appena introdotte (km/h e `yawRate` da Step 1; slip per ruota; `Fz`
per ruota + flag pattinamento da Step 2; regime/`F_drive` da Step 4; usura/carburante da Step 6).
Serve a rendere **osservabile a colpo d'occhio** l'effetto dello step durante la guida.
L'`AccelerationAppletActor` esistente si riusa via adapter (mappando l'accelerazione body
`x`=avanti → convenzione `y`=long. dell'applet) oppure viene sostituito dall'HUD. Ogni step del
piano elenca **cosa l'HUD deve mostrare** e **cosa l'utente deve osservare** guidando.

---

## Question 7: Stato finale del vecchio codice quando il nuovo modello è stabile.

Switch + rimozione del vecchio; switch tenendo il vecchio; oppure decidere dopo.

### Decision:

**Switch della scena principale, ma tenere il vecchio.** Allo step finale `PlaygroundScene` (o
`main.ts`) punta al nuovo attore/system, ma `VehicleActor`, `DriveInputSystem` e gli helper di
`math.service` **restano in repo** come riferimento/fallback (orfani, non referenziati). Niente
potatura aggressiva ora; eventuale rimozione rimandata a una decisione futura.

---

## Question 8: Destino di `dragFactor` (la superficie fornisce "solo grip" vs. rallentamento off-track).

Crr globale uguale ovunque (aderente allo spec) vs. moltiplicatore di attrito di rotolamento
per-superficie (preserva il rallentamento su erba/ghiaia).

### Decision (chiarita dall'utente):

**Coefficiente di attrito di rotolamento per-superficie, non globale.** `dragFactor` non sparisce:
diventa un moltiplicatore per-superficie dell'attrito di rotolamento (es. `rollFactor` su
`SurfaceActor`, tracciato per-ruota come il grip). `F_roll_i = Crr_base · rollFactor_i · f(Fz_i)`.
Così erba/ghiaia **rallentano davvero in rettilineo** oltre a ridurre la tenuta, conservando il feel
attuale. La superficie quindi fornisce **due** fattori per ruota: `gripFactor` e `rollFactor`;
`powerFactor` esce dal flusso come previsto.

---

## Decisioni implicite (risolte dalla fisica/spec, non sottoposte a scelta)

- **Sequenza superfici per-ruota.** `collisionend` + grip per-ruota + refactor `WheelFactor`
  (rimozione `power`; `drag`→`rollFactor`; aggiunta `gripSurface`, `load`/`Fz`, `slipAngle`, flag
  pattinamento) entrano allo **Step 2**: nel modello lineare dello Step 1 la forza `Fy = −Cα·α` non
  dipende dal grip, quindi grip/`rollFactor` per-ruota servono solo da quando esiste il cerchio
  (`μ·Fz`). `wear` si aggiunge allo Step 6.
- **Retromarcia.** Si mantiene la semantica a toggle attuale (`isReverse`), esposta come richiesta
  di toggle nel `DriverInputComponent`; l'update system la traduce in forza motrice negativa.
- **Differenziali.** Restano rimandati (split 50/50 dentro l'asse), come da spec.
- **Anchor al centro** e **convenzione corpo `x`=avanti, `y`=laterale**: adottate come da spec.
- **Definizione di "done" per step.** Ogni step è autoconsistente e mergeabile: build verde, unit
  test delle funzioni pure introdotte, e checklist di verifica manuale (l'utente guida nella scena
  dev e osserva l'HUD).

---

## Riepilogo dei 7 step (input per `plan-steps.md`)

- **Step 0** — Impalcatura + propulsione tracer. Estrazione `BaseVehicleActor`; `PhysicVehicleActor`,
  `PhysicDriveInputSystem`, `PhysicDriveUpdateSystem`, `DriverInputComponent`; `vehicle-physics.service`;
  `physics.constants.ts`; SI/`pxPerMeter`; `PhysicsPlaygroundScene` + HUD minimo; drive tracer.
- **Step 1** — Pneumatico lineare (`Fy = −Cα·α` per ruota) + velocità per ruota da `yawRate` + blend
  cinematico a bassa velocità. HUD: km/h, `yawRate`, slip per ruota.
- **Step 2** — Cerchio di aderenza + `Fz` statico + grip/`rollFactor` per-ruota da superficie
  (`collisionstart`/`collisionend`) + refactor `WheelFactor`. Emergono scivolate, sotto/sovrasterzo,
  coppia di imbardata su superfici asimmetriche.
- **Step 3** — Trasferimento di carico longitudinale e laterale (`ΔFz`), clamp `≥ 0`.
- **Step 4** — Motore power-limited (`F_drive = min(F_max, P/v)`) + aero + `F_roll` per-superficie +
  distribuzione trazione FWD/RWD/AWD. Sostituisce la propulsione tracer; emerge il plateau.
- **Step 5** — Pattinamento e bloccaggio come saturazione longitudinale del cerchio (versione "clamp"
  + flag).
- **Step 6** — Usura gomme + carburante (`getTotalMass`) + statistiche metriche; switch della scena
  principale al nuovo modello (vecchio tenuto come orfano).

---
