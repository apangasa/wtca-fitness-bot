// Looks up guild members by username or nickname (tsx src/scripts/find-member.ts <name>); needs the Server Members privileged intent.
import { REST, Routes } from 'discord.js';
import { config } from '../config.js';

const needle = (process.argv[2] ?? '').toLowerCase();
const rest = new REST({ version: '10' }).setToken(config.token);

interface Member {
  user: { id: string; username: string; global_name: string | null };
  nick: string | null;
}

let members: Member[];
try {
  members = (await rest.get(Routes.guildMembers(config.guildId), {
    query: new URLSearchParams({ limit: '1000' }),
  })) as Member[];
} catch (err) {
  const e = err as { status?: number; rawError?: { message?: string } };
  console.error(`Member list failed (${e.status}): ${e.rawError?.message}`);
  console.error('\nThis endpoint needs the Server Members intent:');
  console.error('  Dev portal -> Bot -> Privileged Gateway Intents -> Server Members Intent');
  console.error('\nOr just right-click the person in Discord -> Copy User ID.');
  process.exit(1);
}

console.log(`${members.length} members in the guild`);

const matches = needle
  ? members.filter((m) => {
      const fields = [m.user.username, m.user.global_name ?? '', m.nick ?? ''].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(needle));
    })
  : members;

console.log(`\n${matches.length} match "${needle}":`);
for (const m of matches) {
  console.log(`  ${m.user.id}  @${m.user.username}  display=${m.user.global_name ?? '-'}  nick=${m.nick ?? '-'}`);
}
