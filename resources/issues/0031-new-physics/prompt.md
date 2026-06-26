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


---
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


---
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


```md
/implement-plan `Phase 3: Blend a bassa velocità (stabilità da fermo)` at @resources/issues/0031-new-physics/step01/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
What changed

1. vehicle-physics.service.ts — new pure function lowSpeedKinematicBlend(speed, threshold, vx, steerAngle, wheelbase) returning {lateralScale, kinematicYaw}:                                                                                                                                                    
   - lateralScale = clamp(speed/threshold, 0, 1) — 0 at standstill (fully kinematic), 1 at/above threshold (fully dynamic); a non-positive threshold disables the blend.                                                                                                                                          
   - kinematicYaw reuses kinematicYawRate (the Phase 1 bicycle formula v_x·tan(δ)/L), exactly as the plan intended.
2. physic-drive-update.system.ts — integrateMotion now keeps the longitudinal tracer (fxTracer, always full) separate from the per-wheel tyre forces (fxTyre/fyTyre/mzTyre). It then:
  - scales the tyre forces by k (→ 0 at standstill, killing the atan2 noise and the sideways "tangent launch"),                                                                                                                                                                                                  
  - blends the integrated yaw toward the kinematic value: omega = k·dynamic + (1−k)·kinematicYaw.                                                                                                                                                                                                              
  - At k = 1 the result is identical to Phase 2 (no regression at cruising speed); at k = 0 the car follows the stable kinematic model.                                                                                                                                                                          
  - Threshold comes from the shared LOW_SPEED_BLEND_THRESHOLD constant — no magic numbers in the system.                                                                                                                                                                                                         
3. Tests — 5 cases for lowSpeedKinematicBlend: standstill (k=0), at/above threshold (k=1), linear mid-range (k=0.5), the kinematic yaw value, and the non-positive-threshold guard.                                                                                                                              
                                                                                                                                                                                                                                                                                                                   
Verification: npm run build green; npm run test:unit 97/97 green.                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                   
For you (manual verification — Step 1 closeout): the grill-me-out checklist is now drivable with START_SCENE='physics':                                                                                                                                                                                          
- straight at zero steer; coherent finite-radius curve; no vibration / tangent-launch from a standstill (blend active); smooth, stable cornering at speed; HUD yawRate + front/rear slip coherent.                                                                                                               
- ⚠️ Reminder from Phase 2: src/main.ts is still committed with START_SCENE='physics'. Flip it back to 'playground' before committing to keep the Playwright baseline intact.                                                                                                                                    
                                                                                                                                                                                                                                                                                                               
If the car oscillates or the understeer feels off while driving, the tuning knobs are corneringStiffnessFront/Rear and Iz on the actor, and LOW_SPEED_BLEND_THRESHOLD for the blend.
```


---
```md
/grill-me implementazione dello `step2` del file `resources/issues/0031-new-physics/plan-steps.md`.
Fai riferimento alle specifiche nel file `resources/issues/0031-new-physics/specs.md` e alla struttura del software
esistente.
Ricordati di considerare che l'applicazione è sviluppata con ExcaliburJs, quindi si dovrebbero considerare anche le sue
convenzioni e le sue pratiche.

Alla fine scrivi l'output nel file @resources/issues/0031-new-physics/step02/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0031-new-physics/step02/grill-me-out.md . Write the output file in the directory `resources/issues/0031-new-physics/step02/`
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
usa /prd-to-plan con il prd che trovi in @resources/issues/0031-new-physics/step02/prd.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```


```md
/implement-plan `Phase 1: Grip per-ruota reale (rilevazione superficie live)` at @resources/issues/0031-new-physics/step02/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

Output:
```md
Phase 1 — Grip per-ruota reale (rilevazione superficie live)                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                                   
1. src/constants/physics.constants.ts — added DEFAULT_SURFACE_GRIP = 1.0 (fallback μ for a wheel off every surface; no magic numbers in systems).                                                                                                                                                                
                                                                                                                                                                                                                                                                                                               
2. src/models/wheel-state.model.ts (new) — WheelState for the force-based path only: gripSurface (μ), load (Fz), slipAngle, saturated, and the surfaces[] stack. Parallel to the legacy WheelFactor, which is untouched.                                                                                         
                                                                                                                                                                                                                                                                                                               
3. src/actors/physic-vehicle.actor.ts — added wheelStates: Map<string, WheelState> (4 wheel keys) and an onInitialize override that, after super, sets the four wheel child colliders to CollisionType.Passive. BaseVehicleActor/VehicleActor are untouched.                                                     
                                                                                                                                                                                                                                                                                                               
4. src/services/surfaces.service.ts — collisionstart now branches on instanceof PhysicVehicleActor (push surface on the wheel's stack → recompute grip) vs VehicleActor (legacy wheelFactors, inert for the new actor). Added a symmetric collisionend (remove surface from stack → recompute). Resolution is    
"last-wins" via resolveGrip, falling back to DEFAULT_SURFACE_GRIP. The wheel-name guard is shared via WHEEL_NAMES.                                                                                                                                                                                               
                                                                                                                                                                                                                                                                                                               
5. src/ui/physics-debug-hud.actor.ts — added a 2×2 grid (FL/FR over RL/RR) showing live per-wheel grip μ, so surface sensing is verifiable end-to-end. HUD height grew to fit.                                                                                                                                   
                                                                                                                                                                                                                                                                                                               
No forces changed — grip is sensed and displayed but not yet consumed by physics, so the car drives exactly as in Step 1.                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                               
Verification                                                                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                               
- npm run build — green                                                                                                                                                                                                                                                                                          
- npm run test:unit — 97 passed (unchanged; Phase 1 adds no pure functions — staticLoad/clampToFrictionCircle come in Phases 2–3)                                                                                                                                                                                
 
```


```md
/implement-plan `Phase 2: Carico statico per-ruota ('staticLoad') + HUD 'Fz'` at @resources/issues/0031-new-physics/step02/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

Output:
```md
1. src/services/vehicle-physics.service.ts (pure module)                                                                                                                                                                                                                                                         
- Moved WheelArms here (from the actor) and added WheelLoads, so the new pure function is self-contained.                                                                                                                                                                                                        
- Added staticLoad(totalMass, g, arms) → four Fz (N). Longitudinal split (front = b/L, rear = a/L) then lateral split per axle, derived entirely from the COG-relative wheel arms — so a COG decentred both longitudinally and laterally works for free. cogHeight does not enter (that's load transfer, Step 3).
Each Fz clamped ≥ 0; the four sum to totalMass·g.                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                               
2. src/actors/physic-vehicle.actor.ts — now imports WheelArms from the service instead of redefining it (no circular import; the actor already imports from the service).                                                                                                                                        
                                                                                                                                                                                                                                                                                                               
3. src/systems/physic-drive-update.system.ts — each frame computes staticLoad(vehicle.totalMass, G, arms) (totalMass = chassis + fuel, the single source of truth) and writes load onto each WheelState. The per-wheel loop now carries the wheel name (typed keyof WheelLoads), ready for Phase 3's per-wheel   
slip/saturation. Loads are stored but not consumed — the friction circle is Phase 3, so driving is identical to Phase 1.                                                                                                                                                                                         
                                                                                                                                                                                                                                                                                                               
4. src/ui/physics-debug-hud.actor.ts — the 2×2 grid now shows Fz (N) under the grip μ for each wheel; HUD height grown to fit.                                                                                                                                                                                   
                                                                                                                                                                                                                                                                                                               
5. src/services/vehicle-physics.service.test.ts — 4 new staticLoad tests: centred COG → four equal quarters (totalMass·g/4); COG forward → front axle more loaded (and exactly 0.6·W for the chosen geometry); four Fz sum to totalMass·g; lateral-decentred COG loads the leaning side more.                    
                                                                                                                                                                                                                                                                                                               
Verification                                                                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                               
- npm run build — green                                                                                                                                                                                                                                                                                          
- npm run test:unit — 101 passed (4 new)                                                                                                                                                                                                                                                                         
- Production playground scene untouched → Playwright baseline unaffected.                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                               
Manual check (you drive, START_SCENE='physics')                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                               
Confirm the HUD 2×2 grid shows coherent Fz per wheel (≈ equal quarters at the default centred COG, summing to ~`totalMass·9.81 ≈ 10453Ntotal =mass 1000 + fuel 60` × 9.81), and that driving feel is unchanged vs Phase 1. 
```


```md
/implement-plan `Phase 3: Cerchio di aderenza laterale + comportamenti emergenti` at @resources/issues/0031-new-physics/step02/prd-plan.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

Output:
```md
1. src/services/vehicle-physics.service.ts — added pure clampToFrictionCircle(fx, fy, mu, fz) → {fx, fy, saturated}. Inside the circle → unchanged; outside → scaled to radius μ·Fz preserving direction, saturated = true. Written in the general combined form (reused at Step 4); Fz = 0/μ = 0 → zero force;  
zero demand stays zero and unsaturated.                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                               
2. src/systems/physic-drive-update.system.ts — the per-wheel loop now consumes grip and load: μ_i = wheelStates[name].gripSurface, Fz_i = load, and clampToFrictionCircle(0, fLat, μ_i, Fz_i) clamps each wheel's lateral force before the sum. It writes slipAngle and saturated onto each WheelState, rotates  
the clamped force by δ, and sums into Fx/Fy/Mz. Order is exactly the plan's: clamp (physical limit) → sum → low-speed blend (numerical stabiliser) → integrate. The longitudinal tracer at the COG stays un-clamped. Asymmetric saturation (front/rear, grass-side/tarmac-side) now produces the yaw torque that 
makes the car slide and pull.                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                               
3. src/ui/physics-debug-hud.actor.ts — each 2×2 cell now shows μ, Fz and slip (°), and the whole wheel block turns red when that tyre is saturated. Refactored the grid into a wheelCell helper; HUD height grown to fit.                                                                                        
                                                                                                                                                                                                                                                                                                               
4. src/services/vehicle-physics.service.test.ts — 5 new tests: inside-circle unchanged/unsaturated; outside scaled to μ·Fz + saturated (the Fx = 0 Step-2 case); combined fx/fy direction preserved; Fz = 0 collapses to zero force + saturated; zero demand stays zero/unsaturated.                             
                                                                                                                                                                                                                                                                                                               
Verification                                                                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                               
- npm run build — green                                                                                                                                                                                                                                                                                          
- npm run test:unit — 106 passed (5 new clampToFrictionCircle)                                                                                                                                                                                                                                                   
- Production playground scene untouched → Playwright baseline unaffected.                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                               
Manual check (you drive, START_SCENE='physics')                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                               
- Tight corner at high speed → the car slides/widens instead of turning on rails; saturated wheels light red.                                                                                                                                                                                                    
- Half on grass → the car "pulls" to one side (yaw torque from asymmetric grip).                                                                                                                                                                                                                                 
- Cruise / gentle curve → stable (like Step 1 until saturation); standstill → no jitter (blend active).                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                               
One thing to watch while tuning: the saturated flag is computed pre-blend (as the plan specifies), so a steered front wheel can read red even at standstill — the motion stays correct (blend scales the force to ~0), it's only the HUD flag. If that's distracting, it's a tuning detail, not a logic change.  
Tuning knobs per the grill: per-surface gripFactor, corneringStiffnessFront/Rear, cogPosition. 
```


---
```md
/grill-me implementazione dello `step3` del file `resources/issues/0031-new-physics/plan-steps.md`.
Fai riferimento alle specifiche nel file `resources/issues/0031-new-physics/specs.md` e alla struttura del software
esistente.
Ricordati di considerare che l'applicazione è sviluppata con ExcaliburJs, quindi si dovrebbero considerare anche le sue
convenzioni e le sue pratiche.

Alla fine scrivi l'output nel file @resources/issues/0031-new-physics/step03/grill-me-out.md
```

```md
use /write-a-prd about the decisions just taken and listed in @resources/issues/0031-new-physics/step03/grill-me-out.md . Write the output file in the directory `resources/issues/0031-new-physics/step03/`
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```

```md
usa /prd-to-plan con il prd che trovi in @resources/issues/0031-new-physics/step03/prd.md
Nel file `resources/issues/0031-new-physics/specs.md` trovi le specifiche del risultato finale
Considera anche la struttura attuale del software
```