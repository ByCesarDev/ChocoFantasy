import { world, InputButton, ButtonState } from "@minecraft/server";

world.afterEvents.playerButtonInput.subscribe((event) => {
    const { player, button, newButtonState } = event;

    // Solo nos interesa cuando se presiona saltar.
    if (button !== InputButton.Jump || newButtonState !== ButtonState.Pressed) return;

    // Comprobar si el jugador está montando algo.
    const riding = player.getComponent("minecraft:riding");
    if (!riding) return;

    const mount = riding.entityRidingOn;
    if (!mount || mount.typeId !== "cf:chocobo_yellow_1") return;

    // Activar el vuelo.
    mount.triggerEvent("cf:chocobo_start_flying");
});

