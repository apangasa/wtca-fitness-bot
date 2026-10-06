import { registerCommands } from '../register.js';

const count = await registerCommands();
console.log(`Registered ${count} slash commands.`);
