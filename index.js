const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const { token, clientId } = require('./config/config.js');
const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const discordTranscripts = require('discord-html-transcripts');

const ticketConfigPath = './config/ticket/ticket.json';
let ticketConfig;
try {
    ticketConfig = require(ticketConfigPath);
} catch (error) {
    console.error('Fehler beim Laden der Ticket-Konfiguration:', error);
    ticketConfig = { tickets: {} };
}

const teamRoleId = ticketConfig.roles.teamRoleId;

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const questions = {
    buy: [
        { title: 'Product', question: 'Please specify the product you are referring to.', emoji: '📦 |' },
        { title: 'Quantity', question: 'Please specify the quantity of the product.', emoji: '🔢 |' },
        { title: 'Payment Method', question: 'Please specify your payment method.', emoji: '💳 |' },
    ],
    support: [
        { title: 'Issue Description', question: 'Please describe your issue in detail.', emoji: '❗ |' },
        { title: 'Priority Level', question: 'Please specify the priority of your issue (Low, Medium, High).', emoji: '⚠️ |' }
    ],
    replace: [
        { title: 'Item to Replace', question: 'Please specify the item you want to replace.', emoji: '🔄 |' },
        { title: 'Reason for Replacement', question: 'Please provide the reason for the replacement.', emoji: '❌ |' }
    ],
    exchange: [
        { title: 'Item to Exchange', question: 'Please specify the item you want to exchange.', emoji: '🔄 |' },
        { title: 'Exchange Item', question: 'Please specify the item you want in exchange.', emoji: '🔁 |' }
    ]
};

async function askQuestions(interaction, category, ticketChannel) {
    const questionList = questions[category];
    const answers = {};

    for (const item of questionList) {
        const questionEmbed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setTitle(`${item.emoji} ${item.title}`)
            .setDescription(item.question);

        const questionMessage = await ticketChannel.send({ embeds: [questionEmbed] });

        const filter = response => response.author.id === interaction.user.id;
        const collected = await ticketChannel.awaitMessages({ filter, max: 1, time: 100000, errors: ['time'] })
            .catch(() => {
                interaction.followUp({ content: 'Time ran out. Please start the process again.', ephemeral: true });
                throw new Error('Timeout');
            });

        const userResponse = collected.first();
        answers[item.title] = userResponse ? userResponse.content : 'No response';

        if (userResponse) {
            await userResponse.delete();
        }
        await questionMessage.delete();
    }

    ticketConfig.tickets[ticketChannel.id].answers = answers;
    fs.writeFileSync(ticketConfigPath, JSON.stringify(ticketConfig, null, 2));

    await updateTicketEmbed(ticketChannel);

    let newChannelName = '';

    if (category === 'buy') {
        const product = answers['Product'];
        const quantity = answers['Quantity'];
        const paymentMethod = answers['Payment Method'];
        newChannelName = `${product}-${quantity}-${paymentMethod}`;
    } else if (category === 'support') {
        const issueDescription = answers['Issue Description'];
        const priorityLevel = answers['Priority Level'];
        newChannelName = `${issueDescription}-${priorityLevel}`;
    } else if (category === 'replace') {
        const itemToReplace = answers['Item to Replace'];
        const reasonForReplacement = answers['Reason for Replacement'];
        newChannelName = `${itemToReplace}-${reasonForReplacement}`;
    } else if (category === 'exchange') {
        const itemToExchange = answers['Item to Exchange'];
        const exchangeItem = answers['Exchange Item'];
        newChannelName = `${itemToExchange}-${exchangeItem}`;
    }

    if (newChannelName) {
        await ticketChannel.setName(newChannelName);
        ticketConfig.tickets[ticketChannel.id].ticketname = newChannelName;
        fs.writeFileSync(ticketConfigPath, JSON.stringify(ticketConfig, null, 2));
    }
}

client.once('ready', async () => {
    console.log('Bot is online!');

    try {
        for (const [id, ticket] of Object.entries(ticketConfig.tickets)) {
            const ticketChannel = client.channels.cache.get(id);
            if (ticketChannel) {
                await updateTicketEmbed(ticketChannel);
            }
        }

        setInterval(async () => {
            for (const [id, ticket] of Object.entries(ticketConfig.tickets)) {
                const ticketChannel = client.channels.cache.get(id);
                if (ticketChannel) {
                    await updateTicketEmbed(ticketChannel);
                }
            }
        }, 60 * 1000);
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Ticket-Channels:', error);
    }
});

const commands = [
    {
        name: 'ticketembed',
        description: 'Sendet ein Ticket-Embed in den Chat',
    },
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Fehler beim Registrieren der Slash-Commands:', error);
    }
})();

function userTicketCount(userId) {
    const tickets = Object.values(ticketConfig.tickets);
    const userTickets = tickets.filter(ticket => ticket.userId === userId);
    return userTickets.length;
}

function userTicketCountInCategory(userId, categoryId) {
    const tickets = Object.values(ticketConfig.tickets);
    const userTicketsInCategory = tickets.filter(ticket => ticket.userId === userId && ticket.categoryid === categoryId);
    return userTicketsInCategory.length;
}

function countOpenTickets() {
    return Object.keys(ticketConfig.tickets).length;
}

async function updateTicketEmbed(ticketChannel) {
    try {
        const ticket = ticketConfig.tickets[ticketChannel.id];

        if (!ticket || !ticket.userId || !ticket.user) {
            console.error(`Incomplete ticket data for channel ID: ${ticketChannel.id}`);
            return;
        }

        const user = ticket.user;
        const openTicketsCount = countOpenTickets();

        const updatedEmbed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setAuthor({ name: `${user} | Ticket`, iconURL: ticketChannel.guild.members.cache.get(ticket.userId)?.user.displayAvatarURL() })
            .setDescription(`
                :flag_us: **ENGLISH**
                Welcome to Res Code's Support! We are here to help you with your concerns. How can we support you today?

                :flag_de: **GERMAN**
                Herzlich willkommen beim Res-Code's-Support! Wir sind hier, um Ihnen bei Ihren Anliegen zu helfen. Wie können wir Sie heute unterstützen?

                **🕵️ | User**
                <@${ticket.userId}>

                **👥 | Open tickets**
                \`${openTicketsCount}\`
            `)
.setImage(ticketConfig.embed.bannerurl);

        if (ticket.answers) {
            for (const item of questions[ticket.reason]) {
                if (ticket.answers[item.title]) {
                    updatedEmbed.addFields({ name: `${item.emoji} ${item.title}`, value: ticket.answers[item.title] });
                }
            }
        }

        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('control_ticket')
                    .setLabel('Control')
                    .setStyle(ButtonStyle.Secondary)
            );

        const message = await ticketChannel.messages.fetch(ticket.messageId);
        await message.edit({ embeds: [updatedEmbed], components: [buttonRow] });
    } catch (error) {
        console.error(`Fehler beim Aktualisieren des Ticket-Embeds in Kanal ID: ${ticketChannel.id}`, error);
    }
}

async function closeTicket(interaction, channelId, channel) {
    const ticket = ticketConfig.tickets[channelId];

    if (!ticket) return;

    const attachment = await discordTranscripts.createTranscript(channel);

    const user = await client.users.fetch(ticket.userId);
    const embed = new EmbedBuilder()
        .setTitle(`Your Ticket at ${interaction.guild.name} has been closed.`)
        .setColor(460551)
        .setFooter({
            text: "Made By .gg/res-codes",
            iconURL: user.displayAvatarURL({ dynamic: true, size: 1024 }) 
        })
        .addFields([
            { name: '〢Ticket', value: `\`\`\`${ticket.ticketname}\`\`\``, inline: false },
            { name: '〢Created:', value: `\`\`\`${new Date(ticket.created).toLocaleString()}\`\`\``, inline: true },
            { name: '〢Closed:', value: `\`\`\`${new Date().toLocaleString()}\`\`\``, inline: true },
            { name: '〢Ticket Closed by:', value: `\`\`\`${interaction.user.tag}\`\`\`` }
        ])
        .setAuthor({
            name: ticket.user,
            iconURL: user.displayAvatarURL({ dynamic: true, size: 1024 })
        });

    await user.send({ embeds: [embed], files: [attachment] }).catch(error => {
        console.error('Fehler beim Senden der DM:', error);
    });

    const transcriptChannelId = ticketConfig.categories.transcriptid;

    if (!transcriptChannelId) {
        console.error('Fehler: transcriptid ist undefined oder nicht in der ticket.json Datei definiert.');
        return;
    }

    const transcriptChannel = await client.channels.fetch(transcriptChannelId);
    
    if (transcriptChannel) {
        await transcriptChannel.send({ embeds: [embed], files: [attachment] }).catch(error => {
            console.error('Fehler beim Senden der Nachricht in den Transkript-Channel:', error);
        });
    } else {
        console.error('Transkript-Channel nicht gefunden:', transcriptChannelId);
    }

    delete ticketConfig.tickets[channelId];
    fs.writeFileSync(ticketConfigPath, JSON.stringify(ticketConfig, null, 2));

    if (channel) {
        await channel.delete().catch(error => {
            console.error('Fehler beim Löschen des Kanals:', error);
        });
    }
}


client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand()) {
            await interaction.deferReply({ ephemeral: false });

            if (interaction.commandName === 'ticketembed') {
                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('Create your Ticket')
                    .addFields(
                        { name: '🇩🇪 German', value: 'Wählen Sie im Dropdown-Menü aus, welche Art von Ticket Sie öffnen möchten!', inline: false },
                        { name: '🇺🇸 English', value: 'Select which type of ticket you would like to open in the drop-down menu!', inline: false }
                    )
                    .setImage(ticketConfig.embed.bannerurl)
                    .setFooter({ text: "Res-Code's | Ticket System"});

                const dropdownMenu = new StringSelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Select a ticket type')
                    .addOptions([
                        {
                            label: 'Buy',
                            description: 'Fragen zu Käufen',
                            value: 'buy',
                            emoji: '🛒',
                        },
                        {
                            label: 'Support',
                            description: 'Fragen und Support',
                            value: 'support',
                            emoji: '🎟️',
                        },
                        {
                            label: 'Replace',
                            description: 'Artikel ersetzen',
                            value: 'replace',
                            emoji: '🔄',
                        },
                        {
                            label: 'Exchange',
                            description: 'Artikel austauschen',
                            value: 'exchange',
                            emoji: '🔁',
                        },
                        {
                            label: 'Cancel Selection',
                            description: 'Auswahl abbrechen',
                            value: 'cancel',
                            emoji: '❌',
                        },
                    ]);

                const row = new ActionRowBuilder().addComponents(dropdownMenu);

                await interaction.editReply({ embeds: [embed], components: [row] });
            }
        } else if (interaction.isStringSelectMenu()) {
            const user = interaction.user;
            const selectedValue = interaction.values[0];

            if (selectedValue === 'cancel') {
                await interaction.reply({ content: 'Auswahl abgebrochen.', ephemeral: true });
                return;
            }

            const categoryId = ticketConfig.categories[selectedValue]; 
            const ticketName = `Ticket-${user.username}`;

            if (!categoryId) {
                await interaction.reply({ content: 'Ungültige Auswahl oder Kategorie nicht gefunden.', ephemeral: true });
                return;
            }

            if (userTicketCount(user.id) >= 2) {
                await interaction.reply({ content: 'Du hast bereits 2 offene Tickets. Bitte schließe eines, bevor du ein neues erstellst.', ephemeral: true });
                return;
            }

            if (userTicketCountInCategory(user.id, categoryId) >= 1) {
                await interaction.reply({ content: 'Du hast bereits ein offenes Ticket in dieser Kategorie.', ephemeral: true });
                return;
            }

            const ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: 0,
                parent: categoryId, 
            });
            
            await ticketChannel.lockPermissions(); 
            
            await ticketChannel.permissionOverwrites.create(user.id, {
                ViewChannel: true,
                SendMessages: true,
            });

            const sentMessage = await ticketChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#000000')
                        .setAuthor({ name: `${user.tag} | Ticket`, iconURL: user.displayAvatarURL() })
                        .setDescription(`
                            :flag_us: **ENGLISH**
                            Welcome to Res Code's Support! We are here to help you with your concerns. How can we support you today?
            
                            :flag_de: **GERMAN**
                            Herzlich willkommen beim Res-Code's-Support! Wir sind hier, um Ihnen bei Ihren Anliegen zu helfen. Wie können wir Sie heute unterstützen?

                            **🕵️ | User**
                            <@${user.id}>
            
                            **📝 | Open tickets**
                            \`Wird bearbeitet...\`
                        `)
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('close_ticket')
                                .setLabel('Close')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('control_ticket')
                                .setLabel('Control')
                                .setStyle(ButtonStyle.Secondary)
                        )
                ]
            });
            
            ticketConfig.tickets[ticketChannel.id] = {
                userId: user.id,
                user: user.tag,
                ticketname: ticketName,
                channelid: ticketChannel.id,
                reason: selectedValue,
                categoryid: categoryId,
                messageId: sentMessage.id,
                created: Date.now()
            };
            
            fs.writeFileSync(ticketConfigPath, JSON.stringify(ticketConfig, null, 2));
            
            setTimeout(async () => {
                await updateTicketEmbed(ticketChannel);
            }, 5000);
            
            await interaction.reply({ content: `Ticket wurde erstellt: ${ticketChannel}`, ephemeral: true });
            
            await askQuestions(interaction, selectedValue, ticketChannel);
            
        } else if (interaction.isButton()) {
            const channelId = interaction.channelId;
            const channel = await interaction.guild.channels.cache.get(channelId);

            if (interaction.customId === 'close_ticket' || interaction.customId === 'confirm_close') {
                await closeTicket(interaction, channelId, channel);
            } else if (interaction.customId === 'control_ticket') {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (!member.roles.cache.has(teamRoleId)) {
                    await interaction.reply({ content: 'Du hast keine Berechtigung, das Ticket zu steuern.', ephemeral: true });
                    return;
                }

                const controlEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('Ticket Control Panel')
                    .setDescription('Use the buttons below to manage this ticket.');

                const controlRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('rename_ticket')
                            .setLabel('Rename')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('add_user')
                            .setLabel('Add User')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('remove_user')
                            .setLabel('Remove User')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('close_request')
                            .setLabel('Close Request')
                            .setStyle(ButtonStyle.Danger)
                    );

                await interaction.reply({ embeds: [controlEmbed], components: [controlRow], ephemeral: true });
            } else if (interaction.customId === 'close_request') {
                const closeConfirmEmbed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('Confirm Ticket Closure')
                    .setDescription(`<@${ticketConfig.tickets[channelId].userId}> Ist alles erledigt? Kann das Ticket geschlossen werden?`);

                const closeConfirmRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_close')
                            .setLabel('Close')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('cancel_close')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary)
                    );

                await interaction.reply({ embeds: [closeConfirmEmbed], components: [closeConfirmRow], ephemeral: false });
            } else if (interaction.customId === 'cancel_close') {
                try {
                    await interaction.deferUpdate();
                    await interaction.deleteReply();
                } catch (error) {
                    console.error('Fehler beim Löschen der Nachricht:', error);
                    if (error.code === 10062) {
                        console.log('Interaktion bereits beendet oder nicht mehr verfügbar.');
                    }
                }
            } else if (interaction.customId === 'rename_ticket') {
                const modal = new ModalBuilder()
                    .setCustomId('rename_ticket_modal')
                    .setTitle('Rename Ticket');

                const ticketNameInput = new TextInputBuilder()
                    .setCustomId('new_ticket_name')
                    .setLabel('New Ticket Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(ticketNameInput));

                await interaction.showModal(modal);
            } else if (interaction.customId === 'add_user') {
                const modal = new ModalBuilder()
                    .setCustomId('add_user_modal')
                    .setTitle('Add User to Ticket');

                const userIdInput = new TextInputBuilder()
                    .setCustomId('user_id')
                    .setLabel('User ID to Add')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

                await interaction.showModal(modal);
            } else if (interaction.customId === 'remove_user') {
                const modal = new ModalBuilder()
                    .setCustomId('remove_user_modal')
                    .setTitle('Remove User from Ticket');

                const userIdInput = new TextInputBuilder()
                    .setCustomId('user_id_remove')
                    .setLabel('User ID to Remove')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

                await interaction.showModal(modal);
            }
        } else if (interaction.isModalSubmit()) {
            const channelId = interaction.channelId;
            const channel = await interaction.guild.channels.cache.get(channelId);

            if (interaction.customId === 'rename_ticket_modal') {
                const newTicketName = interaction.fields.getTextInputValue('new_ticket_name');

                if (channel) {
                    await channel.setName(newTicketName);
                }

                if (ticketConfig.tickets[channelId]) {
                    ticketConfig.tickets[channelId].ticketname = newTicketName;
                    fs.writeFileSync(ticketConfigPath, JSON.stringify(ticketConfig, null, 2));
                }

                const renameEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Ticket Renamed')
                    .setDescription(`The ticket has been successfully renamed to **${newTicketName}**.`);

                await interaction.reply({ embeds: [renameEmbed], ephemeral: true });
            } else if (interaction.customId === 'add_user_modal') {
                const userIdToAdd = interaction.fields.getTextInputValue('user_id');

                try {
                    const user = await interaction.guild.members.fetch(userIdToAdd);

                    if (channel && user) {
                        await channel.permissionOverwrites.create(user.id, {
                            ViewChannel: true,
                            SendMessages: true,
                        });
                    }

                    const addUserEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('User Added')
                        .setDescription(`User <@${userIdToAdd}> has been successfully added to this ticket.`);

                    await interaction.reply({ embeds: [addUserEmbed], ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'Ungültige Benutzer-ID oder Benutzer nicht gefunden.', ephemeral: true });
                }
            } else if (interaction.customId === 'remove_user_modal') {
                const userIdToRemove = interaction.fields.getTextInputValue('user_id_remove');

                try {
                    const user = await interaction.guild.members.fetch(userIdToRemove);

                    if (channel && user) {
                        await channel.permissionOverwrites.delete(user.id);
                    }

                    const removeUserEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('User Removed')
                        .setDescription(`User <@${userIdToRemove}> has been successfully removed from this ticket.`);

                    await interaction.reply({ embeds: [removeUserEmbed], ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: 'Ungültige Benutzer-ID oder Benutzer nicht gefunden.', ephemeral: true });
                }
            }
        }
    } catch (error) {
        console.error('Fehler bei der Interaktionsverarbeitung:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
            await interaction.followUp({ content: 'Ein unerwarteter Fehler ist aufgetreten.', ephemeral: true });
        }
    }
});

client.login(token);
