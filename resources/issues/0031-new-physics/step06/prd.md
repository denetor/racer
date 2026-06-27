# PRD — Step 6: Usura, carburante, statistiche + switch della scena principale

> Deriva dalle decisioni in `step06/grill-me-out.md`, dalle specifiche finali in `specs.md`
> (§3.2 unità/statistiche metriche, §3.4 baricentro fisso, §3.5 cerchio `μ = grip · usura`, carburante
> al COG; §4 "Usura gomme"/"Massa e baricentro") e dalla struttura software esistente (post Step 5).
> Riguarda lo **Step 6** di `plan-steps.md`, ultimo step del piano.

## Problem Statement

Il modello a forze (post Step 5) è completo nella sua **dinamica veloce** — cerchio di aderenza,
trasferimento di carico, motore potenza-limitata, pattinamento/bloccaggio per ruota — ma vive ancora
**solo nella scena di sviluppo** (`PhysicsPlaygroundScene`, dietro `START_SCENE='physics'`), mentre la
scena di produzione (`PlaygroundScene`, fotografata dalla baseline Playwright) usa ancora il vecchio
modello cinematico. Inoltre mancano tre cose che il piano e le specifiche richiedono per chiudere il
modello:

1. **Dinamiche lente assenti.** Le gomme non si **consumano**: il grip non degrada mai, quindi una
   gara lunga non ha gestione gomme né penalità per chi guida sempre in scivolata. Il **carburante** è
   dichiarato sull'attore (`fuelMass`, `fuelCapacity`, `fuelBurn`) ma **inerte**: nessuno lo consuma,
   quindi la massa non cala mai e l'auto non diventa mai più leggera/reattiva nel tempo.
2. **Niente statistiche metriche.** Il valore di passare a SI era anche poter misurare grandezze reali
   (distanza percorsa, spazi di frenata): oggi non esiste alcun modello che le tenga, e l'unico dato
   metrico mostrato è la velocità in km/h derivata al volo.
3. **Switch non fatto.** Finché `main.ts` non promuove stabilmente il nuovo modello a scena principale,
   il lavoro dei cinque step precedenti non è "in produzione" e la baseline Playwright continua a
   coprire il vecchio modello.

## Solution

Aggiungere le due **dinamiche lente** mancanti e le **statistiche metriche**, poi **promuovere** il
nuovo modello a scena principale, tutto in **quattro fasi autoconsistenti** (build + unit test verdi,
verifica manuale guidando nella scena dev):

1. **Usura gomme.** Ogni gomma ha un `wear ∈ [0, 1]` (parte da `1.0`) che **cala con la distanza**
   percorsa dalla ruota, **più in fretta quando la ruota slitta** (satura il cerchio in qualunque
   direzione). Il grip effettivo diventa `μ_eff = grip_superficie · wear`, iniettato in **un solo
   punto** del loop per-ruota: cerchio più piccolo → la gomma consumata satura/scivola/blocca prima, in
   modo **emergente**. Un `floor` evita il grip-zero ingestibile.
2. **Carburante.** Il serbatoio si svuota in proporzione al gas, su **cadenza lenta** (accumulatore a
   soglia, non per-frame): `fuelMass` cala, e poiché la fisica usa già `getTotalMass = mass + fuelMass`
   come unico punto di verità, l'auto diventa **da sola** più leggera e reattiva. A serbatoio vuoto il
   **motore si spegne** (trazione a zero), chiudendo il loop.
3. **Statistiche metriche.** Un nuovo modello dedicato `VehicleStats`, testabile a tavolino, accumula
   la **distanza percorsa** e misura lo **spazio di frenata** (dall'inizio frenata fino alla fermata).
4. **Switch + ribaselina.** `main.ts` punta stabilmente a `'physics'`: la scena force-based diventa la
   principale, il vecchio `VehicleActor`/`DriveInputSystem`/helper restano **orfani** in repo come
   fallback. La baseline Playwright viene **rigenerata una sola volta** in un commit dedicato. La HUD di
   produzione resta — per ora — la `PhysicsDebugHud` (arricchita con usura/carburante/statistiche);
   adattare la dashboard da giocatore è debito UI rimandato.

Il filo conduttore: le tre feature sono **additive e a basso rischio** (nuove funzioni pure + campi di
stato + righe HUD, senza ri-tarare la dinamica veloce); lo switch è l'unico atto infrastrutturale e
resta **isolato e ultimo**.

## User Stories

### Usura gomme

1. Come **giocatore**, voglio che le gomme si **consumino guidando**, così su una gara lunga devo
   gestirle e non posso spingere all'infinito senza conseguenze.
2. Come **giocatore**, voglio che **guidare in scivolata/pattinamento consumi le gomme più in fretta**,
   così uno stile pulito viene premiato con gomme più durature.
3. Come **giocatore**, voglio che una gomma **consumata abbia meno grip** (sature/scivoli prima), così
   l'usura ha una conseguenza di guida percepibile e non solo un numero.
4. Come **giocatore**, voglio che l'usura sia **per singola ruota**, così l'asimmetria della guida (es.
   curve prevalenti in un senso) si rifletta su gomme diverse.
5. Come **giocatore**, voglio che, anche con gomme molto consumate, l'auto resti **guidabile** (grip
   residuo), così la sessione non diventa ingestibile su lunga distanza.
6. Come **sviluppatore della fisica**, voglio che il consumo sia legato alla **distanza** (km della
   ruota) e non al tempo, così è **indipendente dal frame-rate** e coerente con la statistica distanza.
7. Come **sviluppatore della fisica**, voglio che il consumo accelerato sia pilotato dal flag
   **`saturated`** (qualsiasi saturazione del cerchio), così anche una lunga derapata **laterale**
   consuma, non solo pattinamento/bloccaggio.
8. Come **sviluppatore della fisica**, voglio la logica di consumo in una **funzione pura testabile**,
   così posso verificarne i casi limite senza avviare il gioco.
9. Come **sviluppatore che tara la fisica**, voglio poter regolare il **rate di consumo per veicolo**
   (mescola gomma) e il **floor** come limite fisico condiviso, così veicoli diversi possono avere
   gomme diverse senza toccare il limite globale.

### Carburante

10. Come **giocatore**, voglio che il **serbatoio si svuoti guidando**, così la gestione carburante
    diventa parte della gara.
11. Come **giocatore**, voglio che il consumo dipenda dal **gas** (più a gas pieno, poco in rilascio),
    così la mia guida influenza l'autonomia.
12. Come **giocatore**, voglio che, scendendo il carburante, l'auto diventi **lievemente più leggera e
    reattiva**, così l'effetto è percepibile su lunga distanza.
13. Come **giocatore**, voglio che a **serbatoio vuoto il motore si spenga** (niente più trazione, ma
    sterzo e freno ancora attivi), così finire la benzina ha una conseguenza chiara.
14. Come **sviluppatore della fisica**, voglio che il consumo avvenga su **cadenza lenta** (non ogni
    frame), così resta coerente col principio "il carburante è fuori dalla fisica per-frame".
15. Come **sviluppatore della fisica**, voglio che la massa usata ovunque (carico statico, rolling
    resistance, integrazione) passi dall'**unico helper `getTotalMass`**, così il calo di carburante si
    riflette automaticamente in tutta la fisica senza duplicare il calcolo.

### Statistiche metriche

16. Come **sviluppatore che tara la fisica**, voglio vedere la **distanza percorsa** (km), così posso
    correlare usura e consumo ai chilometri.
17. Come **sviluppatore che tara la fisica**, voglio vedere l'**ultimo spazio di frenata** (m), così
    posso verificare l'effetto di carico/usura/superficie sulla frenata.
18. Come **sviluppatore che tara la fisica**, voglio che lo spazio di frenata sia misurato come **spazio
    d'arresto** (dall'inizio frenata fino alla fermata), così è una metrica significativa e confrontabile.
19. Come **sviluppatore della fisica**, voglio che, se rilascio il freno **prima di fermarmi**,
    l'episodio di frenata venga **scartato** (non salvato), così la metrica resta pulita.
20. Come **sviluppatore della fisica**, voglio le statistiche in un **modello dedicato e testabile**,
    separato dai dati di gara, così le metriche fisiche non si mescolano con giri/checkpoint.

### HUD di debug

21. Come **sviluppatore che tara la fisica**, voglio vedere l'**usura % per ruota** nella griglia 2×2,
    così controllo a colpo d'occhio quanto è consumata ogni gomma.
22. Come **sviluppatore che tara la fisica**, voglio che l'usura vicino al **floor** sia evidenziata
    (colore di allerta), così noto subito una gomma finita.
23. Come **sviluppatore che tara la fisica**, voglio una **riga carburante** (kg / %), così vedo il calo
    nel tempo.
24. Come **sviluppatore che tara la fisica**, voglio **righe distanza e ultimo spazio di frenata**, così
    leggo le statistiche mentre guido.

### Switch e produzione

25. Come **manutentore del progetto**, voglio che la scena **force-based diventi quella principale**
    (`main.ts` → `'physics'`), così il lavoro dei cinque step è effettivamente in produzione.
26. Come **manutentore del progetto**, voglio che il **vecchio modello resti in repo** come orfano
    (non rimosso), così posso usarlo come fallback/confronto.
27. Come **manutentore del progetto**, voglio rigenerare la **baseline Playwright una sola volta** in un
    **commit dedicato**, così il cambio di snapshot è isolato e facile da rivedere.
28. Come **manutentore del progetto**, voglio che lo switch **non riscriva né fonda le scene**, così si
    riduce il churn sulla scena già validata manualmente per cinque step.
29. Come **giocatore**, voglio che dopo lo switch la scena principale **guidi col nuovo modello**, così
    tutto il lavoro fisico è ciò che si gioca davvero.

### Trasversali

30. Come **manutentore del progetto**, voglio che ognuna delle quattro fasi sia **autoconsistente**
    (build + unit test verdi, verificabile guidando), così posso mergiarle e verificarle a una a una.
31. Come **sviluppatore della fisica**, voglio che usura/carburante/statistiche siano **additivi** e
    non ri-tarino la dinamica veloce dello Step 4/5, così non si riapre il modello già validato.

## Implementation Decisions

### Modulo nuovo — consumo usura (deep module, funzione pura)

- Una **funzione pura** nel `vehicle-physics.service` calcola la quota di usura consumata da una ruota
  in un frame, dato lo **spazio percorso dalla ruota**, se la ruota sta **slittando** (`saturated`), e i
  parametri di taratura (rate di consumo per-veicolo, penalità di slittamento). Interfaccia stretta,
  numerica, senza stato né dipendenze da Excalibur: input → `wearDelta`.
- Il consumo è **base ∝ distanza** moltiplicato per la penalità quando la ruota slitta
  (`saturated ? slipPenalty : 1`). L'applicazione (`wear = max(MIN_TYRE_WEAR, wear − wearDelta)`) avviene
  nell'orchestrazione.
- **Driver dello slittamento**: il flag **`saturated`** (sovrainsieme di `wheelspin`/`lockup`, include
  la saturazione puramente laterale). I flag dello Step 5 restano per gli effetti grafici.

### Modulo modificato — applicazione del grip effettivo (μ_eff)

- Nel loop per-ruota dell'update system, il `μ` passato a `clampToFrictionCircle` e a
  `longitudinalSaturation` diventa `grip_superficie · wear` (oggi è solo `grip_superficie`). È
  l'**unico punto** di iniezione: tutto il resto (saturazione, scivolata, bloccaggio anticipato della
  gomma consumata) emerge dal cerchio più piccolo, senza altri ritocchi.

### Modulo modificato — stato per ruota

- `WheelState` acquista `wear: number` (default `1.0`, gomma nuova), scritto a ogni frame
  dall'update system. **Non** si tocca il legacy `WheelFactor` (orfano col vecchio `VehicleActor`): il
  riferimento di `plan-steps.md` a `WheelFactor` è un refuso, il nuovo path usa `WheelState`.

### Modulo modificato — costanti generiche e datasheet veicolo

- `physics.constants` acquista `MIN_TYRE_WEAR` (~0.5–0.6): **floor** del grip residuo, limite fisico
  condiviso.
- `PhysicVehicleActor` acquista i parametri di **consumo gomma per-veicolo** (rate per km e penalità di
  slittamento), come parte del datasheet (modellano la mescola). Questo prepara mescole diverse per
  veicoli futuri.

### Modulo modificato — consumo carburante (orchestrazione, cadenza lenta)

- L'update system tiene un piccolo **accumulatore** (campo sull'attore) che somma `throttleInput · Δt`
  ogni frame; superata una **soglia di tempo** (≈0.5–1 s) applica il consumo a `fuelMass`
  (`burn = fuelBurn · throttle_accumulato`, clamp `≥ 0`) e azzera l'accumulatore. Così la massa **non**
  cambia ogni tick. Il parametro `fuelBurn` resta quello già presente sull'attore.
- **Gate motore a serbatoio vuoto**: quando `fuelMass ≤ 0`, la `F_drive` calcolata è azzerata (il gas
  diventa inefficace); sterzo, freno, aero e rolling resistance restano attivi. La massa minima resta
  `mass` (chassis).
- Nessun nuovo system né `Timer` Excalibur: il consumo vive nell'update system già esistente.

### Modulo nuovo — statistiche (deep module, modello testabile)

- Nuovo modello `VehicleStats` (in `models/`), referenziato dal `PhysicVehicleActor`, con test colocati.
  Tiene: `distanceTraveled` (m), lo stato dell'**episodio di frenata corrente** e `lastBrakingDistance`
  (m).
- La logica vive in **metodi del modello**, chiamati dall'update system con lo stato SI:
  - **Distanza**: accumula `|vel| · Δt` ogni frame.
  - **Spazio di frenata**: l'episodio **inizia** quando `brakeInput > 0` e la velocità è sopra una
    soglia; accumula la distanza finché l'auto scende sotto una soglia di velocità (**fermata**) →
    salva `lastBrakingDistance`. Se il freno viene **rilasciato prima** della fermata, l'episodio si
    **scarta**.
- La velocità in km/h resta derivata al volo dallo stato (`hypot(velBody) · 3.6`), non è memorizzata.
- Mantiene le metriche fisiche **separate** dai dati di gara (`VehicleRaceData`, che resta com'è).

### Modulo modificato — HUD di debug

- `PhysicsDebugHud` aggiunge: (a) `wear NN%` nella **cella per-ruota** della griglia 2×2, con colore di
  allerta vicino a `MIN_TYRE_WEAR`; (b) una **riga carburante** (`fuel: NN.N kg` / %); (c) **righe
  statistiche** (`dist: N.N km`, `brake: N.N m`). Va aumentata `HUD_HEIGHT`; la HUD resta `cache:false`.

### Modulo modificato — bootstrap / switch

- `main.ts`: `START_SCENE` impostata stabilmente a `'physics'` (la scena force-based diventa la
  principale). Il commento "MUST stay 'playground'" va aggiornato di conseguenza.
- `PlaygroundScene`, `VehicleActor`, `DriveInputSystem`, gli helper di `math.service` non più usati,
  `DrivingDashboardActor` + applet pedali/accelerazione **restano in repo** come orfani (nessuna
  rimozione in questo step).
- La HUD di produzione resta la `PhysicsDebugHud` (la `DrivingDashboard` è incompatibile col nuovo
  attore — legge `acceleration`/`accelerationFullScale` assenti — e il suo adattamento è rimandato).

### Conseguenze accettate

- La scena di produzione mostra una **HUD di debug** invece di una dashboard da giocatore: accettabile
  finché il modello è in collaudo, ma è **debito UI dichiarato**.
- **Naming invertito**: dopo lo switch la scena di produzione è `'physics'` (`PhysicsPlaygroundScene`) e
  `'playground'` è l'orfana. Rinomina/pulizia rimandata (coerente col "non rimuovere il vecchio codice
  ora").
- La baseline Playwright sarà rigenerata solo per **`chromium-linux`** (container linux); lo snapshot
  **`win32`** resta stale finché non lo rigenera un ambiente Windows/CI.

## Testing Decisions

- **Cosa rende buono un test qui**: verificare il **comportamento esterno** (input → output atteso), non
  i dettagli implementativi. Le unità con logica non banale e priva di dipendenze framework sono due:
  la **funzione pura di consumo usura** e il **modello `VehicleStats`**.
- **Moduli testati**:
  - **Usura (funzione pura)**, test colocato in `vehicle-physics.service.test.ts` come le altre funzioni
    a forze. Casi minimi: consumo base proporzionale alla distanza; consumo **maggiore** quando
    `saturated` (penalità applicata); distanza zero → delta zero; coerenza dell'applicazione col **floor**
    (`max(MIN_TYRE_WEAR, …)`, non scende sotto).
  - **`VehicleStats` (modello)**, test colocato (`vehicle-stats.model.test.ts`). Casi minimi: accumulo
    distanza su più frame; episodio di frenata da velocità alta fino alla fermata → `lastBrakingDistance`
    salvato; rilascio freno prima della fermata → episodio **scartato** (nessun salvataggio); avvio
    freno sotto la soglia di velocità → nessun episodio; episodi multipli in sequenza.
- **Prior art**: i test colocati già presenti in `vehicle-physics.service.test.ts` (per
  `clampToFrictionCircle`, `slipAngle`, `longitudinalSaturation`, …) e in `vehicle-race-data.model.test.ts`
  per i modelli — stessa forma (input → output atteso, niente mock di Excalibur).
- **Non testati automaticamente** (glue → **verifica manuale dell'utente**, coerente con la strategia
  del progetto e con la memoria "manual verification by user"): l'orchestrazione nell'update system
  (iniezione `μ_eff`, accumulatore carburante, gate motore, chiamate a `VehicleStats`), il consumo
  carburante a cadenza, il rendering HUD delle nuove righe/celle, e lo switch di scena. Si verificano
  con la checklist manuale dello Step 6 guidando nella scena dev.
- **Definizione di done** per ogni fase: `npm run build` verde; `npm run test:unit` verde (nuovi test
  delle funzioni/modelli puri); checklist di verifica manuale soddisfatta. Per la fase 4 si aggiunge la
  ribaselina Playwright (`npm run test:integration-update`) e il commit dei PNG.

## Out of Scope

- **Adattamento della `DrivingDashboard`** (e degli applet pedali/accelerazione) al nuovo attore:
  rimandato; in produzione resta la `PhysicsDebugHud`.
- **Rinomina/riorganizzazione delle scene** (`physics` ↔ `playground`) e **rimozione del codice orfano**
  (`VehicleActor`, `DriveInputSystem`, helper morti di `math.service`, `DrivingDashboard`/applet):
  decisione futura, non in questo step.
- **Snapshot Playwright `win32`**: non rigenerabile nel container linux; resta stale.
- **Slip ratio reale** (velocità angolare di ruota come stato): il pattinamento resta in versione
  "clamp + flag"; l'usura si aggancia ai flag esistenti.
- **Differenziali** (split 50/50 resta).
- **Spostamento del baricentro col carburante**: il carburante è concentrato **al COG** e cala solo la
  **massa totale** (semplificazione voluta); non altera il bilanciamento né i bracci `r_i`.
- **Consumo carburante legato alla potenza erogata** o **audio** di qualsiasi tipo (nessuna risorsa
  sonora nel progetto).
- **Ri-taratura della dinamica veloce** (motore, aero, carichi, cornering stiffness, cerchio): non si
  tocca; usura/carburante/statistiche sono additivi.

## Further Notes

- **Punto di aggancio già pronto.** Lo Step 5 ha lasciato su `WheelState` i flag `saturated`/`wheelspin`/
  `lockup` proprio in vista dello Step 6: l'usura accelerata vi si aggancia senza nuove letture fisiche.
- **`getTotalMass` come collante.** Il consumo carburante funziona "gratis" sulla fisica perché
  `totalMass = getTotalMass(mass, fuelMass)` è già l'unico punto di verità usato da carico statico,
  rolling resistance e integrazione: basta far calare `fuelMass`.
- **Determinismo.** Consumo usura legato ai **metri** e spazio di frenata legato alla **distanza** sono
  indipendenti dal frame-rate; il carburante a soglia di tempo è coerente col `fixedUpdateFps: 60` già
  attivo. Nessun cambio al loop di engine richiesto.
- **Ordine delle fasi** (come da decisione di fasatura): 1) usura → 2) carburante → 3) statistiche →
  4) switch + ribaselina. Lo switch infrastrutturale resta isolato e ultimo, separato dalle tre feature
  additive.
- Questo è l'**ultimo step** del piano `plan-steps.md`; dopo, il nuovo modello è in produzione e
  restano aperti solo gli elementi esplicitamente "Out of Scope" / "Rimandato".