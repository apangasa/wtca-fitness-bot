// Explains why a channel read is refused (role permissions vs channel overwrites; an overwrite beats a role grant). Read-only.
import { REST, Routes } from 'discord.js';
import { config } from '../config.js';

const BITS = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MANAGE_ROLES: 1n << 28n,
} as const;

/** Defaults to the bot; pass a user id to check anyone else. */
const subjectId = process.argv[2] ?? null;

const rest = new REST({ version: '10' }).setToken(config.token);

async function probe<T>(label: string, route: string): Promise<T | null> {
  try {
    const res = (await rest.get(route as `/${string}`)) as T;
    console.log(`  [ok]  ${label}`);
    return res;
  } catch (err) {
    const e = err as { status?: number; rawError?: { message?: string } };
    console.log(`  [${e.status ?? '??'}] ${label} — ${e.rawError?.message ?? 'failed'}`);
    return null;
  }
}

console.log('Endpoint access:');
const me = await probe<{ id: string; username: string }>('GET /users/@me', Routes.user('@me'));
const guild = await probe<{ id: string; name: string }>(
  'GET /guilds/{guild}',
  Routes.guild(config.guildId),
);
const channel = await probe<{
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  permission_overwrites: { id: string; type: number; allow: string; deny: string }[];
}>('GET /channels/{channel}', Routes.channel(config.recapChannelId!));
const guildChannels = await probe<{ id: string; name: string; type: number; parent_id: string | null }[]>(
  'GET /guilds/{guild}/channels',
  Routes.guildChannels(config.guildId),
);
const roles = await probe<{ id: string; name: string; permissions: string }[]>(
  'GET /guilds/{guild}/roles',
  Routes.guildRoles(config.guildId),
);
const who = subjectId ?? me?.id ?? null;
const member = who
  ? await probe<{ roles: string[]; user: { username: string } }>(
      `GET /guilds/{guild}/members/${who}`,
      Routes.guildMember(config.guildId, who),
    )
  : null;
if (member && subjectId) console.log(`\nChecking permissions for @${member.user.username}`);

if (guild) console.log(`\nGuild: ${guild.name}`);
if (channel) console.log(`Channel: #${channel.name} (type ${channel.type}, parent ${channel.parent_id ?? 'none'})`);

// A target id not in the guild's channel list means no permission change will help.
if (guildChannels) {
  const target = guildChannels.find((c) => c.id === config.recapChannelId);
  if (target) {
    console.log(`Target found in guild: #${target.name} (type ${target.type}, parent ${target.parent_id ?? 'none'})`);
  } else {
    console.log(`\n!! ${config.recapChannelId} is NOT among this guild's ${guildChannels.length} channels.`);
    console.log('   Channels visible here:');
    for (const c of guildChannels.filter((c) => c.type === 0).slice(0, 40)) {
      console.log(`     ${c.id}  #${c.name}`);
    }
  }
}

if (!roles || !member || !me) {
  console.log('\nCould not read enough to compute permissions — see the failures above.');
  process.exit(0);
}

const roleById = new Map(roles.map((r) => [r.id, r]));
const everyone = roleById.get(config.guildId);

let base = BigInt(everyone?.permissions ?? '0');
for (const id of member.roles) base |= BigInt(roleById.get(id)?.permissions ?? '0');

console.log('\nBot roles: ' + (member.roles.map((r) => roleById.get(r)?.name ?? r).join(', ') || '(none)'));

const isAdmin = (base & BITS.ADMINISTRATOR) !== 0n;
let effective = base;

if (channel && !isAdmin) {
  const ows = channel.permission_overwrites ?? [];
  const find = (id: string) => ows.find((o) => o.id === id);

  const everyoneOw = find(config.guildId);
  if (everyoneOw) {
    effective &= ~BigInt(everyoneOw.deny);
    effective |= BigInt(everyoneOw.allow);
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const id of member.roles) {
    const ow = find(id);
    if (!ow) continue;
    roleDeny |= BigInt(ow.deny);
    roleAllow |= BigInt(ow.allow);
  }
  effective &= ~roleDeny;
  effective |= roleAllow;

  const memberOw = find(who!);
  if (memberOw) {
    effective &= ~BigInt(memberOw.deny);
    effective |= BigInt(memberOw.allow);
  }

  console.log(`Channel overwrites: ${ows.length}`);
  for (const o of ows) {
    const name = o.type === 0 ? (roleById.get(o.id)?.name ?? `role ${o.id}`) : `member ${o.id}`;
    console.log(`  ${name}: allow=${o.allow} deny=${o.deny}`);
  }
}

console.log(
  channel
    ? '\nEffective on this channel (server roles + channel overwrites):'
    : '\nServer-level only — the channel object could not be read, so no channel\noverwrites were applied. A deny at the channel level would not show here:',
);
for (const [name, bit] of Object.entries(BITS)) {
  const has = isAdmin || (effective & bit) !== 0n;
  console.log(`  ${has ? 'YES' : 'no '}  ${name}`);
}
