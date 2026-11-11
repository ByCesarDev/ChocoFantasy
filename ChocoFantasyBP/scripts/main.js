import { world, system, InputButton, ButtonState } from "@minecraft/server";

// ==========================================
// CONSTANTES Y CONFIGURACIÓN DINÁMICA
// ==========================================
const CHOCOBO_IDENTIFIER = "cf:chocobo_yellow_1";

// Velocidades horizontales (XZ)
const CRUISE_HORIZONTAL_SPEED = 1.80;   // Velocidad crucero en el aire (WASD normal, duplicada)
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
// Map<string, { state: "ASCENDING" | "DESCENDING", hasLeftGround: boolean }>
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
// ==========================================
world.afterEvents.playerButtonInput.subscribe((event) => {
    const { player, button, newButtonState } = event;

    if (button !== InputButton.Jump) return;

    try {
        const riding = player.getComponent("minecraft:riding");
        const mount = riding?.entityRidingOn;

        const isPressed = newButtonState === ButtonState.Pressed;
        console.warn(`[ChocoDebug] Boton SALTO: ${isPressed ? "PRESIONADO" : "LIBERADO"}`);

        if (!mount) {
            console.warn(`[ChocoDebug] Salto detectado pero NO esta montando ninguna entidad.`);
            return;
        }

        const isTamed = mount.hasComponent("minecraft:is_tamed");
        const isSaddled = mount.hasComponent("minecraft:is_saddled");
        const canPowerJump = mount.hasComponent("minecraft:can_power_jump");
        const flyable = canFly(mount);

        console.warn(`[ChocoDebug] Montura: ${mount.typeId} | Tamed: ${isTamed} | Saddled: ${isSaddled} | PowerJump: ${canPowerJump} | canFly: ${flyable}`);

        if (!flyable) {
            let razon = "";
            if (!isTamed) razon += "NO esta domesticado. ";
            if (!isSaddled) razon += "NO tiene silla puesta. ";
            console.warn(`[ChocoDebug] Vuelo denegado: ${razon}`);
            return;
        }

        if (isPressed) {
            // Iniciar o reanudar ascenso en el aire
            const current = flightStates.get(mount.id);
            flightStates.set(mount.id, {
                state: "ASCENDING",
                hasLeftGround: current ? current.hasLeftGround : false
            });
            console.warn(`[ChocoDebug] Disparando cf:chocobo_start_flying (ASCENDING)`);
            mount.triggerEvent("cf:chocobo_start_flying");
        } else {
            // Liberar salto NO aterriza el Chocobo: entra en modo descenso manteniendo control aéreo
            const current = flightStates.get(mount.id);
            if (current) {
                current.state = "DESCENDING";
                console.warn(`[ChocoDebug] Disparando cf:chocobo_start_descending (DESCENDING)`);
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
                if (flightData.lastForwardPressTick && (currentTick - flightData.lastForwardPressTick) <= 8) {
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

                // Orientar cuerpo del Chocobo al Yaw del jugador
                mount.setRotation({ x: 0, y: yaw });
            } else {
                targetVx = currentVel.x * INERTIA_DAMPING;
                targetVz = currentVel.z * INERTIA_DAMPING;
                flightData.lastHMode = "INERTIA";
            }

            // Movimiento vertical dinámico:
            // 1. ASCENDING (manteniendo Space):
            //    - Normal: NORMAL_ASCENT_SPEED (0.50)
            //    - Con Sprint: SPRINT_ASCENT_SPEED (0.65)
            // 2. DESCENDING (al soltar Space):
            //    - Mirando al frente/arriba (pitch <= 20°): Planeo suave prolongado (GLIDE_DESCENT_SPEED = -0.08)
            //    - Mirando hacia abajo (pitch > 20°): Picado rápido proporcional al ángulo (hasta DIVE_DESCENT_SPEED = -0.50)
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
            } else {
                let targetDescent = GLIDE_DESCENT_SPEED;
                const isDiving = pitch > 20;

                if (isDiving) {
                    const diveFactor = Math.min((pitch - 20) / 45, 1);
                    targetDescent = GLIDE_DESCENT_SPEED + (DIVE_DESCENT_SPEED - GLIDE_DESCENT_SPEED) * diveFactor;
                }

                const vMode = isDiving ? "DIVE" : "GLIDE";
                if (flightData.lastVMode !== vMode) {
                    flightData.lastVMode = vMode;
                    if (isDiving) {
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
        } catch {
            // Protección contra errores en tiempo de ejecución
        }
    }
}, 1);
