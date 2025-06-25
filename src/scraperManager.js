import ScraperService from './services/scraper.service.js';
import DatabaseService from './services/database.service.js';
import dbManager from './config/database.js';

class ScraperManager {
    constructor() {
        this.scraperService = new ScraperService();
        this.isRunning = false;
        this.batchSize = 5; // Fixed batch size
        this.delay = 2000; // Fixed delay (2 seconds)
        this.processedCount = 0;
        this.successCount = 0;
        this.failureCount = 0;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing Scraper Manager...');
            await dbManager.initialize();
            await this.scraperService.initialize();
            console.log('✅ Scraper Manager initialized successfully');
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            throw error;
        }
    }

    async processSingleSteamId(steamId64) {
        const logId = await DatabaseService.logScrapeStart(steamId64);
        
        try {
            // Update status to processing
            await DatabaseService.updateSteamIdStatus(steamId64, 'processing');
            
            console.log(`🎯 Processing Steam ID: ${steamId64}`);
            
            // Scrape the stats
            const result = await this.scraperService.scrapePlayerStats(steamId64);
            
            if (result.success) {
                // Save successful stats
                await DatabaseService.savePlayerStats(steamId64, result.data);
                await DatabaseService.updateSteamIdStatus(steamId64, 'completed');
                await DatabaseService.logScrapeSuccess(
                    logId, 
                    steamId64, 
                    result.executionTime, 
                    result.statsCount
                );
                
                this.successCount++;
                console.log(`✅ Successfully processed ${steamId64} (${result.statsCount} stats)`);
                
                return { success: true, steamId64, stats: result.statsCount };
            } else {
                // Save error
                await DatabaseService.savePlayerStatsError(steamId64, result.error);
                await DatabaseService.updateSteamIdStatus(steamId64, 'failed');
                await DatabaseService.logScrapeFailure(
                    logId, 
                    steamId64, 
                    result.executionTime, 
                    result.error
                );
                
                this.failureCount++;
                console.log(`❌ Failed to process ${steamId64}: ${result.error}`);
                
                return { success: false, steamId64, error: result.error };
            }
        } catch (error) {
            // Handle unexpected errors
            await DatabaseService.savePlayerStatsError(steamId64, error.message);
            await DatabaseService.updateSteamIdStatus(steamId64, 'failed');
            await DatabaseService.logScrapeFailure(logId, steamId64, 0, error.message);
            
            this.failureCount++;
            console.error(`💥 Unexpected error processing ${steamId64}:`, error.message);
            
            return { success: false, steamId64, error: error.message };
        } finally {
            this.processedCount++;
        }
    }

    async processBatch() {
        try {
            // Get pending Steam IDs
            const pendingSteamIds = await DatabaseService.getPendingSteamIds(this.batchSize);
            
            if (pendingSteamIds.length === 0) {
                console.log('📭 No pending Steam IDs found');
                return { processed: 0, completed: true };
            }
            
            console.log(`📦 Processing batch of ${pendingSteamIds.length} Steam IDs`);
            
            const results = [];
            
            for (const { steam_id64 } of pendingSteamIds) {
                if (!this.isRunning) {
                    console.log('⏸️ Scraping stopped by user');
                    break;
                }
                
                const result = await this.processSingleSteamId(steam_id64);
                results.push(result);
                
                // Add delay between requests to avoid rate limiting
                if (pendingSteamIds.indexOf(pendingSteamIds.find(p => p.steam_id64 === steam_id64)) < pendingSteamIds.length - 1) {
                    console.log(`⏳ Waiting ${this.delay}ms before next request...`);
                    await this.scraperService.delay(this.delay);
                }
            }
            
            return {
                processed: results.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                completed: false
            };
            
        } catch (error) {
            console.error('❌ Batch processing error:', error.message);
            throw error;
        }
    }

    async startScraping() {
        if (this.isRunning) {
            console.log('⚠️ Scraper is already running');
            return;
        }
        
        this.isRunning = true;
        this.processedCount = 0;
        this.successCount = 0;
        this.failureCount = 0;
        
        console.log('🚀 Starting scraping process...');
        console.log(`📊 Batch size: ${this.batchSize}, Delay: ${this.delay}ms`);
        
        const startTime = Date.now();
        
        try {
            let totalProcessed = 0;
            let batchCount = 0;
            
            while (this.isRunning) {
                batchCount++;
                console.log(`\n🔄 Starting batch #${batchCount}`);
                
                const batchResult = await this.processBatch();
                totalProcessed += batchResult.processed;
                
                if (batchResult.completed || batchResult.processed === 0) {
                    console.log('✅ All pending Steam IDs have been processed');
                    break;
                }
                
                // Show progress
                console.log(`📊 Batch #${batchCount} completed: ${batchResult.successful} successful, ${batchResult.failed} failed`);
                
                // Brief pause between batches
                if (this.isRunning) {
                    await this.scraperService.delay(1000);
                }
            }
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            console.log('\n🎉 Scraping process completed!');
            console.log(`📊 Final Stats:`);
            console.log(`   Total processed: ${this.processedCount}`);
            console.log(`   Successful: ${this.successCount}`);
            console.log(`   Failed: ${this.failureCount}`);
            console.log(`   Total time: ${Math.round(totalTime / 1000)}s`);
            console.log(`   Average time per Steam ID: ${Math.round(totalTime / this.processedCount)}ms`);
            
        } catch (error) {
            console.error('💥 Scraping process failed:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async stopScraping() {
        if (!this.isRunning) {
            console.log('⚠️ Scraper is not currently running');
            return;
        }
        
        console.log('🛑 Stopping scraper...');
        this.isRunning = false;
    }

    async addSteamIds(steamIds) {
        try {
            if (Array.isArray(steamIds)) {
                await DatabaseService.addMultipleSteamIds(steamIds);
                console.log(`✅ Added ${steamIds.length} Steam IDs to the queue`);
            } else {
                await DatabaseService.addSteamId(steamIds);
                console.log(`✅ Added Steam ID ${steamIds} to the queue`);
            }
        } catch (error) {
            console.error('❌ Failed to add Steam IDs:', error.message);
            throw error;
        }
    }

    async getStats() {
        try {
            const stats = await DatabaseService.getScrapingStats();
            console.log('\n📊 Current Database Statistics:');
            console.log(`   Total Steam IDs: ${stats.total_steam_ids}`);
            console.log(`   Pending: ${stats.pending_steam_ids}`);
            console.log(`   Completed: ${stats.completed_steam_ids}`);
            console.log(`   Failed: ${stats.failed_steam_ids}`);
            console.log(`   Total Player Stats: ${stats.total_player_stats}`);
            console.log(`   Successful Scrapes: ${stats.successful_scrapes}`);
            console.log(`   Failed Scrapes: ${stats.failed_scrapes}`);
            console.log(`   Average Execution Time: ${Math.round(stats.avg_execution_time || 0)}ms`);
            
            return stats;
        } catch (error) {
            console.error('❌ Failed to get stats:', error.message);
            throw error;
        }
    }

    async getTopPlayers(limit = 10, orderBy = 'kd_ratio') {
        try {
            const topPlayers = await DatabaseService.getTopPlayers(limit, orderBy);
            console.log(`\n🏆 Top ${limit} Players by ${orderBy}:`);
            topPlayers.forEach((player, index) => {
                console.log(`   ${index + 1}. ${player.player_name || 'Unknown'} - ${player[orderBy]} (${player.matches_played} matches)`);
            });
            
            return topPlayers;
        } catch (error) {
            console.error('❌ Failed to get top players:', error.message);
            throw error;
        }
    }

    async resetFailedIds() {
        try {
            await DatabaseService.resetAllFailedSteamIds();
            console.log('✅ All failed Steam IDs have been reset to pending');
        } catch (error) {
            console.error('❌ Failed to reset failed IDs:', error.message);
            throw error;
        }
    }

    async cleanup() {
        try {
            console.log('🧹 Cleaning up resources...');
            await this.scraperService.close();
            await dbManager.close();
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }
}

export default ScraperManager;