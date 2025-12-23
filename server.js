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

// Special card types
const specialCardTypes = [
  { id: 'swap', name: 'The Swap' },
  { id: 'peek', name: 'The Peek' },
  { id: 'oracle', name: 'The Oracle' },
  { id: 'statistic', name: 'The Statistic' },
  { id: 'glitch', name: 'The Glitch' },
  { id: 'moon', name: 'To The Moon' },
  { id: 'bonus', name: 'Fan Card Bonus' }
];

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

// Assign random special cards to players
const assignSpecialCards = () => {
  const numCards = Math.random() > 0.5 ? 2 : 1;
  const shuffled = shuffleDeck([...specialCardTypes]);
  return shuffled.slice(0, numCards).map(sc => ({ ...sc, used: false }));
};

// Check if game should end and calculate winner
const checkGameEnd = (room) => {
  const p1 = room.gameState.players.player1;
  const p2 = room.gameState.players.player2;
  
  // Check if anyone busted (over 21)
  const p1Busted = p1.score > 21;
  const p2Busted = p2.score > 21;
  
  // Game only ends when BOTH players have stopped (either manually or by busting)
  if (p1.stopped && p2.stopped) {
    room.gameState.gameOver = true;
    
    // If both busted, it's a draw
    if (p1Busted && p2Busted) {
      room.gameState.winner = 'draw';
    } 
    // If only player 1 busted, player 2 wins
    else if (p1Busted) {
      room.gameState.winner = 'player2';
      room.scores.player2++;
    } 
    // If only player 2 busted, player 1 wins
    else if (p2Busted) {
      room.gameState.winner = 'player1';
      room.scores.player1++;
    }
    // If neither busted, compare scores
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
  // Check if we need to shuffle (less than 10 cards left)
  let deckShuffled = false;
  if (room.deck.length < 10) {
    room.deck = shuffleDeck(createDeck());
    deckShuffled = true;
  }
  
  // Draw 4 cards for the new round
  const player1Cards = [room.deck.pop(), room.deck.pop()];
  const player2Cards = [room.deck.pop(), room.deck.pop()];
  
  // Assign special cards to both players
  const player1SpecialCards = assignSpecialCards();
  const player2SpecialCards = assignSpecialCards();
  
  // Alternate who goes first
  room.roundNumber++;
  const firstPlayer = room.roundNumber % 2 === 1 ? 'player1' : 'player2';
  
  room.gameState = {
    players: {
      player1: {
        cards: player1Cards,
        stopped: false,
        score: calculateScore(player1Cards),
        wantsRematch: false,
        specialCards: player1SpecialCards
      },
      player2: {
        cards: player2Cards,
        stopped: false,
        score: calculateScore(player2Cards),
        wantsRematch: false,
        specialCards: player2SpecialCards
      }
    },
    currentTurn: firstPlayer,
    gameStarted: true,
    gameOver: false,
    winner: null,
    deckShuffled,
    cardsRemaining: room.deck.length,
    scores: room.scores,
    revealedNextCard: null,
    revealedOpponentCard: null,
    deckStats: null
  };
  
  return room.gameState;
};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Create Room
  socket.on('CREATE_ROOM', ({ bet }) => {
    const roomId = generateRoomId();
    
    const room = {
      id: roomId,
      player1: socket.id,
      player2: null,
      deck: shuffleDeck(createDeck()),
      roundNumber: 0,
      bet: bet || 5,
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
            specialCards: []
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
        },
        revealedNextCard: null,
        revealedOpponentCard: null,
        deckStats: null
      }
    };
    
    rooms.set(roomId, room);
    socket.join(roomId);
    
    socket.emit('ROOM_CREATED', { 
      roomId, 
      playerId: 'player1',
      gameState: room.gameState 
    });
    
    console.log(`Room ${roomId} created by ${socket.id} with bet ${bet}`);
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
    
    console.log(`Player 2 joined room ${roomId}. Game started with bet ${room.bet}!`);
  });

  // Hit (Draw Card)
  socket.on('HIT', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      return;
    }
    
    // Check if it's actually this player's turn
    if (room.gameState.currentTurn !== playerId) {
      socket.emit('ERROR', { message: 'Not your turn!' });
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
    }
    
    const newCard = room.deck.pop();
    room.gameState.players[playerId].cards.push(newCard);
    room.gameState.players[playerId].score = calculateScore(room.gameState.players[playerId].cards);
    room.gameState.cardsRemaining = room.deck.length;
    
    // Clear any revealed cards from special abilities
    room.gameState.revealedNextCard = null;
    
    // Check if player busted (over 21)
    const busted = room.gameState.players[playerId].score > 21;
    
    if (busted) {
      // Player busted - automatically stop them
      room.gameState.players[playerId].stopped = true;
    }
    
    // Check if game should end (both players stopped)
    const gameEnded = checkGameEnd(room);
    
    if (!gameEnded) {
      // Game continues - determine next turn
      const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
      
      // If the other player has stopped, keep the turn with current player
      // Otherwise, switch turn
      if (room.gameState.players[otherPlayer].stopped) {
        room.gameState.currentTurn = playerId;
      } else {
        room.gameState.currentTurn = otherPlayer;
      }
    }
    
    // Broadcast to both players
    io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} hit in room ${roomId}. Score: ${room.gameState.players[playerId].score}${busted ? ' (BUSTED)' : ''}. Cards remaining: ${room.deck.length}`);
  });

  // Stand (Stop)
  socket.on('STAND', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      return;
    }
    
    // Check if it's actually this player's turn
    if (room.gameState.currentTurn !== playerId) {
      socket.emit('ERROR', { message: 'Not your turn!' });
      return;
    }
    
    // Check if this player has already stopped
    if (room.gameState.players[playerId].stopped) {
      socket.emit('ERROR', { message: 'You already stood' });
      return;
    }
    
    room.gameState.players[playerId].stopped = true;
    
    // Check if game should end
    const gameEnded = checkGameEnd(room);
    
    if (!gameEnded) {
      const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
      // Other player hasn't stopped yet, give them the turn
      room.gameState.currentTurn = otherPlayer;
    }
    
    // Broadcast to both players
    io.to(roomId).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} stood in room ${roomId}`);
  });

  // Use Special Card
  socket.on('USE_SPECIAL_CARD', ({ roomId, playerId, cardId }) => {
    const room = rooms.get(roomId);
    
    if (!room || !room.gameState.gameStarted || room.gameState.gameOver) {
      return;
    }

    const player = room.gameState.players[playerId];
    const specialCard = player.specialCards.find(sc => sc.id === cardId);
    
    if (!specialCard || specialCard.used) {
      socket.emit('ERROR', { message: 'Special card not available' });
      return;
    }

    // Mark card as used
    specialCard.used = true;
    let message = '';

    const otherPlayerId = playerId === 'player1' ? 'player2' : 'player1';
    const otherPlayer = room.gameState.players[otherPlayerId];

    switch (cardId) {
      case 'swap':
        if (player.cards.length > 0 && otherPlayer.cards.length > 1) {
          const pCardIdx = Math.floor(Math.random() * player.cards.length);
          const oCardIdx = Math.floor(Math.random() * (otherPlayer.cards.length - 1)) + 1;
          
          const tempCard = player.cards[pCardIdx];
          player.cards[pCardIdx] = otherPlayer.cards[oCardIdx];
          otherPlayer.cards[oCardIdx] = tempCard;
          
          player.score = calculateScore(player.cards);
          otherPlayer.score = calculateScore(otherPlayer.cards);
          message = '🔄 Cards Swapped!';
        }
        break;

      case 'peek':
        if (room.deck.length > 0) {
          room.gameState.revealedNextCard = room.deck[room.deck.length - 1];
          message = `👁️ Next Card: ${room.gameState.revealedNextCard.value}${room.gameState.revealedNextCard.suit}`;
        }
        break;

      case 'oracle':
        room.gameState.revealedOpponentCard = otherPlayer.cards[0];
        message = `🔮 Opponent's Hidden: ${room.gameState.revealedOpponentCard.value}${room.gameState.revealedOpponentCard.suit}`;
        break;

      case 'statistic':
        const stats = {};
        room.deck.forEach(card => {
          const key = card.value;
          stats[key] = (stats[key] || 0) + 1;
        });
        room.gameState.deckStats = stats;
        message = '📊 Deck Stats Revealed!';
        break;

      case 'glitch':
        if (otherPlayer.cards.length > 1) {
          const idx = Math.floor(Math.random() * (otherPlayer.cards.length - 1)) + 1;
          otherPlayer.cards[idx].numValue = Math.floor(Math.random() * 11) + 1;
          otherPlayer.score = calculateScore(otherPlayer.cards);
          message = '⚡ Glitch Applied to Opponent!';
        }
        break;

      case 'moon':
        if (player.cards.length > 0) {
          const idx = Math.floor(Math.random() * player.cards.length);
          player.cards[idx].numValue = 10; // Boost to 10
          player.score = calculateScore(player.cards);
          message = '🚀 Card Boosted to 10!';
        }
        break;

      case 'bonus':
        const bonus = Math.floor(Math.random() * 16) + 5;
        message = `🎁 Bonus: +${bonus} Tokens!`;
        break;
    }

    // Broadcast to the player who used the card
    socket.emit('SPECIAL_CARD_RESULT', { gameState: room.gameState, message });
    
    // Broadcast game state to other player (without the message)
    io.to(otherPlayerId === 'player1' ? room.player1 : room.player2).emit('GAME_UPDATE', { gameState: room.gameState });
    
    console.log(`${playerId} used special card ${cardId} in room ${roomId}`);
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
    
    // Mark this player as wanting a rematch
    room.gameState.players[playerId].wantsRematch = true;
    
    const otherPlayer = playerId === 'player1' ? 'player2' : 'player1';
    
    // Check if both players want rematch
    if (room.gameState.players[otherPlayer].wantsRematch) {
      // Both players ready - start new round
      const gameState = startNewRound(room);
      io.to(roomId).emit('NEW_ROUND', { gameState });
      console.log(`New round started in room ${roomId}. Round #${room.roundNumber}. Score: ${room.scores.player1}-${room.scores.player2}`);
    } else {
      // This player is ready, waiting for other player
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