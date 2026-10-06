const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const token = '8727961800:AAH0MwVr819OM8d0JtC8cbMTYPvM6yWLqhI';
const ADMIN_CHAT_ID = '2009418896';
const FIREBASE_URL = 'https://ton-buy-bot-default-rtdb.firebaseio.com';

const bot = new TelegramBot(token, { polling: true });

// Helper function for Firebase REST API requests
function firebaseRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(`${FIREBASE_URL}/${path}.json`);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', err => reject(err));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// 💎 /price နှုန်းထားပြောင်းရန် Command
bot.onText(/\/price (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (userId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "⚠️ ဤ විධාန်ကို Admin သာ အသုံးပြုနိုင်ပါသည်။");
        return;
    }

    const newPrice = match[1].trim();
    if (isNaN(newPrice)) {
        bot.sendMessage(chatId, "⚠️ ကျေးဇူးပြု၍ ဂဏန်းသာ ရိုက်ထည့်ပါ။ ဥပမာ - `/price 7200`");
        return;
    }

    await firebaseRequest('ton_price', 'PUT', Number(newPrice));
    bot.sendMessage(chatId, `✅ TON ဈေးနှုန်းအသစ်ကို **${Number(newPrice).toLocaleString()} MMK** သို့ ပြောင်းလဲပြီးပါပြီ။`, { parse_mode: 'Markdown' });
});

// မူလအော်ဒါများကို စစ်ဆေးရန် စနစ် (Polling orders for admin)
let lastProcessedOrderTime = Date.now();

setInterval(async () => {
    try {
        const orders = await firebaseRequest('orders', 'GET');
        if (!orders) return;

        Object.entries(orders).forEach(([orderKey, order]) => {
            if (order && order.status === 'pending' && !order.notified) {
                // Mark as notified in memory to prevent duplicate alerts
                order.notified = true;

                const message = `🔔 **TON ဝယ်ယူမှုအသစ် ရောက်ရှိပါသည်**\n\n` +
                                `👤 ဝယ်ယူသူ: ${order.name} (@${order.username})\n` +
                                `💎 ပမာဏ: ${order.tonAmount} TON\n` +
                                `💵 ကျသင့်ငွေ: ${order.totalMmk.toLocaleString()} MMK\n` +
                                `📬 Wallet: \`${order.walletAddress}\`\n` +
                                `🔢 Tran ID: \`${order.tranId}\``;

                const opts = {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ 1-Click အတည်ပြုမည်', callback_data: `approve_${orderKey}_${order.userId}` },
                                { text: '❌ ပယ်ဖျက်မည်', callback_data: `reject_${orderKey}` }
                            ]
                        ]
                    }
                };

                bot.sendMessage(ADMIN_CHAT_ID, message, opts);
                // Update order to indicate admin was notified
                firebaseRequest(`orders/${orderKey}/notified`, 'PUT', true);
            }
        });
    } catch (err) {
        console.error("Error checking orders:", err);
    }
}, 5000);

// Admin က ခလုတ်နှိပ်မှုကို စစ်ဆေးခြင်း
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const adminId = callbackQuery.from.id.toString();

    if (adminId !== ADMIN_CHAT_ID) {
        bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Admin သာ လုပ်ဆောင်နိုင်ပါသည်။", show_alert: true });
        return;
    }

    const parts = data.split('_');
    const action = parts[0];
    const orderKey = parts[1];
    const buyerUserId = parts[2];

    if (action === 'approve') {
        await firebaseRequest(`orders/${orderKey}/status`, 'PUT', 'approved');

        bot.editMessageText(`${msg.text}\n\n✅ **အခြေအနေ:** အတည်ပြုပြီးစီးပါပြီ (Approved)`, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });

        bot.sendMessage(buyerUserId, `🎉 သင်ဝယ်ယူထားသော TON များကို စစ်ဆေးအတည်ပြုပြီး ပေးပို့လိုက်ပါပြီ။ ကျေးဇူးတင်ပါသည်။ 🙏`);
        bot.answerCallbackQuery(callbackQuery.id, { text: "အောင်မြင်စွာ အတည်ပြုပြီးပါပြီ။" });

    } else if (action === 'reject') {
        await firebaseRequest(`orders/${orderKey}/status`, 'PUT', 'rejected');

        bot.editMessageText(`${msg.text}\n\n❌ **အခြေအနေ:** ပယ်ချခံရပါသည် (Rejected)`, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });

        bot.sendMessage(buyerUserId, `❌ သင်၏ TON ဝယ်ယူမှုမှာ ငွေလွှဲပြေစာ သို့မဟုတ် Tran ID မမှန်ကန်သဖြင့် ပယ်ချခံရပါသည်။`);
        bot.answerCallbackQuery(callbackQuery.id, { text: "အော်ဒါကို ပယ်ချလိုက်ပါပြီ။" });
    }
});

console.log("Bot is running and listening for orders...");
