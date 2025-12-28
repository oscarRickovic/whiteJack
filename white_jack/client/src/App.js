import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';

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
  const [showSpecialCards, setShowSpecialCards] = useState(false);
  const [swapMode, setSwapMode] = useState(false);
  const [glitchMode, setGlitchMode] = useState(false);
  const [toTheMoonMode, setToTheMoonMode] = useState(false);
  const [selectedMyCard, setSelectedMyCard] = useState(null);
  const [selectedOpponentCard, setSelectedOpponentCard] = useState(null);
  const [selectedValue, setSelectedValue] = useState(null);
  const [specialCardResult, setSpecialCardResult] = useState(null);
  const [swapAnimation, setSwapAnimation] = useState(false);
  const [glitchAnimation, setGlitchAnimation] = useState(false);
  const [rocketAnimation, setRocketAnimation] = useState(false);
  const [peekAnimation, setPeekAnimation] = useState(false);
  const [oracleAnimation, setOracleAnimation] = useState(false);
  const [showRandomSpecialCards, setShowRandomSpecialCards] = useState(false);
  const [availableSpecialCards, setAvailableSpecialCards] = useState([]);
  const ws = useRef(null);

  const determineAvailableSpecialCards = useCallback(() => {
    const rand = Math.random();
    
    if (rand < 0.15) return ['swap'];              // 0.0 - 0.15 (15%)
    if (rand < 0.30) return ['peek'];              // 0.15 - 0.30 (15%)
    if (rand < 0.50) return ['oracle'];            // 0.30 - 0.50 (20%)
    if (rand < 0.70) return ['statistic'];         // 0.50 - 0.70 (20%)
    if (rand < 0.95) return ['glitch'];            // 0.70 - 0.95 (25%)
    return ['tothemoon'];                          // 0.95 - 1.0 (5%)
  }, []);

  useEffect(() => {
    if (gameState?.currentRound) {
      setShowRandomSpecialCards(Math.random() > 0.9);
      setAvailableSpecialCards(determineAvailableSpecialCards());
    }
  }, [gameState?.currentRound, determineAvailableSpecialCards]);

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
      setShowRandomSpecialCards(Math.random() > 0.9);
      setAvailableSpecialCards(determineAvailableSpecialCards());
    });

    ws.current.on('GAME_UPDATE', ({ gameState }) => {
      if (gameState.deckShuffled && !showShuffleNotice) {
        setShowShuffleNotice(true);
        setTimeout(() => setShowShuffleNotice(false), 3000);
      }
      setGameState(gameState);
    });

    ws.current.on('NEW_ROUND', ({ gameState }) => {
      if (gameState.deckShuffled) {
        setShowShuffleNotice(true);
        setTimeout(() => setShowShuffleNotice(false), 3000);
      }
      setGameState(gameState);
      resetSpecialCardUI();
    });

    ws.current.on('REMATCH_STATUS', ({ gameState }) => {
      setGameState(gameState);
    });

    ws.current.on('SPECIAL_CARD_RESULT', ({ cardType, data }) => {
      if (cardType === 'peek') {
        setPeekAnimation(true);
        setTimeout(() => setPeekAnimation(false), 2000);
        setSpecialCardResult({
          type: 'peek',
          message: `Next card in deck: ${data.nextCard.value}${data.nextCard.suit}`,
          card: data.nextCard
        });
      } else if (cardType === 'oracle') {
        setOracleAnimation(true);
        setTimeout(() => setOracleAnimation(false), 2000);
        setSpecialCardResult({
          type: 'oracle',
          message: `Opponent's hidden card: ${data.hiddenCard.value}${data.hiddenCard.suit}`,
          card: data.hiddenCard
        });
      } else if (cardType === 'statistic') {
        const statsArray = Object.entries(data.statistics)
          .sort((a, b) => b[1] - a[1])
          .map(([card, count]) => `${card}(${count})`)
          .join(', ');
        setSpecialCardResult({
          type: 'statistic',
          message: `Deck Statistics (${data.totalCards} cards):`,
          stats: statsArray
        });
      }
      
      setTimeout(() => setSpecialCardResult(null), 5000);
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
  }, [showShuffleNotice, determineAvailableSpecialCards]);

  const resetSpecialCardUI = () => {
    setShowSpecialCards(false);
    setSwapMode(false);
    setGlitchMode(false);
    setToTheMoonMode(false);
    setSelectedMyCard(null);
    setSelectedOpponentCard(null);
    setSelectedValue(null);
    setSpecialCardResult(null);
    setSwapAnimation(false);
    setGlitchAnimation(false);
    setRocketAnimation(false);
    setPeekAnimation(false);
    setOracleAnimation(false);
    setShowRandomSpecialCards(Math.random() > 0.9);
    setAvailableSpecialCards(determineAvailableSpecialCards());
  };

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
    ws.current.emit('PLAY_AGAIN', { roomId, playerId });
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
    resetSpecialCardUI();
  };

  const restartGame = () => {
    leaveRoom();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSpecialCards = () => {
    setShowSpecialCards(!showSpecialCards);
    if (showSpecialCards) {
      setSwapMode(false);
      setGlitchMode(false);
      setToTheMoonMode(false);
      setSelectedMyCard(null);
      setSelectedOpponentCard(null);
      setSelectedValue(null);
    }
  };

  const handleSwapCard = () => {
    setSwapMode(true);
    setGlitchMode(false);
    setToTheMoonMode(false);
    setSelectedMyCard(null);
    setSelectedOpponentCard(null);
  };

  const handlePeekCard = () => {
    ws.current.emit('USE_SPECIAL_CARD', {
      roomId,
      playerId,
      cardType: 'peek',
      data: {}
    });
    setShowSpecialCards(false);
  };

  const handleOracleCard = () => {
    ws.current.emit('USE_SPECIAL_CARD', {
      roomId,
      playerId,
      cardType: 'oracle',
      data: {}
    });
    setShowSpecialCards(false);
  };

  const handleStatisticCard = () => {
    ws.current.emit('USE_SPECIAL_CARD', {
      roomId,
      playerId,
      cardType: 'statistic',
      data: {}
    });
    setShowSpecialCards(false);
  };

  const handleGlitchCard = () => {
    setGlitchMode(true);
    setSwapMode(false);
    setToTheMoonMode(false);
    setSelectedOpponentCard(null);
  };

  const handleToTheMoonCard = () => {
    setToTheMoonMode(true);
    setSwapMode(false);
    setGlitchMode(false);
    setSelectedMyCard(null);
    setSelectedValue(null);
  };

  const confirmSwap = () => {
    if (selectedMyCard !== null && selectedOpponentCard !== null) {
      setSwapAnimation(true);
      setTimeout(() => {
        ws.current.emit('USE_SPECIAL_CARD', {
          roomId,
          playerId,
          cardType: 'swap',
          data: {
            myCardIndex: selectedMyCard,
            opponentCardIndex: selectedOpponentCard
          }
        });
        setSwapMode(false);
        setSelectedMyCard(null);
        setSelectedOpponentCard(null);
        setShowSpecialCards(false);
        setTimeout(() => setSwapAnimation(false), 1500);
      }, 500);
    }
  };

  const confirmGlitch = () => {
    if (selectedOpponentCard !== null) {
      setGlitchAnimation(true);
      setTimeout(() => {
        ws.current.emit('USE_SPECIAL_CARD', {
          roomId,
          playerId,
          cardType: 'glitch',
          data: {
            targetCardIndex: selectedOpponentCard
          }
        });
        setGlitchMode(false);
        setSelectedOpponentCard(null);
        setShowSpecialCards(false);
        setTimeout(() => setGlitchAnimation(false), 1500);
      }, 500);
    }
  };

  const confirmToTheMoon = () => {
    if (selectedMyCard !== null && selectedValue !== null) {
      setRocketAnimation(true);
      setTimeout(() => {
        ws.current.emit('USE_SPECIAL_CARD', {
          roomId,
          playerId,
          cardType: 'tothemoon',
          data: {
            myCardIndex: selectedMyCard,
            newValue: selectedValue
          }
        });
        setToTheMoonMode(false);
        setSelectedMyCard(null);
        setSelectedValue(null);
        setShowSpecialCards(false);
        setTimeout(() => setRocketAnimation(false), 1500);
      }, 500);
    }
  };

  const cancelSpecialMode = () => {
    setSwapMode(false);
    setGlitchMode(false);
    setToTheMoonMode(false);
    setSelectedMyCard(null);
    setSelectedOpponentCard(null);
    setSelectedValue(null);
  };

  const Card = ({ card, hidden, clickable, selected, onClick }) => (
    <div 
      className={`relative w-20 h-28 rounded-xl shadow-2xl transition-all duration-300 animate-[fadeIn_0.3s_ease-out] ${
        hidden ? 'bg-gradient-to-br from-blue-600 to-purple-700' : 'bg-white'
      } ${clickable ? 'cursor-pointer hover:-translate-y-2 hover:scale-110' : ''} ${
        selected ? 'ring-4 ring-yellow-400 -translate-y-2 scale-110' : 'hover:-translate-y-1 hover:scale-105'
      } hover:shadow-3xl`}
      onClick={clickable ? onClick : undefined}
    >
      {hidden ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-4xl text-white opacity-30">🂠</div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
          <div className={`text-3xl font-bold ${['♥', '♦'].includes(card.suit) ? 'text-red-600' : 'text-gray-800'}`}>
            {card.value}
          </div>
          <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-600' : 'text-gray-800'}`}>
            {card.suit}
          </div>
        </div>
      )}
      {clickable && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-xs font-bold">
          ✓
        </div>
      )}
    </div>
  );

  if (screen === 'home') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-green-900 via-green-700 to-emerald-600 flex items-center justify-center p-5 animate-[fadeIn_0.5s_ease-out]">
        <div className="w-full max-w-lg">
          <div className="text-center mb-10">
            <h1 className="text-6xl font-bold text-white mb-2.5">♠ Blackjack ♥</h1>
            <p className="text-xl text-green-200">2 Player Card Game</p>
          </div>
          
          {error && (
            <div className="bg-red-100 text-red-600 px-5 py-3 rounded-xl mb-5 text-center font-semibold border-2 border-red-200 animate-[fadeIn_0.3s_ease-out]">
              {error}
            </div>
          )}
          
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <button 
              onClick={createRoom} 
              className="w-full py-4.5 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800 hover:scale-105 active:scale-98 transition-all duration-300 mb-5"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Room
            </button>
            
            <div className="relative my-6 text-center">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-300"></div>
              <span className="relative bg-white px-3 text-gray-500 text-sm">OR</span>
            </div>
            
            <div>
              <input
                type="text"
                placeholder="Enter Room ID"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full p-4 border-2 border-gray-300 rounded-2xl text-lg font-mono text-center mb-4 transition-all duration-300 focus:outline-none focus:border-purple-700 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"
              />
              <button 
                onClick={joinRoom} 
                className="w-full py-4.5 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-purple-700 to-pink-600 hover:from-purple-800 hover:to-pink-700 hover:scale-105 active:scale-98 transition-all duration-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-green-900 via-green-700 to-emerald-600 flex items-center justify-center p-5 animate-[fadeIn_0.5s_ease-out]">
        <div className="bg-white rounded-3xl shadow-2xl p-10 text-center max-w-lg w-full">
          <div className="mb-7.5">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite]">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Waiting for Opponent</h2>
          <p className="text-gray-500 mb-7.5">Share this room ID with your friend</p>
          
          <div className="bg-gradient-to-br from-blue-100 to-purple-100 border-2 border-blue-300 rounded-2xl p-7.5 mb-5">
            <div className="text-4xl font-mono font-bold text-gray-800 tracking-[0.2em]">{roomId}</div>
          </div>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={copyRoomId} 
              className="w-full py-4 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800 hover:scale-105 active:scale-98 transition-all duration-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {copied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
              {copied ? 'Copied!' : 'Copy Room ID'}
            </button>
            
            <button 
              onClick={leaveRoom} 
              className="w-full py-3.5 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 hover:scale-105 active:scale-98 transition-all duration-300 mt-2"
            >
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
    const myWins = gameState.scores?.[playerId] || 0;
    const opponentWins = gameState.scores?.[opponentId] || 0;
    const myBusted = myScore > 21;
    const opponentBusted = opponentScore > 21;
    const canAct = isMyTurn && !myStopped && !gameState.gameOver;
    const specialCardsRemaining = gameState.players[playerId]?.specialCardsRemaining || 0;
    const canUseSpecialCard = canAct && specialCardsRemaining > 0;

    return (
      <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-green-900 via-green-700 to-emerald-600 flex items-center justify-center p-5 animate-[fadeIn_0.5s_ease-out]">
        <style>{`
          @keyframes swapBounce {
            0%, 100% { transform: translateX(0) rotate(0deg); }
            25% { transform: translateX(-20px) rotate(-15deg); }
            75% { transform: translateX(20px) rotate(15deg); }
          }
          @keyframes glitchShake {
            0%, 100% { transform: translate(0, 0); }
            10% { transform: translate(-5px, 5px); }
            20% { transform: translate(5px, -5px); }
            30% { transform: translate(-5px, -5px); }
            40% { transform: translate(5px, 5px); }
            50% { transform: translate(-5px, 0); }
            60% { transform: translate(5px, 0); }
            70% { transform: translate(0, -5px); }
            80% { transform: translate(0, 5px); }
            90% { transform: translate(-5px, 5px); }
          }
          @keyframes rocketLaunch {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            50% { transform: translateY(-100px) scale(1.5) rotate(10deg); opacity: 0.8; }
            100% { transform: translateY(-200px) scale(0.5) rotate(0deg); opacity: 0; }
          }
          @keyframes peekPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
          }
          @keyframes oracleGlow {
            0%, 100% { filter: brightness(1); }
            50% { filter: brightness(1.5) hue-rotate(90deg); }
          }
        `}</style>

        {/* Swap Animation Overlay */}
        {swapAnimation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="text-9xl animate-[swapBounce_1s_ease-in-out]">
              🔄
            </div>
            <div className="absolute text-4xl font-bold text-white mt-32 animate-pulse">
              SWAP!
            </div>
          </div>
        )}

        {/* Glitch Animation Overlay */}
        {glitchAnimation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="text-9xl animate-[glitchShake_0.5s_ease-in-out_3]">
              ⚡
            </div>
            <div className="absolute text-4xl font-bold text-yellow-300 mt-32 animate-[glitchShake_0.3s_ease-in-out_infinite]">
              GLITCH!
            </div>
          </div>
        )}

        {/* Rocket Animation Overlay */}
        {rocketAnimation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="text-9xl animate-[rocketLaunch_1.5s_ease-out]">
              🚀
            </div>
            <div className="absolute text-4xl font-bold text-blue-300 mt-32 animate-pulse">
              TO THE MOON!
            </div>
          </div>
        )}

        {/* Peek Animation Overlay */}
        {peekAnimation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="text-9xl animate-[peekPulse_1s_ease-in-out_2]">
              👁️
            </div>
            <div className="absolute text-4xl font-bold text-cyan-300 mt-32 animate-pulse">
              PEEKING...
            </div>
          </div>
        )}

        {/* Oracle Animation Overlay */}
        {oracleAnimation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            <div className="text-9xl animate-[oracleGlow_1s_ease-in-out_2]">
              🔮
            </div>
            <div className="absolute text-4xl font-bold text-purple-300 mt-32 animate-pulse">
              REVEALING...
            </div>
          </div>
        )}

        <div className="w-full max-w-6xl h-screen p-4 flex flex-col overflow-y-auto overflow-x-hidden">
          <div className="text-center mb-4 shrink-0">
            <h1 className="text-5xl font-bold text-white mb-2">♠ Blackjack ♥</h1>
            <div className="flex gap-5 justify-center items-center flex-wrap">
              <div className="font-mono text-green-200">Room: {roomId}</div>
              <div className="text-2xl font-bold text-yellow-400 px-4 py-2 bg-yellow-400/10 border-2 border-yellow-400/30 rounded-lg">
                {myWins} - {opponentWins}
              </div>
              <div className="font-mono text-green-200 bg-white/10 px-4 py-2 rounded-lg">
                Deck: {gameState.cardsRemaining || 0}
              </div>
              <div className="font-mono text-purple-200 bg-purple-500/20 px-4 py-2 rounded-lg border-2 border-purple-400/40">
                ⭐ Special: {specialCardsRemaining}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 text-red-600 px-5 py-3 rounded-xl mb-5 text-center font-semibold border-2 border-red-200 animate-[fadeIn_0.3s_ease-out]">
              {error}
            </div>
          )}
          
          {showShuffleNotice && (
            <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-white px-6 py-4 rounded-xl mb-5 text-center font-semibold text-lg shadow-lg animate-[fadeIn_0.3s_ease-out]">
              🔀 Deck Shuffled! Cards reset to full deck.
            </div>
          )}

          {specialCardResult && (
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white px-6 py-4 rounded-xl mb-5 shadow-lg animate-[fadeIn_0.3s_ease-out]">
              <div className="font-bold text-xl mb-2">✨ {specialCardResult.message}</div>
              {specialCardResult.card && (
                <div className="flex justify-center mt-3">
                  <Card card={specialCardResult.card} hidden={false} />
                </div>
              )}
              {specialCardResult.stats && (
                <div className="text-sm mt-2 bg-white/20 p-3 rounded-lg font-mono">
                  {specialCardResult.stats}
                </div>
              )}
            </div>
          )}

          {swapMode && (
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 text-white px-6 py-4 rounded-xl mb-5 text-center font-semibold text-lg shadow-lg">
              🔄 Swap Mode: Select one of your cards, then one opponent card
              <div className="flex gap-3 justify-center mt-3">
                <button
                  onClick={confirmSwap}
                  disabled={selectedMyCard === null || selectedOpponentCard === null}
                  className={`px-6 py-2 rounded-lg font-bold ${
                    selectedMyCard !== null && selectedOpponentCard !== null
                      ? 'bg-green-600 hover:bg-green-700 cursor-pointer'
                      : 'bg-gray-400 cursor-not-allowed opacity-50'
                  }`}
                >
                  ✓ Confirm Swap
                </button>
                <button
                  onClick={cancelSpecialMode}
                  className="px-6 py-2 rounded-lg font-bold bg-red-600 hover:bg-red-700"
                >
                  ✗ Cancel
                </button>
              </div>
            </div>
          )}

          {glitchMode && (
            <div className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-xl mb-5 text-center font-semibold text-lg shadow-lg">
              ⚡ Glitch Mode: Select an opponent's card to randomize its value
              <div className="flex gap-3 justify-center mt-3">
                <button
                  onClick={confirmGlitch}
                  disabled={selectedOpponentCard === null}
                  className={`px-6 py-2 rounded-lg font-bold ${
                    selectedOpponentCard !== null
                      ? 'bg-green-600 hover:bg-green-700 cursor-pointer'
                      : 'bg-gray-400 cursor-not-allowed opacity-50'
                  }`}
                >
                  ✓ Confirm Glitch
                </button>
                <button
                  onClick={cancelSpecialMode}
                  className="px-6 py-2 rounded-lg font-bold bg-red-600 hover:bg-red-700"
                >
                  ✗ Cancel
                </button>
              </div>
            </div>
          )}

          {toTheMoonMode && (
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-6 py-4 rounded-xl mb-5 text-center font-semibold text-lg shadow-lg">
              🚀 ToTheMoon Mode: Select your card and choose new value (1-11)
              <div className="flex gap-2 justify-center mt-3 mb-3 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(val => (
                  <button
                    key={val}
                    onClick={() => setSelectedValue(val)}
                    className={`px-3 py-2 rounded-lg font-bold ${
                      selectedValue === val
                        ? 'bg-yellow-400 text-black'
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={confirmToTheMoon}
                  disabled={selectedMyCard === null || selectedValue === null}
                  className={`px-6 py-2 rounded-lg font-bold ${
                    selectedMyCard !== null && selectedValue !== null
                      ? 'bg-green-600 hover:bg-green-700 cursor-pointer'
                      : 'bg-gray-400 cursor-not-allowed opacity-50'
                  }`}
                >
                  ✓ Confirm Change
                </button>
                <button
                  onClick={cancelSpecialMode}
                  className="px-6 py-2 rounded-lg font-bold bg-red-600 hover:bg-red-700"
                >
                  ✗ Cancel
                </button>
              </div>
            </div>
          )}

          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 mb-4 shrink-0">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2 text-white text-lg font-semibold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Opponent
                {gameState.gameOver && opponentWantsRematch && (
                  <span className="ml-2 px-2 py-1 bg-green-500 text-white rounded text-xs font-semibold">✓ Ready</span>
                )}
              </div>
              {gameState.gameOver && (
                <div className={`${opponentBusted ? 'bg-red-500/20 border-red-500/40 text-red-500 animate-[pulse_2s_infinite]' : 'bg-white/20'} text-white px-5 py-2.5 rounded-xl font-bold text-lg`}>
                  Score: {opponentScore}
                  {opponentBusted && " (BUST!)"}
                </div>
              )}
            </div>
            <div className="flex gap-4 justify-center flex-wrap">
              {opponentCards.map((card, idx) => (
                <Card 
                  key={idx} 
                  card={card} 
                  hidden={idx === 0 && !gameState.gameOver}
                  clickable={(swapMode || glitchMode) && !(idx === 0 && !gameState.gameOver)}
                  selected={selectedOpponentCard === idx}
                  onClick={() => (swapMode || glitchMode) && !(idx === 0 && !gameState.gameOver) && setSelectedOpponentCard(idx)}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-6 mb-4 shrink-0">
            {gameState.gameOver ? (
              <div className="text-center">
                <div className="text-5xl font-bold mb-4">
                  {gameState.winner === playerId ? '🎉 You Win!' : 
                   gameState.winner === 'draw' ? '🤝 Draw!' : '😢 You Lose!'}
                </div>
                <div className="text-gray-500 text-lg mb-3">
                  Your Score: <strong className={myBusted ? 'text-red-500' : 'text-gray-800'}>{myScore}{myBusted && " (BUST)"}</strong> | 
                  Opponent: <strong className={opponentBusted ? 'text-red-500' : 'text-gray-800'}>{opponentScore}{opponentBusted && " (BUST)"}</strong>
                </div>
                <div className="my-2 text-lg text-yellow-500">
                  Match Score: <strong className="text-xl">{myWins} - {opponentWins}</strong>
                </div>
                
                {myWantsRematch && !opponentWantsRematch && (
                  <div className="my-4 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-600 text-sm font-medium">
                    ⏳ Waiting for opponent to accept rematch...
                  </div>
                )}
                
                {!myWantsRematch && opponentWantsRematch && (
                  <div className="my-4 px-4 py-3 bg-green-500/10 border-2 border-green-500/40 rounded-lg text-green-600 font-semibold animate-[gentle-pulse_2s_infinite]">
                    🎮 Opponent wants to play again!
                  </div>
                )}
                
                <div className="flex gap-4 justify-center flex-wrap mt-2">
                  <button 
                    onClick={playAgain} 
                    className={`${myWantsRematch ? 'opacity-60 cursor-not-allowed bg-green-500' : 'bg-gradient-to-br from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 hover:scale-105'} max-w-xs py-3.5 px-7 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white active:scale-98 transition-all duration-300`}
                    disabled={myWantsRematch}
                  >
                    {myWantsRematch ? '✓ Ready to Play' : 'Play Again'}
                  </button>
                  <button 
                    onClick={leaveRoom} 
                    className="max-w-xs py-3.5 px-7 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 hover:scale-105 active:scale-98 transition-all duration-300"
                  >
                    Leave Room
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                {myStopped && opponentStopped ? (
                  <div className="text-xl font-semibold text-gray-500">⏳ Calculating winner...</div>
                ) : myBusted ? (
                  <div className="text-xl font-semibold text-red-500">💥 You Busted! Opponent is playing...</div>
                ) : myStopped ? (
                  <div className="text-xl font-semibold text-gray-500">⏸️ You stopped. Opponent is playing...</div>
                ) : opponentStopped ? (
                  <div className="text-xl font-semibold text-green-600">🎯 Opponent stopped. Your turn!</div>
                ) : (
                  <div className={`text-xl font-semibold ${isMyTurn ? 'text-green-600' : 'text-gray-500'}`}>
                    {isMyTurn ? '🎯 Your Turn' : '⏳ Opponent\'s Turn'}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 mb-4 shrink-0">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2 text-white text-lg font-semibold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                You
                {gameState.gameOver && myWantsRematch && (
                  <span className="ml-2 px-2 py-1 bg-green-500 text-white rounded text-xs font-semibold">✓ Ready</span>
                )}
              </div>
              <div className={`${myBusted ? 'bg-red-500/20 border-red-500/40 text-red-500 animate-[pulse_2s_infinite]' : 'bg-white/20'} text-white px-5 py-2.5 rounded-xl font-bold text-lg`}>
                Score: {myScore}
                {myBusted && " (BUST!)"}
              </div>
            </div>
            <div className="flex gap-4 justify-center flex-wrap">
              {myCards.map((card, idx) => (
                <Card 
                  key={idx} 
                  card={card} 
                  hidden={false}
                  clickable={swapMode || toTheMoonMode}
                  selected={selectedMyCard === idx}
                  onClick={() => (swapMode || toTheMoonMode) && setSelectedMyCard(idx)}
                />
              ))}
            </div>

            {canAct && (
              <div className="flex gap-4 justify-center mt-6 flex-wrap">
                <button 
                  onClick={hit} 
                  className="flex-1 min-w-[180px] max-w-[250px] py-4.5 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 hover:scale-105 active:scale-98 transition-all duration-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Hit (Draw Card)
                </button>
                <button 
                  onClick={stand} 
                  className="flex-1 min-w-[180px] max-w-[250px] py-4.5 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white bg-gradient-to-br from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 hover:scale-105 active:scale-98 transition-all duration-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Stand (Stop)
                </button>
                
                {showRandomSpecialCards && (
                  <button 
                    onClick={toggleSpecialCards}
                    disabled={!canUseSpecialCard}
                    className={`flex-1 min-w-[180px] max-w-[250px] py-4.5 px-6 border-none rounded-2xl text-lg font-semibold cursor-pointer flex items-center justify-center gap-3 text-white ${
                      canUseSpecialCard 
                        ? 'bg-gradient-to-br from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 hover:scale-105 active:scale-98' 
                        : 'bg-gray-400 opacity-50 cursor-not-allowed'
                    } transition-all duration-300`}
                  >
                    <span className="text-xl">⭐</span>
                    Special Cards ({specialCardsRemaining})
                  </button>
                )}
              </div>
            )}

            {showSpecialCards && canUseSpecialCard && (
              <div className="mt-6 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-2xl">
                <h3 className="text-2xl font-bold mb-4 text-center">✨ Special Cards</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableSpecialCards.includes('swap') && (
                    <button
                      onClick={handleSwapCard}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-4 rounded-xl text-left transition-all hover:scale-105 active:scale-95"
                    >
                      <div className="text-2xl mb-2">🔄</div>
                      <div className="font-bold text-lg mb-1">The Swap</div>
                      <div className="text-sm opacity-90">Trade one of your cards with opponent's card</div>
                    </button>
                  )}
                  
                  {availableSpecialCards.includes('peek') && (
                    <button
                      onClick={handlePeekCard}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-4 rounded-xl text-left transition-all hover:scale-105 active:scale-95"
                    >
                      <div className="text-2xl mb-2">👁️</div>
                      <div className="font-bold text-lg mb-1">The Peek</div>
                      <div className="text-sm opacity-90">Reveal the next card in the deck</div>
                    </button>
                  )}
                  
                  {availableSpecialCards.includes('oracle') && (
                    <button
                      onClick={handleOracleCard}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-4 rounded-xl text-left transition-all hover:scale-105 active:scale-95"
                    >
                      <div className="text-2xl mb-2">🔮</div>
                      <div className="font-bold text-lg mb-1">The Oracle</div>
                      <div className="text-sm opacity-90">See opponent's hidden card</div>
                    </button>
                  )}
                  
                  {availableSpecialCards.includes('statistic') && (
                    <button
                      onClick={handleStatisticCard}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-4 rounded-xl text-left transition-all hover:scale-105 active:scale-95"
                    >
                      <div className="text-2xl mb-2">📊</div>
                      <div className="font-bold text-lg mb-1">The Statistic</div>
                      <div className="text-sm opacity-90">View remaining deck statistics</div>
                    </button>
                  )}
                  
                  {availableSpecialCards.includes('glitch') && (
                    <button
                      onClick={handleGlitchCard}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-4 rounded-xl text-left transition-all hover:scale-105 active:scale-95"
                    >
                      <div className="text-2xl mb-2">⚡</div>
                      <div className="font-bold text-lg mb-1">The Glitch</div>
                      <div className="text-sm opacity-90">Randomly change opponent's card value</div>
                    </button>
                  )}
                  
                  {availableSpecialCards.includes('tothemoon') && (
                    <button
                      onClick={handleToTheMoonCard}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-4 rounded-xl text-left transition-all hover:scale-105 active:scale-95"
                    >
                      <div className="text-2xl mb-2">🚀</div>
                      <div className="font-bold text-lg mb-1">ToTheMoon</div>
                      <div className="text-sm opacity-90">Change any of your card values</div>
                    </button>
                  )}
                </div>
                <button
                  onClick={toggleSpecialCards}
                  className="w-full mt-4 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold transition-all"
                >
                  Close Special Cards
                </button>
              </div>
            )}
            
            {myBusted && !gameState.gameOver && (
              <div className="mt-4 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-lg text-red-500 font-semibold text-center">
                💥 You Busted! (Over 21) - Waiting for opponent...
              </div>
            )}
            
            {myStopped && !gameState.gameOver && !opponentStopped && !myBusted && (
              <div className="text-center text-white text-lg font-semibold bg-yellow-600/30 p-4 rounded-xl mt-6">
                ⏸️ You stopped. Waiting for opponent...
              </div>
            )}
            
            {!canAct && !myStopped && !gameState.gameOver && !myBusted && (
              <div className="text-center text-white text-lg font-semibold bg-yellow-600/30 p-4 rounded-xl mt-6">
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