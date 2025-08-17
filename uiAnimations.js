/**
 * uiAnimations.js
 * Manages UI elements related to animations and overlays.
 */

// UI Function: Show/Hide the team animation overlay
export function showTeamAnimationOverlay(text, logoSrc = '', isAvatar = false) {
    const animationOverlay = document.getElementById('team-animation');
    const cyclingLogo = document.getElementById('cycling-logo');
    const animationText = document.getElementById('animation-text');

    animationText.textContent = text;

    if (logoSrc) {
        cyclingLogo.src = logoSrc;
        cyclingLogo.style.display = 'block';
    } else {
        cyclingLogo.style.display = 'none';
    }
    // Apply or remove the 'is-avatar' class based on the input
    if (isAvatar) {
        cyclingLogo.classList.add('is-avatar');
    } else {
        cyclingLogo.classList.remove('is-avatar');
    }
    animationOverlay.style.display = 'flex';
}

export function hideTeamAnimationOverlay() {
    const cyclingLogo = document.getElementById('cycling-logo');
    cyclingLogo.classList.remove('is-avatar'); // Ensure the class is removed when hidden
    document.getElementById('team-animation').style.display = 'none';
}