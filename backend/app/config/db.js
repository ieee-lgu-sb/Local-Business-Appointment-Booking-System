const mongoose = require("mongoose");

const isSrvTxtTimeout = (error) =>
  Boolean(error && typeof error.message === "string" && error.message.includes("queryTxt ETIMEOUT"));

const connectDB = async () => {
  const primaryUri = process.env.MONGO_URI;
  if (!primaryUri) {
    throw new Error("MONGO_URI is not set");
  }

  try {
    await mongoose.connect(primaryUri);
    console.log("MongoDB connected");
  } catch (error) {
    const fallbackUri = process.env.MONGO_URI_FALLBACK;
    if (fallbackUri && isSrvTxtTimeout(error)) {
      console.warn("Primary MongoDB SRV lookup failed. Retrying with fallback URI...");
      await mongoose.connect(fallbackUri);
      console.log("MongoDB connected (fallback URI)");
      return;
    }
    throw error;
  }
};

module.exports = connectDB;
