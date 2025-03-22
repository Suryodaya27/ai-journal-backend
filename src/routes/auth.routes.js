const { Router } = require("express");
const { requestVerificationCode,verifyAndCreateUser, loginUser } = require("../controller/auth.controller");

const authrouter = Router();

authrouter.post("/request-code", requestVerificationCode);
authrouter.post("/verify", verifyAndCreateUser);
authrouter.post("/login", loginUser);

module.exports = authrouter;
