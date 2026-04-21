import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(env.PORT, () => {
      console.log(`HomeCare API running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
