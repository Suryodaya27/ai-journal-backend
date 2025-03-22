const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = new PrismaClient();
const { verificationMailQueue } = require("../jobs/bullMqProcessor");
const { setRedis, getRedis, delRedis } = require("../utils/redis_functions");
const Joi = require("joi");

// Secret key for JWT (keep this in environment variables for security purposes)
const JWT_SECRET = process.env.JWT_SECRET;

const saltRounds = 10;

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const requestVerificationCode = async (req, res) => {
  try {
    // const schema = Joi.object({
    //   email: Joi.string().email().required(),
    // });

    // const { error } = schema.validate(req.body);
    // if (error) return res.status(400).json({ error: "Invalid email address" });
    const { email } = req.body;

    console.log("Received request for verification code for email:", email);
    // Check if user already exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Generate a random 6-digit code
    const verificationCode = generateCode();

    // Save the code in Redis with a 10-minute expiration
    await setRedis(`verify:${email}`, verificationCode, 600);

    await verificationMailQueue.add("verification-mail-queue", {
      email,
      code: verificationCode,
      subject: "Verify your email address",
      text: `Thankyou for signing up at Mydaily journal.\n
      Your verification code is: ${verificationCode}\n
      The idea for creating this journal is to help you keep track of your daily activities and emotions.\n
      We hope you find it useful.`
      ,
    });

    return res.status(200).json({ message: "Verification code sent to email" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const verifyAndCreateUser = async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
      name: Joi.string().min(3).max(30),
      code: Joi.string().length(6),
    });
    const { error } = schema.validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, code, name, password } = req.body;

    // Retrieve the code from Redis
    const storedCode = await getRedis(`verify:${email}`);

    if (!storedCode || storedCode !== code) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create the user
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Remove the verification code from Redis
    await delRedis(`verify:${email}`);

    return res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
    });

    const { error } = schema.validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password } = req.body;
    console.log(email)
    // Find the user by email
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    // If user is not found, return 404 with an error message
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Compare the provided password with the stored hash
    const passwordMatch = await bcrypt.compare(password, user.password);

    // If passwords don't match, return 401 with an error message
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate JWT token if authentication is successful
    const token = jwt.sign(
      { userId: user.id, email: user.email }, // Payload (you can add more fields as needed)
      JWT_SECRET, // Secret key
      { expiresIn: "1h" } // Token expiration time (e.g., 1 hour)
    );

    // Set the token as an HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
      secure: process.env.NODE_ENV === "production", // Only over HTTPS in production
      maxAge: 3600000, // 1 hour expiration
      sameSite: "strict", // Restricts which websites can access the cookie
    });

    // Return a success response without the token in the body (as it's now in the cookie)
    return res.status(200).json({ message: token });
  } catch (error) {
    // Handle server errors
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { requestVerificationCode, verifyAndCreateUser, loginUser };
