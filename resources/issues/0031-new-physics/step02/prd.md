# PRD — Step 2: Cerchio di aderenza + carico statico + superfici per-ruota (fisica a 4 ruote, issue #31)

> Documento di requisiti per il **terzo step** della riscrittura del layer fisico del veicolo.
> Le decisioni qui formalizzate derivano dall'interview in `step02/grill-me-out.md`, dalle specifiche
> in `../specs.md` (in particolare §3.3, §3.5, §3.6, §3.7) e dal piano in `../plan-steps.md`.
> Applicazione: gioco di corse 2D top-down, framework **ExcaliburJS** (v0.32.0), TypeScript, Vite.
> Costruisce sull'impalcatura completata negli **Step 0–1** (`PhysicVehicleActor`, due system,
> `vehicle-physics.service`, `PhysicsPlaygroundScene`, HUD di debug, modello pneumatico **lineare** a
> 4 ruote con blend a bassa velocità).

## Problem Statement

Dopo lo Step 1 l'auto a fisica nuova curva in modo plausibile e stabile, ma la forza laterale di ogni
gomma è **lineare e illimitata** (`Fy = −Cα·α`, senza tetto): le gomme non scivolano mai, l'auto gira
"su binari" anche in curva stretta ad alta velocità, e la superficie sotto le ruote **non conta**.
Mancano i comportamenti emergenti che danno carattere alla guida — scivolate, sotto/sovrasterzo da
perdita di tenuta, e l'auto che "tira" da un lato quando una metà è sull'erba.

C'è inoltre un problema strutturale scoperto durante l'interview: la rilevazione della superficie
**per-ruota oggi non funziona affatto**. Le quattro ruote-figlie sono create senza `collisionType`,
quindi col default Excalibur (`PreventCollision`) non generano contatti né eventi; il filtro per-nome
del `SurfacesService` non scatta mai e il grip per-ruota resta bloccato sul valore di default. La
feature "grip per superficie" è di fatto codice morto. Senza grip per-ruota reale, il cerchio di
aderenza non avrebbe nulla con cui differenziare le gomme.

Lo sviluppatore ha bisogno del **primo strato di non-linearità** del modello: ogni gomma può produrre
al massimo una forza `μ·Fz`, dove `Fz` è il carico **statico** sulla ruota e `μ` il grip della
**superficie reale** sotto quella ruota. Quando la richiesta laterale supera quel tetto, la gomma
scivola. La differenza di tenuta tra le quattro ruote (per carico o per superficie) fa nascere
**dalla fisica** sotto/sovrasterzo e coppia di imbardata, senza scriptarli.

## Solution

Costruire lo **Step 2**: introdurre il **cerchio di aderenza** con carico **statico** e grip
**per-ruota** reale, lasciando invariata la propulsione longitudinale tracer dello Step 0–1 (al
baricentro) e **senza** ancora il trasferimento di carico (Step 3) né la distribuzione di trazione
(Step 4).

Concretamente:

- **Rilevazione superficie per-ruota funzionante.** Le quattro ruote del `PhysicVehicleActor` diventano
  **sensori** (`CollisionType.Passive`): generano `collisionstart`/`collisionend` con le superfici
  senza alcuna risposta fisica (il corpo `Active` continua a gestire i muri). Il cambiamento è
  **confinato al nuovo attore**: la classe base e il vecchio `VehicleActor` restano intatti, così la
  baseline Playwright non si muove.
- **Stato per-ruota separato.** Un nuovo modello `WheelState` (per il solo path fisico) tiene il grip
  di superficie corrente, il carico `Fz`, lo slip angle e il flag di saturazione di ogni ruota. Il
  `WheelFactor` esistente resta intatto per il vecchio path.
- **Carico statico.** Una funzione pura ripartisce il peso (`totalMass·G`) sulle quattro gomme da
  `cogPosition` e dalla geometria assi/carreggiate, restituendo quattro `Fz` (a COG centrato: quattro
  quarti uguali).
- **Cerchio di aderenza (laterale).** Una funzione pura taglia la forza di ogni gomma al raggio
  `μ·Fz` e segnala la saturazione. Poiché al baricentro c'è ancora la sola spinta tracer, allo Step 2
  il clamp opera **solo sulla forza laterale** (`Fx = 0` per ruota), ma la funzione è scritta in forma
  generale per il riuso allo Step 4.
- **Comportamenti emergenti.** Il clamp **per ruota, prima della somma**, fa sì che la saturazione
  asimmetrica (anteriori vs posteriori, o lato erba vs lato tarmac) generi una **coppia di imbardata**:
  l'auto allarga, scoda o tira da sola.
- **HUD cresciuto.** Una griglia 2×2 che rispecchia l'auto mostra `Fz` e slip per ruota, evidenziati
  quando la gomma satura.

Il risultato è guidabile a mano: in curva stretta ad alta velocità l'auto scivola invece di girare su
binari; guidando con metà auto sull'erba tira verso un lato; il flag di saturazione si accende sulle
ruote che perdono tenuta — pronto a ricevere il trasferimento di carico nello Step 3.

## User Stories

1. Come giocatore/tester, voglio che in **curva stretta ad alta velocità** l'auto **scivoli** invece
   di girare come su binari, così da percepire il limite di tenuta delle gomme.
2. Come giocatore/tester, voglio che quando una gomma **perde tenuta** lo veda nell'HUD (flag di
   saturazione), così da capire perché l'auto scivola.
3. Come giocatore/tester, voglio che guidando con **metà auto sull'erba** l'auto **"tiri"** verso un
   lato, così da sentire l'effetto della superficie asimmetrica.
4. Come giocatore/tester, voglio che a velocità di crociera e in curva dolce la guida resti **stabile**
   (come allo Step 1 finché non si satura), così da non avere regressioni di stabilità.
5. Come giocatore/tester, voglio che da **ferma o lentissima** l'auto continui a non vibrare (blend
   ancora attivo), così da mantenere la manovrabilità a bassa velocità.
6. Come sviluppatore, voglio che ogni gomma produca al massimo una forza **`μ·Fz`** (cerchio di
   aderenza), così che la perdita di tenuta nasca dalla fisica e non sia scriptata.
7. Come sviluppatore, voglio che `μ` sia il **grip della superficie reale** sotto ciascuna ruota, così
   che terreni diversi diano tenute diverse per-ruota.
8. Come sviluppatore, voglio che `Fz` sia il **carico statico** ripartito sulle quattro gomme dalla
   massa e dalla geometria, così da avere il punto di partenza realistico del cerchio.
9. Come sviluppatore, voglio che **sotto/sovrasterzo e coppia di imbardata emergano** dalla saturazione
   asimmetrica delle gomme, così da non scriptare quei comportamenti.
10. Come sviluppatore, voglio che la rilevazione della superficie **per-ruota funzioni davvero** (oggi
    è codice morto), così che il grip per-ruota non resti bloccato sul default.
11. Come sviluppatore, voglio che le ruote siano **sensori** (nessuna risposta fisica), così da leggere
    la superficie senza perturbare la collisione del corpo contro i muri.
12. Come responsabile della qualità, voglio che il cambiamento dei collider sia **confinato al nuovo
    attore**, così che la classe base e il vecchio `VehicleActor` restino identici e la baseline
    Playwright intatta.
13. Come sviluppatore, voglio gestire il **`collisionend`** (oggi assente), così che una ruota non si
    porti dietro il grip di una superficie già lasciata.
14. Come sviluppatore, voglio che il grip di una ruota a cavallo di **due superfici** sia risolto in
    modo robusto all'ordine degli eventi, così da non avere snap errati al confine.
15. Come sviluppatore, voglio uno **stato per-ruota dedicato** al path fisico (grip, `Fz`, slip,
    saturazione), così da non rompere il `WheelFactor` condiviso col vecchio path.
16. Come sviluppatore, voglio mantenere la **propulsione longitudinale tracer** al baricentro, così da
    non mescolare il motore reale (Step 4) con l'introduzione del cerchio.
17. Come sviluppatore, voglio che allo Step 2 il cerchio limiti **solo la forza laterale** (`Fx = 0`
    per ruota), così da isolare la saturazione laterale prima della trazione per-ruota.
18. Come sviluppatore, voglio una funzione `clampToFrictionCircle` scritta in forma **generale**
    (combinata `Fx`/`Fy`), così da riusarla intatta allo Step 4.
19. Come sviluppatore, voglio che il **clamp avvenga per ruota, prima della somma** delle forze, così
    che la saturazione asimmetrica produca la coppia di imbardata e i flag per-ruota.
20. Come sviluppatore, voglio che il **blend a bassa velocità** resti dopo il clamp (limite fisico
    prima, stabilizzatore numerico dopo), così da preservare stabilità e comportamento Step 1.
21. Come sviluppatore, voglio una funzione pura per il **carico statico** che ritorni quattro `Fz`,
    così da testarne la ripartizione a tavolino.
22. Come sviluppatore, voglio che il carico statico usi la **massa totale** (telaio + carburante) come
    unico punto di verità, così che il consumo di carburante (Step 6) si rifletta da sé.
23. Come sviluppatore, voglio che il carico statico supporti un **COG decentrato** (longitudinale e
    laterale), così da non doverlo riscrivere quando il baricentro si sposterà.
24. Come sviluppatore, voglio che `cogHeight` **non** entri nel carico statico (è trasferimento di
    carico, Step 3), così da non anticipare lo step successivo.
25. Come giocatore/tester, voglio che l'**HUD di debug** mostri `Fz` e slip **per ruota** in una
    griglia 2×2 che rispecchia l'auto, così da leggere a colpo d'occhio carico e scivolate.
26. Come giocatore/tester, voglio che la cella di una gomma **saturata** sia evidenziata, così da
    individuare subito la ruota che perde tenuta.
27. Come sviluppatore, voglio che il grip della superficie sia il suo **`gripFactor`** così com'è
    (nessun rimappaggio), e un **default condiviso** per le ruote fuori da ogni superficie, così da non
    introdurre knob superflui.
28. Come sviluppatore, voglio che le **funzioni di fisica nuove siano pure** e raccolte nel
    `vehicle-physics.service`, così da testarle indipendentemente da Excalibur.
29. Come futuro sviluppatore dell'AI, voglio che `PhysicDriveUpdateSystem` resti **agnostico rispetto
    alla sorgente dell'intento**, così da poter guidare auto senza tastiera anche col cerchio.
30. Come sviluppatore, voglio che `actor.pos` **non venga scritto** e che posizione/collisioni restino
    di Excalibur, così da non duplicare l'integrazione (coerente con gli Step 0–1).
31. Come responsabile della qualità, voglio che `npm run build` e `npm run test:unit` restino verdi e
    che `main.ts` resti committato con `START_SCENE='playground'`, così da non introdurre regressioni.

## Implementation Decisions

### Rilevazione superficie per-ruota (Q1, Q9)
- Le quattro ruote del **`PhysicVehicleActor`** diventano `CollisionType.Passive` (sensori) impostando
  il tipo dopo `super.onInitialize()` sui membri ruota `protected` della base. La **classe base** e il
  vecchio **`VehicleActor`** restano **byte-identici** (baseline Playwright non a rischio).
- Regola Excalibur verificata (`Pair.canCollide`): un contatto/evento scatta per qualsiasi coppia
  tranne se uno è `PreventCollision` o entrambi `Fixed`. Una ruota `Passive` genera quindi
  `collisionstart`/`collisionend` con le superfici senza risposta fisica.
- Il **`SurfacesService`** estende il proprio handler: su `collisionstart`, oltre al ramo legacy
  `wheelFactors`, se il veicolo è `instanceof PhysicVehicleActor` aggiorna il `WheelState` della ruota;
  aggiunge un handler **`collisionend`** simmetrico. L'accoppiamento service→attore è accettato e
  type-safe. Poiché le ruote del vecchio attore restano `PreventCollision`, il ramo nuovo è
  **naturalmente inerte** per la baseline.
- **Rischio d'integrazione verificato nullo:** il `CheckpointActor` filtra strettamente su
  `laptimeTransponder` (niente passaggi di giro spuri); gli ostacoli sono `Fixed` senza handler
  reattivo alle ruote; `Passive` non risolve fisicamente (i muri restano gestiti dal corpo `Active`).

### Stato per-ruota: nuovo modello `WheelState` (Q2)
- Modello **separato** dal `WheelFactor` (che resta intatto per il vecchio path, ancora letto da
  `getAverageWheelFactors`/`DriveInputSystem`). `WheelState` contiene: `gripSurface` (μ, scritto dal
  `SurfacesService`), `load` (`Fz`, scritto ogni frame dall'update system), `slipAngle` (rad, ogni
  frame), `saturated` (flag cerchio, ogni frame) e lo **stack delle superfici** correnti (vedi Q3).
- Il `PhysicVehicleActor` tiene una `wheelStates` mappa con le quattro chiavi ruota
  (`frontLeftWheel`/…), parallela alla `wheelFactors` ereditata. **Co-proprietà:** superficie ↦
  `gripSurface`+stack; update system ↦ `load`/`slipAngle`/`saturated`; HUD legge.
- Rimozione di `WheelFactor.power`/rinomina `drag`→`rollFactor` **rimandate** agli Step 4/6.

### `collisionend` e risoluzione del grip (Q3)
- Ogni `WheelState` tiene uno **stack delle superfici** su cui la ruota si trova: `collisionstart` fa
  push, `collisionend` rimuove quella superficie. Il grip corrente è quello della **superficie più
  recente** ancora presente ("last-wins"), oppure `DEFAULT_SURFACE_GRIP` se lo stack è vuoto. Robusto a
  overlap di confine e all'ordine degli eventi. La risoluzione resta **inline** negli handler (glue).

### Modulo deep: `vehicle-physics.service` (funzioni pure, SI)
- **`staticLoad(...)`** → quattro `Fz` (N). Usa `totalMass` (telaio + carburante via `getTotalMass`) ×
  `G`, con split **longitudinale** (anteriore = `b/L`, posteriore = `a/L`) **e laterale** (da
  `cogPosition.y` e dalla carreggiata di ciascun asse). COG centrato → quattro quarti uguali
  (`totalMass·G/4`). `cogHeight` non usata (Step 3). Clamp `≥ 0` previsto ma banale ora.
- **`clampToFrictionCircle(Fx, Fy, mu, Fz)`** → forza tagliata al raggio `μ·Fz` (direzione preservata)
  più flag di saturazione. Forma **generale** combinata; allo Step 2 chiamata con `Fx = 0` per ruota
  (clamp `|Fy| ≤ μ·Fz`). Casi limite: `Fz = 0` (grip zero → forza 0), dentro il cerchio → invariata.

### Orchestrazione: `PhysicDriveUpdateSystem` (glue Excalibur) (Q4, Q5)
- La propulsione longitudinale resta la **tracer al baricentro** (gas/freno → `Fx` + attrito lineare),
  **non clampata** (la trazione grip-limitata è Step 4).
- Ogni frame: calcola `staticLoad` (da `totalMass`); poi nel ciclo per-ruota
  (`wheelArmsBody`; `δ = steeringAngle` sulle anteriori, `0` sulle posteriori):
  `wheelVelocity → slipAngle → lateralForceLinear → clampToFrictionCircle(0, Fy, μ_i, Fz_i)`, dove
  `μ_i = wheelStates[name].gripSurface` e `Fz_i` dal carico statico. Scrive `slipAngle`/`load`/
  `saturated` su `WheelState`. **Ruota la forza anteriore di `δ`**, accumula `Fx`/`Fy` netti e la
  **coppia** `Mz = Σ(r_i_x·F_i_y − r_i_y·F_i_x)`.
- **Ordine:** clamp **per ruota** (limite fisico) → somma → **blend a bassa velocità** (scala per `k`,
  stabilizzatore numerico) → `integrateBody`. Il clamp prima della somma è ciò che produce la coppia
  di imbardata asimmetrica e i flag per-ruota.

### Costanti e parametri (Q8)
- `SurfaceActor.gripFactor` è `μ` **direttamente** (tarmac 1.0 / grass 0.5 / graveltrap 1.3, intatti).
- Nuova costante generica **`DEFAULT_SURFACE_GRIP = 1.0`** in `physics.constants.ts` per la ruota fuori
  da ogni superficie. Nessun magic number nei system; la soglia di scivolamento si tara via `Cα` e
  valori di grip.

### UI di debug: `PhysicsDebugHud` (Q7)
- Aggiunge una **griglia 2×2** (FL/FR sopra, RL/RR sotto) con `Fz` (N) e slip (°) per ruota, cella
  **evidenziata** (rosso) quando `saturated`. Restano le righe Step 0–1 (km/h, marcia, pedali, `aLong`,
  `yawRate`). Legge `wheelStates` dall'attore.

### Retromarcia e contratto input/fisica
- Retromarcia invariata: il cerchio è basato sul **modulo** della forza, indifferente al segno della
  velocità. `PhysicDriveInputSystem`/`DriverInputComponent` invariati; l'update resta agnostico alla
  sorgente dell'intento.

## Testing Decisions

- **Cosa rende buono un test:** si testa il **comportamento esterno** (input → output) delle funzioni
  pure, non i dettagli implementativi. Niente test che ispezionano stato interno o sequenze di chiamate.
- **Cosa si testa:** solo le **nuove funzioni pure** del `vehicle-physics.service`, in
  `vehicle-physics.service.test.ts`:
  - `staticLoad` — COG centrato → quattro `Fz` uguali (`totalMass·G/4`); COG spostato in avanti →
    anteriori più cariche delle posteriori; somma dei quattro `Fz` = `totalMass·G`.
  - `clampToFrictionCircle` — forza **dentro** il cerchio invariata; forza **fuori** scalata a modulo
    `μ·Fz` con direzione preservata e flag `saturated`; casi `Fz = 0` (forza 0) e `Fx = 0` (caso Step 2).
- **Cosa NON si testa con unit:** `PhysicVehicleActor`, `PhysicDriveUpdateSystem`, `SurfacesService`,
  `WheelState`, scena e HUD restano **glue accoppiato a Excalibur**, non unit-testati (Jest gira in
  `node`, senza Engine/DOM). La risoluzione dello stack superfici "last-wins" resta inline e si valida
  **guidando**. Cerchio, scivolate e coppia di imbardata si validano manualmente (vedi checklist in
  `grill-me-out.md`).
- **Prior art:** `vehicle-physics.service.test.ts` (Step 0–1: `pxPerMeter`, `bodyToWorld`/`worldToBody`,
  `localToBody`, `getTotalMass`, `integrateBody`, `wheelVelocity`, `slipAngle`, `lateralForceLinear`,
  `lowSpeedKinematicBlend`) e `math.service.test.ts`. Stesso stile: `describe`/`it`, `toBeCloseTo` per i
  float.
- **Regressione della scena esistente:** garantita dalla **baseline Playwright** invariata (la scena di
  produzione non cambia; i collider della base non si toccano).

## Out of Scope

- **Trasferimento di carico** longitudinale/laterale (`ΔFz`): Step 3. In Step 2 `Fz` è **statico**.
- **Motore power-limited**, aerodinamica, attrito di rotolamento per-superficie e **distribuzione di
  trazione** (FWD/RWD/AWD): Step 4. In Step 2 la propulsione longitudinale resta la **tracer** al
  baricentro, **non clampata** dal cerchio (niente split per-ruota della trazione).
- **Pattinamento/bloccaggio** espliciti come saturazione **longitudinale** del cerchio (con flag alto
  vs basso): Step 5. In Step 2 il clamp è **solo laterale** (`Fx = 0` per ruota).
- **Usura gomme**, **carburante** consumato, **statistiche metriche**: Step 6.
- **Refactor distruttivo di `WheelFactor`** (rimozione `power`, rinomina `drag`→`rollFactor`) e
  ripulitura dei system/attori vecchi: rimandati agli Step 4/6. In Step 2 lo stato nuovo vive in
  `WheelState`, parallelo.
- **Riconciliazione `velBody` ↔ collisioni** dopo l'urto di un muro: rimandata (limite noto accettato).
- **Unit test sullo stack superfici / sul wiring delle collisioni / sull'HUD:** glue Excalibur,
  validati manualmente.
- **Switch della scena principale** e rimozione del vecchio codice: fine piano (Step 6).

## Further Notes

- Lo Step 2 è il terzo di una sequenza a 7 step (`../plan-steps.md`): introduce la **prima
  non-linearità** (il cerchio di aderenza) sopra il modello lineare dello Step 1. L'ordine "a strati" è
  voluto — una fisica a forze con saturazione è quasi impossibile da debuggare se appare già completa.
- La **scoperta critica** dell'interview (ruote `PreventCollision` → grip per-ruota oggi non
  funzionante) è centrale: senza grip per-ruota reale il cerchio non avrebbe modo di differenziare le
  gomme. Renderlo funzionante (ruote sensori `Passive`) è prerequisito di tutti i comportamenti
  emergenti di questo step.
- La separazione **clamp per ruota prima della somma** è il cuore concettuale: è la saturazione
  **asimmetrica** (anteriori vs posteriori, lato erba vs lato tarmac) a far nascere sotto/sovrasterzo e
  la coppia di imbardata. Clampare la forza netta li cancellerebbe.
- **Convenzione assi** invariata: frame-corpo `x`=avanti, `y`=laterale; sprite muso-su lasciato com'è;
  disaccoppiamento arte↔fisica confinato a `+π/2` di `rotateToHeading` e a `localToBody` (bracci
  `r_i`). **Anchor al centro.**
- **Verifica manuale** (flippando `START_SCENE` su `'physics'` in locale): in curva stretta ad alta
  velocità l'auto scivola; mezza auto sull'erba la fa tirare; il flag di saturazione si accende sulle
  ruote che perdono tenuta; a regime resta stabile finché non satura; da ferma non vibra (blend attivo);
  HUD con `Fz`/slip per ruota coerenti; con la costante su `'playground'` la scena vecchia è identica.
- **Nota committal (eredità Step 0):** `main.ts` deve restare committato con `START_SCENE='playground'`
  (flip a `'physics'` solo in locale), altrimenti la build Playwright screenshotta la scena dev e rompe
  la baseline.
