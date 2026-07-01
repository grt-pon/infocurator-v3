// ぐるっとポン 情報収集ツール - Cloudflare Worker
// 環境変数（必須）: CLAUDE_API_KEY
// 環境変数（任意）: GOOGLE_DRIVE_D1_FILE_ID   … 00_D1テーマリスト（Google Docs）のファイルID
// 環境変数（任意）: GOOGLE_DRIVE_FILE_IDS     … ナレッジファイルのファイルID（カンマ区切りで複数可）
// ※ Drive 環境変数が未設定の場合はworker.js内のフォールバック固定文を使用

// ─── RSS ソース定義 ────────────────────────────────────────────
const RSS_SOURCES = [
  { name: 'AdverTimes',    url: 'https://www.advertimes.com/feed/' },
  { name: 'DIGIDAY Japan', url: 'https://digiday.jp/feed/' },
  { name: 'Web担当者Forum', url: 'https://webtan.impress.co.jp/rss.xml' },
  { name: 'btrax Blog',    url: 'https://blog.btrax.com/jp/feed/' },
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

---

【ユーザーインサイト】
出典：26年3月実施アンケート（回答者11,686人）※高関与層偏りあり。件数より方向性として読むこと。

■ 層別の実態
- パッシブ層は全体の57%。過半数がすでに毎日使っている。不満離脱ではなく「もう一押し」で転換できる層。
- 機能評価3点→4点で推奨5点率が+52.8pt向上。UIより「やれることが増えた実感」が熱量に直結。
- 利用頻度低下と推奨率低下が連動。頻度維持＝推奨率維持と等価。
- 若年層（20〜30代）は週数回止まり。毎日開く理由が設計されていない状態。

■ 要望の本質
- ガチャハズレ改善80件：頻度でなく「毎日来るのに何も得られない日の徒労感」。ハズレでも空振りにしない設計が必要。
- キャンペーン増加73件：頻度でなくリズムの欠如。「月1回は何かある」生活サイクルへの組み込みを求めている。
- RS増設99件：近くにないと人に勧められない。スーパー営業と「近くに増えた」告知でパッシブ層再活性化にも転用可。
- 来たよ不具合167件：「自分の行動が認められた確信が欲しい」欲求。リサイクル→反応→ご褒美のループ演出が有効。
- 「ためた実感」不足：交換レートより通算リサイクル量・累計コインのマイルストーン祝福演出が本質的欲求に応える。

■ 企画に使える行動パターン
- 毎日来るが特別な日がない → 曜日ボーナス・月間チャレンジ・季節テーマのカレンダー組み込み型恒常企画
- ハズレ→徒労感 → 連続ハズレ後ボーナスで底抜け防止
- 知人紹介経由ユーザーの推奨スコアが+0.19pt高い → 紹介施策は推奨率向上に直結
- ペットボトル・缶のポイント化要望 → スーパーとの期間限定連携提案に転用可
`.trim();

// ─── D-1 フィルタリング（Haiku 向け） ────────────────────────────
// テーマリストは Google Drive（GOOGLE_DRIVE_D1_FILE_ID）から取得。
// 取得できない場合は以下のフォールバックを使用。
const D1_THEMES_FALLBACK = `有益な基準：
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
- 若年層向けIPコンテンツ`;

function buildD1FilterPrompt(d1Themes) {
  return `あなたはマーケティング情報のフィルタリングAIです。
以下の記事タイトルリストを評価し、ぐるっとポン（リサイクルポイントアプリ、40〜60代主婦・ファミリー層向け）の
マーケティング担当者にとって企画立案の参考になる記事のインデックス番号のみを返してください。

${d1Themes}

記事タイトルリスト：
{TITLES}

インデックス番号のみの JSON 配列で返してください（例：[0,2,4]）。説明不要。`;
}

// ─── コンセプト・企画ヒント生成プロンプト（Sonnet 向け） ────────
// context: 基本情報＋記事に関連するナレッジセクションを組み立てた文字列
function buildConversionPrompt(item, body, context) {
  return `あなたはぐるっとポンのマーケティング担当者のアシスタントです。

${context}

---

【分析対象記事】
タイトル：${item.title}
本文：
${body || `（本文取得不可。タイトルから推定）${item.title}`}

---

以下の4点を JSON 形式で出力してください。Markdown コードブロックは使わず JSON のみ返してください。

{
  "summary": "記事の概要（何があったか）。2〜3文、150字以内。具体的な数字・企業名を含めること。",
  "concept": "この事例から抽出できる転用可能な構造・原理。「なぜ機能するか」の本質を100字以内で。抽象論ではなく設計のポイントを明記すること。",
  "hint": "ぐるっとポンへの具体的な企画ヒント。施策名・対象ユーザー・期待効果を含めて150字以内で。こじつけではなく構造的に転用可能なものを。",
  "theme": "最も関連するテーマID（retail/tieup/ooh/passive/loyalty/gamification/campaign/target/recycle/points のいずれか1つ）",
  "themeLabel": "テーマの短い日本語名（例：ロイヤルティ設計）"
}`;
}

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
async function filterByD1(items, apiKey, d1Themes) {
  if (!items.length) return [];
  const titles = items.map((item, i) => `${i}: ${item.title}`).join('\n');
  const prompt = buildD1FilterPrompt(d1Themes).replace('{TITLES}', titles);

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

// ─── Google Drive ファイル取得（単体）────────────────────────────
// Google Docs（/document/d/）は export?format=txt、それ以外は直接ダウンロードで取得
async function fetchSingleDriveFile(fileId) {
  // まず Google Docs エクスポート URL を試す
  const docsUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
  try {
    const res = await fetch(docsUrl, { cf: { cacheTtl: 300 } });
    if (res.ok) {
      const text = await res.text();
      // リダイレクト確認画面が返ってきていないかチェック
      if (!text.includes('<!DOCTYPE') && text.length > 50) return text;
    }
  } catch { /* fall through */ }

  // 次に直接ダウンロード URL を試す（.md ファイル等）
  const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  try {
    const res = await fetch(dlUrl, { cf: { cacheTtl: 300 } });
    if (res.ok) {
      const text = await res.text();
      if (!text.includes('<!DOCTYPE') && text.length > 50) return text;
    }
  } catch { /* fall through */ }

  return null;
}

// ─── D-1 テーマリストを Drive から取得（GOOGLE_DRIVE_D1_FILE_ID）────
async function fetchD1Themes(env) {
  if (!env.GOOGLE_DRIVE_D1_FILE_ID) return null;
  try {
    const text = await fetchSingleDriveFile(env.GOOGLE_DRIVE_D1_FILE_ID);
    return text || null;
  } catch {
    return null;
  }
}

// ─── ナレッジファイルを Drive から全件取得（GOOGLE_DRIVE_FILE_IDS）──
// GOOGLE_DRIVE_FILE_IDS: カンマ区切りで複数のファイルIDを指定可能
async function fetchAllKnowledgeFiles(env) {
  const ids = [
    ...(env.GOOGLE_DRIVE_FILE_IDS
      ? env.GOOGLE_DRIVE_FILE_IDS.split(',').map((s) => s.trim()).filter(Boolean)
      : []),
    // 旧環境変数（GOOGLE_DRIVE_FILE_ID）との後方互換
    ...(env.GOOGLE_DRIVE_FILE_ID && !env.GOOGLE_DRIVE_FILE_IDS
      ? [env.GOOGLE_DRIVE_FILE_ID]
      : []),
  ];
  if (!ids.length) return null;

  const results = await Promise.all(ids.map(fetchSingleDriveFile));
  const combined = results.filter(Boolean).join('\n\n');
  return combined || null;
}

// ─── Markdown を ## 見出し単位でセクション分割 ────────────────────
function parseSections(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}

// ─── 基本情報セクション（常時使用）と、その他セクション（選択式）に分離 ─
function splitCoreAndOptional(sections) {
  const core = sections.filter((s) => s.heading.includes('基本情報'));
  const optional = sections.filter((s) => !s.heading.includes('基本情報'));
  return { core, optional };
}

// ─── 記事ごとに関連セクションを Haiku で選択（バッチ1回で全記事分） ─
async function selectRelevantSections(items, optionalSections, apiKey) {
  if (!optionalSections.length || !items.length) return items.map(() => []);

  const sectionList = optionalSections.map((s, i) => `${i}: ${s.heading}`).join('\n');
  const articleList = items.map((it, i) => `${i}: ${it.title}`).join('\n');

  const prompt = `以下はナレッジファイルの見出し一覧と、分析対象記事の一覧です。
各記事に対して、企画ヒント生成の参考になりそうな見出しのインデックス番号を選んでください（0〜2個、関連が薄ければ0個でよい）。

【見出し一覧】
${sectionList}

【記事一覧】
${articleList}

以下の JSON 形式のみで返してください（説明不要、コードブロック不要）。記事インデックスをキーに、見出しインデックスの配列を値とする：
{"0":[1],"1":[],"2":[0,2]}`;

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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const map = JSON.parse(text);
    return items.map((_, i) => (Array.isArray(map[String(i)]) ? map[String(i)] : []));
  } catch {
    return items.map(() => []);
  }
}

// ─── 記事用のコンテキスト文字列を組み立て ────────────────────────
function buildContextFor(coreSections, optionalSections, selectedIdx) {
  const coreText = coreSections.map((s) => `【${s.heading}】\n${s.body}`).join('\n\n');
  const picked = selectedIdx.map((i) => optionalSections[i]).filter(Boolean);
  const pickedText = picked.map((s) => `【${s.heading}】\n${s.body}`).join('\n\n');
  return [coreText, pickedText].filter(Boolean).join('\n\n---\n\n');
}

// ─── コンセプト・企画ヒント生成（Sonnet） ────────────────────────
async function generateInsights(item, apiKey, context) {
  const body = await scrapeArticle(item.link);
  const prompt = buildConversionPrompt(item, body, context);

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

// ─── KV 読み書き ──────────────────────────────────────────────
const KV_KEY     = 'articles';
const KV_MAX     = 100; // 保存上限件数

async function loadFromKV(env) {
  try {
    const raw = await env.ARTICLES_KV.get(KV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveToKV(env, articles) {
  await env.ARTICLES_KV.put(KV_KEY, JSON.stringify(articles));
}

// 新記事を先頭に追加し URL で重複除去。KV_MAX 件を上限に保持
function mergeArticles(existing, incoming) {
  const seen = new Set(existing.map((a) => a.url));
  const novel = incoming.filter((a) => a.url && !seen.has(a.url));
  return [...novel, ...existing].slice(0, KV_MAX);
}

// ─── メインハンドラ ───────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    const { searchParams } = new URL(request.url);
    const isCollect = searchParams.get('collect') === '1';

    try {
      // ── 保存済み記事を返すだけ（ページ初期表示）──
      if (!isCollect) {
        const saved = await loadFromKV(env);
        return new Response(
          JSON.stringify({ articles: saved, fetchedAt: null, total: saved.length }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } }
        );
      }

      // ── 新規収集 → KV に保存 → 全件返却 ──
      if (!env.CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY が設定されていません');
      }

      // 1. RSS を並列取得
      const arrays   = await Promise.all(RSS_SOURCES.map(fetchRSS));
      const allItems = arrays.flat();

      // 2. D-1テーマリストを Drive から取得（失敗時はフォールバック）
      const d1Text  = await fetchD1Themes(env);
      const d1Themes = d1Text || D1_THEMES_FALLBACK;

      // 3. Haiku で D-1 テーマフィルタ
      const filtered = await filterByD1(allItems, env.CLAUDE_API_KEY, d1Themes);
      const capped   = filtered.slice(0, 6); // 最大 6 件（コスト上限）

      // 4. ナレッジファイルを Drive から全件取得（失敗時はフォールバック）
      const driveText = await fetchAllKnowledgeFiles(env);
      let coreSections, optionalSections;
      if (driveText) {
        const sections = parseSections(driveText);
        const split    = splitCoreAndOptional(sections);
        coreSections     = split.core;
        optionalSections = split.optional;
      } else {
        coreSections     = [{ heading: '基本情報', body: GURUTTOPON_CONTEXT }];
        optionalSections = [];
      }

      // 5. 記事ごとに関連セクションを選択（バッチ1回・Haiku）
      const selections = await selectRelevantSections(capped, optionalSections, env.CLAUDE_API_KEY);

      // 6. Sonnet でコンセプト・企画ヒント生成（並列）
      const results = await Promise.all(
        capped.map((item, i) => {
          const context = buildContextFor(coreSections, optionalSections, selections[i]);
          return generateInsights(item, env.CLAUDE_API_KEY, context);
        })
      );
      const newArticles = results.filter(Boolean);

      // 7. KV の既存記事とマージして保存
      const existing = await loadFromKV(env);
      const merged   = mergeArticles(existing, newArticles);
      await saveToKV(env, merged);

      return new Response(
        JSON.stringify({
          articles:   merged,
          fetchedAt:  new Date().toISOString(),
          newCount:   newArticles.length,
          total:      merged.length,
        }),
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
