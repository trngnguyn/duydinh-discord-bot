const { Events } = require("discord.js");
const { createApplication } = require("./app");

async function main() {
  const app = createApplication();
  const { client, env, eventService, discordMessageService } = app;
  const restoringGuilds = new Map();

  async function restoreGuild(guild) {
    if (restoringGuilds.has(guild.id)) return restoringGuilds.get(guild.id);
    const task = (async () => {
      try {
        const events = await eventService.list(guild.id);
        for (const event of events) {
          try {
            await discordMessageService.syncEvent(guild.id, event.eventId);
          } catch (error) {
            console.error(`Không thể khôi phục bảng sự kiện ${event.eventId}: ${error.message}`);
          }
        }
      } catch (error) {
        console.error(`Không thể khôi phục server ${guild.id}: ${error.message}`);
      } finally {
        restoringGuilds.delete(guild.id);
      }
    })();
    restoringGuilds.set(guild.id, task);
    return task;
  }

  client.once(Events.ClientReady, async readyClient => {
    console.log(`Bot đã đăng nhập: ${readyClient.user.tag}`);
    await Promise.all([...readyClient.guilds.cache.values()].map(restoreGuild));
  });

  client.on(Events.GuildCreate, guild => {
    if (client.isReady()) restoreGuild(guild);
  });
  client.on(Events.Error, error => console.error(`Discord client error: ${error.message}`));
  await client.login(env.discordToken);
}

main().catch(error => {
  console.error(`Không thể khởi động bot: ${error.message}`);
  process.exitCode = 1;
});
