# Grill-me — Step 3 (Trasferimento di carico)

> Interview di dettaglio sull'implementazione dello **Step 3** di `plan-steps.md`, alla luce di
> `specs.md` (§3.3, §3.4, §3.7, §3.11) e della struttura software esistente (post Step 2). Obiettivo
> dello Step 3: rendere **dinamico** `Fz`. Il **baricentro resta fisso nel corpo**; ciò che si sposta
> è il *carico* tra le quattro gomme sotto accelerazione/frenata (longitudinale) e in curva
> (laterale), dando il guadagno realistico al cerchio di aderenza già introdotto allo Step 2.
> Restano fuori scope: motore reale e distribuzione di trazione (Step 4), pattinamento/bloccaggio
> espliciti (Step 5), usura/carburante (Step 6).

## Ricognizione codice (stato post Step 2)

- **`vehicle-physics.service.ts`** espone (tutte con unit test colocati): `pxPerMeter`, `bodyToWorld`,
  `worldToBody`, `localToBody`, `getTotalMass`, `integrateLongitudinalStep`, `integrateBody`
  (termini incrociati §3.7), `kinematicYawRate`, `wheelVelocity`, `slipAngle`, `lateralForceLinear`,
  `lowSpeedKinematicBlend`, **`staticLoad`** (4 `Fz` statici da geometria 2D), **`clampToFrictionCircle`**
  (cerchio `μ·Fz` + flag `saturated`). Tipi: `Vec2`, `WheelArms`, `WheelLoads`, `BodyMotion`,
  `ClampedForce`, `LowSpeedBlend`.
- **`PhysicDriveUpdateSystem.integrateMotion`** (oggi): per ruota calcola
  `wheelVelocity → slipAngle → lateralForceLinear → clampToFrictionCircle(0, Fy, μ, Fz)` con
  `Fz` **statico** (`staticLoad(totalMass, G, arms)` ricalcolato ogni frame), setta
  `load`/`slipAngle`/`saturated` su `WheelState`, ruota la forza anteriore di `δ`, somma
  `fxTyre`/`fyTyre`/`mzTyre`; la spinta longitudinale (tracer) agisce al baricentro; applica il blend
  `k` (`lowSpeedKinematicBlend`) e integra con `integrateBody`. Espone `longitudinalAccel`
  (= `(next.vx − vx)/dt`) per l'HUD.
- **`PhysicVehicleActor`**: datasheet completo, fra cui `cogPosition` (default centro), **`cogHeight`
  = 0.5 m** (finora **inerte** — Step 3 lo attiva), `corneringStiffnessFront/Rear`; getter geometrici
  `wheelbaseMeters` (L), `trackMeters` (media), `Iz`, `totalMass`, `wheelArmsBody` (4 bracci `r_i`,
  frame-corpo, metri). `wheelStates: Map<string, WheelState>`.
- **`WheelState`**: `gripSurface`, `load` (Fz), `slipAngle`, `saturated`, `surfaces[]`.
- **HUD (`PhysicsDebugHud`)**: righe globali (km/h+marcia, gas/brake, `aLong`, `yaw`, slip f/r) +
  griglia 2×2 (FL/FR sopra, RL/RR sotto) con `μ`, `Fz` (N), slip (°); cella **rossa** se `saturated`.
  Altezza fissa `HUD_HEIGHT = 310`, righe da `LINE_HEIGHT = 22`, colonne `COL_LEFT_X`/`COL_RIGHT_X`.

### Osservazione chiave: `staticLoad` resta, `Fz` per il cerchio diventa dinamico

Lo Step 3 **non sostituisce** `staticLoad`: lo usa come *base*. Il punto d'innesto è una sola riga
di `integrateMotion` — oggi `const loads = staticLoad(...)` poi `const fz = loads[name]`. Step 3
interpone `dynamicLoad(static, a_x, a_y, …)` e fa entrare i 4 `Fz` **dinamici** nel cerchio. Il
baricentro (`cogPosition`) e i bracci `r_i` **non si toccano** (§3.4: baricentro fisso nel corpo).

---

## Question 1: Da dove arrivano `a_x`/`a_y` per il trasferimento, vista la dipendenza circolare?

C'è un anello: `Fz` → forza pneumatica (cerchio) → accelerazione → `Fz`. Inoltre va deciso *quale*
accelerazione usare. Nota fisica verificata: l'accelerazione del baricentro **nel frame corpo** è
esattamente `(F_x_netto/m, F_y_netto/m)` — i termini di Coriolis (`v_y·ω`, `−v_x·ω`) di `integrateBody`
si elidono contro i termini di rotazione del frame, quindi la *vera* accelerazione che causa il
trasferimento è **forza netta / massa**, **non** il `v̇` grezzo oggi salvato in `longitudinalAccel`.

### Decision:

**Forza netta / massa, con ritardo di un frame.** A fine `integrateMotion` si salva sull'attore
`bodyAccel = vec(fx/mass, fy/mass)` (le `fx`/`fy` nette già calcolate, comprensive di tracer + gomme
post-blend). Il frame successivo, **prima** del cerchio, si legge `bodyAccel` per calcolare i `Fz`
dinamici. Il ritardo di 1 frame spezza l'anello (impercettibile a 60 fps), `F/m` è la causa
fisicamente corretta del trasferimento, costo nullo, nessuna iterazione intra-frame. (Scartate: il
`v̇` grezzo include il Coriolis → conteggio errato in curva stretta; l'iterazione a 2 passi raddoppia
il lavoro per-ruota senza guadagno percepibile.)

```ts
// fine integrateMotion (questo frame):
vehicle.bodyAccel = vec(fx / mass, fy / mass);
// inizio frame successivo, prima del cerchio:
const { x: ax, y: ay } = vehicle.bodyAccel;
const loads = dynamicLoad(staticLoad(totalMass, G, arms), ax, ay, …);
```

---

## Question 2: Come si ripartisce il trasferimento **laterale** tra asse anteriore e posteriore?

Il longitudinale è netto (asse ant. ↔ asse post., `/2` per ruota). Il laterale, invece, sposta carico
da interno a esterno *all'interno di un asse*: ma i due assi hanno carreggiate diverse
(`frontAxleWidth` 60px, `rearAxleWidth` 62px) e la ripartizione reale dipende dalla rigidezza di
rollio, che non modelliamo.

### Decision:

**Per-asse, con carreggiata propria e quota di massa statica.** Trasferimento laterale calcolato in
modo indipendente per ciascun asse: `ΔFz_axle = m_axle · a_y · h / track_axle`, dove
`m_axle = (Fz_static dei due wheel dell'asse) / g` e `track_axle` è la carreggiata di **quell'**asse.
Sfrutta geometria già disponibile (carreggiate per-asse, carichi statici), **nessun knob** di
rigidezza di rollio. Esterno `+ΔFz`, interno `−ΔFz`. (Scartate: formula globale con carreggiata media
+ split per carico, e split 50/50 — meno fedeli per un'auto non bilanciata 50/50.)

---

## Question 3: Decomposizione in funzioni pure nel service?

Il plan nomina `longitudinalLoadTransfer(...)` e `lateralLoadTransfer(...)`; serve anche qualcosa che
assembli i 4 `Fz` finali (`statico + Δlong + Δlat`, clamp `≥ 0`).

### Decision:

**Due funzioni scalari + un assemblatore.** Si tengono come scalari minuscoli e testabili:
- `longitudinalLoadTransfer(mass, a_x, cogHeight, L)` → `ΔFz` (totale d'asse),
- `lateralLoadTransfer(mass_axle, a_y, cogHeight, track)` → `ΔFz` (per ruota);

più `dynamicLoad(staticLoads, a_x, a_y, cogHeight, L, trackFront, trackRear)` → 4 `Fz` clampati, che
le richiama e applica segni/split per ruota + clamp `≥ 0`. Il system chiama **solo** `dynamicLoad`.
Ogni pezzo unit-testato in isolamento (la parte bug-prone — segni/split — resta in funzione pura, non
in glue). (Scartate: un'unica `dynamicLoad` monolitica — formule non testabili a sé; oppure assemblare
inline nel system — sposta segni/split/clamp in glue non testato.)

```ts
// service
longitudinalLoadTransfer(mass, ax, h, L): number      // totale d'asse
lateralLoadTransfer(massAxle, ay, h, track): number    // per ruota
dynamicLoad(staticLoads: WheelLoads, ax, ay, h, L, trackFront, trackRear): WheelLoads
// system
const Fz = dynamicLoad(staticLoad(totalMass, G, arms), ax, ay, h, L, trackF, trackR);
```

---

## Question 4: Clamp `Fz ≥ 0` — si ridistribuisce l'eccesso quando una ruota si scarica?

§3.4 impone clamp `≥ 0` (ruota scaricata = grip zero). Ma quando una ruota va a 0 i quattro `Fz` non
sommano più al peso totale (la quota della ruota alleggerita sparisce invece di passare alle altre).

### Decision:

**Clamp `≥ 0`, nessuna ridistribuzione.** Si clampa ogni `Fz` a `≥ 0` e si lascia così. Aderisce alla
lettera a §3.4 e mantiene `dynamicLoad` una forma chiusa semplice. Il "peso perso" momentaneo è una
semplificazione nota; la ridistribuzione piena richiederebbe modellare l'asse di rollio, fuori scope.
Il sollevamento ruota accade solo a trasferimenti estremi. (Scartata: travaso all'altra ruota dello
stesso asse — più realistico ma aggiunge branching ed è comunque un'approssimazione.)

```
Fz_i = max(0, static_i + Δlong_i + Δlat_i)
// Σ può essere < m·g quando una ruota si solleva — semplificazione accettata (§3.4)
```

---

## Question 5: Convenzioni di segno e fattori per-ruota?

Dalle convenzioni del frame corpo (x=avanti; `arm.x>0` anteriore, `<0` posteriore; `+y=destra`, quindi
`arm.y>0` destra, `<0` sinistra). Sottigliezza: le due formule hanno semantica "per" diversa —
longitudinale `m·a_x·h/L` è un **totale d'asse** (`/2` per ruota), laterale `m_axle·a_y·h/track` è già
**per ruota** (esterno `+`, interno `−`).

### Decision:

**Si adotta questa derivazione, documentata e asserita dai test.**
- **Longitudinale**: `a_x>0` (accelera) → carico verso il **retro** (anteriori `−ΔL/2`, posteriori
  `+ΔL/2`); frenata (`a_x<0`) → carico in avanti (affondo). `ΔL = m·a_x·h/L`, totale d'asse → `/2` per
  ruota.
- **Laterale**: il centro curva sta verso `a_y`; l'esterno è dal lato opposto. `a_y>0` (verso `+y`,
  destra) → centro a destra, **esterno a sinistra** → ruote **sinistre guadagnano**, destre perdono.
  `Δlat_axle = m_axle·a_y·h/track`, applicato per ruota (esterno `+`, interno `−`).

I segni stanno nel docstring di `dynamicLoad` e sono **asseriti** dai unit test, così un futuro
ribaltamento di segno viene catturato.

```
// a_x>0 (accel):  front -=ΔL/2,  rear +=ΔL/2
// a_y>0 (verso +y/destra): esterno=sinistra → left += Δlat, right -= Δlat
ΔL       = m·a_x·h/L          // totale d'asse, /2 per ruota
Δlat_ax  = m_ax·a_y·h/track   // per ruota (esterno +, interno -)
```

---

## Question 6: Come l'HUD mostra `ΔFz` rispetto allo statico?

§ HUD dello Step 3: rendere visibile a colpo d'occhio lo spostamento di `Fz` rispetto allo statico. La
griglia 2×2 mostra già `μ`, `Fz` (N), slip (°) per cella; l'altezza HUD è fissa.

### Decision:

**Barra orizzontale per ruota, centrata sullo statico.** Ogni cella ha una barra sottile: il segno
centrale = carico **statico**; si riempie a **destra** (es. verde) quando carica, a **sinistra**
(rosso) quando scarica, lunghezza `∝ |ΔFz|`. Aderisce a "barre per ruota" del plan, leggibile
istantaneamente guidando (frenata → barre anteriori crescono), mantiene il numero `Fz`. Richiede di
**salvare lo `Fz` statico per ruota** come baseline (vedi convenzioni). (Scartate: delta numerico
firmato — più lento da leggere, serve una 5ª riga per cella; tinta del numero — troppo grossolana per
giudicare la magnitudine.)

```
FL  μ1.00            FR  μ1.00
2765N [===|   ]     2765N [===|   ]   ← anteriori cariche (frenata)
3.1°                3.0°
RL  μ1.00            RR  μ1.00
2145N [  |== ]      2145N [  |== ]
1.2°    (| = statico, riempimento = Δ)
```

---

## Question 7: Cosa si unit-testa per lo Step 3?

Strategia consolidata (memoria utente + step precedenti): unit test **solo** sulle funzioni pure;
attori/system/HUD/superfici = glue, validati **manualmente** guidando.

### Decision:

**Test di tutte e 3 le nuove funzioni pure + invarianti.** In `vehicle-physics.service.test.ts`:
- `dynamicLoad`: `a_x=a_y=0` → `Fz == staticLoad` (esatto); `a_x>0` → posteriori guadagnano /
  anteriori perdono (e `/2` per ruota); `a_y>0` → sinistre guadagnano / destre perdono; **somma
  invariante** (`ΔΣ = 0` prima di ogni clamp); **clamp `≥ 0`** quando il trasferimento supera lo
  statico; il `Δ` **scala con `cogHeight`** (raddoppia `h` → raddoppia `Δ`).
- `longitudinalLoadTransfer` / `lateralLoadTransfer`: valore esatto + segno.

Il wiring `bodyAccel` e le barre HUD restano glue (verifica guidando). (Scartato: testare solo
`dynamicLoad` — un errore di segno in uno scalare non testato si vedrebbe solo indirettamente.)

---

## Question 8: Serve damping/guardia extra per la stabilità dell'anello con ritardo?

Il `Fz` dinamico crea un anello di feedback (più carico → più grip → più forza laterale → più `a_y` →
più carico), chiuso con ritardo di 1 frame.

### Decision:

**Nessuna guardia extra: bastano il blend esistente e il clamp `≥ 0`.** A bassa velocità le forze
gomma laterali sono già scalate da `k→0`, quindi `a_y→0` e il trasferimento laterale si auto-sopprime;
il clamp `≥ 0` limita il basso, il cerchio di aderenza limita l'alto. Il ritardo di 1 frame è stabile
a 60 fps per queste magnitudini. Non si aggiunge nulla; si tiene d'occhio l'eventuale oscillazione in
verifica manuale e solo allora si rivede. (Scartate: scalare anche `ΔFz` per `k` — ucciderebbe
l'affondo in frenata a bassa velocità, dove `a_x` è reale; cap `|ΔFz|` a frazione dello statico —
nuovo magic number che maschera il sollevamento ruota reale.)

```
// a_y = fy/m, e fy = k·fyTyre  →  a bassa velocità (k→0) il ΔFz laterale → 0
// nessun gate dedicato sul trasferimento; clamp≥0 e cerchio limitano entrambi gli estremi
```

---

## Decisioni implementative prese per convenzione (non richiedono giudizio dell'utente)

- **Nuove funzioni pure** in `vehicle-physics.service.ts` (con test colocati): `longitudinalLoadTransfer`,
  `lateralLoadTransfer`, `dynamicLoad` (Q3, Q5). Riusano il tipo `WheelLoads` esistente.
- **`PhysicVehicleActor`**: nuovo stato `bodyAccel: Vector = vec(0, 0)` (m/s², frame corpo), scritto a
  fine `integrateMotion` e letto il frame dopo (Q1). `cogHeight` (già presente, 0.5 m) passa da inerte
  ad **attivo**. `longitudinalAccel` resta com'è per la riga `aLong` dell'HUD (è il `v̇` percepito);
  `bodyAccel` è il nuovo campo per il trasferimento (e fonte per un eventuale readout `a_y`).
- **`PhysicDriveUpdateSystem.integrateMotion`**: interpone `dynamicLoad(staticLoad(...), bodyAccel.x,
  bodyAccel.y, cogHeight, L, trackFront, trackRear)` prima del ciclo per-ruota; il `fz` dinamico entra
  nel `clampToFrictionCircle` e viene scritto su `wheelState.load` (oggi statico). I geometrici `L`,
  `trackFront`, `trackRear` da getter sull'attore (esiste già `trackMeters` media; si aggiungono
  `trackFrontMeters`/`trackRearMeters`, oppure si ricavano inline da `frontAxleWidth`/`rearAxleWidth`).
  A fine metodo salva `vehicle.bodyAccel = vec(fx/mass, fy/mass)`.
- **Static come baseline HUD**: lo `staticLoad` per ruota è già ricalcolato ogni frame; per le barre lo
  si espone (es. `wheelState` aggiunge un readonly `loadStatic`, oppure l'HUD ricalcola la baseline).
  Convenzione: scrivere `loadStatic` su `WheelState` accanto a `load` (dinamico) per evitare doppio
  calcolo nell'HUD.
- **HUD (`PhysicsDebugHud`)**: barra per cella centrata sullo statico, riempimento `∝ ΔFz` con colore
  (verde carica / rosso scarica), accanto al numero `Fz`. Possibile lieve aggiustamento di
  `HUD_HEIGHT`/spaziatura cella se la barra non entra nelle righe attuali (Q6).
- **`physics.constants.ts`**: nessuna nuova costante necessaria (cogHeight è per-veicolo). Nessun magic
  number nel system.
- **Baricentro fisso (§3.4)**: `cogPosition` e bracci `r_i` **non** vengono toccati; tutta la dinamica
  vive nei 4 `Fz`. Nessuno spostamento del punto baricentro per-frame.
- **Retromarcia / cerchio / `actor.pos`**: invariati rispetto allo Step 2.
- **`main.ts` committato con `START_SCENE='playground'`** (flip a `'physics'` solo in locale per la
  verifica), per non rompere la baseline Playwright.

---

## Parametri da tarare a mano (durante la verifica)

Valori da rifinire guidando: **`cogHeight`** (guadagno del trasferimento — 0.5 m placeholder; alto =
trasferimenti marcati, §3.11), `cogPosition` (bilanciamento statico ant./post., influisce sulla quota
di massa per-asse del laterale), e indirettamente `corneringStiffnessFront/Rear` + grip superfici (la
soglia di scivolamento ora dipende da `Fz` dinamico). Obiettivo: in frenata forte si vede l'affondo
(anteriori più cariche), in accelerazione il contrario, in curva il carico va sulle esterne; frenando
in curva l'interno si alleggerisce e satura prima; l'effetto scala con `cogHeight`.

---

## Checklist di verifica manuale dello Step 3 (utente, con `START_SCENE='physics'`)

- In **frenata forte** il carico si sposta in **avanti** (barre/`Fz` anteriori crescono, posteriori
  calano) e in **accelerazione** all'**indietro**.
- In **curva** il carico va sulle ruote **esterne** (barre esterne crescono, interne calano).
- **Frenando in curva** l'**interno si alleggerisce** e può **saturare prima** (cella rossa
  sull'interno anteriore).
- L'effetto **scala con `cogHeight`**: aumentandolo, i trasferimenti diventano più marcati.
- Nessuna **oscillazione**/instabilità da feedback (anello con ritardo di 1 frame stabile); da
  fermo/lentissimo il trasferimento laterale resta ≈0 (blend), l'affondo in frenata resta visibile.
- L'HUD mostra le barre `Fz` per ruota coerenti col moto; a regime/dritto tornano sullo statico.
- `npm run build` verde; `npm run test:unit` verde (nuovi test `longitudinalLoadTransfer`,
  `lateralLoadTransfer`, `dynamicLoad` con invarianti e clamp).
- Con `START_SCENE='playground'` la scena vecchia resta **identica** (baseline Playwright intatta).