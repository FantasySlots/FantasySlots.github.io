/**
 * uiModals.js
 * Handles all DOM manipulation and logic specifically for modals (slot selection, player stats, general roster, avatar selection).
 */

import { fetchLastTeamGame } from './api.js';
import { getOrCreateChild } from './uiRenderer.js'; 
import { renderAvatarSelectionOptions } from './uiRenderer.js'; // Import the new rendering function
import { getOpponentAndVenue, formatGameDate } from './utils.js'; // Import helpers from utils

// UI Function: Open the slot selection modal
export function showSlotSelectionModal(playerObj, playerNum, originalPosition, playerDataForPlayer, assignPlayerToSlotCallback, hideSlotSelectionModalCallback) {
    const modal = document.getElementById('slot-selection-modal');
    const playerNameEl = document.getElementById('slot-selection-player-name');
    const optionsContainer = document.getElementById('slot-options-container');

    playerNameEl.textContent = playerObj.displayName;
    optionsContainer.innerHTML = '';

    const rosterSlots = playerDataForPlayer.rosterSlots;

    if (originalPosition === 'RB') {
        const btn = document.createElement('button');
        btn.className = 'slot-option-btn';
        btn.textContent = 'RB';
        btn.onclick = () => { assignPlayerToSlotCallback(playerNum, playerObj, 'RB'); hideSlotSelectionModalCallback(); };
        if (rosterSlots.RB) {
            btn.classList.add('disabled');
            btn.disabled = true;
        }
        optionsContainer.appendChild(btn);
    } else if (originalPosition === 'WR') {
        const btnWR1 = document.createElement('button');
        btnWR1.className = 'slot-option-btn';
        btnWR1.textContent = 'WR1';
        btnWR1.onclick = () => { assignPlayerToSlotCallback(playerNum, playerObj, 'WR1'); hideSlotSelectionModalCallback(); };
        if (rosterSlots.WR1) {
            btnWR1.classList.add('disabled');
            btnWR1.disabled = true;
        }
        optionsContainer.appendChild(btnWR1);

        const btnWR2 = document.createElement('button');
        btnWR2.className = 'slot-option-btn';
        btnWR2.textContent = 'WR2';
        btnWR2.onclick = () => { assignPlayerToSlotCallback(playerNum, playerObj, 'WR2'); hideSlotSelectionModalCallback(); };
        if (rosterSlots.WR2) {
            btnWR2.classList.add('disabled');
            btnWR2.disabled = true;
        }
        optionsContainer.appendChild(btnWR2);
    } else if (originalPosition === 'TE') {
        const btn = document.createElement('button');
        btn.className = 'slot-option-btn';
        btn.textContent = 'TE';
        btn.onclick = () => { assignPlayerToSlotCallback(playerNum, playerObj, 'TE'); hideSlotSelectionModalCallback(); };
        if (rosterSlots.TE) {
            btn.classList.add('disabled');
            btn.disabled = true;
        }
        optionsContainer.appendChild(btn);
    }

    const flexPositions = ['RB', 'WR', 'TE'];
    if (flexPositions.includes(originalPosition)) {
        const flexBtn = document.createElement('button');
        flexBtn.className = 'slot-option-btn';
        flexBtn.textContent = 'Flex';
        flexBtn.onclick = () => { assignPlayerToSlotCallback(playerNum, playerObj, 'Flex'); hideSlotSelectionModalCallback(); };
        if (rosterSlots.Flex) {
            flexBtn.classList.add('disabled');
            flexBtn.disabled = true;
        }
        optionsContainer.appendChild(flexBtn);
    }
    
    // Add event listener for cancel button
    const cancelBtn = modal.querySelector('.cancel-slot-selection');
    cancelBtn.onclick = hideSlotSelectionModalCallback;

    modal.style.display = 'flex';
}

// UI Function: Hide the slot selection modal
export function hideSlotSelectionModal() {
    document.getElementById('slot-selection-modal').style.display = 'none';
    document.getElementById('slot-options-container').innerHTML = ''; // Clear options
}

// UI Function: Hide the general roster modal
export function hideRosterModal() {
    document.getElementById('roster-modal').style.display = 'none';
}

// UI Function: Open the player stats modal and fetch/display data
export async function showPlayerStatsModal(playerObj, allTeams, getTank01PlayerIDCallback, fetchLastGameStatsCallback, renderPlayerStatsInModalCallback) {
    const modal = document.getElementById('player-stats-modal');
    const statsContainer = document.getElementById('player-stats-details-container');
    
    modal.style.display = 'flex';
    statsContainer.innerHTML = '<em>Loading player stats...</em>';

    let playerNameForTank01 = playerObj.displayName;
    if (playerObj.originalPosition === 'DEF') {
        const team = allTeams.find(t => t.id === playerObj.id.split('-')[1]);
        if (team) {
            playerNameForTank01 = `${team.name} Defense`;
        }
    }

    try {
        const playerID = await getTank01PlayerIDCallback(playerNameForTank01);
        if (!playerID) {
            statsContainer.innerHTML = `<h2>${playerObj.displayName}</h2><p>Player not found for detailed stats.</p>`;
            return;
        }

        const result = await fetchLastGameStatsCallback(playerID);
        if (result && result.stats) {
            // Add playerID to the stats object for the new render function
            result.stats.playerID = playerID;
            renderPlayerStatsInModalCallback(playerObj.displayName, result.stats, allTeams);
        } else {
            statsContainer.innerHTML = `<h2>${playerObj.displayName}</h2><p>No game data available.</p>`;
        }

    } catch (error) {
        console.error('Error fetching player stats for modal:', error);
        statsContainer.innerHTML = `<h2>${playerObj.displayName}</h2><p>Error loading stats. Please try again later.</p>`;
    }
}

// UI Function: Hide the player stats modal
export function hidePlayerStatsModal() {
    document.getElementById('player-stats-modal').style.display = 'none';
    document.getElementById('player-stats-details-container').innerHTML = ''; // Clear content
}

// UI Function: Render player stats in the modal
export async function renderPlayerStatsInModal(playerName, stats, allTeams) {
    const statsContainer = document.getElementById("player-stats-details-container");
    statsContainer.innerHTML = '';

    if (!stats) {
        statsContainer.innerHTML = `<h2>${playerName}</h2><p>No game data available.</p>`;
        return;
    }

    const fantasyPointsRaw = Number(
        stats.fantasyPoints ||
        stats.fantasyPointsDefault?.PPR ||
        stats.fantasyPointsDefault?.standard ||
        0
    );

    const gameDate = formatGameDate(stats.gameID);
    const { opponent, venue } = getOpponentAndVenue(stats);

    // If stats are for a defense, the logic is simpler
    if (playerName.toLowerCase().includes('defense')) {
        const teamName = playerName.replace(' Defense', '');
        const teamData = allTeams.find(t => t.name === teamName);
        const teamAbv = teamData ? teamData.id : 'N/A';
        const { opponent: defOpp, venue: defVenue } = getOpponentAndVenue(stats, teamAbv);

        statsContainer.innerHTML = `
            <h2>${playerName} - Last Game</h2>
            <p><strong>Date:</strong> ${gameDate}</p>
            <p><strong>Opponent:</strong> ${defVenue ? defVenue + " " : ""}${defOpp}</p>
            <p><strong>Fantasy Points:</strong> ${fantasyPointsRaw.toFixed(2)}</p>
        `;
        return;
    }
    
    // ✅ Always fetch team schedule to compare dates for individual players
    const scheduleGame = await fetchLastTeamGame(stats.teamAbv, stats.playerID);

    let teamGame = stats; // default to player's last game
    if (scheduleGame && scheduleGame.gameID) {
        // if schedule game is *newer* than player's game, use it
        if (scheduleGame.gameID.localeCompare(stats.gameID) > 0) {
            teamGame = scheduleGame;
        }
    }

    const teamGameDate = formatGameDate(teamGame.gameID);
    const { opponent: teamOpp, venue: teamVenue } = getOpponentAndVenue(teamGame, stats.teamAbv);

    // 🔹 Compare: if mismatch → set fantasy points = 0
    let fantasyPoints = fantasyPointsRaw;
    if (opponent !== teamOpp || gameDate !== teamGameDate) {
        fantasyPoints = 0;
    }

    let lines = [];
    if (stats.passCompletions || stats.passAttempts || stats.passYds) {
        lines.push(`Passing: ${stats.passCompletions||0}/${stats.passAttempts||0} for ${stats.passYds||0} yds, ${stats.passTD || 0} TD, ${stats.int || 0} INT`);
    }
    if (stats.receptions || stats.targets || stats.recYds) {
        lines.push(`Receiving: ${stats.receptions||0}/${stats.targets||0} for ${stats.recYds||0} yds`);
    }
    if (stats.carries || stats.rushYds) {
        lines.push(`Rushing: ${stats.carries||0} carries for ${stats.rushYds||0} yds`);
    }

    statsContainer.innerHTML = `
        <h2>${playerName} - Last Game</h2>
        <p><strong>Date:</strong> ${gameDate}</p>
        <p><strong>Opponent:</strong> ${venue ? venue + " " : ""}${opponent}</p>
        ${lines.map(l => `<p>${l}</p>`).join("")}
        <p><strong>Fantasy Points:</strong> ${fantasyPoints.toFixed(2)}</p>
        <hr style="border-color: rgba(138, 155, 191, 0.2); margin: 1rem 0;">
        <h3 style="font-size: 1.2rem; color: #8A9BBF; margin-bottom: 0.5rem;">Team (${stats.teamAbv}) - Last Game</h3>
        <p><strong>Date:</strong> ${teamGameDate}</p>
        <p><strong>Opponent:</strong> ${teamVenue ? teamVenue + " " : ""}${teamOpp}</p>
    `;
}

// NEW: UI Function: Show the avatar selection modal
export function showAvatarSelectionModal(playerNum, currentAvatar, avatarList, selectAvatarCallback) {
    const modal = document.getElementById('avatar-selection-modal');
    const optionsGrid = document.getElementById('avatar-options-grid');
    const closeBtn = modal.querySelector('.close-avatar-modal');

    // Populate the avatar options grid using the renderer function
    renderAvatarSelectionOptions(playerNum, currentAvatar, avatarList, (pNum, avatarUrl) => {
        selectAvatarCallback(pNum, avatarUrl); // Call the game's selectAvatar logic
        hideAvatarSelectionModal(); // Hide modal after selection
    }, optionsGrid);

    // Set up close button
    closeBtn.onclick = hideAvatarSelectionModal;

    modal.style.display = 'flex';
}

// NEW: UI Function: Hide the avatar selection modal
export function hideAvatarSelectionModal() {
    document.getElementById('avatar-selection-modal').style.display = 'none';
    document.getElementById('avatar-options-grid').innerHTML = ''; // Clear options
}