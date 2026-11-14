import { world, system, InputButton, ButtonState, MolangVariableMap } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

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
    "cf:chocobo_yellow": {
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
        canCanopyRun: true
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
        canHydroplane: true
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
        grantsNightVision: true
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
        grantsNightVision: true
    },
    "cf:chocobo_white": {
        role: "CELESTIAL",
        displayName: "Chocobo Blanco Celestial",
        cruiseSpeed: 1.35,
        sprintSpeed: 3.00,
        normalAscent: 0.90,
        sprintAscent: 1.40,
        glideDescent: -0.02,
        diveDescent: -1.20,
        grantsRegen: true
    },
    "cf:chocobo_gold": {
        role: "SOBERANO",
        displayName: "Chocobo Dorado Soberano",
        cruiseSpeed: 1.50,
        sprintSpeed: 3.30,
        normalAscent: 1.10,
        sprintAscent: 1.50,
        glideDescent: -0.04,
        diveDescent: -1.50
    }
};

const GRAVITY_DECEL = 0.12;
const INERTIA_DAMPING = 0.85;
const TAP_TICK_THRESHOLD = 7;

const COMMAND_STATES = ["follow", "sit", "wander"];
const COMMAND_LABELS = {
    "follow": "§a🐾 Modo: Seguir al Dueño",
    "sit": "§c🛑 Modo: Sentado (Guardia)",
    "wander": "§e🌾 Modo: Paseo Libre"
};

const flightStates = new Map();
const whistleFlyingChocobos = new Map();
const playerRidingTracker = new Map();

function getChocoboConfig(mount) {
    if (!mount || !mount.isValid) return null;
    return CHOCOBO_TYPES[mount.typeId] ?? null;
}

function canFly(mount) {
    const config = getChocoboConfig(mount);
    if (!config) return false;
    const isTamed = mount.hasComponent("minecraft:is_tamed");
    const isSaddled = mount.hasComponent("minecraft:is_saddled");
    return isTamed && isSaddled;
}

function getAbilityDescription(role) {
    switch (role) {
        case "FORESTAL":
            return "Caminata sobre el dosel de hojas sin caerse. Inmunidad a bayas y espinas.";
        case "RIBERENO":
            return "Hidroplaneo sobre el agua (+40% de velocidad). Respira bajo el agua sin desmontar al jinete.";
        case "CAVERNA":
            return "Ojos brillantes: otorga Visión Nocturna natural al jinete. Amortigua vibraciones de sculk en cuevas.";
        case "ABISAL":
            return "Inmunidad total al daño por caída. Visión nocturna y gran altura de salto místico.";
        case "CELESTIAL":
            return "Sustentación pura con planeo casi horizontal. Regeneración de salud continua en vuelo.";
        case "SOBERANO":
            return "Velocidad crucero extrema (1.50) y sprint supersónico (3.30). 100% inmune a fuego y lava.";
        default:
            return "El todoterreno equilibrado para la exploración temprana del Overworld.";
    }
}

// ==========================================
// 1. CONTROL DE ÓRDENES POR SNEAK + CLIC & CHOCOPEDIA
// ==========================================
world.afterEvents.playerInteractWithEntity.subscribe((event) => {
    try {
        const { player, target } = event;
        if (!target || !target.isValid) return;

        const config = getChocoboConfig(target);
        if (!config) return;

        const equippable = player.getComponent("minecraft:equippable");
        const itemInHand = equippable?.getEquipment("Mainhand");

        // A. Abrir Ficha Técnica con la Chocopedia
        if (itemInHand?.typeId === "cf:chocopedia") {
            openChocoboProfileUI(player, target, config);
            return;
        }

        // B. Ciclo de Órdenes por Sneak + Clic
        if (player.isSneaking) {
            const isTamed = target.hasComponent("minecraft:is_tamed");
            if (!isTamed) return;

            const tameable = target.getComponent("minecraft:tameable");
            if (tameable?.tamedToPlayerId && tameable.tamedToPlayerId !== player.id) {
                player.onScreenDisplay.setActionBar("§cEste Chocobo pertenece a otro aventurero.");
                return;
            }

            const currentState = target.getProperty("cf:command_state") ?? "follow";
            const currentIndex = COMMAND_STATES.indexOf(currentState);
            const nextIndex = (currentIndex + 1) % COMMAND_STATES.length;
            const nextState = COMMAND_STATES[nextIndex];

            target.triggerEvent(`cf:command_${nextState}`);

            // Sonido y aviso
            const pitch = nextState === "sit" ? 0.8 : (nextState === "follow" ? 1.2 : 1.0);
            player.playSound("entity.chocobo.ambient", { pitch });
            player.onScreenDisplay.setActionBar(COMMAND_LABELS[nextState]);
        }
    } catch (err) {
        console.warn(`[ChocoDebug Interact Error] ${err}`);
    }
});

// ==========================================
// 2. SILBATO MELÓDICO & GRIMORIO AL AIRE
// ==========================================
world.afterEvents.itemUse.subscribe((event) => {
    try {
        const { source: player, itemStack } = event;
        if (!player || !player.isValid) return;

        // Silbato de Chocobo: Llamada musical con arpegio
        if (itemStack?.typeId === "cf:chocobo_whistle") {
            const pitches = [0.8, 1.0, 1.25, 1.5];
            for (let i = 0; i < pitches.length; i++) {
                system.runTimeout(() => {
                    if (player.isValid) {
                        player.playSound("note.flute", { pitch: pitches[i], volume: 1.5 });
                        const molangVars = new MolangVariableMap();
                        molangVars.setColorRGB("variable.note_color", { red: 1.0, green: 0.85, blue: 0.2 });
                        player.dimension.spawnParticle("minecraft:note_particle", {
                            x: player.location.x,
                            y: player.location.y + 2.1,
                            z: player.location.z
                        }, molangVars);
                    }
                }, i * 3);
            }

            system.runTimeout(() => {
                if (!player.isValid) return;

                let count = 0;
                const entities = player.dimension.getEntities({
                    location: player.location,
                    maxDistance: 48,
                    families: ["chocobo"]
                });

                for (const choco of entities) {
                    if (!choco.isValid) continue;
                    const isTamed = choco.hasComponent("minecraft:is_tamed");
                    const tameable = choco.getComponent("minecraft:tameable");

                    if (isTamed && (!tameable?.tamedToPlayerId || tameable.tamedToPlayerId === player.id)) {
                        const rideable = choco.getComponent("minecraft:rideable");
                        const riders = rideable?.getRiders?.() ?? [];
                        if (riders.length > 0) continue; // No mover si alguien lo está montando

                        count++;
                        // Levantar si estaba sentado y poner en modo seguimiento sin teletransporte
                        choco.triggerEvent("cf:command_follow");

                        choco.dimension.spawnParticle("minecraft:heart_particle", {
                            x: choco.location.x,
                            y: choco.location.y + 2.5,
                            z: choco.location.z
                        });

                        const dx = player.location.x - choco.location.x;
                        const dy = player.location.y - choco.location.y;
                        const dz = player.location.z - choco.location.z;
                        const hDist = Math.hypot(dx, dz);
                        const totalDist = Math.hypot(dx, dy, dz);

                        // Si ya está al lado (<= 3 bloques), no necesita desplazamiento
                        if (totalDist <= 3.0) continue;

                        const isFlyingLineage = choco.typeId === "cf:chocobo_white" || choco.typeId === "cf:chocobo_gold";
                        const isPlayerElevated = dy > 2.5; // El jugador está arriba en un risco, torre o volando
                        const isFarAway = hDist > 16;       // Distancia larga sobre terreno irregular
                        const isAirborne = !choco.isOnGround;

                        // Decisión inteligente: ¿Camina por tierra o alza el vuelo?
                        const shouldFly = isPlayerElevated || isAirborne || isFarAway || (isFlyingLineage && hDist > 8);

                        if (shouldFly) {
                            // Alzar el vuelo con aleteo cinemático guiado
                            choco.triggerEvent("cf:chocobo_start_flying");
                            choco.applyImpulse({ x: 0, y: 0.35, z: 0 });
                            try {
                                choco.dimension.playSound("entity.chocobo.ambient", choco.location, { pitch: 1.2, volume: 1.0 });
                            } catch {}
                            whistleFlyingChocobos.set(choco.id, {
                                choco,
                                player,
                                ticksRemaining: 140 // hasta 7 segundos de vuelo cinemático guiado
                            });
                        } else {
                            // Caminar por tierra: follow_owner se encarga del pathfinding sin teletransporte.
                            if (whistleFlyingChocobos.has(choco.id)) {
                                whistleFlyingChocobos.delete(choco.id);
                                choco.triggerEvent("cf:chocobo_stop_flying");
                            }
                            // Impulso terrestre sutil hacia adelante para iniciar la caminata inmediatamente
                            choco.applyImpulse({
                                x: (dx / hDist) * 0.25,
                                y: 0.05,
                                z: (dz / hDist) * 0.25
                            });
                        }
                    }
                }

                if (count > 0) {
                    player.onScreenDisplay.setActionBar(`§6🎺 ¡Silbato sonó! §e${count} Chocobo(s)§6 respondieron.`);
                } else {
                    player.onScreenDisplay.setActionBar("§e🎺 Tocaste el silbato, pero no hay Chocobos leales cerca.");
                }
            }, 12);
        } else if (itemStack?.typeId === "cf:chocopedia") {
            openGrimoireUI(player);
        }
    } catch (err) {
        console.warn(`[ChocoDebug ItemUse Error] ${err}`);
    }
});

// ==========================================
// 3. INTERFACES DE USUARIO (ChocoWiki / Chocopedia)
// ==========================================
function openChocoboProfileUI(player, chocobo, config) {
    const health = chocobo.getComponent("minecraft:health");
    const currentHp = health ? Math.round(health.currentValue) : 40;
    const maxHp = health ? Math.round(health.effectiveMax) : 40;
    const currentState = chocobo.getProperty("cf:command_state") ?? "follow";
    const name = chocobo.nameTag || config.displayName;

    const form = new ActionFormData()
        .title(`§6📜 Perfil: ${name}`)
        .body(
            `§eLinaje: §f${config.displayName}\n` +
            `§cSalud: §f${currentHp} / ${maxHp} HP\n` +
            `§aVelocidad Crucero: §f${config.cruiseSpeed}\n` +
            `§bSprint Aéreo: §f${config.sprintSpeed}\n` +
            `§dEstado Actual: §f${COMMAND_LABELS[currentState] || currentState}\n\n` +
            `§6★ Habilidad Especial:\n§7${getAbilityDescription(config.role)}`
        )
        .button("§a🐾 Ordenar: Seguir")
        .button("§c🛑 Ordenar: Sentar")
        .button("§e🌾 Ordenar: Pasear")
        .button("§8Cerrar");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) {
            chocobo.triggerEvent("cf:command_follow");
            player.onScreenDisplay.setActionBar(COMMAND_LABELS["follow"]);
        } else if (res.selection === 1) {
            chocobo.triggerEvent("cf:command_sit");
            player.onScreenDisplay.setActionBar(COMMAND_LABELS["sit"]);
        } else if (res.selection === 2) {
            chocobo.triggerEvent("cf:command_wander");
            player.onScreenDisplay.setActionBar(COMMAND_LABELS["wander"]);
        }
    });
}

function openGrimoireUI(player) {
    const form = new ActionFormData()
        .title("§6📖 ChocoWiki: Grimorio de Linajes")
        .body("§fBienvenido a la enciclopedia viva de ChocoFantasy. Selecciona un linaje para consultar sus habilidades y secretos de crianza:")
        .button("🌿 Chocobo Forestal")
        .button("🌊 Chocobo Ribereño")
        .button("🌑 Chocobo de Caverna")
        .button("🔮 Chocobo Abisal")
        .button("❄️ Chocobo Celestial")
        .button("☀️ Chocobo Soberano")
        .button("🌾 Chocobo Silvestre")
        .button("🥗 Guía Nutricional");

    form.show(player).then((res) => {
        if (res.canceled) return;
        showLinajeDetail(player, res.selection);
    });
}

function showLinajeDetail(player, index) {
    const details = [
        {
            title: "🌿 Chocobo Forestal",
            text: "§aHábitat: §fSelvas y bosques frondosos.\n§bHabilidad: §fCaminata en copas de árboles. Camina y corre sobre bloques de hojas sin caerse.\n§cInmunidad: §fInmune al daño de espinas, arbustos de bayas y cactus."
        },
        {
            title: "🌊 Chocobo Ribereño",
            text: "§aHábitat: §fRíos, playas y costas oceánicas.\n§bHabilidad: §fHidroplaneo. Se desliza sobre la superficie del agua a +40% de velocidad con estelas de espuma.\n§cRespiración: §fRespira bajo el agua y nunca desmonta al jinete."
        },
        {
            title: "🌑 Chocobo de Caverna",
            text: "§aHábitat: §fCuevas profundas, deepslate y dripstone.\n§bHabilidad: §fOjos brillantes bioluminiscentes. Otorga Visión Nocturna natural al jinete mientras esté montado.\n§cDefensa: §f50 HP blindados e inmunidad a caídas."
        },
        {
            title: "🔮 Chocobo Abisal",
            text: "§aHábitat: §fCuevas frondosas (Lush Caves) y pantanos oscuros.\n§bHabilidad: §fSalto místico amplificado y Visión Nocturna al jinete.\n§cDefensa: §fInmunidad total al daño de caída."
        },
        {
            title: "❄️ Chocobo Celestial",
            text: "§aHábitat: §fPicos nevados y cumbres heladas.\n§bHabilidad: §fSustentación celestial. Planeo extendido casi horizontal (-0.02) y regeneración de vida continua en vuelo."
        },
        {
            title: "☀️ Chocobo Soberano",
            text: "§aHábitat: §fMesetas doradas, badlands y praderas abiertas.\n§bHabilidad: §fVelocidad suprema de 1.50 y sprint supersónico de 3.30.\n§cResistencia: §f100% inmune a fuego y lava."
        },
        {
            title: "🌾 Chocobo Silvestre",
            text: "§aHábitat: §fLlanuras y sabanas del Overworld.\n§bHabilidad: §fEl todoterreno inicial. Vuelo equilibrado, gran lealtad y resistencia para explorar el mundo."
        },
        {
            title: "🥗 Guía Nutricional Chocobo",
            text: "§61. Verdura Gysahl: §fAlimento básico para atraer y criar en el nido de paja.\n§e2. Semillas de Reagan: §fTónico artesanal supremo (4 semillas). El único ítem que domestica al Chocobo adulto.\n§d3. Fruta de la Vida: §fSanación instantánea en combate y néctar celestial."
        }
    ];

    const d = details[index];
    if (!d) return;

    const modal = new ActionFormData()
        .title(d.title)
        .body(d.text)
        .button("§8Volver al Grimorio");

    modal.show(player).then((res) => {
        if (!res.canceled) {
            openGrimoireUI(player);
        }
    });
}

// ==========================================
// 4. BUCLE DE EFECTOS PASIVOS POR LINAJE
// ==========================================
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const wasRiding = playerRidingTracker.get(player.id) ?? false;
            const riding = player.getComponent("minecraft:riding");
            const mount = riding?.entityRidingOn;
            const isRiding = !!mount;
            const config = getChocoboConfig(mount);

            if (isRiding && config) {
                // Visión nocturna en Caverna / Abisal
                if (config.grantsNightVision) {
                    player.addEffect("night_vision", 220, { amplifier: 0, showParticles: false });
                }

                // Regeneración en Celestial
                if (config.grantsRegen) {
                    player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                    mount.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                }

                // Hidroplaneo en Ribereño
                if (config.canHydroplane) {
                    try {
                        const loc = mount.location;
                        const blockAtFeet = mount.dimension.getBlock(loc);
                        const blockBelow = mount.dimension.getBlock({ x: loc.x, y: loc.y - 0.5, z: loc.z });
                        const isWater = blockAtFeet?.typeId?.includes("water") || blockBelow?.typeId?.includes("water");

                        if (isWater) {
                            const flightData = flightStates.get(mount.id);
                            if (!flightData || flightData.state !== "ASCENDING") {
                                const waterSurfaceY = (blockAtFeet?.typeId?.includes("water") ? blockAtFeet.location.y : blockBelow.location.y) + 0.95;
                                if (loc.y < waterSurfaceY) {
                                    mount.applyImpulse({ x: 0, y: 0.18, z: 0 });
                                }
                                mount.dimension.spawnParticle("minecraft:water_splash_particle", { x: loc.x, y: loc.y + 0.1, z: loc.z });
                            }
                        }
                    } catch {}
                }

                // Caminata en follaje en Forestal
                if (config.canCanopyRun) {
                    try {
                        const loc = mount.location;
                        const blockBelow = mount.dimension.getBlock({ x: loc.x, y: loc.y - 0.2, z: loc.z });
                        if (blockBelow?.typeId?.includes("leaves")) {
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
// 5. GESTIÓN DE ENTRADA (BOTÓN SALTO / VUELO)
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
// 6. CONTROLADOR CINEMÁTICO DE VUELO POR TICK
// ==========================================
system.runInterval(() => {
    // A. Vuelo guiado por silbato (Chocobos respondiendo a la llamada por aire)
    if (whistleFlyingChocobos.size > 0) {
        for (const [chocoId, data] of whistleFlyingChocobos.entries()) {
            try {
                const { choco, player } = data;
                if (!choco || !choco.isValid || !player || !player.isValid) {
                    whistleFlyingChocobos.delete(chocoId);
                    continue;
                }

                // Si un jugador montó al Chocobo, devolverle el control total
                const rideable = choco.getComponent("minecraft:rideable");
                const riders = rideable?.getRiders?.() ?? [];
                if (riders.length > 0) {
                    whistleFlyingChocobos.delete(chocoId);
                    continue;
                }

                data.ticksRemaining--;

                const dx = player.location.x - choco.location.x;
                const dy = (player.location.y + 0.3) - choco.location.y;
                const dz = player.location.z - choco.location.z;
                const hDist = Math.hypot(dx, dz);
                const totalDist = Math.hypot(dx, dy, dz);

                // Aterrizaje suave al llegar junto al jugador o agotar tiempo
                if ((hDist <= 3.2 && Math.abs(dy) <= 1.8) || data.ticksRemaining <= 0) {
                    choco.clearVelocity();
                    choco.triggerEvent("cf:chocobo_stop_flying");
                    whistleFlyingChocobos.delete(chocoId);
                    continue;
                }

                // Vector de sustentación y planeo hacia el dueño
                const speed = 0.55;
                const vx = (dx / totalDist) * speed;
                const vy = Math.max(-0.4, Math.min(0.55, (dy / totalDist) * speed + 0.03));
                const vz = (dz / totalDist) * speed;

                choco.clearVelocity();
                choco.applyImpulse({ x: vx, y: vy, z: vz });
            } catch {
                whistleFlyingChocobos.delete(chocoId);
            }
        }
    }

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

                    let horizontalSpeed = isSprinting ? config.sprintSpeed : config.cruiseSpeed;

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
