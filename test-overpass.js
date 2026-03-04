const axios = require('axios');
async function test() {
  console.time('overpass');
  try {
    const res = await axios.post('https://overpass-api.de/api/interpreter', 
      '[out:json];way(around:1000,52.5200,13.4050)["natural"="water"];out geom;',
      { timeout: 5000 }
    );
    console.log("Got points:", res.data.elements.length);
  } catch (err) {
    console.log("Error:", err.message);
  }
  console.timeEnd('overpass');
}
test();
