import { Client, GatewayIntentBits } from 'discord.js';
import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import WebhookListener  from './webhook_listener.js';

const commands = [
	{
		name: 'ping',
		description: 'Replies with Pong!',
	},
];
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIX = 'pb!';
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
const PREMIUM_CUTOFF = 10;

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

const premiumRole = {
	name: 'Premium Member',
	color: 0x6aa84f,
	hoist: true, // Show users with this role in their own section of the member list.
};

async function updateMemberRoleForDonation(guild, member, donationAmount) {
	// If the user donated more than $10, give them the premium role.
	if (guild && member && donationAmount >= PREMIUM_CUTOFF) {
		// Get the role, or if it doesn't exist, create it.
		let role = Array.from(await guild.roles.fetch()).find(
			(existingRole) => existingRole.name === premiumRole.name,
		);

		if (!role) {
			role = await guild.roles.create(premiumRole);
		}

		// Add the role to the user, along with an explanation
		// for the guild log (the "audit log").
		return await member.roles.add(role.id, 'Donated $10 or more.');
	}
}

const commandHandlerForCommandName = {};
commandHandlerForCommandName['addpayment'] = {
	botOwnerOnly: true,
	execute: async (msg, args) => {
		const mention = args[0];

		const amount = parseFloat(args[1]);
		const guild = msg.channel.guild;

		const userId = mention.replace(/<@(.*?)>/, (match, group1) => group1);
		const member = await guild.members.fetch(userId);

		const userIsInGuild = !!member;
		if (!userIsInGuild) {
			return msg.channel.send('User not found in this guild.');
		}

		const amountIsValid = amount && !Number.isNaN(amount);
		if (!amountIsValid) {
			return msg.channel.send('Invalid donation amount');
		}
		return Promise.all([
			msg.channel.send(`${mention} paid $${amount.toFixed(2)}`),
			updateMemberRoleForDonation(guild, member, amount),
		]);
	},
};

client.on('messageCreate', async (msg) => {
	const content = msg.content;

	// Ignore any messages sent as direct messages.
	// The bot will only accept commands issued in
	// a guild.
	if (!msg.channel.guild) {
		return;
	}

	// Ignore any message that doesn't start with the correct prefix.
	if (!content.startsWith(PREFIX)) {
		return;
	}

	// Extract the parts of the command and the command name
	const parts = content
		.split(' ')
		.map((s) => s.trim())
		.filter((s) => s);
	const commandName = parts[0].substr(PREFIX.length);

	// Get the appropriate handler for the command, if there is one.
	const command = commandHandlerForCommandName[commandName];
	if (!command) {
		return;
	}

	// If this command is only for the bot owner, refuse
	// to execute it for any other user.
	const authorIsBotOwner = msg.author.id === BOT_OWNER_ID;
	if (command.botOwnerOnly && !authorIsBotOwner) {
		return await msg.channel.send('Hey, only my owner can issue that command!');
	}

	// Separate the command arguments from the command prefix and command name.
	const args = parts.slice(1);

	try {
		// Execute the command.
		await command.execute(msg, args);
	}
	catch (err) {
		console.warn('Error handling command');
		console.warn(err);
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
