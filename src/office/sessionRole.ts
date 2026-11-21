// Whether the signed-in role may send commands. Set by src/app (providers); the office layer
// only knows the boolean, never the role model. Defence in depth: the UI already hides controls.
let commandsAllowed = true

export function setCommandsAllowed(allowed: boolean): void {
  commandsAllowed = allowed
}

export function getCommandsAllowed(): boolean {
  return commandsAllowed
}
