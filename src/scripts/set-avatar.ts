// Sets the bot's profile picture from assets/avatar.png (tsx src/scripts/set-avatar.ts); Discord rate-limits avatar changes, so run it by hand.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REST, Routes } from 'discord.js';
import { assertDiscordConfig, config } from '../config.js';

assertDiscordConfig();

const file = join(process.cwd(), 'assets', 'avatar.png');
const dataUri = `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const rest = new REST({ version: '10' }).setToken(config.token);
const before = (await rest.get(Routes.user('@me'))) as { username: string; avatar: string | null };
const after = (await rest.patch(Routes.user('@me'), { body: { avatar: dataUri } })) as {
  username: string;
  avatar: string | null;
};
console.log(`${after.username}: avatar ${before.avatar ?? 'none'} -> ${after.avatar ?? 'none'}`);
if (!after.avatar || after.avatar === before.avatar) {
  console.error('Avatar did not change.');
  process.exit(1);
}
