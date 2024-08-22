import { Client, GatewayIntentBits } from 'discord.js';
import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import webhookListener from './webhooks/webhook_listener.js';
import OpenAI from 'openai';
import cron from 'node-cron';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIX = 'sh!';
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
const BOT_ID = process.env.BOT_ID;
const PREMIUM_CUTOFF = 10;
const LOG_CHANNEL_ID = '1194720201464348704';

/*
 * Can be used with the `put`

  const newCommands = {
    name: 'dosomething',
    description: 'Does something!',
  };
*/

/*
 * Can be used with the `put`
 */
const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
  { name: 'ask', description: 'Replies with Fire away!' },
  { name: 'quote', description: 'Sends an inspirational quote!' },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

const updateCommands = async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    /* If posting new commands, uncomment the lines below: */

    // await rest.post(Routes.applicationCommands(CLIENT_ID), {
    //   body: newCommands,
    // });

    /* If posting/updating existing commands, uncomment the line below: */
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
  }
  catch (error) {
    console.error(error);
  }
};

if (parseInt(process.env.UPDATE_COMMANDS)) {
  updateCommands();
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
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

  if (interaction.commandName === 'ask') {
    const { user } = interaction;
    await interaction.reply('Fire away!');
    await user.createDM();
  }

  if (interaction.commandName === 'quote') {
    const { user } = interaction;
    await user.createDM();
    const reply = await fetchReply(
      'Please send me an inspirational quote.',
      user,
    );
    await interaction.reply(reply);
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
    if (!msg.channel.guild) {
      return;
    }
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

const tasks = [];


commandHandlerForCommandName['remind'] = {
  execute: async (msg, args) => {
    if (args.length < 2) {
      return msg.reply(
        'Please provide a task and a time to remind you (e.g., "sh!remind at Take out the trash 20:00")',
      );
    }

    if (args.join(' ').startsWith('at')) {
      const taskDescription = args.slice(1, -1).join(' ');
      // Simplified Time-Only 24 hr format given such as 20:00
      const time = `${args[args.length - 1]}`;

      const hrs = time.split(':');
      const cronExpression = `${hrs[1]} ${hrs[0]} * * *`;
      const job = cron.schedule(
        cronExpression,
        () => {
          msg.author.send(
            `@${msg.author.username}, don't forget to: ${taskDescription}`,
          );
          const index = tasks.findIndex((task) => task.taskDescription == taskDescription);
          job.stop();
          tasks.splice(index, 1);
        },
        {
          scheduled: true,
          timezone: 'Africa/Johannesburg',
        },
      );
      tasks.push({
        taskDescription,
        time,
        intervalId: job,
      });

      msg.reply(`I'll remind you to "${taskDescription}" at ${time}.`);
    }
    else if (args.join(' ').startsWith('repeat')) {
      /* sh!remind repeat Buy groceries 10 */

      const taskDescription = args.slice(1, args.length - 1).join(' ');
      const interval = args[args.length - 1];

      msg.reply(
        `I will remind you about '${taskDescription}' every ${interval} minutes`,
      );

      const cronExpression = `*/${interval} * * * *`;

      const job = cron.schedule(cronExpression, () => {
        msg.author.send(`Hey, it's time to do: ${taskDescription}`);
      });
      tasks.push({
        taskDescription,
        time: `every ${interval} minutes`,
        intervalId: job,
      });
    }
    else {
      /* sh!remind Buy groceries 10 */
      const taskDescription = args.slice(0, args.length - 1).join(' ');
      const time = args[args.length - 1];
      const cronExpression = `*/${time} * * * *`;

      msg.reply(
        `I will remind you about '${taskDescription}' in ${time} minutes.`,
      );

      const job = cron.schedule(cronExpression, () => {

        msg.author.send(
          `@${msg.author.username}, don't forget to: ${taskDescription}`,
        );
      });


      const period = `in ${time} minutes`;

      tasks.push({
        taskDescription,
        time: period,
        intervalId: job,
      });
    }
  },
};

commandHandlerForCommandName['stop'] = {
  execute: (msg, idx) => {
    const index = parseInt(idx) - 1;

    if (index < 0 || index >= tasks.length) {
      msg.reply('Invalid reminder index.');
      return;
    }

    const { taskDescription, intervalId } = tasks[index];
    intervalId.stop();
    tasks.splice(index, 1);

    msg.reply(`Reminder for "${taskDescription}" has been deleted.`);
  },
};

commandHandlerForCommandName['newyear'] = {
  execute: (msg) => {
    const cronExpression = '0 0 12 1 1 *';

    msg.reply('I will send you a new year\'s message every new year\'s.');

    const job = cron.schedule(cronExpression, () => {
      msg.author.send(`@${msg.author.username}, Happy New Year!`);
    });

    tasks.push({
      taskDescription: 'Send a New Year\'s message',
      time: '12:00 AM',
      intervalId: job,
    });
  },
};

commandHandlerForCommandName['birthday'] = {
  execute: (msg, args) => {
    // birthday date is in the format" "day month"
    const cronExpression = `0 0 12 ${args[0]} ${args[1]} *`;

    msg.reply('I will send you a birthday message on your birthday.');

    const job = cron.schedule(cronExpression, () => {
      msg.author.send(`@${msg.author.username}, Happy Birthday!`);
    });

    tasks.push({
      taskDescription: 'Send a birthday message',
      time: '12:00 AM',
      intervalId: job,
    });
  },
};

commandHandlerForCommandName['list'] = {
  execute: (msg) => {
    if (tasks.length === 0) {
      return msg.reply('You don\'t have any scheduled reminders.');
    }

    const taskList = tasks
      .map(
        (task, index) =>
          `${index + 1}. "${task.taskDescription}" time: ${task.time}`,
      )
      .join('\n');
    msg.author.send(`Your scheduled reminders:\n\n${taskList}`);
  },
};
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let userInfo = {
  user: '',
  conversationArr: [],
};

const fetchReply = async function(message, user) {
  const { user: currentUser, conversationArr } = userInfo;
  // Different user, reset the context
  if (user.id !== currentUser) {
    userInfo = {
      user: user.id,
      conversationArr: [],
    };
  }
  conversationArr.push({
    role: 'user',
    content: message,
  });
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: conversationArr,
  });

  conversationArr.push(response.choices[0].message);
  return response.choices[0].message.content;
};

client.on('messageCreate', async (msg) => {
  const content = msg.content;
  const parts = content
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s);
  const commandName = parts[0].substr(PREFIX.length);

  const command = commandHandlerForCommandName[commandName];

  const user = msg.author;

  if (user.id === BOT_ID) {
    return;
  }

  if (!content.startsWith(PREFIX) && !command) {
    // call ChatGPT
    const reply = await fetchReply(content, user);
    return await msg.channel.send(reply);
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
  const guilds = client.guilds.cache;

  let user,
    guild = null;
  await Promise.all(
    guilds.map(async (currGuild) => {
      const members = await currGuild.members.fetch();

      members.map(async (member) => {
        if (
          lowercaseStr.indexOf(
            `${member.user.username.toLowerCase()}#${member.user.discriminator}`,
          ) !== -1
        ) {
          user = member;
          guild = currGuild;
        }
      });
    }),
  );

  return { user, guild };
}

function logDonation(
  member,
  donationAmount,
  paymentSource,
  paymentId,
  senderName,
  message,
  timestamp,
) {
  const isKnownMember = !!member;
  const memberName = isKnownMember
    ? `${member.username}#${member.discriminator}`
    : 'Unknown';
  const embedColor = isKnownMember ? 0x00ff00 : 0xff0000;

  const embed = {
    title: 'Donation received',
    color: embedColor,
    timestamp,
    fields: [
      { name: 'Payment Source', value: paymentSource, inline: true },
      { name: 'Payment ID', value: paymentId, inline: true },
      { name: 'Sender', value: senderName, inline: true },
      { name: 'Donor Discord name', value: memberName, inline: true },
      {
        name: 'Donation amount',
        value: donationAmount.toString(),
        inline: true,
      },
      { name: 'Message', value: message, inline: true },
    ],
  };

  const channel = client.channels.cache.find((ch) => ch.id === LOG_CHANNEL_ID);
  channel.send({ embeds: [embed] });
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
    const { user, guild } = await findUserInString(message);
    const guildMember = guild ? await guild.members.fetch(user.id) : null;

    return await Promise.all([
      updateMemberRoleForDonation(guild, guildMember, amount),
      logDonation(
        guildMember,
        amount,
        paymentSource,
        paymentId,
        senderName,
        message,
        timestamp,
      ),
    ]);
  }
  catch (err) {
    console.warn('Error handling donation event.');
    console.warn(err);
  }
}

webhookListener.on('donation', onDonation);

client.login(TOKEN);
