const jwt = require('jsonwebtoken');

// Secret key for JWT (same as used during signing the token)
const JWT_SECRET = process.env.JWT_SECRET ;

// Middleware to check if JWT exists in cookies and validate it
const authenticateJWT = (req, res, next) => {
  let token =(req.headers.cookie); 
  token = token.replace(/^token=/, '');
  // If the token doesn't exist, respond with an error
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Token not found in cookies.' });
  }

  // Verify the token
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Attach userId to the request object for later use
    req.userId = decoded?.userId; // Make sure `decoded` exists

    // Continue to the next middleware or route handler
    next();
  });
};

module.exports = authenticateJWT;
