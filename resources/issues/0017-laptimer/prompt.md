```
/grill-me cerca di capire le relazioni tra @src/scenes/playground.scene.ts , @src/actors/vehicle.actor.ts , @src/models/race-data.model.ts , @src/models/vehicle-race-data.model.ts , @src/models/lap-time.model.ts e @src/actors/checkpoint.actor.ts . In particolare, CheckpointActor reagisce all'evento
'collisinstart': al momento riconosce la collisione con un VehicleActor. Per dare un contesto, si tratta di un gioco 2D in cui alcuni veicoli gareggiano in una pista, e per farle un giro valido devono passare attraverso tutti i checkpoint.
Devo ottenere i seguenti risultati:
- riconoscere quale VehicleActor è passato sul checkpoint (al momento un solo VehicleActor è presente, in futuro saranno di più). Per ora nessun VehicleActor è legato a nessun Player (anzi la classe Player proprio non esiste), ma bisogna trovare il modo di legarli e riconoscerli al passaggio
- normalmente un passaggio su un ckeckpoint aggiorna il `LapTime` segnando il  tempo del passaggio sul checkpoint
- se il checkpoint ha proprietà `name`==="finish-line" si tratta di un passaggio sul traguardo: devo verificare che tutti i checkpoint del giro corrente siano stati attraversati e, in caso positivo, segnare il giro come concluso e avviare un nuovo giro. Se non tutti i checkpoint sono stati attraversati, per ora lo segno in un `console.log`.
- alla conclusione di un giro, mostrare su `console.log` lo stato del giro appena terminato
- alla conclusione di un giro, mostrare su `console.log` i tempi di tutti i giri del Vehicle che ha appena concluso il giro
```

```
use /write-a-prd about the decisions just taken and listed in @resources/issues/0017/grill-me-out.md . Write the output file in the directory `resources/issues/0017/` 
```


```
usa /prd-to-plan per implementare il prd che trovi in @resources/issues/0017/prd.md
```

```
/implement-plan at @resources/issues/0017/plan.md
```
  
