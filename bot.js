/**
 * WhatsApp Bot - Meta Cloud API version
 * חנות נעלי בית - Feet Fun Slippers
 */

const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  WC_URL: process.env.WC_URL,
  WC_KEY: process.env.WC_KEY,
  WC_SECRET: process.env.WC_SECRET,
  WA_TOKEN: process.env.WA_TOKEN,
  WA_PHONE_ID: process.env.WA_PHONE_ID,
  WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN,
  OWNER_PHONE: process.env.OWNER_PHONE || "+972587563770",
  PORT: process.env.PORT || 3000,
};

console.log("📞 OWNER_PHONE:", CONFIG.OWNER_PHONE);
console.log("📱 WA_PHONE_ID:", CONFIG.WA_PHONE_ID);

const wooApi = axios.create({
  baseURL: `${CONFIG.WC_URL}/wp-json/wc/v3`,
  auth: { username: CONFIG.WC_KEY, password: CONFIG.WC_SECRET },
});

// שליחת הודעה דרך Meta Cloud API
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.WA_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.WA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error("❌ שגיאה בשליחת הודעה:", e.response?.data || e.message);
  }
}

// התראה לבעלים
async function sendAlertToOwner(customerPhone, message) {
  const text = `🔔 *לקוח מבקש נציג!*\n\n📱 מספר: ${customerPhone}\n💬 הודעה: ${message}\n\nענה ללקוח ישירות בוואטסאפ!`;
  await sendMessage(CONFIG.OWNER_PHONE, text);
}

// בדיקת סטטוס הזמנה
async function getOrderStatus(orderId) {
  try {
    console.log(`🔍 מחפש הזמנה: ${orderId}`);
    const { data } = await wooApi.get(`/orders/${orderId}`);
    console.log(`✅ נמצאה הזמנה: ${orderId}, סטטוס: ${data.status}`);
    const statusMap = {
      pending: "ממתינה לתשלום ⏳",
      processing: "בעיבוד 🔄",
      on_hold: "בהמתנה ⏸️",
      completed: "הושלמה ✅",
      cancelled: "בוטלה ❌",
      refunded: "הוחזרה 💸",
      failed: "נכשלה ❗",
      shipped: "נשלחה 🚚",
    };
    const status = statusMap[data.status] || data.status;
    const name = `${data.billing.first_name} ${data.billing.last_name}`;
    const items = data.line_items.map((i) => `• ${i.name} (x${i.quantity})`).join("\n");
    return `📦 *הזמנה מספר ${orderId}*\n\n👤 שם: ${name}\n📋 סטטוס: ${status}\n💰 סכום: ₪${data.total}\n\n🛍️ פריטים:\n${items}`;
  } catch (e) {
    console.error(`❌ שגיאה בהזמנה ${orderId}:`, e.message, e.response?.status, JSON.stringify(e.response?.data));
    return `לא מצאתי הזמנה עם מספר *${orderId}*. אנא בדוק שהמספר נכון.`;
  }
}

// מוצרים
async function getProducts(search = "") {
  try {
    const params = { per_page: 6, status: "publish" };
    if (search) params.search = search;
    const { data } = await wooApi.get("/products", { params });
    if (!data.length) return "לא נמצאו מוצרים תואמים 😕";
    const lines = data.map((p) => {
      const sale = p.sale_price ? ` (מבצע: ₪${p.sale_price})` : "";
      return `👟 *${p.name}*\n   מחיר: ₪${p.regular_price}${sale}`;
    });
    return `🛍️ *המוצרים שלנו:*\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return "אופס, לא הצלחתי לשלוף את המוצרים כרגע.";
  }
}

// מבצעים
async function getSaleProducts() {
  try {
    const { data } = await wooApi.get("/products", {
      params: { on_sale: true, per_page: 5, status: "publish" },
    });
    if (!data.length) return "אין מבצעים פעילים כרגע 😊 תבדוק שוב בקרוב!";
    const lines = data.map(
      (p) => `🔥 *${p.name}*\n   במקום ₪${p.regular_price} → ₪${p.sale_price}`
    );
    return `🎉 *המבצעים שלנו:*\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return "לא הצלחתי לשלוף מבצעים כרגע.";
  }
}

// ניהול sessions
const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step: "main" };
  return sessions[phone];
}

const MENU_OPTIONS = ["1", "2", "3"];

async function handleMessage(phone, text) {
  const session = getSession(phone);
  const msg = text.trim();
  const greetings = ["היי", "שלום", "הי", "hello", "hi", "מה נשמע", "בוקר טוב", "ערב טוב"];

  // ברכות ותפריט ראשי
  if (greetings.some((w) => msg.toLowerCase().includes(w)) || msg === "0") {
    session.step = "main";
    return `שלום! 👋 ברוך הבא לחנות נעלי הבית שלנו 🩴\n\nאיך אני יכול לעזור?\n\n1️⃣ בדיקת סטטוס הזמנה\n2️⃣ החזרות והחלפות\n3️⃣ דיבור עם נציג אנושי\n\nשלח את המספר הרצוי`;
  }

  // זיהוי חכם של מספר הזמנה (4+ ספרות)
  const isOrderNumber = /^\d{4,}$/.test(msg) && !MENU_OPTIONS.includes(msg);
  if (isOrderNumber) {
    session.step = "main";
    return await getOrderStatus(msg);
  }

  // בדיקת סטטוס הזמנה
  if (msg === "1" || session.step === "await_order_id") {
    if (session.step !== "await_order_id") {
      session.step = "await_order_id";
      return "בשמחה! 📦 מה מספר ההזמנה שלך?\n(תוכל למצוא אותו במייל האישור)";
    }
    const orderId = msg.replace(/[^0-9]/g, "");
    if (!orderId) return "אנא שלח מספר הזמנה תקין (מספרים בלבד).";
    session.step = "main";
    return await getOrderStatus(orderId);
  }

  // החזרות והחלפות
  if (msg === "2") {
    return `↩️ *מדיניות החזרות והחלפות*\n\n✅ ניתן להחזיר תוך *14 יום* מקבלת המוצר\n✅ המוצר חייב להיות שלם ולא בשימוש\n✅ עם חשבונית / אישור הזמנה\n\n📬 *לביצוע החזרה או החלפה לחץ כאן:*\nhttps://feetfun.co.il/shop/men-winter/שירות-החלפה-הלוך-חזור/\n\n📞 לשאלות נוספות: שלח *3* לנציג`;
  }

  // נציג אנושי - פנייה ישירה למספר הנייד
  if (msg === "3") {
    session.step = "main";
    await sendAlertToOwner(phone, text);
    return `👨‍💼 *נציג אנושי*\n\nלשיחה ישירה עם נציג שלנו:\n📱 *0547970011*\n\n⏰ שעות פעילות: א׳-ה׳ 9:00-18:00\n\nמחוץ לשעות הפעילות? נחזור אליך בבוקר`;
  }

  return `לא הבנתי 😊\n\n1️⃣ סטטוס הזמנה\n2️⃣ החזרות והחלפות\n3️⃣ נציג אנושי\n\nשלח 0 לתפריט`;
}

// Webhook verification - Meta דורש זאת
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.WA_VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed");
    res.sendStatus(403);
  }
});

// קבלת הודעות נכנסות
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Meta דורש תשובה מיידית

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const phone = message.from;
    const text = message.text?.body;

    if (!text) return;

    console.log(`📩 [${phone}]: ${text}`);

    const reply = await handleMessage(phone, text);
    await sendMessage(phone, reply);
  } catch (e) {
    console.error("❌ שגיאה בעיבוד הודעה:", e.message);
  }
});

app.get("/", (req, res) => res.send("Bot is running! 🚀"));
app.listen(CONFIG.PORT, () => console.log(`🚀 Bot running on port ${CONFIG.PORT}`));
