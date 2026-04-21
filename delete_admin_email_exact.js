const mongoose = require("mongoose");
const path = require("path");

(async () => {
  try {
    const envPath = path.join(process.cwd(), "backend", ".env");
    require("dotenv").config({ path: envPath });

    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("Mongo URI not found in backend/.env");
    }

    await mongoose.connect(mongoUri);

    const userSchema = new mongoose.Schema({}, { strict: false, collection: "users" });
    const User = mongoose.models.User_debug_delete || mongoose.model("User_debug_delete", userSchema);

    const email = "missannahd3467@gmail.com".trim().toLowerCase();
    const result = await User.deleteMany({ email });

    console.log(JSON.stringify({
      deletedCount: result.deletedCount,
      email
    }, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
