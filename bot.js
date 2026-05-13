/**
 * WhatsApp Bot - Twilio version
 * חנות נעלי בית - Feet Fun Slippers
 */

const express = require("express");
const axios = require("axios");
const twilio = require("twilio");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const CONFIG = {
  WC_URL: process.env.WC_URL,
  WC_KEY: process.env.WC_KEY,
  WC_SECRET: process.env.WC_SECRET,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER: "whatsapp:+14155238886",
  OWNER_PHONE: process.env.OWNER_PHONE || "+972547970011",
  PORT: process.env.PORT || 3000,
};

const wooApi = axios.create({
  baseURL: `${CONFIG.WC_URL}/wp-json/wc/v3`,
  auth: { username: CONFIG.WC_KEY, password: CONFIG.WC_SECRET },
});

async function sendAlertToOwner(customerPhone, message) {
  try {
    const client = twilio(CONFIG.TWILIO_ACCOUNT_SID, CONFIG.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: CONFIG.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${CONFIG.OWNER_PHONE}`,
      body: `🔔 *לקוח מבקש נציג!*\n\n📱 מספר: ${customerPhone}\n💬 הודעה: ${message}\n\nענה ללקוח ישירות בוואטסאפ!`
    });
  } catch (e) {
    console.error("Failed to send alert:", e.message);
  }
}

async function getOrderStatus(orderId) {
  try {
    const { data } = await wooApi.get(`/orders/${orderId}`);
    const statusMap = {
      pending: "ממתינה לתשלום ⏳", processing: "בעיבוד 🔄",
      on_hold: "בהמתנה ⏸️", completed: "הושלמה ✅",
      cancelled: "בוטלה ❌", refunded: "הוחזרה 💸",
      failed: "נכשלה ❗", shipped: "נשלחה 🚚",
    };
    const status = statusMap[data.status] || data.status;
    const name = `${data.billing.first_name} ${data.billing.last_name}`;
    const items = data.line_items.map((i) => `• ${i.name} (x${i.quantity})`).join("\n");
    return `📦 *הזמנה מספר ${orderId}*\n\n👤 שם: ${name}\n📋 סטטוס: ${status}\n💰 סכום: ₪${data.total}\n\n🛍️ פריטים:\n${items}`;
  } catch (e) {
    return `לא מצאתי הזמנה עם מספר *${orderId}*. אנא בדוק שהמספר נכון.`;
  }
}

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

async function getSaleProducts() {
  try {
    const { data } = await wooApi.get("/products", { params: { on_sale: true, per_page: 5, status: "publish" } });
    if (!data.length) return "אין מבצעים פעילים כרגע 😊 תבדוק שוב בקרוב!";
    const lines = data.map((p) => `🔥 *${p.name}*\n   במקום ₪${p.regular_price} → ₪${p.sale_price}`);
    return `🎉 *המבצעים שלנו:*\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return "לא הצלחתי לשלוף מבצעים כרגע.";
  }
}

const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step: "main" };
  return sessions[phone];
}

async function handleMessage(phone, text) {
  const session = getSession(phone);
  const msg = text.trim();
  const greetings = ["היי","שלום","הי","hello","hi","מה נשמע","בוקר טוב","ערב טוב"];

  if (greetings.some(w => msg.toLowerCase().includes(w)) || msg === "0") {
    session.step = "main";
    return `שלום! 👋 ברוך הבא לחנות נעלי הבית שלנו 🩴\n\nאיך אני יכול לעזור?\n\n1️⃣ בדיקת סטטוס הזמנה\n2️⃣ מוצרים וגדלים\n3️⃣ מחירים ומבצעים\n4️⃣ החזרות והחלפות\n5️⃣ דיבור עם נציג אנושי\n\nשלח את המספר הרצוי`;
  }

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

  if (msg === "2" || session.step === "await_product_search") {
    if (session.step !== "await_product_search") {
      session.step = "await_product_search";
      return `👟 *מוצרים וגדלים*\n\nמה אתה מחפש?\n• שם מוצר ספציפי\n• גודל (לדוגמה: 42)\n• הכל לכל הקטלוג`;
    }
    session.step = "main";
    return await getProducts(msg === "הכל" ? "" : msg);
  }

  if (msg === "3") return await getSaleProducts();

  if (msg === "4") {
    return `↩️ *מדיניות החזרות והחלפות*\n\n✅ ניתן להחזיר תוך *14 יום* מקבלת המוצר\n✅ המוצר חייב להיות שלם ולא בשימוש\n✅ עם חשבונית / אישור הזמנה\n\n📬 *תהליך:*\n1. שלח תמונה של המוצר\n2. ציין מספר הזמנה וסיבת ההחזרה\n3. נחזור אליך תוך 24 שעות\n\n📞 לשאלות: שלח *5* לנציג`;
  }

  if (msg === "5") {
    session.step = "main";
    await sendAlertToOwner(phone, text);
    return `👨‍💼 *העברה לנציג*\n\nקיבלנו את פנייתך! נציג יחזור אליך בהקדם 😊\n⏰ שעות פעילות: א׳-ה׳ 9:00-18:00\n\nמחוץ לשעות הפעילות? נחזור אליך בבוקר`;
  }

  return `לא הבנתי 😊\n\n1️⃣ סטטוס הזמנה\n2️⃣ מוצרים וגדלים\n3️⃣ מבצעים\n4️⃣ החזרות\n5️⃣ נציג\n\nשלח 0 לתפריט`;
}

app.post("/webhook", async (req, res) => {
  const phone = req.body.From;
  const text = req.body.Body;
  console.log(`📩 [${phone}]: ${text}`);
  const reply = await handleMessage(phone, text);
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`);
});

app.get("/", (req, res) => res.send("Bot is running! 🚀"));
app.listen(CONFIG.PORT, () => console.log(`🚀 Bot running on port ${CONFIG.PORT}`));
