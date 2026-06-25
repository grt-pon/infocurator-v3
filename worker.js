// ぐるっとポン 情報収集ツール - Cloudflare Worker
// 環境変数: CLAUDE_API_KEY（必須）
// 将来追加: GOOGLE_DRIVE_API_KEY, GOOGLE_DRIVE_FOLDER_ID

// ─── RSS ソース定義 ────────────────────────────────────────────
const RSS_SOURCES = [
  { name: 'AdverTimes',        url: 'https://www.advertimes.com/feed/' },
  { name: 'MarkeZine',         url: 'https://markezine.jp/rss/index.rss' },
  { name: 'DIGIDAY Japan',     url: 'https://digiday.jp/feed/' },
  { name: 'ITmedia Marketing', url: 'https://marketing.itmedia.co.jp/mm/rss/marketing/' },
];

// ─── CORS ────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── ぐるっとポン コンテキスト（フォールバック・固定情報）────────
// Google Drive 整形済みフォルダ連携が完成するまでここで管理
const GURUTTOPON_CONTEXT = `
【ぐるっとポン 基本情報】
サービス概要：スーパーマーケットの店頭・駐車場に設置されたリサイクル回収ステーションにペットボトル・アルミ缶・紙製品等を持参するとコインが貯まるアプリ。コインは nanaco・WAON・PayPay 等のポイントに交換できる。

主要ターゲット：40〜60代ファミリー層・主婦層（家族間伝播が強み）

差別化要素：
- カミガチャ（紙製品回収時のガチャ機能）：最大の差別化要素。「楽しさを入口にする」が核心
- コインレイド：最も人気の高いキャンペーン形態
- ランク制度

事業課題：
- パッシブ層（月1回以下利用）の比率が高い
- コイン交換率が低い
- 機能評価3点層が36.5%

2026年度優先事項：
1. スーパーの販促費確保
2. 新規会員獲得・パッシブ層再活性化（同列）

収集テーマ（D-1優先度A）：
- スーパー・小売業の集客・販促トレンド（販促費確保に直結）
- 他社タイアップ・コラボ施策（スーパーへの提案材料）
- 地上・OOH・店頭広告施策（ステーション周辺訴求に活用）
- パッシブ層・休眠ユーザーの再活性化手法
- ロイヤルティプログラムの設計・改善事例
- ゲーミフィケーション × 習慣化設計
- 話題になったキャンペーン企画
- 40〜60代ファミリー層の消費行動・価値観変化
- リサイクル・サーキュラーエコノミーの社会動向
- ポイント経済圏の再編・競合動向（nanaco・WAON・PayPay）

除外テーマ：BtoB向け全般（スーパー・小売向けを除く）・富裕層向け・IT技術動向・海外限定事例・若年層向けIP
`.trim();

// ─── D-1 フィルタリングプロンプト（Haiku 向け・低コスト） ─────
const D1_FILTER_PROMPT = `あなたはマーケティング情報のフィルタリングAIです。
以下の記事タイトルリストを評価し、ぐるっとポン（リサイクルポイントアプリ、40〜60代主婦・ファミリー層向け）の
マーケティング担当者にとって企画立案の参考になる記事のインデックス番号のみを返してください。

有益な基準：
- スーパー・小売業の集客・販促トレンド
- 企業間タイアップ・コラボ施策の事例
- 地上・OOH・店頭広告施策
- パッシブ層・休眠ユーザーの再活性化手法
- ロイヤルティプログラム・ポイント設計事例
- ゲーミフィケーション・習慣化設計
- 話題になったキャンペーン企画（業種不問）
- 40〜60代ファミリー層の消費行動・価値観
- リサイクル・サーキュラーエコノミーの社会動向
- ポイント経済圏の再編・競合動向

除外基準：
- BtoB向け（スーパー・小売向けは除外しない）
- 富裕層・高価格帯向け
- IT・テクノロジー系の技術動向
- 海外のみで国内転用困難
- 若年層向けIPコンテンツ

記事タイトルリスト：
{TITLES}

インデックス番号のみの JSON 配列で返してください（例：[0,2,4]）。説明不要。`;

// ─── コンセプト・企画ヒント生成プロンプト（Sonnet 向け） ────────
const CONVERSION_PROMPT = `あなたはぐるっとポンのマーケティング担当者のアシスタントです。

${GURUTTOPON_CONTEXT}

---

【分析対象記事】
タイトル：{TITLE}
本文：
{BODY}

---

以下の4点を JSON 形式で出力してください。Markdown コードブロックは使わず JSON のみ返してください。

{
  "summary": "記事の概要（何があったか）。2〜3文、150字以内。具体的な数字・企業名を含めること。",
  "concept": "この事例から抽出できる転用可能な構造・原理。「なぜ機能するか」の本質を100字以内で。抽象論ではなく設計のポイントを明記すること。",
  "hint": "ぐるっとポンへの具体的な企画ヒント。施策名・対象ユーザー・期待効果を含めて150字以内で。こじつけではなく構造的に転用可能なものを。",
  "theme": "最も関連するテーマID（retail/tieup/ooh/passive/loyalty/gamification/campaign/target/recycle/points のいずれか1つ）",
  "themeLabel": "テーマの短い日本語名（例：ロイヤルティ設計）"
}`;

// ─── RSS フェッチ & パース ──────────────────────────────────────
function parseRSSItems(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const getTag = (tag) =>
      (block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')) || [])[1]?.trim() || '';
    const title   = getTag('title');
    const link    = getTag('link') || (block.match(/<link\s*\/?>([\s\S]*?)<\/link>/) || [])[1]?.trim() || '';
    const pubDate = getTag('pubDate');
    if (title && link) items.push({ title, link, pubDate });
  }
  return items.slice(0, 10);
}

async function fetchRSS(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuruttoPon-InfoCurator/1.0)' },
      cf: { cacheTtl: 300 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml).map((item) => ({ ...item, source: source.name }));
  } catch {
    return [];
  }
}

// ─── D-1 フィルタ（Haiku 一括評価） ─────────────────────────────
async function filterByD1(items, apiKey) {
  if (!items.length) return [];
  const titles = items.map((item, i) => `${i}: ${item.title}`).join('\n');
  const prompt = D1_FILTER_PROMPT.replace('{TITLES}', titles);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const indices = JSON.parse(text);
    return items.filter((_, i) => Array.isArray(indices) && indices.includes(i));
  } catch {
    // フィルタ失敗時は先頭 6 件をそのまま使用
    return items.slice(0, 6);
  }
}

// ─── 記事全文スクレイピング（HTMLRewriter） ──────────────────────
async function scrapeArticle(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuruttoPon-InfoCurator/1.0)' },
      cf: { cacheTtl: 600 },
    });
    if (!res.ok) return '';

    const texts = [];
    const rewriter = new HTMLRewriter().on(
      'article p, .entry-content p, .article-body p, main p, p, h1, h2, h3, li',
      {
        text(chunk) {
          const t = chunk.text.trim();
          if (t.length > 10) texts.push(t);
        },
      }
    );

    const transformed = rewriter.transform(res);
    await transformed.arrayBuffer(); // ストリームを消費

    return texts
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .substring(0, 3000);
  } catch {
    return '';
  }
}

// ─── コンセプト・企画ヒント生成（Sonnet） ────────────────────────
async function generateInsights(item, apiKey) {
  const body = await scrapeArticle(item.link);
  const prompt = CONVERSION_PROMPT
    .replace('{TITLE}', item.title)
    .replace('{BODY}', body || `（本文取得不可。タイトルから推定）${item.title}`);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const insights = JSON.parse(text);

    // pubDate を MM/DD 形式に変換
    let dateStr = '';
    if (item.pubDate) {
      const d = new Date(item.pubDate);
      if (!isNaN(d)) {
        dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    if (!dateStr) dateStr = new Date().toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }).replace('/', '/');

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source:  item.source,
      title:   item.title,
      url:     item.link,
      date:    dateStr,
      ...insights,
    };
  } catch {
    return null;
  }
}

// ─── TODO: Google Drive 整形済みフォルダ連携（後から追加）────────
// async function fetchDriveContext(env) {
//   環境変数: GOOGLE_DRIVE_API_KEY, GOOGLE_DRIVE_FOLDER_ID
//   整形済みフォルダの .md ファイルを取得してコンテキスト文字列を返す
//   実装後は GURUTTOPON_CONTEXT の代わりにこちらを使用
// }

// ─── メインハンドラ ───────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    try {
      if (!env.CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY が設定されていません');
      }

      // 1. RSS を並列取得
      const arrays = await Promise.all(RSS_SOURCES.map(fetchRSS));
      const allItems = arrays.flat();

      // 2. Haiku で D-1 テーマフィルタ
      const filtered = await filterByD1(allItems, env.CLAUDE_API_KEY);
      const capped   = filtered.slice(0, 6); // 最大 6 件（コスト上限）

      // 3. Sonnet でコンセプト・企画ヒント生成（並列）
      const results  = await Promise.all(capped.map((item) => generateInsights(item, env.CLAUDE_API_KEY)));
      const articles = results.filter(Boolean);

      return new Response(
        JSON.stringify({ articles, fetchedAt: new Date().toISOString(), total: articles.length }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message, articles: [] }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }
  },
};
