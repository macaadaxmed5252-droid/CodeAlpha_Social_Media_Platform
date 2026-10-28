const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

module.exports = { connectDB };
