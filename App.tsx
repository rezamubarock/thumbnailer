import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DEFAULT_ADJUSTMENTS, AdjustmentSettings, TextOverlay } from './types';
import { editImageWithGemini } from './services/geminiService';
import { Loader, Download, Sparkles, YoutubeIcon, RefreshCw, Wand2 } from './components/Icons';

// --- Utility Functions ---

const getYouTubeID = (url: string): string | null => {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
};

// --- Components ---

interface RangeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  unit?: string;
  colorClass?: string;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ label, value, min, max, onChange, unit = '', colorClass = 'accent-green-500' }) => (
  <div className="mb-4 font-mono">
    <div className="flex justify-between mb-1 text-green-500/80">
      <span className="text-xs uppercase tracking-wider">[ {label} ]</span>
      <span className="text-xs">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`w-full h-1 bg-gray-900 rounded-none appearance-none cursor-pointer ${colorClass} hover:accent-green-400 border border-green-900`}
    />
  </div>
);

const App: React.FC = () => {
  // State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentSettings>(DEFAULT_ADJUSTMENTS);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [newText, setNewText] = useState('');
  
  // Text Editor State
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null); 

  // --- Handlers ---

  const handleFetchYouTube = async () => {
    const id = getYouTubeID(youtubeUrl);
    if (!id) {
      setErrorMsg("INVALID TARGET URL");
      return;
    }
    setErrorMsg(null);
    setIsProcessing(true);

    const url = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Target Access Denied");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      setCurrentImage(objectUrl);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setTextOverlays([]);
      setSelectedTextId(null);
    } catch (err) {
      console.error(err);
      setErrorMsg("CONNECTION FAILED (Check URL or network)");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setTextOverlays([]);
    setSelectedTextId(null);
  };

  const handleAdjustmentChange = (key: keyof AdjustmentSettings, value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
  };

  const handleAddText = () => {
    if (!newText.trim()) return;
    const newId = Date.now().toString();
    const newOverlay: TextOverlay = {
      id: newId,
      text: newText,
      x: 50, 
      y: 50, 
      color: '#00ff00',
      fontSize: 48,
      fontFamily: 'Share Tech Mono'
    };
    setTextOverlays([...textOverlays, newOverlay]);
    setNewText('');
    setSelectedTextId(newId); // Auto select new text
  };

  const updateSelectedText = (key: keyof TextOverlay, value: any) => {
    if (!selectedTextId) return;
    setTextOverlays(prev => prev.map(t => 
      t.id === selectedTextId ? { ...t, [key]: value } : t
    ));
  };

  // --- Canvas Interaction (Drag n Drop) ---

  const getCanvasCoordinates = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!currentImage || !canvasRef.current) return;
    const { x, y } = getCanvasCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Check collision with text
    // Note: This is an approximation. 
    for (let i = textOverlays.length - 1; i >= 0; i--) {
      const overlay = textOverlays[i];
      // Re-calculate font settings to get accurate measure
      const fontSizePx = overlay.fontSize * (canvasRef.current.width / 1000);
      ctx.font = `bold ${fontSizePx}px "${overlay.fontFamily}"`;
      const metrics = ctx.measureText(overlay.text);
      const textWidth = metrics.width;
      const textHeight = fontSizePx; // Approx height

      const textX = (overlay.x / 100) * canvasRef.current.width;
      const textY = (overlay.y / 100) * canvasRef.current.height;

      // Centered text logic
      const left = textX - textWidth / 2;
      const right = textX + textWidth / 2;
      const top = textY - textHeight / 2;
      const bottom = textY + textHeight / 2;

      if (x >= left && x <= right && y >= top && y <= bottom) {
        setSelectedTextId(overlay.id);
        setIsDragging(true);
        // Calculate offset to prevent snapping to center
        setDragOffset({
          x: x - textX,
          y: y - textY
        });
        return;
      }
    }
    // Deselect if clicked empty space
    setSelectedTextId(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedTextId || !canvasRef.current) return;
    
    const { x, y } = getCanvasCoordinates(e);
    
    // Convert back to percentages
    const newX = ((x - dragOffset.x) / canvasRef.current.width) * 100;
    const newY = ((y - dragOffset.y) / canvasRef.current.height) * 100;

    setTextOverlays(prev => prev.map(t => 
      t.id === selectedTextId ? { ...t, x: newX, y: newY } : t
    ));
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };


  // --- Image Processing ---

  const drawToCanvas = useCallback((
    canvas: HTMLCanvasElement, 
    imgSrc: string, 
    adjs: AdjustmentSettings, 
    overlays: TextOverlay[],
    selectionId: string | null = null
  ): Promise<void> => {
    return new Promise((resolve) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve();

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Apply filters
        const filterString = `brightness(${adjs.brightness}%) contrast(${adjs.contrast}%) saturate(${adjs.saturation}%) grayscale(${adjs.grayscale}%) sepia(${adjs.sepia}%) blur(${adjs.blur}px)`;
        ctx.filter = filterString;
        
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none'; 

        // Draw Text
        overlays.forEach(overlay => {
          const fontSizePx = overlay.fontSize * (canvas.width / 1000);
          ctx.fillStyle = overlay.color;
          // Apply font family from overlay
          ctx.font = `bold ${fontSizePx}px "${overlay.fontFamily}", monospace`; 
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          ctx.shadowColor = 'rgba(0,0,0,1)';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 4;
          ctx.shadowOffsetY = 4;
          
          const xPos = (overlay.x / 100) * canvas.width;
          const yPos = (overlay.y / 100) * canvas.height;
          
          ctx.fillText(overlay.text, xPos, yPos);

          // Draw selection box if needed (Only on preview canvas, not hidden export one)
          if (selectionId === overlay.id && canvas === canvasRef.current) {
             const metrics = ctx.measureText(overlay.text);
             const width = metrics.width + 20;
             const height = fontSizePx + 20;
             ctx.strokeStyle = '#00ff00';
             ctx.lineWidth = 2;
             ctx.setLineDash([5, 5]);
             ctx.strokeRect(xPos - width/2, yPos - height/2, width, height);
             ctx.setLineDash([]);
          }
        });
        resolve();
      };
      img.src = imgSrc;
    });
  }, []);

  const handleDownload = async () => {
    if (!currentImage || !hiddenCanvasRef.current) return;
    setIsProcessing(true);
    // Draw without selection box
    await drawToCanvas(hiddenCanvasRef.current, currentImage, adjustments, textOverlays, null);
    
    const dataUrl = hiddenCanvasRef.current.toDataURL('image/jpeg', 0.9);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `azera-thumb-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsProcessing(false);
  };

  const handleGeminiEdit = async () => {
    if (!currentImage || !hiddenCanvasRef.current || !aiPrompt.trim()) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await drawToCanvas(hiddenCanvasRef.current, currentImage, adjustments, textOverlays, null);
      const dataUrl = hiddenCanvasRef.current.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const newImageBase64 = await editImageWithGemini(base64, 'image/png', aiPrompt);
      setCurrentImage(newImageBase64);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setTextOverlays([]);
      setAiPrompt(''); 
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "AI PROTOCOL FAILED");
    } finally {
      setIsProcessing(false);
    }
  };

  // Redraw loop
  useEffect(() => {
    if (currentImage && canvasRef.current) {
        drawToCanvas(canvasRef.current, currentImage, adjustments, textOverlays, selectedTextId);
    }
  }, [currentImage, adjustments, textOverlays, selectedTextId, drawToCanvas]);

  return (
    <div className="flex flex-col h-screen bg-black text-green-500 overflow-hidden font-mono selection:bg-green-900 selection:text-white">
      
      {/* Top Bar */}
      <header className="h-16 border-b border-green-900 bg-black flex items-center justify-between px-6 z-10 shrink-0 shadow-[0_0_15px_rgba(0,255,0,0.1)]">
        <div className="flex items-center gap-2">
          <div className="border border-green-500 p-1">
             <YoutubeIcon className="text-green-500 w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-green-500 drop-shadow-[0_0_5px_rgba(0,255,0,0.8)]">
            AZERA<span className="text-white">THUMBNAILER</span>
          </h1>
        </div>

        <div className="flex items-center gap-4 flex-1 max-w-2xl mx-8">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-green-700">
               $
            </div>
            <input
              type="text"
              placeholder="PASTE_TARGET_URL..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full bg-black border border-green-800 rounded-none py-2 pl-8 pr-4 focus:outline-none focus:border-green-500 focus:shadow-[0_0_10px_rgba(0,255,0,0.2)] text-green-400 placeholder-green-900 font-mono transition-all"
            />
          </div>
          <button
            onClick={handleFetchYouTube}
            disabled={isProcessing}
            className="bg-green-900/20 border border-green-600 hover:bg-green-500 hover:text-black text-green-500 px-6 py-2 uppercase tracking-widest font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? <Loader className="w-4 h-4" /> : 'EXECUTE'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
             onClick={handleDownload}
             disabled={!currentImage || isProcessing}
             className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-black px-4 py-2 font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-green-400"
          >
             <Download className="w-4 h-4" /> EXPORT
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative pb-12">
        
        {/* LEFT SIDEBAR: AI TOOLS */}
        <aside className="w-80 border-r border-green-900 bg-black flex flex-col p-6 shrink-0 overflow-y-auto">
          <div className="flex items-center gap-2 mb-6 text-green-400 border-b border-green-900 pb-2">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-bold tracking-widest uppercase text-xs">AI_CORE_MODULE</h2>
          </div>

          <div className="bg-green-900/5 p-4 border border-green-800 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-green-500"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-green-500"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-green-500"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-green-500"></div>
            
            <label className="block text-xs text-green-600 mb-2 uppercase">
              // Prompt_Input
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="> Initialize modification parameters..."
              className="w-full h-32 bg-black border border-green-800 p-3 text-sm focus:outline-none focus:border-green-500 text-green-300 resize-none mb-3 font-mono"
            />
            <button
              onClick={handleGeminiEdit}
              disabled={!currentImage || isProcessing || !aiPrompt}
              className="w-full py-3 bg-green-900/30 border border-green-600 hover:bg-green-500 hover:text-black font-bold text-sm text-green-500 flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase"
            >
               {isProcessing ? <Loader className="w-4 h-4" /> : <><Wand2 className="w-4 h-4" /> COMPILE_EDIT</>}
            </button>
            <p className="text-[10px] text-green-800 mt-2 text-center uppercase tracking-widest">
              Running Protocol: Gemini 2.5 Flash
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-900/20 border border-red-500 text-red-500 p-3 text-xs font-mono animate-pulse">
              [ERROR]: {errorMsg}
            </div>
          )}
        </aside>

        {/* CENTER: PREVIEW */}
        <main className="flex-1 bg-[#050505] relative flex items-center justify-center p-8 overflow-hidden">
            {/* Grid background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{ 
                     backgroundImage: 'linear-gradient(#00ff00 1px, transparent 1px), linear-gradient(90deg, #00ff00 1px, transparent 1px)', 
                     backgroundSize: '40px 40px' 
                 }} 
            />
            
            {currentImage ? (
                <div className="relative shadow-[0_0_30px_rgba(0,255,0,0.1)] border border-green-900/50">
                   <canvas 
                      ref={canvasRef} 
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      className={`max-w-full max-h-[75vh] object-contain block mx-auto ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`} 
                   />
                </div>
            ) : (
                <div className="text-center text-green-900">
                    <div className="border border-green-900 p-8 inline-block animate-pulse">
                        <YoutubeIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-xl font-bold tracking-widest">NO SIGNAL</p>
                        <p className="text-xs mt-2">AWAITING INPUT STREAM...</p>
                    </div>
                </div>
            )}
            
            <canvas ref={hiddenCanvasRef} className="hidden" />
        </main>

        {/* RIGHT SIDEBAR: STANDARD TOOLS */}
        <aside className="w-80 border-l border-green-900 bg-black flex flex-col p-6 shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-6 border-b border-green-900 pb-2">
            <h2 className="font-bold tracking-widest uppercase text-xs text-green-400">IMAGE_CONTROLS</h2>
            <button onClick={handleReset} className="text-[10px] text-green-700 hover:text-green-400 uppercase flex items-center gap-1 border border-green-900 px-2 py-1">
              <RefreshCw className="w-3 h-3" /> Reboot
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <RangeSlider label="Brightness" value={adjustments.brightness} min={0} max={200} onChange={(v) => handleAdjustmentChange('brightness', v)} unit="%" />
              <RangeSlider label="Contrast" value={adjustments.contrast} min={0} max={200} onChange={(v) => handleAdjustmentChange('contrast', v)} unit="%" />
              <RangeSlider label="Saturation" value={adjustments.saturation} min={0} max={200} onChange={(v) => handleAdjustmentChange('saturation', v)} unit="%" />
              <RangeSlider label="Sepia" value={adjustments.sepia} min={0} max={100} onChange={(v) => handleAdjustmentChange('sepia', v)} unit="%" />
            </div>

            <div className="pt-6 border-t border-green-900">
              <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-4">TEXT_INJECTION</h3>
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Enter text string..."
                  className="flex-1 bg-black border border-green-800 px-3 py-2 text-xs focus:outline-none focus:border-green-500 text-green-300 placeholder-green-900"
                />
                <button 
                  onClick={handleAddText}
                  className="bg-green-900/50 hover:bg-green-500 hover:text-black border border-green-600 text-green-500 px-3 py-2 text-xs font-bold"
                >
                  ADD
                </button>
              </div>

              {/* Selected Text Controls */}
              {selectedTextId && (
                  <div className="bg-green-900/10 border border-green-800 p-3 mb-4">
                      <p className="text-[10px] text-green-600 mb-2 uppercase tracking-wider">Object Properties</p>
                      
                      {/* Font Family Selector */}
                      <div className="mb-3">
                          <label className="text-[10px] text-green-700 block mb-1">FONT_FAMILY</label>
                          <select 
                            value={textOverlays.find(t => t.id === selectedTextId)?.fontFamily || 'Share Tech Mono'}
                            onChange={(e) => updateSelectedText('fontFamily', e.target.value)}
                            className="w-full bg-black border border-green-800 text-xs text-green-400 p-1 focus:outline-none"
                          >
                              <option value="Share Tech Mono">Tech Mono</option>
                              <option value="Courier New">Courier</option>
                              <option value="Impact">Impact</option>
                              <option value="Arial">Arial</option>
                              <option value="Verdana">Verdana</option>
                          </select>
                      </div>

                      {/* Font Size Slider */}
                      <RangeSlider 
                        label="Size" 
                        value={textOverlays.find(t => t.id === selectedTextId)?.fontSize || 48} 
                        min={10} max={200} 
                        onChange={(v) => updateSelectedText('fontSize', v)} 
                        unit="px"
                      />

                      {/* Color Picker (Basic) */}
                       <div className="mb-2">
                          <label className="text-[10px] text-green-700 block mb-1">COLOR_HEX</label>
                          <input 
                             type="color" 
                             value={textOverlays.find(t => t.id === selectedTextId)?.color || '#00ff00'}
                             onChange={(e) => updateSelectedText('color', e.target.value)}
                             className="w-full h-6 bg-transparent border-none cursor-pointer"
                          />
                       </div>
                  </div>
              )}
              
              {textOverlays.length > 0 && (
                <div className="space-y-1">
                   {textOverlays.map((t) => (
                     <div 
                        key={t.id} 
                        onClick={() => setSelectedTextId(t.id)}
                        className={`flex justify-between items-center p-2 text-xs cursor-pointer border ${selectedTextId === t.id ? 'border-green-500 bg-green-900/20' : 'border-green-900 bg-black'}`}
                     >
                        <span className="truncate max-w-[150px] font-mono text-green-400">{t.text}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setTextOverlays(prev => prev.filter(p => p.id !== t.id)); }}
                          className="text-red-900 hover:text-red-500 font-bold"
                        >
                          [X]
                        </button>
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* FOOTER MARQUEE */}
      <footer className="fixed bottom-0 left-0 w-full h-12 bg-black border-t border-green-600 flex items-center overflow-hidden z-50">
         <div className="animate-marquee whitespace-nowrap text-green-500 font-mono tracking-widest">
            ALLAHUMMA SUGEH &nbsp;&nbsp;&nbsp; /// &nbsp;&nbsp;&nbsp; ALLAHUMMA SUGEH &nbsp;&nbsp;&nbsp; /// &nbsp;&nbsp;&nbsp; ALLAHUMMA SUGEH &nbsp;&nbsp;&nbsp; /// &nbsp;&nbsp;&nbsp;
         </div>
      </footer>

    </div>
  );
};

export default App;