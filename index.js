const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Serve static frontend files (like map.html) from the public directory
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS for frontend requests
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.all('/generate-polygon', async (req, res) => {
    // Support either query parameter (?address=...) or JSON body
    const address = req.query.address || req.body.address;

    if (!address) {
        return res.status(400).json({ error: "Address is required" });
    }

    try {
        // 1. Geocode the address using free Nominatim API
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
        const https = require('https');
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'FloodZoneTester/1.0' },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        if (response.data.length === 0) {
            return res.status(404).json({ error: "Address not found" });
        }

        const centerLat = parseFloat(response.data[0].lat);
        const centerLng = parseFloat(response.data[0].lon);

        const regions = [];
        const numRegions = Math.floor(Math.random() * 3) + 3; // 3 to 5 regions
        const riskLevels = ["low", "medium", "high"];

        // Place the first region at the exact center
        const centerPoints = [{ lat: centerLat, lng: centerLng }];

        for (let r = 1; r < numRegions; r++) {
            const angle = Math.random() * 2 * Math.PI;
            const distLat = 0.0350 + Math.random() * 0.0200;
            const distLng = 0.0350 + Math.random() * 0.0200;
            centerPoints.push({
                lat: centerLat + (Math.sin(angle) * distLat),
                lng: centerLng + (Math.cos(angle) * distLng)
            });
        }

        // GENERATE BASE POLYGONS
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

        for (const pt of centerPoints) {
            const numPoints = Math.floor(Math.random() * 6) + 5;
            const polygon = [];
            const angleStep = (2 * Math.PI) / numPoints;

            for (let i = 0; i < numPoints; i++) {
                const angle = angleStep * i + (Math.random() * angleStep * 0.8);
                const distanceLat = 0.0050 + Math.random() * 0.0080;
                const distanceLng = 0.0050 + Math.random() * 0.0100;

                const lat = pt.lat + Math.sin(angle) * distanceLat;
                const lng = pt.lng + Math.cos(angle) * distanceLng;
                polygon.push({ lat, lng });

                // Track bounding box for water query
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            }
            polygon.push(polygon[0]);

            regions.push({
                risk_level: riskLevels[Math.floor(Math.random() * riskLevels.length)],
                center: pt,
                polygon_bounds: polygon
            });
        }

        // FETCH WATER BODIES & CLIP POLYGONS TO STAY ON LAND
        try {
            const turf = require('@turf/turf');
            const query = `[out:json][timeout:5];(way["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});relation["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});way["waterway"](${minLat},${minLng},${maxLat},${maxLng}););out geom;`;

            const waterRes = await axios.post('https://overpass-api.de/api/interpreter', query, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                timeout: 5000
            });

            if (waterRes.data && waterRes.data.elements) {
                const waterFeatures = [];
                for (const el of waterRes.data.elements) {
                    if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
                        const coords = el.geometry.map(p => [p.lon, p.lat]);
                        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                            coords.push(coords[0]);
                        }
                        waterFeatures.push(turf.polygon([coords]));
                    }
                }

                // Clip each region against water
                for (let r = 0; r < regions.length; r++) {
                    const region = regions[r];
                    let myPoly = turf.polygon([region.polygon_bounds.map(p => [p.lng, p.lat])]);

                    for (const water of waterFeatures) {
                        try {
                            myPoly = turf.difference(turf.featureCollection([myPoly, water]));
                            if (!myPoly) break;
                        } catch (e) { /* Ignore invalid topologies during subtraction */ }
                    }

                    if (myPoly) {
                        // Extract the outer ring of the remaining polygon
                        let clippedCoords = [];
                        if (myPoly.geometry.type === 'MultiPolygon') {
                            clippedCoords = myPoly.geometry.coordinates[0][0];
                        } else {
                            clippedCoords = myPoly.geometry.coordinates[0];
                        }
                        // Update response with clipped coordinates on land
                        region.polygon_bounds = clippedCoords.map(c => ({ lat: c[1], lng: c[0] }));
                    }
                }
            }
        } catch (waterError) {
            console.error("Water clipping skipped (timeout/error):", waterError.message);
        }

        res.json({
            input_address: address,
            resolved_address: response.data[0].display_name,
            center: { lat: centerLat, lng: centerLng },
            regions: regions
        });

    } catch (error) {
        console.error("Error geocoding:", error.message || error);
        res.status(500).json({ error: "Failed to fetch geocode data", details: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Service running on http://localhost:${PORT}`));
