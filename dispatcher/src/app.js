// -----------------------------
// Imports
// -----------------------------
import express from "express";
import { createServer } from "http";
import http from 'http';

import { Server } from "socket.io";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { pool } from "./db.js"; // centralized DB connection
import passport from "passport";
import session from "express-session";
import { getGoogleAuthUrl, getGoogleUser } from './auth.js';
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static admin files

// -----------------------------
// Load environment variables
// -----------------------------
dotenv.config();
const PORT = process.env.PORT || 3000;

// -----------------------------
// Express + HTTP + Socket.IO
// -----------------------------
const app = express();
const httpServer = http.createServer(app);

app.use(express.json());
app.use(cookieParser());
app.use("/admin", express.static(path.join(__dirname, "public")));
app.use(cors({
    origin: ["http://localhost:4000", "file://"], // Electron’s webContents uses file://
    methods: ["GET", "POST", "DELETE", "PUT"],
    credentials: true
}));

const io = new Server(httpServer, {
    cors: { origin: "*" } // Allow all origins temporarily
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "./public/admin.html"));
});

app.get("/auth/google", (req, res) => {
    const url = getGoogleAuthUrl();
    res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("No code returned from Google");

    try {
        const user = await getGoogleUser(code);

        // ✅ Log email on the server
        console.log("User just signed in:", user.email);

        // Redirect to Electron listener with token & user info
        res.redirect(`http://localhost:4000/auth/success?token=${user.token}&name=${user.name}&email=${user.email}`);
    } catch (err) {
        console.error("Google auth failed:", err);
        res.status(500).send("Authentication failed");
    }
});


// --- Fetch interfaces for a user, including device info ---
app.get("/interfaces_by_email", async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ reason: "Email is required" });

    try {
        const result = await pool.query(
            `SELECT i.interface_id, i.name, i.email, i.device_code,
              d.type, d.subnet
       FROM interfaces i
       LEFT JOIN devices d ON i.device_code = d.connection_code
       WHERE i.email = $1`,
            [email]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("[SERVER] Error fetching interfaces:", err);
        res.status(500).json({ reason: "Server error" });
    }
});


// -----------------------------
// Temporary memory for sessions
// -----------------------------
const sessions = {};

// -----------------------------
// REST API Endpoints
// -----------------------------

// Add this somewhere before starting the server
app.get("/ping", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});



app.post("/api/register_device", async (req, res) => {
    const { type, ip, port, subnet, is_public } = req.body;

    // Generate unique identifiers
    const deviceId = uuidv4();
    const connectionCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
        // Optional: check if a device with the same IP+Port already exists
        const checkResult = await pool.query(
            `SELECT * FROM devices WHERE ip = $1 AND port = $2`,
            [ip, port]
        );

        if (checkResult.rows.length > 0) {
            return res.status(400).json({ reason: "Device with this IP and port already exists" });
        }

        // Insert new device into database
        const insertResult = await pool.query(
            `INSERT INTO devices (device_id, type, ip, port, subnet, is_public, connection_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [deviceId, type, ip, port, subnet, is_public, connectionCode]
        );

        const deviceRow = insertResult.rows[0];

        console.log("[SERVER] Device registered:", deviceRow);

        // Emit socket event if using socket.io
        io.emit("device_registered", deviceRow);

        // Return full row to frontend
        res.json(deviceRow);

    } catch (err) {
        console.error("[SERVER] Error registering device:", err);
        res.status(500).json({ reason: "Server error" });
    }
});


// -----------------------------
// Delete device by device_id
// -----------------------------
// -----------------------------
// Delete device by device_id
// -----------------------------
app.delete("/api/delete_device/:deviceId", async (req, res) => {
    const { deviceId } = req.params;

    try {
        // Check if device exists
        const result = await pool.query(`SELECT * FROM devices WHERE device_id = $1`, [deviceId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ reason: "Device not found" });
        }

        // Delete the device
        await pool.query(`DELETE FROM devices WHERE device_id = $1`, [deviceId]);

        // Disconnect device if connected
        if (sessions[deviceId] && sessions[deviceId].socketId) {
            const socketId = sessions[deviceId].socketId;
            io.to(socketId).emit("device_disconnect_from_dispatcher", { deviceId });
            delete sessions[deviceId];
            console.log(`[DEVICE DISCONNECTED] ${deviceId} (deleted)`); // <-- log here
            io.emit("device_disconnected", { deviceId });
        }

        io.emit("device_deleted", { deviceId });
        res.json({ success: true, deviceId });
    } catch (err) {
        console.error("[SERVER] Error deleting device:", err);
        res.status(500).json({ reason: "Server error" });
    }
});
// Register interface
// Register interface with type and subnet
app.post("/api/register_interface", async (req, res) => {
    const { name, email, deviceCode } = req.body;
    const interfaceId = uuidv4();

    try {
        // Check if interface already exists
        const existing = await pool.query(
            `SELECT * FROM interfaces WHERE email = $1 AND device_code = $2`,
            [email, deviceCode]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ reason: "Device already registered for this user" });
        }

        // Insert new interface
        const insertResult = await pool.query(
            `INSERT INTO interfaces (interface_id, name, email, device_code)
       VALUES ($1, $2, $3, $4) RETURNING *`,
            [interfaceId, name, email, deviceCode]
        );
        const interfaceRow = insertResult.rows[0];

        // Fetch type & subnet from devices table
        const deviceResult = await pool.query(
            `SELECT type, subnet FROM devices WHERE connection_code = $1`,
            [deviceCode]
        );
        const deviceInfo = deviceResult.rows[0] || { type: null, subnet: null };

        const responseRow = { ...interfaceRow, type: deviceInfo.type, subnet: deviceInfo.subnet };

        // Emit event to frontend
        io.emit("interface_registered", responseRow);

        res.json(responseRow);

    } catch (err) {
        console.error("[SERVER] Error registering interface:", err);
        res.status(500).json({ reason: "Server error" });
    }
});


// 2️⃣ Register device session (memory)
app.post("/api/register_device_session", (req, res) => {
    const { deviceId } = req.body;
    sessions.set(deviceId, { deviceId, full: false });

    console.log(`[SERVER] Device session created:`, { deviceId });
    res.json({ deviceId, status: "half session" });
});

// 3️⃣ Register interface
app.post("/api/register_interface", async (req, res) => {
    const { name, email, deviceCode } = req.body;
    const interfaceId = uuidv4();

    try {
        // Check if device already exists
        const result = await pool.query(
            `SELECT * FROM interfaces WHERE email = $1 AND device_code = $2`,
            [email, deviceCode]
        );

        if (result.rows.length > 0) {
            return res.status(400).json({ reason: "Device already registered for this user" });
        }

        await pool.query(
            `INSERT INTO interfaces (interface_id, name, email, device_code)
       VALUES ($1, $2, $3, $4)`,
            [interfaceId, name, email, deviceCode]
        );

        console.log(`[SERVER] Interface registered:`, { interfaceId, name, email, deviceCode });
        io.emit("interface_registered", { interfaceId, name, email, deviceCode });

        res.json({ interfaceId, name, email, deviceCode });
    } catch (err) {
        console.error("[SERVER] Error registering interface:", err);
        res.status(500).json({ reason: "Server error" });
    }
});


// 4️⃣ Delete interface
app.delete("/api/delete_interface/:interfaceId", async (req, res) => {
    const { interfaceId } = req.params;

    try {
        // Check if interface exists
        const result = await pool.query(
            `SELECT * FROM interfaces WHERE interface_id = $1`,
            [interfaceId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ reason: "Interface not found" });
        }

        // Delete interface
        await pool.query(
            `DELETE FROM interfaces WHERE interface_id = $1`,
            [interfaceId]
        );

        console.log(`[SERVER] Interface deleted:`, interfaceId);
        io.emit("interface_deleted", { interfaceId }); // notify clients

        res.json({ success: true, interfaceId });
    } catch (err) {
        console.error("[SERVER] Error deleting interface:", err);
        res.status(500).json({ reason: "Server error" });
    }
});



// 4️⃣ Register full session (device + interface)
app.post("/api/register_full_session", (req, res) => {
    const { deviceId, interfaceEmail } = req.body;
    const session = sessions.get(deviceId);

    if (session) {
        session.full = true;
        session.interfaceEmail = interfaceEmail;
        sessions.set(deviceId, session);

        console.log(`[SERVER] Full session registered:`, { deviceId, interfaceEmail });
        res.json({ deviceId, full: true });
    } else {
        console.warn(`[SERVER] Session not found for deviceId: ${deviceId}`);
        res.status(404).json({ reason: "Session not found" });
    }
});

// -----------------------------
// Admin API
// -----------------------------
app.get("/admin/devices", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM devices`);
        res.json(result.rows);
    } catch (err) {
        console.error("[SERVER] Error fetching devices:", err);
        res.status(500).json({ reason: "Server error" });
    }
});


app.get("/admin/interfaces", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM interfaces`);
        res.json(result.rows);
    } catch (err) {
        console.error("[SERVER] Error fetching interfaces:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

app.get("/admin/sessions", (req, res) => {
    res.json(Array.from(sessions.values()));
});

app.get("/admin/session/:deviceId", (req, res) => {
    const session = sessions.get(req.params.deviceId);
    if (session) res.json(session);
    else res.status(404).json({ reason: "Session not found" });
});

// -----------------------------
// WebSocket placeholders
// -----------------------------



io.on("connection", (socket) => {
    console.log(`[SOCKET] New connection: ${socket.id}`);

    // Device registration
    socket.on("device_connect_to_dispatcher", (data) => {
        const { deviceId } = data;
        if (!deviceId) {
            console.log(`[ERROR] Device tried to connect without an ID`);
            return;
        }

        // Add to sessions
        sessions[deviceId] = {
            socketId: socket.id,
            interfaceId: null
        };

        console.log(`[DEVICE CONNECTED] ${deviceId} on socket ${socket.id}`);
        printSessions();
        io.emit("device_connected", { deviceId });
    });

    // Interface connecting to a device
    socket.on("interface_connect_to_device", (data) => {
        const { deviceId, clientId } = data;
        const session = sessions[deviceId];
        if (!session) {
            console.log(`[ERROR] Device ${deviceId} not connected`);
            return;
        }

        // Store the interfaceId in the session
        session.interfaceId = clientId;

        // Forward connection request to the device
        io.to(session.socketId).emit("connect_client", { clientId });
        console.log(`[INFO] Client ${clientId} connected to device ${deviceId}`);
        printSessions();
    });

    // Device disconnection
    socket.on("disconnect", () => {
    for (const [deviceId, session] of Object.entries(sessions)) {
        if (session.socketId === socket.id) {
            console.log(`[DEVICE DISCONNECTED] ${deviceId} (socket disconnect)`);
            delete sessions[deviceId];
            io.emit("device_disconnected", { deviceId });
        }
    }
    printSessions();
});

 socket.on("device_disconnect_from_dispatcher", (data) => {
        const { deviceId } = data;
        const session = sessions[deviceId];
        if (session && session.socketId) {
            // Notify the device
            io.to(session.socketId).emit("device_disconnect_from_dispatcher", { deviceId });
            // Remove from sessions
            delete sessions[deviceId];
            console.log(`[DEVICE DISCONNECTED] ${deviceId} (client requested)`);
            io.emit("device_disconnected", { deviceId });
            printSessions();
        } else {
            console.log(`[WARN] Device ${deviceId} not connected`);
        }
    });

});

// Helper function to print all currently connected sessions
// Helper function to print the number of currently connected sessions
function printSessions() {
    const count = Object.keys(sessions).length;
    console.log(`[SESSIONS] Currently connected: ${count}`);
}


// -----------------------------
// Start server
// -----------------------------
httpServer.listen(PORT, () => {
    console.log(`[SERVER] Broker running on http://localhost:${PORT}`);
});
