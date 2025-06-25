import dbManager from '../config/database.js';

class DatabaseService {
    // Steam IDs Management
    async getPendingSteamIds(limit = 10) {
        const query = `
            SELECT steam_id64, id, priority 
            FROM steam_ids 
            WHERE status = 'pending' 
            ORDER BY priority DESC, created_at ASC 
            LIMIT ?
        `;
        return await dbManager.execute(query, [limit]);
    }

    async updateSteamIdStatus(steamId64, status) {
        const query = `
            UPDATE steam_ids 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE steam_id64 = ?
        `;
        return await dbManager.execute(query, [status, steamId64]);
    }

    async addSteamId(steamId64, priority = 1) {
        const query = `
            INSERT INTO steam_ids (steam_id64, priority) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE 
                priority = VALUES(priority),
                updated_at = CURRENT_TIMESTAMP
        `;
        return await dbManager.execute(query, [steamId64, priority]);
    }

    async addMultipleSteamIds(steamIds) {
        if (!steamIds || steamIds.length === 0) return;
        
        const query = `
            INSERT INTO steam_ids (steam_id64, priority) 
            VALUES ? 
            ON DUPLICATE KEY UPDATE 
                priority = VALUES(priority),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        const values = steamIds.map(id => 
            Array.isArray(id) ? id : [id, 1]
        );
        
        return await dbManager.execute(query, [values]);
    }

    // Player Stats Management
    async savePlayerStats(steamId64, playerData) {
        const query = `
            INSERT INTO player_stats (
                steam_id64, player_name, profile_url,
                kd_ratio, hltv_rating, win_rate, headshot_percentage, adr,
                matches_played, matches_won, matches_lost, matches_tied,
                kills, deaths, assists, headshots, total_damage, rounds_played,
                clutch_success, entry_success,
                last_scraped, scrape_success
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                CURRENT_TIMESTAMP, TRUE
            )
            ON DUPLICATE KEY UPDATE
                player_name = VALUES(player_name),
                profile_url = VALUES(profile_url),
                kd_ratio = VALUES(kd_ratio),
                hltv_rating = VALUES(hltv_rating),
                win_rate = VALUES(win_rate),
                headshot_percentage = VALUES(headshot_percentage),
                adr = VALUES(adr),
                matches_played = VALUES(matches_played),
                matches_won = VALUES(matches_won),
                matches_lost = VALUES(matches_lost),
                matches_tied = VALUES(matches_tied),
                kills = VALUES(kills),
                deaths = VALUES(deaths),
                assists = VALUES(assists),
                headshots = VALUES(headshots),
                total_damage = VALUES(total_damage),
                rounds_played = VALUES(rounds_played),
                clutch_success = VALUES(clutch_success),
                entry_success = VALUES(entry_success),
                last_scraped = CURRENT_TIMESTAMP,
                scrape_success = TRUE,
                error_message = NULL
        `;

        const values = [
            steamId64,
            playerData.player_name || null,
            playerData.profile_url || null,
            playerData.kd_ratio || null,
            playerData.hltv_rating || null,
            playerData.win_rate || null,
            playerData.headshot_percentage || null,
            playerData.adr || null,
            playerData.matches_played || null,
            playerData.matches_won || null,
            playerData.matches_lost || null,
            playerData.matches_tied || null,
            playerData.kills || null,
            playerData.deaths || null,
            playerData.assists || null,
            playerData.headshots || null,
            playerData.total_damage || null,
            playerData.rounds_played || null,
            playerData.clutch_success || null,
            playerData.entry_success || null
        ];

        return await dbManager.execute(query, values);
    }

    async savePlayerStatsError(steamId64, errorMessage) {
        const query = `
            INSERT INTO player_stats (
                steam_id64, last_scraped, scrape_success, error_message
            ) VALUES (
                ?, CURRENT_TIMESTAMP, FALSE, ?
            )
            ON DUPLICATE KEY UPDATE
                last_scraped = CURRENT_TIMESTAMP,
                scrape_success = FALSE,
                error_message = VALUES(error_message)
        `;
        return await dbManager.execute(query, [steamId64, errorMessage]);
    }

    async getPlayerStats(steamId64) {
        const query = 'SELECT * FROM player_stats WHERE steam_id64 = ?';
        const results = await dbManager.execute(query, [steamId64]);
        return results[0] || null;
    }

    async getAllPlayerStats(limit = 100, offset = 0) {
        const query = `
            SELECT * FROM player_stats 
            ORDER BY last_scraped DESC 
            LIMIT ? OFFSET ?
        `;
        return await dbManager.execute(query, [limit, offset]);
    }

    async getTopPlayers(limit = 10, orderBy = 'kd_ratio') {
        const validOrderBy = [
            'kd_ratio', 'hltv_rating', 'matches_played', 
            'kills', 'adr', 'matches_won'
        ];
        
        if (!validOrderBy.includes(orderBy)) {
            orderBy = 'kd_ratio';
        }

        const query = `
            SELECT steam_id64, player_name, ${orderBy}, matches_played, last_scraped
            FROM player_stats 
            WHERE scrape_success = TRUE AND ${orderBy} IS NOT NULL
            ORDER BY ${orderBy} DESC 
            LIMIT ?
        `;
        return await dbManager.execute(query, [limit]);
    }

    // Scrape Logs Management
    async logScrapeStart(steamId64) {
        const query = `
            INSERT INTO scrape_logs (steam_id64, status, message) 
            VALUES (?, 'started', 'Scraping started')
        `;
        const result = await dbManager.execute(query, [steamId64]);
        return result.insertId;
    }

    async logScrapeSuccess(logId, steamId64, executionTime, statsExtracted) {
        const query = `
            UPDATE scrape_logs 
            SET status = 'success', 
                message = 'Scraping completed successfully',
                execution_time = ?,
                stats_extracted = ?
            WHERE id = ? AND steam_id64 = ?
        `;
        return await dbManager.execute(query, [executionTime, statsExtracted, logId, steamId64]);
    }

    async logScrapeFailure(logId, steamId64, executionTime, errorMessage) {
        const query = `
            UPDATE scrape_logs 
            SET status = 'failed', 
                message = ?,
                execution_time = ?
            WHERE id = ? AND steam_id64 = ?
        `;
        return await dbManager.execute(query, [errorMessage, executionTime, logId, steamId64]);
    }

    async getScrapeLogs(limit = 50, steamId64 = null) {
        let query = `
            SELECT sl.*, ps.player_name 
            FROM scrape_logs sl
            LEFT JOIN player_stats ps ON sl.steam_id64 = ps.steam_id64
        `;
        let params = [];

        if (steamId64) {
            query += ' WHERE sl.steam_id64 = ?';
            params.push(steamId64);
        }

        query += ' ORDER BY sl.created_at DESC LIMIT ?';
        params.push(limit);

        return await dbManager.execute(query, params);
    }

    // Statistics and Analytics
    async getScrapingStats() {
        const queries = [
            'SELECT COUNT(*) as total_steam_ids FROM steam_ids',
            'SELECT COUNT(*) as pending_steam_ids FROM steam_ids WHERE status = "pending"',
            'SELECT COUNT(*) as completed_steam_ids FROM steam_ids WHERE status = "completed"',
            'SELECT COUNT(*) as failed_steam_ids FROM steam_ids WHERE status = "failed"',
            'SELECT COUNT(*) as total_player_stats FROM player_stats',
            'SELECT COUNT(*) as successful_scrapes FROM player_stats WHERE scrape_success = TRUE',
            'SELECT COUNT(*) as failed_scrapes FROM player_stats WHERE scrape_success = FALSE',
            'SELECT AVG(execution_time) as avg_execution_time FROM scrape_logs WHERE status = "success"'
        ];

        const results = {};
        for (const query of queries) {
            const result = await dbManager.execute(query);
            Object.assign(results, result[0]);
        }

        return results;
    }

    async cleanupOldLogs(daysOld = 30) {
        const query = `
            DELETE FROM scrape_logs 
            WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        `;
        return await dbManager.execute(query, [daysOld]);
    }

    // Utility methods
    async resetSteamIdStatus(steamId64) {
        const query = `
            UPDATE steam_ids 
            SET status = 'pending', updated_at = CURRENT_TIMESTAMP 
            WHERE steam_id64 = ?
        `;
        return await dbManager.execute(query, [steamId64]);
    }

    async resetAllFailedSteamIds() {
        const query = `
            UPDATE steam_ids 
            SET status = 'pending', updated_at = CURRENT_TIMESTAMP 
            WHERE status = 'failed'
        `;
        return await dbManager.execute(query);
    }
}

export default new DatabaseService();