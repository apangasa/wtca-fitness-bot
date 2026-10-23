import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { AGE_MAX, AGE_MIN, CM_PER_INCH, HEIGHT_MAX_CM, HEIGHT_MIN_CM, inHeightRange } from '../anthropometry.js';
import {
  ageOn,
  clearUserBirthYear,
  clearUserHeight,
  ensureUser,
  getUser,
  getUserBody,
  setUserBirthYear,
  setUserHeight,
} from '../db/queries.js';
import { dayKeyFor } from '../time.js';
import { actorName, type CommandDef } from './types.js';

// Which lifts move, said once for both commands (docs/points-height.md has the list and the reasons).
const AFFECTS = 'bench and its variants (incline, close-grip, dumbbell, chest press), squats with a weight, deadlift, RDLs and leg press';

/** A height for reading: cm and feet-inches. */
function formatHeight(cm: number): string {
  const inches = cm / CM_PER_INCH;
  const ft = Math.floor(inches / 12);
  return `${Math.round(cm)} cm (${ft}'${Math.round(inches - ft * 12)}")`;
}

// Replies are public (`show` takes any user); only validation errors are ephemeral, as with /weight.
export const heightCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('height')
    .setDescription('Optional: set your height so bench, squat, deadlift and leg press are scored against your build')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Set your height in cm, or in feet and inches (visible to everyone)')
        .addNumberOption((o) => o.setName('cm').setDescription(`Height in cm (${HEIGHT_MIN_CM}-${HEIGHT_MAX_CM})`).setMinValue(1).setMaxValue(400))
        .addIntegerOption((o) => o.setName('feet').setDescription('Feet, with inches').setMinValue(1).setMaxValue(9))
        .addNumberOption((o) => o.setName('inches').setDescription('Inches, with feet').setMinValue(0).setMaxValue(11.99)),
    )
    .addSubcommand((s) =>
      s
        .setName('show')
        .setDescription('Show the height someone is scored at')
        .addUserOption((o) => o.setName('user').setDescription('Whose height (default: you)')),
    )
    .addSubcommand((s) => s.setName('clear').setDescription('Forget it: lifts are scored as a typical height for your weight again'))
    .toJSON(),
  execute: async (interaction) => {
    const ephemeral = { flags: MessageFlags.Ephemeral } as const;
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const name = ensureUser(userId, actorName(interaction)).displayName;

    if (sub === 'set') {
      const cmOpt = interaction.options.getNumber('cm');
      const feet = interaction.options.getInteger('feet');
      const inches = interaction.options.getNumber('inches');
      if ((cmOpt === null) === (feet === null)) {
        await interaction.reply({ content: 'Give either `cm`, or `feet` (with `inches` if you like), not both.', ...ephemeral });
        return;
      }
      if (cmOpt !== null && inches !== null) {
        await interaction.reply({ content: '`inches` goes with `feet`, not with `cm`.', ...ephemeral });
        return;
      }
      const cm = cmOpt ?? (feet! * 12 + (inches ?? 0)) * CM_PER_INCH;
      if (!inHeightRange(cm)) {
        await interaction.reply({
          content: `${formatHeight(cm)} is outside what I can score. The study behind the height adjustment covers ${HEIGHT_MIN_CM}-${HEIGHT_MAX_CM} cm.`,
          ...ephemeral,
        });
        return;
      }
      setUserHeight(userId, cm);
      await interaction.reply({
        content:
          `**${name}** is now scored at ${formatHeight(cm)}. Lifts with a height adjustment (${AFFECTS}) are priced against lifters of your ` +
          `weight and height, for what you log from now on; entries you already logged keep the height they had. Other exercises do not change. ` +
          '`/height clear` goes back to a typical height for your weight.',
      });
      return;
    }

    if (sub === 'clear') {
      const had = clearUserHeight(userId);
      await interaction.reply({
        content: had
          ? `**${name}** cleared their height: lifts are scored as a typical height for their weight again, for what they log from now on.`
          : 'You had no height set; lifts are scored as a typical height for your weight.',
        ...(had ? {} : ephemeral),
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const { heightCm } = getUserBody(target.id);
    const targetName = getUser(target.id)?.displayName ?? target.displayName;
    await interaction.reply({
      content:
        heightCm === null
          ? `**${targetName}** has not set a height: scored as a typical height for their weight.`
          : `**${targetName}** is scored at ${formatHeight(heightCm)}.`,
    });
  },
};

export const ageCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('age')
    .setDescription('Optional: set your birth year so bench, squat, deadlift and leg press are scored against your age')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Set your birth year (visible to everyone)')
        .addIntegerOption((o) => o.setName('year').setDescription('Your birth year').setRequired(true).setMinValue(1900).setMaxValue(2100)),
    )
    .addSubcommand((s) =>
      s
        .setName('show')
        .setDescription('Show the age someone is scored at')
        .addUserOption((o) => o.setName('user').setDescription('Whose age (default: you)')),
    )
    .addSubcommand((s) => s.setName('clear').setDescription('Forget it: lifts are scored with no age adjustment again'))
    .toJSON(),
  execute: async (interaction) => {
    const ephemeral = { flags: MessageFlags.Ephemeral } as const;
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const name = ensureUser(userId, actorName(interaction)).displayName;
    const today = dayKeyFor();

    if (sub === 'set') {
      const year = interaction.options.getInteger('year', true);
      try {
        setUserBirthYear(userId, year, today);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        await interaction.reply({
          content: `Born in ${year} makes you about ${ageOn(year, today)}. The study behind the age adjustment covers ages ${AGE_MIN}-${AGE_MAX}.`,
          ...ephemeral,
        });
        return;
      }
      await interaction.reply({
        content:
          `**${name}** is now scored at age ${ageOn(year, today)} (born ${year}). Lifts with an age adjustment (${AFFECTS}) are priced against ` +
          'lifters of your age, for what you log from now on. Other exercises do not change. `/age clear` removes it.',
      });
      return;
    }

    if (sub === 'clear') {
      const had = clearUserBirthYear(userId);
      await interaction.reply({
        content: had
          ? `**${name}** cleared their birth year: lifts are scored with no age adjustment again, for what they log from now on.`
          : 'You had no birth year set; lifts are scored with no age adjustment.',
        ...(had ? {} : ephemeral),
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const { birthYear } = getUserBody(target.id);
    const targetName = getUser(target.id)?.displayName ?? target.displayName;
    await interaction.reply({
      content:
        birthYear === null
          ? `**${targetName}** has not set a birth year: no age adjustment.`
          : `**${targetName}** is scored at age ${ageOn(birthYear, today)} (born ${birthYear}).`,
    });
  },
};
