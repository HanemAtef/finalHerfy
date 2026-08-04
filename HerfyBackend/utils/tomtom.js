    const axios = require("axios")
    const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY
    const TOMTOM_API_URL = process.env.TOMTOM_API_URL || 'https://api.tomtom.com';
    // caclculate route between two points using TomTom API
    const calculateRoute = async (origin, destination) => {
    try{
    const originStr=`${origin.lat} ${origin.lng}`;
    const destinationStr=`${destination.lat} ${destination.lng}`;

    const url = `${TOMTOM_API_URL}/routing/1/calculateRoute/${originStr}/${destinationStr}/json`;
            
            const response = await axios.get(url, {
                params: {
                    key: TOMTOM_API_KEY,
                    traffic: true,
                    travelMode: 'car',
                    routeType: 'fastest',
                    instructionsType: 'none'
                },
                timeout: 5000 
            })
        
        const route = response.data.routes[0];
        const summary = route.summary;  
        return {
            distance:Math.round(summary.lengthInMeters / 1000 * 10) / 10, 
            eta: Math.round(summary.travelTimeInSeconds / 60 * 10) / 10,
            trafficDelay: Math.round(summary.trafficDelayInSeconds / 60 ),
            arrivalTime: new Date(Date.now() + summary.travelTimeInSeconds * 1000).toISOString()
        }
    }
catch (error) {
        console.error('TomTom API error:', error.message);
        // Return fallback values if TomTom fails
        return {
            distance: null,
            eta: null,
            trafficDelay: null,
            arrivalTime: null
        };
    }
}

module.exports = { calculateRoute };