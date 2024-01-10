import { Client, GatewayIntentBits } from 'discord.js';
import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import webhookListener from './webhook_listener.js';

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
	hoist: true,
};

async function updateMemberRoleForDonation(guild, member, donationAmount) {


	if (guild && member && donationAmount >= PREMIUM_CUTOFF) {

		let role = Array.from(await guild.roles.fetch()).find(
			(existingRole) => existingRole.name === premiumRole.name,
		);

		if (!role) {
			role = await guild.roles.create(premiumRole);
		}

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

	const command = commandHandlerForCommandName[commandName];
	if (!command) {
		return;
	}


	const authorIsBotOwner = msg.author.id === BOT_OWNER_ID;
	if (command.botOwnerOnly && !authorIsBotOwner) {
		return await msg.channel.send('Hey, only my owner can issue that command!');
	}

	const args = parts.slice(1);

	try {
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

async function findUserInString(str) {
	const lowercaseStr = str.toLowerCase();
	const guilds = await client.guilds.cache;

	let user = null;
	await Promise.all(

		guilds.map(async (guild) => {
			const members = await guild.members.fetch();

			members.map(async (member) => {
				if (
					lowercaseStr.indexOf(
						`${member.user.username.toLowerCase()}#${member.user.discriminator}`,
					) !== -1
				) {
					user = member;
				}
			});
		}),
	);


	return user;
}

async function onDonation(
	paymentSource,
	paymentId,
	timestamp,
	amount,
	senderName,
	message,
) {
	try {
		const user = await findUserInString(message);
		const guild = user ? (await client.guilds.cache).find(async currGuild => await currGuild.members.fetch(user.id)) : null;
		const guildMember = guild ? await guild.members.fetch(user.id) : null;

		return await updateMemberRoleForDonation(guild, guildMember, amount);
	}
	catch (err) {
		console.warn('Error handling donation event.');
		console.warn(err);
	}
}

webhookListener.on('donation', onDonation);
client.login(TOKEN);
