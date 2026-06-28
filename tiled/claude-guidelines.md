# Guida: creare/modificare le mappe Tiled del gioco

Documento di riferimento per generare nuove piste `.tmx` (es. `big-playground.tmx`)
**senza dover rileggere il codice dell'applicazione**. Contiene il significato dei
layer, le proprietà esatte che il codice legge, il "vocabolario" dei tile usati per
la grafica curata, e uno script generatore pronto all'uso.

> Creato a partire dall'analisi di `track-playground.tmx` e del codice in `src/`.
> Aggiornare questo file se cambia il modo in cui il codice consuma le mappe.

---

## 1. Formato mappa e tileset

- **Engine**: Excalibur.js + plugin `@excaliburjs/plugin-tiled`. Mappe in formato **Tiled `.tmx`** (XML), encoding layer **CSV**.
- **Orientamento**: `orthogonal`, render order `right-down`.
- **Tile**: `32 × 32` px. Coordinate oggetti in **pixel**: `px = indice_tile × 32`.
- **Mappa originale**: `64 × 64` tile. Una mappa "grande" deve avere lato **≥ 128** (il doppio).
- **Larghezza pista**: **≥ 5 tile** (in `big-playground.tmx` è 8 tile = 256 px).

### Tileset referenziati (file in questa cartella `tiled/`)
| file | firstgid | columns | tilecount | immagine |
|------|---------|---------|-----------|----------|
| `spritesheet_tiles.tsx`   | `1`    | 72 | 5184 | `../public/images/spritesheets/spritesheet_tiles.png` (2304×2304) |
| `spritesheet_objects.tsx` | `5185` | 28 | 812  | `../public/images/spritesheets/spritesheet_objects.png` (918×929) |

Per i tile della pista si usa **solo** `spritesheet_tiles` (GID < 5185).
Si tratta del **Kenney Racing Pack**: asfalto azzurro-grigio + cordoli arancio/bianco
su sfondo terra/sabbia.

### Conversione GID ↔ posizione nello spritesheet
`spritesheet_tiles` ha **72 colonne**, firstgid = 1.
```
indice = GID_base - 1
riga    = indice // 72
colonna = indice % 72
```

### Flag di flip/rotazione (bit alti del GID)
Tiled codifica flip/rotazioni nei 3 bit più alti del GID:
```
FLIP_H (orizzontale)     = 0x80000000
FLIP_V (verticale)       = 0x40000000
FLIP_D (anti-diagonale)  = 0x20000000   # trasposta: scambia righe/colonne
GID_base = GID & 0x1FFFFFFF
```
Ordine di applicazione in rendering: **prima D (trasposta), poi H, poi V**.
Combinando i flag da **un solo** tile si ottengono tutte le 4/8 orientazioni.

---

## 2. Layer grafici (tile layer)

| layer | significato | usato dal codice? |
|-------|-------------|-------------------|
| `background` | terreno di base (terra/sabbia) su tutta la mappa | no (solo grafica) |
| `track`      | asfalto + cordoli della carreggiata | no (solo grafica) |
| `scenery`    | decorazioni opzionali | no |
| `scenery-2`  | decorazioni opzionali | no |

**Importante**: i tile layer sono **puramente grafici**. La fisica/gameplay è guidata
**esclusivamente** dagli object group (sezione 3). La grafica e gli object group vanno
quindi tenuti **allineati a mano** (stessa geometria in pixel).

`scenery`/`scenery-2` possono essere omessi senza rompere nulla.

### Vocabolario tile usato per la pista "curata"
Tutti GID **base** (senza flag), tileset `spritesheet_tiles`:

| ruolo | GID | note |
|-------|-----|------|
| **asfalto pieno** | `3035` | tinta uniforme; equivalenti: 2962-2964, 3034-3036, 3106-3108 |
| **cordolo dritto — arancio** | `2901` | banda cordolo sul lato **NORD** del tile (asfalto sotto) |
| **cordolo dritto — bianco**  | `2902` | banda cordolo sul lato **NORD** del tile (asfalto sotto) |
| **angolo arrotondato (1 tile)** | `2829` | arco cordolo nel quadrante **NW**, asfalto a SE (convesso) |
| **sfondo terra (base 4×4)** | vedi sotto | pattern ripetuto |

Pattern sfondo `background` (ripetuto ogni 4×4 tile, `BG[riga%4][col%4]`):
```
577 578 579 580
649 650 651 652
721 722 723 724
793 794 795 796
```

#### Derivazione orientazioni tramite flip
Partendo dai tile base sopra:

Cordolo dritto (alterna arancio `2901` / bianco `2902` per le striature):
- **NORD** (terra sopra, asfalto sotto): GID base
- **SUD**  (terra sotto): `| FLIP_V`
- **OVEST** (terra a sinistra): `| FLIP_D`
- **EST**  (terra a destra): `| FLIP_D | FLIP_H`

Angolo convesso `2829` (arco nel quadrante che dà sulla terra):
- terra a **N+O** (angolo alto-sx): GID base
- terra a **N+E**: `| FLIP_H`
- terra a **S+O**: `| FLIP_V`
- terra a **S+E**: `| FLIP_H | FLIP_V`

Gli **angoli interni concavi** (angoli dell'infield) riusano lo stesso tile `2829`
con il flip *opposto* a quello dell'angolo esterno corrispondente: visivamente
l'arco avvolge correttamente l'angolo dell'infield.

L'alternanza arancio/bianco del cordolo si ottiene con la parità della posizione,
es. `arancio se (riga+colonna) % 2 == 0 altrimenti bianco`.

---

## 3. Object group (gameplay/fisica) — quello che il codice legge

Il plugin Tiled identifica la "classe" di un oggetto tramite l'attributo **`type`**
dell'elemento `<object>`. I servizi usano `getObjectsByClassName('<type>')`.
Coordinate `x,y` = **angolo in alto a sinistra** (anchor 0,0), in **pixel**.

### 3.1 `terrains` — superfici fisiche (`type="surface"`)
Ogni superficie ha una property **`terrainType`** (il codice la legge in minuscolo come
`terraintype`). Valori e parametri fisici applicati:

| `terrainType` | power | drag | grip | tag aggiunto |
|---------------|-------|------|------|--------------|
| `tarmac`      | 1.0   | 0.05 | 1.0  | `surface-tarmac` |
| `grass`       | 0.6   | 0.5  | 0.5  | `surface-grass` |
| `graveltrap`  | 0.3   | 15   | 0.5  | `surface-graveltrap` |

Regole pratiche:
- Coprire **tutta** la zona guidabile: `tarmac` sotto la carreggiata, `grass` su
  infield e margini esterni. Fuori da ogni superficie vale un grip di default → meglio
  coprire esplicitamente con `grass`.
- Sono ammessi **rettangoli** (`width`/`height`) o **poligoni** (`<polygon points=...>`).
- Le superfici possono sovrapporsi: il codice gestisce uno "stack" con regola
  *last-wins*. Per robustezza, però, conviene tenere `grass` e `tarmac` **non
  sovrapposti** (adiacenti, bordo contro bordo).

Esempio oggetto:
```xml
<object id="1" name="tarmac-top" type="surface" x="448" y="448" width="3200" height="256">
 <properties>
  <property name="terrainType" value="tarmac"/>
 </properties>
</object>
```

### 3.2 `grid` — posizioni di partenza (`type="gridposition"`)
- L'`heading` è un **attributo diretto** sull'`<object>` (radianti), più un `<point/>`.
- **Il codice usa solo il PRIMO oggetto** del gruppo come spawn del player
  (`positionObjects[0]`). Gli altri sono decorativi/futuri: metterne 4 per coerenza
  con l'originale, ma `pos-1` è quello che conta.
- Spawn deve cadere **sull'asfalto**.

**Convenzione angoli (Excalibur, y verso il basso):**
```
0      = EST   (destra,  +x)
π/2    = SUD   (giù,     +y)   ≈ 1.570796
π      = OVEST (sinistra,-x)   ≈ 3.141593
3π/2   = NORD  (su,      -y)
```

```xml
<object id="10" type="gridposition" name="pos-1" heading="3.14159265" x="2240" y="3456">
 <point/>
</object>
```

### 3.3 `checkpoints` — traguardo e checkpoint (`type="checkpoint"`)
- Vengono istanziati come `CheckpointActor` (collisione **Passive**); contano i giri
  quando il "transponder" del veicolo li attraversa.
- **Nomi significativi**:
  - `finish-line` → traguardo (chiude il giro). **Obbligatorio** e con questo nome esatto.
  - `checkpoint-<N>` → checkpoint con **ordine = numero finale del nome**
    (es. `checkpoint-1`, `checkpoint-2`, …). L'ordine deve seguire il **senso di marcia**.
- Il conteggio `totalCheckpoints` = numero di checkpoint **escluso** `finish-line`.
- Geometria: rettangolo **sottile** che attraversa tutta la carreggiata
  (verticale sui rettilinei orizzontali, orizzontale su quelli verticali).

```xml
<object id="14" name="finish-line"  type="checkpoint" x="2016" y="3392" width="16"  height="256"/>
<object id="15" name="checkpoint-1" type="checkpoint" x="448"  y="2032" width="256" height="16"/>
```

### 3.4 `obstacles` — barriere (`type="obstacle"`)
- Diventano corpi a collisione **Fixed** (il veicolo ci rimbalza).
- Usi tipici: **blocco pieno dell'infield** (impedisce di tagliare) + **muri sottili**
  appena fuori dal bordo esterno (tengono l'auto in pista).

```xml
<object id="18" name="infield"  type="obstacle" x="704" y="704" width="2688" height="2688"/>
<object id="19" name="wall-top" type="obstacle" x="448" y="440" width="3200" height="8"/>
```

---

## 4. Come il gioco carica la mappa

- La mappa attiva è hard-coded in **`src/resources.ts`**:
  ```ts
  playgroundMap: new TiledResource('./tiled/track-playground.tmx', {
    strict: false,
    entityClassNameFactories: { checkpoint: CheckpointActor.factory },
  })
  ```
- Per provare una mappa diversa: cambiare quel path (es. `./tiled/big-playground.tmx`)
  **oppure** aggiungere una seconda `TiledResource`.
- ⚠️ Cambiare la mappa attiva **altera gli screenshot di riferimento Playwright**
  (`tests/main.spec.ts-snapshots/`): vanno rigenerati con
  `npm run test:integration-update`.
- Il `.tmx` **non** è importato dal codice TypeScript: aggiungere/modificare una mappa
  non richiede ricompilare per essere valido; basta che l'XML sia ben formato e i tileset
  `.tsx` siano presenti in `tiled/`.

---

## 5. Ricetta per una nuova pista ad anello

1. **Geometria** (in tile): rettangolo esterno `[O0..O1]²`, foro interno (infield)
   `[O0+W .. O1-W]²`, con `W` = larghezza carreggiata (≥ 5, consigliato 6-8).
   L'asfalto = "dentro l'esterno **e non** dentro il foro".
2. **`background`**: riempire tutto col pattern terra 4×4.
3. **`track`**: per ogni cella d'asfalto guardare i 4 vicini (N/E/S/O); se uno è terra →
   cordolo dritto in quella direzione; se due ortogonali → angolo convesso `2829` flippato;
   se solo un vicino diagonale è terra → angolo concavo (`2829` con flip opposto); altrimenti
   asfalto pieno `3035`.
4. **Object group**: generare `terrains` (anello tarmac + grass infield/margini),
   `grid` (start sul rettilineo, `heading` coerente), `checkpoints`
   (`finish-line` + `checkpoint-1..N` nel senso di marcia), `obstacles`
   (blocco infield + 4 muri esterni). Tutto in **pixel** (`tile×32`).
5. **ID univoci**: `nextlayerid`/`nextobjectid` nel tag `<map>` devono superare il
   massimo usato; ogni `<object>` e `<layer>`/`<objectgroup>` ha `id` univoco.
6. **Verifica** renderizzando (vedi sezione 7) e controllando l'allineamento
   grafica ↔ object group.

---

## 6. Script generatore (riutilizzabile)

Eseguire **dalla root del repo**. Richiede `Pillow` solo per il render opzionale
(`pip install pillow`). Produce `tiled/big-playground.tmx`.

```python
#!/usr/bin/env python3
"""Genera una pista ad anello arrotondata in formato Tiled .tmx."""

SIZE = 128          # lato mappa in tile (>= 128 = doppio dell'originale)
TS   = 32           # px per tile
O0   = 14           # inizio rettangolo esterno (riga & colonna)
O1   = SIZE-1-14    # fine rettangolo esterno (incluso) = 113
W    = 8            # larghezza carreggiata in tile (>= 5)

ASPHALT = 3035; KERB_O = 2901; KERB_W = 2902; CORNER = 2829
FH=0x80000000; FV=0x40000000; FD=0x20000000
BG = [[577,578,579,580],[649,650,651,652],[721,722,723,724],[793,794,795,796]]

def in_outer(r,c): return O0<=r<=O1 and O0<=c<=O1
def in_hole(r,c):  return (O0+W)<=r<=(O1-W) and (O0+W)<=c<=(O1-W)
def is_asphalt(r,c): return in_outer(r,c) and not in_hole(r,c)
def dirt(r,c): return not is_asphalt(r,c)

bg    = [[BG[r%4][c%4] for c in range(SIZE)] for r in range(SIZE)]
track = [[0]*SIZE for _ in range(SIZE)]

def dash(r,c,flip):
    g = KERB_O if (r+c)%2==0 else KERB_W
    return g | flip

for r in range(SIZE):
    for c in range(SIZE):
        if not is_asphalt(r,c): continue
        n,s,e,w = dirt(r-1,c),dirt(r+1,c),dirt(r,c+1),dirt(r,c-1)
        if   n and w: track[r][c]=CORNER
        elif n and e: track[r][c]=CORNER|FH
        elif s and w: track[r][c]=CORNER|FV
        elif s and e: track[r][c]=CORNER|FH|FV
        elif n: track[r][c]=dash(r,c,0)
        elif s: track[r][c]=dash(r,c,FV)
        elif w: track[r][c]=dash(r,c,FD)
        elif e: track[r][c]=dash(r,c,FD|FH)
        else:
            ne,nw,se,sw = dirt(r-1,c+1),dirt(r-1,c-1),dirt(r+1,c+1),dirt(r+1,c-1)
            if   se: track[r][c]=CORNER|FH|FV
            elif sw: track[r][c]=CORNER|FV
            elif ne: track[r][c]=CORNER|FH
            elif nw: track[r][c]=CORNER
            else:    track[r][c]=ASPHALT

def csv(layer):
    return '\n'.join(','.join(map(str,layer[r])) + (',' if r<SIZE-1 else '')
                     for r in range(SIZE))

# ---- object group (coordinate in pixel) ----
P=TS
ox0=oy0=O0*P; osz=(O1-O0+1)*P; band=W*P
hx0=hy0=(O0+W)*P; hsz=(O1-W-(O0+W)+1)*P; MAP=SIZE*P
_id=[0]
def oid(): _id[0]+=1; return _id[0]
def surf(name,t,x,y,w,h):
    return (f'  <object id="{oid()}" name="{name}" type="surface" x="{x}" y="{y}" '
            f'width="{w}" height="{h}">\n   <properties>\n'
            f'    <property name="terrainType" value="{t}"/>\n   </properties>\n  </object>')
def rect(cls,name,x,y,w,h):
    return f'  <object id="{oid()}" name="{name}" type="{cls}" x="{x}" y="{y}" width="{w}" height="{h}"/>'

terrains=[surf('tarmac-top','tarmac',ox0,oy0,osz,band),
          surf('tarmac-bottom','tarmac',ox0,oy0+osz-band,osz,band),
          surf('tarmac-left','tarmac',ox0,oy0,band,osz),
          surf('tarmac-right','tarmac',ox0+osz-band,oy0,band,osz),
          surf('grass-infield','grass',hx0,hy0,hsz,hsz),
          surf('grass-top','grass',0,0,MAP,oy0),
          surf('grass-bottom','grass',0,oy0+osz,MAP,MAP-(oy0+osz)),
          surf('grass-left','grass',0,oy0,ox0,osz),
          surf('grass-right','grass',ox0+osz,oy0,MAP-(ox0+osz),osz)]

HEAD=3.14159265                       # ovest: start sul rettilineo basso
cy_n=oy0+osz-band+band//4; cy_s=oy0+osz-band+(band*3)//4
def gp(name,x,y):
    return (f'  <object id="{oid()}" type="gridposition" name="{name}" '
            f'heading="{HEAD}" x="{x}" y="{y}">\n   <point/>\n  </object>')
grid=[gp('pos-1',2240,cy_n),gp('pos-2',2240,cy_s),gp('pos-3',2440,cy_n),gp('pos-4',2440,cy_s)]

mid=oy0+osz//2-P//2
checkpoints=[rect('checkpoint','finish-line',2016,oy0+osz-band,16,band),
             rect('checkpoint','checkpoint-1',ox0,mid,band,16),
             rect('checkpoint','checkpoint-2',2048,oy0,16,band),
             rect('checkpoint','checkpoint-3',ox0+osz-band,mid,band,16)]

obstacles=[rect('obstacle','infield',hx0,hy0,hsz,hsz),
           rect('obstacle','wall-top',ox0,oy0-8,osz,8),
           rect('obstacle','wall-bottom',ox0,oy0+osz,osz,8),
           rect('obstacle','wall-left',ox0-8,oy0,8,osz),
           rect('obstacle','wall-right',ox0+osz,oy0,8,osz)]

nl=chr(10)
tmx=f'''<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.12.2-2-geb83ddb9" orientation="orthogonal" renderorder="right-down" width="{SIZE}" height="{SIZE}" tilewidth="{TS}" tileheight="{TS}" infinite="0" nextlayerid="7" nextobjectid="{_id[0]+1}">
 <tileset firstgid="1" source="spritesheet_tiles.tsx"/>
 <tileset firstgid="5185" source="spritesheet_objects.tsx"/>
 <layer id="1" name="background" width="{SIZE}" height="{SIZE}">
  <data encoding="csv">
{csv(bg)}
</data>
 </layer>
 <layer id="2" name="track" width="{SIZE}" height="{SIZE}">
  <data encoding="csv">
{csv(track)}
</data>
 </layer>
 <objectgroup id="3" name="terrains">
{nl.join(terrains)}
 </objectgroup>
 <objectgroup id="4" name="grid">
{nl.join(grid)}
 </objectgroup>
 <objectgroup id="5" name="checkpoints">
{nl.join(checkpoints)}
 </objectgroup>
 <objectgroup id="6" name="obstacles">
{nl.join(obstacles)}
 </objectgroup>
</map>
'''
open('tiled/big-playground.tmx','w').write(tmx)
print('scritto tiled/big-playground.tmx — oggetti:', _id[0])
```

---

## 7. Verifica (render con Pillow, opzionale)

Per controllare grafica e allineamento degli object group senza avviare il gioco:

```python
from PIL import Image
sheet=Image.open('public/images/spritesheets/spritesheet_tiles.png').convert('RGBA')
COLS=72; TS=32; MASK=0x1FFFFFFF; FH=0x80000000; FV=0x40000000; FD=0x20000000
def tile(gid):
    b=gid&MASK
    if b==0: return None
    i=b-1; t=sheet.crop(((i%COLS)*TS,(i//COLS)*TS,(i%COLS)*TS+TS,(i//COLS)*TS+TS))
    if gid&FD: t=t.transpose(Image.TRANSPOSE)
    if gid&FH: t=t.transpose(Image.FLIP_LEFT_RIGHT)
    if gid&FV: t=t.transpose(Image.FLIP_TOP_BOTTOM)
    return t
# comporre i layer bg/track su un canvas (SIZE*TS)² e salvare ridotto per ispezione
```
Sovrapporre poi i rettangoli degli object group (leggendo `x/y/width/height` dall'XML)
per verificare che cordoli, superfici, checkpoint e griglia coincidano con l'asfalto.

---

## 8. Checklist finale

- [ ] Lato mappa ≥ 128 tile; carreggiata ≥ 5 tile.
- [ ] `track` allineato a `terrains` (asfalto ↔ tarmac).
- [ ] `grass` copre infield + margini esterni; nessun buco "fuori superficie".
- [ ] `grid` ha `pos-1` sull'asfalto con `heading` nel senso di marcia.
- [ ] `checkpoints` ha `finish-line` + `checkpoint-1..N` ordinati nel senso di marcia,
      ognuno attraversa tutta la carreggiata.
- [ ] `obstacles`: infield pieno + muri esterni.
- [ ] `nextlayerid`/`nextobjectid` e tutti gli `id` coerenti/univoci.
- [ ] XML ben formato (`python3 -c "import xml.dom.minidom as m; m.parse('tiled/<file>.tmx')"`).
- [ ] (Se si cambia mappa attiva in `resources.ts`) rigenerare i baseline Playwright.
