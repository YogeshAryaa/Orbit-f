import {useEffect,useState,useCallback} from 'react';
import {Plus,Eye} from 'lucide-react';
import Avatar from './Avatar.jsx';
import StatusViewer from './StatusViewer.jsx';
import StatusCreator from './StatusCreator.jsx';
import {useAuth} from '../context/AuthContext.jsx';
import {statusApi} from '../api/index.js';
import {errorMessage} from '../api/client.js';
import toast from 'react-hot-toast';

const uid = u => String(u?._id || u?.id || u || '');

export default function StatusBar() {
  const {user} = useAuth();
  const [myStatuses, setMyStatuses] = useState([]);
  const [allStatuses, setAllStatuses] = useState([]);
  const [viewerData, setViewerData] = useState(null); // {statuses, user, startIndex}
  const [creatorOpen, setCreatorOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, all] = await Promise.all([statusApi.mine(), statusApi.all()]);
      setMyStatuses(Array.isArray(mine) ? mine : mine?.statuses || []);
      // all is expected to be array of {user, statuses} groups
      const groups = Array.isArray(all) ? all : all?.groups || [];
      setAllStatuses(groups);
    } catch (e) {
      // silent fail, status is optional
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh every 30 seconds
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const handleMyClick = () => {
    if (myStatuses.length > 0) {
      setViewerData({ statuses: myStatuses, user: user, startIndex: 0, isMine: true });
    } else {
      setCreatorOpen(true);
    }
  };

  const handleOtherClick = (group) => {
    setViewerData({ statuses: group.statuses, user: group.user, startIndex: 0, isMine: false });
  };

  const handleStatusCreated = () => {
    setCreatorOpen(false);
    load();
  };

  const handleViewerClose = () => {
    setViewerData(null);
    load(); // Refresh to update viewed state
  };

  const hasMyStatus = myStatuses.length > 0;

  return (
    <>
      <div className="status-bar">
        {/* My Status */}
        <div className="status-avatar-wrap" onClick={handleMyClick}>
          <div className={`status-avatar-ring ${hasMyStatus ? '' : 'no-status'}`}>
            <Avatar user={user} />
            {!hasMyStatus && <span className="status-add-badge"><Plus size={11} /></span>}
          </div>
          <span className="status-name my-status">My Status</span>
        </div>

        {allStatuses.length > 0 && <div className="status-divider" />}

        {/* Others' statuses */}
        {allStatuses.map(group => {
          const allViewed = group.statuses.every(s =>
            (s.viewedBy || []).some(v => uid(v) === uid(user))
          );
          return (
            <div
              key={uid(group.user)}
              className="status-avatar-wrap"
              onClick={() => handleOtherClick(group)}
            >
              <div className={`status-avatar-ring ${allViewed ? 'viewed' : ''}`}>
                <Avatar user={group.user} />
              </div>
              <span className="status-name">
                {group.user?.displayName || group.user?.username || 'User'}
              </span>
            </div>
          );
        })}
      </div>

      {viewerData && (
        <StatusViewer
          statuses={viewerData.statuses}
          statusUser={viewerData.user}
          startIndex={viewerData.startIndex}
          isMine={viewerData.isMine}
          onClose={handleViewerClose}
        />
      )}

      {creatorOpen && (
        <StatusCreator
          onClose={() => setCreatorOpen(false)}
          onCreated={handleStatusCreated}
        />
      )}
    </>
  );
}
