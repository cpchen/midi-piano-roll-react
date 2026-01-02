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
  const [offset, setOffset] = useState(0); // Downbeat offset in seconds
  const [subdivision, setSubdivision] = useState('1/8T'); // Grid subdivision
  const pianoRollRef = useRef<HorizontalPianoRollHandle>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Undo/redo history
  const historyRef = useRef<Note[][]>([]);
  const historyIndexRef = useRef(-1);

  const pushHistory = useCallback((newNotes: Note[]) => {
    // Check if new state is different from current state
    const currentState = historyRef.current[historyIndexRef.current];
    const newStateStr = JSON.stringify(newNotes);
    if (currentState && JSON.stringify(currentState) === newStateStr) {
      return; // Skip duplicate state
    }
    // Remove any future states if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    // Add new state
    historyRef.current.push(JSON.parse(newStateStr));
    historyIndexRef.current = historyRef.current.length - 1;
    // Limit history to 50 states
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      setNotes(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      setNotes(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
    }
  }, []);

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

      // Reset history and set initial state
      historyRef.current = [JSON.parse(JSON.stringify(allNotes))];
      historyIndexRef.current = 0;
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

  const exportMusicXML = useCallback(() => {
    if (notes.length === 0) return;

    const secondsPerBeat = 60 / tempo;
    const divisions = 480; // Ticks per quarter note
    const beatsPerBar = 4;

    // Convert MIDI note to pitch info
    const midiToPitch = (midi: number) => {
      const noteNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
      const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
      const octave = Math.floor(midi / 12) - 1;
      const noteIndex = midi % 12;
      return {
        step: noteNames[noteIndex],
        alter: alters[noteIndex],
        octave: octave,
      };
    };

    // Convert duration in seconds to divisions
    const secondsToDivisions = (secs: number) => {
      const beats = secs / secondsPerBeat;
      return Math.round(beats * divisions);
    };

    // Group notes by start time for chords
    const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);

    // Build measures
    const measures: string[] = [];
    let currentTime = offset; // Start from downbeat
    let measureNum = 1;

    // Find the end time
    const endTime = Math.max(...notes.map(n => n.startTime + n.duration));
    const totalBeats = (endTime - offset) / secondsPerBeat;
    const totalMeasures = Math.ceil(totalBeats / beatsPerBar) + 1;

    for (let m = 0; m < totalMeasures; m++) {
      const measureStart = offset + m * beatsPerBar * secondsPerBeat;
      const measureEnd = measureStart + beatsPerBar * secondsPerBeat;

      // Get notes that start in this measure
      const measureNotes = sortedNotes.filter(
        n => n.startTime >= measureStart && n.startTime < measureEnd
      );

      let measureContent = '';

      // Add attributes for first measure
      if (m === 0) {
        measureContent += `
      <attributes>
        <divisions>${divisions}</divisions>
        <time>
          <beats>${beatsPerBar}</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempo}</per-minute>
          </metronome>
        </direction-type>
      </direction>`;
      }

      if (measureNotes.length === 0) {
        // Rest for whole measure
        measureContent += `
      <note>
        <rest/>
        <duration>${divisions * beatsPerBar}</duration>
        <type>whole</type>
      </note>`;
      } else {
        // Group notes by start time for chords
        const notesByTime = new Map<number, Note[]>();
        measureNotes.forEach(note => {
          const key = Math.round(note.startTime * 1000);
          if (!notesByTime.has(key)) {
            notesByTime.set(key, []);
          }
          notesByTime.get(key)!.push(note);
        });

        // Sort by time
        const times = Array.from(notesByTime.keys()).sort((a, b) => a - b);
        let prevEndDivision = 0;

        times.forEach(timeKey => {
          const chordNotes = notesByTime.get(timeKey)!;
          const noteTime = chordNotes[0].startTime;
          const noteDivision = secondsToDivisions(noteTime - measureStart);

          // Add rest if there's a gap
          if (noteDivision > prevEndDivision) {
            const restDuration = noteDivision - prevEndDivision;
            measureContent += `
      <note>
        <rest/>
        <duration>${restDuration}</duration>
      </note>`;
          }

          // Add chord notes
          chordNotes.forEach((note, idx) => {
            const pitch = midiToPitch(note.pitch);
            const noteDuration = secondsToDivisions(note.duration);

            measureContent += `
      <note>`;
            if (idx > 0) {
              measureContent += `
        <chord/>`;
            }
            measureContent += `
        <pitch>
          <step>${pitch.step}</step>${pitch.alter ? `
          <alter>${pitch.alter}</alter>` : ''}
          <octave>${pitch.octave}</octave>
        </pitch>
        <duration>${noteDuration}</duration>
      </note>`;

            if (idx === 0) {
              prevEndDivision = noteDivision + noteDuration;
            }
          });
        });
      }

      measures.push(`
    <measure number="${measureNum}">
      ${measureContent.trim()}
    </measure>`);
      measureNum++;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measures.join('\n')}
  </part>
</score-partwise>`;

    // Download the file
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.musicxml';
    a.click();
    URL.revokeObjectURL(url);
  }, [notes, tempo, offset]);

  const canPlay = notes.length > 0 && audioUrl;

  // Update display notes only when there are active notes
  useEffect(() => {
    if (activeNotes.length > 0) {
      setDisplayNotes([...activeNotes]);
    }
  }, [activeNotes]);

  // Handle note changes with history
  const handleNotesChange = useCallback((newNotes: Note[]) => {
    pushHistory(newNotes);
    setNotes(newNotes);
  }, [pushHistory]);

  // Keyboard shortcuts for play/pause and undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl/Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      // Spacebar for play/pause
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
  }, [canPlay, isPlaying, handlePlay, handlePause, undo, redo]);

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
          <button
            className="export-btn"
            onClick={exportMusicXML}
            disabled={notes.length === 0}
          >
            Export MusicXML
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
          <div className="offset-control">
            <label>Offset:</label>
            <input
              type="number"
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              step="0.01"
            />
            <span className="offset-unit">s</span>
          </div>
          <div className="subdivision-control">
            <label>Grid:</label>
            <select
              value={subdivision}
              onChange={(e) => setSubdivision(e.target.value)}
            >
              <option value="1/1">1/1</option>
              <option value="1/2">1/2</option>
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/8T">1/8T</option>
              <option value="1/16">1/16</option>
              <option value="1/16T">1/16T</option>
              <option value="1/32">1/32</option>
            </select>
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
            offset={offset}
            subdivision={subdivision}
            onPlaybackEnd={() => setIsPlaying(false)}
            onActiveNotesChange={setActiveNotes}
            onOffsetChange={setOffset}
            onNotesChange={handleNotesChange}
          />
        )}
      </div>
    </div>
  );
}

export default App;
