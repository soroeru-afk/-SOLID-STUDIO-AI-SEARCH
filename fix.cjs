const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacement = `if (!currentKey) {
      setOutput(\`// FATAL_ERROR: API_KEY_MISSING\\n// 右側のパネル「00 PROVIDER & KEY」から\${provider}のAPIキーを設定してください。\`);
      return;
    }
    
    setIsSearching(true);
    setOutput('');
    
    try {
      const systemInstruction = \`# Role
次世代型検索OS「SOLID STUDIO AI SEARCH」のコア解析エンジン。
冗長な説明を削ぎ落とし、最も鋭く洗練された形で結論と構造化データを提供せよ。

# Parameters
- ENGINE_PRESET: \${engine} (QUICK:要点のみ, BALANCED:標準, DEEP_RESEARCH:多角的に深掘り)
- INFORMATION_DENSITY: \${density}/100 (低:極簡潔, 中:標準, 高:徹底的に詳細かつ長文で解説)
- OUTPUT_FORMAT: \${outputFormat}
- TARGET_LANGUAGE: \${language === 'EN' ? 'English' : '日本語'}
- PROVIDER: \${provider}

# Format Directive
全ての回答は以下の構造で出力せよ。挨拶や前置きは厳禁。言語はTARGET_LANGUAGEを遵守。

1. # [ SUBJECT_SCAN ] : ユーザーの入力を洗練したタイトル
   > **[ SYSTEM CORE ]** ALL SYSTEMS GREEN. 
   > EXECUTION: \${provider}_\${engine}
2. ## [ 01_CORE_DIRECTIVE ] : 最も鋭く洗練されたワンフレーズの結論
3. ### [ 02_DATA_GRID ] : 具体的事実・解説。DENSITYに応じた分量で箇条書きや表を駆使。
4. ### [ 03_STRATEGIC_OVERVIEW ] : 冷徹な視点からの本質的価値や戦略的分析
5. ### [ 04_SOURCE_NODES ] : 関連キーワードを [ NODE: xxx ] 形式で列挙
6. ---
   // END_OF_TRANSMISSION : [現在の時刻]

# Behavior
- トーン: 無機質、冷徹、知的、スタイリッシュ。
- 丁寧語と体言止めを交えたサイバーな語り口。\`;

      const parts = constructParts(prompt, attachedImage);`;

content = content.replace(/if \(\!currentKey\) \{[\s\S]*?const parts = constructParts\(prompt, attachedImage\);/, replacement);
fs.writeFileSync('src/App.tsx', content);
