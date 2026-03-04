const axios = require('axios');
const turf = require('@turf/turf');
const https = require('https');

async function getWaterFeatures(bbox) {
    const minLat = bbox[0];
    const minLng = bbox[1];
    const maxLat = bbox[2];
    const maxLng = bbox[3];

    // We only need water polygons. Ways with natural=water.
    const query = `
        [out:json][timeout:5];
        (
            way["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
            relation["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
        );
        out geom;
    `;

    try {
        const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 5000
        });

        const features = [];
        if (response.data && response.data.elements) {
            for (const el of response.data.elements) {
                if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
                    const coords = el.geometry.map(pt => [pt.lon, pt.lat]);
                    // Ensure it's a closed ring
                    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                        coords.push(coords[0]);
                    }
                    features.push(turf.polygon([coords]));
                }
            }
        }
        return features;
    } catch (error) {
        console.error("Overpass error:", error.message);
        return [];
    }
}

async function run() {
    // Generate a simple test polygon covering a port area in Hamburg
    // Harbor: 53.542, 9.992
    const centerLat = 53.542;
    const centerLng = 9.992;
    const numPoints = 8;
    const polygon = [];
    const angleStep = (2 * Math.PI) / numPoints;

    const dLat = 0.010;
    const dLng = 0.015;

    for (let i = 0; i < numPoints; i++) {
        const angle = angleStep * i;
        polygon.push({
            lat: centerLat + Math.sin(angle) * dLat,
            lng: centerLng + Math.cos(angle) * dLng
        });
    }
    polygon.push(polygon[0]); // close shape

    // Calculate bbox
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const pt of polygon) {
        minLat = Math.min(minLat, pt.lat);
        maxLat = Math.max(maxLat, pt.lat);
        minLng = Math.min(minLng, pt.lng);
        maxLng = Math.max(maxLng, pt.lng);
    }

    console.log("Fetching water for bbox:", [minLat, minLng, maxLat, maxLng]);
    const waterFeatures = await getWaterFeatures([minLat, minLng, maxLat, maxLng]);
    console.log(`Found ${waterFeatures.length} water features.`);

    // Convert our polygon to Turf
    const turfCoords = polygon.map(p => [p.lng, p.lat]);
    let myPoly = turf.polygon([turfCoords]);

    // Difference it against all water features
    for (const water of waterFeatures) {
        try {
            myPoly = turf.difference(turf.featureCollection([myPoly, water]));
            if (!myPoly) break; // Completely covered in water mathematically
        } catch (e) { /* ignore topological errors */ }
    }

    console.log(myPoly ? "Successfully clipped polygon!" : "Polygon completely in water.");
    if (myPoly) {
        console.log("Is MultiPolygon:", myPoly.geometry.type === 'MultiPolygon');
    }
}

run();
