import { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow';

interface Props {
  activeNotes: number[];
  width?: number;
  height?: number;
}

// Convert MIDI note number to VexFlow note name
function midiToVexFlow(midi: number): { key: string; accidental?: string } {
  const noteNames = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
  const accidentals = [null, '#', null, '#', null, null, '#', null, '#', null, '#', null];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return {
    key: `${noteNames[noteIndex]}/${octave}`,
    accidental: accidentals[noteIndex] || undefined,
  };
}

export function MusicNotation({ activeNotes, width = 300, height = 250 }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || activeNotes.length === 0) return;

    // Create a fresh container div
    wrapper.innerHTML = '';
    const container = document.createElement('div');
    wrapper.appendChild(container);

    try {
      // Create a new renderer with a fresh SVG
      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const context = renderer.getContext();

      // Separate notes into treble and bass clef
      const trebleNotes = activeNotes.filter(n => n >= 60).sort((a, b) => a - b);
      const bassNotes = activeNotes.filter(n => n < 60).sort((a, b) => a - b);

      const staveWidth = width - 20;

      // Draw treble clef staff
      const trebleStave = new Stave(10, 20, staveWidth);
      trebleStave.addClef('treble');
      trebleStave.setContext(context).draw();

      // Draw bass clef staff
      const bassStave = new Stave(10, 120, staveWidth);
      bassStave.addClef('bass');
      bassStave.setContext(context).draw();

      // Draw treble notes
      if (trebleNotes.length > 0) {
        const vexNotes = trebleNotes.map(n => midiToVexFlow(n));
        const keys = vexNotes.map(n => n.key);

        const staveNote = new StaveNote({
          keys: keys,
          duration: 'w',
          clef: 'treble',
        });

        vexNotes.forEach((note, index) => {
          if (note.accidental) {
            staveNote.addModifier(new Accidental(note.accidental), index);
          }
        });

        const voice = new Voice({ num_beats: 4, beat_value: 4 });
        voice.addTickables([staveNote]);
        new Formatter().joinVoices([voice]).format([voice], staveWidth - 50);
        voice.draw(context, trebleStave);
      }

      // Draw bass notes
      if (bassNotes.length > 0) {
        const vexNotes = bassNotes.map(n => midiToVexFlow(n));
        const keys = vexNotes.map(n => n.key);

        const staveNote = new StaveNote({
          keys: keys,
          duration: 'w',
          clef: 'bass',
        });

        vexNotes.forEach((note, index) => {
          if (note.accidental) {
            staveNote.addModifier(new Accidental(note.accidental), index);
          }
        });

        const voice = new Voice({ num_beats: 4, beat_value: 4 });
        voice.addTickables([staveNote]);
        new Formatter().joinVoices([voice]).format([voice], staveWidth - 50);
        voice.draw(context, bassStave);
      }
    } catch (e) {
      console.error('VexFlow render error:', e, 'activeNotes:', activeNotes);
    }
  }, [activeNotes, width, height]);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '10px',
        minHeight: height,
      }}
    >
      <div ref={wrapperRef} />
    </div>
  );
}
