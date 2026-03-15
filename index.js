require("dotenv").config();

const { Client } = require("discord.js-selfbot-v13");
const fs = require("fs");

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  alertUserId: process.env.ALERT_USER_ID,
  alertChannelId: process.env.ALERT_CHANNEL_ID,
};

// ─── Keyword Storage ───────────────────────────────────────────────────────
const DB_PATH = "./keywords.json";

function loadKeywords() {
  // Try file first
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH));
      if (data.keywords && data.keywords.length > 0) return data.keywords;
    }
  } catch (e) {}
  // Fallback to KEYWORDS env var (survives redeploys)
  if (process.env.KEYWORDS) {
    try {
      const kws = process.env.KEYWORDS.split(",").map(k => k.trim()).filter(Boolean);
      if (kws.length > 0) { saveKeywords(kws); return kws; }
    } catch (e) {}
  }
  return [];
}

function saveKeywords(keywords) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ keywords }, null, 2));
  console.log(`💾 Keywords saved (${keywords.length})`);
}

// ─── Cooldown ──────────────────────────────────────────────────────────────
const cooldowns = new Map();
const COOLDOWN_MS = 60 * 1000;

// ─── Client ────────────────────────────────────────────────────────────────
const client = new Client({ checkUpdate: false, ws: { properties: { browser: "Discord iOS" } } });

// ─── Ready ─────────────────────────────────────────────────────────────────
client.on("ready", () => {
  console.log(`✅ Selfbot running as ${client.user.tag}`);
  console.log(`👀 Watching ${client.guilds.cache.size} server(s)`);
  const keywords = loadKeywords();
  console.log(`🔑 Tracking ${keywords.length} keyword(s): ${keywords.join(", ") || "none yet"}`);
  if (CONFIG.alertChannelId) console.log(`📢 Alerts → channel ${CONFIG.alertChannelId}`);
  else if (CONFIG.alertUserId) console.log(`📩 Alerts → DM ${CONFIG.alertUserId}`);
});

// ─── Message Handler ───────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  const keywords = loadKeywords();
  const content = message.content.toLowerCase();
  const isOwn = message.author.id === client.user.id;

  // ── Commands ───────────────────────────────────────────────────────────────
  if (isOwn) {

    if (message.content.startsWith("!addkeyword ")) {
      const keyword = message.content.slice(12).trim().toLowerCase();
      if (!keyword) return;
      if (keywords.includes(keyword)) {
        await message.channel.send(`Already tracking: ${keyword}`);
        return;
      }
      keywords.push(keyword);
      saveKeywords(keywords);
      await message.channel.send(`Tracking: ${keyword} | Total: ${keywords.length}`);
      return;
    }

    if (message.content.startsWith("!bulkadd ")) {
      const input = message.content.slice(9).trim().toLowerCase();
      const newKeywords = input.split(",").map(k => k.trim()).filter(k => k.length > 0);
      if (!newKeywords.length) { await message.channel.send("No keywords found."); return; }
      const added = [];
      const skipped = [];
      for (const kw of newKeywords) {
        if (keywords.includes(kw)) skipped.push(kw);
        else { keywords.push(kw); added.push(kw); }
      }
      saveKeywords(keywords);
      await message.channel.send(`Added: ${added.length} | Skipped: ${skipped.length} | Total: ${keywords.length}`);
      return;
    }

    if (message.content.startsWith("!removekeyword ")) {
      const keyword = message.content.slice(15).trim().toLowerCase();
      if (!keywords.includes(keyword)) { await message.channel.send(`Not found: ${keyword}`); return; }
      const updated = keywords.filter(k => k !== keyword);
      saveKeywords(updated);
      await message.channel.send(`Removed: ${keyword} | Total: ${updated.length}`);
      return;
    }

    if (message.content === "!keywords") {
      if (!keywords.length) { await message.channel.send("No keywords yet."); return; }
      const lines = keywords.map((k, i) => (i + 1) + ". " + k);
      const chunks = [];
      let current = "Keywords (" + keywords.length + " total):\n";
      for (const line of lines) {
        if ((current + line + "\n").length > 1900) { chunks.push(current); current = ""; }
        current += line + "\n";
      }
      if (current) chunks.push(current);
      for (const chunk of chunks) await message.channel.send(chunk);
      return;
    }

    if (message.content === "!clearkeywords") {
      saveKeywords([]);
      await message.channel.send("All keywords cleared.");
      return;
    }

    if (message.content === "!servers") {
      const list = client.guilds.cache.map(g => `${g.name} (${g.memberCount})`).join("\n");
      await message.channel.send(`Servers (${client.guilds.cache.size}):\n${list}`);
      return;
    }

    if (message.content === "!setalertchannel") {
      await message.channel.send(
        `Go to Railway > Variables and add:\nALERT_CHANNEL_ID=${message.channel.id}\nThen redeploy.`
      );
      return;
    }

    if (message.content === "!help") {
      await message.channel.send(
        "Commands:\n" +
        "!addkeyword <word>\n" +
        "!bulkadd <w1>, <w2>...\n" +
        "!removekeyword <word>\n" +
        "!keywords\n" +
        "!clearkeywords\n" +
        "!servers\n" +
        "!setalertchannel\n" +
        "!help"
      );
      return;
    }

    return;
  }

  // ── Keyword detection ──────────────────────────────────────────────────────
  if (!message.guild) return;
  if (!keywords.length) return;

  const matched = keywords.filter(kw => content.includes(kw));
  if (!matched.length) return;

  for (const keyword of matched) {
    const cooldownKey = `${message.guild.id}-${message.channel.id}-${keyword}`;
    const lastAlert = cooldowns.get(cooldownKey) || 0;
    const now = Date.now();
    if (now - lastAlert < COOLDOWN_MS) continue;
    cooldowns.set(cooldownKey, now);

    const alertText =
      `KEYWORD: ${keyword}\n` +
      `From: ${message.author.tag}\n` +
      `Server: ${message.guild.name}\n` +
      `Channel: #${message.channel.name}\n` +
      `Jump: ${message.url}\n\n` +
      `Message: ${message.content.slice(0, 800)}`;

    console.log(`ALERT: "${keyword}" in ${message.guild.name} by ${message.author.tag}`);

    if (CONFIG.alertChannelId) {
      try {
        const alertChannel = await client.channels.fetch(CONFIG.alertChannelId);
        if (alertChannel) { await alertChannel.send(alertText); continue; }
      } catch (err) {
        console.log("Channel alert error:", err.message);
      }
    }

    if (CONFIG.alertUserId) {
      try {
        const alertUser = await client.users.fetch(CONFIG.alertUserId);
        await alertUser.send(alertText);
      } catch (err) {
        console.log("DM alert error:", err.message);
      }
    }
  }
});

client.on("error", (err) => console.error("Error:", err.message));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err?.message ?? err));
client.login(CONFIG.token);

// ─── New Member Join Alert ─────────────────────────────────────────────────
client.on("guildMemberAdd", async (member) => {
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
      const memberChannel = await client.channels.fetch(CONFIG.memberChannelId);
      if (memberChannel) await memberChannel.send(alertText);
    } catch (err) {
      console.log("Member join alert error:", err.message);
    }
  }

  // Add to DM queue for dmbot to process
  try {
    const queue = fs.existsSync("./dm_queue.json") ? JSON.parse(fs.readFileSync("./dm_queue.json")) : [];
    queue.push({ userId: member.user.id, username: member.user.username, serverName: member.guild.name, addedAt: Date.now() });
    fs.writeFileSync("./dm_queue.json", JSON.stringify(queue, null, 2));
    console.log(`📥 Added ${member.user.tag} to DM queue`);
  } catch (err) {
    console.log("Queue error:", err.message);
  }
});
