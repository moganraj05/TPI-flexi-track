const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexitrack';

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    if (error.message.includes('querySrv ECONNREFUSED')) {
      console.error(
        'Tip: Your network blocks mongodb+srv DNS lookups. Use the standard connection string from Atlas instead of mongodb+srv://'
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;
