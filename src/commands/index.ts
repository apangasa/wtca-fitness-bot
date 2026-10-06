import { adminCommands } from './admin.js';
import { loggingCommands } from './logging.js';
import { pendingCommands } from './pending.js';
import { statsCommands } from './stats.js';
import { weightCommand } from './weight.js';
import type { CommandDef } from './types.js';

// Built from the database: the per-exercise commands are rows, so a change needs a restart to re-register.
export function buildCommands(): Map<string, CommandDef> {
  const all = [...loggingCommands(), ...pendingCommands(), ...statsCommands(), ...adminCommands(), weightCommand];
  return new Map(all.map((c) => [c.data.name, c]));
}

export type { CommandDef };
