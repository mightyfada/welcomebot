require("dotenv").config();

const { Client: SelfbotClient } = require("discord.js-selfbot-v13");
const { Client: BotClient, GatewayIntentBits } = require("discord.js");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  memberChannelId: process.env.MEMBER_CHANNEL_ID,
  dmBotToken: process.env.DM_BOT_TOKEN,
};

// ─── ANTI-SPAM PROTECTION SETTINGS ─────────────────────────────────────────
const RATE_LIMITS = {
  // Global rate limiting
  MIN_INTERVAL_MS: 45000,        // 45 seconds minimum between ANY DMs
  MAX_DMS_PER_HOUR: 25,          // Hard cap: 25 DMs per hour
  MAX_DMS_PER_DAY: 150,          // Hard cap: 150 DMs per day
  
  // Per-user rate limiting
  USER_COOLDOWN_MS: 86400000,    // 24 hours before re-DMing same user
  USER_MAX_DMS: 1,               // Max 1 DM per user ever (or per cooldown)
  
  // Server-specific limiting
  SERVER_COOLDOWN_MS: 30000,     // 30 seconds between DMs from same server
  MAX_DMS_PER_SERVER_PER_HOUR: 5 // Max 5 DMs per server per hour
};

// ─── STATE TRACKING ────────────────────────────────────────────────────────
const dmQueue = [];
const state = {
  dmCountThisHour: 0,
  dmCountToday: 0,
  hourReset: Date.now() + 3600000,
  dayReset: Date.now() + 86400000,
  lastDMTime: 0,
  lastServerDM: new Map(),    // serverId -> timestamp
  userDMHistory: new Map(),   // userId -> { count: number, lastDM: timestamp }
  processedUsers: new Set(),  // Prevent duplicate queue entries
  consecutiveErrors: 0
};

// ══════════════════════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT WITH DE-DUPLICATION
// ══════════════════════════════════════════════════════════════════════════════

function canProcessDM() {
  const now = Date.now();
  
  // Check hourly limit
  if (now > state.hourReset) {
    state.dmCountThisHour = 0;
    state.hourReset = now + 3600000;
  }
  if (state.dmCountThisHour >= RATE_LIMITS.MAX_DMS_PER_HOUR) {
    return { allowed: false, reason: "Hourly limit reached" };
  }
  
  // Check daily limit
  if (now > state.dayReset) {
    state.dmCountToday = 0;
    state.dayReset = now + 86400000;
  }
  if (state.dmCountToday >= RATE_LIMITS.MAX_DMS_PER_DAY) {
    return { allowed: false, reason: "Daily limit reached" };
  }
  
  // Check minimum interval
  if (now - state.lastDMTime < RATE_LIMITS.MIN_INTERVAL_MS) {
    return { allowed: false, reason: "Rate limit cooldown" };
  }
  
  return { allowed: true };
}

function canDMUser(userId, serverId) {
  const now = Date.now();
  
  // Check if already in queue (prevent duplicates)
  if (state.processedUsers.has(userId)) {
    return { allowed: false, reason: "Already queued or processed" };
  }
  
  // Check user cooldown/history
  const userHistory = state.userDMHistory.get(userId);
  if (userHistory) {
    // Check if within cooldown period
    if (now - userHistory.lastDM < RATE_LIMITS.USER_COOLDOWN_MS) {
      return { allowed: false, reason: "User on cooldown" };
    }
    // Check max DMs per user
    if (userHistory.count >= RATE_LIMITS.USER_MAX_DMS) {
      return { allowed: false, reason: "Max DMs reached for user" };
    }
  }
  
  // Check server rate limiting
  const lastServerDM = state.lastServerDM.get(serverId);
  if (lastServerDM && now - lastServerDM < RATE_LIMITS.SERVER_COOLDOWN_MS) {
    return { allowed: false, reason: "Server rate limited" };
  }
  
  const serverDMsThisHour = Array.from(state.userDMHistory.values())
    .filter(h => h.serverId === serverId && now - h.lastDM < 3600000)
    .length;
  if (serverDMsThisHour >= RATE_LIMITS.MAX_DMS_PER_SERVER_PER_HOUR) {
    return { allowed: false, reason: "Server hourly limit reached" };
  }
  
  return { allowed: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// SELFBOT — DETECTS NEW MEMBERS (MODIFIED)
// ══════════════════════════════════════════════════════════════════════════════

const selfbot = new SelfbotClient({
  checkUpdate: false,
  ws: { properties: { browser: "Discord iOS" } }
});

selfbot.on("ready", () => {
  console.log(`✅ Selfbot running as ${selfbot.user.tag}`);
  console.log(`👀 Watching ${selfbot.guilds.cache.size} server(s)`);
  console.log(`📊 Rate limits: ${RATE_LIMITS.MAX_DMS_PER_HOUR}/hour, ${RATE_LIMITS.MAX_DMS_PER_DAY}/day`);
  console.log(`⏱️  Min interval: ${RATE_LIMITS.MIN_INTERVAL_MS/1000}s`);
});

selfbot.on("guildMemberAdd", async (member) => {
  const now = Date.now();
  
  // Log the join regardless
  console.log(`👤 New member: ${member.user.tag} joined ${member.guild.name}`);
  
  // Check if we can even queue this user
  const userCheck = canDMUser(member.user.id, member.guild.id);
  if (!userCheck.allowed) {
    console.log(`⏭️ Skipping ${member.user.tag}: ${userCheck.reason}`);
    return;
  }
  
  // Mark as processed to prevent duplicates
  state.processedUsers.add(member.user.id);
  
  // Add to queue with metadata
  const queueItem = {
    userId: member.user.id,
    username: member.user.tag,
    serverId: member.guild.id,
    serverName: member.guild.name,
    joinedAt: now,
    priority: calculatePriority(member), // Prioritize certain servers
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
        } catch (err) {
          // Silent fail for status messages
        }
      }
    }
  };
  
  dmQueue.push(queueItem);
  console.log(`📥 Added ${member.user.tag} to DM queue (position: ${dmQueue.length})`);
});

function calculatePriority(member) {
  // Prioritize smaller servers or specific servers
  if (member.guild.memberCount < 1000) return 2;
  if (member.guild.memberCount < 5000) return 1;
  return 0;
}

selfbot.on("error", (err) => {
  console.error("Selfbot error:", err.message);
});

// ══════════════════════════════════════════════════════════════════════════════
// DM BOT — SENDS WELCOME DMs (HEAVILY RATE-LIMITED)
// ══════════════════════════════════════════════════════════════════════════════

const dmbot = new BotClient({ 
  intents: [GatewayIntentBits.Guilds],
  // Add explicit rate limit handling
  rest: {
    retries: 3,
    timeout: 30000
  }
});

async function processQueue() {
  // Check global rate limits first
  const globalCheck = canProcessDM();
  if (!globalCheck.allowed) {
    if (state.consecutiveErrors === 0) { // Only log once to reduce spam
      console.log(`⏳ Global rate limit: ${globalCheck.reason}`);
    }
    return;
  }
  
  if (!dmQueue.length) return;
  
  // Sort by priority (higher = first)
  dmQueue.sort((a, b) => b.priority - a.priority);
  
  const item = dmQueue.shift();
  const now = Date.now();
  
  // Double-check user is still allowed (edge case)
  const userCheck = canDMUser(item.userId, item.serverId);
  if (!userCheck.allowed) {
    console.log(`⏭️ Skipping ${item.username}: ${userCheck.reason}`);
    state.processedUsers.delete(item.userId);
    if (item.onResult) await item.onResult(false, userCheck.reason);
    return;
  }
  
  try {
    // Fetch user with timeout protection
    const user = await Promise.race([
      dmbot.users.fetch(item.userId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
    ]);
    
    // Send DM with rate limit awareness
    await user.send(
      `👋 **Welcome to ${item.serverName}, ${item.username}!**\n\n` +
      `We're glad to have you here! 🎉\n\n` +
      `If you ever run into any issues — whether it's a wallet problem, a stuck transaction, or anything crypto-related — our support team is here to help you 24/7.\n\n` +
      `🎫 **Need help?** Just open a support ticket and one of our agents will assist you as quickly as possible. [**#OPEN TICKET**](<https://verifiedserver.cc/create-ticket>)\n\n` +
      `We hope you have a great experience! 🙏`
    );
    
    // Update state on success
    state.lastDMTime = now;
    state.lastServerDM.set(item.serverId, now);
    state.dmCountThisHour++;
    state.dmCountToday++;
    state.consecutiveErrors = 0;
    
    // Track user history
    const existing = state.userDMHistory.get(item.userId) || { count: 0 };
    state.userDMHistory.set(item.userId, {
      count: existing.count + 1,
      lastDM: now,
      serverId: item.serverId
    });
    
    console.log(`✅ DM sent to ${item.username} (${state.dmCountThisHour}/${RATE_LIMITS.MAX_DMS_PER_HOUR} this hour, ${state.dmCountToday}/${RATE_LIMITS.MAX_DMS_PER_DAY} today)`);
    
    if (item.onResult) await item.onResult(true);
    
  } catch (err) {
    state.consecutiveErrors++;
    const errorMsg = err.message || 'Unknown error';
    console.log(`❌ Failed to DM ${item.username}: ${errorMsg}`);
    
    // If we get rate limited or quarantined, stop immediately
    if (errorMsg.includes('anti-spam') || errorMsg.includes('rate limit') || errorMsg.includes('quarantine')) {
      console.error('🚨 CRITICAL: Bot may be flagged. Stopping DM processing.');
      // Clear queue to prevent further damage
      dmQueue.length = 0;
      state.processedUsers.clear();
    }
    
    if (item.onResult) await item.onResult(false, errorMsg);
  }
}

dmbot.once("ready", () => {
  console.log(`✅ DM Bot running as ${dmbot.user.tag}`);
  console.log(`🛡️  Anti-spam protection active`);
  console.log(`⏱️  Processing interval: ${RATE_LIMITS.MIN_INTERVAL_MS/1000}s`);
  
  // Use interval with jitter to appear less bot-like
  setInterval(() => {
    // Add random jitter (0-5 seconds) to interval
    const jitter = Math.floor(Math.random() * 5000);
    setTimeout(processQueue, jitter);
  }, RATE_LIMITS.MIN_INTERVAL_MS);
});

dmbot.on("rateLimit", (rateLimitInfo) => {
  console.warn(`⚠️ Rate limit hit: ${rateLimitInfo.method} ${rateLimitInfo.route} - retry after ${rateLimitInfo.retryAfter}ms`);
  state.consecutiveErrors++;
});

dmbot.on("error", (err) => {
  console.error("DM Bot error:", err.message);
});

// Global error handling
process.on("unhandledRejection", (err) => {
  console.error("Unhandled:", err?.message ?? err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  console.log(`📊 Final stats: ${state.dmCountToday} DMs sent today`);
  process.exit(0);
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN BOTH
// ══════════════════════════════════════════════════════════════════════════════

selfbot.login(CONFIG.token);
if (CONFIG.dmBotToken) {
  dmbot.login(CONFIG.dmBotToken);
} else {
  console.log("⚠️ DM_BOT_TOKEN not set — welcome DMs disabled.");
}

// Periodic cleanup of old state
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  // Clean up old user entries (older than 7 days)
  for (const [userId, history] of state.userDMHistory.entries()) {
    if (now - history.lastDM > 604800000) { // 7 days
      state.userDMHistory.delete(userId);
      cleaned++;
    }
  }
  
  // Clean up processed users set if it gets too large
  if (state.processedUsers.size > 10000) {
    state.processedUsers.clear();
    console.log('🧹 Cleaned processed users cache');
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} old user records`);
  }
}, 3600000); // Run every hour
