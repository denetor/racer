```md
/grill-me analizza il file `resources/issues/0031-new-physics/specs.md` e la base di codice a cui fa riferimento.
Valuta se ha senso organizzare l'implementazione secondo la sezione 5 "Ordine di costruzione" e eventualmente ridiscutiamola: 
l'obiettivo è che ciascuno step della costruzione sia autoconsistente e verificabile sia con i test automatici che avviando il 
gioco manualmente.
Ricordati di considerare che l'applicazione è sviluppata con ExcaliburJs, quindi si dovrebbero considerare anche le sue 
convenzioni e le sue pratiche.
Scrivi l'elenco degli step per implementare quanto descritto nel file `specs.md' e la loro descrizione 
dettagliata nel file @resources/issues/0031-new-physics/plan-steps.md
```

```md
/grill-me implementazione dello `step0` del file `resources/issues/0031-new-physics/plan-steps.md`.
Fai riferimento alle specifiche nel file `resources/issues/0031-new-physics/specs.md` e alla struttura del software
esistente.
Ricordati di considerare che l'applicazione è sviluppata con ExcaliburJs, quindi si dovrebbero considerare anche le sue
convenzioni e le sue pratiche.

Alla fine scrivi l'output nel file @resources/issues/0031-new-physics/step00/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0031-new-physics/step00/grill-me-out.md . Write the output file in the directory `resources/issues/0031-new-physics/step00/`
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
usa /prd-to-plan con il prd che trovi in @resources/issues/0031-new-physics/step00/prd.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
/implement-plan `Phase 1: Estrazione base a comportamento invariato` at @resources/issues/0031-new-physics/step00/prd-plan.md
```

```md
/implement-plan `Phase 2: Tracer bullet — guida in avanti end-to-end` at @resources/issues/0031-new-physics/step00/prd-plan.md
```

```md
/implement-plan `Phase 3: Tracer bullet — guida in avanti end-to-end` at @resources/issues/0031-new-physics/step00/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software, che è sviluppato con ExcaliburJs, quindi si dovrebbero considerare anche le sue
convenzioni e le sue buone pratiche.
```

```md
/implement-plan `Phase 4: Completamento impalcatura + parità scena` at @resources/issues/0031-new-physics/step00/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software, che è sviluppato con ExcaliburJs, quindi si dovrebbero considerare anche le sue
convenzioni e le sue buone pratiche.
```

```md
/grill-me implementazione dello `step1` del file `resources/issues/0031-new-physics/plan-steps.md`.
Fai riferimento alle specifiche nel file `resources/issues/0031-new-physics/specs.md` e alla struttura del software
esistente.
Ricordati di considerare che l'applicazione è sviluppata con ExcaliburJs, quindi si dovrebbero considerare anche le sue
convenzioni e le sue pratiche.

Alla fine scrivi l'output nel file @resources/issues/0031-new-physics/step01/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0031-new-physics/step01/grill-me-out.md . Write the output file in the directory `resources/issues/0031-new-physics/step01/`
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
usa /prd-to-plan con il prd che trovi in @resources/issues/0031-new-physics/step01/prd.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
/implement-plan `Phase 1: Rotazione end-to-end con imbardata cinematica (tracer della curva)` at @resources/issues/0031-new-physics/step01/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

Output:
```md
Phase 1 is implemented and verified at the automated level (build green, 84/84 unit tests green). Here's what I did.

What I built — Phase 1: end-to-end rotation with kinematic yaw (curve tracer)

Pure functions (vehicle-physics.service.ts) + colocated unit tests:
- integrateBody(state, Fx, Fy, Mz, mass, Iz, dt) — one planar rigid-body step with the cross terms v̇_x = Fx/m + v_y·ω, v̇_y = Fy/m − v_x·ω, ω̇ = Mz/Iz; dt ≤ 0 leaves the state unchanged. New BodyMotion interface.
- kinematicYawRate(vx, steerAngle, wheelbase) — bicycle formula ω = v_x·tan(δ)/L; zero at standstill/zero-steer, sign-flips in reverse, zero for non-positive wheelbase. (This is the function Phase 3 will reuse as the low-speed branch.)
- 10 new tests cover acceleration, torque→yaw, both cross terms, dt≤0, and all yaw sign/zero cases.

System (PhysicDriveUpdateSystem) — integrateLongitudinal → integrateMotion:
- Longitudinal tracer unchanged in spirit (drive ± brake), with linear drag now expressed as a force −m·dragCoeff·v_x so the integrator is purely force-driven.
- Yaw is kinematic (ω = v_x·tan(δ)/L, all speeds, Mz = 0). The lateral force is the kinematic centripetal term m·v_x·ω, which keeps velocity locked to heading (no slip yet) so the path genuinely curves with radius v/ω — this is what integrateBody's cross terms require to turn rather than spin-in-place.  
  It's replaced by the emergent slip-driven tyre force in Phase 2.
- heading rotates by ω·dt and re-normalizes; velBody/yawRate updated; actor.vel written in px; actor.pos never written. Source-agnostic and pedal/steer smoothing unchanged.

HUD (PhysicsDebugHud) — added a yaw: … °/s line (height 76→98), alongside km/h, pedals and aLong.

A note on one design point worth flagging: the plan text says "integrate with cross terms, no real forces." Literally, integrateBody with zero net force keeps world velocity constant — the body would spin while sliding straight, not curve. To get the "coherent finite radius" the acceptance requires while
still genuinely exercising integrateBody, I added the kinematic centripetal force Fy = m·v_x·ω (a constraint force, not a per-wheel tyre force), documented as provisional. It produces a clean kinematic curve and is swapped for the emergent per-wheel Fy/Mz in Phase 2.

Left for you (manual verification, per your workflow)
```

```md
/implement-plan `Phase 2: Modello pneumatico lineare a 4 ruote (imbardata emergente dalle forze)` at @resources/issues/0031-new-physics/step01/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```


```md
  What changed                                                                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                                   
  1. vehicle-physics.service.ts — three new pure functions (SI, body-frame, Excalibur-free):                                                                                                                                                                                                                       
    - wheelVelocity(vx, vy, omega, arm) → {x: vx − ω·r_y, y: vy + ω·r_x} (§3.6)                                                                                                                                                                                                                                    
    - slipAngle(vix, viy, delta) → atan2(viy, vix) − δ                                                                                                                                                                                                                                                             
    - lateralForceLinear(alpha, Cα) → −Cα·α (linear, no saturation)                                                                                                                                                                                                                                                
    - kinematicYawRate is kept (it's reused as the low-speed branch in Phase 3) but no longer in the update flow.                                                                                                                                                                                                  
  2. physic-vehicle.actor.ts — split the single corneringStiffness into corneringStiffnessFront = 40000 / corneringStiffnessRear = 50000 (N/rad per wheel, rear bites more → slight understeer). Added slipAngleFront/slipAngleRear readout fields for the HUD.                                                    
  3. physic-drive-update.system.ts — integrateMotion now drives the yaw from real per-wheel forces instead of the kinematic centripetal term: for each of the 4 wheelArmsBody it computes wheel velocity → slip angle (front subtracts δ, rear 0) → linear lateral force, rotates the front-wheel force by δ into  
  the body frame, then sums net Fx/Fy plus the longitudinal tracer at the COG and the yaw torque Mz = Σ(r_x·F_y − r_y·F_x). integrateBody uses the real yawRate state, so yaw is now genuinely independent of velocity direction.                                                                                  
  4. physics-debug-hud.actor.ts — added a slip f/r: …° / …° line (panel grown to 120px).                                                                                                                                                                                                                           
  5. Tests — added wheelVelocity/slipAngle/lateralForceLinear cases (sign, proportionality, zero-slip, ω=0).
```