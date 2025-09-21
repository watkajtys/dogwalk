document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startWalkButton = document.getElementById('start-walk');
    const endWalkButton = document.getElementById('end-walk');
    const paceEl = document.getElementById('pace');
    const sniffCountEl = document.getElementById('sniff-count');
    const meanSniffTimeEl = document.getElementById('mean-sniff-time');
    const totalTimeEl = document.getElementById('total-time');
    const canvas = document.getElementById('walk-canvas');
    const ctx = canvas.getContext('2d');

    // Page and Nav Elements
    const dashboardPage = document.getElementById('dashboard-page');
    const historyPage = document.getElementById('history-page');
    const detailsPage = document.getElementById('details-page');
    const navDashboardButton = document.getElementById('nav-dashboard');
    const navHistoryButton = document.getElementById('nav-history');
    const backToHistoryButton = document.getElementById('back-to-history');
    const historyListEl = document.getElementById('history-list');
    const detailsTitleEl = document.getElementById('details-title');
    const detailsCanvasEl = document.getElementById('details-walk-canvas');
    const detailsCanvasCtx = detailsCanvasEl.getContext('2d');
    const detailsStatsEl = document.getElementById('details-stats');

    // Constants
    const SNIFF_SPEED_THRESHOLD = 0.5; // meters/second
    const SNIFF_TIME_THRESHOLD = 10000; // 10 seconds in milliseconds

    // State
    let walkState = 'not_started'; // not_started, walking, sniffing, ended
    let watchId = null;
    let walkTimerId = null;
    let positions = [];
    let startTime = null;
    let totalDistance = 0; // in meters
    let sniffCount = 0;
    let totalSniffTime = 0; // in milliseconds
    let sniffStartTime = null;

    // Event Listeners
    startWalkButton.addEventListener('click', startWalk);
    endWalkButton.addEventListener('click', endWalk);
    navDashboardButton.addEventListener('click', () => {
        showView('dashboard-page');
        setActiveNav('nav-dashboard');
    });
    navHistoryButton.addEventListener('click', () => {
        renderHistoryPage();
        showView('history-page');
        setActiveNav('nav-history');
    });
    backToHistoryButton.addEventListener('click', () => showView('history-page'));

    function startWalk() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(initialPosition => {
                // Reset state for a new walk
                walkState = 'walking';
                startTime = Date.now();
                positions = [{
                    coords: {
                        latitude: initialPosition.coords.latitude,
                        longitude: initialPosition.coords.longitude,
                        speed: initialPosition.coords.speed,
                    },
                    timestamp: initialPosition.timestamp,
                }];
                totalDistance = 0;
                sniffCount = 0;
                totalSniffTime = 0;
                sniffStartTime = null;

                // Reset UI
                paceEl.textContent = '0:00';
                sniffCountEl.textContent = '0';
                meanSniffTimeEl.textContent = '0s';
                totalTimeEl.textContent = '00:00:00';
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (walkTimerId) clearInterval(walkTimerId);
                walkTimerId = setInterval(updateTotalTime, 1000);

                watchId = navigator.geolocation.watchPosition(handlePositionUpdate, handleError, { enableHighAccuracy: true });

                startWalkButton.style.display = 'none';
                endWalkButton.style.display = 'block';

                console.log('Walk started');
            }, handleError);
        } else {
            alert('Geolocation is not supported by this browser.');
        }
    }

    function endWalk() {
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
        }
        if (walkTimerId) {
            clearInterval(walkTimerId);
            walkTimerId = null;
        }
        walkState = 'ended';
        startWalkButton.style.display = 'block';
        endWalkButton.style.display = 'none';
        console.log('Walk ended');
        saveWalk();
    }

    function saveWalk() {
        const endTime = Date.now();
        const walkData = {
            startTime,
            endTime,
            totalDistance,
            sniffCount,
            totalSniffTime,
            positions,
        };

        try {
            const walks = JSON.parse(localStorage.getItem('dogWalks')) || [];
            walks.push(walkData);
            localStorage.setItem('dogWalks', JSON.stringify(walks));
            console.log('Walk saved to local storage');
        } catch (e) {
            console.error('Could not save walk to local storage', e);
        }
    }

    function handlePositionUpdate(position) {
        if (positions.length > 0) {
            const lastPosition = positions[positions.length - 1];
            const newDistance = calculateDistance(
                lastPosition.coords.latitude,
                lastPosition.coords.longitude,
                position.coords.latitude,
                position.coords.longitude
            );
            totalDistance += newDistance;
        }

        positions.push({
            coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                speed: position.coords.speed,
            },
            timestamp: position.timestamp,
        });

        const speed = position.coords.speed === null ? 0 : position.coords.speed;

        if (speed < SNIFF_SPEED_THRESHOLD) {
            if (walkState === 'walking') {
                walkState = 'sniffing';
                sniffStartTime = Date.now();
            }
        } else { // speed is above threshold
            if (walkState === 'sniffing') {
                const sniffDuration = Date.now() - sniffStartTime;
                if (sniffDuration >= SNIFF_TIME_THRESHOLD) {
                    sniffCount++;
                    totalSniffTime += sniffDuration;
                }
                walkState = 'walking';
                sniffStartTime = null;
            }
        }

        updateStats();
        drawPath(ctx, positions);
    }

    function handleError(error) {
        console.error('Error getting location:', error);
        alert('Error getting location: ' + error.message);
    }

    function updateStats() {
        // Update Sniff Count
        sniffCountEl.textContent = sniffCount;

        // Update Mean Sniff Time
        if (sniffCount > 0) {
            const meanSniffSeconds = Math.round(totalSniffTime / sniffCount / 1000);
            meanSniffTimeEl.textContent = `${meanSniffSeconds}s`;
        } else {
            meanSniffTimeEl.textContent = '0s';
        }

        // Update Pace
        const totalWalkDuration = Date.now() - startTime;
        const movingTime = totalWalkDuration - totalSniffTime; // in ms
        if (totalDistance > 0 && movingTime > 0) {
            const metersPerSecond = totalDistance / (movingTime / 1000);
            const milesPerHour = metersPerSecond * 2.23694;
            if (milesPerHour > 0.1) { // Only show pace if moving at a reasonable speed
                const minutesPerMile = 60 / milesPerHour;
                const paceMinutes = Math.floor(minutesPerMile);
                const paceSeconds = Math.round((minutesPerMile - paceMinutes) * 60);
                paceEl.textContent = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;
            } else {
                 paceEl.textContent = '0:00';
            }
        } else {
            paceEl.textContent = '0:00';
        }
    }

    function drawPath(targetCtx, pathPositions) {
        if (pathPositions.length < 2) return;
        const canvas = targetCtx.canvas;
        // Ensure canvas has a size
        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        targetCtx.clearRect(0, 0, canvas.width, canvas.height);

        // Find bounding box of the walk
        let minLat = pathPositions[0].coords.latitude;
        let maxLat = pathPositions[0].coords.latitude;
        let minLon = pathPositions[0].coords.longitude;
        let maxLon = pathPositions[0].coords.longitude;

        for (const pos of pathPositions) {
            minLat = Math.min(minLat, pos.coords.latitude);
            maxLat = Math.max(maxLat, pos.coords.latitude);
            minLon = Math.min(minLon, pos.coords.longitude);
            maxLon = Math.max(maxLon, pos.coords.longitude);
        }

        const latRange = maxLat - minLat;
        const lonRange = maxLon - minLon;

        const padding = 20;
        const effectiveCanvasWidth = canvas.width - padding * 2;
        const effectiveCanvasHeight = canvas.height - padding * 2;

        if (latRange === 0 && lonRange === 0) return;

        const scale = Math.min(
            effectiveCanvasWidth / (lonRange || 1),
            effectiveCanvasHeight / (latRange || 1)
        );

        const offsetX = (effectiveCanvasWidth - lonRange * scale) / 2;
        const offsetY = (effectiveCanvasHeight - latRange * scale) / 2;


        targetCtx.strokeStyle = '#38e07b';
        targetCtx.lineWidth = 3;
        targetCtx.beginPath();

        for (let i = 0; i < pathPositions.length; i++) {
            const pos = pathPositions[i];
            const x = padding + offsetX + (pos.coords.longitude - minLon) * scale;
            const y = padding + offsetY + (maxLat - pos.coords.latitude) * scale;

            if (i === 0) {
                targetCtx.moveTo(x, y);
            } else {
                targetCtx.lineTo(x, y);
            }
        }
        targetCtx.stroke();
    }

    function updateTotalTime() {
        if (!startTime) return;
        const elapsed = Date.now() - startTime;
        totalTimeEl.textContent = formatDuration(elapsed);
    }

    function formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // --- History and Details Page Rendering ---
    function renderHistoryPage() {
        historyListEl.innerHTML = ''; // Clear old content

        const walks = JSON.parse(localStorage.getItem('dogWalks')) || [];

        if (walks.length === 0) {
            historyListEl.innerHTML = `<p class="text-center text-slate-500">You haven't recorded any walks yet.</p>`;
            return;
        }

        // Newest first
        walks.slice().reverse().forEach((walk, index) => {
            const walkId = walks.length - 1 - index; // Original index in the walks array

            const duration = formatDuration(walk.endTime - walk.startTime);
            const distanceMiles = (walk.totalDistance * 0.000621371).toFixed(2);
            const walkDate = new Date(walk.startTime).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            const walkElement = document.createElement('div');
            walkElement.className = 'bg-white dark:bg-background-dark rounded-lg shadow p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors';

            walkElement.innerHTML = `
                <div>
                    <p class="font-bold text-lg text-slate-800 dark:text-slate-200">${walkDate}</p>
                    <div class="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
                        <span>Duration: ${duration}</span>
                        <span>Distance: ${distanceMiles} mi</span>
                    </div>
                </div>
                <svg class="text-slate-400" fill="currentColor" height="24" viewBox="0 0 256 256" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M181.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L164.69,128,98.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,181.66,133.66Z"></path></svg>
            `;

            walkElement.addEventListener('click', () => {
                renderDetailsPage(walkId);
            });

            historyListEl.appendChild(walkElement);
        });
    }

    function renderDetailsPage(walkId) {
        const walks = JSON.parse(localStorage.getItem('dogWalks')) || [];
        const walk = walks[walkId];

        if (!walk) {
            alert('Could not find walk data.');
            showView('history-page'); // Go back to safety
            return;
        }

        // Set title
        const walkDate = new Date(walk.startTime).toLocaleString(undefined, {
            dateStyle: 'full',
            timeStyle: 'short'
        });
        detailsTitleEl.textContent = walkDate;

        // --- Calculate and display stats ---
        detailsStatsEl.innerHTML = ''; // Clear previous stats

        // Total Time
        const totalTime = formatDuration(walk.endTime - walk.startTime);
        addStat(detailsStatsEl, 'Total Time', totalTime);

        // Total Distance
        const distanceMiles = (walk.totalDistance * 0.000621371).toFixed(2);
        addStat(detailsStatsEl, 'Distance', `${distanceMiles} mi`);

        // Pace
        const totalWalkDuration = walk.endTime - walk.startTime;
        const movingTime = totalWalkDuration - walk.totalSniffTime;
        let paceString = 'N/A';
        if (walk.totalDistance > 0 && movingTime > 0) {
            const metersPerSecond = walk.totalDistance / (movingTime / 1000);
            const milesPerHour = metersPerSecond * 2.23694;
            if (milesPerHour > 0.1) {
                const minutesPerMile = 60 / milesPerHour;
                const paceMinutes = Math.floor(minutesPerMile);
                const paceSeconds = Math.round((minutesPerMile - paceMinutes) * 60);
                paceString = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')} / mile`;
            }
        }
        addStat(detailsStatsEl, 'Avg. Pace', paceString);

        // Sniff Count
        addStat(detailsStatsEl, 'Sniff Count', walk.sniffCount);

        // Mean Sniff Time
        let meanSniffString = '0s';
        if (walk.sniffCount > 0) {
            const meanSniffSeconds = Math.round(walk.totalSniffTime / walk.sniffCount / 1000);
            meanSniffString = `${meanSniffSeconds}s`;
        }
        addStat(detailsStatsEl, 'Mean Sniff Time', meanSniffString);

        // --- Draw path ---
        drawPath(detailsCanvasCtx, walk.positions);

        showView('details-page');
    }

    function addStat(container, label, value) {
        const statEl = document.createElement('div');
        statEl.className = 'bg-slate-50 dark:bg-gray-700 p-3 rounded-lg flex flex-col items-center justify-center';
        statEl.innerHTML = `
            <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">${label}</span>
            <span class="text-2xl font-bold text-slate-900 dark:text-slate-50">${value}</span>
        `;
        container.appendChild(statEl);
    }


    // --- Page Navigation ---
    function showView(viewId) {
        // Hide all pages
        dashboardPage.style.display = 'none';
        historyPage.style.display = 'none';
        detailsPage.style.display = 'none';

        // Show the requested page
        const page = document.getElementById(viewId);
        if (page) {
            // dashboard-page uses flex display because of its layout
            if (viewId === 'dashboard-page') {
                page.style.display = 'flex';
            } else {
                page.style.display = 'block';
            }
        }
    }

    function setActiveNav(buttonId) {
        const buttons = [navDashboardButton, navHistoryButton];
        buttons.forEach(button => {
            if (button.id === buttonId) {
                button.classList.add('text-primary');
                button.classList.remove('text-slate-600', 'dark:text-slate-300');
            } else {
                button.classList.remove('text-primary');
                button.classList.add('text-slate-600', 'dark:text-slate-300');
            }
        });
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180; // φ, λ in radians
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        const d = R * c; // in metres
        return d;
    }
});
