## Problem Statement

La fisica attuale del veicolo controllato dal giocatore allinea sempre il vettore velocità all'heading frame per frame, producendo un comportamento "su binari": l'auto risponde in modo identico indipendentemente da come si frena, accelera o si sterza. Non esiste alcuna simulazione del trasferimento di carico, quindi mancano due sensazioni fondamentali della guida:

- **Sottosterzo in accelerazione**: il peso si sposta sul retrotreno, riducendo il grip anteriore e facendo "allargare" la traiettoria.
- **Sovrasterzo in staccata + gas**: frenando in curva il peso va sull'avantreno (sterzo più mordace); se si "tira il gas" di scatto, il baricentro torna indietro durante la transizione e il retrotreno può sgusciare.

In aggiunta, l'input di acceleratore e freno è binario (on/off), il che elimina ogni sensazione di peso e progressività nel guidare.

## Solution

Simulare lo spostamento del baricentro tramite due variabili di stato smoothed — `throttleInput` e `brakeInput` — che si muovono gradualmente tra 0 e 1 con rate asimmetrici (pressione/rilascio separati, come già accade per lo sterzo). Da esse si ricava `weightTransfer ∈ [-1, +1]` (negativo = carico in avanti / frenata, positivo = carico indietro / accelerazione), anch'esso smoothed per simulare l'inerzia della scocca.

Il weight transfer, smorzato quadraticamente con la velocità, genera due fattori di grip indipendenti:

- **`frontGrip`** (può superare 1.0 fino a `frontGripCap`): scala l'angolo di sterzata effettivo. In frenata il muso "tira" più forte; in accelerazione lo sterzo è meno efficace.
- **`rearGrip` ∈ [0, 1]**: scala il fattore lerp con cui il vettore velocità si avvicina a `heading × speed`. Con basso rearGrip il retrotreno "sguscia": la velocità non segue immediatamente l'heading, producendo un angolo di deriva visibile.

Entrambi i fattori si moltiplicano con il grip di superficie già esistente, così su asfalto bagnato o erba gli effetti di trasferimento di carico sono ulteriormente amplificati.

## User Stories

1. Come giocatore, voglio che l'auto sottosterzi moderatamente quando accelero in curva, così percepisco il peso che si sposta sul retrotreno e devo dosare il gas.
2. Come giocatore, voglio che l'auto abbia più presa anteriore in frenata, così posso usare la staccata per fare girare l'auto in modo più deciso.
3. Come giocatore, voglio che il retrotreno perda aderenza se "telegrafo" il gas dopo una frenata in curva, così devo essere preciso nel timing tra freno e acceleratore.
4. Come giocatore, voglio che la risposta di acceleratore e freno sia progressiva (non on/off), così la guida si sente pesante e credibile.
5. Come giocatore, voglio che il rilascio del pedale sia più rapido della pressione, così i cambi rapidi di input abbiano conseguenze fisiche distinte.
6. Come giocatore, voglio che gli effetti di sovrasterzo e sottosterzo si riducano ad alta velocità, così l'auto rimane governabile in rettilineo.
7. Come giocatore, voglio che su superfici scivolose (erba, ghiaia) il trasferimento di carico abbia un effetto maggiore, così la superficie di guida influenza davvero il comportamento dell'auto.
8. Come giocatore, voglio che l'auto rimanga guidabile anche a parametri estremi di weight transfer, così il gioco sia divertente e non frustrante.
9. Come game designer, voglio configurare `weightTransferStrength`, `frontGripCap` e `baseLerpFactor` per veicolo, così posso creare auto con caratteri di guida diversi (sportiva nervosa, berlina stabile, ecc.).
10. Come game designer, voglio configurare i rate di pressione/rilascio di ogni pedale per veicolo, così posso simulare differenze di impianto frenante e potenza motore.
11. Come game designer, voglio che `baseLerpFactor` sia parametrizzabile per veicolo, così posso creare auto naturalmente "vivaci" sul retrotreno o naturalmente stabili.
12. Come game designer, voglio che il sistema di weight transfer funzioni correttamente su tutte le superfici già definite (asfalto, erba), senza richiedere configurazione aggiuntiva per superficie.

## Implementation Decisions

### Moduli modificati

**VehicleActor** — aggiunta di nuove proprietà pubbliche di stato e di tuning:

| Proprietà | Default | Descrizione |
|---|---|---|
| `throttleInput` | 0 | Stato smoothed del pedale acceleratore [0, 1] |
| `brakeInput` | 0 | Stato smoothed del pedale freno [0, 1] |
| `throttlePressRate` | 2.0 | Velocità di pressione acceleratore (1/s → 0.5s per arrivare a 1.0) |
| `throttleReleaseRate` | 4.0 | Velocità di rilascio acceleratore (1/s → 0.25s per tornare a 0) |
| `brakePressRate` | 2.0 | Velocità di pressione freno (1/s) |
| `brakeReleaseRate` | 4.0 | Velocità di rilascio freno (1/s) |
| `weightTransfer` | 0 | Stato smoothed del trasferimento di carico [-1, +1] |
| `weightTransferRate` | 3.0 | Velocità di spostamento del baricentro (1/s) |
| `weightTransferStrength` | 0.4 | Intensità dell'effetto sul grip dei due assi |
| `frontGripCap` | 1.5 | Limite superiore di frontGrip (consente grip anteriore aumentato in frenata) |
| `baseLerpFactor` | 0.5 | Fattore base del lerp vel → heading (0 = deriva totale, 1 = istantaneo) |

Proprietà rimossa: `understeerSpeedStrength` (ridondante con il nuovo speed dampening quadratico).
Proprietà mantenuta: `understeerAngleStrength` (limite fisico indipendente dal carico sull'asse).

**DriveInputSystem** — nuovi metodi privati e modifica di quelli esistenti:

- `updatePedalInputs(drivable, input, dt)` — muove `throttleInput` e `brakeInput` verso il target booleano con i rispettivi press/release rate; i booleani `input.accelerating`/`input.braking` rimangono usati solo per trigger UI (emitters di fumo).
- `updateWeightTransfer(drivable, dt)` — calcola il target come `throttleInput - brakeInput` (clampato a [-1, 1]) e muove `weightTransfer` verso il target con `weightTransferRate`.
- `computeSpeed` (modificato) — usa `throttleInput` e `brakeInput` al posto dei booleani per scalare le forze di accelerazione e frenata; la forza è ora proporzionale alla posizione del pedale.
- `applyKinematics` (modificato):
  - Rimuove il fattore `speedFactor` basato su `understeerSpeedStrength`.
  - Calcola `speedDampening = 1 - (speed / maxSpeed)²` e `effectiveWT = weightTransfer × speedDampening`.
  - Calcola `frontGrip = clamp(1 - effectiveWT × strength, 0, frontGripCap)`.
  - Calcola `rearGrip = clamp(1 + effectiveWT × strength, 0, 1)`.
  - `effectiveSteering = steeringAngle × angleFactor × surfaceGrip × frontGrip`.
  - Sostituisce l'assegnazione diretta di `vel` con un lerp: `vel = lerp(vel, heading × speed, baseLerpFactor × rearGrip × surfaceGrip)`.
  - L'aggiornamento della posizione dal rear axle rimane invariato.

### Interazioni tra sistemi

- Il grip di superficie (`WheelFactor.grip`) e i fattori di weight transfer sono **moltiplicativi**: su superfici a bassa aderenza (erba, grip 0.5) l'effetto del trasferimento di carico è amplificato, rendendo il sovrasterzo più facile da provocare.
- L'ordine di chiamata in `update()` diventa: `updatePedalInputs` → `updateWeightTransfer` → `computeSpeed` → `applyKinematics`.

### Invarianti

- Con `throttleInput = 0` e `brakeInput = 0`, `weightTransfer` converge a 0, `frontGrip = 1`, `rearGrip = 1`: comportamento identico all'attuale in condizioni di crociera.
- A velocità massima, `speedDampening = 0`: il trasferimento di carico non ha effetto, l'auto si comporta come prima in rettilineo.

## Testing Decisions

**Cosa rende un buon test**: testare il comportamento osservabile dall'esterno del modulo, non i dettagli implementativi interni. I test devono verificare che dati input di stato definiti producano output di stato attesi, senza fare assert su variabili intermedie.

**Moduli da testare con unit test**:

- Logica di smoothing dei pedali: dato `throttleInput` corrente, un delta e i rate, verificare che `throttleInput` avanzi correttamente verso 0 o 1 con i rate di pressione/rilascio.
- Logica di weight transfer: dato `throttleInput`, `brakeInput` e `weightTransferRate`, verificare che `weightTransfer` converga al target atteso in tempi coerenti con il rate.
- Calcolo di `frontGrip` e `rearGrip`: dati valori noti di `weightTransfer`, `weightTransferStrength`, `frontGripCap` e `speedDampening`, verificare che i valori calcolati siano clampati correttamente e rispettino i cap.

**Prior art**: i test unitari esistenti in `src/models/vehicle-race-data.model.test.ts` mostrano il pattern da seguire (Jest, classi TypeScript testate in isolamento).

**Moduli non da testare con unit test** (coperti da test di integrazione Playwright esistenti):
- Il comportamento visivo del veicolo in scena non richiede nuovi test di integrazione per questa feature.

## Out of Scope

- Simulazione per-pneumatico (forze laterali reali su ogni ruota).
- Trasferimento di carico laterale (in curva), che richiederebbe un asse Y separato.
- Effetti visivi legati al sovrasterzo/sottosterzo (scie di gomma, fumo aggiuntivo dal retrotreno).
- Fisica dei veicoli NPC/AI.
- Feedback aptico o sonoro legato al trasferimento di carico.
- Sovrasterzo da potenza eccessiva su ruote motrici posteriori (wheel spin puro).

## Further Notes

Il parametro più sensibile al tuning sarà `weightTransferStrength`: valori oltre 0.5 rischiano di rendere il sovrasterzo molto difficile da controllare, specialmente su erba. Si consiglia di partire da 0.3–0.4 e aumentare gradualmente durante il playtesting.

Il `baseLerpFactor = 0.5` è un punto di partenza intermedio: se il retrotreno risulta troppo instabile anche in assenza di weight transfer, abbassare `rearGrip` di default significa che anche `baseLerpFactor` andrà alzato per compensare.

Il comportamento del "telegrafo" (frenata → gas in curva) emerge naturalmente dal modello senza logica speciale: durante la frenata il retrotreno è già instabile (basso `rearGrip`), e quando il gas sposta il target di `weightTransfer` verso +1 l'heading continua a puntare dentro la curva mentre la velocità recupera con ritardo, producendo l'yaw visibile.
