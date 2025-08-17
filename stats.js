import { teams } from './data.js';
import { getTank01PlayerID, fetchLastGameStats } from './api.js';
import { showPlayerStatsModal, hidePlayerStatsModal, renderPlayerStatsInModal } from './uiModals.js';

document.addEventListener('DOMContentLoaded', () => {
    const teamListContainer = document.getElementById('team-list');
    
    if (!teamListContainer) return;

    renderTeamList();

    // Attach event listeners for stats modal
    document.querySelector('.close-stats').addEventListener('click', hidePlayerStatsModal);
    window.addEventListener('click', (event) => {
        const statsModal = document.getElementById('player-stats-modal');
        if (event.target === statsModal) {
            hidePlayerStatsModal();
        }
    });
});

/**
 * Renders the list of all NFL teams in the sidebar.
 */
function renderTeamList() {
    const teamListEl = document.getElementById('team-list');
    teamListEl.innerHTML = '';

    teams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-list-item';
        teamItem.dataset.teamId = team.id;
        teamItem.innerHTML = `
            <img src="${team.logo}" alt="${team.name} logo">
            <span>${team.name}</span>
        `;
        teamItem.addEventListener('click', () => {
             // Handle selected state for styling
            document.querySelectorAll('.team-list-item').forEach(el => el.classList.remove('selected'));
            teamItem.classList.add('selected');
            fetchAndDisplayRoster(team);
        });
        teamListEl.appendChild(teamItem);
    });
}

/**
 * Fetches roster data for a selected team and triggers rendering.
 * @param {object} team - The selected team object from data.js.
 */
async function fetchAndDisplayRoster(team) {
    const rosterContainer = document.getElementById('roster-display-container');
    rosterContainer.innerHTML = `<div class="loading-message"><p>Loading ${team.name} roster...</p></div>`;

    try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`);
        if (!response.ok) {
            throw new Error(`Failed to fetch roster: ${response.statusText}`);
        }
        const data = await response.json();
        renderRoster(team, data.athletes);
    } catch (error) {
        console.error('Error fetching roster:', error);
        rosterContainer.innerHTML = `<div class="error-message"><p>Could not load roster for ${team.name}. Please try again later.</p></div>`;
    }
}

/**
 * Renders the team's roster, grouped by position.
 * @param {object} team - The team object.
 * @param {Array} teamAthletes - The array of player data from the API.
 */
function renderRoster(team, teamAthletes) {
    const rosterContainer = document.getElementById('roster-display-container');
    rosterContainer.innerHTML = '';

    // Add a header for the selected team
    const header = document.createElement('div');
    header.className = 'roster-team-header';
    header.innerHTML = `
        <img src="${team.logo}" alt="${team.name} logo">
        <h2>${team.name} Roster</h2>
    `;
    rosterContainer.appendChild(header);

    const allPlayers = teamAthletes.flatMap(positionGroup => positionGroup.items || []);
    
    if (allPlayers.length === 0) {
        rosterContainer.innerHTML += '<p>No active roster players found for this team.</p>';
        return;
    }

    const positionGroups = {};
    allPlayers.forEach(player => {
        let position = player.position?.abbreviation || 'N/A';
        if (!positionGroups[position]) {
            positionGroups[position] = [];
        }
        positionGroups[position].push(player);
    });

    const positionOrder = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P', 'LS', 'N/A'];
    positionOrder.forEach(position => {
        if (positionGroups[position] && positionGroups[position].length > 0) {
            const positionDiv = document.createElement('div');
            positionDiv.style.marginBottom = '1.5rem';
            
            const title = document.createElement('h4');
            title.textContent = positionGroups[position][0].position?.displayName || position;
            title.style.color = '#3b82f6';
            title.style.fontSize = '1.125rem';
            title.style.fontWeight = '600';
            title.style.marginBottom = '0.75rem';
            positionDiv.appendChild(title);
            
            const playersList = document.createElement('div');
            playersList.style.display = 'grid';
            playersList.style.gap = '1rem';
            playersList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
            
            positionGroups[position].forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.classList.add('player-draft-card', 'stats-player-card'); // Re-use class for styling
                
                const fillerHeadshot = 'https://i.postimg.cc/Hxsb5C4T/Chat-GPT-Image-Aug-16-2025-02-34-57-PM.png';
                const headshotSrc = player.headshot?.href || fillerHeadshot;

                playerDiv.innerHTML = `
                    <div class="player-card-header">
                        <img class="player-photo" src="${headshotSrc}" alt="${player.displayName}">
                        <div class="player-name-text">${player.displayName}</div>
                    </div>
                    <div class="player-meta-text">
                        <span>${player.position?.name || 'N/A'}</span>
                        <span class="draft-action-text" style="color:#AE2012; background: none;">View Stats</span>
                    </div>
                `;
                
                playerDiv.addEventListener('click', () => {
                    openPlayerStatsModalCaller(player);
                });
                
                playersList.appendChild(playerDiv);
            });
            
            positionDiv.appendChild(playersList);
            rosterContainer.appendChild(positionDiv);
        }
    });
}

/**
 * Acts as a bridge to call the stats modal with the necessary dependencies.
 * @param {object} playerObj - The player object from the roster.
 */
function openPlayerStatsModalCaller(playerObj) {
    // Manually create an 'originalPosition' property for defense for compatibility with the modal function.
    const modifiedPlayerObj = { ...playerObj };
    if (playerObj.position?.abbreviation === 'DT' || playerObj.position?.abbreviation === 'DE' || playerObj.position?.abbreviation === 'NT') {
        modifiedPlayerObj.originalPosition = 'DEF';
    }
    
    showPlayerStatsModal(modifiedPlayerObj, teams, getTank01PlayerID, fetchLastGameStats, renderPlayerStatsInModal);
}