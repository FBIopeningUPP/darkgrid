const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    }
});

let gameState = {
    phase: 'WAITING_FOR_PLAYERS',
    turn: 1,
    maxTurns: 14,
    players: {
        megacorp: null,
        runners: []
    },
    grid: Array(10).fill().map(() => Array(10).fill(null)),
    traps: {
        iceWalls: [],
        sentries: []
    },
    boardObjects: {
        fuses: [{x: 1, y: 5, active: true}, {x: 8, y: 5, active: true}, {x: 4, y: 4, active: true}],                                                                                           
        vents: [{x: 0, y: 3}, {x: 9, y: 6}],                                                                                                                                                   
        dataNodes: [{x: 2, y: 0, active: true}, {x: 7, y: 0, active: true}]                                                                                                                    
    },
    timer: 0
};

let turnActions = {
    megacorp: { traps: [] },
    runners: {}
};

function transitionPhase(newPhase) {
    gameState.phase = newPhase;
    console.log(`[Phase Change] Transiitoning to: ${newPhase}`);

    if (newPhase === 'PLANNING') {
        if (gameState.turn === 1) {
            gameState.players.runners.forEach(runner => {
                runner.x = Math.floor(Math.random() * 10);
                runner.y = 7 + Math.floor(Math.random() * 3);
            });
        }
        gameState.timer = 30;
        
        const countdown = setInterval(() => {
            gameState.timer--;
            io.emit('timerUpdate', gameState.timer);
            if (gameState.timer <= 0) {
                clearInterval(countdown);
                transitionPhase('EXECUTION');
            }
        }, 1000);
    }
    else if (newPhase === 'EXECUTION') {
        resolveExecutionPhase();
    }
    else if (newPhase === 'RESOLUTION') {
        resolveResolutionPhase();
    }
    io.emit('gameStateSync', getMaskedState());
}

function resolveExecutionPhase() {
    const corpActions = turnActions.megacorp?.traps || [];
    corpActions.forEach(trap => {
        if (trap.type === 'ICE_WALL') gameState.traps.iceWalls.push({ x: trap.x, y: trap.y, active: true });
        else if (trap.type === 'SENTRY') gameState.traps.sentries.push({ x: trap.x, y: trap.y, active: true });
    });

    const runnerIds = gameState.players.runners.map(r => r.id);
    for (let stepIndex = 0; stepIndex < 4; stepIndex++) {
        let desiredMoves = {}; 

        runnerIds.forEach(id => {
            const runner = gameState.players.runners.find(r => r.id === id);
            if (runner.isFrozen) return;

            const actionsQueue = turnActions.runners[id] || [];
            const currentAction = actionsQueue[stepIndex];

            if (currentAction) {
                if (currentAction.action === 'move') {
                    const hitWall = gameState.traps.iceWalls.some(w => w.active && w.x === currentAction.x && w.y === currentAction.y);
                    if (hitWall) {
                        turnActions.runners[id] = []; 
                    } else {
                        const targetKey = `${currentAction.x},${currentAction.y}`;
                        if (!desiredMoves[targetKey]) desiredMoves[targetKey] = [];
                        desiredMoves[targetKey].push({ id, x: currentAction.x, y: currentAction.y });
                    }
                } 
                else if (currentAction.action === 'ability_break' && runner.role === 'Bruiser') {
                    gameState.traps.iceWalls = gameState.traps.iceWalls.filter(w => !(w.x === currentAction.x && w.y === currentAction.y));
                    gameState.traps.sentries = gameState.traps.sentries.filter(s => !(s.x === currentAction.x && s.y === currentAction.y));
                    runner.trace = Math.min(100, runner.trace + 30);
                }
                else if (currentAction.action === 'ability_phase' && runner.role === 'Ghost' && runner.abilityUses > 0) {
                    runner.abilityUses--;
                    const targetKey = `${currentAction.x},${currentAction.y}`;
                    if (!desiredMoves[targetKey]) desiredMoves[targetKey] = [];
                    desiredMoves[targetKey].push({ id, x: currentAction.x, y: currentAction.y });
                }
                else if (currentAction.action === 'ability_spoof' && runner.role === 'Daemon') {
                    const sentry = gameState.traps.sentries.find(s => s.x === currentAction.x && s.y === currentAction.y);
                    if (sentry) sentry.active = false;
                }
            }
        });

        for (const [targetKey, competitors] of Object.entries(desiredMoves)) {
            const winner = competitors[0];
            const runner = gameState.players.runners.find(r => r.id === winner.id);
            runner.x = winner.x;
            runner.y = winner.y;

            const node = gameState.boardObjects.dataNodes.find(d => d.active && d.x === runner.x && d.y === runner.y);
            if (node && !runner.hasData) {
                node.active = false;
                runner.hasData = true;
                runner.trace = Math.min(100, runner.trace + 20);
            }

            const vent = gameState.boardObjects.vents.find(v => v.x === runner.x && v.y === runner.y);
            if (vent) {
                const otherVent = gameState.boardObjects.vents.find(v => v.x !== vent.x || v.y !== vent.y);
                runner.x = otherVent.x;
                runner.y = otherVent.y;
                turnActions.runners[runner.id] = [];
            }
            
            for (let i = 1; i < competitors.length; i++) {
                turnActions.runners[competitors[i].id] = []; 
            }
        }
    }

    turnActions = { megacorp: { traps: [] }, runners: {} };

    setTimeout(() => {
        transitionPhase('RESOLUTION');
    }, 2000); 
}

function resolveResolutionPhase() {
    gameState.corpCredits = (gameState.corpCredits ?? 100) + 50; 
    const { runners } = gameState.players;

    runners.forEach(runner => {
        if (runner.isFrozen) return;
        
        const spotted = gameState.traps.sentries.some(s => 
            s.active && Math.abs(s.x - runner.x) <= 1 && Math.abs(s.y - runner.y) <= 1
        );

        if (spotted) {
            runner.trace = Math.min(100, runner.trace + 15);
            io.to(gameState.players.megacorp).emit('runnerSpotted', { 
                id: runner.id, x: runner.x, y: runner.y 
            });
        }
        
        if (runner.trace >= 100) runner.isFrozen = true;
    });

    const allFrozen = runners.every(r => r.isFrozen);
    const escapedRunners = runners.filter(r => r.hasData && r.y >= 7); 
    
    if (allFrozen || gameState.turn > gameState.maxTurns) {
        return io.emit('gameOver', { winner: 'Megacorp' });
    }
    
    if (escapedRunners.length >= 2) {
        return io.emit('gameOver', { winner: 'Runners' });
    }

    setTimeout(() => {
        gameState.turn++;
        transitionPhase('PLANNING');
    }, 2000);
}

function getMaskedState() {
    return gameState;
}

io.on('connection', (socket) => {
    socket.on('joinGame', (requestedRole) => {
        if (requestedRole === 'megacorp' && !gameState.players.megacorp) {
            gameState.players.megacorp = socket.id;
            socket.emit('roleAssigned', 'megacorp');
        }
        else if (requestedRole === 'runner' && gameState.players.runners.length < 3) {
            const classes = ['Ghost', 'Bruiser', 'Daemon'];
            const assignedClass = classes[gameState.players.runners.length];

            gameState.players.runners.push({
                id: socket.id,
                role: 'unassigned',
                x: -1, y: -1,
                trace: 0,
                isFrozen: false,
                hasData: false,
                abilityUses: assignedClass === 'Ghost' ? 1 : 99
            });
            socket.emit('roleAssigned', 'runner');
        } else {
            socket.emit('error', 'Lobby full or role taken');
        }
        if (gameState.players.megacorp && gameState.players.runners.length === 3) {
            if (gameState.phase === 'WAITING_FOR_PLAYERS') {
                transitionPhase('PLANNING');
            }
        }
    });

    socket.on('submitActions', (actions) => {
        if (gameState.phase !== 'PLANNING') return; 

        if (gameState.players.megacorp === socket.id) {
            turnActions.megacorp = actions;
        } else {
            const isRunner = gameState.players.runners.find(r => r.id === socket.id);
            if (isRunner) {
                turnActions.runners[socket.id] = actions;
            }
        }

        const allRunnersReady = gameState.players.runners.every(r => turnActions.runners[r.id]);
        const corpReady = !!turnActions.megacorp;

        if (allRunnersReady && corpReady) {
            gameState.timer = 0; 
        }
    });

    socket.on('disconect', () => {
        if (gameState.players.megacorp === socket.id) gameState.players.megacorp = null;
        gameState.players.runners = gameState.players.runners.filter(r => r.id !== socket.id);
    });

    socket.on('sendChat', (message) => {
        const runner = gameState.players.runners.find(r => r.id === socket.id);
        if (!runner || runner.isFrozen) return;
        runner.trace = Math.min(100, runner.trace + 2);

        const intercepted = gameState.traps.sentries.some(s =>
            s.active && Math.abs(s.x - runner.x) <= 1 && Math.abs(s.y - runner.y) <= 1
        );

        const chatData = {senderId: runner.id, text: message, intercepted};

        gameState.players.runners.forEach(r => {
            io.to(r.id).emit('chatMessage', chatData);
        });

        if (intercepted && gameState.players.megacorp) {
            io.to(gameState.players.megacorp).emit('chatMessage', chatData);
        }

        io.emit('gameStateSync', getMaskedState());
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Darkgrid scecure backend runing on port ${PORT}`);
});