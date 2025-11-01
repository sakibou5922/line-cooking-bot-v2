import { Client } from "@line/bot-sdk";

// ---------- AIレシピ生成（Hugging Face Inference API） ----------
async function generateRecipeWithHF(ingredientsText) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return "AIキーが設定されていないため、レシピを生成できませんでした。";

  // 混雑時に順に試す軽量モデル（無料API対応）
  const MODELS = [
    "Qwen/Qwen2.5-1.5B-Instruct",
    "microsoft/Phi-3.5-mini-instruct",
    "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  ];

  const prompt =
`あなたはプロの料理家です。以下の材料で家庭でも作りやすい和食系の１品レシピを１つ出力してください。
出力はこのフォーマットで日本語のみ：
タイトル
材料（分量）
作り方（手順番号付きで5行以内）
ヘルシー化のコツ（1行）

材料：${ingredientsText || "鶏むね肉、ブロッコリー、卵"}`;

  const tryOnce = async (model) => {
    const url =
      `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}` +
      `?wait_for_model=true&use_cache=true`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 200,
              temperature: 0.7,
              top_p: 0.95,
              return_full_text: false,
            },
          }),
        });

        if (res.status === 200) {
          const data = await res.json();
          const text = Array.isArray(data)
            ? data[0]?.generated_text
            : data?.generated_text;
          if (text) return text.trim();
        }

        // コールドスタート／レート制限は待って再試行
        if (res.status === 503 || res.status === 429) {
          const waitMs = 800 * Math.pow(2, attempt); // 0.8s→1.6s→3.2s
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // それ以外はログだけ
        const errTxt = await res.text().catch(() => "");
        console.log("HF error", res.status, errTxt.slice(0, 300));
        break;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return null;
  };

  for (const m of MODELS) {
    const out = await tryOnce(m);
    if (out) return out;
  }
  return "いまAIが混み合っているみたい。少し時間をおいてもう一度『AIレシピ 材料…』で試してね！";
}
// ---------- /AIレシピ生成 ----------

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");
  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
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

  // 🥗 栄養ログ → クイックリプライ
  if (/^(栄養ログ|栄養|ログ)$/.test(text)) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "今日の食事はどうだった？",
      quickReply: {
        items: [
          { type: "action", action: { type: "message", label: "完食🍚", text: "完食" } },
          { type: "action", action: { type: "message", label: "半分🥢", text: "半分" } },
          { type: "action", action: { type: "message", label: "スキップ🚫", text: "スキップ" } },
        ],
      },
    });
  }

  // ✅ 選択後のメッセージ
  if (/^(完食|半分|スキップ)$/.test(text)) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `「${text}」で記録したよ📝（保存はこれから）`,
    });
  }

  // サンプル固定返答
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

  // 🧑‍🍳 AIレシピ
  if (/^(AIレシピ|レシピ)/.test(text)) {
    const ingredients = text.replace(/^(AIレシピ|レシピ)/, "").trim();
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "🍳 レシピを考えています…（10秒前後お待ちください）",
    });

    const recipe = await generateRecipeWithHF(ingredients);
    await client.pushMessage(event.source.userId, { type: "text", text: recipe });
    return;
  }

  // デフォルトの使い方
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "使い方：\n「今日の献立」\n「美容メニュー」\n「栄養ログ」\n「AIレシピ 豆腐 鶏むね ねぎ」",
  });
}
