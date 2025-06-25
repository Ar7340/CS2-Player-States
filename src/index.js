import ScraperManager from './scraperManager.js';
import readline from 'readline';

// Create readline interface for user interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Main application class
class CS2StatsApp {
    constructor() {
        this.scraperManager = new ScraperManager();
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🎮 CS2 Stats Scraper - Database Edition');
            console.log('=====================================\n');

            // Initialize scraper manager
            await this.scraperManager.initialize();
            
            this.isInitialized = true;
            console.log('✅ Application initialized successfully!\n');
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            process.exit(1);
        }
    }

    showMenu() {
        console.log('\n📋 Available Commands:');
        console.log('1. start     - Start scraping pending Steam IDs');
        console.log('2. stop      - Stop the current scraping process');
        // console.log('3. add       - Add Steam ID(s) to the queue');
        console.log('3. stats     - Show database statistics');
        // console.log('5. top       - Show top players');
        console.log('4. reset     - Reset failed Steam IDs to pending');
        console.log('5. logs      - Show recent scraping logs');
        console.log('6. help      - Show this menu');
        console.log('7. exit      - Exit the application');
        console.log('');
    }

    async handleUserInput(input) {
        const command = input.trim().toLowerCase();

        try {
            switch (command) {
                case '1':
                case 'start':
                    await this.startScraping();
                    break;

                case '2':
                case 'stop':
                    await this.stopScraping();
                    break;

                // case '3':
                // case 'add':
                //     await this.addSteamIds();
                //     break;

                case '3':
                case 'stats':
                    await this.showStats();
                    break;

                // case '5':
                // case 'top':
                //     await this.showTopPlayers();
                //     break;

                case '4':
                case 'reset':
                    await this.resetFailedIds();
                    break;

                case '5':
                case 'logs':
                    await this.showLogs();
                    break;

                case '6':
                case 'help':
                    this.showMenu();
                    break;

                case '7':
                case 'exit':
                    await this.exit();
                    return;

                default:
                    console.log('❓ Unknown command. Type "help" to see available commands.');
                    break;
            }
        } catch (error) {
            console.error('❌ Command failed:', error.message);
        }

        this.promptUser();
    }

    async startScraping() {
        console.log('🚀 Starting scraping process...');
        // Run scraping in background
        this.scraperManager.startScraping().catch(console.error);
    }

    async stopScraping() {
        await this.scraperManager.stopScraping();
    }

    async addSteamIds() {
        return new Promise((resolve) => {
            rl.question('Enter Steam ID(s) (comma-separated for multiple): ', async (answer) => {
                try {
                    const steamIds = answer.split(',').map(id => id.trim()).filter(id => id.length > 0);
                    
                    if (steamIds.length === 0) {
                        console.log('❌ No valid Steam IDs provided');
                        resolve();
                        return;
                    }

                    // Validate Steam ID format (basic check)
                    const validSteamIds = steamIds.filter(id => /^\d{17}$/.test(id));
                    const invalidSteamIds = steamIds.filter(id => !/^\d{17}$/.test(id));

                    if (invalidSteamIds.length > 0) {
                        console.log(`⚠️ Invalid Steam IDs (must be 17 digits): ${invalidSteamIds.join(', ')}`);
                    }

                    if (validSteamIds.length > 0) {
                        await this.scraperManager.addSteamIds(validSteamIds);
                    }
                } catch (error) {
                    console.error('❌ Failed to add Steam IDs:', error.message);
                }
                resolve();
            });
        });
    }

    async showStats() {
        await this.scraperManager.getStats();
    }

    async showTopPlayers() {
        return new Promise((resolve) => {
            rl.question('Order by (kd_ratio/hltv_rating/matches_played/kills/adr) [default: kd_ratio]: ', async (orderBy) => {
                try {
                    const order = orderBy.trim() || 'kd_ratio';
                    await this.scraperManager.getTopPlayers(10, order);
                } catch (error) {
                    console.error('❌ Failed to show top players:', error.message);
                }
                resolve();
            });
        });
    }

    async resetFailedIds() {
        return new Promise((resolve) => {
            rl.question('Are you sure you want to reset all failed Steam IDs to pending? (y/N): ', async (answer) => {
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    try {
                        await this.scraperManager.resetFailedIds();
                    } catch (error) {
                        console.error('❌ Failed to reset failed IDs:', error.message);
                    }
                } else {
                    console.log('❌ Operation cancelled');
                }
                resolve();
            });
        });
    }

    async showLogs() {
        try {
            const DatabaseService = (await import('./services/database.service.js')).default;
            const logs = await DatabaseService.getScrapeLogs(20);
            
            console.log('\n📋 Recent Scraping Logs:');
            if (logs.length === 0) {
                console.log('   No logs found');
            } else {
                logs.forEach(log => {
                    const status = log.status === 'success' ? '✅' : 
                                  log.status === 'failed' ? '❌' : '🔄';
                    const playerName = log.player_name || 'Unknown';
                    const time = log.execution_time ? `${log.execution_time}ms` : 'N/A';
                    console.log(`   ${status} ${log.steam_id64} (${playerName}) - ${time} - ${log.created_at}`);
                });
            }
        } catch (error) {
            console.error('❌ Failed to show logs:', error.message);
        }
    }

    promptUser() {
        rl.question('Enter command (or "help" for menu): ', (input) => {
            this.handleUserInput(input);
        });
    }

    async exit() {
        console.log('👋 Shutting down...');
        await this.scraperManager.cleanup();
        rl.close();
        process.exit(0);
    }

    async run() {
        await this.initialize();
        
        // Show initial stats and menu
        await this.showStats();
        this.showMenu();
        
        // Start interactive mode
        this.promptUser();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    const app = new CS2StatsApp();
    if (app.isInitialized) {
        await app.scraperManager.cleanup();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    const app = new CS2StatsApp();
    if (app.isInitialized) {
        await app.scraperManager.cleanup();
    }
    process.exit(0);
});

// Start the application
const app = new CS2StatsApp();
app.run().catch(console.error);