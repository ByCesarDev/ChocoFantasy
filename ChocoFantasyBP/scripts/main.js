import { world, system, InputButton, ButtonState } from "@minecraft/server";

// ==========================================
// CONSTANTES Y CONFIGURACIÓN
// ==========================================
const CHOCOBO_IDENTIFIER = "cf:chocobo_yellow_1";
const HORIZONTAL_SPEED = 0.40;   // Velocidad horizontal en el aire (bloques/tick aprox.)
const ASCENT_SPEED = 0.30;       // Velocidad de ascenso vertical constante
const INERTIA_DAMPING = 0.85;    // Factor de amortiguación cuando no hay input de WASD
const MIN_TICKS_BEFORE_LANDING = 5; // Ticks mínimos en el aire antes de considerar aterrizaje (evita cancelación al despegar)

// ==========================================
// ESTADO DE VUELO DE LAS MONTURAS
// Map<string, { state: "ASCENDING" | "DESCENDING", ticksInAir: number }>
// ==========================================
const flightStates = new Map();

// ==========================================
// GESTIÓN DE EVENTOS DE ENTRADA (BOTÓN SALTO)
// ==========================================
world.afterEvents.playerButtonInput.subscribe((event) => {
    const { player, button, newButtonState } = event;

    if (button !== InputButton.Jump) return;

    try {
        const riding = player.getComponent("minecraft:riding");
        const mount = riding?.entityRidingOn;
        if (!mount || !mount.isValid() || mount.typeId !== CHOCOBO_IDENTIFIER) return;

        if (newButtonState === ButtonState.Pressed) {
            // Iniciar o reanudar ascenso en el aire
            const current = flightStates.get(mount.id);
            flightStates.set(mount.id, {
                state: "ASCENDING",
                ticksInAir: current ? current.ticksInAir : 0
            });
            mount.triggerEvent("cf:chocobo_start_flying");
        } else if (newButtonState === ButtonState.Released) {
            // Liberar salto NO aterriza el Chocobo: entra en modo descenso manteniendo control aéreo
            const current = flightStates.get(mount.id);
            if (current) {
                current.state = "DESCENDING";
                mount.triggerEvent("cf:chocobo_start_descending");
            }
        }
    } catch {
        // Protección contra entidades descargadas
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
            if (!player || !player.isValid()) continue;

            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            if (!mount || !mount.isValid() || mount.typeId !== CHOCOBO_IDENTIFIER) continue;

            const flightData = flightStates.get(mount.id);

            // Si no está registrado en vuelo, está en modo terrestre nativo
            if (!flightData) continue;

            flightData.ticksInAir++;

            // Detección de aterrizaje confirmado:
            // Solo aterriza si el Chocobo está en el suelo y ya pasaron los ticks de despegue
            if (mount.isOnGround && flightData.ticksInAir > MIN_TICKS_BEFORE_LANDING) {
                mount.triggerEvent("cf:chocobo_stop_flying");
                flightStates.delete(mount.id);
                continue;
            }

            const input = player.inputInfo;
            if (!input) continue;

            const moveVec = input.getMovementVector(); // { x: strafe (-1 a 1), y: forward (-1 a 1) }
            const hasHorizontalInput = Math.abs(moveVec.x) > 0.01 || Math.abs(moveVec.y) > 0.01;

            const currentVel = mount.getVelocity();
            const yaw = player.getRotation().y; // Yaw horizontal exclusivo (Pitch completamente ignorado)
            const yawRad = (yaw * Math.PI) / 180;

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

                targetVx = dirX * HORIZONTAL_SPEED;
                targetVz = dirZ * HORIZONTAL_SPEED;

                // Orientar cuerpo del Chocobo al Yaw del jugador
                mount.setRotation({ x: 0, y: yaw });
            } else {
                targetVx = currentVel.x * INERTIA_DAMPING;
                targetVz = currentVel.z * INERTIA_DAMPING;
            }

            // Movimiento vertical:
            // - ASCENDING: velocidad constante de ascenso (sin acumulación)
            // - DESCENDING: gravedad natural de la entidad (cf:chocobo_descend)
            let targetVy;
            if (flightData.state === "ASCENDING") {
                targetVy = ASCENT_SPEED;
            } else {
                targetVy = currentVel.y;
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
