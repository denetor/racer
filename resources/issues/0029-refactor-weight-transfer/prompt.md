```md
/grill-me analizza la modifica di @src/actors/vehicle.actor.ts e di @src/systems/drive-input.system.ts in modo da aggiungere 
a VehicleActor una proprietà `acceleration` di tipo `Vector` che contiene l'accelerazione corrente in senso longitudinale 
e in senso laterale (rispettivamente componente y e x).
Al momento ignoriamo la componente laterale e la teniamo a 0.
Il valore `y` di `acceleration` (l'accelerazione longitudinale) sarà derivata dalla differenza di velocità rispetto al frame precedente, 
quindi va aggiunta anche le proprietà `previousSpeed` a VehicleActor.
Ricorda che la velocità del veicolo è calcolata, in DriveInputSystem come numero sempre positivo, e quindi `previousSpeed` va
moltiplicata per -1 quando è ingranata la retromarcia.

Alla fine scrivi l'output nel file @resources/issues/0029-refactor-weight-transfer/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0029-refactor-weight-transfer/grill-me-out.md . Write the output file in the directory `resources/issues/0029-refactor-weight-transfer/`
```

```
usa /prd-to-plan con il prd che trovi in @resources/issues/0029-refactor-weight-transfer/prd.md
```


```
/implement-plan at @resources/issues/0029-refactor-weight-transfer/plan-longitudinal-acceleration.md
```

