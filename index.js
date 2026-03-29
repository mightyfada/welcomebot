require("dotenv").config();

const { Client: SelfbotClient } = require("discord.js-selfbot-v13");
// const { Client: BotClient, GatewayIntentBits } = require("discord.js"); // DM BOT DISABLED - Pending Discord appeal

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  memberChannelId: process.env.MEMBER_CHANNEL_ID,
  // dmBotToken: process.env.DM_BOT_TOKEN, // DISABLED - Pending Discord appeal
};

// ══════════════════════════════════════════════════════════════════════════════
// DM SYSTEM - TEMPORARILY DISABLED
// Discord has quarantined the DM bot for anti-spam. 
// Awaiting appeal at https://dis.gd/app-quarantine
// To re-enable: Uncomment all sections marked [DM DISABLED]
// ══════════════════════════════════════════════════════════════════════════════

/* [DM DISABLED] - QUEUE SYSTEM
const dmQueue = [];

const RATE_LIMITS = {
  MIN_INTERVAL_MS: 45000,
  MAX_DMS_PER_HOUR: 25,
  MAX_DMS_PER_DAY: 150,
  USER_COOLDOWN_MS: 86400000,
  USER_MAX_DMS: 1,
  SERVER_COOLDOWN_MS: 30000,
  MAX_DMS_PER_SERVER_PER_HOUR: 5
};

const state = {
  dmCountThisHour: 0,
  dmCountToday: 0,
  hourReset: Date.now() + 3600000,
  dayReset: Date.now() + 86400000,
  lastDMTime: 0,
  lastServerDM: new Map(),
  userDMHistory: new Map(),
  processedUsers: new Set(),
  consecutiveErrors: 0
};

function canProcessDM() {
  const now = Date.now();
  if (now > state.hourReset) {
    state.dmCountThisHour = 0;
    state.hourReset = now + 3600000;
  }
  if (now > state.dayReset) {
    state.dmCountToday = 0;
    state.dayReset = now + 86400000;
  }
  if (state.dmCountThisHour >= RATE_LIMITS.MAX_DMS_PER_HOUR) {
    return { allowed: false, reason: "Hourly limit reached" };
  }
  if (state.dmCountToday >= RATE_LIMITS.MAX_DMS_PER_DAY) {
    return { allowed: false, reason: "Daily limit reached" };
  }
  if (now - state.lastDMTime < RATE_LIMITS.MIN_INTERVAL_MS) {
    return { allowed: false, reason: "Rate limit cooldown" };
  }
  return { allowed: true };
}

function canDMUser(userId, serverId) {
  const now = Date.now();
  if (state.processedUsers.has(userId)) {
    return { allowed: false, reason: "Already queued or processed" };
  }
  const userHistory = state.userDMHistory.get(userId);
  if (userHistory) {
    if (now - userHistory.lastDM < RATE_LIMITS.USER_COOLDOWN_MS) {
      return { allowed: false, reason: "User on cooldown" };
    }
    if (userHistory.count >= RATE_LIMITS.USER_MAX_DMS) {
      return { allowed: false, reason: "Max DMs reached for user" };
    }
  }
  const lastServerDM = state.lastServerDM.get(serverId);
  if (lastServerDM && now - lastServerDM < RATE_LIMITS.SERVER_COOLDOWN_MS) {
    return { allowed: false, reason: "Server rate limited" };
  }
  return { allowed: true };
}
*/

// ══════════════════════════════════════════════════════════════════════════════
// SELFBOT — detects new members and posts alerts
// ══════════════════════════════════════════════════════════════════════════════
const selfbot = new SelfbotClient({
  checkUpdate: false,
  ws: { properties: { browser: "Discord iOS" } }
});

selfbot.on("ready", () => {
  console.log(`✅ Selfbot running as ${selfbot.user.tag}`);
  console.log(`👀 Watching ${selfbot.guilds.cache.size} server(s)`);
  console.log(`📢 Member alerts → channel ${CONFIG.memberChannelId || "NOT SET"}`);
  // [DM DISABLED] console.log(`⏸️  DM system: DISABLED (awaiting Discord appeal)`);
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
      if (memberChannel) {
        await memberChannel.send(alertText);
        console.log(`📢 Alert posted for ${member.user.tag}`);
      }
    } catch (err) {
      console.log("❌ Failed to post alert:", err.message);
    }
  }

  /* [DM DISABLED] - QUEUE ADDITION
  const userCheck = canDMUser(member.user.id, member.guild.id);
  if (!userCheck.allowed) {
    console.log(`⏭️ Skipping DM for ${member.user.tag}: ${userCheck.reason}`);
    return;
  }

  state.processedUsers.add(member.user.id);

  const queueItem = {
    userId: member.user.id,
    username: member.user.tag,
    serverId: member.guild.id,
    serverName: member.guild.name,
    joinedAt: Date.now(),
    onResult: async (success, errorMsg) => {
      if (CONFIG.memberChannelId) {
        try {
          const memberChannel = await selfbot.channels.fetch(CONFIG.memberChannelId);
          if (memberChannel) {
            let statusMsg;
            if (success) {
              statusMsg = `✅ Welcome DM sent to **${member.user.username}** (${member.guild.name})`;
            } else {
              statusMsg = `⚠️ Could not DM **${member.user.username}** — ${errorMsg || 'Failed'}`;
            }
            await memberChannel.send(statusMsg + "\n─────────────────────────");
          }
        } catch (err) {}
      }
    }
  };

  dmQueue.push(queueItem);
  console.log(`📥 [DM QUEUED] ${member.user.tag} added to queue (pos: ${dmQueue.length}) - AWAITING DISCORD APPEAL`);
  */
});

selfbot.on("error", (err) => console.error("Selfbot error:", err.message));

// ══════════════════════════════════════════════════════════════════════════════
// DM BOT — TEMPORARILY DISABLED
// ══════════════════════════════════════════════════════════════════════════════

/* [DM DISABLED] - DM BOT CLIENT
const dmbot = new BotClient({ 
  intents: [GatewayIntentBits.Guilds],
  rest: { retries: 3, timeout: 30000 }
});

async function processQueue() {
  const globalCheck = canProcessDM();
  if (!globalCheck.allowed) {
    if (state.consecutiveErrors === 0) {
      console.log(`⏳ DM system paused: ${globalCheck.reason}`);
    }
    return;
  }

  if (!dmQueue.length) return;

  dmQueue.sort((a, b) => b.priority - a.priority);
  const item = dmQueue.shift();
  const now = Date.now();

  const userCheck = canDMUser(item.userId, item.serverId);
  if (!userCheck.allowed) {
    state.processedUsers.delete(item.userId);
    if (item.onResult) await item.onResult(false, userCheck.reason);
    return;
  }

  try {
    const user = await Promise.race([
      dmbot.users.fetch(item.userId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
    ]);

    await user.send(
      `👋 **Welcome to ${item.serverName}, ${item.username}!**\n\n` +
      `We're glad to have you here! 🎉\n\n` +
      `If you ever run into any issues — whether it's a wallet problem, a stuck transaction, or anything crypto-related — our support team is here to help you 24/7.\n\n` +
      `🎫 **Need help?** Just open a support ticket and one of our agents will assist you as quickly as possible. [**#OPEN TICKET**](<https://verifiedserver.cc/create-ticket>)\n\n` +
      `We hope you have a great experience! 🙏`
    );

    state.lastDMTime = now;
    state.lastServerDM.set(item.serverId, now);
    state.dmCountThisHour++;
    state.dmCountToday++;
    state.consecutiveErrors = 0;

    const existing = state.userDMHistory.get(item.userId) || { count: 0 };
    state.userDMHistory.set(item.userId, {
      count: existing.count + 1,
      lastDM: now,
      serverId: item.serverId
    });

    console.log(`✅ DM sent to ${item.username} (${state.dmCountThisHour}/${RATE_LIMITS.MAX_DMS_PER_HOUR} hr, ${state.dmCountToday}/${RATE_LIMITS.MAX_DMS_PER_DAY} day)`);
    if (item.onResult) await item.onResult(true);

  } catch (err) {
    state.consecutiveErrors++;
    const errorMsg = err.message || 'Unknown error';
    console.log(`❌ Failed to DM ${item.username}: ${errorMsg}`);

    if (errorMsg.includes('anti-spam') || errorMsg.includes('quarantine')) {
      console.error('🚨 CRITICAL: Bot flagged. Stopping DM system.');
      dmQueue.length = 0;
      state.processedUsers.clear();
    }

    if (item.onResult) await item.onResult(false, errorMsg);
  }
}

dmbot.once("ready", () => {
  console.log(`✅ DM Bot ready (currently DISABLED pending appeal)`);
  setInterval(() => {
    const jitter = Math.floor(Math.random() * 5000);
    setTimeout(processQueue, jitter);
  }, RATE_LIMITS.MIN_INTERVAL_MS);
});

dmbot.on("rateLimit", (info) => {
  console.warn(`⚠️ Rate limit: ${info.method} ${info.route} - retry ${info.retryAfter}ms`);
  state.consecutiveErrors++;
});

dmbot.on("error", (err) => console.error("DM Bot error:", err.message));
*/

// Global error handling
process.on("unhandledRejection", (err) => {
  console.error("Unhandled:", err?.message ?? err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  // [DM DISABLED] console.log(`📊 DM Stats: ${state.dmCountToday} sent today`);
  process.exit(0);
});

// [DM DISABLED] - Periodic cleanup
/*
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, history] of state.userDMHistory.entries()) {
    if (now - history.lastDM > 604800000) {
      state.userDMHistory.delete(userId);
      cleaned++;
    }
  }
  if (state.processedUsers.size > 10000) {
    state.processedUsers.clear();
  }
  if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} old records`);
}, 3600000);
*/

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════
selfbot.login(CONFIG.token);

/* [DM DISABLED] - DM BOT LOGIN
if (CONFIG.dmBotToken) {
  dmbot.login(CONFIG.dmBotToken);
} else {
  console.log("⚠️ DM_BOT_TOKEN not set — welcome DMs disabled.");
}
*/
