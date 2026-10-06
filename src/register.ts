import { REST, Routes } from 'discord.js';
import { assertDiscordConfig, config } from './config.js';
import { buildCommands } from './commands/index.js';

// Guild-scoped registration propagates instantly; global commands take up to an hour.
export async function registerCommands(): Promise<number> {
  assertDiscordConfig();
  const commands = buildCommands();
  const body = [...commands.values()].map((c) => c.data);

  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  return body.length;
}
