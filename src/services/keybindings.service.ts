import {Keys} from "excalibur";
import {Keybindings} from "@/enums/keybindings.enum";

export class KeybindingsService {


    /**
     * Retrieves the key binding associated with the specified action.
     * @param {string} action - The name of the action for which to retrieve the key binding.
     * @return {Keys|null} The key binding corresponding to the action, or null if the action is not recognized.
     */
    public static getKeyFor(action: Keybindings): Keys {
        switch (action) {
            case Keybindings.Accelerate:
                return Keys.KeyA;
            case Keybindings.Brake:
                return Keys.KeyZ;
            default:
                return undefined as any as Keys;
        }
    }
}
