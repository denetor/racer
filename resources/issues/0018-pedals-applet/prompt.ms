```
/grill-me aggiungi, a DrivingDashboardActor, un child Actor chiamato PedalsAppletActor che mostra, in tempo reale, la posizione corrente dei pedali premuti nel veicolo del giocatore.
L'actor sarà largo e alto come l'altezza di DrivingDashboardActor senza 8 pixel di margine per ciascun lato.
L'actor si posiziona come primo elemento a sinistra nell'actor padre.
Gli indicatori di posizione saranno due barrette verticali gialle alte come l'itero applet quando il pedale è premuto del tutto, e alte 0 pixel quando il pedale non è premuto
Bisogna risolvere i seguenti problemi:
- considerare se mettere l'altezza di DrivingDashboardActor in una costante o se leggerla da una proprietà dell'actor parent
- capire come passargli il valore dei due pedali (se inviare i valori come evento o se passare l'intero riferimento al vehicle del giocatore)

L'applet va messo nel file @src/ui/pedals-applet.actor.ts

Alla fine scrivi l'output nel file @resources/issues/0018/grill-me-out.md
```


```
use /write-a-prd about the decisions just taken and listed in @resources/issues/0018-pedals-applet/grill-me-out.md . Write the output file in the directory `resources/issues/0018-pedals-applet/`
```


```
usa /prd-to-plan con il prd che trovi in @resources/issues/0018-pedals-applet/prd.md
```


```
/implement-plan at @resources/issues/0018-pedals-applet/plan.md
```

