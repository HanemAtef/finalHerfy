require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"];

// Enable CORS (must be before rate limiters and other middlewares)
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));

// Set security HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Development logging
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}
console.log(process.env.NODE_ENV);

// Limit requests from same API
const limiter = rateLimit({
  max: 1000,
  windowMs: 15 * 60 * 1000,
  message: "Too many requests from this IP, please try again in 15 minutes!"
});
app.use("/api", limiter);


// Body parser, reading data from body into req.body
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Data sanitization against NoSQL query injection
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  if (req.query) mongoSanitize.sanitize(req.query, { replaceWith: '_' });
  next();
});

// Prevent parameter pollution
app.use(hpp());

// Serve uploaded images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ========== Socket.IO ==========
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
});

const socketAuth = require("./socket/socketAuth");
io.use(socketAuth);

const registerChatSocket = require("./socket/chatSocket");
registerChatSocket(io);

const liveTrackingSocket = require("./socket/livetracking.socket");
liveTrackingSocket(io);

const notificationSocket = require("./socket/notification.socket");
notificationSocket(io);

app.set("io", io);

// ========== Database ==========
const connectDB = require("./config/dbConnection");
connectDB();

// ========== Routes ==========
app.get("/", (req, res) => {
  res.send("Harfey API is running");
});

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


require("./controllers/referenceDataController").ensureSeeded().catch((e) =>
  console.log("ServiceType seed skipped:", e.message)
);

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
    res.status(err.statusCode).json({
      status: err.status,
      message: err.isOperational ? err.message : "Something went very wrong!"
    });
  }
});

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Shutting down...");
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
