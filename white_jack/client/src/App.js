import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

const App = () => {
  const [screen, setScreen] = useState('home');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');
  const [currentBet, setCurrentBet] = useState(0);
  const [showSpecialCardMenu, setShowSpecialCardMenu] = useState(false);
  const [selectedSpecialCard, setSelectedSpecialCard] = useState(null);
  const ws = useRef(null);

  // Player data stored in localStorage
  const [playerData, setPlayerData] = useState(() => {
    const saved = localStorage.getItem('blackjackRealmsPlayer');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      tokens: 300,
      level: 1,
      rank: 'Noob',
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      dailyStreak: 0,
      lastLogin: null
    };
  });

  const ranks = ['Noob', 'Beginner', 'Skilled', 'Advanced', 'Pro', 'Elite', 'Master', 'Grandmaster', 'Legendary', 'Mythic God'];

  const specialCardTypes = [
    { id: 'swap', name: 'The Swap', icon: '🔄', color: 'purple-pink', description: 'Trade cards with opponent' },
    { id: 'peek', name: 'The Peek', icon: '👁️', color: 'blue-cyan', description: 'See next deck card' },
    { id: 'oracle', name: 'The Oracle', icon: '🔮', color: 'indigo-purple', description: "Reveal opponent's hidden card" },
    { id: 'statistic', name: 'The Statistic', icon: '📊', color: 'green-emerald', description: 'View deck statistics' },
    { id: 'glitch', name: 'The Glitch', icon: '⚡', color: 'red-orange', description: "Randomize opponent's card" },
    { id: 'moon', name: 'To The Moon', icon: '🚀', color: 'yellow-amber', description: 'Change your card value' },
    { id: 'bonus', name: 'Fan Card Bonus', icon: '🎁', color: 'pink-rose', description: 'Gain 5-20 tokens' }
  ];

  // Save player data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('blackjackRealmsPlayer', JSON.stringify(playerData));
  }, [playerData]);

  useEffect(() => {
    checkDailyBonus();
  }, []);

  const checkDailyBonus = () => {
    const today = new Date().toDateString();
    const lastLogin = playerData.lastLogin;
    
    if (lastLogin !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const newStreak = lastLogin === yesterday ? playerData.dailyStreak + 1 : 1;
      
      let bonus = 100;
      let levelBonus = false;
      
      if (newStreak === 7) {
        bonus = 1100;
        levelBonus = true;
        showNotification('🎉 7-Day Streak! +1000 Bonus Tokens + Level Up!');
      } else {
        showNotification(`🎁 Daily Bonus: +${bonus} Tokens! Streak: ${newStreak} days`);
      }
      
      setPlayerData(prev => {
        const newLevel = levelBonus ? prev.level + 1 : prev.level;
        const newRank = ranks[Math.min(newLevel - 1, ranks.length - 1)];
        return {
          ...prev,
          tokens: prev.tokens + bonus,
          dailyStreak: newStreak,
          lastLogin: today,
          level: newLevel,
          rank: newRank
        };
      });
    }
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  useEffect(() => {
    ws.current = io(SOCKET_URL, {
      transports: ['websocket'],
      withCredentials: true,
    });

    ws.current.on('connect', () => {
      console.log('Connected to server');
    });

    ws.current.on('ROOM_CREATED', ({ roomId, playerId, gameState }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setGameState(gameState);
      setScreen('waiting');
    });

    ws.current.on('GAME_STARTED', ({ roomId, playerId, gameState }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setGameState(gameState);
      setScreen('game');
    });

    ws.current.on('GAME_UPDATE', ({ gameState }) => {
      setGameState(gameState);
    });

    ws.current.on('NEW_ROUND', ({ gameState }) => {
      setGameState(gameState);
      setShowSpecialCardMenu(false);
      setSelectedSpecialCard(null);
    });

    ws.current.on('SPECIAL_CARD_RESULT', ({ gameState, message }) => {
      setGameState(gameState);
      if (message) showNotification(message);
    });

    ws.current.on('REMATCH_STATUS', ({ gameState }) => {
      setGameState(gameState);
    });

    ws.current.on('ERROR', ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 3000);
    });

    ws.current.on('PLAYER_DISCONNECTED', ({ message }) => {
      alert(message);
      restartGame();
    });

    ws.current.on('PLAYER_LEFT', ({ message }) => {
      alert(message);
      restartGame();
    });

    return () => {
      if (ws.current) {
        ws.current.disconnect();
      }
    };
  }, []);

  const createRoom = (bet) => {
    if (playerData.tokens < bet) {
      showNotification('❌ Not enough tokens!');
      return;
    }
    setCurrentBet(bet);
    setPlayerData(prev => ({ ...prev, tokens: prev.tokens - bet }));
    ws.current.emit('CREATE_ROOM', { bet });
  };

  const joinRoom = () => {
    if (inputRoomId.trim()) {
      ws.current.emit('JOIN_ROOM', { roomId: inputRoomId.trim() });
    }
  };

  const hit = () => {
    ws.current.emit('HIT', { roomId, playerId });
  };

  const stand = () => {
    ws.current.emit('STAND', { roomId, playerId });
  };

  const useSpecialCard = (cardId) => {
    ws.current.emit('USE_SPECIAL_CARD', { roomId, playerId, cardId });
    setShowSpecialCardMenu(false);
  };

  const playAgain = () => {
    if (playerData.tokens < currentBet) {
      showNotification('❌ Not enough tokens for rematch!');
      return;
    }
    ws.current.emit('PLAY_AGAIN', { roomId, playerId });
  };

  const leaveRoom = () => {
    if (roomId && ws.current) {
      ws.current.emit('LEAVE_ROOM', { roomId });
    }
    
    // Return bet if game hasn't started or is not over
    if (gameState && !gameState.gameStarted) {
      setPlayerData(prev => ({ ...prev, tokens: prev.tokens + currentBet }));
    }
    
    setScreen('home');
    setRoomId('');
    setInputRoomId('');
    setPlayerId(null);
    setGameState(null);
    setCurrentBet(0);
    setError('');
    setShowSpecialCardMenu(false);
  };

  const restartGame = () => {
    leaveRoom();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle game over rewards
  useEffect(() => {
    if (gameState && gameState.gameOver && gameState.rewardsProcessed !== playerId) {
      const winner = gameState.winner;
      let winnings = 0;
      
      if (winner === playerId) {
        winnings = currentBet * 2;
        setPlayerData(prev => ({
          ...prev,
          tokens: prev.tokens + winnings,
          wins: prev.wins + 1,
          gamesPlayed: prev.gamesPlayed + 1
        }));
        showNotification(`🎉 You Win! +${winnings} Tokens`);
      } else if (winner === 'draw') {
        winnings = currentBet;
        setPlayerData(prev => ({
          ...prev,
          tokens: prev.tokens + winnings,
          gamesPlayed: prev.gamesPlayed + 1
        }));
        showNotification(`🤝 Draw! ${winnings} Tokens Returned`);
      } else {
        setPlayerData(prev => ({
          ...prev,
          losses: prev.losses + 1,
          gamesPlayed: prev.gamesPlayed + 1
        }));
        showNotification('😢 You Lose!');
      }
      
      // Mark rewards as processed for this player
      setGameState(prev => ({ ...prev, rewardsProcessed: playerId }));
    }
  }, [gameState?.gameOver]);

  const Card = ({ card, hidden, glowing }) => (
    <div className={`card ${hidden ? 'card-hidden' : 'card-visible'} ${glowing ? 'card-glow' : ''}`}>
      {hidden ? (
        <div className="card-back-content">
          <div className="card-back-pattern"></div>
          <div className="card-back-symbol">🂠</div>
        </div>
      ) : (
        <div className="card-front-content">
          <div className={['♥', '♦'].includes(card.suit) ? 'card-value suit-red' : 'card-value suit-black'}>
            {card.value}
          </div>
          <div className={['♥', '♦'].includes(card.suit) ? 'card-suit suit-red' : 'card-suit suit-black'}>
            {card.suit}
          </div>
        </div>
      )}
    </div>
  );

  const SpecialCard = ({ special, onClick }) => {
    const usedCard = gameState?.players[playerId]?.specialCards?.find(sc => sc.id === special.id);
    const isUsed = usedCard?.used || false;
    
    return (
      <button
        onClick={() => onClick(special.id)}
        disabled={isUsed}
        className={`special-card special-card-${special.color} ${isUsed ? 'special-card-used' : ''}`}
      >
        <div className="special-card-icon">{special.icon}</div>
        <div className="special-card-name">{special.name}</div>
        <div className="special-card-desc">{special.description}</div>
        {isUsed && <div className="special-card-used-badge">USED</div>}
      </button>
    );
  };

  if (screen === 'home') {
    return (
      <div className="screen-container home-screen">
        <div className="stars"></div>
        <div className="home-content">
          <div className="crown-icon">👑</div>
          <h1 className="main-title">BLACKJACK REALMS</h1>
          <p className="main-subtitle">Special Card Edition</p>

          {notification && <div className="notification">{notification}</div>}
          {error && <div className="error-message">{error}</div>}

          <div className="player-stats-grid">
            <div className="stat-box">
              <div className="stat-icon">🪙</div>
              <div className="stat-label">Tokens</div>
              <div className="stat-value stat-value-gold">{playerData.tokens}</div>
            </div>
            <div className="stat-box">
              <div className="stat-icon">🏆</div>
              <div className="stat-label">Rank</div>
              <div className="stat-value stat-value-blue">{playerData.rank}</div>
            </div>
            <div className="stat-box">
              <div className="stat-icon">⭐</div>
              <div className="stat-label">Level</div>
              <div className="stat-value stat-value-purple">{playerData.level}</div>
            </div>
          </div>

          <div className="menu-box">
            <h2 className="menu-title">Select Your Bet</h2>
            <div className="bet-buttons">
              <button onClick={() => createRoom(5)} className="bet-btn bet-low">
                <span className="bet-icon">🪙</span>
                <span className="bet-text">5 Tokens</span>
              </button>
              <button onClick={() => createRoom(10)} className="bet-btn bet-medium">
                <span className="bet-icon">🪙</span>
                <span className="bet-text">10 Tokens</span>
              </button>
              <button onClick={() => createRoom(20)} className="bet-btn bet-high">
                <span className="bet-icon">🪙</span>
                <span className="bet-text">20 Tokens</span>
              </button>
            </div>

            <div className="divider">
              <span className="divider-text">OR</span>
            </div>

            <div className="join-section">
              <input
                type="text"
                placeholder="Enter Room ID"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="room-input"
              />
              <button onClick={joinRoom} className="btn btn-join">
                Join Room
              </button>
            </div>

            <div className="player-record">
              <div>Games: {playerData.gamesPlayed} | W: {playerData.wins} | L: {playerData.losses}</div>
              <div>Daily Streak: {playerData.dailyStreak} days 🔥</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'waiting') {
    return (
      <div className="screen-container waiting-screen">
        <div className="stars"></div>
        <div className="waiting-content">
          <div className="waiting-icon-wrapper">
            <div className="waiting-icon">⏳</div>
          </div>
          
          <h2 className="waiting-title">Waiting for Opponent</h2>
          <p className="waiting-subtitle">Share this room ID with your friend</p>
          <p className="waiting-bet">Bet: {currentBet} Tokens</p>
          
          <div className="room-id-box">
            <div className="room-id">{roomId}</div>
          </div>
          
          <div className="waiting-buttons">
            <button onClick={copyRoomId} className="btn btn-copy">
              {copied ? '✓ Copied!' : '📋 Copy Room ID'}
            </button>
            
            <button onClick={leaveRoom} className="btn btn-leave-small">
              Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game' && gameState) {
    const isMyTurn = gameState.currentTurn === playerId;
    const myCards = gameState.players[playerId]?.cards || [];
    const opponentId = playerId === 'player1' ? 'player2' : 'player1';
    const opponentCards = gameState.players[opponentId]?.cards || [];
    const myScore = gameState.players[playerId]?.score || 0;
    const opponentScore = gameState.players[opponentId]?.score || 0;
    const myStopped = gameState.players[playerId]?.stopped || false;
    const opponentStopped = gameState.players[opponentId]?.stopped || false;
    const myWantsRematch = gameState.players[playerId]?.wantsRematch || false;
    const opponentWantsRematch = gameState.players[opponentId]?.wantsRematch || false;
    const mySpecialCards = gameState.players[playerId]?.specialCards || [];
    const unusedSpecialCards = mySpecialCards.filter(sc => !sc.used).length;
    
    const myWins = gameState.scores?.[playerId] || 0;
    const opponentWins = gameState.scores?.[opponentId] || 0;
    
    const myBusted = myScore > 21;
    const opponentBusted = opponentScore > 21;
    
    const canAct = isMyTurn && !myStopped && !gameState.gameOver;

    return (
      <div className="screen-container game-screen">
        <div className="stars"></div>
        <div className="game-content">
          <div className="game-header">
            <div className="game-info-bar">
              <div className="game-info-item">
                <span className="info-label">Room:</span>
                <span className="info-value">{roomId}</span>
              </div>
              <div className="game-info-item">
                <span className="info-label">Bet:</span>
                <span className="info-value gold">{currentBet} 🪙</span>
              </div>
              <div className="game-info-item">
                <span className="info-label">Score:</span>
                <span className="info-value">{myWins} - {opponentWins}</span>
              </div>
              <div className="game-info-item">
                <span className="info-label">Deck:</span>
                <span className="info-value">{gameState.cardsRemaining || 0}</span>
              </div>
            </div>
          </div>

          {notification && <div className="notification">{notification}</div>}
          {error && <div className="error-message">{error}</div>}

          {/* Opponent Section */}
          <div className="player-section opponent-section">
            <div className="player-header">
              <div className="player-name">
                <span className="player-icon">👤</span>
                Opponent
                {gameState.gameOver && opponentWantsRematch && (
                  <span className="rematch-indicator">✓ Ready</span>
                )}
              </div>
              {gameState.gameOver && (
                <div className={opponentBusted ? "score-badge score-busted" : "score-badge"}>
                  Score: {opponentScore}
                  {opponentBusted && " (BUST!)"}
                </div>
              )}
            </div>
            <div className="cards-container">
              {opponentCards.map((card, idx) => (
                <Card 
                  key={idx} 
                  card={card} 
                  hidden={idx === 0 && !gameState.gameOver && !gameState.revealedOpponentCard} 
                />
              ))}
            </div>
          </div>

          {/* Status Section */}
          <div className="status-box">
            {gameState.gameOver ? (
              <div className="game-over">
                <div className="result-text">
                  {gameState.winner === playerId ? '🎉 You Win!' : 
                   gameState.winner === 'draw' ? '🤝 Draw!' : '😢 You Lose!'}
                </div>
                <div className="final-score">
                  Your Score: <strong className={myBusted ? "busted-text" : ""}>{myScore}{myBusted && " (BUST)"}</strong> | 
                  Opponent: <strong className={opponentBusted ? "busted-text" : ""}>{opponentScore}{opponentBusted && " (BUST)"}</strong>
                </div>
                <div className="match-score">
                  Match Score: <strong>{myWins} - {opponentWins}</strong>
                </div>
                
                {myWantsRematch && !opponentWantsRematch && (
                  <div className="waiting-rematch">
                    ⏳ Waiting for opponent to accept rematch...
                  </div>
                )}
                
                {!myWantsRematch && opponentWantsRematch && (
                  <div className="opponent-waiting-rematch">
                    🎮 Opponent wants to play again!
                  </div>
                )}
                
                <div className="game-over-buttons">
                  <button 
                    onClick={playAgain} 
                    className={myWantsRematch ? "btn btn-play-again btn-disabled" : "btn btn-play-again"}
                    disabled={myWantsRematch}
                  >
                    {myWantsRematch ? '✓ Ready to Play' : `Play Again (${currentBet} 🪙)`}
                  </button>
                  <button onClick={leaveRoom} className="btn btn-leave">
                    Leave Room
                  </button>
                </div>
              </div>
            ) : (
              <div className="turn-indicator">
                {myStopped && opponentStopped ? (
                  <div className="turn-text">⏳ Calculating winner...</div>
                ) : myBusted ? (
                  <div className="turn-text bust-text">💥 You Busted! Opponent is playing...</div>
                ) : myStopped ? (
                  <div className="turn-text">⏸️ You stopped. Opponent is playing...</div>
                ) : opponentStopped ? (
                  <div className="turn-text active">🎯 Opponent stopped. Your turn!</div>
                ) : (
                  <div className={isMyTurn ? 'turn-text active' : 'turn-text'}>
                    {isMyTurn ? '🎯 Your Turn' : '⏳ Opponent\'s Turn'}
                  </div>
                )}
                
                {gameState.revealedNextCard && (
                  <div className="special-info">👁️ Next Card: {gameState.revealedNextCard.value}{gameState.revealedNextCard.suit}</div>
                )}
                {gameState.revealedOpponentCard && (
                  <div className="special-info">🔮 Opponent's Hidden: {gameState.revealedOpponentCard.value}{gameState.revealedOpponentCard.suit}</div>
                )}
                {gameState.deckStats && (
                  <div className="special-info deck-stats">📊 Deck Stats: {Object.entries(gameState.deckStats).map(([k, v]) => `${k}:${v}`).join(', ')}</div>
                )}
              </div>
            )}
          </div>

          {/* Player Section */}
          <div className="player-section my-section">
            <div className="player-header">
              <div className="player-name">
                <span className="player-icon">👤</span>
                You
                {gameState.gameOver && myWantsRematch && (
                  <span className="rematch-indicator">✓ Ready</span>
                )}
              </div>
              <div className={myBusted ? "score-badge score-busted" : "score-badge"}>
                Score: {myScore}
                {myBusted && " (BUST!)"}
              </div>
            </div>
            <div className="cards-container">
              {myCards.map((card, idx) => (
                <Card key={idx} card={card} hidden={false} glowing={true} />
              ))}
            </div>

            {canAct && (
              <div className="action-buttons">
                <button onClick={hit} className="btn btn-hit">
                  ➕ Hit (Draw Card)
                </button>
                <button onClick={stand} className="btn btn-stand">
                  ⏹️ Stand (Stop)
                </button>
              </div>
            )}

            {mySpecialCards.length > 0 && !gameState.gameOver && (
              <div className="special-cards-section">
                <button 
                  onClick={() => setShowSpecialCardMenu(!showSpecialCardMenu)}
                  className="btn btn-special-toggle"
                  disabled={unusedSpecialCards === 0}
                >
                  ✨ Special Cards ({unusedSpecialCards}/{mySpecialCards.length})
                </button>
                
                {showSpecialCardMenu && (
                  <div className="special-cards-grid">
                    {mySpecialCards.map(sc => {
                      const cardType = specialCardTypes.find(t => t.id === sc.id);
                      return cardType ? (
                        <SpecialCard key={sc.id} special={cardType} onClick={useSpecialCard} />
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}
            
            {myBusted && !gameState.gameOver && (
              <div className="bust-message">
                💥 You Busted! (Over 21) - Waiting for opponent...
              </div>
            )}
            
            {myStopped && !gameState.gameOver && !opponentStopped && !myBusted && (
              <div className="waiting-message">
                ⏸️ You stopped. Waiting for opponent...
              </div>
            )}
            
            {!canAct && !myStopped && !gameState.gameOver && !myBusted && (
              <div className="waiting-message">
                ⏳ Wait for your turn...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default App;