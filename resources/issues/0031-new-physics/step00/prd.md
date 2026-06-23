# PRD — Step 0: Impalcatura + propulsione "tracer" (fisica a 4 ruote, issue #31)

> Documento di requisiti per il **primo step** della riscrittura del layer fisico del veicolo.
> Le decisioni qui formalizzate derivano dall'interview in `step00/grill-me-out.md`, dalle specifiche
> in `../specs.md` e dal piano in `../plan-steps.md`. Applicazione: gioco di corse 2D top-down,
> framework **ExcaliburJS** (v0.32.0), TypeScript, Vite.

## Problem Statement

La fisica veicolare verrà riscritta da un modello cinematico (bicicletta + `lerp` del grip) a una
**simulazione a forze su 4 ruote indipendenti**. È una riscrittura rischiosa: una fisica a forze con
imbardata è quasi impossibile da debuggare se appare già completa quando si manifesta il primo bug.

Lo sviluppatore ha bisogno di un **punto di partenza solido e verificabile** prima di introdurre
qualunque forza pneumatica reale: un'architettura nuova che convive con quella esistente senza
toccarla, in cui si possa **lanciare il gioco e guidare l'auto** (sia pure in modo banale) per
validare end-to-end l'intera pipeline input → contratto-intento → fisica → integrazione → rendering →
collisioni. Senza questa impalcatura, gli step fisici successivi non sarebbero né lanciabili né
isolabili, e ogni bug sarebbe ambiguo tra "errore di architettura" ed "errore di fisica".

## Solution

Costruire lo **Step 0**: tutta l'impalcatura del nuovo modello, con una propulsione **"tracer"**
volutamente banale (solo rettilineo) che esercita la catena reale ma non introduce ancora forze
laterali o imbardata.

Concretamente:

- Le nuove classi **affiancano** le esistenti (`VehicleActor`/`DriveInputSystem` restano intatte e
  costituiscono la baseline degli screenshot Playwright).
- Una **scena dev** dedicata (`PhysicsPlaygroundScene`), selezionata da una costante in `main.ts`,
  ospita il nuovo attore, i due nuovi system, le superfici/ostacoli e un **HUD di debug**.
- L'input è separato dalla fisica tramite un **component-contratto** (`DriverInputComponent`), così
  un futuro `AiDriveInputSystem` potrà guidare lo stesso update system senza modifiche.
- La fisica pura vive in un **service testabile** (`vehicle-physics.service`); lo stato sull'attore;
  l'orchestrazione nei system.
- L'integrazione gira in **SI** con timestep fisso; la **posizione e le collisioni** sono delegate a
  Excalibur, mentre la **velocità** in m/s è il nostro source of truth.

Il risultato è guidabile a mano (accelera/frena in linea retta, si ferma contro i muri, la camera
segue) e copre con unit test le funzioni pure introdotte — pronto a ricevere il modello pneumatico
lineare nello Step 1.

## User Stories

1. Come sviluppatore, voglio che le nuove classi della fisica **affianchino** `VehicleActor` e
   `DriveInputSystem` senza modificarne il comportamento, così da non rischiare regressioni sul gioco
   esistente mentre costruisco il nuovo modello.
2. Come sviluppatore, voglio **estrarre una base visiva condivisa** (`BaseVehicleActor`) dal veicolo
   attuale con un refactor a comportamento invariato, così da riusare sprite, ruote, assi, emitter e
   collider senza duplicarli e senza ereditare campi fisici morti.
3. Come sviluppatore, voglio verificare il refactor della base **contro la baseline Playwright
   esistente** prima di introdurre qualunque fisica nuova, così da isolare gli errori di architettura
   da quelli di fisica.
4. Come sviluppatore, voglio una **scena dev separata** (`PhysicsPlaygroundScene`) che replichi mappa,
   superfici, ostacoli, race-data, checkpoint e giri, così da provare il nuovo modello in un contesto
   realistico senza intaccare la scena di produzione.
5. Come sviluppatore, voglio **selezionare la scena di avvio** con una semplice costante in `main.ts`,
   così da alternare in locale la scena dev e quella di produzione.
6. Come responsabile della qualità, voglio che il valore committato della costante di scena resti
   sempre quello di produzione, così che la build Playwright continui a screenshotare la scena
   stabile e la baseline non si rompa.
7. Come sviluppatore, voglio un **timestep fisso** (60 Hz) per il loop di aggiornamento, così che
   l'integrazione a forze sia stabile e deterministica fin dalle fondamenta, immune alle esplosioni
   numeriche da frame lunghi.
8. Come giocatore/tester, voglio **accelerare e frenare l'auto in linea retta** nella scena dev, così
   da verificare a mano che la propulsione e l'integrazione longitudinale funzionino.
9. Come sviluppatore, voglio che la propulsione tracer passi per la **catena reale** (forza nel
   frame-corpo → integrazione SI → conversione corpo↔mondo → scrittura in px → rotazione sprite), così
   da validare la pipeline su cui lo Step 1 costruirà.
10. Come sviluppatore, voglio che allo Step 0 **non ci sia imbardata** (l'auto non curva), così da
    evitare i quattro `atan2` instabili a bassa velocità, che richiedono il blend cinematico dello
    Step 1.
11. Come giocatore/tester, voglio che lo **sterzo ruoti visivamente le ruote anteriori** anche se
    l'auto non curva ancora, così da confermare che l'input di sterzo viene letto e smussato.
12. Come sviluppatore, voglio che la **velocità in SI (m/s)** sia il source of truth e che Excalibur
    integri la posizione da `actor.vel`, così da non duplicare l'integrazione e mantenere un solo
    punto di verità del moto.
13. Come giocatore/tester, voglio che l'auto si **fermi contro i muri** (ostacoli `Fixed`), così da
    avere collisioni credibili senza che io debba reimplementare la risposta ai muri.
14. Come sviluppatore, voglio un **component-contratto** (`DriverInputComponent`) con target
    normalizzati (gas, freno, sterzo, richiesta retromarcia), così che input e fisica siano disaccoppiati.
15. Come sviluppatore, voglio un **system di solo input** (`PhysicDriveInputSystem`) che traduca la
    tastiera nel component, senza fare smoothing né fisica, così che resti un puro traduttore di comandi.
16. Come sviluppatore, voglio un **system di update** (`PhysicDriveUpdateSystem`) che legga il
    component e faccia smoothing, fisica, integrazione e hook di rendering, **agnostico rispetto alla
    sorgente dell'intento**, così da poterlo riusare per auto pilotate dall'AI.
17. Come futuro sviluppatore dell'AI, voglio che l'update system giri anche su auto **senza tastiera**,
    così da poter aggiungere avversari computer scrivendo lo stesso `DriverInputComponent`.
18. Come sviluppatore, voglio che il system di input abbia **priorità più alta** dell'update, così che
    l'intento del frame sia pronto prima che la fisica lo consumi.
19. Come sviluppatore, voglio **riusare lo smoothing** dei pedali e dello sterzo esistenti
    (`smoothPedal`, `updateSteeringAngle`, `sumClamp`) dentro l'update system, così che umano e AI
    ereditino le stesse dinamiche di attuazione.
20. Come sviluppatore, voglio le **funzioni pure della fisica** in un service dedicato
    (`vehicle-physics.service`), così da poterle testare a tavolino indipendentemente da Excalibur.
21. Come sviluppatore, voglio una funzione di **conversione di scala** `pxPerMeter` derivata da
    `lengthMeters` e dall'altezza dello sprite, così da calcolare in SI e convertire in pixel solo al
    rendering.
22. Come sviluppatore, voglio una funzione pura di **ponte frame-locale → frame-corpo** (`localToBody`),
    così da mappare le geometrie disegnate (muso-su) sulla convenzione fisica (avanti = +x) senza
    riposizionare gli attori-figli né ruotare lo spritesheet.
23. Come sviluppatore, voglio funzioni pure di **rotazione corpo↔mondo** (`bodyToWorld`/`worldToBody`),
    così da convertire la velocità tra i due sistemi di riferimento.
24. Come sviluppatore, voglio una funzione pura di **un passo di integrazione longitudinale** del
    tracer, così da testare in isolamento la dinamica di accelerazione/attrito.
25. Come sviluppatore, voglio un helper puro `getTotalMass` (massa + carburante), così da avere un
    unico punto di verità per la massa usata dalla fisica, già pronto per il consumo carburante futuro.
26. Come sviluppatore, voglio **costanti generiche** (densità aria, `g`, soglia del blend a bassa
    velocità) in un file condiviso, così da non spargere magic number nei system.
27. Come sviluppatore, voglio il **datasheet completo** del veicolo (massa, geometria, COG, `Iz`, `Cα`,
    drivetrain, serbatoio, ...) dichiarato fin da subito sull'attore con valori placeholder, così da
    avere un'unica fonte dei parametri anche per i campi non ancora usati.
28. Come giocatore/tester, voglio un **HUD di debug** nella scena dev che mostri pedali, accelerazione
    longitudinale e velocità in km/h, così da osservare a colpo d'occhio l'effetto dello step mentre
    guido.
29. Come sviluppatore, voglio che l'HUD **cresca step dopo step** (poi `yawRate`, slip, `Fz`, ...),
    così da disporre sempre dello strumento di verifica adatto allo step corrente.
30. Come sviluppatore, voglio mantenere l'**anchor al centro** dello sprite, così che origine fisica,
    origine di rendering e centro di rotazione coincidano.
31. Come giocatore/tester, voglio che la **camera segua** l'auto e lo **sprite punti lungo l'heading**,
    con gli emitter di fumo attivi, così da confermare che i hook di rendering condivisi funzionano col
    nuovo attore.
32. Come responsabile della qualità, voglio che, riportando la costante di scena su produzione, la
    **vecchia scena resti identica** a prima, così da garantire l'assenza di regressioni.

## Implementation Decisions

### Architettura e coesistenza
- Le nuove classi **affiancano** `VehicleActor`/`DriveInputSystem`, che non vengono modificati nel
  comportamento. Lo switch della scena principale è fuori dallo scope dello Step 0.
- **`BaseVehicleActor`** (astratto, solo-visivo): estratto da `VehicleActor` con refactor a
  comportamento invariato. Possiede setup grafico (sprite, 4 ruote-figlie, assi, emitter, collider
  composito, transponder), la **geometria assi in px** e i metodi di rendering (`rotateToHeading`,
  `getWheelAxisRotation`, `onPostUpdate`, `setEmitters`). Espone i dati di moto necessari al rendering
  tramite **getter astratti** `heading` e `steeringAngle`.
- `VehicleActor` e **`PhysicVehicleActor`** estendono la base. `heading`/`steeringAngle` sono
  dichiarati nelle sottoclassi; i parametri della fisica vecchia (e `getAverageWheelFactors`) restano
  in `VehicleActor`; lo stato/parametri della fisica nuova in `PhysicVehicleActor`.

### Contratto input/fisica (apre la strada all'AI)
- **`DriverInputComponent`**: data-bag con `throttleTarget` ∈ [0,1], `brakeTarget` ∈ [0,1],
  `steerTarget` ∈ [−1,1], `reverseToggleRequested`. È l'unico punto di contatto tra i due system.
- **`PhysicDriveInputSystem`** (priorità `Higher`): query sul marker di controllo umano
  (`DrivableComponent`); traduce la tastiera (via `KeybindingsService`) nel component. Nessuno
  smoothing, nessuna fisica.
- **`PhysicDriveUpdateSystem`**: query su `[DriverInputComponent]`; agnostico rispetto a chi ha
  prodotto l'intento. Fa smoothing pedali/sterzo (riuso di `smoothPedal`, `updateSteeringAngle`,
  `sumClamp`), propulsione tracer, integrazione e hook di rendering.

### Modello fisico dello Step 0 (tracer)
- **Solo rettilineo**: `throttle`/`brake` → `Fx` longitudinale placeholder nel frame-corpo;
  integrazione `v̇_x = Fx/m − dragCoeff·v_x`; `v_y = 0`, `ω = 0`, `heading` fisso. Lo sterzo è letto e
  smussato (ruote anteriori ruotano visivamente) ma **non** curva l'auto.
- **Convenzione corpo** `x` = avanti, `y` = laterale per la fisica. **Sprite muso-su lasciato com'è**:
  il disaccoppiamento arte↔fisica vive nell'offset `+π/2` di `rotateToHeading` e nella funzione pura
  `localToBody`.

### Integrazione, posizione e collisioni
- **Velocità** in SI (m/s) = nostro source of truth sull'attore (`velM`/`v_x`/`v_y`, `theta`,
  `yawRate`). Ogni frame: integriamo in SI → convertiamo in mondo → scriviamo `actor.vel = worldVel ·
  pxPerMeter`.
- **Posizione e collisioni** delegate a Excalibur: il solver Arcade fa `pos += vel·dt` e ferma l'auto
  contro gli ostacoli `Fixed`. **Non** scriviamo `actor.pos` ogni frame (solo allo spawn). La
  posizione in metri, quando serve, è `actor.pos / pxPerMeter`. Nessuna `posM` separata, nessuna doppia
  integrazione.
- **Timestep fisso**: `Engine.fixedUpdateFps = 60` (config globale; benigna per la scena vecchia).

### Service fisico (modulo deep)
- **`vehicle-physics.service`** raccoglie le funzioni pure dello Step 0: `pxPerMeter`, `localToBody`,
  `bodyToWorld`/`worldToBody`, `integrateLongitudinalStep`, `getTotalMass`. Interfaccia semplice e
  stabile, indipendente da Excalibur.
- **`physics.constants.ts`**: costanti generiche (densità aria, `g`, soglia blend a bassa velocità),
  dichiarate ora anche se usate negli step successivi.

### Parametri del veicolo
- **Datasheet completo** su `PhysicVehicleActor` da subito, con placeholder per i campi inerti:
  `mass` (1000 kg, ex `weight`), `lengthMeters` (+`pxPerMeter` derivato), geometria assi → bracci in m,
  `maxSteeringAngle` (0.4 rad) e rate di sterzo, `cogPosition` (default centro), `cogHeight`,
  `Iz ≈ m·(L²+W²)/12`, `Cα`, `drivetrain`/`driveBias`, `fuelCapacity`/`fuelBurn`, e le costanti tracer
  (`Fx`, coefficiente di attrito lineare).

### Scena dev e UI
- **`PhysicsPlaygroundScene`**: parità con `PlaygroundScene` (mappa, `SurfacesService`,
  `ObstaclesService`, `RaceData`, checkpoint, giri, laptime), ma con `PhysicVehicleActor` (tag
  `player` + `DrivableComponent` + `DriverInputComponent`), i due nuovi system, `CameraFollowPlayerSystem`
  e l'HUD.
- **`PhysicsDebugHud`** (ScreenElement): unica UI di guida della scena dev; mostra pedali,
  accelerazione longitudinale e velocità in km/h, e crescerà negli step successivi. La
  `DrivingDashboard` **non** viene riusata né ri-tipizzata.
- **`main.ts`**: entrambe le scene registrate nella mappa `scenes`; una costante `START_SCENE`
  seleziona l'avvio, **committata sempre su `'playground'`**.

## Testing Decisions

- **Cosa rende buono un test:** si testa il **comportamento esterno** (input → output) delle funzioni
  pure, non i dettagli implementativi. Niente test che ispezionano stato interno o sequenze di
  chiamate.
- **Cosa si testa:** solo il **modulo deep** `vehicle-physics.service`, in
  `vehicle-physics.service.test.ts`, con un caso per funzione introdotta dallo Step 0:
  - `pxPerMeter` — scala corretta da `lengthMeters` e altezza sprite.
  - `localToBody` — mappa `{x:−v.y, y:v.x}` (avanti locale `−y` → corpo `+x`).
  - `bodyToWorld`/`worldToBody` — rotazioni inverse coerenti (round-trip identità; casi a θ noti).
  - `integrateLongitudinalStep` — accelerazione sotto `Fx`, decelerazione per attrito, comportamento a
    `dt ≤ 0`.
  - `getTotalMass` — somma massa + carburante.
- **Cosa NON si testa con unit:** attori, system, scena e HUD restano **glue accoppiato a Excalibur**,
  non unit-testati (Jest gira in `node`, senza Engine/DOM). I comportamenti emergenti e l'integrazione
  end-to-end sono validati **manualmente** dallo sviluppatore lanciando il gioco (vedi checklist in
  `grill-me-out.md`).
- **Prior art:** `math.service.test.ts` (funzioni pure: `sumClamp`, `smoothPedal`, ...) e
  `acceleration-applet.actor.test.ts`/`pedals-applet.actor.test.ts` (funzioni pure estratte dalla UI,
  es. `calcDotOffset`, `calcBarHeight`). Stesso stile: `describe`/`it`, `toBeCloseTo` per i float.
- **Regressione della scena esistente:** garantita dalla **baseline Playwright** invariata (la scena
  di produzione non cambia; il timestep fisso non altera il frame statico screenshotato).

## Out of Scope

- Qualsiasi **forza pneumatica reale**: modello lineare, cerchio di aderenza, slip angle, carico
  statico e trasferimento di carico (Step 1–3).
- **Imbardata e curvatura** dell'auto e blend cinematico a bassa velocità (Step 1).
- **Motore power-limited**, aerodinamica, attrito di rotolamento per-superficie e distribuzione di
  trazione (Step 4): allo Step 0 la propulsione è la tracer placeholder.
- **Pattinamento/bloccaggio**, **usura gomme**, **carburante** consumato e **statistiche metriche**
  (Step 5–6).
- **Switch della scena principale** al nuovo modello e rimozione del vecchio codice (fine piano).
- **Refactor della `DrivingDashboard`/applet** e adattatori di convenzione dell'accelerazione.
- Estensione di `SurfaceActor`/`SurfacesService` (grip per-ruota, `rollFactor`, `collisionend`) e
  refactor di `WheelFactor`: pianificati dallo Step 2.
- **Riconciliazione `velM` ↔ collisione** dopo l'urto di un muro: accettata come limite dello Step 0
  (rettilineo), eventuale raffinamento futuro.
- **Differenziali** e **slip ratio** reale: rimandati come da specifica.

## Further Notes

- Lo Step 0 è il primo di una sequenza a 7 step (`../plan-steps.md`): la sua ragion d'essere è dare un
  **fondamento stabile e verificabile** prima che compaia qualunque forza, perché una fisica a forze
  con imbardata è quasi impossibile da debuggare se appare già completa.
- La **separazione input/fisica** non è cosmetica: il `DriverInputComponent` è il contratto che
  permetterà di scambiare il pilota (umano ↔ computer) senza toccare la fisica. Tenere
  `PhysicDriveUpdateSystem` agnostico rispetto alla sorgente dell'intento è un requisito, non un
  optional.
- Ordine di costruzione consigliato (ogni task build-verde): refactor `BaseVehicleActor` →
  `vehicle-physics.service` + costanti → `DriverInputComponent` → `PhysicVehicleActor` →
  `PhysicDriveInputSystem` → `PhysicDriveUpdateSystem` → `PhysicsDebugHud` → `PhysicsPlaygroundScene` +
  `main.ts` (scene map, `START_SCENE`, fixed timestep).
- **Verifica manuale** (flippando `START_SCENE` su `'physics'` in locale): l'auto accelera/frena in
  retta stabilmente; km/h e pedali coerenti nell'HUD; lo sterzo gira le ruote ma non l'auto; stop
  contro i muri; camera e sprite corretti; con la costante su `'playground'` la scena vecchia è
  identica.
