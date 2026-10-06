const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// Firebase Admin Setup (သင့်ရဲ့ Firebase Database URL ထည့်ပါ)
admin.initializeApp({
  credential: admin.credential.applicationDefault(), // သို့မဟုတ် serviceAccount key ထည့်နိုင်သည်
  databaseURL: "https://ton-buy-bot-default-rtdb.firebaseio.com"
});
const db = admin.database();

const token = '8727961800:AAH0MwVr819OM8d0JtC8cbMTYPvM6yWLqhI';
const ADMIN_CHAT_ID = '2009418896';

const bot = new TelegramBot(token, { polling: true });

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

    await db.ref('ton_price').set(Number(newPrice));
    bot.sendMessage(chatId, `✅ TON ဈေးနှုန်းအသစ်ကို **${Number(newPrice).toLocaleString()} MMK** သို့ ပြောင်းလဲပြီးပါပြီ။`, { parse_mode: 'Markdown' });
});

// အော်ဒါအသစ်များကို Firebase မှ စောင့်ကြည့်ပြီး Admin ဆီသို့ ပို့ရန်
db.ref('orders').on('child_added', (snapshot) => {
    const order = snapshot.val();
    const orderKey = snapshot.key;

    if (order && order.status === 'pending') {
        const message = `🔔 **TON ဝယ်ယူမှုအသစ် ရောက်ရှိပါသည်**\n\n` +
                        `👤 ဝယ်ယူသူ: ${order.name} (@${order.username})\n` +
                        `💎 ပမာဏ: ${order.tonAmount} TON\n` +
                        `💵 ကျသင့်ငွေ: ${order.totalMmk.toLocaleString()} MMK\n` +
                        `📬 Wallet: \`${order.walletAddress}\`\n` +
                        `🔢 Tran ID: \`${order.tranId}\``;

        // 1-Click Approved လုပ်ရန် Inline Keyboard ခလုတ်
        const opts = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ 1-Click အတည်ပြုမည် (Approve)', callback_data: `approve_${orderKey}_${order.userId}` },
                        { text: '❌ ပယ်ဖျက်မည် (Reject)', callback_data: `reject_${orderKey}` }
                    ]
                ]
            }
        };

        bot.sendMessage(ADMIN_CHAT_ID, message, opts);
    }
});

// Admin က ခလုတ်နှိပ်မှုကို စစ်ဆေးခြင်း (1 Click Action)
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
        // Firebase တွင် status ကို approved သို့ပြောင်းရန်
        await db.ref(`orders/${orderKey}`).update({ status: 'approved' });

        // Admin ဆီက မက်ဆေ့ကို အပ်ဒိတ်လုပ်ရန်
        bot.editMessageText(`${msg.text}\n\n✅ **အခြေအနေ:** အတည်ပြုပြီးစီးပါပြီ (Approved)`, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });

        // ဝယ်ယူသူ (Buyer) ဆီသို့ ချက်ချင်း အကြောင်းကြားစာပို့ရန်
        bot.sendMessage(buyerUserId, `🎉 သင်ဝယ်ယူထားသော TON များကို စစ်ဆေးအတည်ပြုပြီး ပေးပို့လိုက်ပါပြီ။ ကျေးဇူးတင်ပါသည်။ 🙏`);
        bot.answerCallbackQuery(callbackQuery.id, { text: "အောင်မြင်စွာ အတည်ပြုပြီးပါပြီ။" });

    } else if (action === 'reject') {
        await db.ref(`orders/${orderKey}`).update({ status: 'rejected' });

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
