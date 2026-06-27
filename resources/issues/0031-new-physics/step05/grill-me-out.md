# Grill-me — Step 5 (Pattinamento e bloccaggio — saturazione longitudinale)

> Interview di dettaglio sull'implementazione dello **Step 5** di `plan-steps.md`, alla luce di
> `specs.md` (§3.5 cerchio di aderenza, §3.8 motore/resistenze, §3.10 blend a bassa velocità) e della
> struttura software esistente (post Step 4). Obiettivo dello Step 5: rendere **espliciti**
> **pattinamento** (richiesta motrice > grip) e **bloccaggio** (richiesta frenante > grip) come
> **saturazione longitudinale** del cerchio di aderenza, in versione **"clamp" + flag** per ruota, e
> collegare i flag agli **effetti** (fumo). Lo **slip ratio vero** (con velocità angolare di ruota
> come stato) resta esplicitamente **rimandato** (estensione futura, §6 note operative).

## Ricognizione codice (stato post Step 4)

- **`vehicle-physics.service.ts`**: funzioni pure con test colocati, fra cui `clampToFrictionCircle(fx,
  fy, mu, fz) → {fx, fy, saturated}` (cerchio `μ·Fz`, **combinata e direzione-preservante**, scala
  `(fx,fy)` insieme), `driveForce`, `aeroDrag`, `rollingResistance`, `distributeDrive`,
  `distributeBrake`, `lateralForceLinear`, `slipAngle` (**ora reverse-aware**: `atan2(viy, |vix|) −
  δ·sign(vix)`), `lowSpeedKinematicBlend`, `dynamicLoad`. **Manca** una funzione di classificazione
  della saturazione longitudinale.
- **`PhysicDriveUpdateSystem.integrateMotion`**: per ruota calcola
  `wheelVelocity → slipAngle → fxLong = driveShare − sign(v_i_x)·(fRoll + brakeShare)`,
  `fLat = k·lateralForceLinear(α)`, poi `clampToFrictionCircle(fxLong, fLat, μ, Fz)`; scrive su
  `WheelState` `load`/`loadStatic`/`slipAngle`/`saturated`/`longitudinalForce`; ruota le anteriori di
  `δ`, somma `fx`/`fy`/`mz`. A fine update chiama `entity.setEmitters('throttle', input.throttleTarget
  > 0)` (fumo legato al **gas**, non allo slip). Aero al baricentro; guardia di standstill su `v_x`.
- **`WheelState`**: `gripSurface`, `rollFactor`, `load`, `loadStatic`, `longitudinalForce`,
  `slipAngle`, `saturated`, `surfaces[]`. **Mancano** `wheelspin`/`lockup`.
- **`PhysicVehicleActor`**: datasheet completo (`maxDriveForce` 8000 N, `enginePower` 150 kW,
  `drivetrain='rwd'`, `brakeForce` 12000 N, `brakeBias` 0.6, `corneringStiffness*`, `cogHeight`…).
  Eredita da `BaseVehicleActor` gli emitter; override `onInitialize` già presente (rende le ruote
  `Passive`).
- **`BaseVehicleActor`**: **una sola coppia** di emitter per-veicolo (`idleEmitters`/`throttleEmitters`)
  al retrotreno (`pos: vec(20,58)`), commutata da `setEmitters(category, enabled)` (cambia `emitRate`).
  È **condiviso** col legacy `VehicleActor` → ogni modifica strutturale qui tocca la **baseline
  Playwright**.
- **`PhysicsDebugHud`**: griglia 2×2 per ruota con `μ`, `Fz`+barra, slip(°), `Fx`; cella **rossa** se
  `saturated`. Riga globale drivetrain + `F_drive` (kN) + flag `PL`.
- **Audio: assente.** `grep` su `Sound`/`.mp3`/`.wav`/`audio` → **zero**. Esistono solo gli emitter di
  fumo (grafici). Il riferimento del piano a "effetti grafici/**sonori** esistenti" è impreciso: di
  sonoro non c'è nulla da agganciare.

### Osservazione chiave: lo Step 5 è uno strato **diagnostico + cosmetico** sopra un clamp che già taglia

Il cerchio di aderenza (`clampToFrictionCircle`) **già taglia** la forza longitudinale eccedente fin
dallo Step 2/4: il `fx` applicato non supera mai `μ·Fz`. Quindi pattinamento e bloccaggio, come
*riduzione di forza*, **esistono già**; ciò che manca è (a) **distinguerli** e **nominarli** per ruota
(`wheelspin`/`lockup`) e (b) **agganciarli agli effetti**. Lo Step 5 non riapre la fisica dello Step 4.

---

## Question 1: Modello del clamp — combinato (Step 4) o priorità per asse?

Il piano dice «quando `Fx` richiesto eccede il margine del cerchio dato `Fy`, taglialo e alza il flag».
Va deciso se la **forza applicata** passa a un clamp con priorità d'asse (laterale-prima o
longitudinale-prima), o se resta il **clamp combinato direzione-preservante** dello Step 4 e i flag si
**derivano** dal confronto domanda↔margine.

### Decision:

**Tieni il clamp combinato dello Step 4 per la forza applicata; deriva i flag.** La forza resta
`clampToFrictionCircle(fxLong, k·fLat, μ, Fz)` (nessuna regressione di tuning, feel dello Step 4
intatto). I flag `wheelspin`/`lockup` si **derivano** confrontando la domanda longitudinale col
**margine longitudinale dato il laterale**: `marginLong = √(max(0, (μ·Fz)² − (k·fLat)²))`. La «lettera»
del piano («margine dato `Fy`») è la **formula di rilevamento**, non un cambio di priorità del clamp.
La perdita di sterzabilità in bloccaggio emerge già dal clamp combinato (riduce anche `fy`).
(Scartate: lateral-priority e longitudinal-priority — riaprono il tuning dello Step 4 e cambiano il
feel; la longitudinal-priority è anche poco realistica.)

```ts
// forza applicata: invariata (Step 4)
const clamped = clampToFrictionCircle(fxLong, k * fLat, mu, fz);
// derivazione flag (non cambia la forza):
const marginLong = Math.sqrt(Math.max(0, (mu * fz) ** 2 - (k * fLat) ** 2));
```

---

## Question 2: Classificare wheelspin vs lockup quando la domanda longitudinale satura

`fxLong = driveShare − sign(v_i_x)·(fRoll + brakeShare)`: una ruota può avere insieme trazione, freno e
rotolamento. Va deciso come si decide se la saturazione longitudinale è pattinamento o bloccaggio.

### Decision:

**Per contributo dominante alla ruota.** Si confronta `|driveShare|` (trazione) con `brakeShare +
fRoll` (forze che si oppongono al moto): se domina il drive → **wheelspin**, altrimenti → **lockup**.
Conseguenze naturali: una ruota **non motrice** (`driveShare = 0`) può solo **bloccarsi**; col
**left-foot braking** vince il contributo maggiore; la **retromarcia** è gestita dal segno già presente
in `fxLong`. Robusto e per-ruota. (Scartate: per stato pedali — ambiguo con gas+freno e non per-ruota;
per segno della forza vs marcia — in puro rilascio il solo `fRoll` classificherebbe 'lockup'.)

---

## Question 3: Modello-dati dei flag su `WheelState`

Col clamp combinato una ruota può essere **insieme** in saturazione longitudinale (wheelspin/lockup) e
laterale (scivolata); l'HUD legge già `saturated`; lo Step 6 (usura) consumerà i flag.

### Decision:

**Due booleani + `saturated` come ombrello.** Si aggiungono `wheelspin: boolean` e `lockup: boolean` a
`WheelState`; `saturated` resta il flag generale del cerchio (qualsiasi saturazione, anche **solo
laterale**). I booleani esprimono la combo longitudinale+laterale simultanea; churn minimo (l'HUD
continua a usare `saturated` come base, legge i due nuovi per il dettaglio). (Scartate: enum
`SaturationKind` — non esprime la combo e tocca l'HUD esistente; severità numerica — è un proxy, non lo
slip ratio vero, e complica HUD/effetti ora.)

```ts
class WheelState {
  saturated = false; // ombrello (esistente)
  wheelspin = false; // nuovo: saturazione longitudinale lato trazione
  lockup    = false; // nuovo: saturazione longitudinale lato freno
}
```

---

## Question 4: Gate anti-flag-spuri (fRoll-only, sfarfallio) e distinzione "alto vs basso"

Col clamp combinato, in una scivolata **puramente laterale** (`|k·fLat| > μ·Fz`) il margine
longitudinale va a 0 e il **solo attrito di rotolamento** (`fRoll`) farebbe scattare `lockup` per
sbaglio. Serve anche definire l'"alto vs basso" dell'HUD (saturazione longitudinale vs solo laterale).

### Decision:

**Gate "attuatore-da-solo supera il margine" + banda morta.** Il flag scelto in Q2 si alza **solo se la
domanda dell'attuatore dominante supera da sola `marginLong`**: `wheelspin` solo se `|driveShare| >
marginLong` (ruota motrice), `lockup` solo se `brakeShare > marginLong`. Il **rotolamento `fRoll` non è
un attuatore**: da solo non alza mai un flag → la sovrasaturazione **puramente laterale** resta solo
`saturated` (= l'HUD **"basso"**), mentre wheelspin/lockup sono l'HUD **"alto"**. Piccola **banda
morta**/isteresi al bordo del cerchio contro lo sfarfallio. (Scartate: nessun gate — `fRoll`-only
spurio e bordo che sfarfalla; soglia su % di `μ·Fz` — magic number e serve comunque il gate
sull'attuatore.)

> Coerenza Q2↔Q4: il **fRoll entra nella scelta di direzione** del longitudinale netto (dominanza
> drive vs freno+rotolamento), ma **non alza mai un flag da solo**; a far scattare wheelspin/lockup è
> la **sola** quota motrice o frenante che eccede `marginLong`.

---

## Question 5: Collocazione e firma della classificazione

Il progetto tiene **funzioni pure** (con test colocati) in `vehicle-physics.service` e l'orchestrazione
nel system.

### Decision:

**Nuova funzione pura dedicata nel service.** Si aggiunge
`longitudinalSaturation(driveShare, brakeShare, fRoll, fLat, mu, fz, isDriven) → {wheelspin, lockup}`
(ricalcola internamente `marginLong`), con **test colocati** al banco: motrice satura → `wheelspin`;
freno in curva → `lockup`; `fRoll`-only → nessun flag; ruota non motrice → solo `lockup`; sotto margine
→ nessun flag. Il system la chiama nel loop per-ruota **dopo** il clamp. (Scartate: estendere
`clampToFrictionCircle` — inquina il clamp generico/riusato con semantica drive/brake; inline nel
system — non testabile, viola la convenzione.)

```ts
export function longitudinalSaturation(
  driveShare: number, brakeShare: number, fRoll: number,
  fLat: number, mu: number, fz: number, isDriven: boolean,
): {wheelspin: boolean; lockup: boolean} {
  const marginLong = Math.sqrt(Math.max(0, (mu * fz) ** 2 - fLat ** 2));
  const driveMag = Math.abs(driveShare);
  const brakeMag = brakeShare + fRoll;          // dominanza (Q2): include il rotolamento
  let wheelspin = false, lockup = false;
  if (driveMag >= brakeMag) wheelspin = isDriven && driveMag > marginLong; // gate (Q4): attuatore solo
  else                      lockup    = brakeShare > marginLong;           // fRoll escluso dal gate
  return {wheelspin, lockup};
}
// NB: il gate di velocità standstill (Q9) è applicato dal system, non qui (funzione pura).
```

---

## Question 6: Effetti — fumo per-veicolo o per-ruota?

Il piano chiede "fumo in pattinamento" riusando gli emitter esistenti (singola coppia per-veicolo).
Niente audio nel progetto.

### Decision:

**Fumo per-ruota localizzato.** Ogni ruota fuma sulla **propria** posizione, così l'asimmetria
(superfici diverse, bloccaggio anteriore, pattinamento posteriore RWD) è leggibile a schermo. Più
fedele del fumo aggregato al retrotreno. (Scartate: riuso del singolo emitter aggregato — perde
l'asimmetria appena resa per-ruota dai flag; solo flag/HUD senza fumo — sotto-consegna il piano, che
chiede esplicitamente il fumo.)

> **Audio rimandato:** non esiste alcuna risorsa sonora nel progetto; la parte "sonori" del piano non
> ha nulla da agganciare e resta fuori scope per questo step.

---

## Question 7: Dove istanziare i 4 emitter per-ruota senza rompere la baseline Playwright

Gli emitter e `setEmitters()` vivono nel `BaseVehicleActor`, **condiviso** col legacy `VehicleActor`.

### Decision:

**Solo su `PhysicVehicleActor` (override `onInitialize`).** I 4 emitter per-ruota vivono **solo** nel
nuovo attore: nell'`onInitialize` già presente (dopo `super`), si creano 4 `ParticleEmitter` alle
posizioni delle ruote (child del veicolo, nel frame muso-su come l'emitter esistente a `vec(20,58)`),
in una `Map<string, ParticleEmitter>` chiavata per nome ruota, più un metodo
`setWheelSmoke(name, enabled)`. `BaseVehicleActor` e `VehicleActor` restano **identici** → baseline
Playwright intatta. Coerente con "affiancare, non sostituire". (Scartate: crearli nel
`BaseVehicleActor` inerti per il legacy — anche emitter inerti rischiano un diff snapshot e inquinano
la base; dietro un flag nella base — condizionali sulla base condivisa per un solo sottotipo.)

```ts
class PhysicVehicleActor extends BaseVehicleActor {
  private wheelSmoke = new Map<string, ParticleEmitter>();
  override onInitialize(engine: Engine): void {
    super.onInitialize(engine);
    // ... (ruote Passive, già presente)
    for (const name of WHEEL_NAMES) this.wheelSmoke.set(name, this.makeWheelEmitter(name));
  }
  setWheelSmoke(name: string, enabled: boolean): void { /* emitRate alto/basso */ }
}
```

---

## Question 8: Quali flag fanno fumare la ruota?

Il piano dice letteralmente "fumo in pattinamento" (wheelspin); con emitter per-ruota anche il
bloccaggio (gomma che striscia) fuma realisticamente a costo ~zero.

### Decision:

**Sia wheelspin sia lockup.** Una ruota fuma quando `wheelspin || lockup` su quella ruota (stesso
aspetto visivo). Realistico (le gomme bloccate fumano) e sfrutta la capacità per-ruota appena
introdotta; rende percepibile a schermo anche il **bloccaggio**. (Scartata: solo wheelspin — più
conservativa ma spreca gli emitter per-ruota e rende il lockup percepibile solo via HUD.)

```ts
for (const name of WHEEL_NAMES) {
  const w = vehicle.wheelStates.get(name)!;
  vehicle.setWheelSmoke(name, w.wheelspin || w.lockup);
}
```

---

## Question 9: Gating vicino allo standstill

Senza gating, un'auto **ferma** a freno pieno mostrerebbe `lockup`+fumo (sbagliato: non striscia). Ma il
**burnout da fermo** (pattinamento a veicolo quasi immobile su bassa aderenza) è un caso di verifica.

### Decision:

**Gate di velocità su ENTRAMBI i flag** (`wheelspin` e `lockup`) con una piccola costante
`SKID_MIN_SPEED`. Scelta dell'utente: simmetrico e semplice. Conseguenza accettata: **niente fumo a
veicolo esattamente fermo** (si rinuncia al burnout dal puro zero). Mitigazione: tenere
`SKID_MIN_SPEED` **piccola** (~0.5 m/s) così, su bassa aderenza, il pattinamento appare **subito dopo
il lancio** (l'auto supera la soglia in pochi frame). Il gate vive nel **system** (la funzione pura
resta agnostica alla velocità). (Scartate — pur raccomandata in sede di grill: gate solo sul lockup,
lasciando libero il wheelspin per il burnout da fermo; nessun gate — auto ferma frenata che sfarfalla
lockup+fumo.)

```ts
const moving = speed > SKID_MIN_SPEED;            // SKID_MIN_SPEED in physics.constants (~0.5 m/s)
wheelState.wheelspin = moving && sat.wheelspin;
wheelState.lockup    = moving && sat.lockup;
```

---

## Question 10: HUD — distinguere wheelspin / lockup / solo-laterale

Oggi la cella per-ruota diventa **rossa** quando `saturated`; mostra `μ`, `Fz`+barra, slip(°), `Fx`.

### Decision:

**Token per-cella (WSP/LCK) + colore.** Si tiene la cella colorata per qualsiasi saturazione e si
aggiunge un **token corto** nella cella: `WSP` (wheelspin) / `LCK` (lockup) / niente per la saturazione
**solo laterale**. Colore distinto: **arancio** = wheelspin, **rosso** = lockup, **giallo** =
saturazione solo laterale. Esplicito, leggibile e accessibile (non solo colore), riusa la griglia
per-ruota esistente. (Scartate: solo schema colori — meno esplicito, poco accessibile; riga globale
riassuntiva — meno precisa della griglia e duplica info già posizionate per ruota.)

---

## Question 11: Scope fisica — lo Step 5 cambia le forze?

La perdita di sterzabilità in bloccaggio e la perdita di trazione in pattinamento **già emergono** dal
clamp combinato (la forza è tagliata sul cerchio).

### Decision:

**Solo rilevamento, nessun cambio di forza.** Step 5 = funzione pura di classificazione + flag su
`WheelState` + fumo per-ruota + HUD. La perdita di sterzabilità/trazione resta **emergente** dal clamp
combinato dello Step 4. Fedele a "clamp + flag, slip ratio rimandato"; zero rischio di ri-taratura,
feel dello Step 4 preservato. (Scartate: lockup azzera il laterale — più drammatico ma aggiunge una
manopola e devia da 'solo flag'; lockup+wheelspin con frazione cinetica — scope/ri-taratura maggiori e
si sovrappone allo slip-ratio esplicitamente rimandato.)

---

## Decisioni implementative prese per convenzione (non richiedono giudizio dell'utente)

- **`physics.constants.ts`**: aggiungere `SKID_MIN_SPEED` (~0.5 m/s, gate flag standstill — Q9).
  Eventuale piccola banda morta/isteresi del cerchio (Q4) come costante locale o epsilon, se serve
  contro lo sfarfallio.
- **`vehicle-physics.service.ts`**: aggiungere la funzione pura `longitudinalSaturation(...)` (Q5) con
  `.test.ts` colocato. Nessun accesso a Excalibur. Riusa la matematica di `clampToFrictionCircle`
  (raggio `μ·Fz`) per `marginLong`.
- **`WheelState`**: aggiungere `wheelspin`/`lockup` (default `false`), scritti ogni frame dall'update
  (Q3). `saturated` resta l'ombrello.
- **`PhysicVehicleActor`**: override `onInitialize` (già presente) per creare i 4 emitter per-ruota in
  una `Map` chiavata per nome + metodo `setWheelSmoke(name, enabled)` (Q7). Riusare una config
  particellare simile all'emitter `throttle` esistente, posizionata alle ruote nel frame muso-su.
- **`PhysicDriveUpdateSystem.integrateMotion`**: nel loop per-ruota, dopo il clamp, chiamare
  `longitudinalSaturation(...)`, applicare il **gate di velocità** (Q9) e scrivere
  `wheelState.wheelspin`/`lockup`. A fine update, **sostituire** la chiamata
  `setEmitters('throttle', throttleTarget>0)` con il ciclo per-ruota `setWheelSmoke(name, wheelspin ||
  lockup)` (Q8): il fumo passa da **legato al gas** a **legato allo slip**. Gli `idleEmitters` restano
  ambientali; il vecchio `throttleEmitter` aggregato del `BaseVehicleActor` non viene più pilotato dal
  nuovo flusso. Nessun cambio alle forze (Q11).
- **`PhysicsDebugHud`**: nella `wheelCell`, aggiungere il token `WSP`/`LCK` e la logica colore
  arancio/rosso/giallo (Q10), leggendo i nuovi flag.
- **Unit test** (strategia consolidata: solo funzioni pure; attore/system/HUD/emitter = glue, verifica
  manuale): `longitudinalSaturation` — motrice satura → `wheelspin`; freno in curva (marginLong ridotto
  dal laterale) → `lockup`; `fRoll`-only → nessun flag; ruota non motrice (`isDriven=false`) → mai
  `wheelspin`; sotto margine → nessun flag; dominanza drive vs freno+rotolamento.
- **`main.ts` committato con `START_SCENE='playground'`** (flip a `'physics'` solo in locale per la
  verifica), baseline Playwright intatta. `BaseVehicleActor`/`VehicleActor` invariati.

---

## Parametri da tarare a mano (durante la verifica)

`SKID_MIN_SPEED` (dolcezza dell'attacco fumo/flag vicino allo zero); intensità/`emitRate` e durata del
fumo per-ruota (resa visiva). I **fenomeni dovrebbero già emergere** coi parametri dello Step 4: in
RWD la quota motrice posteriore (`maxDriveForce/2 = 4000 N`) supera il raggio del cerchio posteriore
(`μ·Fz ≈ 2600–3500 N`) → wheelspin al lancio, marcato su erba (`μ=0.5`); la quota frenante anteriore
(`brakeForce·brakeBias/2 = 3600 N`) → lockup in frenata forte, soprattutto su bassa aderenza. Se gli
effetti sono troppo rari/frequenti, intervenire prima su grip superfici / `maxDriveForce` / `brakeForce`
(senza ri-tarare il resto, dato Q11).

---

## Checklist di verifica manuale dello Step 5 (utente, con `START_SCENE='physics'`)

- **Accelerazione brusca su bassa aderenza** (erba) appena l'auto si muove → le ruote **motrici**
  pattinano: fumo per-ruota + token `WSP` (arancio) nelle celle posteriori (RWD).
- **Frenata a fondo** → **bloccaggio** anteriore: fumo sulle anteriori + token `LCK` (rosso) e
  **perdita di sterzabilità** (sottosterzo) emergente dal clamp.
- **Superfici asimmetriche** (metà auto sull'erba) → pattinamento/bloccaggio **per-ruota**: fumano/si
  segnano solo le ruote sul lato a basso grip.
- **Auto ferma a freno pieno** → **nessun** `lockup`/fumo (gate di velocità, Q9).
- **Saturazione solo laterale** (curva veloce senza gas/freno) → cella colorata **senza** token
  WSP/LCK (l'"alto vs basso" è visibile).
- **Retromarcia** (post fix reverse-aware) → freno e flag coerenti, nessuna saturazione spuria andando
  dritti.
- `npm run build` verde; `npm run test:unit` verde (nuovo `longitudinalSaturation`).
- Con `START_SCENE='playground'` la scena vecchia resta **identica** (baseline Playwright intatta: né
  `BaseVehicleActor` né `VehicleActor` toccati).