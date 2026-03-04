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

        // Generate offsets for the other regions
        // Instead of purely random angles which can group polygons together and overlap,
        // we use a 4-quadrant system to force them far away from each other and the center.
        const gridOffsets = [
            { latModifier: 1, lngModifier: 1 },   // Top Right
            { latModifier: 1, lngModifier: -1 },  // Top Left
            { latModifier: -1, lngModifier: 1 },  // Bottom Right
            { latModifier: -1, lngModifier: -1 }  // Bottom Left
        ];

        // Shuffle the grid directions so the 3-5 regions don't always appear in the same spots
        gridOffsets.sort(() => Math.random() - 0.5);

        for (let r = 1; r < numRegions && r <= gridOffsets.length; r++) {
            // Maximum radius of a polygon is ~0.0150
            // Placing the centers 0.0400 degrees away in both directions mathematically guarantees no overlap
            const distLat = 0.0400 + Math.random() * 0.0200;
            const distLng = 0.0400 + Math.random() * 0.0200;

            centerPoints.push({
                lat: centerLat + (distLat * gridOffsets[r - 1].latModifier),
                lng: centerLng + (distLng * gridOffsets[r - 1].lngModifier)
            });
        }

        for (const pt of centerPoints) {
            const numPoints = Math.floor(Math.random() * 6) + 5; // Generate 5 to 10 vertices
            const polygon = [];
            const angleStep = (2 * Math.PI) / numPoints;

            for (let i = 0; i < numPoints; i++) {
                const angle = angleStep * i + (Math.random() * angleStep * 0.8);
                const distanceLat = 0.0050 + Math.random() * 0.0080;
                const distanceLng = 0.0050 + Math.random() * 0.0100;

                polygon.push({
                    lat: pt.lat + Math.sin(angle) * distanceLat,
                    lng: pt.lng + Math.cos(angle) * distanceLng
                });
            }
            polygon.push(polygon[0]);

            regions.push({
                risk_level: riskLevels[Math.floor(Math.random() * riskLevels.length)],
                center: pt,
                polygon_bounds: polygon
            });
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
