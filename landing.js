import { db } from './firebase.js';
import { ref, set, push, serverTimestamp } from "firebase/database";
import { playerData, gameState } from './playerState.js';

document.addEventListener('DOMContentLoaded', () => {
    const playSlotsBtn = document.getElementById('play-slots-btn');
    const gameModeSelection = document.getElementById('game-mode-selection');
    const backToMainBtn = document.getElementById('back-to-main-btn');
    const initialOptions = document.getElementById('initial-landing-options');
    const playFriendsBtn = document.getElementById('play-friends-btn');

    // Handle joining a game room from a shared link
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
        window.location.href = `game.html?room=${roomId}`;
        return;
    }

    playSlotsBtn.addEventListener('click', () => {
        initialOptions.style.display = 'none';
        gameModeSelection.style.display = 'flex';
    });

    backToMainBtn.addEventListener('click', () => {
        gameModeSelection.style.display = 'none';
        initialOptions.style.display = 'flex';
    });

    playFriendsBtn.addEventListener('click', async () => {
        playFriendsBtn.disabled = true;
        playFriendsBtn.textContent = 'Creating room...';

        try {
            // Create a new room in Firebase
            const gamesRef = ref(db, 'games');
            const newGameRef = push(gamesRef);
            const newGameId = newGameRef.key;

            // Initialize the game state in Firebase
            await set(newGameRef, {
                playerData: {
                    ...playerData // uses the default empty player data
                },
                gameState: {
                    ...gameState // uses the default game state
                },
                players: {},
                createdAt: serverTimestamp()
            });

            // Redirect to the game page with the new room ID
            window.location.href = `game.html?room=${newGameId}`;

        } catch (error) {
            console.error("Failed to create multiplayer room:", error);
            alert("Could not create a room. Please check your connection and try again.");
            playFriendsBtn.disabled = false;
            playFriendsBtn.textContent = 'Play with Friends';
        }
    });
});