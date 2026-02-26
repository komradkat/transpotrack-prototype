document.addEventListener('alpine:init', () => {
    Alpine.data('missionControl', () => ({
        map: null,
        markers: {}, // Store marker instances by van ID
        traces: {},  // Store polyline instances by van ID
        currentTime: '',
        selectedVanId: null,
        isLocked: false,
        lastView: { center: [11.12, 124.95], zoom: 11 },
        terminalPos: { lat: 11.2423, lng: 125.0039 }, // Tacloban Terminal

        // Accurate road path from Burauen to Tacloban
        burauenToTaclobanRoute: [
            { lat: 10.9750, lng: 124.8910 }, // Burauen
            { lat: 11.0120, lng: 124.8950 },
            { lat: 11.0650, lng: 124.9010 }, // Dagami
            { lat: 11.1000, lng: 124.9300 },
            { lat: 11.1600, lng: 124.9900 }, // Palo
            { lat: 11.2000, lng: 125.0020 },
            { lat: 11.2423, lng: 125.0039 }  // Tacloban Terminal
        ],

        vans: [
            { id: '05', driver: 'Marco Dela Cruz', status: 'In Transit', eta: 12, pos: { lat: 10.9750, lng: 124.8910 }, history: [], nearTerminal: false, heading: 0, routeIndex: 0, progress: 0 },
            { id: '08', driver: 'Juan Luna', status: 'In Transit', eta: 4, pos: { lat: 11.2000, lng: 125.0020 }, history: [], nearTerminal: false, heading: 0, routeIndex: 5, progress: 0.2 },
            { id: '12', driver: 'Elena Santos', status: 'Stalled', eta: 0, pos: { lat: 11.1601, lng: 124.9904 }, history: [], nearTerminal: false, heading: 90, routeIndex: 4, progress: 0 },
            { id: '03', driver: 'Rico Reyes', status: 'In Transit', eta: 25, pos: { lat: 11.0120, lng: 124.8950 }, history: [], nearTerminal: false, heading: 0, routeIndex: 1, progress: 0.5 }
        ],

        init() {
            console.log('Mission Control Initialized');
            this.updateTime();
            setInterval(() => this.updateTime(), 1000);
            this.initMap();
            this.startSimulation();
        },

        updateTime() {
            const now = new Date();
            this.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        },

        initMap() {
            this.map = L.map('map').setView([this.terminalPos.lat, this.terminalPos.lng], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(this.map);

            // Auto-Unlock on manual interaction
            this.map.on('dragstart zoomstart', () => {
                if (this.isLocked) {
                    this.isLocked = false;
                    console.log("Map interaction detected: Disabling auto-follow.");
                }
            });

            // Terminal Marker (Formal Style)
            const terminalIcon = L.divIcon({
                className: 'terminal-marker-container',
                html: `
                    <div class="w-8 h-8 bg-blue-600 border-2 border-slate-900 rounded-lg flex items-center justify-center text-white shadow-lg">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 0 011-1h2a1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            L.marker([this.terminalPos.lat, this.terminalPos.lng], { icon: terminalIcon }).addTo(this.map);

            // Geofence (Formal style)
            L.circle([this.terminalPos.lat, this.terminalPos.lng], {
                color: '#1e3a8a',
                fillColor: '#1e3a8a',
                fillOpacity: 0.05,
                radius: 500,
                dashArray: '5, 5'
            }).addTo(this.map);

            // Initial render of van markers and traces
            this.renderVans();
        },

        renderVans() {
            this.vans.forEach(van => {
                // Polyline for trace
                const trace = L.polyline([], {
                    color: '#64748b',
                    weight: 2,
                    opacity: 0.4,
                    dashArray: '6, 6'
                }).addTo(this.map);
                this.traces[van.id] = trace;

                const vanIcon = L.divIcon({
                    className: 'van-marker-container',
                    html: `
                        <div class="van-marker" style="transform: rotate(${van.heading}deg)">
                            <svg viewBox="0 0 24 24" fill="none" class="w-7 h-7 text-blue-900">
                                <path d="M12 2L4 20L12 16L20 20L12 2Z" fill="currentColor" />
                            </svg>
                        </div>
                    `,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });

                const marker = L.marker([van.pos.lat, van.pos.lng], { icon: vanIcon }).addTo(this.map);
                this.markers[van.id] = marker;
            });
        },

        startSimulation() {
            setInterval(() => {
                this.vans.forEach(van => {
                    if (van.status === 'Stalled') return;

                    // Waypoint interpolation
                    const currentWP = this.burauenToTaclobanRoute[van.routeIndex];
                    const nextWP = this.burauenToTaclobanRoute[van.routeIndex + 1];

                    if (!nextWP) return; // Reached terminal

                    van.progress += 0.01; // Movement step
                    if (van.progress >= 1) {
                        van.progress = 0;
                        van.routeIndex++;
                    }

                    if (this.burauenToTaclobanRoute[van.routeIndex + 1]) {
                        const target = this.burauenToTaclobanRoute[van.routeIndex + 1];
                        const start = this.burauenToTaclobanRoute[van.routeIndex];

                        van.pos.lat = start.lat + (target.lat - start.lat) * van.progress;
                        van.pos.lng = start.lng + (target.lng - start.lng) * van.progress;

                        // Calculate heading
                        van.heading = (Math.atan2(target.lng - start.lng, target.lat - start.lat) * 180 / Math.PI);
                    }

                    // Distance to terminal for ETA and Proximity
                    const dLat = this.terminalPos.lat - van.pos.lat;
                    const dLng = this.terminalPos.lng - van.pos.lng;
                    const distance = Math.sqrt(dLat * dLat + dLng * dLng);

                    van.history.push([van.pos.lat, van.pos.lng]);
                    if (van.history.length > 30) van.history.shift();
                    if (this.traces[van.id]) this.traces[van.id].setLatLngs(van.history);

                    van.eta = Math.max(1, Math.round(distance * 600));

                    const wasNear = van.nearTerminal;
                    van.nearTerminal = distance < 0.0045;

                    if (van.nearTerminal) {
                        van.status = 'Approaching';
                        // Auto-lock on first approach trigger
                        if (!wasNear && !this.isLocked) {
                            this.selectVan(van.id);
                            this.map.setZoom(15, { animate: true }); // Zoom in on auto-lock
                        }
                    } else {
                        van.status = 'In Transit';
                    }

                    // Update Leaflet Marker Position
                    if (this.markers[van.id]) {
                        this.markers[van.id].setLatLng([van.pos.lat, van.pos.lng]);
                        // Update rotation via DOM (since Leaflet divIcon doesn't natively support rotation property easily)
                        const el = this.markers[van.id].getElement();
                        if (el) {
                            const markerEl = el.querySelector('.van-marker');
                            if (markerEl) markerEl.style.transform = `rotate(${van.heading}deg)`;
                        }

                        // Follow locked van - use setView for immediate position update without animation queue conflicts
                        if (this.isLocked && this.selectedVanId === van.id) {
                            this.map.panTo([van.pos.lat, van.pos.lng], { animate: true, duration: 0.5 });
                        }
                    }
                });
            }, 1000);
        },

        getStatusColor(status) {
            switch (status) {
                case 'In Transit': return 'bg-blue-100 text-blue-700 border border-blue-200';
                case 'Approaching': return 'bg-green-100 text-green-700 border border-green-200';
                case 'Stalled': return 'bg-red-100 text-red-700 border border-red-200';
                default: return 'bg-slate-100 text-slate-700 border border-slate-200';
            }
        },

        // Tour Logic
        tourActive: false,
        tourStep: 0,
        tourSteps: [
            {
                title: "Dashboard Overview",
                content: "Welcome to the Fleet Management System. This interface provides real-time tracking and logistics data for all active transport units in Leyte.",
                target: null,
                highlightVan: null
            },
            {
                title: "Corporate Branding",
                content: "The dashboard is configured for Leyte Express operations, featuring standard administrative branding and local terminal protocols.",
                target: "header",
                highlightVan: null
            },
            {
                title: "Fleet Inventory",
                content: "The primary list displays all active vehicles. Monitor driver information, current status, and estimated arrival times from this panel.",
                target: "sidebar",
                highlightVan: null
            },
            {
                title: "Vehicle Tracking",
                content: "Specific units can be prioritized for detailed monitoring. Unit #05 is currently being tracked with active telemetry.",
                target: "sidebar",
                highlightVan: '05'
            },
            {
                title: "Geospatial Location",
                content: "The central map displays the exact geographic coordinates of each unit as they travel the Burauen-Tacloban route.",
                target: "map",
                highlightVan: '05'
            },
            {
                title: "Travel History",
                content: "Historical route data is visualized as dashed lines, allowing dispatchers to verify recent travel paths.",
                target: "map",
                highlightVan: '05'
            },
            {
                title: "Arrival Notifications",
                content: "Units within 500 meters of the terminal are automatically identified as 'Approaching' to facilitate arrival preparation.",
                target: "sidebar",
                highlightVan: '08'
            }
        ],

        startTour() {
            this.tourActive = true;
            this.tourStep = 0;
            this.handleTourStepActions();
        },

        endTour() {
            this.tourActive = false;
        },

        nextStep() {
            if (this.tourStep < this.tourSteps.length - 1) {
                this.tourStep++;
                this.handleTourStepActions();
            } else {
                this.endTour();
            }
        },

        prevStep() {
            if (this.tourStep > 0) {
                this.tourStep--;
                this.handleTourStepActions();
            }
        },

        selectVan(vanId) {
            if (this.selectedVanId === vanId) {
                // Unlock and restore view
                this.selectedVanId = null;
                this.isLocked = false;
                this.map.setView(this.lastView.center, this.lastView.zoom, { animate: true });
            } else {
                // Save current map view before locking
                this.lastView = {
                    center: this.map.getCenter(),
                    zoom: this.map.getZoom()
                };
                // Lock onto new van
                this.selectedVanId = vanId;
                this.isLocked = true;
                this.highlightMarker(vanId);
            }
        },

        handleTourStepActions() {
            const step = this.tourSteps[this.tourStep];
            if (step.highlightVan) {
                this.scrollToCard(step.highlightVan);
                this.highlightMarker(step.highlightVan);
            }
        },

        scrollToCard(vanId) {
            const el = document.getElementById(`van-card-${vanId}`);
            const list = document.getElementById('fleet-list');
            if (el && list) {
                const topPos = el.offsetTop - list.offsetTop - 10;
                list.scrollTo({ top: topPos, behavior: 'smooth' });
            }
        },

        highlightMarker(vanId) {
            const marker = this.markers[vanId];
            if (marker && this.map) {
                this.map.panTo(marker.getLatLng(), { animate: true });

                // Add temporary pulse effect to the marker via CSS
                const el = marker.getElement();
                if (el) {
                    const markerEl = el.querySelector('.van-marker');
                    if (markerEl) {
                        markerEl.classList.add('pulse-highlight');
                        setTimeout(() => markerEl.classList.remove('pulse-highlight'), 3000);
                    }
                }
            }
        }
    }));
});
