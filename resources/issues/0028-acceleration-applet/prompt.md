```
/grill-me aggiungi, a DrivingDashboardActor, un child Actor chiamato AccelerationAppletActor che mostra, in tempo reale, il valore dei weightTransfer del Vehicle.
L'actor sarà largo e alto come l'altezza di DrivingDashboardActor senza 8 pixel di margine per ciascun lato.
L'actor si posiziona come secondo elemento da sinistra nell'actor padre.
Prepara l'applet in modo che sia di forma quadrata, e possa, in futuro, mostrare anche l'accelerazione laterale.
L'indicatore è un cerchio pieno giallo posto al centro dell'area dell'applet quando weightTransfer vale 0.
Al variare di weightTransfer l'indicatore si sposta in alto se weightTransfer > 0 e in basso se weightTransfer < 0
Aggiungi una circonferenza senza riempimento per indicare la massima area in cui l'indicatore si potrà spostare (si sposterà in due dimensioni quando avremo aggiunto anche la componente laterale).

Molte altre considerazioni possono essere prese dall'applet `@src/ui/pedals-applet.actor.ts` 

L'applet va messo nel file @src/ui/acceleration-applet.actor.ts

Alla fine scrivi l'output nel file @resources/issues/0028-acceleration-applet/grill-me-out.md
```


```
use /write-a-prd about the decisions just taken and listed in @resources/issues/0028-acceleration-applet/grill-me-out.md . Write the output file in the directory `resources/issues/0028-acceleration-applet/`
```


```
usa /prd-to-plan con il prd che trovi in @resources/issues/0028-acceleration-applet/prd.md
```


```
/implement-plan at @resources/issues/0028-acceleration-applet/plan-acceleration-applet.md
```

