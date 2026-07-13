import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.json({
    status: "BOT SOP API Online"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
