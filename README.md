# 🎮 CS2 Stats Scraper - Database Edition

A powerful Node.js application that scrapes **Counter-Strike 2** player statistics from [csgostats.gg](https://csgostats.gg) and stores them in a **MySQL database**, optimized for high performance and clean resource management.

---

## ✨ Features

* 🎯 **Batch Processing** – Efficiently scrape multiple Steam IDs
* 🗄️ **MySQL Integration** – Secure database access using connection pooling
* 📊 **Detailed Stats** – Capture comprehensive CS2 player performance
* 🔁 **Queue Management** – Prioritized ID processing system
* 📈 **Progress Tracking** – Real-time log updates and metrics
* 🛡️ **Robust Error Handling** – Retry failed scrapes with logging
* 🧹 **Resource Optimization** – Clean browser and DB connection handling
* 🖥️ **Interactive CLI** – Command-line interface for control and management

---

## 🗂️ Project Structure

```
cs2-stats-scraper/
├── src/
│   ├── config/                  # Configuration files
│   │   └── database.js          # MySQL connection pool
│   ├── services/                
│   │   ├── scraper.service.js   # Puppeteer scraping logic
│   │   └── database.service.js  # DB operations
│   ├── scraperManager.js        # Main scraper controller
│   └── index.js                 # Entry point
├── .env.example                 # Environment config template
├── package.json                 # Scripts and dependencies
└── README.md                    # Project documentation
```

---

## 🧾 Database Schema

### **1. steam\_ids**

```sql
id INT PRIMARY KEY AUTO_INCREMENT,
steam_id64 VARCHAR(20) UNIQUE NOT NULL,
status ENUM('pending', 'processing', 'completed', 'failed'),
priority INT DEFAULT 0,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### **2. player\_stats**

```sql
id INT PRIMARY KEY AUTO_INCREMENT,
steam_id64 VARCHAR(20) NOT NULL,
player_name VARCHAR(255),
profile_url TEXT,
kd_ratio FLOAT,
hltv_rating FLOAT,
win_rate FLOAT,
headshot_percentage FLOAT,
matches_played INT,
matches_won INT,
matches_lost INT,
kills INT,
deaths INT,
assists INT,
headshots INT,
total_damage INT,
rounds_played INT,
adr FLOAT,
clutch_success FLOAT,
entry_success FLOAT,
last_scraped TIMESTAMP,
scrape_success BOOLEAN DEFAULT TRUE
```

### **3. scrape\_logs**

```sql
id INT PRIMARY KEY AUTO_INCREMENT,
steam_id64 VARCHAR(20),
status ENUM('started', 'success', 'failed'),
message TEXT,
execution_time INT,
stats_extracted INT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

---

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/Ar7340/CS2-Player-States.git
cd cs2-stats-scraper

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit `.env` and fill in your database credentials

```

---

## ⚙️ Configuration

Inside `.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cs2_stats
```

---

## 🚀 Usage

### ▶️ Start the Application

* **Production**:

  ```bash
  npm start
  ```

  or

  ```bash
  npm run start
  ```

* **Development**:

  ```bash
  npm run dev
  ```

---

## 💻 CLI Commands

Run the app, then type:

| Command | Description                          |
| ------- | ------------------------------------ |
| `start` | Begin scraping pending Steam IDs     |
| `stop`  | Stop the current scraping task       |
| `stats` | Show scraping and DB summary         |
| `reset` | Reset failed IDs to `pending` status |
| `logs`  | View latest scraping logs            |
| `help`  | Show available commands              |
| `exit`  | Exit the application                 |

---

### Programmatically:

```sql
INSERT INTO steam_ids (steam_id64, priority) VALUES ('76561198000000001', 1);
```

---

## 📦 API Usage

### Add Steam IDs via Code

```js
import ScraperManager from './src/scraperManager.js';

const manager = new ScraperManager();
await manager.initialize();

await manager.addSteamIds([
  '76561198000000001',
  '76561198000000002'
]);
```

### Retrieve Stats

```js
import DatabaseService from './src/services/database.service.js';

const stats = await DatabaseService.getPlayerStats('76561198000000001');
const topKDR = await DatabaseService.getTopPlayers(10, 'kd_ratio');
```

---

## 📊 Monitoring & Maintenance

### View Stats

```bash
# From CLI
Enter command: stats
```

### Clean Old Logs

```js
await DatabaseService.cleanupOldLogs(30); // Deletes logs older than 30 days
```

### Retry Failed IDs

```bash
Enter command: reset
```

---

## 🧠 Troubleshooting

### Database Connection Error

* Ensure MySQL server is running
* Check `.env` values
* Confirm the database and tables are created

---

## ⚡ Performance Tips

* Tune `BATCH_SIZE` and request delay for your system
* Use `LIMIT` in database queries for faster results
* Monitor logs for bottlenecks and retry logic

---

## 👨‍💻 Development Mode

```bash
npm run dev
```

## 📄 Full SQL Schema

Use the following SQL script to create the necessary tables in your MySQL database. These include indexing, charset settings, default values, and all necessary fields:

```sql
-- Create table for storing Steam IDs to scrape
CREATE TABLE IF NOT EXISTS steam_ids (
    id INT AUTO_INCREMENT PRIMARY KEY,
    steam_id64 VARCHAR(20) NOT NULL UNIQUE,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    priority INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create table for storing CS2 player stats
CREATE TABLE IF NOT EXISTS player_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    steam_id64 VARCHAR(20) NOT NULL,
    player_name VARCHAR(255),
    profile_url TEXT,

    -- Core Stats
    kd_ratio DECIMAL(4,2),
    hltv_rating DECIMAL(4,2),
    win_rate VARCHAR(10),
    headshot_percentage VARCHAR(10),
    adr INT,

    -- Match Stats
    matches_played INT,
    matches_won INT,
    matches_lost INT,
    matches_tied INT DEFAULT 0,

    -- Performance Stats
    kills INT,
    deaths INT,
    assists INT,
    headshots INT,
    total_damage BIGINT,
    rounds_played INT,

    -- Additional Stats
    clutch_success VARCHAR(10),
    entry_success VARCHAR(10),

    -- Metadata
    last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scrape_success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    UNIQUE KEY unique_steam_id (steam_id64),
    INDEX idx_steam_id (steam_id64),
    INDEX idx_player_name (player_name),
    INDEX idx_last_scraped (last_scraped),
    INDEX idx_kd_ratio (kd_ratio),
    INDEX idx_matches_played (matches_played)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create table for scraping logs
CREATE TABLE IF NOT EXISTS scrape_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    steam_id64 VARCHAR(20) NOT NULL,
    status ENUM('started', 'success', 'failed') NOT NULL,
    message TEXT,
    execution_time INT,
    stats_extracted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_steam_id (steam_id64),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---
