import {useState} from 'react';
import {X} from 'lucide-react';
import {statusApi} from '../api/index.js';
import {errorMessage} from '../api/client.js';
import toast from 'react-hot-toast';

const COLORS = [
  '#6C5CE7', '#a78bfa', '#8b5cf6',
  '#06b6d4', '#0ea5e9', '#3b82f6',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#ec4899',
];

export default function StatusCreator({onClose, onCreated}) {
  const [text, setText] = useState('');
  const [bg, setBg] = useState(COLORS[0]);
  const [fontStyle, setFontStyle] = useState('normal');
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      await statusApi.create({text: text.trim(), backgroundColor: bg, fontStyle});
      toast.success('Status posted!');
      onCreated();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="status-creator-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="status-creator">
        {/* Preview */}
        <div className="status-creator-preview" style={{background: bg}}>
          <button className="icon-btn" onClick={onClose}
            style={{position: 'absolute', top: 12, right: 12, color: '#fffc'}}>
            <X size={22} />
          </button>
          <textarea
            className={fontStyle}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type a status…"
            maxLength={500}
            rows={4}
            autoFocus
          />
        </div>

        {/* Controls */}
        <div className="status-creator-controls">
          {/* Color palette */}
          <div className="color-palette">
            {COLORS.map(c => (
              <div
                key={c}
                className={`color-swatch ${bg === c ? 'active' : ''}`}
                style={{background: c}}
                onClick={() => setBg(c)}
              />
            ))}
          </div>

          {/* Font style */}
          <div className="font-style-toggles">
            <button
              className={fontStyle === 'normal' ? 'active' : ''}
              onClick={() => setFontStyle('normal')}
            >Aa</button>
            <button
              className={fontStyle === 'bold' ? 'active' : ''}
              onClick={() => setFontStyle('bold')}
              style={{fontWeight: 800}}
            >Aa</button>
            <button
              className={fontStyle === 'italic' ? 'active' : ''}
              onClick={() => setFontStyle('italic')}
              style={{fontStyle: 'italic'}}
            >Aa</button>
          </div>

          {/* Post button */}
          <button
            className="status-post-btn"
            onClick={post}
            disabled={!text.trim() || posting}
          >
            {posting ? 'Posting…' : 'Post Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
