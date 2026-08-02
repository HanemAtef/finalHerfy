require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit")
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

// Global error handlers for uncaught exceptions
// process.on("uncaughtException", (err) => {
//   console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
//   // console.error("UNCAUGHT EXCEPTION!  Shutting down...");
//   console.error(err.name, err.message);
//   process.exit(1);
// });

const app = express();
const server = http.createServer(app);

// ========== Security & Utility Middlewares ==========
// Single source of truth for allowed origins, shared by REST CORS and
// Socket.IO CORS (see H4 fix below — Socket.IO used to allow "*").

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"];

// Enable CORS (must be before rate limiters and other middlewares)
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT","PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));

// Set security HTTP headers
app.use(helmet());

// Development logging
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}
console.log(process.env.NODE_ENV);


// Limit requests from same API
const limiter = rateLimit({
  // max: 1000, // Increased for development
  // windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, 
  windowMs: 15 * 60 * 1000, 
  message: "Too many requests from this IP, please try again in 15 minutes!"
});
app.use("/api", limiter);

// Body parser, reading data from body into req.body
// Limit payload size to prevent DOS attacks

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Data sanitization against NoSQL query injection
// Custom wrapper to prevent Express 5 TypeError: Cannot set property query
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  if (req.query) mongoSanitize.sanitize(req.query, { replaceWith: '_' });
  next();
});

// Prevent parameter pollution
app.use(hpp());

// Serve uploaded images statically (e.g. http://localhost:3000/uploads/xxx.jpg)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ========== Socket.IO ==========
// SECURITY FIX (H4): previously origin: "*" — inconsistent with, and wider
// than, the REST CORS policy above. Now matches it exactly.
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
});

// Socket Authentication Middleware
const socketAuth = require("./socket/socketAuth");
io.use(socketAuth);

// Chat Socket
const registerChatSocket = require("./socket/chatSocket");
registerChatSocket(io);

// Live Tracking Socket
const liveTrackingSocket = require("./socket/livetracking.socket");
liveTrackingSocket(io);

// Notification Socket
const notificationSocket = require("./socket/notification.socket");
notificationSocket(io);

// Store io instance for use in controllers/routes
app.set("io", io);

// ========== Database ==========
const connectDB = require("./config/dbConnection");
connectDB();

// ========== Routes ==========
app.get("/", (req, res) => {
  res.send("Harfey API is running");
});

// ========== Routes ==========
app.use("/api/users", require("./routes/authRoutes"));
app.use("/api/handymen", require("./routes/handymanRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/customer", require("./routes/customerRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/uploads", require("./routes/uploadRoutes"));
app.use("/api/reference", require("./routes/referenceRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));

// Seed the ServiceType collection from the old hardcoded profession list
// on first boot, so existing handyman records keep working before an
// admin has touched the new reference-data UI.
require("./controllers/referenceDataController").ensureSeeded().catch((e) =>
  console.log("ServiceType seed skipped:", e.message)
);
// ========== Server ==========
// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR HANDLER CAUGHT:", err);
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    // Production: don't leak error details
    res.status(err.statusCode).json({
      status: err.status,
      message: err.isOperational ? err.message : "Something went very wrong!"
    });
  }
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(` Server is running on port ${port}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {

  console.error("UNHANDLED REJECTION! 💥 Shutting down...");


  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});