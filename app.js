document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startWalkButton = document.getElementById('start-walk');
    const endWalkButton = document.getElementById('end-walk');
    const paceEl = document.getElementById('pace');
    const sniffCountEl = document.getElementById('sniff-count');
    const meanSniffTimeEl = document.getElementById('mean-sniff-time');
    const canvas = document.getElementById('walk-canvas');
    const ctx = canvas.getContext('2d');

    // Constants
    const SNIFF_SPEED_THRESHOLD = 0.5; // meters/second
    const SNIFF_TIME_THRESHOLD = 10000; // 10 seconds in milliseconds

    // State
    let walkState = 'not_started'; // not_started, walking, sniffing, ended
    let watchId = null;
    let positions = [];
    let startTime = null;
    let totalDistance = 0; // in meters
    let sniffCount = 0;
    let totalSniffTime = 0; // in milliseconds
    let sniffStartTime = null;

    // Event Listeners
    startWalkButton.addEventListener('click', startWalk);
    endWalkButton.addEventListener('click', endWalk);

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
                ctx.clearRect(0, 0, canvas.width, canvas.height);


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
        drawPath();
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

    function drawPath() {
        if (positions.length < 2) return;

        // Ensure canvas has a size
        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Find bounding box of the walk
        let minLat = positions[0].coords.latitude;
        let maxLat = positions[0].coords.latitude;
        let minLon = positions[0].coords.longitude;
        let maxLon = positions[0].coords.longitude;

        for (const pos of positions) {
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


        ctx.strokeStyle = '#38e07b';
        ctx.lineWidth = 3;
        ctx.beginPath();

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const x = padding + offsetX + (pos.coords.longitude - minLon) * scale;
            const y = padding + offsetY + (maxLat - pos.coords.latitude) * scale;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
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
