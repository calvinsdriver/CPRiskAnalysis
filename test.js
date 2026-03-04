const response = await fetch('http://localhost:3000/generate-polygon', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        address: "Alexanderstraße 15, 10178 Berlin, Germany"
    })
});

const data = await response.json();
console.log(data); // This will contain the center and the randomized polygon points
