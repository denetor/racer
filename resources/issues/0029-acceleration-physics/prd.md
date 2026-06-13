# PRD — Grip e traiettoria pilotati da `acceleration.y` (Issue #29)

## Problem Statement

Il modello fisico del veicolo calcola lo spostamento di grip tra assale anteriore e posteriore
a partire da una proprietà dedicata, `weightTransfer`, che è una grandezza astratta
ricavata direttamente dagli input dei pedali (`throttleInput - brakeInput`) e lisciata nel
tempo. Questo significa che il gioco mantiene **due rappresentazioni separate** dello stesso
fenomeno fisico: da un lato `weightTransfer`, dall'altro l'accelerazione longitudinale reale
`acceleration.y` (già calcolata ogni frame e già usata dall'indicatore di accelerazione in
plancia). Le due grandezze possono divergere, sono ridondanti e rendono la fisica più difficile
da capire e da mantenere.

Si vuole eliminare `weightTransfer` e far derivare il bilancio di grip dall'accelerazione
longitudinale effettiva del veicolo, così che esista **una sola sorgente di verità** per
"quanto sta accelerando/frenando l'auto in questo istante".

## Solution

Il calcolo di grip e traiettoria in `DriveInputSystem` usa `acceleration.y` (l'accelerazione
longitudinale reale, in px/s²) come misura del trasferimento di carico, normalizzandola in
[-1, 1] tramite un fondo scala configurabile sul veicolo (`accelerationFullScale`, default 800).
Il valore normalizzato istantaneo alimenta direttamente il calcolo dei fattori di grip
anteriore/posteriore: niente più lisciamento dedicato, niente più variabile di stato separata.

Tutti i riferimenti a `weightTransfer` vengono rimossi da `DriveInputSystem` e da
`VehicleActor`. Il fondo scala 800, oggi duplicato come costante nell'indicatore di
accelerazione della plancia, diventa una proprietà del veicolo letta sia dalla fisica sia dalla
UI, eliminando la duplicazione.

Dal punto di vista del giocatore l'auto continua a comportarsi in modo arcade plausibile:
accelerando il grip si sposta al posteriore, frenando si sposta all'anteriore. Cambiano alcune
sfumature di feeling (lo spostamento in accelerazione è più tenue di quello in frenata, e a
velocità massima il bilancio torna neutro), conseguenze accettate del modello basato
sull'accelerazione.

## User Stories

1. Come giocatore, voglio che frenando il grip si sposti sull'avantreno, così che la frenata
   risulti incisiva e l'auto si pianti in ingresso curva.
2. Come giocatore, voglio che accelerando il grip si sposti sul retrotreno, così che in uscita
   curva l'auto reagisca in modo coerente con la trazione.
3. Come giocatore, voglio che il bilancio di grip dipenda da quanto l'auto sta realmente
   accelerando/frenando in quell'istante, così che la guida risponda alla dinamica effettiva e
   non a un valore astratto.
4. Come giocatore, voglio che a velocità massima (quando l'auto non accelera più) il bilancio di
   grip sia neutro, così che il comportamento in curva al limite sia prevedibile.
5. Come giocatore, voglio che l'indicatore di accelerazione in plancia e la fisica del grip
   usino lo stesso riferimento di fondo scala, così che ciò che vedo sull'accelerometro sia
   coerente con come si comporta l'auto.
6. Come sviluppatore, voglio una sola grandezza che rappresenti il trasferimento di carico
   longitudinale, così da non dover mantenere sincronizzate due rappresentazioni ridondanti.
7. Come sviluppatore, voglio che la normalizzazione dell'accelerazione in carico [-1, 1] sia una
   funzione pura e testabile, così da poterne verificare clamp e segno in isolamento.
8. Come sviluppatore, voglio che il fondo scala dell'accelerazione sia una proprietà del
   veicolo, così da poterlo regolare per-veicolo e da non duplicarlo tra fisica e UI.
9. Come sviluppatore, voglio che i nomi nel codice riflettano il nuovo modello (carico
   longitudinale anziché weight transfer), così che il codice sia auto-esplicativo e privo di
   terminologia ormai fuorviante.
10. Come sviluppatore, voglio rimuovere il codice di lisciamento e la variabile di stato non più
    necessari, così da ridurre la superficie del system e i parametri da tarare.
11. Come tester, voglio che la suite di unit test resti verde dopo la rinomina e l'aggiunta del
    nuovo helper, così da avere fiducia che il refactoring non abbia rotto comportamenti attesi.

## Implementation Decisions

### Modello del carico longitudinale

- Il trasferimento di carico non è più ricavato dai pedali ma dall'**accelerazione
  longitudinale reale** `acceleration.y` (px/s²), già calcolata ogni frame in
  `updateAcceleration()` prima di `applyKinematics` (ordine già corretto, da preservare).
- La normalizzazione è `clamp(acceleration.y / accelerationFullScale, -1, 1)`, con
  `accelerationFullScale = 800`.
- Si usa il **valore istantaneo**: nessun lisciamento temporale, nessuna nuova variabile di
  stato persistente sull'actor.
- Il segno di `acceleration.y` è usato **grezzo**, inclusa la retromarcia (dove
  `computeLongitudinalAcceleration` già inverte il segno). Nessun caso speciale su `isReverse`.

### Modulo: servizio matematico (deep module, puro e testabile)

- Nuova funzione pura `computeLongitudinalLoad(accelY, fullScale)` che restituisce il carico
  normalizzato e clampato in [-1, 1].
- La funzione di calcolo dei fattori di grip rinomina il primo parametro da `weightTransfer` a
  `longitudinalLoad` (e la variabile interna correlata in `effectiveLoad`); comportamento
  numerico invariato.

### Modulo: stato del veicolo

- Rimozione delle proprietà `weightTransfer` e `weightTransferRate`.
- Rinomina di `weightTransferStrength` (guadagno del trasferimento, valore 0.4 invariato) in
  `loadTransferStrength`.
- Aggiunta della proprietà `accelerationFullScale` (default 800), usata dalla fisica per
  normalizzare e letta dalla UI come fondo scala.

### Modulo: system di input/guida

- Rimozione del passo di aggiornamento del weight transfer (metodo dedicato e relativa chiamata
  nel ciclo di update).
- Nel calcolo della cinematica, il carico longitudinale è ottenuto invocando
  `computeLongitudinalLoad` con l'accelerazione corrente e il fondo scala del veicolo, e passato
  al calcolo dei fattori di grip insieme a `loadTransferStrength`.
- Pulizia degli import: rimozione di quelli divenuti inutilizzati, aggiunta del nuovo helper.

### Modulo: indicatore di accelerazione (UI plancia)

- Il fondo scala diventa un parametro in ingresso alla funzione che mappa l'accelerazione
  all'offset del puntino, anziché una costante di modulo.
- L'actor dell'indicatore legge il fondo scala dalla proprietà del veicolo.
- Rimozione della costante locale `ACCEL_FULL_SCALE`, eliminando la duplicazione del valore 800.

## Testing Decisions

Un buon test verifica il **comportamento esterno** di un'unità (input → output osservabile),
non i dettagli implementativi. Per questa feature i candidati naturali sono le funzioni pure del
servizio matematico, che non dipendono dall'engine, dal tempo o dallo stato globale e producono
output deterministici.

- **`computeLongitudinalLoad`** — nuovo test dedicato: segno preservato per accelerazione
  positiva/negativa, clamp a +1 e -1 oltre il fondo scala, zero a accelerazione nulla,
  proporzionalità entro il range. Prior art: i test già esistenti per
  `computeLongitudinalAcceleration` e `computeGripFactors` nel test del servizio matematico
  seguono esattamente questo stile (casi tabellari su funzione pura).
- **Funzione dei fattori di grip** — aggiornare il test esistente alla nuova nomenclatura del
  parametro (`longitudinalLoad`); il comportamento numerico è invariato, quindi gli assert
  restano validi a meno dei nomi/commenti.
- **Indicatore di accelerazione** — aggiornare i test della funzione di mapping per passare il
  fondo scala come parametro, incluso il caso di clamp di un valore oltre il fondo scala. Prior
  art: il file di test già esistente dell'indicatore.

Non si introducono nuovi test sul `system` (logica di orchestrazione legata all'engine e
all'input, coperta indirettamente dagli screenshot test di integrazione).

## Out of Scope

- Modellazione del carico laterale (`acceleration.x`): resta a 0 come oggi.
- Lisciamento/filtraggio dell'accelerazione longitudinale: esplicitamente escluso (si usa il
  valore istantaneo).
- Replica esatta del vecchio feeling: si accettano le differenze indotte dal nuovo modello
  (spostamento in accelerazione più tenue, bilancio neutro a velocità massima, comportamento in
  retromarcia diverso da prima).
- Modifiche al modello di accelerazione longitudinale stesso (`computeLongitudinalAcceleration`,
  `computeSpeed`) oltre a quanto serve per consumarne l'output.
- Aggiornamento delle baseline degli screenshot di integrazione: da valutare a valle se la
  dinamica modifica il rendering, non parte centrale di questa PRD.

## Further Notes

- **Conseguenze di feeling note e accettate** (derivanti dal fondo scala 800 e dall'uso del
  valore istantaneo): a tutto gas l'accelerazione (~500 px/s²) mappa a un carico ~0.625, mentre
  in frenata (~-1600 px/s²) satura a -1; lo spostamento di grip in accelerazione è quindi più
  debole di quello in frenata. A velocità massima `acceleration.y → 0`, quindi il bilancio di
  grip torna neutro (col vecchio modello restava sbilanciato al posteriore tenendo il gas).
- **Ordine di esecuzione**: il calcolo dell'accelerazione avviene già prima dell'applicazione
  della cinematica; va preservato perché il carico longitudinale dipende dall'`acceleration.y`
  del frame corrente.
- **Tarabilità**: `accelerationFullScale` e `loadTransferStrength` restano i due parametri per
  regolare l'intensità dell'effetto sul grip.
- **Verifica finale suggerita**: esecuzione degli unit test; eventuale aggiornamento delle
  baseline degli screenshot se necessario.
