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

// Get deck statistics
const getDeckStatistics = (deck) => {
  const stats = {};
  deck.forEach(card => {
    const key = card.value;
    if (!stats[key]) {
      stats[key] = 0;
    }
    stats[key]++;
  });
  return stats;
};

// Check if game should end and calculate winner
const checkGameEnd = (room) => {
  const p1 = room.gameState.players.player1;
  const p2 = room.gameState.players.player2;
  
  const p1Busted = p1.score > 21;
  const p2Busted = p2.score > 21;
  
  if (p1.stopped && p2.stopped) {
    room.gameState.gameOver = true;
    
    if (p1Busted && p2Busted) {
      room.gameState.winner = 'draw';
    } 
    else if (p1Busted) {
      room.gameState.winner = 'player2';
      room.scores.player2++;
    } 
    else if (p2Busted) {
      room.gameState.winner = 'player1';
      room.scores.player1++;
    }
    else if (p1.score > p2.score) {
      room.gameState.winner = 'player1';
      room.scores.player1++;
    } else if (p2.score > p1.score) {
      room.gameState.winner = 'player2';
      room.scores.player2++;
    } else {
      room.gameState.winner = 'draw';
    }
    
    room.gameState.scores = room.scores;
    return true;
  }
  
  return false;
};

// Start a new round in existing room
const startNewRound = (room) => {
  let deckShuffled = false;
  if (room.deck.length < 10) {
    room.deck = shuffleDeck(createDeck());
    deckShuffled = true;
  }
  
  const player1Cards = [room.deck.pop(), room.deck.pop()];
  const player2Cards = [room.deck.pop(), room.deck.pop()];
  
  room.roundNumber++;
  const firstPlayer = room.roundNumber % 2 === 1 ? 'player1' : 'player2';
  
  room.gameState = {
    players: {
      player1: {
        cards: player1Cards,
        stopped: false,
        score: calculateScore(player1Cards),
        wantsRematch: false,
        specialCardsRemaining: 6
      },
      player2: {
        cards: player2Cards,
        stopped: false,
        score: calculateScore(player2Cards),
        wantsRematch: false,
        specialCardsRemaining: 6
      }
    },
    currentTurn: firstPlayer,
    gameStarted: true,
    gameOver: false,
    winner: null,
    deckShuffled,
    cardsRemaining: room.deck.length,
    scores: room.scores
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
      scores: {
        player1: 0,
        player2: 0
      },
      gameState: {
        players: {
          player1: {
            cards: [],
            stopped: false,
            score: 0,
            wantsRematch: false,
            specialCardsRemaining: 6
          },
          player2: null
        },
        currentTurn: null,
        gameStarted: false,
        gameOver: false,
        winner: null,
        deckShuffled: false,
        cardsRemaining: 52,
        scores: {
          player1: 0,
          player2: 0
        }
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
    
    const gameState = startNewRound(room);
    
    socket.emit('GAME_STARTED', { 
      roomId,
      playerId: 'player2',
      gameState 
    });
    
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
    
    if (room.gameState.currentTurn !== playerId) {
      socket.emit('ERROR', { message: 'Not your turn!' });
      return;
    }
    
    if (room.gameState.players[playerId].stopped) {
      socket.emit('ERROR', { message: 'You already stood' });
      return;
    }
    
    if (room.deck.length === 0) {
      room.deck = shuffleDeck(createDeck());
      room.gameState.deckShuffled = true;
    }
    
    const newCard = room.deck.pop();
    room.gameState.players[playerId].cards.push(newCard);
    room.gameState.players[playerId].score = calculateScore(room.gameState.players[playerId].cards);
    room.gameState.cardsRemaining = room.deck.length;
    
    const busted = room.gameState.players[playerId].score > 21;
    
    if (busted) {
      room.gameState.players[playerId].stopped = true;
    }
    
    const gameEnded = checkGameEnd(room);
    
    if (!gameEnded) {
      const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
      
      if (room.gameState.players[otherPlayer].stopped) {
        room.gameState.currentTurn = playerId;
      } else {
        room.gameState.currentTurn = otherPlayer;
      }
    }
    
    io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} hit in room ${roomId}. Score: ${room.gameState.players[playerId].score}${busted ? ' (BUSTED)' : ''}. Cards remaining: ${room.deck.length}`);
  });

  // Stand (Stop)
  socket.on('STAND', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      return;
    }
    
    if (room.gameState.currentTurn !== playerId) {
      socket.emit('ERROR', { message: 'Not your turn!' });
      return;
    }
    
    if (room.gameState.players[playerId].stopped) {
      socket.emit('ERROR', { message: 'You already stood' });
      return;
    }
    
    room.gameState.players[playerId].stopped = true;
    
    const gameEnded = checkGameEnd(room);
    
    if (!gameEnded) {
      const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
      room.gameState.currentTurn = otherPlayer;
    }
    
    io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} stood in room ${roomId}`);
  });

  // Use Special Card
  socket.on('USE_SPECIAL_CARD', ({ roomId, playerId, cardType, data }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      socket.emit('ERROR', { message: 'Cannot use special card now' });
      return;
    }
    
    if (room.gameState.currentTurn !== playerId) {
      socket.emit('ERROR', { message: 'Not your turn!' });
      return;
    }
    
    if (room.gameState.players[playerId].stopped) {
      socket.emit('ERROR', { message: 'You already stood' });
      return;
    }
    
    if (room.gameState.players[playerId].specialCardsRemaining <= 0) {
      socket.emit('ERROR', { message: 'No special cards remaining!' });
      return;
    }
    
    const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
    
    // Handle different card types
    if (cardType === 'swap') {
      const { myCardIndex, opponentCardIndex } = data;
      
      if (
        myCardIndex === undefined || 
        opponentCardIndex === undefined ||
        myCardIndex < 0 || 
        myCardIndex >= room.gameState.players[playerId].cards.length ||
        opponentCardIndex < 0 || 
        opponentCardIndex >= room.gameState.players[otherPlayer].cards.length
      ) {
        socket.emit('ERROR', { message: 'Invalid card selection' });
        return;
      }
      
      const temp = room.gameState.players[playerId].cards[myCardIndex];
      room.gameState.players[playerId].cards[myCardIndex] = room.gameState.players[otherPlayer].cards[opponentCardIndex];
      room.gameState.players[otherPlayer].cards[opponentCardIndex] = temp;
      
      room.gameState.players[playerId].score = calculateScore(room.gameState.players[playerId].cards);
      room.gameState.players[otherPlayer].score = calculateScore(room.gameState.players[otherPlayer].cards);
      
      room.gameState.players[playerId].specialCardsRemaining--;
      
      console.log(`${playerId} used SWAP card in room ${roomId}`);
      
      const busted = room.gameState.players[playerId].score > 21;
      if (busted) {
        room.gameState.players[playerId].stopped = true;
      }
      
      const gameEnded = checkGameEnd(room);
      
      if (!gameEnded && !busted) {
        if (!room.gameState.players[otherPlayer].stopped) {
          room.gameState.currentTurn = otherPlayer;
        }
      }
      
      io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    }
    else if (cardType === 'peek') {
      if (room.deck.length === 0) {
        socket.emit('ERROR', { message: 'Deck is empty!' });
        return;
      }
      
      const nextCard = room.deck[room.deck.length - 1];
      
      room.gameState.players[playerId].specialCardsRemaining--;
      
      socket.emit('SPECIAL_CARD_RESULT', {
        cardType: 'peek',
        data: { nextCard }
      });
      
      io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
      
      console.log(`${playerId} used PEEK card in room ${roomId}. Next card: ${nextCard.value}${nextCard.suit}`);
    }
    else if (cardType === 'oracle') {
      const opponentHiddenCard = room.gameState.players[otherPlayer].cards[0];
      
      room.gameState.players[playerId].specialCardsRemaining--;
      
      socket.emit('SPECIAL_CARD_RESULT', {
        cardType: 'oracle',
        data: { hiddenCard: opponentHiddenCard }
      });
      
      io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
      
      console.log(`${playerId} used ORACLE card in room ${roomId}. Hidden card: ${opponentHiddenCard.value}${opponentHiddenCard.suit}`);
    }
    else if (cardType === 'statistic') {
      const deckStats = getDeckStatistics(room.deck);
      const totalCards = room.deck.length;
      
      room.gameState.players[playerId].specialCardsRemaining--;
      
      socket.emit('SPECIAL_CARD_RESULT', {
        cardType: 'statistic',
        data: { 
          statistics: deckStats,
          totalCards
        }
      });
      
      io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
      
      console.log(`${playerId} used STATISTIC card in room ${roomId}. Total cards: ${totalCards}`);
    }
    else if (cardType === 'glitch') {
      const { targetCardIndex } = data;
      
      if (
        targetCardIndex === undefined ||
        targetCardIndex < 0 || 
        targetCardIndex >= room.gameState.players[otherPlayer].cards.length
      ) {
        socket.emit('ERROR', { message: 'Invalid card selection' });
        return;
      }
      
      const randomValue = Math.floor(Math.random() * 11) + 1;
      const targetCard = room.gameState.players[otherPlayer].cards[targetCardIndex];
      const oldValue = targetCard.numValue;
      
      targetCard.numValue = randomValue;
      targetCard.value = randomValue.toString();
      
      room.gameState.players[otherPlayer].score = calculateScore(room.gameState.players[otherPlayer].cards);
      
      room.gameState.players[playerId].specialCardsRemaining--;
      
      console.log(`${playerId} used GLITCH card in room ${roomId}. Changed card from ${oldValue} to ${randomValue}`);
      
      const busted = room.gameState.players[playerId].score > 21;
      if (busted) {
        room.gameState.players[playerId].stopped = true;
      }
      
      const gameEnded = checkGameEnd(room);
      
      if (!gameEnded && !busted) {
        if (!room.gameState.players[otherPlayer].stopped) {
          room.gameState.currentTurn = otherPlayer;
        }
      }
      
      io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    }
    else if (cardType === 'tothemoon') {
      const { myCardIndex, newValue } = data;
      
      if (
        myCardIndex === undefined ||
        myCardIndex < 0 || 
        myCardIndex >= room.gameState.players[playerId].cards.length ||
        newValue === undefined ||
        newValue < 1 ||
        newValue > 11
      ) {
        socket.emit('ERROR', { message: 'Invalid card or value selection' });
        return;
      }
      
      const targetCard = room.gameState.players[playerId].cards[myCardIndex];
      const oldValue = targetCard.numValue;
      
      targetCard.numValue = newValue;
      targetCard.value = newValue.toString();
      
      room.gameState.players[playerId].score = calculateScore(room.gameState.players[playerId].cards);
      
      room.gameState.players[playerId].specialCardsRemaining--;
      
      console.log(`${playerId} used TOTHEMOON card in room ${roomId}. Changed card from ${oldValue} to ${newValue}`);
      
      const busted = room.gameState.players[playerId].score > 21;
      if (busted) {
        room.gameState.players[playerId].stopped = true;
      }
      
      const gameEnded = checkGameEnd(room);
      
      if (!gameEnded && !busted) {
        if (!room.gameState.players[otherPlayer].stopped) {
          room.gameState.currentTurn = otherPlayer;
        }
      }
      
      io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    }
  });

  // Play Again (New Round)
  socket.on('PLAY_AGAIN', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.player2) {
      socket.emit('ERROR', { message: 'Room not ready' });
      return;
    }
    
    if (!room.gameState.gameOver) {
      socket.emit('ERROR', { message: 'Game is not over yet' });
      return;
    }
    
    room.gameState.players[playerId].wantsRematch = true;
    
    const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
    
    if (room.gameState.players[otherPlayer].wantsRematch) {
      const gameState = startNewRound(room);
      io.to(roomId).emit('NEW_ROUND', { gameState });
      console.log(`New round started in room ${roomId}. Round #${room.roundNumber}. Score: ${room.scores.player1}-${room.scores.player2}`);
    } else {
      io.to(roomId).emit('REMATCH_STATUS', { 
        gameState: room.gameState 
      });
      console.log(`${playerId} wants rematch in room ${roomId}. Waiting for other player.`);
    }
  });

  // Leave Room
  socket.on('LEAVE_ROOM', ({ roomId }) => {
    const room = rooms.get(roomId);
    
    if (room) {
      io.to(roomId).emit('PLAYER_LEFT', { 
        message: 'Other player left the room' 
      });
      
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted - player left`);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.player1 === socket.id || room.player2 === socket.id) {
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