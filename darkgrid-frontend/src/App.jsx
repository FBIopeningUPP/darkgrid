import React, {useState, useEffect} from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [role, setRole] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [queuedActions, setQueuedActions] = useState([]);
  const [actionMode, setActionMode] = useState('move');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    setQueuedActions([]);
  }, [gameState?.turn]);

  useEffect(() => {
    socket.on('roleAssigned', (assignedRole) => {
      setRole(assignedRole);
    });
    socket.on('gameStateSync', (state) => {
      setGameState(state);
    });
    socket.on('chatMessage', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });
    socket.on('gameOver', ({winner}) => {
      alert(`${winner} Wins!`);
    });
    return () => {
      socket.off('roleAssigned');
      socket.off('gameStateSync');
      socket.off('gameOver');
      socket.off('chatMessage');
    };
  }, []);

  const joinGame = (selectedRole) => {
    socket.emit('joinGame', selectedRole);
  };

  if (!role) {
    return (
      <div className="lobby">
        <h1>DarkGrid</h1>
        <p>Status: {socket.connected ? 'Connected to Server' : 'Connecting...'}</p>
        <button onClick={() => joinGame('megacorp')}>Join as Megacorp</button>
        <button onClick={() => joinGame('runner')}>Join as Runner</button>                                                                                                             
      </div>
    );
  }
  if(!gameState) return <div className="lobby">Loading Cyber-Grid...</div>;
  
  const renderGrid = () => {
    let tiles = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        let zoneClass='';
        if (y <= 2) zoneClass = 'zone-vault';
        else if (y >= 3 && y <= 6) zoneClass = 'zone-firewall';
        else if (y >= 7) zoneClass = 'zone-slums';

        const isRunner = gameState.players.runners.find(r => r.x === x && r.y === y);                                                                                                          
        const isIceWall = gameState.traps.iceWalls.find(w => w.active && w.x === x && w.y === y);                                                                                              
        const isSentry = gameState.traps.sentries.find(s => s.active && s.x === x && s.y === y);                                                                                               
        const isQueued = queuedActions.find(a => a.x === x && a.y === y);                                                                                                                      
                                                                                                                                                                                                   
        const isFuse = gameState.boardObjects.fuses.find(f => f.x === x && f.y === y && f.active);                                                                                             
        const isVent = gameState.boardObjects.vents.find(v => v.x === x && v.y === y);                                                                                                         
        const isData = gameState.boardObjects.dataNodes.find(d => d.x === x && d.y === y && d.active);   

        let content = '';                                                                                                                                                                      
        if (isRunner) content = '🏃';                                                                                                                                                          
        else if (isIceWall) content = '🧊';                                                                                                                                                    
        else if (isSentry) content = '👁️';                                                                                                                                                     
        else if (isData) content = '💾';
        else if (isFuse) content = '⚡';
        else if (isVent) content = '🕳️';
        else if (isQueued) {
            if (role === 'runner') content = '📍';
            else if (role === 'megacorp') content = isQueued.type === 'ICE_WALL' ? '🧊' : '👁️';
        }

        tiles.push(
          <div
            key={`${x}-${y}`}                                                                                                                                                                  
            className={`tile ${zoneClass}`}                                                                                                                                                    
            onClick={() => handleTileClick(x, y)}                                                                                                                                              
          >
            {content}
          </div>
        );
      }
    }
    return tiles;
  };

  const handleTileClick = (x, y) => {
    if (gameState.phase !== 'PLANNING') return;
    
    if (role === 'runner') {
      if (queuedActions.length >= 3) return;
      setQueuedActions([...queuedActions, { action: actionMode, x, y }]);
    } else if (role === 'megacorp') {
      if (queuedActions.length >= 2) return;
      const type = queuedActions.length === 0 ? 'ICE_WALL' : 'SENTRY';
      setQueuedActions([...queuedActions, { type, x, y }]);
    }
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit('sendChat', chatInput);
    setChatInput('');
  };

  const lockInTurn = () => {
    socket.emit('submitActions', role === 'megacorp' ? { traps: queuedActions } : queuedActions);
  };

  return (                                                                                                                                                                                     
    <div className="game-container">
      <div className="sidebar">
        <h2>{role.toUpperCase()}</h2>
        <div className="status-box">
          <p>Phase: <span className="highlight">{gameState.phase}</span></p>
          <p>Turn: {gameState.turn} / {gameState.maxTurns}</p>
          {gameState.phase === 'PLANNING' && <p>Time Left: {gameState.timer}s</p>}
          {role === 'megacorp' && <p>Credits: {gameState.corpCredits || 100}</p>}
          {role === 'runner' && (
            <>
              <p>Trace: <span style={{ color: 'red' }}>{gameState.players.runners.find(r => r.id === socket.id)?.trace || 0}%</span></p>
              <p>Carrying Data: {gameState.players.runners.find(r => r.id === socket.id)?.hasData ? 'YES 💾' : 'NO'}</p>
              <p>Status: {gameState.players.runners.find(r => r.id === socket.id)?.isFrozen ? '❄️ FROZEN' : 'ACTIVE'}</p>
            </>
          )}

          <div className='burner-phone' style={{marginTop: '20px', borderTop: '2px solid #0f0', paddingTop: '10ox'}}>
            <h3>Burner Phone</h3>
            <div className="chat-box" style={{height: '150px', overflowY: 'auto', background: '#000', border: '1px solid #333', padding: '5px'}}>
              {chatMessages.map((msg, i) => (
                <p key={i} style={{ color: msg.intercepted && role === 'megacorp' ? 'red' : '#0f0', margin: '2px 0', fontSize: '12px' }}>
                  {msg.intercepted && role === 'megacorp' ? '[INTERCEPTED]' : '>'}
                  {msg.text}
                </p>
              ))}
            </div>
            {role === 'runner' && (
              <div style={{ display: 'flex', marginTop: '5px' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                  style={{flex:1, background:'#111', color: '#0f0', border: '1px solid #0f0', outline: 'none'}}
                  placeholder="Send Messsage(+2 trace)..."
                />
                <button onClick={sendChat} style={{margin: '0 0 0 5px', padding: '5px'}}>SEND</button>
              </div>
            )}
          </div>
        </div>
        
        {gameState.phase === 'PLANNING' && (
          <div style={{ marginTop: '20px' }}>
            <p>Actions Queued: {queuedActions.length}</p>
            {role === 'runner' && (
              <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <p>Mode:</p>
                <button onClick={() => setActionMode('move')} style={{ background: actionMode === 'move' ? '#0f0' : '#000', color: actionMode === 'move' ? '#000' : '#0f0', margin: '0' }}>Move Step</button>
                <button onClick={() => setActionMode('ability_break')} style={{ background: actionMode === 'ability_break' ? '#0f0' : '#000', color: actionMode === 'ability_break' ? '#000' : '#0f0', margin: '0' }}>[Bruiser] Break Wall</button>
                <button onClick={() => setActionMode('ability_phase')} style={{ background: actionMode === 'ability_phase' ? '#0f0' : '#000', color: actionMode === 'ability_phase' ? '#000' : '#0f0', margin: '0' }}>[Ghost] Phase Wall</button>
                <button onClick={() => setActionMode('ability_spoof')} style={{ background: actionMode === 'ability_spoof' ? '#0f0' : '#000', color: actionMode === 'ability_spoof' ? '#000' : '#0f0', margin: '0' }}>[Daemon] Blind Sentry</button>
              </div>
            )}
            <button onClick={lockInTurn}>LOCK IN</button>
            <button onClick={() => setQueuedActions([])}>CLEAR</button>
          </div>
        )}
      </div>

      <div className="board">
        <div className="grid">
          {renderGrid()}
        </div>
       </div>
    </div>
  );
}

export default App;