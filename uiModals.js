/**
 * uiModals.js
 * Handles all DOM manipulation and logic specifically for modals (slot selection, player stats, general roster, avatar selection).
 */

import { getOrCreateChild } from './uiRenderer.js'; 
import { renderAvatarSelectionOptions } from './uiRenderer.js'; // Import the new rendering function

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
            renderPlayerStatsInModalCallback(playerObj.displayName, result.stats);
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
export function renderPlayerStatsInModal(playerName, stats) {
    const statsContainer = document.getElementById('player-stats-details-container');
    statsContainer.innerHTML = '';

    if (!stats) {
        statsContainer.innerHTML = `<h2>${playerName}</h2><p>No game data available.</p>`;
        return;
    }

    const fantasyPointsRaw = stats.fantasyPoints 
                        || stats.fantasyPointsDefault?.PPR
                        || stats.fantasyPointsDefault?.standard
                        || 0;
    const fantasyPoints = Number(fantasyPointsRaw) || 0;

    const dateStr = stats.gameID ? stats.gameID.slice(0,8) : 'Unknown Date';
    const gameDate = `${dateStr.slice(4,6)}/${dateStr.slice(6,8)}/${dateStr.slice(0,4)}`;
    const opponent = stats.teamAbv || 'Unknown';

    const skipKeys = [
        'recAvg', 'playerID', 'teamID', 'fantasyPointsDefault',
        'scoringPlays', 'playerIDs', 'avg', 'fantasyPoints', 
        'gameID', 'teamAbv' 
    ];

    let passComp = 0, passAtt = 0, passYds = 0, passTD = 0, passInt = 0;
    let rec = 0, targets = 0, recYds = 0;
    let carries = 0, rushYds = 0;

    const lines = [];

    function processStats(obj, prefix = '') {
        for (const key in obj) {
            const lowerKey = (prefix + key).toLowerCase();

            if (skipKeys.some(skip => lowerKey.includes(skip.toLowerCase()))) continue;

            if (typeof obj[key] === 'object' && obj[key] !== null) {
                processStats(obj[key], prefix + key + ' ');
            } else {
                const num = Number(obj[key]);
                if (isNaN(num) || num === 0) continue;

                if (lowerKey.includes('passcompletions')) passComp = num;
                else if (lowerKey.includes('passattempts')) passAtt = num;
                else if (lowerKey.includes('passyds')) passYds = num;
                else if (lowerKey.includes('passtd')) passTD = num;
                else if (lowerKey.includes('int')) passInt = num;
                else if (lowerKey.includes('receptions')) rec = num;
                else if (lowerKey.includes('targets')) targets = num;
                else if (lowerKey.includes('recy')) recYds = num;
                else if (lowerKey.includes('carries')) carries = num;
                else if (lowerKey.includes('rushyds')) rushYds = num;
                else {
                    const label = (prefix + key)
                        .replace(/([a-z])([A-Z])/g, '$1 $2')
                        .replace(/\b\w/g, l => l.toUpperCase());
                    lines.push(`<p>${label}: ${num}</p>`);
                }
            }
        }
    }

    processStats(stats);

    if (passComp || passAtt || passYds || passTD || passInt) {
        let passLine = `Passing: ${passComp}/${passAtt} for ${passYds} yds`;
        if (passTD) passLine += ` ${passTD} TD`;
        if (passInt) passLine += ` ${passInt} INT`;
        lines.unshift(`<p>${passLine}</p>`);
    }
    if (rec || targets || recYds) {
        lines.unshift(`<p>Receiving: ${rec}/${targets} for ${recYds} yds</p>`);
    }
    if (carries || rushYds) {
        lines.unshift(`<p>Rushing: ${carries} carries for ${rushYds} yds</p>`);
    }

    statsContainer.innerHTML = `
        <h2>${playerName} - Last Game Stats</h2>
        <p><strong>Date:</strong> ${gameDate}</p>
        <p><strong>Opponent:</strong> ${opponent}</p>
        ${lines.length ? lines.map(line => `<p>${line}</p>`).join('') : '<p>No detailed stats available.</p>'}
        <p><strong>Fantasy Points:</strong> ${fantasyPoints.toFixed(2)}</p>
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