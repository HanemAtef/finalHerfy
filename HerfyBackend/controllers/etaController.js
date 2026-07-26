const axios = require("axios");

const calculateETA = async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;

    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({
        msg: "fromLat, fromLng, toLat, and toLng are required",
      });
    }

    const response = await axios.get(
      "https://api.openrouteservice.org/v2/directions/driving-car",
      {
        params: {
          start: `${fromLng},${fromLat}`,
          end: `${toLng},${toLat}`,
        },
        headers: {
          Authorization: process.env.ORS_API_KEY,
        },
      }
    );

    const feature = response.data.features[0];
    const distance = feature.properties.segments[0].distance;
    const duration = feature.properties.segments[0].duration;

    const durationMinutes = Math.round(duration / 60);

    res.status(200).json({
      distance: parseFloat((distance / 1000).toFixed(2)),
      duration: durationMinutes,
    });
  } catch (error) {
    console.log("ETA Error:", error.response?.data || error.message);
    res.status(500).json({
      msg: "Failed to calculate ETA",
      error: error.response?.data || error.message,
    });
  }
};

module.exports = { calculateETA };