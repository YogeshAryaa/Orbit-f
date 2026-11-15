import {useEffect,useState,useRef,useCallback} from 'react';
import {X,Eye,Trash2} from 'lucide-react';
import Avatar from './Avatar.jsx';
import {statusApi} from '../api/index.js';
import {errorMessage} from '../api/client.js';
import {formatDistanceToNow} from 'date-fns';
import toast from 'react-hot-toast';

const uid = u => String(u?._id || u?.id || u || '');

export default function StatusViewer({statuses, statusUser, startIndex = 0, isMine, onClose}) {
  const [current, setCurrent] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const DURATION = 5000;

  const status = statuses[current];

  const markViewed = useCallback(async (s) => {
    if (!isMine && s) {
      statusApi.view(uid(s)).catch(() => {});
    }
  }, [isMine]);

  const goNext = useCallback(() => {
    if (current < statuses.length - 1) {
      setCurrent(c => c + 1);
      setProgress(0);
      startTimeRef.current = Date.now();
    } else {
      onClose();
    }
  }, [current, statuses.length, onClose]);

  const goPrev = useCallback(() => {
    if (current > 0) {
      setCurrent(c => c - 1);
      setProgress(0);
      startTimeRef.current = Date.now();
    }
  }, [current]);

  // Auto-advance timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    setProgress(0);

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / DURATION, 1);
      setProgress(pct);
      if (pct < 1) {
        timerRef.current = requestAnimationFrame(animate);
      } else {
        goNext();
      }
    };
    timerRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(timerRef.current);
  }, [current, goNext]);

  // Mark viewed on current change
  useEffect(() => {
    if (status) markViewed(status);
  }, [status, markViewed]);

  const handleDelete = async () => {
    try {
      await statusApi.remove(uid(status));
      toast.success('Status deleted');
      if (statuses.length <= 1) {
        onClose();
      } else {
        const newStatuses = statuses.filter((_, i) => i !== current);
        setCurrent(Math.min(current, newStatuses.length - 1));
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goNext, goPrev]);

  if (!status) return null;

  const bg = status.backgroundColor || '#6C5CE7';
  const time = status.createdAt ? formatDistanceToNow(new Date(status.createdAt), {addSuffix: true}) : '';

  return (
    <div className="status-viewer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="status-viewer" style={{background: bg}}>
        {/* Progress bars */}
        <div className="status-progress-bar">
          {statuses.map((_, i) => (
            <span key={i}>
              <div
                className="fill"
                style={{width: i < current ? '100%' : i === current ? `${progress * 100}%` : '0%'}}
              />
            </span>
          ))}
        </div>

        {/* Header */}
        <div className="status-viewer-header">
          <Avatar user={statusUser} />
          <div>
            <b>{statusUser?.displayName || statusUser?.username || 'User'}</b>
            <br />
            <small>{time}</small>
          </div>
          {isMine && (
            <button className="icon-btn" onClick={handleDelete} title="Delete status">
              <Trash2 size={18} />
            </button>
          )}
          <button className="icon-btn" onClick={onClose} title="Close" style={{marginLeft: isMine ? 0 : 'auto'}}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="status-content">
          <p className={status.fontStyle === 'bold' ? 'bold' : status.fontStyle === 'italic' ? 'italic' : ''}>
            {status.text}
          </p>
        </div>

        {/* Footer */}
        {isMine && (
          <div className="status-viewer-footer">
            <Eye size={14} />
            {(status.viewedBy || []).length} view{(status.viewedBy || []).length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Navigation areas */}
        <div className="status-viewer-nav">
          <div className="nav-left" onClick={goPrev} />
          <div className="nav-right" onClick={goNext} />
        </div>
      </div>
    </div>
  );
}
