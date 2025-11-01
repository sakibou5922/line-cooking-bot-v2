import { Client } from "@line/bot-sdk";
// ---------- AIレシピ生成（Hugging Face Inference API） ----------
async function generateRecipeWithHF(ingredientsText) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return "AIキーが設定されていないため、レシピを生成できませんでした。";

  // 混雑時に順に試す軽量モデル候補（全部 無料API対応）
  const MODELS = [
    "Qwen/Qwen2.5-1.5B-Instruct",
    "microsoft/Phi-3.5-mini-instruct",
    "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  ];

  // 日本語で丁寧めのプロンプト（短めにして待ち時間を減らす）
  const prompt =
`あなたはプロの料理家です。以下の材料で家庭でも作りやすい和食系の１品レシピを１つ出力してください。
出力はこのフォーマットで日本語のみ：
タイトル
材料（分量）
作り方（手順番号付きで5行以内）
ヘルシー化のコツ（1行）

材料：${ingredientsText || "鶏むね肉、ブロッコリー、卵"}`;

  // 429/503に備えて指数バックオフで最大3回×モデル数
  const tryOnce = async (model) => {
    const url =
      `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}` +
      `?wait_for_model=true&use_cache=true`; // ←読み込み待ち＆キャッシュ

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,                    // ← inputs（複数形）
            parameters: {
              max_new_tokens: 200,            // 短めで高速化
              temperature: 0.7,
              top_p: 0.95,
              return_full_text: false,
            },
          }),
        });

        if (res.status === 200) {
          const data = await res.json();
          // HFの返りは [ { generated_text: "..." } ] 形式が多い
          const text =
            Array.isArray(data) ? data[0]?.generated_text :
            data?.generated_text ?? "";
          if (text) return text.trim();
        }

        // モデル読み込み中 or レート制限 → 待って再試行
        if (res.status === 503 || res.status === 429) {
          const waitMs = 800 * Math.pow(2, attempt); // 0.8s→1.6s→3.2s
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        // それ以外はログだけ残して次へ
        const errTxt = await res.text().catch(() => "");
        console.log("HF error", res.status, errTxt.slice(0, 300));
        break;

      } catch (e) {
        // ネットワーク等 → 少し待って再試行
        await new Promise(r => setTimeout(r, 500));
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
