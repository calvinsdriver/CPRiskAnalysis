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

        // 2. Generate a randomized polygon completely surrounding the center
        const numPoints = Math.floor(Math.random() * 4) + 5; // Generate 5 to 8 vertices
        const polygon = [];
        const angleStep = (2 * Math.PI) / numPoints;

        for (let i = 0; i < numPoints; i++) {
            // Randomize angle within the segment to distribute points around the circle
            const angle = angleStep * i + (Math.random() * angleStep * 0.8);

            // Randomize distance for each point (between 0.0005 and 0.0015 degrees)
            const distanceLat = 0.0005 + Math.random() * 0.0010;
            const distanceLng = 0.0005 + Math.random() * 0.0015;

            const latOffset = Math.sin(angle) * distanceLat;
            const lngOffset = Math.cos(angle) * distanceLng;

            polygon.push({
                lat: centerLat + latOffset,
                lng: centerLng + lngOffset
            });
        }

        // Close the shape by repeating the first point
        polygon.push(polygon[0]);

        // 3. Generate a random risk level
        const riskLevels = ["low", "medium", "high"];
        const randomRiskLevel = riskLevels[Math.floor(Math.random() * riskLevels.length)];

        res.json({
            input_address: address,
            resolved_address: response.data[0].display_name,
            risk_level: randomRiskLevel,
            center: { lat: centerLat, lng: centerLng },
            polygon_bounds: polygon
        });

    } catch (error) {
        console.error("Error geocoding:", error.message || error);
        res.status(500).json({ error: "Failed to fetch geocode data", details: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Service running on http://localhost:${PORT}`));
