import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatWeight } from '../exercises.js';
import { SCORING } from '../scoring.js';
import { BW_MAX, BW_MIN, inBodyweightRange } from '../strengthLevelTables.js';
import { clearUserWeight, ensureUser, getUser, getUserWeight, setUserWeight } from '../db/queries.js';
import { actorName, type CommandDef } from './types.js';

const REFERENCE = formatWeight(SCORING.BODY_LB);

// Replies are public (`show` takes any user); only validation errors are ephemeral.
export const weightCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('weight')
    .setDescription('Optional: set your body weight so lifts are scored against your weight class')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Set your body weight (visible to everyone)')
        .addNumberOption((o) =>
          o
            .setName('lbs')
            .setDescription(`Your body weight in lb (${BW_MIN}-${BW_MAX})`)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(2000),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('show')
        .setDescription('Show the body weight someone is scored at')
        .addUserOption((o) => o.setName('user').setDescription('Whose weight (default: you)')),
    )
    .addSubcommand((s) => s.setName('clear').setDescription(`Forget it: lifts are scored as ${REFERENCE} again`))
    .toJSON(),
  execute: async (interaction) => {
    const ephemeral = { flags: MessageFlags.Ephemeral } as const;
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const name = ensureUser(userId, actorName(interaction)).displayName;

    if (sub === 'set') {
      const lbs = interaction.options.getNumber('lbs', true);
      if (!inBodyweightRange(lbs)) {
        await interaction.reply({
          content: `${lbs} lb is outside what I can score. Strength Level's standards run from ${BW_MIN} to ${BW_MAX} lb, so enter a weight in that range.`,
          ...ephemeral,
        });
        return;
      }
      setUserWeight(userId, lbs);
      await interaction.reply({
        content:
          `**${name}** is now scored at ${formatWeight(lbs)}. ` +
          `Lift points (bench, rows, curls and so on) and bodyweight-exercise points (push-ups, pull-ups, squats, sit-ups, ab-rolls and the like) use ` +
          `Strength Level's standards for ${formatWeight(lbs)} instead of ${REFERENCE}, for everything logged in a season that is still running; finished seasons stay as they were frozen. ` +
          `\`/weight clear\` goes back to ${REFERENCE}.`,
      });
      return;
    }

    if (sub === 'clear') {
      const had = clearUserWeight(userId);
      await interaction.reply({
        content: had
          ? `**${name}** cleared their weight: lifts and bodyweight exercises are scored against the ${REFERENCE} standards again, for everything in a running season.`
          : `You had no body weight set; your lifts and bodyweight exercises are scored against the ${REFERENCE} standards.`,
        ...(had ? {} : ephemeral),
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const current = getUserWeight(target.id);
    const targetName = getUser(target.id)?.displayName ?? target.displayName;
    await interaction.reply({
      content:
        current === null
          ? `**${targetName}** has not set a body weight: scored at ${REFERENCE}.`
          : `**${targetName}** is scored at ${formatWeight(current)}.`,
    });
  },
};
