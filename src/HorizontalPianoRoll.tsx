import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as Tone from 'tone';
import WaveSurfer from 'wavesurfer.js';

export interface Note {
  pitch: number;
  startTime: number;
  duration: number;
  velocity?: number;
}

export interface HorizontalPianoRollHandle {
  play: () => void;
  stop: () => void;
  pause: () => void;
}

interface Props {
  notes: Note[];
  audioUrl?: string | null;
  pixelsPerSecond?: number;
  playbackSpeed?: number;
  minNote?: number;
  maxNote?: number;
  onPlaybackEnd?: () => void;
  onActiveNotesChange?: (notes: number[]) => void;
}

const NOTE_COLORS = [
  '#e94560', '#4ecca3', '#00d9ff', '#ffd93d',
  '#ff6b9d', '#c44dff', '#ff8c42', '#98d8c8'
];

function isBlackKey(note: number): boolean {
  const n = note % 12;
  return [1, 3, 6, 8, 10].includes(n);
}

function getNoteName(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return names[note % 12] + octave;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function countWhiteKeys(minNote: number, maxNote: number): number {
  let count = 0;
  for (let n = minNote; n <= maxNote; n++) {
    if (!isBlackKey(n)) count++;
  }
  return count;
}

function getNoteX(note: number, minNote: number, whiteKeyWidth: number): number {
  let x = 0;
  for (let n = minNote; n < note; n++) {
    if (!isBlackKey(n)) {
      x += whiteKeyWidth;
    }
  }
  if (isBlackKey(note)) {
    x -= whiteKeyWidth * 0.35;
  }
  return x;
}

export const HorizontalPianoRoll = forwardRef<HorizontalPianoRollHandle, Props>(
  ({ notes, audioUrl, pixelsPerSecond = 100, playbackSpeed = 1, minNote = 21, maxNote = 108, onPlaybackEnd, onActiveNotesChange }, ref) => {
    const rollCanvasRef = useRef<HTMLCanvasElement>(null);
    const keysCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const rollScrollRef = useRef<HTMLDivElement>(null);
    const keysScrollRef = useRef<HTMLDivElement>(null);
    const waveformRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
    const [containerWidth, setContainerWidth] = useState(800);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalTime, setTotalTime] = useState(0);

    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const animationRef = useRef<number | null>(null);

    const whiteKeyCount = countWhiteKeys(minNote, maxNote);

    // Scale keyboard to fit container width
    const WHITE_KEY_WIDTH = Math.max(12, containerWidth / whiteKeyCount);
    const WHITE_KEY_HEIGHT = 180;
    const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.6;
    const BLACK_KEY_HEIGHT = 110;
    const NOTE_HEIGHT = 8;

    const keyboardWidth = containerWidth;
    const totalNotes = maxNote - minNote + 1;
    const rollHeight = totalNotes * NOTE_HEIGHT;

    const duration = notes.length > 0
      ? Math.max(...notes.map(n => n.startTime + n.duration))
      : 0;
    const rollWidth = Math.max(duration * pixelsPerSecond + 400, 800);

    // Track container width for keyboard scaling
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const updateWidth = () => {
        setContainerWidth(container.clientWidth);
      };

      updateWidth();

      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(container);

      return () => resizeObserver.disconnect();
    }, []);

    // Load audio with WaveSurfer
    useEffect(() => {
      if (!waveformRef.current) return;

      // Destroy previous instance
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }

      if (!audioUrl) return;

      setIsLoading(true);

      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4ecca3',
        progressColor: '#e94560',
        cursorColor: 'transparent', // Hide cursor - we use our own playhead
        cursorWidth: 0,
        height: 80,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        minPxPerSec: pixelsPerSecond, // Match piano roll scale
        fillParent: false, // Don't stretch to fill - use actual duration
      });

      ws.load(audioUrl);

      ws.on('ready', () => {
        setIsLoading(false);
        setTotalTime(ws.getDuration());
      });

      ws.on('error', (err) => {
        console.error('WaveSurfer error:', err);
        setIsLoading(false);
      });

      ws.on('finish', () => {
        stop();
        onPlaybackEnd?.();
      });

      wavesurferRef.current = ws;

      return () => {
        ws.destroy();
      };
    }, [audioUrl, pixelsPerSecond]);

    // Update playback speed
    useEffect(() => {
      const ws = wavesurferRef.current;
      if (ws) {
        ws.setPlaybackRate(playbackSpeed);
      }
    }, [playbackSpeed]);

    // Notify parent of active notes changes
    useEffect(() => {
      onActiveNotesChange?.(Array.from(activeNotes));
    }, [activeNotes, onActiveNotesChange]);

    // Draw horizontal keyboard at bottom
    useEffect(() => {
      const canvas = keysCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = keyboardWidth;
      canvas.height = WHITE_KEY_HEIGHT;

      // Draw white keys
      let whiteX = 0;
      for (let note = minNote; note <= maxNote; note++) {
        if (!isBlackKey(note)) {
          const isActive = activeNotes.has(note);

          const gradient = ctx.createLinearGradient(whiteX, 0, whiteX, WHITE_KEY_HEIGHT);
          gradient.addColorStop(0, isActive ? '#5fffb8' : '#ffffff');
          gradient.addColorStop(0.7, isActive ? '#4ecca3' : '#e8e8e8');
          gradient.addColorStop(1, isActive ? '#3ba57f' : '#c8c8c8');

          ctx.fillStyle = gradient;
          ctx.fillRect(whiteX, 0, WHITE_KEY_WIDTH - 1, WHITE_KEY_HEIGHT);
          ctx.strokeStyle = '#999';
          ctx.strokeRect(whiteX, 0, WHITE_KEY_WIDTH - 1, WHITE_KEY_HEIGHT);

          if (note % 12 === 0) {
            ctx.fillStyle = '#666';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(getNoteName(note), whiteX + 3, WHITE_KEY_HEIGHT - 6);
          }
          whiteX += WHITE_KEY_WIDTH;
        }
      }

      // Draw black keys
      whiteX = 0;
      for (let note = minNote; note <= maxNote; note++) {
        if (!isBlackKey(note)) {
          whiteX += WHITE_KEY_WIDTH;
        } else {
          const isActive = activeNotes.has(note);
          const blackX = whiteX - WHITE_KEY_WIDTH + (WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2);

          const gradient = ctx.createLinearGradient(blackX, 0, blackX, BLACK_KEY_HEIGHT);
          gradient.addColorStop(0, isActive ? '#ff8a8a' : '#333');
          gradient.addColorStop(0.8, isActive ? '#e94560' : '#1a1a1a');
          gradient.addColorStop(1, isActive ? '#c73a52' : '#000');

          ctx.fillStyle = gradient;
          ctx.fillRect(blackX, 0, BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT);
          ctx.strokeStyle = '#000';
          ctx.strokeRect(blackX, 0, BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT);
        }
      }
    }, [keyboardWidth, minNote, maxNote, activeNotes]);

    // Draw piano roll (notes scrolling left-to-right, pitch on Y)
    useEffect(() => {
      const canvas = rollCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = rollWidth;
      canvas.height = rollHeight;

      // Background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, rollWidth, rollHeight);

      // Draw horizontal pitch lines
      for (let i = 0; i <= totalNotes; i++) {
        const note = maxNote - i;
        const y = i * NOTE_HEIGHT;

        if (note >= minNote && isBlackKey(note)) {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(0, y, rollWidth, NOTE_HEIGHT);
        }

        ctx.strokeStyle = '#2a2a4e';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rollWidth, y);
        ctx.stroke();
      }

      // Draw vertical beat lines
      const secondsPerBeat = 0.5;
      for (let t = 0; t < duration + 4; t += secondsPerBeat) {
        const x = t * pixelsPerSecond;
        const isBar = Math.round(t / secondsPerBeat) % 4 === 0;

        ctx.strokeStyle = isBar ? '#3a3a6e' : '#2a2a4e';
        ctx.lineWidth = isBar ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rollHeight);
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      // Draw notes
      notes.forEach((note) => {
        if (note.pitch < minNote || note.pitch > maxNote) return;

        const x = note.startTime * pixelsPerSecond;
        const noteIdx = maxNote - note.pitch;
        const y = noteIdx * NOTE_HEIGHT;
        const w = Math.max(note.duration * pixelsPerSecond, 6);
        const h = NOTE_HEIGHT - 1;
        const color = NOTE_COLORS[note.pitch % NOTE_COLORS.length];

        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, adjustColor(color, 30));
        gradient.addColorStop(1, adjustColor(color, -30));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x + 1, y, w - 2, h, 3);
        ctx.fill();

        ctx.strokeStyle = adjustColor(color, 50);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x + 1, y, w - 2, h, 3);
        ctx.stroke();
      });
    }, [notes, rollWidth, rollHeight, totalNotes, minNote, maxNote, pixelsPerSecond, duration]);

    function adjustColor(hex: string, amount: number): string {
      const num = parseInt(hex.slice(1), 16);
      const r = Math.min(255, Math.max(0, (num >> 16) + amount));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
      const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
      return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    }

    const updatePlayhead = useCallback(() => {
      if (!playheadRef.current || !rollScrollRef.current) return;

      const ws = wavesurferRef.current;
      if (!ws) return;

      const elapsed = ws.getCurrentTime();
      setCurrentTime(elapsed);
      const x = elapsed * pixelsPerSecond;
      playheadRef.current.style.left = `${x}px`;

      // Auto-scroll
      const scrollLeft = rollScrollRef.current.scrollLeft;
      const viewWidth = rollScrollRef.current.clientWidth;
      if (x > scrollLeft + viewWidth - 200) {
        rollScrollRef.current.scrollLeft = x - 200;
      }

      // Update active notes
      const active = new Set<number>();
      notes.forEach((note) => {
        if (elapsed >= note.startTime && elapsed < note.startTime + note.duration) {
          active.add(note.pitch);
        }
      });
      setActiveNotes(active);

      if (ws.isPlaying()) {
        animationRef.current = requestAnimationFrame(updatePlayhead);
      }
    }, [notes, pixelsPerSecond]);

    const play = useCallback(async () => {
      const ws = wavesurferRef.current;
      if (isPlaying || !ws || isLoading) return;

      setIsPlaying(true);

      // Only reset if at the beginning
      if (ws.getCurrentTime() === 0) {
        setActiveNotes(new Set());
        if (rollScrollRef.current) rollScrollRef.current.scrollLeft = 0;
        if (playheadRef.current) playheadRef.current.style.left = '0px';
      }

      ws.play();
      animationRef.current = requestAnimationFrame(updatePlayhead);
    }, [isPlaying, isLoading, updatePlayhead]);

    const stop = useCallback(() => {
      setIsPlaying(false);
      setActiveNotes(new Set());

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      const ws = wavesurferRef.current;
      if (ws) {
        ws.stop();
      }
      if (playheadRef.current) playheadRef.current.style.left = '0px';
      if (rollScrollRef.current) rollScrollRef.current.scrollLeft = 0;
    }, []);

    const pause = useCallback(() => {
      const ws = wavesurferRef.current;
      if (isPlaying && ws) {
        ws.pause();
        setIsPlaying(false);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      }
    }, [isPlaying]);

    useImperativeHandle(ref, () => ({ play, stop, pause }));

    useEffect(() => {
      return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        if (wavesurferRef.current) wavesurferRef.current.destroy();
      };
    }, []);

    // Sync scroll between roll and keyboard
    const handleRollScroll = () => {
      // No sync needed - keyboard is independent
    };

    // Click to seek
    const handleRollClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const ws = wavesurferRef.current;
      if (!ws) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const scrollLeft = rollScrollRef.current?.scrollLeft || 0;
      const clickX = e.clientX - rect.left + scrollLeft;
      const clickTime = clickX / pixelsPerSecond;
      const duration = ws.getDuration();

      if (duration > 0) {
        const seekRatio = Math.max(0, Math.min(1, clickTime / duration));
        ws.seekTo(seekRatio);
        setCurrentTime(clickTime);

        // Update playhead position
        if (playheadRef.current) {
          playheadRef.current.style.left = `${clickTime * pixelsPerSecond}px`;
        }

        // Update active notes for the new position
        const active = new Set<number>();
        notes.forEach((note) => {
          if (clickTime >= note.startTime && clickTime < note.startTime + note.duration) {
            active.add(note.pitch);
          }
        });
        setActiveNotes(active);
      }
    };

    const waveformHeight = 80;
    const totalScrollHeight = waveformHeight + rollHeight;

    return (
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#1a1a2e',
        }}
      >
        {/* Scrollable container for both waveform and piano roll */}
        <div
          ref={rollScrollRef}
          onScroll={handleRollScroll}
          onClick={handleRollClick}
          style={{
            flex: 1,
            overflow: 'auto',
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          <div style={{ position: 'relative', width: rollWidth, minHeight: '100%' }}>
            {/* Waveform display - inside scroll container */}
            <div
              ref={waveformRef}
              style={{
                width: rollWidth,
                height: waveformHeight,
                background: '#16213e',
                borderBottom: '2px solid #0f3460',
              }}
            />

            {/* Piano roll canvas */}
            <div style={{ height: rollHeight }}>
              <canvas ref={rollCanvasRef} style={{ display: 'block' }} />
            </div>

            {/* Single playhead spanning both waveform and piano roll */}
            <div
              ref={playheadRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 3,
                height: totalScrollHeight,
                background: '#e94560',
                boxShadow: '0 0 15px #e94560',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          </div>
          {/* Timestamp display */}
          <div style={{
            position: 'sticky',
            left: 10,
            top: 10,
            display: 'inline-block',
            background: 'rgba(0,0,0,0.7)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#4ecca3',
            zIndex: 20,
            pointerEvents: 'none',
          }}>
            {formatTime(currentTime)} / {formatTime(totalTime)}
          </div>
          {isLoading && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#4ecca3',
              fontSize: '1.2rem',
              background: 'rgba(0,0,0,0.7)',
              padding: '20px 40px',
              borderRadius: '10px',
            }}>
              Loading audio...
            </div>
          )}
        </div>

        {/* Horizontal keyboard at bottom - scaled to fit */}
        <div
          ref={keysScrollRef}
          style={{
            width: '100%',
            overflow: 'hidden',
            background: '#0a0a15',
            borderTop: '3px solid #4ecca3',
            flexShrink: 0,
          }}
        >
          <canvas ref={keysCanvasRef} style={{ display: 'block' }} />
        </div>
      </div>
    );
  }
);

HorizontalPianoRoll.displayName = 'HorizontalPianoRoll';
