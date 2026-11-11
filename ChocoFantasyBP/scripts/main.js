import { world, InputButton, ButtonState } from "@minecraft/server";

world.afterEvents.playerButtonInput.subscribe((event) => {
    const { player, button, newButtonState } = event;

    if (button !== InputButton.Jump) return;

    const riding = player.getComponent("minecraft:riding");
    const mount = riding?.entityRidingOn;
    if (!mount || mount.typeId !== "cf:chocobo_yellow_1") return;

    if (newButtonState === ButtonState.Pressed) {
        mount.triggerEvent("cf:chocobo_start_flying");
    } else if (newButtonState === ButtonState.Released) {
        mount.triggerEvent("cf:chocobo_stop_flying");
    }
});

