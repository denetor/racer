```md
/grill-me Considera come funziona la fisica, descritta nel file `resources/issues/0031-new-physics/specs.md` e la base di codice a cui fa riferimento.

Vorrei aggiungere un sistema attivabile con un pulsante, per mostrare, in sovrimpressione al vehicle del giocatore, alcuni dati di debug.

Nello specifico vorrei vedere:

- una sottile croce centrata sun COG statico del veicolo (una linea sottile nell'asse X e una nell'asse y)
- un pallino che indica dove attualmente si trova il centro di gravità virtuale dopo i trasferimenti di carico
- per ogni ruota l'attuale cerchio di saturazione delle forze logitudinale e laterale, centrato sulla ruota stessa
- per ogni ruota due linee per le componenti delle forze nell'asse X e nell'asse y. Se la ruote sterzate hanno gli assi x e y ruotati del'angolo di sterzo, ruota anche queste linee. 

Queste grafiche dovranno avere lo stesso colore di base dei testi del widget di debug della fisica

Scrivi l'output nel file @resources/issues/0036/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0036-debug-lines/grill-me-out.md . Write the output file in the directory `resources/issues/0036-debug-lines/`
```

```md
usa /prd-to-plan con il prd che trovi in @resources/issues/0036-debug-lines/prd.md
```