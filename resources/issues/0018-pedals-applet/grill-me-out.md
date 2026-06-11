# Grill-me: PedalsAppletActor

## Question 1: Come `PedalsAppletActor` ricava la dimensione dell'applet?

`DrivingDashboardActor` ha `height: 64` hardcodata nel costruttore. Il figlio ha bisogno di questo valore per calcolare le proprie dimensioni (`height - 8*2 = 48px`).

### Decision:
Estrarre `64` in una **costante statica** su `DrivingDashboardActor`:
```ts
static readonly HEIGHT = 64;
```
`PedalsAppletActor` legge `DrivingDashboardActor.HEIGHT` direttamente. Nessun accoppiamento implicito, nessun parametro ridondante, intenzione esplicita.

---

## Question 2: Come `PedalsAppletActor` riceve i valori dei pedali?

`VehicleActor` espone già `throttleInput: number` e `brakeInput: number` come proprietà pubbliche `[0, 1]`.

### Decision:
Passare il **riferimento diretto a `VehicleActor`** nel costruttore/`setVehicle` di `PedalsAppletActor`. L'applet legge `vehicle.throttleInput` e `vehicle.brakeInput` in ogni `onPostUpdate`. Coerente col pattern già usato nel codebase, nessun overhead.

---

## Question 3: Come vengono disegnate le due barrette verticali?

Le barrette cambiano altezza ogni frame.

### Decision:
Usare la **graphics API di Excalibur**: in `onPostUpdate`, cancellare e ridisegnare i rettangoli direttamente su `this.graphics` con altezza calcolata. Nessun child actor extra, nessun problema di pivot/scale.

---

## Question 4: Chi passa il riferimento a `VehicleActor` alla dashboard?

`PlaygroundScene` crea sia `player` che `dashboard` separatamente.

### Decision:
`DrivingDashboardActor` espone un metodo **`setVehicle(vehicle: VehicleActor)`** chiamato dalla scena dopo la costruzione. La dashboard è responsabile dei propri figli e propaga il veicolo internamente. La scena non conosce i dettagli interni della dashboard.

```ts
// playground.scene.ts
this.dashboard = new DrivingDashboardActor(engine.screen.width);
this.add(this.dashboard);
this.dashboard.setVehicle(player);
```

---

## Question 5: Che tipo base usa `PedalsAppletActor` e come si posiziona?

`DrivingDashboardActor` è un `ScreenElement` con anchor `(0, 0)` (top-left).

### Decision:
`PedalsAppletActor` estende **`ScreenElement`** — anchor `(0, 0)` built-in, coerente con il parent. Posizionamento: `pos = vec(8, 8)`, ovvero 8px di margine dal bordo sinistro e dall'alto del parent.

---

## Question 6: Le barrette crescono dal basso verso l'alto o dall'alto verso il basso?

### Decision:
**Dal basso verso l'alto** — come un VU meter. Più intuitivo: "più premi il pedale, più la barra sale". Corrisponde alla metafora fisica del giocatore.

---

## Question 7: Come sono disposte le due barrette nell'applet?

L'applet è `48x48`.

### Decision:
**20px barra + 8px gap + 20px barra** — leggibilità visiva immediata grazie al gap centrale che separa chiaramente i due indicatori.

---

## Question 8: Quale barretta è a sinistra e quale a destra?

### Decision:
**Brake a sinistra, Throttle a destra** — rispetta la disposizione fisica dei pedali in un'auto reale (freno a sinistra, gas a destra).

---

## Question 9: Come `DrivingDashboardActor` propaga il veicolo a `PedalsAppletActor`?

### Decision:
`PedalsAppletActor` viene creato nell'**`onInitialize`** della dashboard (senza veicolo). Quando la scena chiama `dashboard.setVehicle(vehicle)`, la dashboard chiama `this.pedalsApplet.setVehicle(vehicle)`. Separazione netta tra costruzione e configurazione, lifecycle prevedibile.

---

## Question 10: Le barrette hanno uno sfondo/track?

### Decision:
**Track con outline giallo trasparente** — un rettangolo con bordo giallo semitrasparente mostra sempre l'altezza massima, richiamando il colore della barra e indicando lo stato "vuoto" in modo coerente con la palette visiva dell'applet.

---

## Summary: implementazione

### File: `src/ui/driving-dashboard.actor.ts`
- Aggiungere `static readonly HEIGHT = 64`
- Aggiungere campo `private pedalsApplet: PedalsAppletActor`
- In `onInitialize`: creare e aggiungere `PedalsAppletActor` come child
- Aggiungere metodo `setVehicle(vehicle: VehicleActor)` che propaga all'applet

### File: `src/ui/pedals-applet.actor.ts` (nuovo)
- Estende `ScreenElement`
- Costanti: `MARGIN = 8`, `BAR_WIDTH = 20`, `GAP = 8`
- Dimensioni: `width = height = DrivingDashboardActor.HEIGHT - MARGIN * 2` (= 48)
- Posizione: `pos = vec(MARGIN, MARGIN)`
- Campo `private vehicle: VehicleActor | null`
- Metodo `setVehicle(vehicle: VehicleActor)`
- In `onPostUpdate`: ridisegna con graphics API i due rettangoli (brake sx, throttle dx) che crescono dal basso

### File: `src/scenes/playground.scene.ts`
- Dopo `this.add(this.dashboard)`: chiamare `this.dashboard.setVehicle(player)`