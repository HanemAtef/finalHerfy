const mongoose = require('mongoose');
const connectDB = async () => {
    // In test mode, tests manage their own in-memory connection
    if (process.env.NODE_ENV === 'test') return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }   
}

module.exports = connectDB;