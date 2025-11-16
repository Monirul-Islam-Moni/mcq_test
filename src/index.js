import express from "express";
import dotenv from "dotenv";
import generateRouter from "./routes/generate.js";
import generateRoutesWithUsage from "./routes/generateWithUsage.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // parse JSON request body

app.use("/generate", generateRoutesWithUsage);

app.get("/", (req, res) => {
  res.send("MCQ Generator API is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
