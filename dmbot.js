require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

const QUEUE_PATH = "./dm_queue.json";

function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_PATH)); } catch { return []; }
}
function saveQueue(q) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function processQueue() {
  const queue = loadQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const user = await client.users.fetch(item.userId);
      await user.send(
        `👋 **Welcome to ${item.serverName}, ${item.username}!**\n\n` +
        `We're glad to have you here! 🎉\n\n` +
        `If you ever run into any issues — whether it's a wallet problem, a stuck transaction, or anything crypto-related — our support team is here to help you 24/7.\n\n` +
        `🎫 **Need help?** Just open a support ticket and one of our agents will assist you as quickly as possible. [**#OPEN TICKET**](<https://verifiedserver.cc/create-ticket>)\n\n` +
        `We hope you have a great experience! 🙏`
      );
      console.log(`✅ Welcome DM sent to ${item.username} from ${item.serverName}`);
    } catch (err) {
      console.log(`⚠️ Could not DM ${item.username}: ${err.message}`);
      // Only retry if it wasn't a DMs-disabled error
      if (!err.message.includes("Cannot send") && !err.message.includes("closed")) {
        remaining.push(item);
      }
    }
    await new Promise(r => setTimeout(r, 1500)); // delay between DMs
  }

  saveQueue(remaining);
}

client.once("ready", () => {
  console.log(`✅ DM Bot running as ${client.user.tag}`);
  setInterval(processQueue, 5000); // check queue every 5 seconds
});

client.on("error", (err) => console.error("DM Bot error:", err.message));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err?.message ?? err));

client.login(process.env.DM_BOT_TOKEN);
