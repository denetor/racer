# PRD — Step 5: Pattinamento e bloccaggio (saturazione longitudinale)

> Deriva dalle decisioni in `step05/grill-me-out.md`, dalle specifiche finali in `specs.md`
> (§3.5 cerchio di aderenza, §3.8 motore/resistenze, §3.10 blend a bassa velocità) e dalla struttura
> software esistente (post Step 4). Riguarda lo **Step 5** di `plan-steps.md`.

## Problem Statement

Con il modello a forze attuale (post Step 4) il cerchio di aderenza **già taglia** la forza
longitudinale eccedente: quando una gomma chiede più trazione o più freno di quanto il grip consenta,
la forza viene limitata a `μ·Fz`. Ma questo accade in modo **muto e indistinto**: non c'è modo di
sapere se una ruota sta **pattinando** (richiesta motrice > grip) o **bloccando** (richiesta frenante >
grip), né di distinguerlo dalla semplice perdita di tenuta laterale. Per il giocatore questi eventi
sono **invisibili**: non c'è fumo che segnali una ruota che slitta, e l'HUD di debug mostra solo un
generico flag di saturazione, identico per tutti i casi. Per chi sviluppa/tara la fisica, manca lo
strumento per verificare "a colpo d'occhio" dove e perché una gomma perde aderenza.

## Solution

Rendere **espliciti e nominati** i due fenomeni longitudinali — **pattinamento** (`wheelspin`) e
**bloccaggio** (`lockup`) — **per singola ruota**, come lettura della **saturazione longitudinale** del
cerchio di aderenza già esistente. Lo Step 5 è uno **strato diagnostico + cosmetico** sopra una fisica
che non cambia: la forza applicata resta quella dello Step 4 (clamp combinato direzione-preservante),
mentre due nuovi flag per ruota **derivano** dal confronto fra la domanda longitudinale e il margine
disponibile sul cerchio. Da questi flag nascono due manifestazioni:

- **Fumo per-ruota**, localizzato sulla gomma che pattina o blocca, così l'asimmetria (RWD che pattina
  dietro, anteriori che bloccano, mezza auto sull'erba) è leggibile a schermo.
- **HUD arricchito**: ogni cella per-ruota mostra un token `WSP`/`LCK` con colore distinto, separando il
  caso longitudinale (pattinamento/bloccaggio) da quello puramente laterale.

Il giocatore vede finalmente le gomme fumare quando slittano; lo sviluppatore vede esattamente quale
ruota satura e perché. La perdita di sterzabilità in bloccaggio e di trazione in pattinamento restano
**emergenti** dal cerchio (nessun nuovo cambio di forza). Lo **slip ratio vero** (con velocità angolare
di ruota come stato) resta rimandato a uno step futuro.

## User Stories

1. Come **giocatore**, voglio vedere **fumo uscire dalle ruote che pattinano**, così percepisco quando
   sto perdendo trazione in accelerazione.
2. Come **giocatore**, voglio vedere **fumo dalle ruote che si bloccano in frenata**, così capisco
   quando sto esagerando col freno.
3. Come **giocatore**, voglio che il fumo compaia **sulla singola ruota** che slitta (non un'unica
   nuvola al retrotreno), così riconosco se sta pattinando il posteriore o bloccando l'anteriore.
4. Come **giocatore**, voglio che, frenando a fondo, l'auto **perda sterzabilità** (sottosterzo), così
   il bloccaggio ha una conseguenza di guida coerente con ciò che vedo.
5. Come **giocatore**, voglio che, accelerando bruscamente su **bassa aderenza** (erba), le ruote
   motrici **pattinino** in modo evidente, così l'aderenza della superficie conta davvero.
6. Come **giocatore**, voglio che su **superfici asimmetriche** (mezza auto sull'erba) pattinino/blocchino
   **solo le ruote sul lato a basso grip**, così l'effetto è fisicamente plausibile.
7. Come **giocatore**, voglio che un'auto **ferma a freno pieno non emetta fumo**, così l'effetto non
   appare quando non c'è strisciamento.
8. Come **sviluppatore della fisica**, voglio un flag **`wheelspin` per ruota**, così posso distinguere
   il pattinamento dalla generica saturazione.
9. Come **sviluppatore della fisica**, voglio un flag **`lockup` per ruota**, così posso distinguere il
   bloccaggio dalla generica saturazione.
10. Come **sviluppatore della fisica**, voglio che i due flag possano essere **entrambi falsi** quando la
    saturazione è **solo laterale** (scivolata senza gas/freno), così non confondo la perdita di tenuta
    laterale con un evento longitudinale.
11. Come **sviluppatore della fisica**, voglio che una ruota possa essere **insieme** in pattinamento (o
    bloccaggio) **e** in saturazione laterale, così il modello-dati riflette la realtà del cerchio
    combinato.
12. Come **sviluppatore della fisica**, voglio che il **solo attrito di rotolamento** non alzi mai un
    flag, così una scivolata laterale a pedali rilasciati non viene letta come "bloccaggio".
13. Come **sviluppatore della fisica**, voglio che una ruota **non motrice** non possa mai segnare
    `wheelspin`, così la classificazione resta coerente col drivetrain.
14. Come **sviluppatore della fisica**, voglio che in **left-foot braking** (gas + freno insieme) il flag
    rifletta il **contributo dominante** alla ruota, così la classificazione è deterministica.
15. Come **sviluppatore della fisica**, voglio che pattinamento e bloccaggio funzionino correttamente
    anche in **retromarcia** (dopo il fix reverse-aware dello slip angle), senza flag spuri andando
    dritti all'indietro.
16. Come **sviluppatore della fisica**, voglio la logica di classificazione in una **funzione pura
    testabile al banco**, così posso verificarne i casi limite senza avviare il gioco.
17. Come **sviluppatore che tara la fisica**, voglio un **token `WSP`/`LCK` con colore distinto** in ogni
    cella dell'HUD, così vedo a colpo d'occhio quale ruota pattina/blocca e quale scivola solo di lato.
18. Come **sviluppatore che tara la fisica**, voglio una **soglia di velocità** sotto cui i flag non si
    alzano, così l'HUD e il fumo non sfarfallano vicino allo zero.
19. Come **manutentore del progetto**, voglio che il vecchio `VehicleActor` e la **baseline Playwright**
    restino **identici**, così l'introduzione del fumo per-ruota non rompe gli snapshot esistenti.
20. Come **manutentore del progetto**, voglio che lo Step 5 **non modifichi le forze** dello Step 4, così
    non si riapre la taratura del modello già validato.
21. Come **sviluppatore del prossimo step (usura)**, voglio che i flag di slittamento siano già
    disponibili su `WheelState`, così lo Step 6 potrà accelerare il consumo gomme in base ad essi.
22. Come **giocatore**, voglio che il fumo passi dall'essere **legato al gas** all'essere **legato allo
    slip reale**, così non vedo fumo quando l'auto accelera senza pattinare.

## Implementation Decisions

### Modulo nuovo — classificazione della saturazione longitudinale (deep module)

- Una **funzione pura** `longitudinalSaturation` vive in `vehicle-physics.service`, accanto alle altre
  funzioni a forze. Interfaccia: prende la quota motrice della ruota, la quota frenante, l'attrito di
  rotolamento, la forza laterale (già scalata dal blend), il grip `μ`, il carico `Fz` e se la ruota è
  motrice; restituisce **due booleani** `{wheelspin, lockup}`. Nessun accesso a Excalibur, nessuno
  stato: interfaccia stretta e stabile, testabile in isolamento.
- **Margine longitudinale**: internamente calcola `marginLong = √(max(0, (μ·Fz)² − fLat²))` — quanto
  cerchio resta per il longitudinale, data la domanda laterale. Riusa la stessa matematica del raggio
  `μ·Fz` del clamp esistente.
- **Dominanza (chi vince)**: confronta la trazione `|driveShare|` con la somma `brakeShare + fRoll`
  (le forze che si oppongono al moto). Se domina la trazione → candidato `wheelspin`; altrimenti →
  candidato `lockup`. L'attrito di rotolamento partecipa solo a **decidere la direzione** del
  longitudinale netto.
- **Gate (se alzare il flag)**: il flag candidato si alza **solo se l'attuatore da solo** supera il
  margine — `wheelspin` solo se `|driveShare| > marginLong` **e** la ruota è motrice; `lockup` solo se
  `brakeShare > marginLong`. L'`fRoll` **non** è un attuatore: da solo non alza mai un flag, quindi una
  scivolata puramente laterale a pedali rilasciati resta solo "saturazione laterale".
- **Combo ammessa**: il modello non impedisce che una ruota sia, nel medesimo frame, longitudinalmente
  satura (wheelspin/lockup) e lateralmente satura; quest'ultima resta espressa dal flag ombrello
  `saturated` già esistente.

### Modulo modificato — stato per ruota

- `WheelState` acquista due campi booleani `wheelspin` e `lockup` (default `false`), scritti a ogni
  frame dal system. Il flag `saturated` resta l'**ombrello** (qualsiasi saturazione del cerchio, anche
  solo laterale) e continua a essere la base per la colorazione HUD.

### Modulo modificato — orchestrazione (update system)

- Nel loop per-ruota di `PhysicDriveUpdateSystem`, **dopo** il clamp combinato (invariato), si chiama
  `longitudinalSaturation(...)` e si applica un **gate di velocità**: entrambi i flag sono azzerati se
  la velocità del veicolo è sotto `SKID_MIN_SPEED`. I valori risultanti sono scritti su `WheelState`.
- A fine update, il trigger del fumo passa da **legato al gas** a **legato allo slip**: per ogni ruota
  si chiama `setWheelSmoke(name, wheelspin || lockup)`. La vecchia chiamata
  `setEmitters('throttle', throttleTarget>0)` viene **sostituita**. Gli emitter `idle` (ambientali)
  restano invariati; il vecchio emitter `throttle` aggregato del `BaseVehicleActor` non è più pilotato
  dal nuovo flusso.
- **Nessun cambio alle forze**: `fx`/`fy`/`mz` integrati, guardia di standstill, aero al baricentro e
  scrittura di `vel` restano identici allo Step 4.

### Modulo modificato — attore fisico (effetti per-ruota)

- `PhysicVehicleActor` crea **4 emitter di fumo per-ruota** nel proprio `onInitialize` (dopo `super`),
  in una mappa chiavata per nome ruota (`frontLeftWheel`/`frontRightWheel`/`rearLeftWheel`/`rearRightWheel`),
  posizionati alle ruote nel frame muso-su (come l'emitter esistente). Espone un metodo
  `setWheelSmoke(name, enabled)` che alza/abbassa l'`emitRate` del relativo emitter.
- Gli emitter per-ruota vivono **solo** sul `PhysicVehicleActor`: `BaseVehicleActor` e il legacy
  `VehicleActor` non vengono toccati, a protezione della baseline Playwright.

### Modulo modificato — HUD di debug

- Nella cella per-ruota, `PhysicsDebugHud` aggiunge un **token corto** `WSP` (wheelspin) / `LCK`
  (lockup) / nessun token (saturazione solo laterale), con **colore distinto**: arancio per il
  wheelspin, rosso per il lockup, giallo per la saturazione solo laterale. Riusa la griglia 2×2 e i
  campi già mostrati (`μ`, `Fz`+barra, slip°, `Fx`).

### Modulo modificato — costanti generiche

- `physics.constants` acquista `SKID_MIN_SPEED` (~0.5 m/s): soglia di velocità sotto cui i flag di
  slittamento sono soppressi. Eventuale piccola banda morta/isteresi al bordo del cerchio resta un
  dettaglio locale, da introdurre solo se emerge sfarfallio in verifica.

### Conseguenze accettate

- Il gate di velocità su **entrambi** i flag implica **niente fumo a veicolo esattamente fermo**: si
  rinuncia al "burnout dal puro zero" in cambio di semplicità e simmetria. Mitigazione: tenere
  `SKID_MIN_SPEED` piccola, così su bassa aderenza il pattinamento appare subito dopo il lancio.
- I fenomeni **dovrebbero già emergere** coi parametri dello Step 4 (RWD: quota motrice posteriore
  ~4000 N contro raggio cerchio ~2600–3500 N → wheelspin al lancio, marcato su erba; quota frenante
  anteriore ~3600 N → lockup in frenata forte). Se troppo rari/frequenti, si interviene su grip
  superfici / `maxDriveForce` / `brakeForce`, senza ri-tarare il resto.

## Testing Decisions

- **Cosa rende buono un test qui**: verificare **comportamento esterno**, non dettagli implementativi.
  L'unica unità con logica non banale e priva di dipendenze framework è la funzione pura
  `longitudinalSaturation`: si testa la sua **tabella di verità** (input → `{wheelspin, lockup}`), non
  come è scritta internamente.
- **Modulo testato**: `longitudinalSaturation`, con test colocato (`.test.ts`) come le altre funzioni
  del service. Casi minimi:
  - trazione motrice oltre il margine → `wheelspin` true, `lockup` false;
  - freno oltre il margine (eventualmente con margine ridotto dal laterale, "freno in curva") →
    `lockup` true, `wheelspin` false;
  - solo attrito di rotolamento (gas/freno a zero, anche con margine nullo per laterale alto) →
    nessun flag;
  - ruota **non motrice** (`isDriven = false`) sotto trazione → mai `wheelspin`;
  - domanda longitudinale **sotto** il margine → nessun flag;
  - dominanza: con gas+freno insieme, vince il contributo maggiore (drive vs freno+rotolamento).
- **Prior art**: i test colocati già presenti in `vehicle-physics.service.test.ts` per funzioni pure
  analoghe (`clampToFrictionCircle`, `slipAngle`, `lateralForceLinear`, `distributeBrake`): stessa
  forma (input numerici → output atteso, niente mock di Excalibur).
- **Non testati automaticamente** (glue → verifica manuale dell'utente, coerente con la strategia del
  progetto): l'update system (orchestrazione/gate di velocità), gli emitter per-ruota e
  `setWheelSmoke`, il rendering HUD dei token/colori. Si verificano con la checklist manuale dello Step 5
  guidando nella scena dev (`START_SCENE='physics'`).

## Out of Scope

- **Slip ratio reale** con velocità angolare di ruota come stato: il pattinamento/bloccaggio resta in
  versione "clamp + flag". Esplicitamente rimandato.
- **Cambi di forza fisici** in funzione dei flag: nessun azzeramento esplicito del laterale in lockup,
  nessuna riduzione della trazione a una "frazione cinetica" in wheelspin. La perdita di
  sterzabilità/trazione resta emergente dal clamp combinato dello Step 4.
- **Audio**: non esiste alcuna risorsa sonora nel progetto; gli effetti sonori di slittamento sono
  fuori scope.
- **Fumo aggregato legacy**: non si modifica la coppia di emitter del `BaseVehicleActor` né il path del
  vecchio `VehicleActor` (baseline Playwright intatta).
- **Differenziali**, **usura gomme**, **carburante** e **statistiche metriche**: appartengono ad altri
  step (differenziali rimandati; usura/carburante/statistiche → Step 6).
- **Ri-taratura del modello** dello Step 4 (motore, aero, carichi, cornering stiffness): non si tocca.

## Further Notes

- Lo Step 5 sfrutta il fix **reverse-aware** dello `slipAngle` introdotto di recente: i flag risultano
  coerenti anche in retromarcia, senza saturazioni spurie andando dritti all'indietro.
- Coerenza interna garantita: poiché `marginLong = √((μ·Fz)² − fLat²)`, una saturazione longitudinale
  (`|fxLong| > marginLong`) implica sempre `saturated = true` dal clamp combinato; il caso "saturazione
  solo laterale" è quello in cui `saturated` è true ma nessun attuatore supera il proprio margine.
- I nuovi flag su `WheelState` sono pensati per essere **consumati dallo Step 6**: lo slittamento
  accelererà il consumo delle gomme, quindi `wheelspin`/`lockup` sono il punto di aggancio già pronto.
- "Definizione di done" coerente col piano: `npm run build` verde, `npm run test:unit` verde (nuovo
  `longitudinalSaturation`), checklist di verifica manuale soddisfatta, e baseline Playwright invariata
  con `START_SCENE='playground'`.