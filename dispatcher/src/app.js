// -----------------------------
// Imports
// -----------------------------
import express from "express";
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
    origin: ["http://localhost:4000", "file://"],
    methods: ["GET", "POST", "DELETE", "PUT"],
    credentials: true
}));


const io = new Server(httpServer, { cors: { origin: "*" } });

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
        console.log("User just signed in:", user.email);
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
// REST API Endpoints
// -----------------------------
app.get("/ping", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// -----------------------------
// Device Registration
// -----------------------------
app.post("/api/register_device", async (req, res) => {
    const { type, ip, port, subnet, is_public } = req.body;
    const deviceId = uuidv4();
    const connectionCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
        const checkResult = await pool.query(`SELECT * FROM devices WHERE ip = $1 AND port = $2`, [ip, port]);
        if (checkResult.rows.length > 0) return res.status(400).json({ reason: "Device with this IP and port already exists" });

        const insertResult = await pool.query(
            `INSERT INTO devices (device_id, type, ip, port, subnet, is_public, connection_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [deviceId, type, ip, port, subnet, is_public, connectionCode]
        );

        const deviceRow = insertResult.rows[0];
        console.log("[SERVER] Device registered:", deviceRow);
        io.emit("device_registered", deviceRow);
        res.json(deviceRow);
    } catch (err) {
        console.error("[SERVER] Error registering device:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

// -----------------------------
// Delete device
// -----------------------------
app.delete("/api/delete_device/:deviceId", async (req, res) => {
    const { deviceId } = req.params;
    try {
        const result = await pool.query(`SELECT * FROM devices WHERE device_id = $1`, [deviceId]);
        if (result.rows.length === 0) return res.status(404).json({ reason: "Device not found" });

        await pool.query(`DELETE FROM devices WHERE device_id = $1`, [deviceId]);
        await pool.query(`DELETE FROM sessions WHERE device_id = $1`, [deviceId]);

        io.emit("device_deleted", { deviceId });
        res.json({ success: true, deviceId });
    } catch (err) {
        console.error("[SERVER] Error deleting device:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

// -----------------------------
// Register interface
// -----------------------------
app.post("/api/register_interface", async (req, res) => {
    const { name, email, deviceCode } = req.body;
    const interfaceId = uuidv4();

    try {
        const existing = await pool.query(`SELECT * FROM interfaces WHERE email = $1 AND device_code = $2`, [email, deviceCode]);
        if (existing.rows.length > 0) return res.status(400).json({ reason: "Device already registered for this user" });

        const insertResult = await pool.query(
            `INSERT INTO interfaces (interface_id, name, email, device_code)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [interfaceId, name, email, deviceCode]
        );

        const interfaceRow = insertResult.rows[0];
        const deviceResult = await pool.query(`SELECT type, subnet FROM devices WHERE connection_code = $1`, [deviceCode]);
        const deviceInfo = deviceResult.rows[0] || { type: null, subnet: null };

        const responseRow = { ...interfaceRow, type: deviceInfo.type, subnet: deviceInfo.subnet };
        io.emit("interface_registered", responseRow);
        res.json(responseRow);
    } catch (err) {
        console.error("[SERVER] Error registering interface:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

// -----------------------------
// Register device session
// -----------------------------
app.post("/api/register_device_session", async (req, res) => {
    const { deviceId, socketId } = req.body;
    try {
        await pool.query(
            `INSERT INTO sessions (device_id, socket_id) VALUES ($1, $2)
             ON CONFLICT (device_id) DO UPDATE SET socket_id = EXCLUDED.socket_id, updated_at = NOW()`,
            [deviceId, socketId]
        );
        console.log(`[SERVER] Device session created in DB: ${deviceId}`);
        res.json({ deviceId, status: "registered" });
    } catch (err) {
        console.error("[SERVER] Error creating device session:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

// -----------------------------
// Delete interface
// -----------------------------
app.delete("/api/delete_interface/:interfaceId", async (req, res) => {
    const { interfaceId } = req.params;

    try {
        const result = await pool.query(`SELECT * FROM interfaces WHERE interface_id = $1`, [interfaceId]);
        if (result.rows.length === 0) return res.status(404).json({ reason: "Interface not found" });

        await pool.query(`DELETE FROM interfaces WHERE interface_id = $1`, [interfaceId]);
        await pool.query(`UPDATE sessions SET interface_id = NULL WHERE interface_id = $1`, [interfaceId]);

        io.emit("interface_deleted", { interfaceId });
        res.json({ success: true, interfaceId });
    } catch (err) {
        console.error("[SERVER] Error deleting interface:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

// -----------------------------
// Register full session (device + interface)
// -----------------------------
app.post("/api/register_full_session", async (req, res) => {
    const { deviceId, interfaceId } = req.body;

    try {
        const sessionResult = await pool.query(`SELECT * FROM sessions WHERE device_id = $1`, [deviceId]);
        if (sessionResult.rows.length === 0) return res.status(404).json({ reason: "Session not found" });

        await pool.query(
            `UPDATE sessions SET interface_id = $1, updated_at = NOW() WHERE device_id = $2`,
            [interfaceId, deviceId]
        );

        console.log(`[SERVER] Full session registered:`, { deviceId, interfaceId });
        res.json({ deviceId, interfaceId });
    } catch (err) {
        console.error("[SERVER] Error registering full session:", err);
        res.status(500).json({ reason: "Server error" });
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

app.get("/admin/sessions", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM sessions`);
        res.json(result.rows);
    } catch (err) {
        console.error("[SERVER] Error fetching sessions:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

app.get("/admin/session/:deviceId", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM sessions WHERE device_id = $1`, [req.params.deviceId]);
        if (result.rows.length === 0) return res.status(404).json({ reason: "Session not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error("[SERVER] Error fetching session:", err);
        res.status(500).json({ reason: "Server error" });
    }
});

async function cleanupSessions() {
    try {
        await pool.query(`DELETE FROM sessions`);
        console.log("[SERVER] Cleaned up all device sessions from DB");
    } catch (err) {
        console.error("[SERVER] Failed to clean up sessions:", err);
    }
}

// On normal exit
process.on("exit", () => {
    cleanupSessions();
});

// On Ctrl+C
process.on("SIGINT", () => {
    console.log("[SERVER] SIGINT received, cleaning up sessions...");
    cleanupSessions().then(() => process.exit());
});

// On kill signal
process.on("SIGTERM", () => {
    console.log("[SERVER] SIGTERM received, cleaning up sessions...");
    cleanupSessions().then(() => process.exit());
});

// On uncaught exceptions (optional)
process.on("uncaughtException", (err) => {
    console.error("[SERVER] Uncaught exception:", err);
    cleanupSessions().then(() => process.exit(1));
});



// -----------------------------
// WebSocket handlers
// -----------------------------
io.on("connection", (socket) => {
    console.log(`[SOCKET] New connection: ${socket.id}`);

    socket.on("device_connect_to_dispatcher", async (data) => {
        const { deviceId } = data;
        if (!deviceId) return console.log(`[ERROR] Device tried to connect without an ID`);

        try {
            await pool.query(
                `INSERT INTO sessions (device_id, socket_id) VALUES ($1, $2)
                 ON CONFLICT (device_id) DO UPDATE SET socket_id = EXCLUDED.socket_id, updated_at = NOW()`,
                [deviceId, socket.id]
            );
            console.log(`[DEVICE CONNECTED] ${deviceId} on socket ${socket.id}`);
            io.emit("device_connected", { deviceId });
        } catch (err) {
            console.error(`[SERVER ERROR] device_connect_to_dispatcher: ${err.message}`);
        }
    });

    socket.on("interface_connect_to_device", async (data) => {
        const { interfaceId, connectionCode } = data;

        // 🔹 Debug log to confirm the event is received
        console.log(`[BROKER] interface_connect_to_device called: interfaceId=${interfaceId}, connectionCode=${connectionCode}`);

        try {
            // Look up the interface
            const ifaceRes = await pool.query(
                `SELECT i.interface_id, i.device_code, d.device_id, d.type
             FROM interfaces i
             LEFT JOIN devices d ON i.device_code = d.connection_code
             WHERE i.interface_id = $1`,
                [interfaceId]
            );

            if (ifaceRes.rows.length === 0) {
                console.warn(`[BROKER] Interface ${interfaceId} not found in DB`);
                return socket.emit("interface_connect_to_device_response", { error: true, message: "Interface not found" });
            }

            const iface = ifaceRes.rows[0];
            console.log(`[BROKER] Found interface in DB: ${JSON.stringify(iface)}`);

            // Check connection code matches
            if (iface.device_code !== connectionCode) {
                console.warn(`[BROKER] Connection code mismatch for interface=${interfaceId}, expected=${iface.device_code}, got=${connectionCode}`);
                return socket.emit("interface_connect_to_device_response", { error: true, message: "Connection code mismatch" });
            }

            // Use the actual UUID device_id for sessions
            const deviceId = iface.device_id; // UUID

            // Check session exists
            const sessionRes = await pool.query(`SELECT * FROM sessions WHERE device_id = $1`, [deviceId]);
            if (sessionRes.rows.length === 0) {
                console.warn(`[BROKER] Device ${deviceId} has no active session`);
                return socket.emit("interface_connect_to_device_response", { error: true, message: `Device ${deviceId} not connected` });
            }

            // Update session
            await pool.query(
                `UPDATE sessions SET interface_id = $1, updated_at = NOW() WHERE device_id = $2`,
                [interfaceId, deviceId]
            );

            console.log(`[BROKER] Linked interface ${interfaceId} to device ${deviceId}`);

            socket.emit("interface_connect_to_device_response", {
                deviceType: iface.type,
                message: `Interface ${interfaceId} connected to device ${deviceId}`
            });

        } catch (err) {
            console.error(`[SERVER ERROR] interface_connect_to_device: ${err.message}`);
            socket.emit("interface_connect_to_device_response", { error: true, message: err.message });
        }
    });

   socket.on("interface_disconnect_from_dispatcher", async (data, callback) => {
    const { interfaceId } = data;

    try {
        const sessionRes = await pool.query(
            `SELECT * FROM sessions WHERE interface_id = $1`,
            [interfaceId]
        );

        if (sessionRes.rows.length === 0) {
            console.log(`[WARN] Interface ${interfaceId} not connected`);
        } else {
            const socketId = sessionRes.rows[0].socket_id;
            io.to(socketId).emit("interface_disconnect_from_dispatcher", { interfaceId });
            await pool.query(`UPDATE sessions SET interface_id = NULL WHERE interface_id = $1`, [interfaceId]);
            io.emit("interface_disconnected", { interfaceId });
            console.log(`[INTERFACE DISCONNECTED] ${interfaceId} (client requested)`);
        }

        // ✅ Call the callback to acknowledge
        if (callback) callback({ success: true });

    } catch (err) {
        console.error(`[SERVER ERROR] interface_disconnect_from_dispatcher: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
    }
});



    socket.on("disconnect", async () => {
        try {
            const res = await pool.query(`SELECT device_id FROM sessions WHERE socket_id = $1`, [socket.id]);
            for (const row of res.rows) {
                await pool.query(`DELETE FROM sessions WHERE device_id = $1`, [row.device_id]);
                io.emit("device_disconnected", { deviceId: row.device_id });
                console.log(`[DEVICE DISCONNECTED] ${row.device_id} (socket disconnect)`);
            }
        } catch (err) {
            console.error(`[SERVER ERROR] disconnect: ${err.message}`);
        }
    });

    socket.on("device_disconnect_from_dispatcher", async (data) => {
        const { deviceId } = data;
        try {
            const sessionRes = await pool.query(`SELECT * FROM sessions WHERE device_id = $1`, [deviceId]);
            if (sessionRes.rows.length === 0) return console.log(`[WARN] Device ${deviceId} not connected`);

            const socketId = sessionRes.rows[0].socket_id;
            io.to(socketId).emit("device_disconnect_from_dispatcher", { deviceId });
            await pool.query(`DELETE FROM sessions WHERE device_id = $1`, [deviceId]);
            io.emit("device_disconnected", { deviceId });
            console.log(`[DEVICE DISCONNECTED] ${deviceId} (client requested)`);
        } catch (err) {
            console.error(`[SERVER ERROR] device_disconnect_from_dispatcher: ${err.message}`);
        }
    });
});

// -----------------------------
// Start server
// -----------------------------
httpServer.listen(PORT, () => {
    console.log(`[SERVER] Broker running on http://localhost:${PORT}`);
});
