import { useState, useEffect, useRef } from 'react';
import { Shield, Activity, Wifi, ShieldAlert, Mic, MicOff, AlertOctagon } from 'lucide-react';
import './index.css';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("System standby. Click microphone to interact.");
  const [audioLevel, setAudioLevel] = useState(0);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  
  // Refs to avoid state closure traps inside the SpeechRecognition callbacks
  const selectedVoiceURIRef = useRef("");
  const isListeningRef = useRef(false);
  const fullTranscriptRef = useRef("");
  const commandDebounceRef = useRef(null);

  // Sync refs with state
  useEffect(() => {
    selectedVoiceURIRef.current = selectedVoiceURI;
  }, [selectedVoiceURI]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Dynamic data from the FastAPI Backend
  const [stats, setStats] = useState({
    bandwidth_mbps: 0.0,
    active_connections: 0,
    threats_blocked: 0,
    defcon_level: 5
  });

  const [recentAlerts, setRecentAlerts] = useState([]);

  // Fetch dashboard data periodically
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/dashboard");
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats);
          setRecentAlerts(data.recent_alerts);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      }
    };
    
    // Initial fetch
    fetchDashboardData();
    // Poll every 2 seconds matching the backend simulation loop
    const interval = setInterval(fetchDashboardData, 2000);
    return () => clearInterval(interval);
  }, []);

  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startAudioVisualizer = async () => {
    // We will use this stream for both the visualizer AND the MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Start Debug Recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };
      
      mediaRecorder.start();

      // Start Visualizer without deprecated ScriptProcessorNode
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);

      const updateLevel = () => {
        if (audioContext.state === 'closed') return;
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        for (let i = 0; i < array.length; i++) {
          values += array[i];
        }
        setAudioLevel(values / array.length);
        requestAnimationFrame(updateLevel);
      };
      updateLevel();
      
      audioContextRef.current = { context: audioContext, stream };
    } catch (err) {
      console.error("Audio block / mic denied: ", err);
    }
  };

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true; // Keep listening until manually stopped
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        console.log("Speech recognition started.");
        setIsListening(true);
        fullTranscriptRef.current = "";
        setTranscript("Listening for command...");
      };
      
      recognition.onresult = (event) => {
        let currentInterim = '';
        let newFinalChunk = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            newFinalChunk += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }
        
        if (newFinalChunk) {
           fullTranscriptRef.current += " " + newFinalChunk; 
        }
        
        // Display what we have buffered so far plus whatever is currently being spoken
        const displayTranscript = (fullTranscriptRef.current + " " + currentInterim).trim();
        if (displayTranscript) {
           setTranscript(displayTranscript);
        }

        // Clear any executing command if they are still making noise
        if (commandDebounceRef.current) {
            clearTimeout(commandDebounceRef.current);
        }
        
        // If we have some fully finalized text, wait 1.5 seconds of silence before firing!
        if (fullTranscriptRef.current.trim().length > 0) {
            commandDebounceRef.current = setTimeout(() => {
                const finalCommand = fullTranscriptRef.current.trim();
                console.log("🗣️ User finished speaking. Sending full command to AI:", finalCommand);
                processVoiceCommand(finalCommand);
                fullTranscriptRef.current = ""; // Reset buffer for next sentence
            }, 1500); // Wait 1.5 seconds of silence
        }
      };
      
      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'no-speech') {
          setTranscript("No speech detected. Check Windows Microphone Volume.");
        } else {
          setTranscript("Error: " + event.error);
        }
        setIsListening(false);
      };
      
      recognition.onend = () => {
        console.log("Speech recognition ended.");
        setIsListening(false);
        setTranscript(prev => prev === "Listening for command..." ? "System standby. Click microphone to interact." : prev);
        
        // Stop Debug Recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
      };
      
      recognition.onspeechstart = () => {
        console.log("Speech detected.");
      };

      recognitionRef.current = recognition;
    } else {
      setTranscript("System Error: Speech Recognition API not supported in this browser. Use Chrome or Edge.");
    }

    // Load available speech voices asynchronously
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      
      // If we don't have a selection yet, try to auto-select "Zira" specifically, then fallback to other female voices
      if (voices.length > 0) {
         const ziraVoice = voices.find(v => v.name.toLowerCase().includes("zira"));
         const femaleKeywords = ["female", "woman", "samantha", "victoria", "karen", "tessa", "melina", "moira", "fiona", "susan", "hazel", "kalpana", "neja", "heera", "google us english", "google uk english female"];
         const femaleVoice = voices.find(v => femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
         
         if (ziraVoice) {
           setSelectedVoiceURI(ziraVoice.voiceURI);
         } else if (femaleVoice) {
           setSelectedVoiceURI(femaleVoice.voiceURI);
         } else if (voices.length > 1) {
           setSelectedVoiceURI(voices[1].voiceURI); // basic fallback
         } else {
           setSelectedVoiceURI(voices[0].voiceURI);
         }
      }
    };
    
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Cleanup function
    return () => {
      if (recognition) recognition.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    };
  }, []);

  const processVoiceCommand = async (userText) => {
    const text = userText.toLowerCase();
    let responseText = "Processing data...";

    try {
      const response = await fetch("http://127.0.0.1:8000/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text })
      });
      
      if (response.ok) {
        const data = await response.json();
        responseText = data.response;
      } else {
        responseText = "Error communicating with backend API.";
      }
    } catch (err) {
      console.error("API error:", err);
      responseText = "Backend API is currently unreachable.";
    }

    const utterance = new SpeechSynthesisUtterance(responseText);
    utterance.pitch = 0.9;
    utterance.rate = 1.0;
    
    // Fetch fresh voices directly from browser API to avoid state closures
    const currentVoices = window.speechSynthesis.getVoices();
    
    // Use the explicitly selected voice from our dropdown using the Ref (to bypass closure trap)
    const explicitVoice = currentVoices.find(v => v.voiceURI === selectedVoiceURIRef.current);
    if (explicitVoice) {
      utterance.voice = explicitVoice;
      utterance.lang = explicitVoice.lang; // Sometimes required by Chrome/Edge
    }

    console.log("🤖 AI Response:", responseText);
    
    // Prevent garbage collection bug in Chrome
    window._latestUtterance = utterance; 
    
    window.speechSynthesis.cancel(); // Clear any queued utterances
    
    // Delay speak by 50ms to prevent the cancel() command from aborting our new utterance immediately
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
    
    setTimeout(() => {
      // Use ref to check current state
      if (!isListeningRef.current) {
         setTranscript(`System Response: "${responseText}"`);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        if (audioContextRef.current.node) audioContextRef.current.node.disconnect();
        audioContextRef.current.context.close();
        if (audioContextRef.current.stream) {
            audioContextRef.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);

  const handleMicClick = () => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setTranscript("System standby. Click microphone to interact.");
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) {
         if (audioContextRef.current.node) audioContextRef.current.node.disconnect();
         audioContextRef.current.context.close();
         if (audioContextRef.current.stream) {
            audioContextRef.current.stream.getTracks().forEach(track => track.stop());
         }
         audioContextRef.current = null;
         setAudioLevel(0);
      }
    } else {
      try {
        setAudioUrl(null); // Reset debugger
        recognitionRef.current.start();
        
        // Delay visualizer by 400ms to ensure SpeechRecognition grabs the microphone hardware lock first!
        setTimeout(() => {
             startAudioVisualizer(); 
        }, 400);
      } catch (err) {
        console.error("Could not start recognition:", err);
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg-dark text-slate-100 p-4 gap-6 font-sans">
      {/* Header Panel */}
      <header className="glass-panel flex flex-col md:flex-row justify-between items-center p-4 md:px-8 gap-4">
        <div className="flex items-center gap-4">
          <Shield size={32} className="text-neon-blue" />
          <h1 className="m-0 text-xl md:text-2xl tracking-widest bg-gradient-to-r from-neon-cyan to-neon-blue bg-clip-text text-transparent font-bold">
            IIDPS NEXUS
          </h1>
        </div>
        <div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border font-medium text-sm transition-colors duration-500
            ${stats.defcon_level <= 3 ? 'bg-red-500/10 border-neon-red text-neon-red' : 'bg-cyan-500/10 border-neon-cyan text-neon-cyan'}`}>
            <div className={`w-2 h-2 rounded-full transition-colors duration-500
              ${stats.defcon_level <= 3 ? 'bg-neon-red shadow-[0_0_8px_var(--neon-red)]' : 'bg-neon-cyan shadow-[0_0_8px_var(--neon-cyan)]'}`}></div>
            DEFCON {stats.defcon_level} - {stats.defcon_level <= 3 ? 'Active Threats' : 'Surveillance Mode'}
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="flex flex-col xl:grid xl:grid-cols-4 gap-6 flex-1 min-h-0">
        
        {/* Left Column: Data & Logs */}
        <div className="xl:col-span-3 flex flex-col gap-6 xl:overflow-hidden">
          
          {/* Top Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel p-6 flex flex-col gap-2 hover:-translate-y-1 hover:border-neon-cyan transition-transform">
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>Bandwidth</span>
                <Activity size={18} className="text-neon-blue" />
              </div>
              <p className="text-3xl font-bold m-0">{stats.bandwidth_mbps} <span className="text-sm text-slate-500 font-normal">MB/s</span></p>
            </div>
            
            <div className="glass-panel p-6 flex flex-col gap-2 hover:-translate-y-1 hover:border-neon-cyan transition-transform">
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>Active Connections</span>
                <Wifi size={18} className="text-neon-blue" />
              </div>
              <p className="text-3xl font-bold m-0">{stats.active_connections}</p>
            </div>
            
            <div className="glass-panel p-6 flex flex-col gap-2 border-[rgba(239,68,68,0.3)] hover:-translate-y-1 hover:border-neon-red transition-transform">
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>Threats Blocked</span>
                <ShieldAlert size={18} className="text-neon-red" />
              </div>
              <p className="text-3xl font-bold text-neon-red m-0">{stats.threats_blocked}</p>
            </div>
          </div>

          {/* Threat Logs Panel */}
          <div className="glass-panel flex-1 flex flex-col p-6 min-h-[400px] xl:min-h-0 overflow-hidden">
            <h2 className="m-0 text-lg flex items-center gap-2 text-slate-100 border-b border-white/10 pb-3 mb-4">
              <AlertOctagon size={20} className="text-neon-red" />
              Recent Threat Alerts
            </h2>
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2">
              {recentAlerts.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-500 italic">No exact threats detected yet. Simulating...</div>
              )}
              {recentAlerts.map(alert => (
                <div key={alert.id} className="bg-black/20 border-l-4 border-neon-red p-4 rounded-r-lg flex flex-col md:flex-row md:justify-between md:items-center gap-2 hover:bg-red-500/5 hover:translate-x-1 transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-neon-red font-semibold text-sm">{alert.type} 
                      <span className="text-xs text-slate-400 ml-2">Conf: {alert.confidence}</span>
                    </span>
                    <span className="text-slate-400 text-xs font-mono">SRC: {alert.ip}</span>
                  </div>
                  <span className="text-slate-400 text-xs">{alert.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Voice AI Assistant */}
        <div className="xl:col-span-1 flex flex-col">
          <div className="glass-panel flex-1 flex flex-col items-center justify-center p-8 text-center gap-8 min-h-[400px]">
            <h2 className="m-0 text-xl font-bold flex items-center justify-center w-full">
              Vanguard AI
            </h2>
            
            <div className="relative w-32 h-32 flex items-center justify-center">
              <button 
                className={`w-24 h-24 rounded-full border-2 border-neon-cyan flex items-center justify-center text-neon-cyan cursor-pointer transition-all duration-300 z-10 
                  ${isListening 
                    ? 'bg-red-500/20 border-neon-red text-neon-red animate-pulse-glow shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                    : 'bg-cyan-500/10 hover:bg-cyan-500/20 hover:scale-105 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                  }`}
                onClick={handleMicClick}
              >
                {isListening ? <Mic size={48} /> : <MicOff size={48} />}
              </button>
            </div>
            
            {/* Audio Visualizer Bar */}
            <div className="w-full max-w-[80%] flex flex-col items-center">
              <div className="w-full h-2.5 bg-black/30 rounded-full overflow-hidden">
                  <div style={{ 
                      height: '100%', 
                      width: `${Math.min(100, audioLevel * 1.5)}%`, 
                      transition: 'width 0.1s ease-out'
                  }} className="bg-gradient-to-r from-neon-cyan to-neon-blue"></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                 Mic Input Level: {Math.round(audioLevel)}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <div className={`text-xl font-medium ${isListening ? 'text-neon-red' : 'text-neon-cyan'}`}>
                {isListening ? 'Listening...' : 'Standby'}
              </div>
              <p className={`text-sm text-slate-400 min-h-[60px] px-4 ${isListening ? 'italic' : ''}`}>
                "{transcript}"
              </p>
            </div>
            
            {/* Debug Audio Player */}
            {audioUrl && !isListening && (
               <div className="mt-4 flex flex-col items-center gap-2 border-t border-neon-blue/30 pt-4 w-full">
                  <p className="text-xs text-neon-cyan font-bold uppercase tracking-wider">Debug: Playback Last Capture</p>
                  <p className="text-xs text-slate-400">If you only hear silence or static, your mic volume is too low in Windows.</p>
                  <audio src={audioUrl} controls className="h-8 max-w-[200px]" />
               </div>
            )}
            
            {/* Voice Selection Override */}
            {availableVoices.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-1 border-t border-white/10 pt-4 w-full">
                   <label className="text-xs text-slate-400">System Voice Processor Override</label>
                   <select 
                     className="bg-black/40 border border-neon-blue/40 text-slate-200 text-sm p-2 outline-none rounded appearance-none cursor-pointer text-center max-w-[200px]"
                     value={selectedVoiceURI}
                     onChange={(e) => setSelectedVoiceURI(e.target.value)}
                   >
                     {availableVoices.map(voice => (
                       <option key={voice.voiceURI} value={voice.voiceURI}>
                         {voice.name}
                       </option>
                     ))}
                   </select>
                </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
