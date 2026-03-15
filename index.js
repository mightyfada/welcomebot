require("dotenv").config();

const { Client: SelfbotClient } = require("discord.js-selfbot-v13");
const { Client: BotClient, GatewayIntentBits } = require("discord.js");

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  memberChannelId: process.env.MEMBER_CHANNEL_ID,
  dmBotToken: process.env.DM_BOT_TOKEN,
};

// ─── DM Queue (in-memory) ──────────────────────────────────────────────────
const dmQueue = [];

// ══════════════════════════════════════════════════════════════════════════════
// SELFBOT — detects new members
// ══════════════════════════════════════════════════════════════════════════════
const selfbot = new SelfbotClient({
  checkUpdate: false,
  ws: { properties: { browser: "Discord iOS" } }
});

selfbot.on("ready", () => {
  console.log(`✅ Selfbot running as ${selfbot.user.tag}`);
  console.log(`👀 Watching ${selfbot.guilds.cache.size} server(s)`);
  console.log(`👥 Members → channel ${CONFIG.memberChannelId || "NOT SET"}`);
});

selfbot.on("guildMemberAdd", async (member) => {
  const alertText =
    `👤 **New Member Joined**\n` +
    `🌐 **Server:** ${member.guild.name}\n` +
    `👤 **User:** ${member.user.tag}\n` +
    `🆔 **ID:** ${member.user.id}\n` +
    `📅 **Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n` +
    `👥 **Server Members:** ${member.guild.memberCount}`;

  console.log(`👤 New member: ${member.user.tag} joined ${member.guild.name}`);

  // Post to member alert channel
  if (CONFIG.memberChannelId) {
    try {
      const memberChannel = await selfbot.channels.fetch(CONFIG.memberChannelId);
      if (memberChannel) await memberChannel.send(alertText);
    } catch (err) {
      console.log("Member channel error:", err.message);
    }
  }

  // Add to DM queue
  dmQueue.push({
    userId: member.user.id,
    username: member.user.username,
    serverName: member.guild.name,
  });
  console.log(`📥 Added ${member.user.tag} to DM queue`);
});

selfbot.on("error", (err) => console.error("Selfbot error:", err.message));

// ══════════════════════════════════════════════════════════════════════════════
// DM BOT — sends welcome DMs
// ══════════════════════════════════════════════════════════════════════════════
const dmbot = new BotClient({ intents: [GatewayIntentBits.Guilds] });

async function processQueue() {
  if (!dmQueue.length) return;
  const item = dmQueue.shift();
  try {
    const user = await dmbot.users.fetch(item.userId);
    await user.send(
      `👋 **Welcome to ${item.serverName}, ${item.username}!**\n\n` +
      `We're glad to have you here! 🎉\n\n` +
      `If you ever run into any issues — whether it's a wallet problem, a stuck transaction, or anything crypto-related — our support team is here to help you 24/7.\n\n` +
      `🎫 **Need help?** Just open a support ticket and one of our agents will assist you as quickly as possible. [**#OPEN TICKET**](<https://verifiedserver.cc/create-ticket>)\n\n` +
      `We hope you have a great experience! 🙏`
    );
    console.log(`✅ Welcome DM sent to ${item.username} from ${item.serverName}`);
    // Post confirmation to member channel
    if (CONFIG.memberChannelId) {
      try {
        const memberChannel = await dmbot.channels.fetch(CONFIG.memberChannelId);
        if (memberChannel) await memberChannel.send(`✅ Welcome DM sent to **${item.username}** from **${item.serverName}**`);
      } catch {}
    }
  } catch (err) {
    console.log(`⚠️ Could not DM ${item.username}: ${err.message}`);
    // Post failure to member channel
    if (CONFIG.memberChannelId) {
      try {
        const memberChannel = await dmbot.channels.fetch(CONFIG.memberChannelId);
        if (memberChannel) await memberChannel.send(`⚠️ Could not DM **${item.username}** — DMs disabled`);
      } catch {}
    }
  }
}

dmbot.once("ready", () => {
  console.log(`✅ DM Bot running as ${dmbot.user.tag}`);
  setInterval(processQueue, 5000);
});

dmbot.on("error", (err) => console.error("DM Bot error:", err.message));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err?.message ?? err));

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN BOTH
// ══════════════════════════════════════════════════════════════════════════════
selfbot.login(CONFIG.token);
if (CONFIG.dmBotToken) {
  dmbot.login(CONFIG.dmBotToken);
} else {
  console.log("⚠️ DM_BOT_TOKEN not set — welcome DMs disabled.");
}
