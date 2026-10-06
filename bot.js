const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const token = '8727961800:AAH0MwVr819OM8d0JtC8cbMTYPvM6yWLqhI';
const ADMIN_CHAT_ID = '2009418896';
const FIREBASE_URL = 'https://ton-buy-bot-default-rtdb.firebaseio.com';

const bot = new TelegramBot(token, { polling: true });

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
                try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
            });
        });

        req.on('error', err => reject(err));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// /price Command
bot.onText(/\/price (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.from.id.toString() !== ADMIN_CHAT_ID) return;

    const newPrice = match[1].trim();
    await firebaseRequest('ton_price', 'PUT', Number(newPrice));
    bot.sendMessage(chatId, `✅ TON ဈေးနှုန်းအသစ်ကို **${Number(newPrice).toLocaleString()} MMK** သို့ ပြောင်းလဲပြီးပါပြီ။`, { parse_mode: 'Markdown' });
});

// Check pending orders and send photo + details to Admin
setInterval(async () => {
    try {
        const orders = await firebaseRequest('orders', 'GET');
        if (!orders) return;

        Object.entries(orders).forEach(async ([orderKey, order]) => {
            if (order && order.status === 'pending' && !order.notified) {
                order.notified = true;
                await firebaseRequest(`orders/${orderKey}/notified`, 'PUT', true);

                const caption = `🔔 **ငွေလွှဲအော်ဒါအသစ် (${order.method})**\n\n` +
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
                                { text: '✅ အတည်ပြုမည်', callback_data: `approve_${orderKey}_${order.userId}` },
                                { text: '❌ ပယ်ချမည်', callback_data: `reject_${orderKey}` }
                            ]
                        ]
                    }
                };

                if (order.receiptImage) {
                    const buffer = Buffer.from(order.receiptImage.split(',')[1], 'base64');
                    bot.sendPhoto(ADMIN_CHAT_ID, buffer, { caption: caption, ...opts });
                } else {
                    bot.sendMessage(ADMIN_CHAT_ID, caption, opts);
                }
            }
        });
    } catch (err) {
        console.error("Error checking orders:", err);
    }
}, 5000);

// Admin Action Handler
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    if (callbackQuery.from.id.toString() !== ADMIN_CHAT_ID) return;

    const parts = data.split('_');
    const action = parts[0];
    const orderKey = parts[1];
    const buyerUserId = parts[2];

    if (action === 'approve') {
        await firebaseRequest(`orders/${orderKey}/status`, 'PUT', 'approved');
        bot.editMessageCaption(`${msg.caption}\n\n✅ **အခြေအနေ:** အတည်ပြုပြီး (Approved)`, {
            chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown'
        }).catch(() => {});

        bot.sendMessage(buyerUserId, `🎉 သင်ဝယ်ယူထားသော TON များကို အတည်ပြုပြီး ပေးပို့လိုက်ပါပြီ။ ကျေးဇူးတင်ပါသည်။ 🙏`);
        bot.answerCallbackQuery(callbackQuery.id, { text: "အတည်ပြုပြီးပါပြီ" });
    } else if (action === 'reject') {
        await firebaseRequest(`orders/${orderKey}/status`, 'PUT', 'rejected');
        bot.editMessageCaption(`${msg.caption}\n\n❌ **အခြေအနေ:** ပယ်ချလိုက်သည် (Rejected)`, {
            chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown'
        }).catch(() => {});

        bot.sendMessage(buyerUserId, `❌ သင်၏ ငွေလွှဲပြေစာ သို့မဟုတ် Tran ID မမှန်ကန်သဖြင့် အော်ဒါပယ်ချခံရပါသည်။`);
        bot.answerCallbackQuery(callbackQuery.id, { text: "ပယ်ချလိုက်ပါပြီ" });
    }
});

console.log("Bot is running...");
