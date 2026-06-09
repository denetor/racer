# Piano di refactoring: DriveInputSystem.update()

## Obiettivo

Scomporre il metodo `update()` in metodi privati, uno per ogni responsabilità distinta, per migliorare la leggibilità e la navigabilità del codice.

## Analisi del metodo attuale

Il metodo `update()` (87 righe) contiene cinque blocchi logici distinti, attualmente separati solo da commenti:

| Blocco | Righe | Responsabilità |
|--------|-------|----------------|
| Lettura input | 37–45 | Rileva i tasti premuti e gestisce il cambio marcia retromarcia |
| Sterzo | 48–58 | Aggiorna l'angolo di sterzata o il ritorno al centro |
| Effetti visivi | 61–65 | Abilita/disabilita l'emitter del fumo sul gas |
| Velocità | 68–71 | Calcola la nuova magnitudine della velocità |
| Cinematica | 74–84 | Aggiorna heading, velocità e posizione (modello bicicletta) |

## Refactoring proposto

Estrarre ciascun blocco in un metodo privato, passando i parametri necessari. Il metodo `update()` diventa un orchestratore leggibile.

### Struttura finale di `update()`

```typescript
public update(delta: number) {
    if (!this.query?.entities?.length) return;
    const drivable = this.query.entities[0] as VehicleActor;
    if (!drivable) return;

    const keyboard = this._engine.input.keyboard;
    const input = this.readInput(keyboard);

    this.handleReverseToggle(drivable, input);
    this.updateSteeringAngle(drivable, input, delta);
    this.updateThrottleEffects(drivable, input);
    const speed = this.computeSpeed(drivable, input, delta);
    this.applyKinematics(drivable, speed, delta);
}
```

### Metodi da estrarre

#### 1. `readInput(keyboard)` → `InputState`

Legge tutti i tasti in un unico punto e restituisce un oggetto dati semplice.

```typescript
private readInput(keyboard: Keyboard): InputState {
    return {
        accelerating: keyboard.isHeld(...),
        braking:      keyboard.isHeld(...),
        steeringLeft:  keyboard.isHeld(...),
        steeringRight: keyboard.isHeld(...),
        reversePressed: keyboard.wasPressed(...),
    };
}
```

Definire `InputState` come interfaccia locale nel file (non serve un file separato data la semplicità).

#### 2. `handleReverseToggle(drivable, input)`

Gestisce l'attivazione/disattivazione della retromarcia. Contiene il guard `speed === 0` già presente.

#### 3. `updateSteeringAngle(drivable, input, delta)`

Aggiorna `drivable.steeringAngle`: incremento per input attivo, ritorno al centro per input assente.

#### 4. `updateThrottleEffects(drivable, input)`

Abilita o disabilita l'emitter `'throttle'` in base a `input.accelerating`.

#### 5. `computeSpeed(drivable, input, delta)` → `number`

Calcola e restituisce la nuova magnitudine della velocità (accelerazione, frenata, attrito, clamp min/max). Non muta direttamente `drivable`; il risultato viene passato ad `applyKinematics`.

#### 6. `applyKinematics(drivable, speed, delta)`

Applica il modello cinematico della bicicletta: calcolo di `effectiveSteering`, `deltaTheta`, aggiornamento di `drivable.heading`, `drivable.vel` e `drivable.pos`.

## Passi di implementazione

1. Definire l'interfaccia `InputState` sopra la classe.
2. Estrarre `readInput()` e verificare che i test esistenti passino.
3. Estrarre `handleReverseToggle()`.
4. Estrarre `updateSteeringAngle()`.
5. Estrarre `updateThrottleEffects()`.
6. Estrarre `computeSpeed()`.
7. Estrarre `applyKinematics()`.
8. Semplificare `update()` nella forma orchestratore mostrata sopra.
9. Eseguire `npm run test:unit` e `npm run test:integration` per verificare nessuna regressione.

Ogni passo è un commit autonomo e verificabile.

## Cosa non cambia

- Nessuna modifica alla logica di fisica o ai parametri del veicolo.
- Nessuna modifica alle interfacce pubbliche di `DriveInputSystem`.
- Nessuna ottimizzazione delle prestazioni.