const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ORIGIN = process.env.CLIENT_URL || 'http://localhost:3000';

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store rooms and game states
const rooms = new Map();

// Create a full deck of 52 cards
const createDeck = () => {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  
  for (let suit of suits) {
    for (let value of values) {
      let numValue = parseInt(value);
      if (value === 'A') numValue = 11;
      else if (['J', 'Q', 'K'].includes(value)) numValue = 10;
      
      deck.push({ suit, value, numValue });
    }
  }
  
  return deck;
};

// Shuffle the deck
const shuffleDeck = (deck) => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Helper function to calculate score
const calculateScore = (cards) => {
  let score = 0;
  let aces = 0;
  
  cards.forEach(card => {
    if (card.value === 'A') {
      aces++;
      score += 11;
    } else {
      score += card.numValue;
    }
  });
  
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  
  return score;
};

// Generate room ID
const generateRoomId = () => {
  let roomId;
  do {
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
};

// Start a new round in existing room
const startNewRound = (room) => {
  // Check if we need to shuffle (less than 10 cards left)
  let deckShuffled = false;
  if (room.deck.length < 10) {
    room.deck = shuffleDeck(createDeck());
    deckShuffled = true;
  }
  
  // Draw 4 cards for the new round
  const player1Cards = [room.deck.pop(), room.deck.pop()];
  const player2Cards = [room.deck.pop(), room.deck.pop()];
  
  // Alternate who goes first
  room.roundNumber++;
  const firstPlayer = room.roundNumber % 2 === 1 ? 'player1' : 'player2';
  
  room.gameState = {
    players: {
      player1: {
        cards: player1Cards,
        stopped: false,
        score: calculateScore(player1Cards)
      },
      player2: {
        cards: player2Cards,
        stopped: false,
        score: calculateScore(player2Cards)
      }
    },
    currentTurn: firstPlayer,
    gameStarted: true,
    gameOver: false,
    winner: null,
    deckShuffled,
    cardsRemaining: room.deck.length
  };
  
  return room.gameState;
};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Create Room
  socket.on('CREATE_ROOM', () => {
    const roomId = generateRoomId();
    
    const room = {
      id: roomId,
      player1: socket.id,
      player2: null,
      deck: shuffleDeck(createDeck()),
      roundNumber: 0,
      gameState: {
        players: {
          player1: {
            cards: [],
            stopped: false,
            score: 0
          },
          player2: null
        },
        currentTurn: null,
        gameStarted: false,
        gameOver: false,
        winner: null,
        deckShuffled: false,
        cardsRemaining: 52
      }
    };
    
    rooms.set(roomId, room);
    socket.join(roomId);
    
    socket.emit('ROOM_CREATED', { 
      roomId, 
      playerId: 'player1',
      gameState: room.gameState 
    });
    
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // Join Room
  socket.on('JOIN_ROOM', ({ roomId }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('ERROR', { message: 'Room not found' });
      return;
    }
    
    if (room.player2) {
      socket.emit('ERROR', { message: 'Room is full' });
      return;
    }
    
    room.player2 = socket.id;
    socket.join(roomId);
    
    // Start first round
    const gameState = startNewRound(room);
    
    // Send to player 2
    socket.emit('GAME_STARTED', { 
      roomId,
      playerId: 'player2',
      gameState 
    });
    
    // Send to player 1
    io.to(room.player1).emit('GAME_STARTED', { 
      roomId,
      playerId: 'player1',
      gameState 
    });
    
    console.log(`Player 2 joined room ${roomId}. Game started!`);
  });

  // Hit (Draw Card)
  socket.on('HIT', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      return;
    }
    
    // Check if this player has already stopped
    if (room.gameState.players[playerId].stopped) {
      socket.emit('ERROR', { message: 'You already stood' });
      return;
    }
    
    // Check if deck is empty
    if (room.deck.length === 0) {
      room.deck = shuffleDeck(createDeck());
      room.gameState.deckShuffled = true;
    }
    
    const newCard = room.deck.pop();
    room.gameState.players[playerId].cards.push(newCard);
    room.gameState.players[playerId].score = calculateScore(room.gameState.players[playerId].cards);
    room.gameState.cardsRemaining = room.deck.length;
    
    // Determine next turn
    const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
    
    // If the other player has stopped, keep the turn with current player
    // Otherwise, switch turn
    if (room.gameState.players[otherPlayer].stopped) {
      room.gameState.currentTurn = playerId;
    } else {
      room.gameState.currentTurn = otherPlayer;
    }
    
    // Broadcast to both players
    io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} hit in room ${roomId}. Cards remaining: ${room.deck.length}`);
  });

  // Stand (Stop)
  socket.on('STAND', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      return;
    }
    
    // Check if this player has already stopped
    if (room.gameState.players[playerId].stopped) {
      socket.emit('ERROR', { message: 'You already stood' });
      return;
    }
    
    room.gameState.players[playerId].stopped = true;
    
    const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
    
    // Check if both players stopped
    if (room.gameState.players[otherPlayer].stopped) {
      // Game over - calculate winner
      const p1Score = room.gameState.players.player1.score;
      const p2Score = room.gameState.players.player2.score;
      
      let winner = null;
      if (p1Score > 21 && p2Score > 21) {
        winner = 'draw';
      } else if (p1Score > 21) {
        winner = 'player2';
      } else if (p2Score > 21) {
        winner = 'player1';
      } else if (p1Score > p2Score) {
        winner = 'player1';
      } else if (p2Score > p1Score) {
        winner = 'player2';
      } else {
        winner = 'draw';
      }
      
      room.gameState.gameOver = true;
      room.gameState.winner = winner;
      
      console.log(`Round over in room ${roomId}. Winner: ${winner}`);
    } else {
      // Other player hasn't stopped yet, give them the turn
      room.gameState.currentTurn = otherPlayer;
    }
    
    // Broadcast to both players
    io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} stood in room ${roomId}`);
  });

  // Play Again (New Round)
  socket.on('PLAY_AGAIN', ({ roomId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.player2) {
      socket.emit('ERROR', { message: 'Room not ready' });
      return;
    }
    
    // Start new round
    const gameState = startNewRound(room);
    
    // Broadcast to both players
    io.to(roomId).emit('NEW_ROUND', { gameState });
    
    console.log(`New round started in room ${roomId}. Round #${room.roundNumber}. Cards remaining: ${room.deck.length}`);
  });

  // Leave Room
  socket.on('LEAVE_ROOM', ({ roomId }) => {
    const room = rooms.get(roomId);
    
    if (room) {
      // Notify other player
      io.to(roomId).emit('PLAYER_LEFT', { 
        message: 'Other player left the room' 
      });
      
      // Delete the room
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted - player left`);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Find and clean up rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.player1 === socket.id || room.player2 === socket.id) {
        // Notify other player
        io.to(roomId).emit('PLAYER_DISCONNECTED', { 
          message: 'Other player disconnected' 
        });
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted due to disconnect`);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});