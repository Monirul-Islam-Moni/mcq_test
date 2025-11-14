export function authentication(req, res, next) {
  try {
    // ---- Validate User Token ----
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "User token missing" });
    }

    const userToken = authHeader.split(" ")[1];
    if (!userToken) {
      return res.status(401).json({ error: "Invalid user token format" });
    }

    // ---- Validate OpenAI Token ----
    const openaiToken = req.headers["openai-token"];
    if (!openaiToken) {
      return res.status(400).json({ error: "OpenAI token missing in header" });
    }

    // Save tokens to req object
    req.userToken = userToken;
    req.openaiToken = openaiToken;

    next();
  } catch (err) {
    return res.status(401).json({ error: "Token validation failed", details: err.message });
  }
}
