import { Client } from "@line/bot-sdk";
// ---------- AIレシピ生成（Hugging Face Inference API） ----------
async function generateRecipeWithHF(ingredientsText) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    console.error("HUGGINGFACE_API_KEY is missing");
    return "AIキーが設定されていないため、レシピを生成できませんでした。";
  }

  // 日本語が強め＆軽めの指示モデル（無料API対応モデル）
  const MODEL = "Qwen/Qwen2.5-1.5B-Instruct";


  // プロンプト（日本語で丁寧に指定）
  const prompt = `あなたはプロの料理家です。以下の材料で、家庭で作りやすい和食系のレシピを1つ考案してください。
- 料理名（1行）
- 材料（分量）箇条書き
- 作り方（手順を番号付きで）
- ヘルシー化のコツ（1行）

材料: ${ingredientsText || "鶏むね肉、ブロッコリー、卵、しょうゆ"}`;

  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(MODEL)}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 320,
          temperature: 0.7,
          top_p: 0.95,
          repetition_penalty: 1.05
        }
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("HF API error:", res.status, text);
      return "いまレシピ生成が混み合っています。少し待ってからもう一度お試しください🙏";
    }

    const data = await res.json();
    // 返り値の取り出し（モデルにより構造が少し違うことがあるため両対応）
    const out =
      Array.isArray(data) && data[0]?.generated_text
        ? data[0].generated_text
        : (data.generated_text || JSON.stringify(data));

    // プロンプトが混ざって返るモデルもあるので、最後のレシピ部分を素直に返す
    return out.replace(prompt, "").trim() || "レシピを生成できませんでした。";
  } catch (e) {
    console.error("HF fetch failed:", e);
    return "レシピ生成に失敗しました。通信環境を確認して再試行してください。";
  }
}
// ---------- /AIレシピ生成 ----------

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
if (/^(AIレシピ|レシピ)/.test(text)) {
  const ingredients = text.replace(/^(AIレシピ|レシピ)/, "").trim();
  await client.replyMessage(event.replyToken, {
    type: "text",
    text: "🍳 レシピを考えています…（10秒前後お待ちください）"
  });

  const recipe = await generateRecipeWithHF(ingredients);
  await client.pushMessage(event.source.userId, {
    type: "text",
    text: recipe
  });
  return;
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
