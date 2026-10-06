import {
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import { listExercises, recentUsage, type ExerciseRow } from '../db/queries.js';
import { lastNDayKeys } from '../time.js';

export interface CommandDef {
  data: RESTPostAPIApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export function guildIdOf(interaction: ChatInputCommandInteraction): string | null {
  return interaction.guildId;
}

/** First name from the server nickname or display name; used only when a user is created. */
export function actorName(interaction: ChatInputCommandInteraction): string {
  const member = interaction.member;
  const full =
    member && 'displayName' in member && typeof member.displayName === 'string'
      ? member.displayName
      : interaction.user.displayName || interaction.user.username;

  return full.trim().split(/\s+/)[0] || full;
}

export function png(buffer: Buffer, name: string): AttachmentBuilder {
  return new AttachmentBuilder(buffer, { name });
}

// Routes autocomplete to the handler for the focused option (Discord sends one callback per command).
export function byOption(handlers: Record<string, (i: AutocompleteInteraction) => Promise<void>>) {
  return async (interaction: AutocompleteInteraction): Promise<void> => {
    const handler = handlers[interaction.options.getFocused(true).name];
    if (handler) await handler(interaction);
    else await interaction.respond([]);
  };
}

/** Exercise autocomplete, optionally filtered, ordered by the user's use in the last 30 days. */
export function exerciseChoices(filter: (e: ExerciseRow) => boolean = () => true) {
  return async (interaction: AutocompleteInteraction): Promise<void> => {
    const typed = interaction.options.getFocused().toLowerCase();
    const usage = interaction.guildId
      ? recentUsage(interaction.guildId, interaction.user.id, lastNDayKeys(30)[0]!)
      : new Map<string, number>();
    const matches = listExercises()
      .filter(filter)
      .filter((e) => e.key.includes(typed) || e.label.toLowerCase().includes(typed))
      .sort((a, b) => (usage.get(b.key) ?? 0) - (usage.get(a.key) ?? 0))
      .slice(0, 25)
      .map((e) => ({ name: e.label, value: e.key }));
    await interaction.respond(matches);
  };
}

export const exerciseAutocomplete = exerciseChoices();
