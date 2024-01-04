import { Client, GatewayIntentBits } from 'discord.js';
import { REST, Routes } from 'discord.js';
import 'dotenv/config';

const commands = [
	{
		name: 'ping',
		description: 'Replies with Pong!',
	},
];
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(TOKEN);

const updateCommands = async () => {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

		console.log('Successfully reloaded application (/) commands.');
	}
	catch (error) {
		console.error(error);
	}
};

updateCommands();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
});

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === 'ping') {
		await interaction.reply('Pong!');
	}
});

client.on('messageCreate', async (message) => {
	if (message.content.startsWith('ping')) {
		message.channel.send('pong!');
	}
});

client.on('guildMemberAdd', async (member) => {
	const channel = member.guild.channels.cache.find(
		(ch) => ch.name === 'general',
	);
	if (!channel) return;
	channel.send(`Welcome ${member}!`);
});

client.on('error', (err) => {
	console.warn(err);
});

client.login(TOKEN);
