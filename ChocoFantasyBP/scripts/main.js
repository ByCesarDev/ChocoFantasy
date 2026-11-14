import { world, system, InputButton, ButtonState } from "@minecraft/server";

// ==========================================
// CONFIGURACIÓN DE LINAJES Y ROLES DE CHOCOBO
// ==========================================
const CHOCOBO_TYPES = {
    "cf:chocobo_yellow_1": {
        role: "SILVESTRE",
        displayName: "Chocobo Amarillo Silvestre",
        cruiseSpeed: 1.25,
        sprintSpeed: 2.80,
        normalAscent: 0.85,
        sprintAscent: 1.30,
        glideDescent: -0.05,
        diveDescent: -1.20
    },
    "cf:chocobo_green": {
        role: "FORESTAL",
        displayName: "Chocobo Verde Forestal",
        cruiseSpeed: 1.20,
        sprintSpeed: 2.70,
        normalAscent: 0.85,
        sprintAscent: 1.25,
        glideDescent: -0.05,
        diveDescent: -1.15,
        canCanopyRun: true // Corre y camina sobre copas de arboles / hojas
    },
    "cf:chocobo_blue": {
        role: "RIBERENO",
        displayName: "Chocobo Azul Ribereño",
        cruiseSpeed: 1.20,
        sprintSpeed: 2.70,
        normalAscent: 0.85,
        sprintAscent: 1.25,
        glideDescent: -0.05,
        diveDescent: -1.20,
        canHydroplane: true // Hidroplaneo sobre el agua con +40% de velocidad
    },
    "cf:chocobo_black": {
        role: "CAVERNA",
        displayName: "Chocobo Negro de Caverna",
        cruiseSpeed: 1.15,
        sprintSpeed: 2.60,
        normalAscent: 0.80,
        sprintAscent: 1.20,
        glideDescent: -0.06,
        diveDescent: -1.25,
        grantsNightVision: true // Vision nocturna para el jinete
    },
    "cf:chocobo_purple": {
        role: "ABISAL",
        displayName: "Chocobo Púrpura Abisal",
        cruiseSpeed: 1.20,
        sprintSpeed: 2.70,
        normalAscent: 0.85,
        sprintAscent: 1.25,
        glideDescent: -0.05,
        diveDescent: -1.20,
        grantsNightVision: true // Vision nocturna para el jinete
    },
    "cf:chocobo_white": {
        role: "CELESTIAL",
        displayName: "Chocobo Blanco Celestial",
        cruiseSpeed: 1.35,
        sprintSpeed: 3.00,
        normalAscent: 0.90,
        sprintAscent: 1.40,
        glideDescent: -0.02, // Sustentacion y planeo celestial extendido
        diveDescent: -1.20,
        grantsRegen: true // Regeneracion en vuelo
    },
    "cf:chocobo_gold": {
        role: "SOBERANO",
        displayName: "Chocobo Dorado Soberano",
        cruiseSpeed: 1.50, // El rey supremo de la velocidad
        sprintSpeed: 3.30, // Supersónico
        normalAscent: 1.10,
        sprintAscent: 1.50,
        glideDescent: -0.04,
        diveDescent: -1.50 // Super picado acelerado
    }
};

const GRAVITY_DECEL = 0.12;     // Agilidad en la transición de velocidad vertical
const INERTIA_DAMPING = 0.85;   // Factor de amortiguación al soltar WASD
const TAP_TICK_THRESHOLD = 7;   // Umbral de ticks (~350ms) para Toque Corto (Tap)

// Map<string, { state: "ASCENDING" | "HOVERING" | "DESCENDING", hasLeftGround: boolean, hoverY?: number, pressStartY?: number }>
const flightStates = new Map();
const playerRidingTracker = new Map();

/**
 * Retorna la configuración del linaje del chocobo si es válido.
 */
function getChocoboConfig(mount) {
    if (!mount || !mount.isValid) return null;
    return CHOCOBO_TYPES[mount.typeId] ?? null;
}

/**
 * Valida si la montura cumple todos los requisitos indispensables para volar:
 * 1. Existir y ser un Chocobo registrado.
 * 2. Estar domesticada (minecraft:is_tamed).
 * 3. Tener silla de montar equipada (minecraft:is_saddled).
 */
function canFly(mount) {
    const config = getChocoboConfig(mount);
    if (!config) return false;
    const isTamed = mount.hasComponent("minecraft:is_tamed");
    const isSaddled = mount.hasComponent("minecraft:is_saddled");
    return isTamed && isSaddled;
}

// ==========================================
// MONITOR DE MONTAJE / DESMONTAJE Y HABILIDADES PASIVAS
// ==========================================
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const wasRiding = playerRidingTracker.get(player.id) ?? false;
            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            const isRiding = !!mount;
            const config = getChocoboConfig(mount);

            if (!wasRiding && isRiding && config) {
                console.warn(`[ChocoDebug] Jinete montó en ${config.displayName} (${mount.typeId})`);
            } else if (wasRiding && !isRiding) {
                console.warn(`[ChocoDebug] Evento: Jugador desmontado.`);
            }

            // Habilidades pasivas continuas según el Linaje:
            if (isRiding && config) {
                // 1. Chocobo de Caverna (Negro) y Abisal (Morado): Visión nocturna constante al jinete
                if (config.grantsNightVision) {
                    player.addEffect("night_vision", 220, { amplifier: 0, showParticles: false });
                }

                // 2. Chocobo Celestial (Blanco): Regeneración pasiva mientras cabalga o vuela
                if (config.grantsRegen) {
                    player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                    mount.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                }

                // 3. Chocobo Ribereño (Azul): Hidroplaneo sobre el agua
                if (config.canHydroplane) {
                    try {
                        const loc = mount.location;
                        const blockAtFeet = mount.dimension.getBlock(loc);
                        const blockBelow = mount.dimension.getBlock({ x: loc.x, y: loc.y - 0.5, z: loc.z });
                        const isWater = blockAtFeet?.typeId?.includes("water") || blockBelow?.typeId?.includes("water");

                        if (isWater) {
                            // Hidroplaneo: Si está en agua y no está volando activamente, elevar a la superficie
                            const flightData = flightStates.get(mount.id);
                            if (!flightData || flightData.state !== "ASCENDING") {
                                const waterSurfaceY = (blockAtFeet?.typeId?.includes("water") ? blockAtFeet.location.y : blockBelow.location.y) + 0.95;
                                if (loc.y < waterSurfaceY) {
                                    mount.applyImpulse({ x: 0, y: 0.18, z: 0 });
                                }
                                // Partículas de estela de agua en las patas
                                mount.dimension.spawnParticle("minecraft:water_splash_particle", { x: loc.x, y: loc.y + 0.1, z: loc.z });
                            }
                        }
                    } catch {}
                }

                // 4. Chocobo Forestal (Verde): Caminata sobre copas de hojas
                if (config.canCanopyRun) {
                    try {
                        const loc = mount.location;
                        const blockBelow = mount.dimension.getBlock({ x: loc.x, y: loc.y - 0.2, z: loc.z });
                        if (blockBelow?.typeId?.includes("leaves")) {
                            // Si pisa hojas, sustentación suave para no caer en huecos del follaje
                            const flightData = flightStates.get(mount.id);
                            if (!flightData) {
                                mount.applyImpulse({ x: 0, y: 0.08, z: 0 });
                            }
                        }
                    } catch {}
                }
            }

            playerRidingTracker.set(player.id, isRiding);
        } catch (err) {
            console.warn(`[ChocoDebug Passive Loop] ${err}`);
        }
    }
}, 5);

// ==========================================
// GESTIÓN DE EVENTOS DE ENTRADA (BOTÓN SALTO)
// ==========================================
world.afterEvents.playerButtonInput.subscribe((event) => {
    const { player, button, newButtonState } = event;

    if (button !== InputButton.Jump) return;

    try {
        const riding = player.getComponent("minecraft:riding");
        const mount = riding?.entityRidingOn;
        if (!mount) return;

        const flyable = canFly(mount);
        if (!flyable) return;

        let flightData = flightStates.get(mount.id);
        const currentTick = system.currentTick;
        const isPressed = newButtonState === ButtonState.Pressed;

        if (isPressed) {
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
                flightData.hoverY = undefined;
            }

            mount.triggerEvent("cf:chocobo_start_flying");
        } else {
            if (!flightData) return;

            const pressDuration = currentTick - (flightData.jumpPressTick ?? currentTick);
            const wasTap = pressDuration <= TAP_TICK_THRESHOLD;

            if (wasTap) {
                // Toque corto: conmuta suspensión
                if (flightData.prevStateBeforePress === "HOVERING") {
                    flightData.state = "DESCENDING";
                    flightData.hoverY = undefined;
                    mount.triggerEvent("cf:chocobo_start_descending");
                } else {
                    flightData.state = "HOVERING";
                    flightData.hoverY = flightData.pressStartY ?? mount.location.y;
                    mount.triggerEvent("cf:chocobo_start_flying");
                }
            } else {
                // Mantener y soltar: descenso / planeo
                flightData.state = "DESCENDING";
                flightData.hoverY = undefined;
                mount.triggerEvent("cf:chocobo_start_descending");
            }
        }
    } catch (err) {
        console.warn(`[ChocoDebug Jump Input Error] ${err}`);
    }
});

// ==========================================
// CONTROLADOR DE VUELO POR TICK (Script API)
// ==========================================
system.runInterval(() => {
    // 1. Limpieza de monturas sin jinete
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

    // 2. Procesamiento de vuelo
    for (const player of world.getAllPlayers()) {
        try {
            if (!player || !player.isValid) continue;

            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            if (!mount || !mount.isValid) continue;

            const config = getChocoboConfig(mount);
            if (!config) continue;

            const flightData = flightStates.get(mount.id);
            if (!flightData) continue;

            if (!canFly(mount)) {
                mount.clearVelocity();
                mount.triggerEvent("cf:chocobo_stop_flying");
                flightStates.delete(mount.id);
                continue;
            }

            if (!mount.isOnGround && !flightData.hasLeftGround) {
                flightData.hasLeftGround = true;
            }

            // Aterrizaje confirmado
            if (mount.isOnGround && flightData.hasLeftGround) {
                mount.clearVelocity();
                mount.triggerEvent("cf:chocobo_stop_flying");
                flightStates.delete(mount.id);
                continue;
            }

            const input = player.inputInfo;
            if (!input) continue;

            const moveVec = input.getMovementVector();
            const hasHorizontalInput = Math.abs(moveVec.x) > 0.01 || Math.abs(moveVec.y) > 0.01;

            const currentVel = mount.getVelocity();
            const rot = player.getRotation();
            const yaw = rot.y;
            const pitch = rot.x;
            const yawRad = (yaw * Math.PI) / 180;

            // Sprint aéreo por doble toque a W
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
                const fwdX = -Math.sin(yawRad);
                const fwdZ = Math.cos(yawRad);
                const rightX = Math.cos(yawRad);
                const rightZ = Math.sin(yawRad);

                // Freno aéreo activo (tecla S)
                if (moveVec.y < -0.3) {
                    targetVx = currentVel.x * 0.35;
                    targetVz = currentVel.z * 0.35;
                } else {
                    let dirX = fwdX * moveVec.y + rightX * moveVec.x;
                    let dirZ = fwdZ * moveVec.y + rightZ * moveVec.x;

                    const len = Math.hypot(dirX, dirZ);
                    if (len > 1) {
                        dirX /= len;
                        dirZ /= len;
                    }

                    // Velocidades específicas del Linaje
                    let horizontalSpeed = isSprinting ? config.sprintSpeed : config.cruiseSpeed;
                    
                    // Impulso extra de picado
                    if (pitch > 20) {
                        const diveBoost = Math.min((pitch - 20) / 45, 1) * 0.80;
                        horizontalSpeed += diveBoost;
                    }

                    targetVx = dirX * horizontalSpeed;
                    targetVz = dirZ * horizontalSpeed;
                }

                mount.setRotation({ x: 0, y: yaw });
            } else {
                targetVx = currentVel.x * INERTIA_DAMPING;
                targetVz = currentVel.z * INERTIA_DAMPING;
            }

            // Movimiento vertical según el Linaje:
            let targetVy;
            if (flightData.state === "ASCENDING") {
                targetVy = isSprinting ? config.sprintAscent : config.normalAscent;
            } else if (flightData.state === "HOVERING") {
                if (flightData.hoverY === undefined) {
                    flightData.hoverY = mount.location.y;
                }
                const diffY = flightData.hoverY - mount.location.y;
                if (Math.abs(diffY) > 0.05) {
                    targetVy = Math.max(Math.min(diffY * 0.4, 0.25), -0.25);
                } else {
                    targetVy = 0;
                }
            } else {
                // DESCENDING / GLIDE / DIVE
                let targetDescent = config.glideDescent;
                const isDiving = pitch > 20;

                if (isDiving) {
                    const isSuperDive = pitch > 60;
                    const maxDive = isSuperDive ? (config.diveDescent * 1.30) : config.diveDescent;
                    const diveFactor = Math.min((pitch - 20) / 45, 1);
                    targetDescent = config.glideDescent + (maxDive - config.glideDescent) * diveFactor;
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
            console.warn(`[ChocoDebug Flight Loop] ${err}`);
        }
    }
}, 1);
