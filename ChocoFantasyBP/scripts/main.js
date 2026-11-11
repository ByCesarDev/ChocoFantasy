import { world, system, InputButton, ButtonState } from "@minecraft/server";

// ==========================================
// CONFIGURACIÓN Y CONSTANTES
// ==========================================
const CHOCOBO_IDENTIFIER = "cf:chocobo_yellow_1";
const HORIZONTAL_SPEED = 0.40;   // Velocidad horizontal en el aire (bloques/tick aprox.)
const ASCENT_SPEED = 0.30;       // Velocidad de ascenso vertical constante
const INERTIA_DAMPING = 0.85;    // Factor de amortiguación cuando no hay input de WASD

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
            mount.triggerEvent("cf:chocobo_start_flying");
        } else if (newButtonState === ButtonState.Released) {
            mount.triggerEvent("cf:chocobo_stop_flying");
        }
    } catch {
        // Protección contra entidades descargadas en el tick de evento
    }
});

// ==========================================
// CONTROLADOR DE VUELO POR TICK (Script API)
// ==========================================
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            if (!player || !player.isValid()) continue;

            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            if (!mount || !mount.isValid() || mount.typeId !== CHOCOBO_IDENTIFIER) continue;

            // En el suelo se mantiene el control y física terrestre nativa
            if (mount.isOnGround) continue;

            const input = player.inputInfo;
            if (!input) continue;

            const moveVec = input.getMovementVector(); // { x: strafe (-1 a 1), y: forward (-1 a 1) }
            const isJumping = input.getButtonState(InputButton.Jump) === ButtonState.Pressed;
            const hasHorizontalInput = Math.abs(moveVec.x) > 0.01 || Math.abs(moveVec.y) > 0.01;

            const currentVel = mount.getVelocity();
            const yaw = player.getRotation().y; // Yaw horizontal exclusivo (Pitch completamente ignorado)
            const yawRad = (yaw * Math.PI) / 180;

            let targetVx = 0;
            let targetVz = 0;

            if (hasHorizontalInput) {
                // Vectores base ortogonales en el plano XZ (Y = 0)
                const fwdX = -Math.sin(yawRad);
                const fwdZ = Math.cos(yawRad);
                const rightX = Math.cos(yawRad);
                const rightZ = Math.sin(yawRad);

                // Combinación vectorial de WASD
                let dirX = fwdX * moveVec.y + rightX * moveVec.x;
                let dirZ = fwdZ * moveVec.y + rightZ * moveVec.x;

                // Normalización para velocidad diagonal uniforme
                const len = Math.hypot(dirX, dirZ);
                if (len > 1) {
                    dirX /= len;
                    dirZ /= len;
                }

                targetVx = dirX * HORIZONTAL_SPEED;
                targetVz = dirZ * HORIZONTAL_SPEED;

                // Orientar el cuerpo del Chocobo con la rotación horizontal del jugador
                mount.setRotation({ x: 0, y: yaw });
            } else {
                // Desaceleración suave si no se presiona WASD
                targetVx = currentVel.x * INERTIA_DAMPING;
                targetVz = currentVel.z * INERTIA_DAMPING;
            }

            // Movimiento vertical:
            // - Si Space está presionado: ascenso constante controlado (sin acumulación)
            // - Si Space está liberado: descenso natural por gravedad
            const targetVy = isJumping ? ASCENT_SPEED : currentVel.y;

            mount.clearVelocity();
            mount.applyImpulse({
                x: targetVx,
                y: targetVy,
                z: targetVz
            });
        } catch {
            // Protección contra desconexión o eliminación de la entidad en runtime
        }
    }
}, 1);
