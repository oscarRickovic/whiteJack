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
  const [showShuffleNotice, setShowShuffleNotice] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    // Connect to WebSocket server
    ws.current = io(SOCKET_URL);

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
      // Check if deck was shuffled
      if (gameState.deckShuffled && !showShuffleNotice) {
        setShowShuffleNotice(true);
        setTimeout(() => setShowShuffleNotice(false), 3000);
      }
      setGameState(gameState);
    });

    ws.current.on('NEW_ROUND', ({ gameState }) => {
      // Check if deck was shuffled
      if (gameState.deckShuffled) {
        setShowShuffleNotice(true);
        setTimeout(() => setShowShuffleNotice(false), 3000);
      }
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
  }, [showShuffleNotice]);

  const createRoom = () => {
    ws.current.emit('CREATE_ROOM');
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

  const playAgain = () => {
    ws.current.emit('PLAY_AGAIN', { roomId });
  };

  const leaveRoom = () => {
    if (roomId && ws.current) {
      ws.current.emit('LEAVE_ROOM', { roomId });
    }
    setScreen('home');
    setRoomId('');
    setInputRoomId('');
    setPlayerId(null);
    setGameState(null);
    setError('');
    setShowShuffleNotice(false);
  };

  const restartGame = () => {
    // This is for full game restart (disconnects, etc.)
    leaveRoom();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Card = ({ card, hidden }) => (
    <div className={hidden ? 'card card-hidden' : 'card card-visible'}>
      {hidden ? (
        <div className="card-back-content">
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

  if (screen === 'home') {
    return (
      <div className="screen-container">
        <div className="home-content">
          <div className="header">
            <h1 className="title">♠ Blackjack ♥</h1>
            <p className="subtitle">2 Player Card Game</p>
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <div className="menu-box">
            <button onClick={createRoom} className="btn btn-create">
              <svg className="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Room
            </button>
            
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
                <svg className="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Join Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'waiting') {
    return (
      <div className="screen-container">
        <div className="waiting-content">
          <div className="waiting-icon-wrapper">
            <div className="waiting-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          
          <h2 className="waiting-title">Waiting for Opponent</h2>
          <p className="waiting-subtitle">Share this room ID with your friend</p>
          
          <div className="room-id-box">
            <div className="room-id">{roomId}</div>
          </div>
          
          <div className="waiting-buttons">
            <button onClick={copyRoomId} className="btn btn-copy">
              <svg className="btn-icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {copied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
              {copied ? 'Copied!' : 'Copy Room ID'}
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
    
    // Player can act if they haven't stopped yet
    const canAct = !myStopped && !gameState.gameOver;

    return (
      <div className="screen-container">
        <div className="game-content">
          <div className="game-header">
            <h1 className="game-title">♠ Blackjack ♥</h1>
            <div className="game-info">
              <div className="room-code">Room: {roomId}</div>
              <div className="deck-info">Cards in Deck: {gameState.cardsRemaining || 0}</div>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          {showShuffleNotice && (
            <div className="shuffle-notice">
              🔀 Deck Shuffled! Cards reset to full deck.
            </div>
          )}

          <div className="player-section opponent-section">
            <div className="player-header">
              <div className="player-name">
                <svg className="player-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Opponent
              </div>
              {gameState.gameOver && (
                <div className="score-badge">Score: {opponentScore}</div>
              )}
            </div>
            <div className="cards-container">
              {opponentCards.map((card, idx) => (
                <Card key={idx} card={card} hidden={idx === 0 && !gameState.gameOver} />
              ))}
            </div>
          </div>

          <div className="status-box">
            {gameState.gameOver ? (
              <div className="game-over">
                <div className="result-text">
                  {gameState.winner === playerId ? '🎉 You Win!' : 
                   gameState.winner === 'draw' ? '🤝 Draw!' : '😢 You Lose!'}
                </div>
                <div className="final-score">
                  Your Score: <strong>{myScore}</strong> | Opponent: <strong>{opponentScore}</strong>
                </div>
                <div className="game-over-buttons">
                  <button onClick={playAgain} className="btn btn-play-again">
                    Play Again
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
                ) : myStopped ? (
                  <div className="turn-text">⏸️ You stopped. Opponent is playing...</div>
                ) : opponentStopped ? (
                  <div className="turn-text active">🎯 Opponent stopped. Your turn!</div>
                ) : (
                  <div className={isMyTurn ? 'turn-text active' : 'turn-text'}>
                    {isMyTurn ? '🎯 Your Turn' : '⏳ Opponent\'s Turn'}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="player-section my-section">
            <div className="player-header">
              <div className="player-name">
                <svg className="player-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                You
              </div>
              <div className="score-badge">Score: {myScore}</div>
            </div>
            <div className="cards-container">
              {myCards.map((card, idx) => (
                <Card key={idx} card={card} hidden={false} />
              ))}
            </div>

            {canAct && (
              <div className="action-buttons">
                <button onClick={hit} className="btn btn-hit">
                  <svg className="btn-icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Hit (Draw Card)
                </button>
                <button onClick={stand} className="btn btn-stand">
                  <svg className="btn-icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Stand (Stop)
                </button>
              </div>
            )}
            
            {myStopped && !gameState.gameOver && !opponentStopped && (
              <div className="waiting-message">
                ⏸️ You stopped. Waiting for opponent...
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