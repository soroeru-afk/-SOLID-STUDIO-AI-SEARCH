import { GoogleGenAI } from '@google/genai';
import { Zap, Upload, Download, RotateCcw, MessageSquare, TerminalSquare, Loader2, Maximize2, Minimize2, Image as ImageIcon, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';

// We initialize Gemini dynamically in handleExecute to use the latest API Key

// IndexedDB for File System API handle
const GAI_CLOUD_DIR_KEY = 'GAI_CLOUD_DIR_HANDLE';
const GAI_IDB_NAME = 'GAI_CLOUD_IDB';
const GAI_IDB_STORE = 'handles';

function gaiOpenIDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(GAI_IDB_NAME, 1);
    req.onupgradeneeded = (e: any) => e.target.result.createObjectStore(GAI_IDB_STORE);
    req.onsuccess = (e: any) => resolve(e.target.result);
    req.onerror = (e: any) => reject(e.target.error);
  });
}

async function gaiIdbPut(key: string, value: any) {
  const db = await gaiOpenIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GAI_IDB_STORE, 'readwrite');
    tx.objectStore(GAI_IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e: any) => reject(e.target.error);
  });
}

async function gaiIdbGet(key: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await gaiOpenIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GAI_IDB_STORE, 'readonly');
    const req = tx.objectStore(GAI_IDB_STORE).get(key);
    req.onsuccess = (e: any) => resolve(e.target.result);
    req.onerror = (e: any) => reject(e.target.error);
  });
}

type Theme = 'DARK' | 'BLACK' | 'MID' | 'BLUE' | 'GREEN' | 'RED' | 'LIGHT';
type EngineType = 'BALANCED' | 'DEEP_RESEARCH' | 'QUICK';
type OutputFormat = 'STANDARD' | 'RAW_JSON' | 'MINIMAL';

interface HistoryItem {
  id: string;
  keyword: string;
  timestamp: string;
  result: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('SEARCH_BUFFER');
  const [theme, setTheme] = useState<Theme>('DARK');
  
  // Settings
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('solid_studio_api_key') || '');
  const [engine, setEngine] = useState<EngineType>('BALANCED');
  const [density, setDensity] = useState(64);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('STANDARD');
  const [fontSizeRem, setFontSizeRem] = useState(0.85); // Slider driven font size
  const [paperMode, setPaperMode] = useState(false); // Paper mode for text area
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // TTS State
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsVoiceURI, setTtsVoiceURI] = useState('');
  const [ttsRate, setTtsRate] = useState(1.0);
  const [ttsPitch, setTtsPitch] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [ttsIsPlaying, setTtsIsPlaying] = useState(false);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Search/Edit State
  const [prompt, setPrompt] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [output, setOutput] = useState('');
  const [editContent, setEditContent] = useState('');
  
  // Attached Image
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // History & I/O
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('solid_studio_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load history', e);
    }
    return [];
  });
  const [copyStatus, setCopyStatus] = useState('結果をコピー (COPY)');
  const [importStatus, setImportStatus] = useState('インポート (IMPORT)');
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load TTS voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setTtsVoices(voices);
        // Prefer Japanese voice
        const jaVoice = voices.find(v => v.lang.startsWith('ja'));
        if (jaVoice) setTtsVoiceURI(jaVoice.voiceURI);
        else setTtsVoiceURI(voices[0]?.voiceURI || '');
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  // Stop TTS when output changes
  useEffect(() => {
    window.speechSynthesis.cancel();
    setTtsIsPlaying(false);
  }, [output]);

  const ttsSpeak = useCallback((text: string) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = ttsVoices.find(v => v.voiceURI === ttsVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;
    utterance.volume = ttsVolume;
    utterance.onstart = () => setTtsIsPlaying(true);
    utterance.onend = () => setTtsIsPlaying(false);
    utterance.onerror = () => setTtsIsPlaying(false);
    ttsUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [ttsVoices, ttsVoiceURI, ttsRate, ttsPitch, ttsVolume]);

  const ttsStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setTtsIsPlaying(false);
  }, []);

  const ttsPlayFromTop = useCallback(() => {
    if (!output) return;
    // Strip markdown symbols for cleaner reading
    const plain = output
      .replace(/#{1,6}\s+/g, '')
      .replace(/[\*_`~>\[\]]/g, '')
      .replace(/\|/g, ' ');
    ttsSpeak(plain);
  }, [output, ttsSpeak]);

  const ttsPlayFromParagraph = useCallback((paragraphText: string) => {
    if (!output || !paragraphText) return;
    // Find the position of clicked paragraph in full text, read from there
    const plain = output
      .replace(/#{1,6}\s+/g, '')
      .replace(/[\*_`~>\[\]]/g, '')
      .replace(/\|/g, ' ');
    const idx = plain.indexOf(paragraphText.substring(0, 30));
    const fromHere = idx > -1 ? plain.substring(idx) : plain;
    ttsSpeak(fromHere);
  }, [output, ttsSpeak]);

  // Persist history and API Key
  useEffect(() => {
    localStorage.setItem('solid_studio_history', JSON.stringify(history));
  }, [history]);
  useEffect(() => {
    localStorage.setItem('solid_studio_api_key', apiKey);
  }, [apiKey]);

  const loadHistory = (item: HistoryItem) => {
    setPrompt(item.keyword);
    setOutput(item.result);
    setActiveTab('SEARCH_BUFFER');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset
  };

  const constructParts = (text: string, base64Image: string | null) => {
    const parts: any[] = [{ text: text || " " }];
    if (base64Image) {
      const mimeType = base64Image.split(';')[0].split(':')[1];
      const base64Data = base64Image.split(',')[1];
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }
    return parts;
  };

  const handleExecute = async () => {
    if (!prompt.trim() && !attachedImage || isSearching) return;
    
    // Use user-provided API key, fallback to env (for local dev)
    const currentKey = apiKey || process.env.GEMINI_API_KEY;
    if (!currentKey) {
      setOutput('// FATAL_ERROR: API_KEY_MISSING\\n// 右側のパネル「00 API KEY」からGemini APIキーを設定してください。');
      return;
    }
    
    setIsSearching(true);
    setOutput('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const systemInstruction = `
# Role
あなたは次世代型検索OS「SOLID STUDIO AI SEARCH」のコア解析エンジンです。
冗長な説明を削ぎ落とし、最も鋭く、洗練された形でユーザーに「ワンフレーズの結論」を提示したのち、極めて構造化されたデータを提供します。

# Parameters
- ENGINE_PRESET: ${engine}
- OUTPUT_FORMAT: ${outputFormat}

# Visual Design Interface (UIルール)
全ての回答は、以下の「洗練されたターミナル出力形式」で出力してください。

1. [ 00_DATA_TITLE (ログの見出し) ]
   - 一番最初の行に、検索対象を象徴する、短く知的な「見出し（H1）」を記述して開始してください。この１行目がログ閲覧時のタイトルになります。「[ HEADER ]」という文字は書かないでください。
   - 形式: \`# [ SUBJECT_SCAN ] : ユーザーの入力内容を洗練・再構築したタイトル\`
   - 例: \`# [ SUBJECT_SCAN ] : Apple「Mac」システムのアーキテクチャ基礎解析\`
   - タイトルの直後に、以下のシステムステータスを引用ブロックで記述してください。
   > **[ SYSTEM CORE ]** ALL SYSTEMS GREEN. 
   > EXECUTION: GEMINI_${engine} / TARGET: \`[ユーザーの入力]\`

2. [ 01_CORE_DIRECTIVE (ワンフレーズの結論) ]
   - 検索または解析の最も重要な結論を、洗練された**鋭いワンフレーズ**（1〜2行程度）で、見出し（H2）を用いて最も目立つように出力してください。
   - 例:
     ## ーーそれは、進化を加速させるための特異点。

3. [ 02_DATA_GRID (詳細解析) ]
   - 具体的な事実や解説を、箇条書き( \`-\` ) または テーブル形式( \`|\` ) で極めて簡潔かつ構造的に出力します。無駄な文脈は省いてください。

4. [ 03_STRATEGIC_OVERVIEW (戦略的視座) ]
   - この情報がもたらす「本質的な価値」や「次に打つべき最適手」を、AI独自の冷徹な視点から分析し、短い1つのパラグラフで提示してください。

5. [ 04_SOURCE_NODES ]
   - 関連する情報領域やキーワードを \`[ NODE: タイトル ]\` のようなテキストバッジ形式で列挙してください。

6. [ FOOTER ]
   - 最後に水平線 \`---\` を引き、 \`// END_OF_TRANSMISSION : [現在の時刻]\` と記述してください。

# Behavior
- トーンは「無機質、冷徹、しかし知的でスタイリッシュ」を維持してください。
- 丁寧語と体言止めをリズミカルに混ぜ、サイバーでかっこいい語り口にしてください。
- 挨拶や余計な前書き（「検索結果はこちらです」など）は一切不要です。即座にHEADERからコンソール出力のように始めてください。
`;

      const parts = constructParts(prompt, attachedImage);
      setAttachedImage(null); // use image and clear

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: parts, // send parts array directly for single prompt
        config: {
          systemInstruction,
        }
      });
      
      const text = response.text || '// ERROR: NO_RESPONSE_FROM_ENGINE';
      setOutput(text);
      
      const newHistory: HistoryItem = {
        id: Date.now().toString(),
        keyword: prompt || 'IMAGE_SEARCH',
        timestamp: new Date().toLocaleTimeString('ja-JP'),
        result: text
      };
      setHistory(prev => [newHistory, ...prev].slice(0, 10));
      
    } catch (error: any) {
      console.error(error);
      let errMsg = '// FATAL_ERROR: ENGINE_OVERLOAD\\n// CONNECTION_FAILED';
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        errMsg = '// FATAL_ERROR: QUOTA_EXCEEDED\\n// APIの利用制限（クォータ）に達しました。しばらく待ってから再度お試しください。';
      }
      setOutput(errMsg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleExecute();
    }
  };

  const handleCopy = () => {
    const textToCopy = output;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopyStatus('COPIED!');
    setTimeout(() => setCopyStatus('結果をコピー (COPY)'), 2000);
  };

  const [saveStatus, setSaveStatus] = useState('保存 (SAVE AS)');
  const [driveDirName, setDriveDirName] = useState('未設定');
  const isIframe = window.self !== window.top;

  // Load handle name on mount
  useEffect(() => {
    if (isIframe) {
      setDriveDirName('ブラウザのDLフォルダ (iframe制限)');
      return;
    }
    gaiIdbGet(GAI_CLOUD_DIR_KEY).then(handle => {
      if (handle) setDriveDirName(handle.name);
    }).catch(() => {});
  }, [isIframe]);

  const handleSaveAs = async () => {
    let content = '';
    let filename = '';
    const now = new Date();
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}_${hours}${minutes}`;

    if (!output) return;
    content = output;
    const title = prompt ? prompt.trim().substring(0, 30).replace(/[\\/:*?"<>|]/g, '_') : 'SEARCH';
    filename = `${datePrefix}_「${title}」.txt`;

    const fallbackDownload = () => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      setSaveStatus('SAVED!');
      setTimeout(() => setSaveStatus('保存 (SAVE AS)'), 2000);
    };

    if (isIframe) {
      fallbackDownload();
      return;
    }

    try {
      let handle = await gaiIdbGet(GAI_CLOUD_DIR_KEY) as any;
      
      if (!handle) {
        if (!('showDirectoryPicker' in window)) {
          alert('お使いのブラウザはFile System Access APIに対応していません。');
          return;
        }
        handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        await gaiIdbPut(GAI_CLOUD_DIR_KEY, handle);
        setDriveDirName(handle.name);
      }

      // Verify permission
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      
      if (perm !== 'granted') {
        alert('フォルダへのアクセスが許可されませんでした。設定をリセットします。');
        await gaiIdbPut(GAI_CLOUD_DIR_KEY, null);
        setDriveDirName('未設定');
        return;
      }

      const fileHandle = await handle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      setSaveStatus('SAVED!');
      setTimeout(() => setSaveStatus('保存 (SAVE AS)'), 2000);

    } catch (err: any) {
      console.error(err);
      if (err.name !== 'AbortError') {
        alert('保存エラー: ' + err.message + '\n\n※AI Studioのプレビュー画面(iframe)では制限により保存できません。右上の「Open in new tab」アイコンから全画面で開いてお試しください。');
      }
    }
  };

  const handleResetDrive = async () => {
    await gaiIdbPut(GAI_CLOUD_DIR_KEY, null);
    setDriveDirName('未設定');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target?.result as string);
            if (data.output) setOutput(data.output);
            if (data.history) setHistory(data.history);
            if (data.activeTab) setActiveTab(data.activeTab);
            setImportStatus('IMPORTED!');
            setTimeout(() => setImportStatus('インポート (IMPORT)'), 2000);
        } catch (err) {
            setImportStatus('ERROR!');
            setTimeout(() => setImportStatus('インポート (IMPORT)'), 2000);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-screen text-[10px] sm:text-xs tracking-widest uppercase selection:bg-[var(--border-color-highlight)] overflow-hidden">
      
      {/* HEADER */}
      <header className="h-14 border-b border-[var(--border-color)] bg-[var(--bg-color-panel)] flex items-center justify-between px-4 shrink-0 transition-colors duration-300 relative z-20">
        <div className="flex items-center gap-4 sm:gap-8 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-extrabold text-xs sm:text-sm text-[var(--text-color-highlight)] tracking-[0.2em] shrink-0">
            <span className="text-[var(--text-color-dim)]">{'>_'}</span> SOLID STUDIO AI SEARCH
          </div>
          
          <div className="flex items-center gap-2 ml-auto flex-1 max-w-2xl relative">
            <div className="flex items-center bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-3 py-1.5 w-full text-[var(--text-color-dim)] focus-within:border-[var(--text-color-dim)] transition-colors relative z-30">
              <Zap size={12} className="mr-2 text-[var(--accent-color)] shrink-0" />
              <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={"検索キーワード / 質問を入力..."}
                className="bg-transparent outline-none w-full text-[var(--text-color-highlight)] placeholder:text-[var(--text-color-dim)] text-xs sm:text-sm font-sans normal-case"
                disabled={isSearching}
              />
            </div>
            
            {attachedImage && (
              <div className="absolute -bottom-10 left-4 p-1 bg-[var(--bg-color-card)] border border-[var(--border-color-highlight)] rounded-sm shadow-lg flex items-center gap-2 z-50">
                <img src={attachedImage} alt="attached" className="h-6 w-6 object-cover rounded-sm opacity-80" />
                <span className="text-[8px] text-[var(--text-color-highlight)] bg-[var(--bg-color-panel)] px-1 rounded">IMG_LOADED</span>
                <button onClick={() => setAttachedImage(null)} className="text-[var(--text-color-dim)] hover:text-red-400 p-0.5 bg-[var(--bg-color-base)] rounded-sm"><X size={10} /></button>
              </div>
            )}

            <button 
              onClick={handleExecute}
              disabled={isSearching}
              className="bg-[var(--bg-color-base)] border border-[var(--border-color-highlight)] hover:bg-[var(--border-color)] text-[var(--text-color-highlight)] px-4 py-1.5 transition-colors disabled:opacity-50 shrink-0 font-bold"
            >
              実行
            </button>
            <button 
              onClick={() => imageInputRef.current?.click()}
              className="hidden sm:flex items-center gap-2 bg-[var(--bg-color-base)] border border-[var(--border-color)] hover:bg-[var(--border-color-highlight)] text-[var(--text-color-base)] px-4 py-1.5 transition-colors shrink-0"
            >
              <Upload size={12} /> 画像読込
            </button>
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>
        </div>

        <div className="hidden md:flex flex-col items-end gap-1 text-[var(--text-color-base)] font-bold shrink-0 ml-4 w-32">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isSearching ? 'bg-yellow-500 animate-pulse' : 'bg-[var(--accent-color)] animate-pulse'}`}></div>
            <span className={isSearching ? 'text-yellow-500' : 'text-[var(--accent-color)]'}>
              {isSearching ? '処理中...' : 'STABLE'}
            </span>
          </div>
          <div className="text-[8px] text-[var(--text-color-dim)]">VER_5.2.0_JP</div>
        </div>
      </header>

      {/* MAIN CONTENT DIVIDER */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANEL */}
        <aside className={`${isSidebarOpen ? 'w-[200px] border-r' : 'w-0 overflow-hidden border-none'} border-[var(--border-color)] bg-[var(--bg-color-panel)] flex flex-col shrink-0 transition-all duration-300 md:relative absolute z-10 h-full`}>
          <div className="p-3 flex-1 overflow-y-auto w-[200px] custom-scrollbar">
            
            <div className="mb-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-2 text-[9px]">
                  <span>01 密度 (DENSITY)</span>
                  <span className="text-[var(--text-color-highlight)]">{density}</span>
                </div>
                <input 
                  type="range" 
                  value={density}
                  onChange={(e) => setDensity(Number(e.target.value))}
                  min={1} 
                  max={100} 
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" 
                />
              </div>
            </div>

            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm mb-4 transition-colors duration-300">
              <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[9px]">02 エンジン (ENGINE)</div>
              <div className="flex flex-col gap-1">
                {(['BALANCED', 'DEEP_RESEARCH', 'QUICK'] as EngineType[]).map((e) => (
                  <button 
                    key={e}
                    onClick={() => setEngine(e)}
                    className={`py-1 px-2 text-left font-bold border transition-colors rounded-sm text-[9px] ${
                      engine === e 
                        ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--text-color-highlight)]' 
                        : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-base)]'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm mb-4 transition-colors duration-300">
              <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[9px]">03 形式 (FORMAT)</div>
              <div className="flex flex-col gap-1">
                {(['STANDARD', 'RAW_JSON', 'MINIMAL'] as OutputFormat[]).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setOutputFormat(f)}
                    className={`py-1 px-2 text-left font-bold border transition-colors rounded-sm text-[9px] ${
                      outputFormat === f 
                        ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--text-color-highlight)]' 
                        : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-base)]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-2 text-[9px]">
                  <span>04 文字 (SIZE)</span>
                  <span className="text-[var(--text-color-highlight)]">{fontSizeRem.toFixed(2)}rem</span>
                </div>
                <input 
                  type="range" 
                  value={fontSizeRem}
                  onChange={(e) => setFontSizeRem(Number(e.target.value))}
                  min={0.6} 
                  max={2.0}
                  step={0.05} 
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" 
                />
              </div>
            </div>

            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm mt-4 transition-colors duration-300">
              <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[9px]">05 背景 (PAPER)</div>
              <div className="flex gap-1.5">
                 <button onClick={() => setPaperMode(false)} className={`flex-1 py-1 px-2 text-center font-bold border transition-colors rounded-sm text-[9px] ${!paperMode ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--text-color-highlight)]' : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)]'}`}>DARK</button>
                 <button onClick={() => setPaperMode(true)} className={`flex-1 py-1 px-2 text-center font-bold border transition-colors rounded-sm text-[9px] ${paperMode ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--text-color-highlight)]' : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)]'}`}>PAPER</button>
              </div>
            </div>

            {/* TTS PANEL */}
            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm mt-4 transition-colors duration-300">
              <div className="text-[var(--text-color-dim)] font-bold mb-3 text-[9px] flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${ ttsIsPlaying ? 'bg-[var(--accent-color)] animate-pulse' : 'bg-[var(--border-color-highlight)]'}`}></span>
                <span>09 音声 (TTS)</span>
              </div>

              {/* Play / Stop buttons */}
              <div className="flex gap-1.5 mb-3">
                <button
                  onClick={ttsPlayFromTop}
                  disabled={!output || ttsIsPlaying}
                  title="先頭から読み上げ"
                  className="flex-1 py-1 px-1 text-center font-bold border transition-colors rounded-sm text-[9px] bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-highlight)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <span>▶</span><span>再生</span>
                </button>
                <button
                  onClick={ttsStop}
                  disabled={!ttsIsPlaying}
                  title="停止"
                  className="flex-1 py-1 px-1 text-center font-bold border transition-colors rounded-sm text-[9px] bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-highlight)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <span>⏹</span><span>停止</span>
                </button>
              </div>

              {/* Speed */}
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-1 text-[9px]">
                  <span>速度 (SPEED)</span>
                  <span className="text-[var(--text-color-highlight)]">{ttsRate.toFixed(1)}x</span>
                </div>
                <input
                  type="range" value={ttsRate}
                  onChange={(e) => setTtsRate(Number(e.target.value))}
                  min={0.5} max={4.0} step={0.1}
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                />
              </div>

              {/* Volume */}
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-1 text-[9px]">
                  <span>音量 (VOL)</span>
                  <span className="text-[var(--text-color-highlight)]">{Math.round(ttsVolume * 100)}%</span>
                </div>
                <input
                  type="range" value={ttsVolume}
                  onChange={(e) => setTtsVolume(Number(e.target.value))}
                  min={0.0} max={1.0} step={0.05}
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                />
              </div>

              {/* Pitch */}
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-1 text-[9px]">
                  <span>音程 (PITCH)</span>
                  <span className="text-[var(--text-color-highlight)]">{ttsPitch.toFixed(1)}</span>
                </div>
                <input
                  type="range" value={ttsPitch}
                  onChange={(e) => setTtsPitch(Number(e.target.value))}
                  min={0.5} max={2.0} step={0.1}
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                />
              </div>

              {/* Voice selector */}
              <div>
                <div className="text-[var(--text-color-dim)] font-bold mb-1 text-[9px]">ボイス (VOICE)</div>
                <select
                  value={ttsVoiceURI}
                  onChange={(e) => setTtsVoiceURI(e.target.value)}
                  className="w-full bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-1.5 py-1 text-[var(--text-color-highlight)] text-[9px] outline-none focus:border-[var(--text-color-dim)] normal-case tracking-normal cursor-pointer"
                >
                  {ttsVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              {output && (
                <div className="mt-2 text-[8px] text-[var(--text-color-dim)] text-center leading-tight">
                  ※段落をクリックで
                  <br/>その箇所から読み上げ
                </div>
              )}
            </div>

          </div>
        </aside>

        {/* CENTER VIEWPORT */}
        <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-0 h-full">
           {/* TABS */}
           <div className="h-10 border-b border-[var(--border-color)] flex items-stretch justify-between px-2 sm:px-4 shrink-0 bg-[var(--bg-color-panel)] transition-colors duration-300 overflow-x-auto relative z-10">
              <div className="flex items-center gap-1 sm:gap-4 font-bold shrink-0 h-full">
                 <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-1.5 text-[var(--text-color-dim)] hover:text-[var(--text-color-highlight)] transition-colors rounded bg-[var(--bg-color-base)] border border-[var(--border-color)] mr-2 md:hidden h-7 flex items-center justify-center"
                 >
                    {isSidebarOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                 </button>
                 <button 
                    onClick={() => setActiveTab('SEARCH_BUFFER')}
                    className={`flex items-center justify-center gap-2 h-full border-b-2 px-2 sm:px-4 transition-colors ${activeTab === 'SEARCH_BUFFER' ? 'border-[var(--text-color-highlight)] text-[var(--text-color-highlight)] bg-[var(--bg-color-card)]' : 'border-transparent text-[var(--text-color-dim)] hover:text-[var(--text-color-base)]'}`}
                  >
                    <TerminalSquare size={14} /> <span className="mt-1">検索バッファ <span className="hidden sm:inline">(SEARCH)</span></span>
                 </button>
                 <button 
                    onClick={() => { setEditContent(output); setActiveTab('EDIT_BUFFER'); }}
                    className={`flex items-center justify-center gap-2 h-full border-b-2 px-2 sm:px-4 transition-colors ${activeTab === 'EDIT_BUFFER' ? 'border-[var(--text-color-highlight)] text-[var(--text-color-highlight)] bg-[var(--bg-color-card)]' : 'border-transparent text-[var(--text-color-dim)] hover:text-[var(--text-color-base)]'}`}
                  >
                    <MessageSquare size={14} /> <span className="mt-1">検索内容の編集 <span className="hidden sm:inline">(EDIT)</span></span>
                 </button>
              </div>
           </div>

           {/* CANVAS */}
           <div className="flex-1 relative bg-dots overflow-hidden w-full h-full">
              
              {/* SEARCH BUFFER VIEW */}
              <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-300 ${activeTab === 'SEARCH_BUFFER' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
                  {!output && !isSearching && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--border-color-highlight)] p-4 text-center">
                       <TerminalSquare size={48} className="mb-4 opacity-50" />
                       <span className="font-bold tracking-[0.3em] italic">検索を実行してください<br/><span className="text-[8px] opacity-70">AWAITING_INPUT</span></span>
                    </div>
                  )}

                  {isSearching && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--accent-color)] bg-[var(--bg-color-base)]/80 backdrop-blur-sm z-10">
                       <Loader2 size={48} className="mb-4 animate-spin opacity-80" />
                       <span className="font-bold tracking-[0.3em] animate-pulse">情報を解析中...<br/><span className="text-[8px] opacity-70">QUERYING_GLOBAL_NETWORK</span></span>
                    </div>
                  )}

                  {output && !isSearching && (
                    <div className="p-4 sm:p-8 max-w-6xl mx-auto min-h-full pb-20">
                      <div className={`border border-[var(--border-color)] bg-[var(--bg-color-card)] p-6 sm:p-10 shadow-2xl rounded-sm transition-colors duration-300 ${paperMode ? 'paper-mode' : ''}`}>
                        <div
                          className="markdown-body break-words normal-case"
                          style={{ fontSize: `${fontSizeRem}rem` }}
                          onClick={(e) => {
                            // Click on any block-level element to read from that paragraph
                            const target = e.target as HTMLElement;
                            const block = target.closest('p, h1, h2, h3, h4, li, blockquote, td') as HTMLElement | null;
                            if (block) {
                              const text = block.innerText;
                              if (text.trim()) ttsPlayFromParagraph(text.trim());
                            }
                          }}
                        >
                          <Markdown>{output}</Markdown>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              {/* EDIT BUFFER VIEW */}
              <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 z-10 bg-[var(--bg-color-card)] overflow-hidden ${activeTab === 'EDIT_BUFFER' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                 <div className="flex flex-col h-full min-h-0">
                    <textarea 
                      className="flex-1 w-full min-h-0 bg-transparent p-4 sm:p-8 pb-4 font-mono text-[var(--text-color-highlight)] outline-none resize-none custom-scrollbar"
                      style={{ fontSize: `${fontSizeRem}rem` }}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="// NO_DATA_AVAILABLE"
                    />
                    <div className="p-4 sm:p-8 pt-4 shrink-0 bg-[var(--bg-color-card)] flex justify-end gap-2 sm:gap-4 border-t border-[var(--border-color)]">
                      <button 
                        onClick={() => { setEditContent(output); setActiveTab('SEARCH_BUFFER'); }}
                        className="text-[var(--text-color-dim)] hover:text-[var(--text-color-highlight)] transition-colors px-2 sm:px-4 py-2 font-bold text-[10px] sm:text-xs"
                      >
                        キャンセル (CANCEL)
                      </button>
                      <button 
                        onClick={() => { setOutput(editContent); setActiveTab('SEARCH_BUFFER'); }}
                        className="bg-[var(--accent-color)] text-[#000000] px-4 sm:px-6 py-2 rounded-sm font-bold transition-all hover:brightness-110 text-[10px] sm:text-xs tracking-wider uppercase shadow-lg border border-transparent hover:border-[#ffffff55]"
                      >
                        編集内容の保存 (SAVE)
                      </button>
                    </div>
                 </div>
              </div>

              {/* OVERLAY CONTROLS */}
              <div className={`absolute bottom-6 right-6 flex flex-col gap-2 z-20 transition-transform duration-300`}>
                 {activeTab === 'SEARCH_BUFFER' && output && (
                   <>
                     <button onClick={handleSaveAs} title="ダウンロード" className="w-10 h-10 bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm flex items-center justify-center text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-highlight)] transition-colors shadow-lg">
                        <Download size={14} />
                     </button>
                     <button onClick={() => setOutput('')} title="出力をクリア" className="w-10 h-10 bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm flex items-center justify-center text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-highlight)] transition-colors shadow-lg">
                        <RotateCcw size={14} />
                     </button>
                   </>
                 )}
              </div>
           </div>
        </main>

        {/* RIGHT PANEL - hidden on small screens unless toggled, let's keep it visible on lg */}
        <aside className="w-[200px] border-l border-[var(--border-color)] bg-[var(--bg-color-panel)] shrink-0 transition-colors duration-300 hidden lg:flex flex-col z-20">
          <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
             <div className="mb-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
               <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[9px]">00 API KEY</div>
               <input 
                 type="text"
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 placeholder="AIzaSy..."
                 autoComplete="off"
                 spellCheck="false"
                 data-1p-ignore
                 style={{ WebkitTextSecurity: 'disc' }}
                 className="w-full bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-2 py-1 text-[var(--text-color-highlight)] text-[10px] outline-none focus:border-[var(--text-color-dim)]"
               />
             </div>

             <div className="mb-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
               <div className="text-[var(--text-color-dim)] font-bold mb-3 text-[9px]">06 テーマ (THEMES)</div>
               <div className="grid grid-cols-2 gap-1.5">
                 {(['DARK', 'BLACK', 'MID', 'BLUE', 'GREEN', 'RED', 'LIGHT'] as Theme[]).map((t) => (
                   <button 
                     key={t}
                     onClick={() => setTheme(t)}
                     className={`py-1 px-1 text-center font-bold border transition-colors rounded-sm text-[9px] ${
                       theme === t 
                         ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--text-color-highlight)]' 
                         : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--text-color-base)]'
                     }`}
                   >
                     {t}
                   </button>
                 ))}
               </div>
             </div>

             <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300 flex-1 flex flex-col h-1/2">
               <div className="text-[var(--text-color-dim)] font-bold mb-3 text-[9px] shrink-0">07 履歴 (HISTORY)</div>
               <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
                 {history.length === 0 ? (
                   <div className="py-8 text-center border border-dashed border-[var(--border-color)] text-[var(--text-color-dim)] text-[8px]">
                     EMPTY_RECORD
                   </div>
                 ) : (
                   history.map((item) => (
                     <button 
                       key={item.id}
                       onClick={() => loadHistory(item)}
                       className="p-3 border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-left transition-colors group rounded-sm"
                     >
                       <div className="text-[var(--accent-color)] mb-1 text-[8px]">{item.timestamp}</div>
                       <div className="text-[var(--text-color-base)] group-hover:text-[var(--text-color-highlight)] truncate text-xs normal-case font-sans">{item.keyword}</div>
                     </button>
                   ))
                 )}
                 {history.length > 0 && (
                    <button onClick={() => setHistory([])} className="mt-2 text-xs text-[var(--text-color-dim)] hover:text-[var(--text-color-base)] p-2 border border-transparent hover:border-[var(--border-color)] rounded-sm transition-colors">履歴をクリア</button>
                 )}
               </div>
             </div>
             
             <div className="mt-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
               <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[9px] flex justify-between items-center">
                 <span>08 DRIVE 保存先</span>
                 {driveDirName !== '未設定' && (
                   <button onClick={handleResetDrive} className="text-[var(--accent-color)] hover:text-[#ff4444] hover:underline cursor-pointer">変更(CLEAR)</button>
                 )}
               </div>
               <div className="text-[10px] text-[var(--text-color-base)] truncate bg-[var(--bg-color-base)] border border-[var(--border-color)] p-2 rounded-sm text-center">
                 {driveDirName}
               </div>
             </div>
          </div>
        </aside>

      </div>

      {/* FOOTER */}
      <footer className="h-10 border-t border-[var(--border-color)] bg-[var(--bg-color-base)] flex items-stretch shrink-0 text-[var(--text-color-dim)] font-bold divide-x divide-[var(--border-color)] transition-colors duration-300 overflow-x-auto whitespace-nowrap relative z-20">
         <button onClick={handleCopy} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[10px] flex items-center justify-center"><span className="mt-1">{copyStatus}</span></button>
         <button onClick={() => setOutput('')} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[10px] flex items-center justify-center"><span className="mt-1">クリア (CLEAR)</span></button>
         <button onClick={() => importFileRef.current?.click()} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[10px] flex items-center justify-center"><span className="mt-1">{importStatus}</span></button>
         <input type="file" ref={importFileRef} accept=".json" className="hidden" onChange={handleImport} />
         <button onClick={handleSaveAs} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[10px] flex items-center justify-center"><span className="mt-1">{saveStatus}</span></button>
      </footer>
    </div>
  );
}
