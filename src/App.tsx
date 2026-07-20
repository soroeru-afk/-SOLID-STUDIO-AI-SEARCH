import { GoogleGenAI } from '@google/genai';
import { Zap, Upload, Download, RotateCcw, MessageSquare, TerminalSquare, Loader2, Expand, Shrink, Image as ImageIcon, X, AlignLeft, AlignCenter, AlignRight, Type, ArrowDownUp } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';

// Initialize Gemini dynamically in handleExecute

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
type Provider = 'GEMINI' | 'GROQ';

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
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('solid_studio_active_tab') || 'SEARCH_BUFFER');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('solid_studio_theme') as Theme) || 'DARK');
  
  // Settings
  const [provider, setProvider] = useState<Provider>(() => (localStorage.getItem('solid_studio_provider') as Provider) || 'GEMINI');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('solid_studio_api_key') || '');
  const [groqApiKey, setGroqApiKey] = useState(() => localStorage.getItem('solid_studio_groq_api_key') || '');
  const [engine, setEngine] = useState<EngineType>(() => (localStorage.getItem('solid_studio_engine') as EngineType) || 'BALANCED');
  const [density, setDensity] = useState(() => Number(localStorage.getItem('solid_studio_density') || '64'));
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(() => (localStorage.getItem('solid_studio_output_format') as OutputFormat) || 'STANDARD');
  const [fontSizeRem, setFontSizeRem] = useState(() => Number(localStorage.getItem('solid_studio_font_size_rem') || '0.85')); // Slider driven font size
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('solid_studio_line_height') || '1.6'));
  const [textAlign, setTextAlign] = useState<'left'|'center'|'right'>(() => (localStorage.getItem('solid_studio_text_align') as 'left'|'center'|'right') || 'left');
  const [paperMode, setPaperMode] = useState(() => localStorage.getItem('solid_studio_paper_mode') === 'true'); // Paper mode for text area
  const [isVertical, setIsVertical] = useState(() => localStorage.getItem('solid_studio_is_vertical') === 'true'); // Vertical writing mode
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem('solid_studio_is_sidebar_open') !== 'false');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [language, setLanguage] = useState<'JP' | 'EN'>(() => (localStorage.getItem('solid_studio_language') as 'JP'|'EN') || 'JP');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const editScrollContainerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (isVertical) {
        if (e.deltaY !== 0) {
          e.preventDefault();
          container.scrollLeft -= e.deltaY; // rtl mode means scrolling left reduces scrollLeft usually, or increases it depending on browser. 
          // Let's use `scrollBy` for standard behavior if possible, or just `-=` or `+=`.
          // Standard for rtl vertical-rl: scrolling down (deltaY > 0) should move text to the left (scrollLeft becomes more negative in some browsers, or decreases).
          // Actually, container.scrollBy({ left: -e.deltaY }) works well in most modern browsers.
          container.scrollBy({ left: -e.deltaY });
        }
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isVertical]);

  useEffect(() => {
    const container = editScrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (isVertical) {
        if (e.deltaY !== 0) {
          e.preventDefault();
          container.scrollBy({ left: -e.deltaY });
        }
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isVertical]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(console.error);
      }
    }
  };

  // TTS State
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsVoiceURI, setTtsVoiceURI] = useState(() => localStorage.getItem('tts_voice_uri') || '');
  const [ttsRate, setTtsRate] = useState(() => Number(localStorage.getItem('tts_rate') || '1.0'));
  const [ttsPitch, setTtsPitch] = useState(() => Number(localStorage.getItem('tts_pitch') || '1.0'));
  const [ttsVolume, setTtsVolume] = useState(() => Number(localStorage.getItem('tts_volume') || '1.0'));
  const [ttsIsPlaying, setTtsIsPlaying] = useState(false);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Search/Edit State
  const [prompt, setPrompt] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [output, setOutput] = useState(() => localStorage.getItem('solid_studio_output') || '');
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
        // Restore saved voice; only fall back to Japanese default if saved voice not found
        setTtsVoiceURI(prev => {
          if (prev && voices.some(v => v.voiceURI === prev)) return prev;
          const jaVoice = voices.find(v => v.lang.startsWith('ja'));
          return jaVoice ? jaVoice.voiceURI : (voices[0]?.voiceURI || '');
        });
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  // Restore or center PWA window on load, and track resizing/moving
  useEffect(() => {
    try {
      const w = 1280, h = 800;
      // Get saved positions or default to screen center
      const savedX = localStorage.getItem('solid_studio_win_x');
      const savedY = localStorage.getItem('solid_studio_win_y');
      const savedW = localStorage.getItem('solid_studio_win_w');
      const savedH = localStorage.getItem('solid_studio_win_h');

      const targetW = savedW ? Number(savedW) : w;
      const targetH = savedH ? Number(savedH) : h;
      
      const defaultLeft = Math.max(0, (window.screen.availWidth - targetW) / 2);
      const defaultTop = Math.max(0, (window.screen.availHeight - targetH) / 2);
      
      const targetX = savedX ? Number(savedX) : defaultLeft;
      const targetY = savedY ? Number(savedY) : defaultTop;

      window.resizeTo(targetW, targetH);
      window.moveTo(targetX, targetY);
    } catch {}

    const handleResizeOrMove = () => {
      try {
        localStorage.setItem('solid_studio_win_x', String(window.screenX));
        localStorage.setItem('solid_studio_win_y', String(window.screenY));
        localStorage.setItem('solid_studio_win_w', String(window.outerWidth));
        localStorage.setItem('solid_studio_win_h', String(window.outerHeight));
      } catch {}
    };

    window.addEventListener('resize', handleResizeOrMove);
    // Note: window.onmove or polling is needed for window movement in standard browsers since there is no native 'move' event.
    // We can also poll or set coordinates on click/interactions.
    const interval = setInterval(handleResizeOrMove, 1000);

    return () => {
      window.removeEventListener('resize', handleResizeOrMove);
      clearInterval(interval);
    };
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

  // Persist history, API Key, and output
  useEffect(() => {
    localStorage.setItem('solid_studio_history', JSON.stringify(history));
  }, [history]);
  useEffect(() => {
    localStorage.setItem('solid_studio_api_key', apiKey);
  }, [apiKey]);
  useEffect(() => {
    localStorage.setItem('solid_studio_groq_api_key', groqApiKey);
  }, [groqApiKey]);
  useEffect(() => {
    localStorage.setItem('solid_studio_provider', provider);
  }, [provider]);
  useEffect(() => {
    localStorage.setItem('solid_studio_output', output);
  }, [output]);
  useEffect(() => {
    localStorage.setItem('solid_studio_theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('solid_studio_active_tab', activeTab);
  }, [activeTab]);
  useEffect(() => {
    localStorage.setItem('solid_studio_engine', engine);
  }, [engine]);
  useEffect(() => {
    localStorage.setItem('solid_studio_density', String(density));
  }, [density]);
  useEffect(() => {
    localStorage.setItem('solid_studio_output_format', outputFormat);
  }, [outputFormat]);
  useEffect(() => {
    localStorage.setItem('solid_studio_font_size', String(fontSizeRem));
  }, [fontSizeRem]);
  useEffect(() => {
    localStorage.setItem('solid_studio_line_height', String(lineHeight));
  }, [lineHeight]);
  useEffect(() => {
    localStorage.setItem('solid_studio_text_align', textAlign);
  }, [textAlign]);
  useEffect(() => {
    localStorage.setItem('solid_studio_paper_mode', String(paperMode));
  }, [paperMode]);
  useEffect(() => {
    localStorage.setItem('solid_studio_is_vertical', String(isVertical));
  }, [isVertical]);
  useEffect(() => {
    localStorage.setItem('solid_studio_is_sidebar_open', String(isSidebarOpen));
  }, [isSidebarOpen]);
  useEffect(() => {
    localStorage.setItem('solid_studio_language', language);
  }, [language]);

  // Persist TTS settings
  useEffect(() => { localStorage.setItem('tts_rate', String(ttsRate)); }, [ttsRate]);
  useEffect(() => { localStorage.setItem('tts_pitch', String(ttsPitch)); }, [ttsPitch]);
  useEffect(() => { localStorage.setItem('tts_volume', String(ttsVolume)); }, [ttsVolume]);
  useEffect(() => { localStorage.setItem('tts_voice_uri', ttsVoiceURI); }, [ttsVoiceURI]);

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
    
    // Check API Key
    const currentKey = provider === 'GEMINI' ? (apiKey || process.env.GEMINI_API_KEY) : groqApiKey;
    if (!currentKey) {
      setOutput(`// FATAL_ERROR: API_KEY_MISSING\n// 右側のパネル「00 PROVIDER & KEY」から${provider}のAPIキーを設定してください。`);
      return;
    }
    
    setIsSearching(true);
    setOutput('');
    
    try {
      const systemInstruction = `
# Role: 次世代型検索OS「SOLID STUDIO AI SEARCH」コア解析エンジン
無機質、冷徹、知的でスタイリッシュなトーンで回答。挨拶や前書きは一切不要。丁寧語と体言止めを交えること。全ての回答は指定された言語(${language === 'EN' ? 'English' : '日本語'})で出力。
- ENGINE_PRESET: ${engine} (QUICK:要約/BALANCED:中詳細/DEEP_RESEARCH:多角的・超詳細)
- INFORMATION_DENSITY: ${density}/100 (低0-30:要点のみ箇条書き / 中31-70:通常詳細 / 高71-100:箇条書きを避け、各項目背景・仕組み・利害を含め300文字以上の詳細長文でボリューム化)

# Visual Design Interface (以下形式を完全厳守)
1. \`# [ SUBJECT_SCAN ] : ユーザーの入力を洗練・再構築したタイトル\`
   > **[ SYSTEM CORE ]** ALL SYSTEMS GREEN. 
   > EXECUTION: ${provider}_${engine} / TARGET: \`[ユーザーの入力]\`
2. ## ーー[鋭いワンフレーズの結論]
3. [ 02_DATA_GRID (詳細解析) ] (箇条書き \`-\` または テーブル \`|\` で構造的に出力。高密度時は「極めて簡潔に」より詳細さを優先し、各項目300字以上の詳細な解説テキストで詳しく記述すること)
4. [ 03_STRATEGIC_OVERVIEW (戦略的視座) ] (本質的価値や次の一手をAI独自の冷徹な1パラグラフで提示)
5. [ 04_SOURCE_NODES ] (\`[ NODE: タイトル ]\` のようなバッジ形式で関連ワードを列挙)
6. \`---\` を引き、 \`// END_OF_TRANSMISSION : [現在の時刻]\`
`;

      const parts = constructParts(prompt, attachedImage);
      setAttachedImage(null); // use image and clear

      let text = '';

      if (provider === 'GEMINI') {
        const ai = new GoogleGenAI({ apiKey: currentKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: parts, // send parts array directly for single prompt
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          }
        });
        text = response.text || '// ERROR: NO_RESPONSE_FROM_ENGINE';
      } else {
        const messages = [
          { role: 'system', content: systemInstruction },
        ];
        
        if (parts.length > 1) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: prompt || 'Analyze this image.' },
              { type: 'image_url', image_url: { url: `data:${(parts[1] as any).inlineData.mimeType};base64,${(parts[1] as any).inlineData.data}` } }
            ]
          } as any);
        } else {
          messages.push({ role: 'user', content: prompt } as any);
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentKey}`
          },
          body: JSON.stringify({
            model: parts.length > 1 ? 'llama-3.2-90b-vision-preview' : 'llama-3.3-70b-versatile',
            messages: messages,
            max_tokens: density > 70 ? 2560 : density > 30 ? 1024 : 512,
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Groq API Error: ${response.status}`);
        }

        const data = await response.json();
        text = data.choices?.[0]?.message?.content || '// ERROR: NO_RESPONSE_FROM_ENGINE';
      }
      
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
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('Rate limit')) {
        errMsg = '// FATAL_ERROR: QUOTA_EXCEEDED\\n// APIの利用制限（レートリミットまたはクォータ）に達しました。しばらく待ってから再度お試しください。\\n// ' + (error?.message || '');
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
    setTimeout(() => setCopyStatus(language === 'EN' ? 'COPY' : '結果をコピー (COPY)'), 2000);
  };

  const [saveStatus, setSaveStatus] = useState(language === 'EN' ? 'EXPORT' : 'エクスポート (EXPORT)');
  const [driveDirName, setDriveDirName] = useState(language === 'EN' ? 'Not Set' : '未設定');
  const isIframe = window.self !== window.top;

  // Load handle name on mount
  useEffect(() => {
    if (isIframe) {
      setDriveDirName(language === 'EN' ? 'Browser DL Folder (iframe limit)' : 'ブラウザのDLフォルダ (iframe制限)');
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
    
    // Extract title from output: # [ SUBJECT_SCAN ] : Title
    let title = prompt ? prompt.trim().substring(0, 30) : 'SEARCH';
    const firstLine = output.split('\n')[0];
    if (firstLine.includes('[ SUBJECT_SCAN ] : ')) {
      const extractedTitle = firstLine.split('[ SUBJECT_SCAN ] : ')[1].trim();
      if (extractedTitle) title = extractedTitle.substring(0, 50); // Limit length for filename
    }

    title = title.replace(/[\\/:*?"<>|]/g, '_');
    filename = `${datePrefix}_${title}.txt`;

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
      setTimeout(() => setSaveStatus(language === 'EN' ? 'EXPORT' : 'エクスポート (EXPORT)'), 2000);
    };

    if (isIframe) {
      fallbackDownload();
      return;
    }

    try {
      let handle = await gaiIdbGet(GAI_CLOUD_DIR_KEY) as any;
      
      if (!handle) {
        if (!('showDirectoryPicker' in window)) {
          alert(language === 'EN' ? 'Your browser does not support the File System Access API.' : 'お使いのブラウザはFile System Access APIに対応していません。');
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
        alert(language === 'EN' ? 'Folder access was not granted. Resetting configuration.' : 'フォルダへのアクセスが許可されませんでした。設定をリセットします。');
        await gaiIdbPut(GAI_CLOUD_DIR_KEY, null);
        setDriveDirName(language === 'EN' ? 'Not Set' : '未設定');
        return;
      }

      const fileHandle = await handle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      setSaveStatus('SAVED!');
      setTimeout(() => setSaveStatus(language === 'EN' ? 'EXPORT' : 'エクスポート (EXPORT)'), 2000);

    } catch (err: any) {
      console.error(err);
      if (err.name !== 'AbortError') {
        alert(language === 'EN' ? 'Save Error: ' + err.message + '\n\n* Saving is restricted in the AI Studio preview (iframe). Please try opening in a new tab using the icon in the top right.' : '保存エラー: ' + err.message + '\n\n※AI Studioのプレビュー画面(iframe)では制限により保存できません。右上の「Open in new tab」アイコンから全画面で開いてお試しください。');
      }
    }
  };

  const handleResetDrive = async () => {
    await gaiIdbPut(GAI_CLOUD_DIR_KEY, null);
    setDriveDirName(language === 'EN' ? 'Not Set' : '未設定');
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
            setTimeout(() => setImportStatus(language === 'EN' ? 'IMPORT' : 'インポート (IMPORT)'), 2000);
        } catch (err) {
            setImportStatus('ERROR!');
            setTimeout(() => setImportStatus(language === 'EN' ? 'IMPORT' : 'インポート (IMPORT)'), 2000);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-screen text-[11px] sm:text-xs tracking-widest uppercase selection:bg-[var(--border-color-highlight)] overflow-hidden">
      
      {/* HEADER */}
      <header className="h-14 border-b border-[var(--border-color)] bg-[var(--bg-color-panel)] flex items-center justify-between pl-8 sm:pl-12 pr-6 sm:pr-8 shrink-0 transition-colors duration-300 relative z-20">
        <div className="flex items-center gap-4 sm:gap-8 w-full">
          <div className={`flex items-center gap-2 font-extrabold text-xs sm:text-sm tracking-[0.2em] shrink-0 ${theme === 'LIGHT' ? 'text-black' : 'text-white'}`}>
            <span className={theme === 'LIGHT' ? 'text-black/50' : 'text-white/50'}>{'>_'}</span> SOLID STUDIO AI SEARCH
          </div>
          
          <div className="flex items-center gap-2 ml-auto flex-1 max-w-2xl relative">
            <div className="flex items-center bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-3 py-1.5 w-full text-[var(--text-color-dim)] focus-within:border-[var(--text-color-dim)] transition-colors relative z-30">
              <Zap size={12} className="mr-2 text-[var(--accent-color)] shrink-0" />
              <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={language === 'EN' ? "Enter search keyword / question..." : "検索キーワード / 質問を入力..."}
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
              className="bg-[var(--bg-color-base)] border border-[var(--border-color-highlight)] hover:bg-[var(--border-color)] text-[var(--text-color-highlight)] hover:text-[var(--active-text-color,var(--text-color-highlight))] px-4 py-1.5 transition-colors disabled:opacity-50 shrink-0 font-bold"
            >
              {language === 'EN' ? 'RUN' : '実行'}
            </button>
            <button 
              onClick={() => imageInputRef.current?.click()}
              className="hidden sm:flex items-center gap-2 bg-[var(--bg-color-base)] border border-[var(--border-color)] hover:bg-[var(--border-color-highlight)] text-[var(--text-color-base)] px-4 py-1.5 transition-colors shrink-0 rounded-sm"
            >
              <Upload size={12} /> {language === 'EN' ? 'IMAGE' : '画像読込'}
            </button>
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />

            <div className="hidden sm:flex border border-[var(--border-color)] bg-[var(--bg-color-base)] p-0.5 rounded-sm h-[30px] text-[10px] font-bold ml-2 shrink-0">
              <button 
                onClick={() => setLanguage('EN')}
                className={`px-3 h-full rounded-sm flex items-center justify-center transition-colors ${language === 'EN' ? 'bg-[var(--bg-color-panel)] text-[var(--text-color-highlight)]' : 'text-[var(--text-color-dim)] hover:text-[var(--text-color-highlight)]'}`}
              >
                EN
              </button>
              <button 
                onClick={() => setLanguage('JP')}
                className={`px-3 h-full rounded-sm flex items-center justify-center transition-colors ${language === 'JP' ? 'bg-[var(--bg-color-panel)] text-[var(--text-color-highlight)]' : 'text-[var(--text-color-dim)] hover:text-[var(--text-color-highlight)]'}`}
              >
                JP
              </button>
            </div>

            <button 
              onClick={toggleFullscreen}
              className="hidden sm:flex items-center justify-center border border-[var(--border-color)] bg-[var(--bg-color-base)] hover:bg-[var(--bg-color-panel)] text-[var(--text-color-dim)] hover:text-[var(--text-color-highlight)] w-[30px] h-[30px] rounded-sm transition-colors ml-1 shrink-0"
              title={language === 'EN' ? 'FULLSCREEN' : 'フルスクリーン (FULLSCREEN)'}
            >
              {isFullscreen ? <Shrink size={14} /> : <Expand size={14} />}
            </button>
          </div>
        </div>

        <div className="hidden md:flex flex-col items-end gap-1 text-[var(--text-color-base)] font-bold shrink-0 ml-4 w-32">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isSearching ? 'bg-yellow-500 animate-pulse' : 'bg-[var(--accent-color)] animate-pulse'}`}></div>
            <span className={isSearching ? 'text-yellow-500' : 'text-[var(--accent-color)]'}>
              {isSearching ? (language === 'EN' ? 'PROCESSING...' : '処理中...') : 'STABLE'}
            </span>
          </div>
          <div className="text-[8px] text-[var(--text-color-dim)]">VER_5.2.0_{language}</div>
        </div>
      </header>

      {/* MAIN CONTENT DIVIDER */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANEL */}
        <aside className={`${isSidebarOpen ? 'w-[260px] border-r' : 'w-0 overflow-hidden border-none'} border-[var(--border-color)] bg-[var(--bg-color-panel)] flex flex-col shrink-0 transition-all duration-300 md:relative absolute z-10 h-full`}>
          <div className="p-3 flex-1 overflow-y-auto w-[260px] custom-scrollbar">
            
            <div className="mb-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-2 text-[11px]">
                  <span>{language === 'EN' ? '01 DENSITY' : '01 密度 (DENSITY)'}</span>
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
              <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[11px]">{language === 'EN' ? '02 ENGINE' : '02 エンジン (ENGINE)'}</div>
              <div className="flex flex-col gap-1">
                {(['BALANCED', 'DEEP_RESEARCH', 'QUICK'] as EngineType[]).map((e) => (
                  <button 
                    key={e}
                    onClick={() => setEngine(e)}
                    className={`py-1 px-2 text-left font-bold border transition-colors rounded-sm text-[11px] ${
                      engine === e 
                        ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--active-text-color,var(--text-color-highlight))]' 
                        : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-base))]'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm mb-4 transition-colors duration-300">
              <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[11px]">{language === 'EN' ? '03 FORMAT' : '03 形式 (FORMAT)'}</div>
              <div className="flex flex-col gap-1">
                {(['STANDARD', 'RAW_JSON', 'MINIMAL'] as OutputFormat[]).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setOutputFormat(f)}
                    className={`py-1 px-2 text-left font-bold border transition-colors rounded-sm text-[11px] ${
                      outputFormat === f 
                        ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--active-text-color,var(--text-color-highlight))]' 
                        : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-base))]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* TTS PANEL - full controls in sidebar */}
            <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm mt-4 transition-colors duration-300">
              <div className="text-[var(--text-color-dim)] font-bold mb-3 text-[11px] flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${ ttsIsPlaying ? 'bg-[var(--accent-color)] animate-pulse' : 'bg-[var(--border-color-highlight)]'}`}></span>
                <span>{language === 'EN' ? '09 VOICE (TTS)' : '09 音声 (TTS)'}</span>
              </div>

              {/* Play / Stop */}
              <div className="flex gap-1.5 mb-3">
                <button onClick={ttsPlayFromTop} disabled={!output || ttsIsPlaying} title={language === "EN" ? "Read from top" : "先頭から読み上げ"}
                  className="flex-1 py-1 px-1 text-center font-bold border transition-colors rounded-sm text-[11px] bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-highlight))] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                  <span>▶</span><span>{language === 'EN' ? 'PLAY' : '再生'}</span>
                </button>
                <button onClick={ttsStop} disabled={!ttsIsPlaying} title={language === "EN" ? "Stop" : "停止"}
                  className="flex-1 py-1 px-1 text-center font-bold border transition-colors rounded-sm text-[11px] bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-highlight))] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                  <span>⏹</span><span>{language === 'EN' ? 'STOP' : '停止'}</span>
                </button>
              </div>

              {/* Speed */}
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-1 text-[11px]">
                  <span>{language === 'EN' ? 'SPEED' : '速度 (SPEED)'}</span>
                  <span className="text-[var(--text-color-highlight)]">{ttsRate.toFixed(1)}x</span>
                </div>
                <input type="range" value={ttsRate} onChange={(e) => setTtsRate(Number(e.target.value))}
                  min={0.5} max={4.0} step={0.1}
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" />
              </div>

              {/* Volume */}
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-1 text-[11px]">
                  <span>{language === 'EN' ? 'VOLUME' : '音量 (VOL)'}</span>
                  <span className="text-[var(--text-color-highlight)]">{Math.round(ttsVolume * 100)}%</span>
                </div>
                <input type="range" value={ttsVolume} onChange={(e) => setTtsVolume(Number(e.target.value))}
                  min={0.0} max={1.0} step={0.05}
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" />
              </div>

              {/* Pitch */}
              <div className="mb-2">
                <div className="flex justify-between text-[var(--text-color-dim)] font-bold mb-1 text-[11px]">
                  <span>{language === 'EN' ? 'PITCH' : '音程 (PITCH)'}</span>
                  <span className="text-[var(--text-color-highlight)]">{ttsPitch.toFixed(1)}</span>
                </div>
                <input type="range" value={ttsPitch} onChange={(e) => setTtsPitch(Number(e.target.value))}
                  min={0.5} max={2.0} step={0.1}
                  className="w-full h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" />
              </div>

              {/* Voice */}
              <div>
                <div className="text-[var(--text-color-dim)] font-bold mb-1 text-[11px]">{language === 'EN' ? 'VOICE' : 'ボイス (VOICE)'}</div>
                <select value={ttsVoiceURI} onChange={(e) => setTtsVoiceURI(e.target.value)}
                  className="w-full bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-1.5 py-1 text-[var(--text-color-highlight)] text-[11px] outline-none focus:border-[var(--text-color-dim)] normal-case tracking-normal cursor-pointer">
                  {ttsVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>

              {output && (
                <div className="mt-2 text-[8px] text-[var(--text-color-dim)] text-center leading-tight">
                  {language === 'EN' ? 'Click paragraph to play' : '※段落をクリックで'}
                  <br/>{language === 'EN' ? '' : 'その箇所から読み上げ'}
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
                    {isSidebarOpen ? <Shrink size={14} /> : <Expand size={14} />}
                 </button>
                 <button 
                    onClick={() => setActiveTab('SEARCH_BUFFER')}
                    className={`flex items-center justify-center gap-2 h-full border-b-2 px-2 sm:px-4 transition-colors ${activeTab === 'SEARCH_BUFFER' ? 'border-[var(--text-color-highlight)] text-[var(--text-color-highlight)] bg-[var(--bg-color-card)]' : 'border-transparent text-[var(--text-color-dim)] hover:text-[var(--text-color-base)]'}`}
                  >
                    <TerminalSquare size={14} /> <span className="mt-1">{language === 'EN' ? 'SEARCH BUFFER' : '検索バッファ'} <span className="hidden sm:inline">{language === 'EN' ? '' : '(SEARCH)'}</span></span>
                 </button>
                 <button 
                    onClick={() => { setEditContent(output); setActiveTab('EDIT_BUFFER'); }}
                    className={`flex items-center justify-center gap-2 h-full border-b-2 px-2 sm:px-4 transition-colors ${activeTab === 'EDIT_BUFFER' ? 'border-[var(--text-color-highlight)] text-[var(--text-color-highlight)] bg-[var(--bg-color-card)]' : 'border-transparent text-[var(--text-color-dim)] hover:text-[var(--text-color-base)]'}`}
                  >
                    <MessageSquare size={14} /> <span className="mt-1">{language === 'EN' ? 'EDIT CONTENT' : '検索内容の編集'} <span className="hidden sm:inline">{language === 'EN' ? '' : '(EDIT)'}</span></span>
                 </button>
              </div>

              {/* TEXT FORMATTING TOOLBAR */}
              <div className="flex items-center gap-3 shrink-0 h-full text-[var(--text-color-dim)] pr-2 hidden md:flex">
                 
                 {/* Display Modes */}
                 <div className="flex items-center gap-1 border border-[var(--border-color)] bg-[var(--bg-color-base)] p-0.5 rounded-sm text-[11px] font-bold">
                    <button onClick={() => setPaperMode(!paperMode)} className={`px-2 py-1 rounded-sm transition-colors ${paperMode ? 'bg-[var(--border-color)] text-[var(--active-text-color,var(--text-color-highlight))]' : 'hover:bg-[var(--bg-color-card)]'}`} title={language === "EN" ? "Toggle Paper Mode" : "ペーパーモード切替"}>
                       PAPER
                    </button>
                    <div className="w-px h-3 bg-[var(--border-color)] mx-1"></div>
                    <button onClick={() => setIsVertical(false)} className={`px-2 py-1 rounded-sm transition-colors ${!isVertical ? 'bg-[var(--border-color)] text-[var(--active-text-color,var(--text-color-highlight))]' : 'hover:bg-[var(--bg-color-card)]'}`} title={language === "EN" ? "Horizontal" : "横組"}>
                       {language === 'EN' ? 'HORZ' : '横組'}
                    </button>
                    <button onClick={() => setIsVertical(true)} className={`px-2 py-1 rounded-sm transition-colors ${isVertical ? 'bg-[var(--border-color)] text-[var(--active-text-color,var(--text-color-highlight))]' : 'hover:bg-[var(--bg-color-card)]'}`} title={language === "EN" ? "Vertical" : "縦組"}>
                       {language === 'EN' ? 'VERT' : '縦組'}
                    </button>
                 </div>

                 {/* Text Align */}
                 <div className="flex items-center gap-1 border border-[var(--border-color)] bg-[var(--bg-color-base)] p-0.5 rounded-sm">
                    <button onClick={() => setTextAlign('left')} className={`p-1 rounded-sm transition-colors ${textAlign === 'left' ? 'bg-[var(--border-color)] text-[var(--active-text-color,var(--text-color-highlight))]' : 'hover:bg-[var(--bg-color-card)]'}`} title={language === "EN" ? "Align Left" : "左揃え"}>
                       <AlignLeft size={12} />
                    </button>
                    <button onClick={() => setTextAlign('center')} className={`p-1 rounded-sm transition-colors ${textAlign === 'center' ? 'bg-[var(--border-color)] text-[var(--active-text-color,var(--text-color-highlight))]' : 'hover:bg-[var(--bg-color-card)]'}`} title={language === "EN" ? "Align Center" : "中央揃え"}>
                       <AlignCenter size={12} />
                    </button>
                    <button onClick={() => setTextAlign('right')} className={`p-1 rounded-sm transition-colors ${textAlign === 'right' ? 'bg-[var(--border-color)] text-[var(--active-text-color,var(--text-color-highlight))]' : 'hover:bg-[var(--bg-color-card)]'}`} title={language === "EN" ? "Align Right" : "右揃え"}>
                       <AlignRight size={12} />
                    </button>
                 </div>

                 {/* Line Height */}
                 <div className="flex items-center gap-1.5 border border-[var(--border-color)] bg-[var(--bg-color-base)] px-2 py-0.5 rounded-sm" title={language === "EN" ? "Line Height" : "行間"}>
                    <ArrowDownUp size={12} className="shrink-0" />
                    <input 
                      type="range" 
                      value={lineHeight}
                      onChange={(e) => setLineHeight(Number(e.target.value))}
                      min={1.0} 
                      max={2.5}
                      step={0.1} 
                      className="w-16 h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" 
                    />
                 </div>

                 {/* Font Size */}
                 <div className="flex items-center gap-1.5 border border-[var(--border-color)] bg-[var(--bg-color-base)] px-2 py-0.5 rounded-sm" title={language === 'EN' ? 'Font Size' : '文字サイズ'}>
                    <Type size={12} className="shrink-0" />
                    <input 
                      type="range" 
                      value={fontSizeRem}
                      onChange={(e) => setFontSizeRem(Number(e.target.value))}
                      min={0.6} 
                      max={2.0}
                      step={0.05} 
                      className="w-16 h-1 bg-[var(--border-color)] appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer" 
                    />
                 </div>
              </div>
           </div>

           {/* CANVAS */}
           <div className="flex-1 relative bg-dots overflow-hidden w-full h-full">
              
              {/* SEARCH BUFFER VIEW */}
              <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-300 ${activeTab === 'SEARCH_BUFFER' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
                  {!output && !isSearching && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--border-color-highlight)] p-4 text-center">
                       <TerminalSquare size={48} className="mb-4 opacity-50" />
                       <span className="font-bold tracking-[0.3em] italic">{language === 'EN' ? 'Please run a search' : '検索を実行してください'}<br/><span className="text-[8px] opacity-70">AWAITING_INPUT</span></span>
                    </div>
                  )}

                  {isSearching && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--accent-color)] bg-[var(--bg-color-base)]/80 backdrop-blur-sm z-10">
                       <Loader2 size={48} className="mb-4 animate-spin opacity-80" />
                       <span className="font-bold tracking-[0.3em] animate-pulse">{language === 'EN' ? 'Analyzing information...' : '情報を解析中...'}<br/><span className="text-[8px] opacity-70">QUERYING_GLOBAL_NETWORK</span></span>
                    </div>
                  )}

                  {output && !isSearching && (
                    <div className={`p-4 sm:p-8 w-full max-w-none mx-auto ${isVertical ? 'h-[calc(100vh-140px)]' : 'min-h-full pb-20'}`}>
                      <div 
                        ref={scrollContainerRef}
                        className={`border border-[var(--border-color)] bg-[var(--bg-color-card)] p-6 sm:p-10 shadow-2xl rounded-sm transition-colors duration-300 w-full overflow-auto ${paperMode ? 'paper-mode' : ''}`}
                        style={{
                           height: isVertical ? '100%' : 'auto',
                        }}
                        dir={isVertical ? 'rtl' : 'ltr'}
                      >
                        <div
                          className={`markdown-body break-words normal-case ${isVertical ? 'h-full min-w-full' : ''}`}
                          style={{ 
                            fontSize: `${fontSizeRem}rem`,
                            lineHeight: lineHeight,
                            textAlign: textAlign,
                            writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                          }}
                          dir="ltr"
                          onClick={(e) => {
                            // Toggle: if playing → stop; if stopped → play from clicked paragraph
                            if (ttsIsPlaying) {
                              ttsStop();
                              return;
                            }
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
                      ref={editScrollContainerRef}
                      className="flex-1 w-full min-h-0 bg-transparent p-4 sm:p-8 pb-4 font-mono text-[var(--text-color-highlight)] outline-none resize-none custom-scrollbar"
                      style={{ 
                        fontSize: `${fontSizeRem}rem`,
                        writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                        lineHeight: lineHeight,
                        textAlign: textAlign,
                      }}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="// NO_DATA_AVAILABLE"
                    />
                    <div className="p-4 sm:p-8 pt-4 shrink-0 bg-[var(--bg-color-card)] flex justify-end gap-2 sm:gap-4 border-t border-[var(--border-color)]">
                      <button 
                        onClick={() => { setEditContent(output); setActiveTab('SEARCH_BUFFER'); }}
                        className="text-[var(--text-color-dim)] hover:text-[var(--text-color-highlight)] transition-colors px-2 sm:px-4 py-2 font-bold text-[11px] sm:text-xs"
                      >
                        {language === 'EN' ? 'CANCEL' : 'キャンセル (CANCEL)'}
                      </button>
                      <button 
                        onClick={() => { setOutput(editContent); setActiveTab('SEARCH_BUFFER'); }}
                        className="bg-[var(--accent-color)] text-[#000000] px-4 sm:px-6 py-2 rounded-sm font-bold transition-all hover:brightness-110 text-[11px] sm:text-xs tracking-wider uppercase shadow-lg border border-transparent hover:border-[#ffffff55]"
                      >
                        {language === 'EN' ? 'SAVE EDITS' : '編集内容の保存 (SAVE)'}
                      </button>
                    </div>
                 </div>
              </div>

              {/* OVERLAY CONTROLS */}
              <div className={`absolute bottom-6 right-6 flex flex-col gap-2 z-20 transition-transform duration-300`}>
                 {activeTab === 'SEARCH_BUFFER' && output && (
                   <>
                     <button onClick={handleSaveAs} title={language === "EN" ? "Download" : "ダウンロード"} className="w-10 h-10 bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm flex items-center justify-center text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-highlight))] transition-colors shadow-lg">
                        <Download size={14} />
                     </button>
                     <button onClick={() => setOutput('')} title={language === "EN" ? "Clear Output" : "出力をクリア"} className="w-10 h-10 bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm flex items-center justify-center text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-highlight))] transition-colors shadow-lg">
                        <RotateCcw size={14} />
                     </button>
                   </>
                 )}
              </div>
           </div>
        </main>

        {/* RIGHT PANEL - hidden on small screens unless toggled, let's keep it visible on lg */}
        <aside className="w-[260px] border-l border-[var(--border-color)] bg-[var(--bg-color-panel)] shrink-0 transition-colors duration-300 hidden lg:flex flex-col z-20">
          <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
             <div className="mb-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
               <div className="flex items-center justify-between mb-2">
                 <div className="text-[var(--text-color-dim)] font-bold text-[11px]">{language === 'EN' ? '00 PROVIDER & KEY' : '00 プロバイダ & APIキー'}</div>
               </div>
               <div className="flex gap-1 mb-2">
                 {(['GEMINI', 'GROQ'] as Provider[]).map((p) => (
                   <button
                     key={p}
                     onClick={() => setProvider(p)}
                     className={`flex-1 py-1 text-center font-bold border transition-colors rounded-sm text-[10px] ${
                       provider === p
                         ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--active-text-color,var(--text-color-highlight))]'
                         : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-base))]'
                     }`}
                   >
                     {p}
                   </button>
                 ))}
               </div>
               {provider === 'GEMINI' ? (
                 <input 
                   type="text"
                   value={apiKey}
                   onChange={(e) => setApiKey(e.target.value)}
                   placeholder="Gemini API Key (AIzaSy...)"
                   autoComplete="off"
                   spellCheck="false"
                   data-1p-ignore
                   style={{ WebkitTextSecurity: 'disc' } as any}
                   className="w-full bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-2 py-1 text-[var(--text-color-highlight)] text-[11px] outline-none focus:border-[var(--text-color-dim)]"
                 />
               ) : (
                 <input 
                   type="text"
                   value={groqApiKey}
                   onChange={(e) => setGroqApiKey(e.target.value)}
                   placeholder="Groq API Key (gsk_...)"
                   autoComplete="off"
                   spellCheck="false"
                   data-1p-ignore
                   style={{ WebkitTextSecurity: 'disc' } as any}
                   className="w-full bg-[var(--bg-color-base)] border border-[var(--border-color)] rounded-sm px-2 py-1 text-[var(--text-color-highlight)] text-[11px] outline-none focus:border-[var(--text-color-dim)]"
                 />
               )}
             </div>

             <div className="mb-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
               <div className="text-[var(--text-color-dim)] font-bold mb-3 text-[11px]">{language === 'EN' ? '06 THEMES' : '06 テーマ (THEMES)'}</div>
               <div className="grid grid-cols-2 gap-1.5">
                 {(['DARK', 'BLACK', 'MID', 'BLUE', 'GREEN', 'RED', 'LIGHT'] as Theme[]).map((t) => (
                   <button 
                     key={t}
                     onClick={() => setTheme(t)}
                     className={`py-1 px-1 text-center font-bold border transition-colors rounded-sm text-[11px] ${
                       theme === t 
                         ? 'bg-[var(--border-color)] border-[var(--border-color-highlight)] text-[var(--active-text-color,var(--text-color-highlight))]' 
                         : 'bg-transparent border-[var(--border-color)] text-[var(--text-color-dim)] hover:bg-[var(--border-color)] hover:text-[var(--active-text-color,var(--text-color-base))]'
                     }`}
                   >
                     {t}
                   </button>
                 ))}
               </div>
             </div>

             <div className="border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300 flex-1 flex flex-col h-1/2">
               <div className="text-[var(--text-color-dim)] font-bold mb-3 text-[11px] shrink-0">{language === 'EN' ? '07 HISTORY' : '07 履歴 (HISTORY)'}</div>
               <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
                 {history.length === 0 ? (
                   <div className="py-8 text-center border border-dashed border-[var(--border-color)] text-[var(--text-color-dim)] text-[8px]">
                     EMPTY_RECORD
                   </div>
                 ) : (
                   history.map((item) => (
                      <div 
                        key={item.id}
                        className="border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] transition-colors group rounded-sm flex items-stretch"
                      >
                        <button
                          onClick={() => loadHistory(item)}
                          className="flex-1 p-3 text-left overflow-hidden"
                        >
                          <div className="text-[var(--accent-color)] mb-1 text-[8px]">{item.timestamp}</div>
                          <div className="text-[var(--text-color-base)] group-hover:text-[var(--text-color-highlight)] truncate text-xs normal-case font-sans">{item.keyword}</div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setHistory(prev => prev.filter(h => h.id !== item.id)); }}
                          className="px-3.5 text-[var(--text-color-dim)] hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center border-l border-transparent group-hover:border-[var(--border-color)]"
                          title={language === 'EN' ? "Delete" : "削除"}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                 )}
                 {history.length > 0 && (
                    <button onClick={() => setHistory([])} className="mt-2 text-xs text-[var(--text-color-dim)] hover:text-[var(--text-color-base)] p-2 border border-transparent hover:border-[var(--border-color)] rounded-sm transition-colors">{language === 'EN' ? 'CLEAR HISTORY' : '履歴をクリア'}</button>
                 )}
               </div>
             </div>
             
             <div className="mt-4 border border-[var(--border-color)] p-2.5 bg-[var(--bg-color-card)] rounded-sm transition-colors duration-300">
               <div className="text-[var(--text-color-dim)] font-bold mb-2 text-[11px] flex justify-between items-center">
                 <span>{language === 'EN' ? '08 DRIVE (SAVE LOCATION)' : '08 DRIVE 保存先'}</span>
                 {driveDirName !== '未設定' && (
                   <button onClick={handleResetDrive} className="text-[var(--accent-color)] hover:text-[#ff4444] hover:underline cursor-pointer">{language === 'EN' ? 'CHANGE (CLEAR)' : '変更(CLEAR)'}</button>
                 )}
               </div>
               <div className="text-[11px] text-[var(--text-color-base)] truncate bg-[var(--bg-color-base)] border border-[var(--border-color)] p-2 rounded-sm text-center">
                 {driveDirName}
               </div>
             </div>
          </div>
        </aside>

      </div>

      {/* FOOTER */}
      <footer className="h-10 border-t border-[var(--border-color)] bg-[var(--bg-color-base)] flex items-stretch shrink-0 text-[var(--text-color-dim)] font-bold divide-x divide-[var(--border-color)] transition-colors duration-300 overflow-x-auto whitespace-nowrap relative z-20">
         <button onClick={handleCopy} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[11px] flex items-center justify-center"><span className="mt-1">{copyStatus === 'COPIED!' ? 'COPIED!' : (language === 'EN' ? 'COPY' : '結果をコピー (COPY)')}</span></button>
         <button onClick={() => setOutput('')} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[11px] flex items-center justify-center"><span className="mt-1">{language === 'EN' ? 'CLEAR' : 'クリア (CLEAR)'}</span></button>
         <button onClick={() => importFileRef.current?.click()} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[11px] flex items-center justify-center"><span className="mt-1">{importStatus === 'IMPORTED!' ? 'IMPORTED!' : importStatus === 'ERROR!' ? 'ERROR!' : (language === 'EN' ? 'IMPORT' : 'インポート (IMPORT)')}</span></button>
         <input type="file" ref={importFileRef} accept=".json" className="hidden" onChange={handleImport} />
         <button onClick={handleSaveAs} className="px-6 flex-1 h-full hover:bg-[var(--bg-color-panel)] hover:text-[var(--text-color-highlight)] transition-colors text-[11px] flex items-center justify-center"><span className="mt-1">{saveStatus === 'SAVED!' ? 'SAVED!' : (language === 'EN' ? 'EXPORT' : 'エクスポート (EXPORT)')}</span></button>
      </footer>
    </div>
  );
}
