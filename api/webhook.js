import { Client } from "@line/bot-sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const events = body.events || [];

  const client = new Client({
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  });

  await Promise.all(events.map((ev) => handleEvent(ev, client)));
  return res.status(200).send("OK");
}

async function handleEvent(event, client) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const text = event.message.text.trim();
// 🥗 「栄養ログ」→ クイックリプライ3択を表示
if (/^(栄養ログ|栄養|ログ)$/.test(text)) {
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "今日の食事はどうだった？",
    quickReply: {
      items: [
        { type: "action", action: { type: "message", label: "完食🍚", text: "完食" } },
        { type: "action", action: { type: "message", label: "半分🥢", text: "半分" } },
        { type: "action", action: { type: "message", label: "スキップ🚫", text: "スキップ" } }
      ]
    }
  });
}

// ✅ 「完食/半分/スキップ」が押されたときの返信
if (/^(完食|半分|スキップ)$/.test(text)) {
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: `「${text}」で記録したよ📝（保存はこれから）`
  });
}

  if (/^(今日|献立|メニュー)/.test(text)) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "今日のおすすめ献立は『鮭の塩焼きと味噌汁』です🍚",
    });
  }

  if (/^(美容|ダイエット)/.test(text)) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "美容✖ダイエット💖 高タンパク・低脂質レシピを考え中！（実装中）",
    });
  }

  if (/^(栄養|ログ)/.test(text)) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "栄養ログ📗『完食／半分／スキップ』を送ってね！（実装中）",
    });
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "使い方：\n「今日の献立」\n「美容メニュー」\n「栄養ログ」",
  });
}
