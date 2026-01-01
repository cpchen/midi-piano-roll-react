import { useState, useRef, useCallback, useEffect } from 'react';
import { HorizontalPianoRoll, type HorizontalPianoRollHandle, type Note } from './HorizontalPianoRoll';
import { MusicNotation } from './MusicNotation';
import { Midi } from '@tonejs/midi';
import './App.css';

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [midiInfo, setMidiInfo] = useState('');
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [displayNotes, setDisplayNotes] = useState<number[]>([]);
  const [audioInfo, setAudioInfo] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [tempo, setTempo] = useState(120);
  const pianoRollRef = useRef<HorizontalPianoRollHandle>(null);
  const tapTimesRef = useRef<number[]>([]);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimesRef.current;

    // Reset if last tap was more than 2 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      tapTimesRef.current = [];
    }

    taps.push(now);

    // Keep only last 8 taps
    if (taps.length > 8) {
      taps.shift();
    }

    // Calculate BPM from at least 2 taps
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      setTempo(Math.min(300, Math.max(1, bpm)));
    }
  }, []);

  const loadMidi = useCallback(async (file: File) => {
    try {
      setError('');
      const arrayBuffer = await file.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      const allNotes: Note[] = [];
      midi.tracks.forEach((track) => {
        track.notes.forEach((note) => {
          allNotes.push({
            pitch: note.midi,
            startTime: note.time,
            duration: note.duration,
            velocity: Math.round(note.velocity * 127),
          });
        });
      });

      allNotes.sort((a, b) => a.startTime - b.startTime);

      // Extract tempo from MIDI if available
      if (midi.header.tempos && midi.header.tempos.length > 0) {
        const midiTempo = Math.round(midi.header.tempos[0].bpm);
        setTempo(midiTempo);
      }

      setNotes(allNotes);
      setMidiInfo(`${file.name} | ${midi.duration.toFixed(1)}s | ${allNotes.length} notes`);
    } catch (err) {
      console.error('Error loading MIDI:', err);
      setError('Error loading MIDI file: ' + (err as Error).message);
    }
  }, []);

  const loadAudio = useCallback((file: File) => {
    // Revoke previous URL if exists
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setAudioInfo(file.name);
  }, [audioUrl]);

  const handleMidiChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        loadMidi(file);
      }
    },
    [loadMidi]
  );

  const handleAudioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        loadAudio(file);
      }
    },
    [loadAudio]
  );

  const handlePlay = useCallback(() => {
    if (pianoRollRef.current) {
      pianoRollRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const handlePause = useCallback(() => {
    if (pianoRollRef.current) {
      pianoRollRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    if (pianoRollRef.current) {
      pianoRollRef.current.stop();
      setIsPlaying(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files) {
        Array.from(files).forEach((file) => {
          if (file.name.endsWith('.mid') || file.name.endsWith('.midi')) {
            loadMidi(file);
          } else if (file.name.endsWith('.mp3') || file.name.endsWith('.wav') || file.name.endsWith('.ogg')) {
            loadAudio(file);
          }
        });
      }
    },
    [loadMidi, loadAudio]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const canPlay = notes.length > 0 && audioUrl;

  // Update display notes only when there are active notes
  useEffect(() => {
    if (activeNotes.length > 0) {
      setDisplayNotes([...activeNotes]);
    }
  }, [activeNotes]);

  // Spacebar shortcut for play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && canPlay) {
        e.preventDefault();
        if (isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canPlay, isPlaying, handlePlay, handlePause]);

  return (
    <div className="app" onDrop={handleDrop} onDragOver={handleDragOver}>
      <header className="header">
        <h1>MIDI Piano Roll</h1>
        <div className="controls">
          <div className="file-input-wrapper">
            <input
              type="file"
              id="midiFile"
              accept=".mid,.midi"
              onChange={handleMidiChange}
            />
            <label htmlFor="midiFile">Load MIDI</label>
          </div>
          <div className="file-input-wrapper audio">
            <input
              type="file"
              id="audioFile"
              accept=".mp3,.wav,.ogg"
              onChange={handleAudioChange}
            />
            <label htmlFor="audioFile">Load Audio</label>
          </div>
          <button
            className="play-btn"
            onClick={handlePlay}
            disabled={!canPlay || isPlaying}
          >
            {isPlaying ? 'Playing...' : 'Play'}
          </button>
          <button className="pause-btn" onClick={handlePause} disabled={!isPlaying}>
            Pause
          </button>
          <button className="stop-btn" onClick={handleStop}>
            Stop
          </button>
          <div className="speed-control">
            <label>Speed:</label>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
          <div className="zoom-control">
            <label>Zoom:</label>
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              <option value={25}>25%</option>
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={100}>100%</option>
              <option value={150}>150%</option>
              <option value={200}>200%</option>
              <option value={300}>300%</option>
              <option value={400}>400%</option>
            </select>
          </div>
          <div className="tempo-control">
            <label>BPM:</label>
            <input
              type="number"
              value={tempo}
              onChange={(e) => setTempo(Math.max(1, Number(e.target.value)))}
              min="1"
              max="300"
            />
            <button className="tap-btn" onClick={handleTapTempo}>
              Tap
            </button>
          </div>
        </div>
        <div className="file-info">
          {midiInfo && <span className="info">MIDI: {midiInfo}</span>}
          {audioInfo && <span className="info">Audio: {audioInfo}</span>}
        </div>
        {notes.length > 0 && (
          <div className="notation-container">
            <MusicNotation activeNotes={displayNotes} width={320} height={250} />
          </div>
        )}
      </header>

      <div className="piano-container">
        {error ? (
          <div className="error">{error}</div>
        ) : notes.length === 0 ? (
          <div className="empty-state">
            Load a MIDI file and audio file to view the piano roll
          </div>
        ) : (
          <HorizontalPianoRoll
            ref={pianoRollRef}
            notes={notes}
            audioUrl={audioUrl}
            pixelsPerSecond={zoom}
            playbackSpeed={playbackSpeed}
            tempo={tempo}
            onPlaybackEnd={() => setIsPlaying(false)}
            onActiveNotesChange={setActiveNotes}
          />
        )}
      </div>
    </div>
  );
}

export default App;
