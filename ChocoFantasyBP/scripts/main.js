import { world, system, InputButton, ButtonState } from "@minecraft/server";

// ==========================================
// CONSTANTES Y CONFIGURACIÓN DINÁMICA
// ==========================================
const CHOCOBO_IDENTIFIER = "cf:chocobo_yellow_1";

// Velocidades horizontales (XZ)
const CRUISE_HORIZONTAL_SPEED = 1.25;   // Velocidad crucero en el aire (WASD normal, equilibrada y controlable)
const SPRINT_HORIZONTAL_SPEED = 2.80;   // Velocidad con sprint / acelerón aéreo (Doble toque a W)

// Velocidades de ascenso (Y positivo)
const NORMAL_ASCENT_SPEED = 0.85;       // Ascenso normal manteniendo Space
const SPRINT_ASCENT_SPEED = 1.30;       // Ascenso turbo (Sprint + Space)

// Velocidades de planeo y picado (Y negativo)
const GLIDE_DESCENT_SPEED = -0.05;      // Planeo suave/sustentación (mirando al horizonte)
const DIVE_DESCENT_SPEED = -1.20;       // Picado rápido / Fast dive (mirando al suelo)
const GRAVITY_DECEL = 0.12;            // Agilidad en la transición de velocidad vertical

const INERTIA_DAMPING = 0.85;          // Factor de amortiguación al soltar WASD

// ==========================================
// ESTADO DE VUELO DE LAS MONTURAS
// Map<string, { state: "ASCENDING" | "HOVERING" | "DESCENDING", hasLeftGround: boolean, hoverY?: number, pressStartY?: number }>
// ==========================================
const flightStates = new Map();
const playerRidingTracker = new Map();

/**
 * Valida si la montura cumple todos los requisitos indispensables para volar:
 * 1. Existir y ser válida.
 * 2. Ser un Chocobo amarillo (cf:chocobo_yellow_1).
 * 3. Estar domesticada (minecraft:is_tamed).
 * 4. Tener silla de montar equipada (minecraft:is_saddled).
 */
function canFly(mount) {
    if (!mount || !mount.isValid || mount.typeId !== CHOCOBO_IDENTIFIER) {
        return false;
    }
    const isTamed = mount.hasComponent("minecraft:is_tamed");
    const isSaddled = mount.hasComponent("minecraft:is_saddled");
    return isTamed && isSaddled;
}

// ==========================================
// MONITOR DE MONTAJE / DESMONTAJE
// ==========================================
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const wasRiding = playerRidingTracker.get(player.id) ?? false;
            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            const isRiding = !!mount;

            if (!wasRiding && isRiding) {
                const isTamed = mount.hasComponent("minecraft:is_tamed");
                const isSaddled = mount.hasComponent("minecraft:is_saddled");
                const canPowerJump = mount.hasComponent("minecraft:can_power_jump");
                console.warn(`[ChocoDebug] Montado en: ${mount.typeId} | is_tamed: ${isTamed} | is_saddled: ${isSaddled} | can_power_jump: ${canPowerJump}`);
            } else if (wasRiding && !isRiding) {
                console.warn(`[ChocoDebug] Evento: Jugador desmontado.`);
            }

            playerRidingTracker.set(player.id, isRiding);
        } catch {}
    }
}, 1);

// ==========================================
// GESTIÓN DE EVENTOS DE ENTRADA (BOTÓN SALTO)
// Máquina de estados: ASCENDING / HOVERING / DESCENDING
// ==========================================
const TAP_TICK_THRESHOLD = 7; // Umbral de ticks (~350ms) para distinguir Toque Corto (Tap) de Mantener

world.afterEvents.playerButtonInput.subscribe((event) => {
    const { player, button, newButtonState } = event;

    if (button !== InputButton.Jump) return;

    try {
        const riding = player.getComponent("minecraft:riding");
        const mount = riding?.entityRidingOn;

        const isPressed = newButtonState === ButtonState.Pressed;

        if (!mount) return;

        const flyable = canFly(mount);
        if (!flyable) return;

        let flightData = flightStates.get(mount.id);
        const currentTick = system.currentTick;

        if (isPressed) {
            // Registrar momento y altura exacta de pulsación para medir si fue un tap o si se mantiene
            const currentY = mount.location.y;
            if (!flightData) {
                flightData = {
                    state: "ASCENDING",
                    hasLeftGround: false,
                    jumpPressTick: currentTick,
                    pressStartY: currentY,
                    prevStateBeforePress: "GROUND"
                };
                flightStates.set(mount.id, flightData);
            } else {
                flightData.prevStateBeforePress = flightData.state;
                flightData.jumpPressTick = currentTick;
                flightData.pressStartY = currentY;
                flightData.state = "ASCENDING";
                flightData.hoverY = undefined; // Descongelar altura al subir
            }

            console.warn(`[ChocoDebug] Boton SALTO: PRESIONADO -> ASCENDING`);
            mount.triggerEvent("cf:chocobo_start_flying");
        } else {
            // Botón Salto LIBERADO: Evaluar si fue un Toque Corto (Tap) o Salto Mantenido
            if (!flightData) return;

            const pressDuration = currentTick - (flightData.jumpPressTick ?? currentTick);
            const wasTap = pressDuration <= TAP_TICK_THRESHOLD;

            if (wasTap) {
                // TOQUE CORTO (TAP): Conmuta entre HOVERING (Suspensión estática) y DESCENDING
                if (flightData.prevStateBeforePress === "HOVERING") {
                    // Si ya estaba en suspensión -> Un toque reanuda el descenso
                    flightData.state = "DESCENDING";
                    flightData.hoverY = undefined;
                    console.warn(`[ChocoDebug] [Tap] Suspensión DESACTIVADA -> Modo Descenso/Planeo`);
                    mount.triggerEvent("cf:chocobo_start_descending");
                } else {
                    // Si estaba descendiendo o en otra maniobra -> Un toque activa SUSPENSIÓN ESTÁTICA
                    flightData.state = "HOVERING";
                    // Fijar exactamente la altitud de cuando se presionó el botón (no la ganada durante los ticks del tap)
                    flightData.hoverY = flightData.pressStartY ?? mount.location.y;
                    console.warn(`[ChocoDebug] [Tap] ¡Modo Suspensión ACTIVADO! Altitud Y congelada exactamente en: ${flightData.hoverY.toFixed(1)}`);
                    mount.triggerEvent("cf:chocobo_start_flying"); // Sin gravedad vanilla para flotar limpio
                }
            } else {
                // SALTO MANTENIDO Y SOLTADO: Transición normal a descenso
                flightData.state = "DESCENDING";
                flightData.hoverY = undefined;
                console.warn(`[ChocoDebug] Salto mantenido liberado (${pressDuration} ticks) -> Modo Descenso/Planeo`);
                mount.triggerEvent("cf:chocobo_start_descending");
            }
        }
    } catch (err) {
        console.warn(`[ChocoDebug Error] ${err}`);
    }
});

// ==========================================
// CONTROLADOR DE VUELO POR TICK (Script API)
// ==========================================
system.runInterval(() => {
    // 1. Limpieza de estados huérfanos (si la montura ya no existe o no tiene jinete)
    if (flightStates.size > 0) {
        const activeMountIds = new Set();
        for (const player of world.getAllPlayers()) {
            try {
                const riding = player.getComponent("minecraft:riding");
                if (riding?.entityRidingOn?.id) {
                    activeMountIds.add(riding.entityRidingOn.id);
                }
            } catch {}
        }
        for (const mountId of flightStates.keys()) {
            if (!activeMountIds.has(mountId)) {
                flightStates.delete(mountId);
            }
        }
    }

    // 2. Procesamiento de jugadores volando
    for (const player of world.getAllPlayers()) {
        try {
            if (!player || !player.isValid) continue;

            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            if (!mount || !mount.isValid || mount.typeId !== CHOCOBO_IDENTIFIER) continue;

            const flightData = flightStates.get(mount.id);

            // Si no está registrado en vuelo, está en modo terrestre nativo
            if (!flightData) continue;

            // Validación estricta en vuelo: si pierde la silla o se des-domestica en el aire
            if (!canFly(mount)) {
                console.warn(`[ChocoDebug] Perdio requisitos de vuelo en el aire. Cancelando...`);
                mount.clearVelocity();
                mount.triggerEvent("cf:chocobo_stop_flying");
                flightStates.delete(mount.id);
                continue;
            }

            // Registrar cuándo realmente abandona el suelo
            if (!mount.isOnGround && !flightData.hasLeftGround) {
                flightData.hasLeftGround = true;
                console.warn(`[ChocoDebug] Chocobo despego del suelo (hasLeftGround = true)`);
            }

            // Detección de aterrizaje confirmado:
            // Solo aterriza si el Chocobo ya estuvo en el aire y ha vuelto a tocar el suelo
            if (mount.isOnGround && flightData.hasLeftGround) {
                console.warn(`[ChocoDebug] [Caso 5] Aterrizaje confirmado. Restaurando controles terrestres.`);
                mount.clearVelocity();
                mount.triggerEvent("cf:chocobo_stop_flying");
                flightStates.delete(mount.id);
                continue;
            }

            const input = player.inputInfo;
            if (!input) continue;

            const moveVec = input.getMovementVector(); // { x: strafe (-1 a 1), y: forward (-1 a 1) }
            const hasHorizontalInput = Math.abs(moveVec.x) > 0.01 || Math.abs(moveVec.y) > 0.01;

            const currentVel = mount.getVelocity();
            const rot = player.getRotation();
            const yaw = rot.y;
            const pitch = rot.x; // pitch > 0: mirando abajo, pitch < 0: mirando arriba
            const yawRad = (yaw * Math.PI) / 180;

            // Detección de Doble Toque a W (Sprint Aéreo) porque Bedrock anula player.isSprinting en monturas
            const forwardPressed = moveVec.y > 0.5;
            const currentTick = system.currentTick;
            if (forwardPressed && !flightData.wasForwardPressed) {
                if (flightData.lastForwardPressTick && (currentTick - flightData.lastForwardPressTick) <= 10) {
                    flightData.isBoostActive = true;
                }
                flightData.lastForwardPressTick = currentTick;
            }
            if (!forwardPressed) {
                flightData.isBoostActive = false;
            }
            flightData.wasForwardPressed = forwardPressed;

            const isSprinting = flightData.isBoostActive || !!player.isSprinting;

            let targetVx = 0;
            let targetVz = 0;

            if (hasHorizontalInput) {
                // Vectores directores ortogonales en plano XZ (Y = 0 estricto)
                const fwdX = -Math.sin(yawRad);
                const fwdZ = Math.cos(yawRad);
                const rightX = Math.cos(yawRad);
                const rightZ = Math.sin(yawRad);

                // Freno Aéreo Activo: Si se presiona S (retroceso en vuelo)
                // Disipa activamente la velocidad horizontal actual (frenada en seco sin empujar en reversa)
                if (moveVec.y < -0.3) {
                    targetVx = currentVel.x * 0.35;
                    targetVz = currentVel.z * 0.35;
                    if (flightData.lastHMode !== "AIR_BRAKE") {
                        flightData.lastHMode = "AIR_BRAKE";
                        console.warn(`[ChocoDebug] [Freno] Freno Aéreo Activo (Tecla S)`);
                    }
                } else {
                    // Combinación WASD: W/S sobre fwd, A/D sobre right
                    let dirX = fwdX * moveVec.y + rightX * moveVec.x;
                    let dirZ = fwdZ * moveVec.y + rightZ * moveVec.x;

                    // Normalización de diagonales
                    const len = Math.hypot(dirX, dirZ);
                    if (len > 1) {
                        dirX /= len;
                        dirZ /= len;
                    }

                    // Velocidad horizontal base (Crucero vs Sprint Doble W) + Impulso extra de picado
                    let horizontalSpeed = isSprinting ? SPRINT_HORIZONTAL_SPEED : CRUISE_HORIZONTAL_SPEED;
                    if (pitch > 20) {
                        const diveBoost = Math.min((pitch - 20) / 45, 1) * 0.80;
                        horizontalSpeed += diveBoost;
                    }

                    targetVx = dirX * horizontalSpeed;
                    targetVz = dirZ * horizontalSpeed;

                    // Logs dinámicos para Caso 2 (Crucero vs Sprint)
                    const hMode = isSprinting ? "SPRINT_AIR" : "CRUISE_AIR";
                    if (flightData.lastHMode !== hMode) {
                        flightData.lastHMode = hMode;
                        if (isSprinting) {
                            console.warn(`[ChocoDebug] [Caso 2] Propulsión: Sprint Aéreo activado (Doble W) (Velocidad: ${SPRINT_HORIZONTAL_SPEED})`);
                        } else {
                            console.warn(`[ChocoDebug] [Caso 2] Propulsión: Vuelo Crucero (Velocidad: ${CRUISE_HORIZONTAL_SPEED})`);
                        }
                    }
                }

                // Orientar cuerpo del Chocobo al Yaw del jugador
                mount.setRotation({ x: 0, y: yaw });
            } else {
                targetVx = currentVel.x * INERTIA_DAMPING;
                targetVz = currentVel.z * INERTIA_DAMPING;
                flightData.lastHMode = "INERTIA";
            }

            // Movimiento vertical dinámico:
            // 1. ASCENDING (manteniendo Space):
            //    - Normal: NORMAL_ASCENT_SPEED (0.85)
            //    - Con Sprint: SPRINT_ASCENT_SPEED (1.30)
            // 2. HOVERING (activado por Toque Corto / Tap a Space):
            //    - Ancla la altitud Y exacta, permitiendo vuelo horizontal puro en XZ sin perder ni ganar altura.
            // 3. DESCENDING (al soltar Space tras mantenerlo):
            //    - Mirando al frente/arriba (pitch <= 20°): Planeo suave prolongado (GLIDE_DESCENT_SPEED = -0.05)
            //    - Mirando hacia abajo (pitch > 20°): Picado rápido proporcional al ángulo (hasta DIVE_DESCENT_SPEED = -1.20)
            //    - Mirando al suelo vertical (pitch > 60°): ¡Super Picado Extremo (-1.60)!
            let targetVy;
            if (flightData.state === "ASCENDING") {
                targetVy = isSprinting ? SPRINT_ASCENT_SPEED : NORMAL_ASCENT_SPEED;

                const vMode = isSprinting ? "ASCENT_TURBO" : "ASCENT_NORMAL";
                if (flightData.lastVMode !== vMode) {
                    flightData.lastVMode = vMode;
                    if (isSprinting) {
                        console.warn(`[ChocoDebug] [Caso 1] Ascenso Turbo (Sprint) [Vy: +${SPRINT_ASCENT_SPEED}]`);
                    } else {
                        console.warn(`[ChocoDebug] [Caso 1] Ascenso Normal [Vy: +${NORMAL_ASCENT_SPEED}]`);
                    }
                }
            } else if (flightData.state === "HOVERING") {
                // Modo Suspensión Estática: Anclar altitud Y exactamente
                if (flightData.hoverY === undefined) {
                    flightData.hoverY = mount.location.y;
                }
                const diffY = flightData.hoverY - mount.location.y;
                if (Math.abs(diffY) > 0.05) {
                    targetVy = Math.max(Math.min(diffY * 0.4, 0.25), -0.25);
                } else {
                    targetVy = 0;
                }

                if (flightData.lastVMode !== "HOVER") {
                    flightData.lastVMode = "HOVER";
                    console.warn(`[ChocoDebug] [Hover] Modo Suspensión activo: Altitud Y fija en ${flightData.hoverY.toFixed(1)}`);
                }
            } else {
                let targetDescent = GLIDE_DESCENT_SPEED;
                const isDiving = pitch > 20;

                if (isDiving) {
                    const isSuperDive = pitch > 60;
                    const maxDive = isSuperDive ? -1.60 : DIVE_DESCENT_SPEED;
                    const diveFactor = Math.min((pitch - 20) / 45, 1);
                    targetDescent = GLIDE_DESCENT_SPEED + (maxDive - GLIDE_DESCENT_SPEED) * diveFactor;
                }

                const vMode = isDiving ? (pitch > 60 ? "SUPER_DIVE" : "DIVE") : "GLIDE";
                if (flightData.lastVMode !== vMode) {
                    flightData.lastVMode = vMode;
                    if (pitch > 60) {
                        console.warn(`[ChocoDebug] [Caso 4] ¡SUPER PICADO EXTREMO! [Pitch: ${pitch.toFixed(1)}° -> Vy obj: ${targetDescent.toFixed(2)}]`);
                    } else if (isDiving) {
                        console.warn(`[ChocoDebug] [Caso 4] Picado Rápido (Dive) [Pitch: ${pitch.toFixed(1)}° -> Vy obj: ${targetDescent.toFixed(2)}]`);
                    } else {
                        console.warn(`[ChocoDebug] [Caso 3] Planeo Suave / Sustentación [Vy: ${GLIDE_DESCENT_SPEED} | Pitch: ${pitch.toFixed(1)}°]`);
                    }
                }

                if (currentVel.y > targetDescent) {
                    targetVy = Math.max(currentVel.y - GRAVITY_DECEL, targetDescent);
                } else {
                    targetVy = Math.min(currentVel.y + GRAVITY_DECEL, targetDescent);
                }
            }

            mount.clearVelocity();
            mount.applyImpulse({
                x: targetVx,
                y: targetVy,
                z: targetVz
            });
        } catch (err) {
            console.warn(`[ChocoDebug Error Loop] ${err}`);
        }
    }
}, 1);
