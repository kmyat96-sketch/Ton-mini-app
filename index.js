const TelegramBot = require('node-telegram-bot-api');

// Configuration
const token = '8727961800:AAH0MwVr819OM8d0JtC8cbMTYPvM6yWLqhI';
const ADMIN_CHAT_ID = '2009418896'; // Admin ၏ Telegram ID
const FIREBASE_DB_URL = 'https://ton-buy-bot-default-rtdb.firebaseio.com';

const bot = new TelegramBot(token, { polling: true });

// 💎 Bot ထဲတွင် /price 7200 ဟု ရိုက်၍ ဈေးနှုန်းပြောင်းရန်
bot.onText(/\/price (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (userId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "⚠️ ဤ Command ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
        return;
    }

    const newPrice = match[1].trim();
    if (isNaN(newPrice)) {
        bot.sendMessage(chatId, "⚠️ ကျေးဇူးပြု၍ မှန်ကန်သော ဂဏန်းပမာဏကို ထည့်ပါ (ဥပမာ - /price 7200)");
        return;
    }

    try {
        const response = await fetch(`${FIREBASE_DB_URL}/settings.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tonPrice: parseFloat(newPrice) })
        });

        if (response.ok) {
            bot.sendMessage(chatId, `✅ TON ဈေးနှုန်း အောင်မြင်စွာ ပြောင်းလဲပြီးပါပြီ:\n💎 1 TON = ${parseFloat(newPrice).toLocaleString()} MMK`);
        } else {
            bot.sendMessage(chatId, "❌ Firebase သို့ ပို့ဆောင်ရာတွင် အမှားရှိနေပါသည်။");
        }
    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ ဆာဗာ ချိတ်ဆက်မှု အမှားအယွင်း ရှိနေပါသည်။");
    }
});

console.log("Bot is running and listening for /price command...");
