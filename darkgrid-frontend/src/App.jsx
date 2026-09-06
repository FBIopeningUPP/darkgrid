import React, {useState, useEffect} from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [role, setRole] = useState(null);
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    socket.on('roleAssigned', (assignedRole) => {
      setRole(assignedRole);
    });
    socket.on('gameStateSync', (state) => {
      setGameState(state);
    });
    socket.on('gameOver', ({winner}) => {
      alert(`${winner}Wins!`);
    });
    return () => {
      socket.off('roleAssigned');
      socket.off('gameStateSync');
      socket.off('gameOver');
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
        <button onClick={() => joinGame('megacorp')}>Join as Megacorp</button>    '
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

        let content = '';
        if (isRunner) content = '🏃';
        else if (isIceWall) content = '🧊';                                                                                                                                                    
        else if (isSentry) content = '👁️';

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
    console.log(`Clicked X:${x} Y:${y}`);                                                                                                                                                    
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
        </div>
      </div>

      <div className="board">
        <div className="grid">
          {renderGrid()}
        </div>
       </div>
    </div>
  );
}