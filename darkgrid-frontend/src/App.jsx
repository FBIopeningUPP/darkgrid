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
      }
    }
  }
}