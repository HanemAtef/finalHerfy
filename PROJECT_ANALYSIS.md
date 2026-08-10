# 🔍 Herfy Project — Full Structure Analysis

> A handyman service platform with a Node.js/Express backend and a React + Vite frontend.

---

## 📁 Project Root

```
finalHerfy_fixed/
├── HerfyBackend/          # Node.js / Express API
└── HerfyFrontend_fixed/   # React + Vite + Tailwind Frontend
```

---

## 🖥️ HerfyBackend — Node.js / Express Backend

### Root Files

| File | Size | Description |
|---|---|---|
| `app.js` | 6.4 KB | Main Express application entry point |
| `seed.js` | 2.2 KB | Database seeder script |
| `testEmail.js` | 727 B | Email testing utility |
| `package.json` | 1.1 KB | Dependencies & scripts |
| `jest.config.js` | 147 B | Jest test configuration |
| `.env` | 907 B | Environment variables |
| `.env.example` | 831 B | Example env template |
| `TESTING.md` | 2.1 KB | Testing documentation |

---

### `config/`

| File | Description |
|---|---|
| `dbConnection.js` | MongoDB connection setup |

---

### `controllers/` — 13 Controller Files

| File | Size | Description |
|---|---|---|
| `adminControllers.js` | 29.4 KB | Admin panel operations |
| `adminModerationController.js` | 6.5 KB | Content moderation |
| `analyticsController.js` | 6.4 KB | Analytics & reporting data |
| `authController.js` | 20.0 KB | Authentication (login, register, password reset) |
| `customerController.js` | 1.6 KB | Customer-specific operations |
| `handymanController.js` | 18.5 KB | Handyman profile & operations |
| `messageController.js` | 4.2 KB | Chat messaging |
| `notificationController.js` | 8.1 KB | Push/in-app notifications |
| `orderController.js` | 29.7 KB | Order lifecycle (create, assign, complete) |
| `referenceDataController.js` | 6.8 KB | Cities, service types, etc. |
| `reportController.js` | 7.9 KB | User reports & complaints |
| `reviewController.js` | 3.0 KB | Ratings & reviews |
| `uploadController.js` | 1.8 KB | File upload handling |

---

### `middlewares/` — 4 Middleware Files

| File | Size | Description |
|---|---|---|
| `authMiddleware.js` | 7.7 KB | JWT authentication & role-based authorization |
| `idempotencyMiddleware.js` | 1.4 KB | Prevents duplicate API requests |
| `uploadMiddleware.js` | 1.9 KB | Multer file upload configuration |
| `validationMiddleware.js` | 448 B | Joi schema validation runner |

---

### `models/` — 12 Mongoose Models

| File | Size | Description |
|---|---|---|
| `User.js` | 4.7 KB | User model (customer, handyman, admin) |
| `Handyman.js` | 3.2 KB | Handyman-specific profile data |
| `Order.js` | 3.4 KB | Service orders |
| `Message.js` | 1.2 KB | Chat messages |
| `Notification.js` | 1.8 KB | Notifications |
| `Report.js` | 1.5 KB | User reports |
| `Review.js` | 938 B | Reviews & ratings |
| `AuditLog.js` | 1.1 KB | Admin audit trail |
| `City.js` | 305 B | City reference data |
| `ServiceType.js` | 596 B | Service type reference data |
| `RefreshToken.js` | 886 B | JWT refresh tokens |
| `IdempotencyKey.js` | 588 B | Idempotency key storage |

---

### `routes/` — 12 Route Files

| File | Description |
|---|---|
| `adminRoutes.js` | Admin panel endpoints |
| `authRoutes.js` | Authentication endpoints |
| `customerRoutes.js` | Customer endpoints |
| `etaRoutes.js` | ETA calculation endpoints |
| `handymanRoutes.js` | Handyman endpoints |
| `messageRoutes.js` | Chat message endpoints |
| `notificationRoutes.js` | Notification endpoints |
| `orderRoutes.js` | Order CRUD endpoints |
| `referenceRoutes.js` | Reference data endpoints |
| `reportRoutes.js` | Report endpoints |
| `reviewRoutes.js` | Review endpoints |
| `uploadRoutes.js` | File upload endpoints |

---

### `socket/` — 5 Socket.IO Files

| File | Size | Description |
|---|---|---|
| `chatSocket.js` | 5.3 KB | Real-time chat via WebSocket |
| `livetracking.socket.js` | 8.4 KB | Live handyman location tracking |
| `liveTrackingThrottle.js` | 898 B | Throttle for location updates |
| `notification.socket.js` | 3.7 KB | Real-time notification delivery |
| `socketAuth.js` | 1.2 KB | Socket.IO JWT authentication |

---

### `utils/` — 5 Utility Files

| File | Size | Description |
|---|---|---|
| `constants.js` | 185 B | Application constants |
| `generateToken.js` | 1.1 KB | JWT token generation |
| `sendEmail.js` | 1.2 KB | Email sending utility |
| `sendVerificationEmail.js` | 1.3 KB | Email verification sender |
| `tomtom.js` | 3.2 KB | TomTom Maps API integration |

---

### `validations/` — 9 Joi Schemas

| File | Description |
|---|---|
| `loginValidationSchema.js` | Login form validation |
| `registerValidationSchema.js` | Registration form validation |
| `createOrderSchema.js` | New order validation |
| `updateOrderSchema.js` | Order update validation |
| `changePasswordSchema.js` | Password change validation |
| `resetPassSchema.js` | Password reset validation |
| `reviewSchema.js` | Review submission validation |
| `updateProfileSchema.js` | Profile update validation |
| `updateValidationSchema.js` | General update validation |

---

### `jobs/`

| File | Description |
|---|---|
| `disputeEscalation.js` | Scheduled job for escalating unresolved disputes |

### `scripts/`

| File | Description |
|---|---|
| `backfillCompletedOrders.js` | One-time script to backfill completed order data |

### `tests/` — 8 Test Files (Jest)

| File | Description |
|---|---|
| `auth.test.js` | Authentication tests |
| `order.test.js` | Order workflow tests |
| `payment.test.js` | Payment tests |
| `matching.test.js` | Handyman matching tests |
| `handyman.test.js` | Handyman operations tests |
| `idempotency.test.js` | Idempotency middleware tests |
| `livetracking.test.js` | Live tracking tests |
| `setup.js` | Test environment setup |

### `uploads/`

- Contains **19 uploaded PNG images** (user profile photos, portfolio images, etc.)

---

---

## 🎨 HerfyFrontend_fixed — React + Vite + Tailwind CSS Frontend

### Root Files

| File | Size | Description |
|---|---|---|
| `index.html` | 326 B | HTML entry point |
| `vite.config.js` | 168 B | Vite configuration |
| `tailwind.config.js` | 1.3 KB | Tailwind CSS configuration |
| `postcss.config.js` | 98 B | PostCSS configuration |
| `eslint.config.js` | 589 B | ESLint configuration |
| `package.json` | 1.2 KB | Dependencies & scripts |
| `.env` | 52 B | Environment variables |
| `.env.example` | 279 B | Example env template |
| `README.md` | 1.0 KB | Project readme |

---

### `src/` — Application Source

#### `src/App.jsx` (6.3 KB) — Main app with React Router

#### `src/main.jsx` (433 B) — Entry point with Redux Provider

---

### `src/pages/` — 6 Page Groups (31 Pages Total)

#### `src/pages/admin/` — 11 Admin Pages

| File | Size | Description |
|---|---|---|
| `AdminDashboard.jsx` | 11.5 KB | Main admin dashboard |
| `AdminUsersPage.jsx` | 13.6 KB | User management |
| `AdminUserDetailPage.jsx` | 11.1 KB | Individual user detail view |
| `AdminVerificationsPage.jsx` | 9.1 KB | Handyman verification approvals |
| `AdminAnalyticsPage.jsx` | 5.7 KB | Platform analytics |
| `AdminAuditLogPage.jsx` | 4.0 KB | Audit log viewer |
| `AdminNotificationsPage.jsx` | 3.5 KB | Notification management |
| `AdminProfilePage.jsx` | 5.2 KB | Admin profile settings |
| `AdminReferenceDataPage.jsx` | 5.5 KB | Cities & service types management |
| `AdminReportsPage.jsx` | 6.8 KB | Reports & complaints management |
| `AdminWalletsPage.jsx` | 4.1 KB | Wallet/payment management |

#### `src/pages/auth/` — 5 Auth Pages

| File | Size | Description |
|---|---|---|
| `LoginPage.jsx` | 7.3 KB | Login form |
| `RegisterPage.jsx` | 24.8 KB | Multi-step registration form |
| `ForgotPasswordPage.jsx` | 6.4 KB | Password recovery |
| `VerifyEmailPage.jsx` | 5.2 KB | Email verification |
| `WelcomePage.jsx` | 5.8 KB | Landing / welcome page |

#### `src/pages/customer/` — 9 Customer Pages

| File | Size | Description |
|---|---|---|
| `HomePage.jsx` | 10.8 KB | Customer home / browse services |
| `CustomerDashboard.jsx` | 5.0 KB | Customer dashboard |
| `CreateOrderPage.jsx` | 8.0 KB | New order creation form |
| `CustomerProfilePage.jsx` | 11.0 KB | Customer profile settings |
| `HandymanProfilePage.jsx` | 11.0 KB | View handyman's public profile |
| `TrackingPage.jsx` | 24.2 KB | Real-time order tracking with map |
| `MapPage.jsx` | 1.1 KB | Map view wrapper |
| `NotificationsPage.jsx` | 7.1 KB | Customer notifications |
| `ReviewPage.jsx` | 5.0 KB | Leave a review |

#### `src/pages/handyman/` — 4 Handyman Pages

| File | Size | Description |
|---|---|---|
| `HandymanDashboard.jsx` | 22.4 KB | Handyman main dashboard |
| `HandymanOrderDetailsPage.jsx` | 20.8 KB | Order detail with status management |
| `HandymanOrdersPage.jsx` | 6.5 KB | Order listing |
| `HandymanSettingsPage.jsx` | 11.5 KB | Handyman settings & profile |

#### `src/pages/chat/` — 1 Page

| File | Size | Description |
|---|---|---|
| `ChatPage.jsx` | 15.7 KB | Real-time chat interface |

#### `src/pages/shared/` — 1 Page

| File | Size | Description |
|---|---|---|
| `MyReportsPage.jsx` | 3.7 KB | User's submitted reports |

---

### `src/components/` — 4 Component Groups (19 Components)

#### `src/components/Map/` — Map Components

| File | Size | Description |
|---|---|---|
| `TomTomMap.jsx` | 6.7 KB | TomTom map wrapper component |
| `TrackingMap.jsx` | 12.1 KB | Live tracking map with markers |

#### `src/components/common/` — 10 Shared Components

| File | Description |
|---|---|
| `AlertMessage.jsx` | Success/error alert banners |
| `CancellationLimitBadge.jsx` | Order cancellation limit indicator |
| `ChangePasswordCard.jsx` | Password change form card |
| `ErrorBoundary.jsx` | React error boundary |
| `LoadingSpinner.jsx` | Loading indicator |
| `LocationLabel.jsx` | Formatted location display |
| `LocationPermissionModal.jsx` | Browser location permission dialog |
| `ReasonModal.jsx` | Cancellation/rejection reason input |
| `StarRating.jsx` | Star rating display |
| `VerifiedBadge.jsx` | Verified handyman badge icon |

#### `src/components/handyman/` — 2 Handyman Components

| File | Description |
|---|---|
| `MonthlyTargetBar.jsx` | Monthly order target progress bar |
| `PendingReviewCard.jsx` | Pending review card with actions |

#### `src/components/layout/` — 5 Layout Components

| File | Description |
|---|---|
| `AdminLayout.jsx` | Admin dashboard layout with sidebar |
| `CustomerLayout.jsx` | Customer layout with navbar |
| `HandymanLayout.jsx` | Handyman layout with navbar |
| `AuthInit.jsx` | Authentication initializer |
| `ProtectedRoute.jsx` | Role-based route guard |

---

### `src/store/` — Redux Toolkit State Management

#### `store.js` — Redux store configuration

#### `src/store/slices/` — 7 Redux Slices

| File | Size | Description |
|---|---|---|
| `authSlice.js` | 17.4 KB | Auth state (login, register, tokens) |
| `orderSlice.js` | 7.5 KB | Order state & async thunks |
| `handymanSlice.js` | 4.6 KB | Handyman state |
| `adminSlice.js` | 4.1 KB | Admin state |
| `notificationSlice.js` | 3.3 KB | Notification state |
| `chatSlice.js` | 3.1 KB | Chat state |
| `locationSlice.js` | 2.8 KB | Geolocation state |

---

### `src/api/`

| File | Description |
|---|---|
| `axios.js` | Axios instance with interceptors (token refresh, base URL) |

### `src/services/`

| File | Description |
|---|---|
| `api.js` | Centralized API service with all endpoint calls |

### `src/socket/`

| File | Description |
|---|---|
| `socket.js` | Socket.IO client instance |

### `src/hooks/`

| File | Description |
|---|---|
| `useCurrentLocation.js` | Custom hook for browser geolocation |
| `useSocket.js` | Custom hook for Socket.IO connection |

### `src/utils/`

| File | Description |
|---|---|
| `geocode.js` | Reverse geocoding utility |
| `helpers.js` | General helper functions |
| `idempotency.js` | Idempotency key generation |

### `src/utlis/` ⚠️ *(typo — should be `utils`)*

| File | Description |
|---|---|
| `constants.js` | Application constants (status values, etc.) |

### `src/styles/`

| File | Description |
|---|---|
| `theme.js` | Theme configuration |

### `src/assets/`

| File | Description |
|---|---|
| `hero.png` | Hero section image |
| `react.svg` | React logo |
| `vite.svg` | Vite logo |

### `public/`

| File | Description |
|---|---|
| `favicon.svg` | Browser favicon |
| `icons.svg` | SVG icon sprite |

---

## 🏗️ Technology Stack Summary

| Layer | Technology |
|---|---|
| **Backend Runtime** | Node.js + Express.js |
| **Database** | MongoDB (Mongoose ODM) |
| **Authentication** | JWT (Access + Refresh Tokens) |
| **Real-time** | Socket.IO (Chat, Live Tracking, Notifications) |
| **Maps** | TomTom Maps API |
| **Email** | Nodemailer |
| **File Uploads** | Multer |
| **Validation** | Joi |
| **Testing** | Jest |
| **Frontend Framework** | React 18 |
| **Build Tool** | Vite |
| **CSS Framework** | Tailwind CSS |
| **State Management** | Redux Toolkit |
| **HTTP Client** | Axios |
| **Routing** | React Router |

---

## ⚠️ Notable Issues

1. **Typo in folder name**: `src/utlis/` should be `src/utils/` — there are two utils folders with different names.
2. **`etaRoutes.js`** in backend routes has no reported file size — may be empty or newly created.

---

> **Total Files**: ~120+ source files across backend and frontend  
> **Architecture**: 3-role platform (Customer, Handyman, Admin) with real-time features
