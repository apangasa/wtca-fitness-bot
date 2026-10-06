import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { assertDiscordConfig, config, warnIfRecapTimeIsBeforeCutoff } from './config.js';
import { buildCommands, type CommandDef } from './commands/index.js';
import { db } from './db/index.js';
import { registerCommands } from './register.js';
import { closeBrowser } from './render/browser.js';
import { startRecapScheduler } from './recap.js';
import { startMessageCapture } from './messages.js';

assertDiscordConfig();
warnIfRecapTimeIsBeforeCutoff();
db(); // opens the file and applies the schema before the first interaction lands

// Slash commands need only Guilds; the message intents (MessageContent is privileged) are for messages.ts.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const commands: Map<string, CommandDef> = buildCommands();

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag}`);
  try {
    const count = await registerCommands();
    console.log(`[commands] registered ${count}`);
  } catch (err) {
    console.error('[commands] registration failed:', err);
  }
  startRecapScheduler(client, config.guildId);
  await startMessageCapture(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      await command.autocomplete(interaction).catch((err) => console.error('[autocomplete]', err));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({
      content: 'That command is stale — try again in a moment.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[command:${interaction.commandName}]`, err);
    const message = { content: 'Something broke running that. Check the bot logs.' };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ ...message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} — shutting down`);
  await closeBrowser().catch(() => {});
  await client.destroy().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(config.token);
