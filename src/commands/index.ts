import { adminCommands } from './admin.js';
import { ageCommand, heightCommand } from './body.js';
import { loggingCommands } from './logging.js';
import { pendingCommands } from './pending.js';
import { statsCommands } from './stats.js';
import { weightCommand } from './weight.js';
import type { CommandDef } from './types.js';

// Built from the database: the per-exercise commands are rows, so a change needs a restart to re-register.
export function buildCommands(): Map<string, CommandDef> {
  const all = [...loggingCommands(), ...pendingCommands(), ...statsCommands(), ...adminCommands(), weightCommand, heightCommand, ageCommand];
  const byName = new Map<string, CommandDef>();
  for (const c of all) {
    // One name, one command: an exercise key equal to a built-in command would otherwise replace it without a sound.
    if (byName.has(c.data.name)) throw new Error(`two commands are named /${c.data.name}`);
    byName.set(c.data.name, c);
  }
  return byName;
}

export type { CommandDef };
