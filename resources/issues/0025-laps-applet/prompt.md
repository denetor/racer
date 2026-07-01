```md
/grill-me applet per visualizzare i tempi sul giro dei giocatore.

Deve essere basato su una finestra semitrasparente come gli altri applet, con gli stessi colori di testo.

Le informazioni che vogliamo mostrare solo:
- timer giro attuale
- delta di tempo rispetto al passaggio sullo stesso checkpoint del miglior giro: in verde se inferiore e in rosso se superiore
- tempo del miglior giro
- tempo dell'ultimo giro completato

L'applet si aggiorna ad ogni giro iniziato o completato (un giro inizia e finisce all'attraversamento del checkpoint 'finish-line') 
per quanto riguarda il giro migliore e l'ultimo giro, mentre il timer del giro corrente si aggiorna ad ogni frame

L'applet si posizione in alto a destra della schermata. Tieni conto che la schermata potrebbe essere ridimensionata 
o scalata in futuro, bisogna dare una posizione relativa al bordo destro

Ricorda che abbiamo già la struttura di dati dei tempi dei giri e dei singoli passaggi sui checkpoint

Scrivi l'output nel file @resources/issues/0025-laps-applet/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0025-laps-applet/grill-me-out.md . Write the output file in the directory `resources/issues/0025-laps-applet/`
```

```md
usa /prd-to-plan con il prd che trovi in @resources/issues/0025-laps-applet/prd.md
```