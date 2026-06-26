# PRD — Step 3: Trasferimento di carico dinamico (issue #31)

> Deriva dalle decisioni in `step03/grill-me-out.md`, dalle specifiche in `specs.md`
> (§3.3, §3.4, §3.7, §3.11) e dallo stato del software post Step 2. Lingua: italiano per
> coerenza con gli artefatti di issue #31.

## Problem Statement

Dopo lo Step 2 l'auto ha un cerchio di aderenza per ruota (`|F_i| ≤ μ_i·Fz_i`), ma il carico
verticale `Fz` su ogni gomma è **statico**: dipende solo dalla geometria (ripartizione del peso),
mai dalla guida. Di conseguenza il cerchio di aderenza non "respira": frenando, accelerando o
curvando, la tenuta delle quattro gomme resta quella da fermo. Mancano quindi comportamenti che il
pilota si aspetta e che lo Step 2 può già sfruttare ma non riceve:

- l'**affondo in frenata** (l'avantreno si carica, il retrotreno si alleggerisce);
- lo **scarico dell'avantreno in accelerazione**;
- il **trasferimento sulle ruote esterne in curva**;
- la combinazione **frenata-in-curva**, dove la ruota interna si alleggerisce e perde tenuta prima.

Senza questo, il guadagno del cerchio di aderenza è dimezzato e le scivolate non hanno la
progressione realistica che lo Step 2 promette.

## Solution

Rendere `Fz` **dinamico**: il baricentro resta fisso nel corpo (§3.4), ma il carico si
ridistribuisce tra le quattro gomme in funzione dell'accelerazione del veicolo. Il carico statico
calcolato allo Step 2 diventa la *base*; sopra di esso si sommano il trasferimento **longitudinale**
(da `a_x`) e quello **laterale** (da `a_y`), con clamp `≥ 0` (ruota scaricata = grip zero). Il `Fz`
così ottenuto entra nel cerchio di aderenza già esistente, dando il guadagno realistico.

L'accelerazione che guida il trasferimento è la **forza netta / massa** del frame precedente (la vera
accelerazione del baricentro nel frame corpo), letta con un ritardo di un frame per spezzare la
dipendenza circolare `Fz → forza → accelerazione → Fz`. Tutta la matematica nuova vive in funzioni
pure nel `vehicle-physics.service`, testabili a banco; il system fa solo orchestrazione; l'HUD di
debug mostra il trasferimento con una barra per ruota centrata sul carico statico.

Dal punto di vista del pilota: l'auto si comporta in modo coerente con la fisica reale sotto carico,
in modo emergente e non scriptato, e il fenomeno è osservabile e tarabile dall'HUD guidando.

## User Stories

1. Come pilota, voglio che frenando forte il carico si sposti sull'avantreno, così che l'auto
   "affondi" davanti come una vera vettura.
2. Come pilota, voglio che accelerando il carico si sposti sul retrotreno, così che l'avantreno si
   alleggerisca in trazione.
3. Come pilota, voglio che in curva il carico si sposti sulle ruote esterne, così che la dinamica
   rispecchi il rollio reale.
4. Come pilota, voglio che frenando in curva la ruota interna si alleggerisca e saturi prima, così
   che la frenata-in-curva sia rischiosa come nella realtà.
5. Come pilota, voglio che l'intensità del trasferimento dipenda dall'altezza del baricentro, così
   che un'auto più alta sia più sensibile ai trasferimenti.
6. Come pilota, voglio che l'effetto del trasferimento alimenti il cerchio di aderidenza dello Step 2,
   così che le scivolate/sotto-sovrasterzo abbiano una progressione realistica.
7. Come pilota, voglio che a ruota completamente scarica la gomma perda tutto il grip, così che i
   sollevamenti estremi siano un rischio reale.
8. Come pilota, voglio che a velocità nulla o bassissima il trasferimento laterale resti trascurabile,
   così che l'auto non vibri né si comporti in modo instabile da ferma.
9. Come pilota, voglio che l'affondo in frenata sia visibile anche a bassa velocità, così che la
   frenata si "senta" sempre.
10. Come pilota in fase di test, voglio vedere nell'HUD lo scostamento di `Fz` rispetto allo statico
    per ogni ruota tramite una barra, così che possa verificare a colpo d'occhio l'effetto guidando.
11. Come pilota in fase di test, voglio che le barre tornino al centro (statico) a regime e in
    rettilineo, così che possa confermare che il trasferimento è zero quando non accelero.
12. Come taratore, voglio poter regolare `cogHeight` (e `cogPosition`) per veicolo, così che possa
    rendere un'auto più o meno nervosa nei trasferimenti senza toccare il codice.
13. Come sviluppatore, voglio che la matematica del trasferimento sia in funzioni pure testabili, così
    che possa verificarne segni e invarianti senza avviare il gioco.
14. Come sviluppatore, voglio che il vecchio modello (`VehicleActor`/`DriveInputSystem`) e la baseline
    Playwright restino intatti, così che lo Step 3 sia mergeabile in isolamento.
15. Come sviluppatore, voglio nessun magic number nei system, così che i parametri restino sul
    datasheet del veicolo o nelle costanti condivise.

## Implementation Decisions

### Sorgente dell'accelerazione (Q1)
- Il trasferimento usa l'accelerazione del baricentro nel frame corpo, che è esattamente
  **`(Fx_netto/m, Fy_netto/m)`** (i termini di Coriolis di `integrateBody` si elidono). Non si usa il
  `v̇` grezzo (`(next.vx − vx)/dt`), che includerebbe il Coriolis e conteggerebbe male in curva.
- Si introduce sull'attore uno stato `bodyAccel` (m/s², frame corpo), scritto a **fine** del passo di
  integrazione (`fx/mass`, `fy/mass`) e letto dal frame **successivo** prima del cerchio. Il ritardo
  di un frame spezza la dipendenza circolare `Fz → forza → accelerazione → Fz` (nessuna iterazione
  intra-frame).

### Modulo profondo: matematica del trasferimento (Q2, Q3, Q5)
Funzioni pure aggiunte al `vehicle-physics.service` (SI, frame corpo x=avanti/y=laterale):
- `longitudinalLoadTransfer(mass, a_x, cogHeight, L)` → `ΔFz` come **totale d'asse** (`m·a_x·h/L`).
- `lateralLoadTransfer(massAxle, a_y, cogHeight, track)` → `ΔFz` **per ruota** (`m_axle·a_y·h/track`).
- `dynamicLoad(staticLoads, a_x, a_y, cogHeight, L, trackFront, trackRear)` → 4 `Fz` finali: assembla
  statico + trasferimenti, applica segni/split per ruota e clamp `≥ 0`. È l'unico punto chiamato dal
  system. Riusa il tipo esistente `WheelLoads`.

Regole di ripartizione e segno:
- **Longitudinale**: `a_x>0` (accelera) → posteriori `+ΔL/2`, anteriori `−ΔL/2`; frenata (`a_x<0`) →
  carico in avanti. `ΔL` è totale d'asse, diviso `/2` per ruota.
- **Laterale**: calcolato **per asse**, con la carreggiata propria dell'asse e la quota di massa
  statica di quell'asse (`m_axle = somma Fz statici dei due wheel / g`). Nessun knob di rigidezza di
  rollio. `a_y>0` (verso +y/destra) → esterno = sinistra → ruote sinistre `+Δlat`, destre `−Δlat`.

### Clamp e conservazione (Q4)
- `Fz_i = max(0, static_i + Δlong_i + Δlat_i)`. **Nessuna ridistribuzione** dell'eccesso quando una
  ruota si scarica: la somma può scendere sotto `m·g` al sollevamento ruota (semplificazione accettata
  da §3.4). La ridistribuzione/asse di rollio resta fuori scope.

### Orchestrazione nel system (`PhysicDriveUpdateSystem.integrateMotion`)
- Si interpone `dynamicLoad(staticLoad(...), bodyAccel.x, bodyAccel.y, cogHeight, L, trackFront,
  trackRear)` prima del ciclo per-ruota; il `Fz` dinamico sostituisce quello statico in input al
  `clampToFrictionCircle` e viene scritto su `wheelState.load`.
- A fine metodo si salva `bodyAccel = (fx/mass, fy/mass)` (le forze nette post-blend già calcolate).
- I geometrici per-asse (`L`, `trackFront`, `trackRear`) sono esposti come getter sull'attore
  (accanto all'esistente `trackMeters` medio).

### Stato dell'attore (`PhysicVehicleActor`)
- Nuovo campo `bodyAccel` (frame corpo). `cogHeight` (già presente, 0.5 m) passa da inerte ad attivo.
- `longitudinalAccel` resta invariato per la riga `aLong` dell'HUD (è il `v̇` percepito); `bodyAccel`
  è la fonte separata per il trasferimento.
- `cogPosition` e i bracci `r_i` **non si toccano** (baricentro fisso, §3.4).

### Stato per ruota e baseline HUD (Q6)
- Per disegnare la barra centrata sullo statico senza ricalcolarlo nell'HUD, si espone il carico
  statico per ruota accanto a quello dinamico (campo `loadStatic` su `WheelState`, scritto dal system
  insieme a `load`).

### HUD (`PhysicsDebugHud`) (Q6)
- In ogni cella della griglia 2×2 si aggiunge una **barra orizzontale** centrata sul carico statico:
  riempimento a destra (verde) quando la ruota è caricata, a sinistra (rosso) quando scaricata,
  lunghezza proporzionale a `|ΔFz|`. Il numero `Fz` resta. Possibile lieve aggiustamento di altezza
  HUD/spaziatura cella.

### Stabilità (Q8)
- Nessuna guardia extra. A bassa velocità le forze laterali sono già scalate da `k→0` (blend Step 1),
  quindi `a_y→0` e il trasferimento laterale si auto-sopprime; il clamp `≥ 0` e il cerchio di aderenza
  limitano i due estremi. L'affondo in frenata resta visibile (l'`a_x` da tracer è reale anche a bassa
  velocità). Eventuali oscillazioni si rivedono solo se emergono in verifica manuale.

### Parametrizzazione
- Nessuna nuova costante in `physics.constants.ts` (`cogHeight` è per-veicolo). Nessun magic number
  nei system.

### Coesistenza
- Solo `PhysicVehicleActor`/`PhysicDriveUpdateSystem`/`PhysicsDebugHud`/`vehicle-physics.service` sono
  toccati. `VehicleActor`, `DriveInputSystem`, `BaseVehicleActor`, `WheelFactor` restano intatti.
  `main.ts` committato con `START_SCENE='playground'` (flip a `'physics'` solo in locale per la
  verifica): baseline Playwright non a rischio.

## Testing Decisions

Un buon test verifica il **comportamento esterno** (input → output) di una funzione pura, non i
dettagli implementativi. Coerentemente con la strategia consolidata di issue #31 e con la preferenza
dell'utente (automatizzare solo funzioni pure; comportamento di attori/system/HUD verificato
manualmente guidando), i test dello Step 3 coprono **solo** le nuove funzioni pure del service, in
`vehicle-physics.service.test.ts` (prior art: i test già presenti per `staticLoad`,
`clampToFrictionCircle`, `integrateBody`, ecc.).

Moduli testati e casi:
- **`dynamicLoad`**:
  - `a_x = a_y = 0` → output **identico** a `staticLoad`.
  - `a_x > 0` → posteriori guadagnano / anteriori perdono, con fattore `/2` per ruota.
  - `a_y > 0` → ruote sinistre guadagnano / destre perdono.
  - **Somma invariante**: `ΣΔ = 0` prima di qualsiasi clamp (conservazione del carico).
  - **Clamp `≥ 0`** quando il trasferimento supera lo statico (nessun `Fz` negativo).
  - Il `Δ` **scala linearmente con `cogHeight`** (raddoppia `h` → raddoppia `Δ`).
- **`longitudinalLoadTransfer`** e **`lateralLoadTransfer`**: valore numerico esatto e segno.

Restano **glue** (verificati guidando, non con unit test): il wiring di `bodyAccel`, i getter
geometrici, la scrittura su `WheelState`, e le barre dell'HUD.

Verifica manuale (con `START_SCENE='physics'`): affondo in frenata, scarico in accelerazione, carico
sulle esterne in curva, alleggerimento dell'interno frenando in curva, scaling con `cogHeight`,
assenza di oscillazioni, barre HUD coerenti che tornano allo statico a regime; `npm run build` e
`npm run test:unit` verdi; con `START_SCENE='playground'` la scena vecchia resta identica.

## Out of Scope

- **Motore reale e distribuzione di trazione** (FWD/RWD/AWD, `F_drive = min(F_max, P/v)`): Step 4. La
  propulsione longitudinale resta la **tracer** al baricentro.
- **Pattinamento/bloccaggio espliciti** (saturazione longitudinale + flag/effetti): Step 5.
- **Usura gomme, carburante, statistiche metriche** e switch della scena principale: Step 6.
- **Ridistribuzione del carico** della ruota sollevata alle altre e modellazione dell'asse di rollio.
- **Spostamento del punto baricentro** per-frame (vietato da §3.4: il baricentro resta fisso).
- **Differenziali** e slip ratio reale (rimandati dal piano generale).
- Modifiche al vecchio modello cinematico e alla baseline Playwright.

## Further Notes

- Decisione fisica chiave: l'accelerazione del baricentro nel frame corpo coincide con `F_netto/m`
  perché i termini incrociati (Coriolis) di `integrateBody` si elidono — per questo si usa la forza
  netta e non il `v̇` grezzo.
- Il trasferimento longitudinale e quello laterale hanno semantica "per" diversa: il primo è un
  totale d'asse (`/2` per ruota), il secondo è già per ruota (esterno +, interno −). I segni sono
  documentati nel docstring di `dynamicLoad` e asseriti dai test, per catturare future inversioni.
- Tarature attese durante la verifica: `cogHeight` (guadagno del trasferimento, §3.11), `cogPosition`
  (bilanciamento statico ant./post., influenza la quota di massa per-asse nel laterale), e
  indirettamente `corneringStiffnessFront/Rear` + grip superfici (la soglia di scivolamento ora
  dipende dal `Fz` dinamico).