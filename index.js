import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

// Hardcoded SteamID64 - replace with the target player's SteamID64
const STEAM_ID64 = '0000000000000000'; // Example SteamID64, replace with actual ID

async function scrapeCS2Stats() {
    let browser;
    
    try {
        console.log('🚀 Starting CS2 stats scraper...');
        console.log(`📊 Target SteamID64: ${STEAM_ID64}`);
        
        // Launch browser with extended timeout and options
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ],
            timeout: 60000 // 60 second timeout
        });
        
        const page = await browser.newPage();
        
        // Set a realistic user agent and viewport
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set longer timeouts for navigation and waiting
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(30000);
        
        const url = `https://csgostats.gg/player/${STEAM_ID64}`;
        console.log(`🌐 Navigating to: ${url}`);
        
        // Navigate to the page
        const response = await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        
        if (!response.ok()) {
            throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
        }
        
        console.log('✅ Page loaded successfully');
        console.log('⏳ Waiting for stats to load...');
        
        // Wait for key elements to be present - using more specific selectors based on the layout
        try {
            await page.waitForSelector('[data-tippy-content], .stat-card, .stats-section', { 
                visible: true, 
                timeout: 30000 
            });
            console.log('📈 Stats elements found');
        } catch (error) {
            // Fallback - wait for any common stat indicators
            try {
                await page.waitForSelector('text/K/D', { timeout: 10000 });
                console.log('📈 Basic stats found');
            } catch {
                throw new Error('Stats elements not found - the page might have changed or the player data is not available');
            }
        }
        
        // Extract all visible stats from the page
        const stats = await page.evaluate(() => {
            const extractedStats = {};
            
            // Get player name
            const playerName = document.querySelector('h1, .player-name, .username')?.textContent?.trim() || 
                             document.querySelector('title')?.textContent?.split('-')[0]?.trim();
            
            // Function to safely get text content
            const getText = (element) => element?.textContent?.trim() || '';
            
            // Extract K/D ratio (the large circular displays)
            const kdElements = document.querySelectorAll('text');
            kdElements.forEach(el => {
                const text = getText(el);
                const parent = el.closest('svg')?.parentElement;
                if (text.match(/^\d+\.\d+$/) && parent) {
                    const label = parent.querySelector('*')?.textContent?.toLowerCase();
                    if (label?.includes('k/d') || label?.includes('kd')) {
                        extractedStats.kd_ratio = text;
                    } else if (label?.includes('hltv') || label?.includes('rating')) {
                        extractedStats.hltv_rating = text;
                    }
                }
            });
            
            // Extract percentage stats (Win Rate, HS%, ADR, etc.)
            const percentageElements = document.querySelectorAll('*');
            percentageElements.forEach(el => {
                const text = getText(el);
                if (text.match(/^\d+%$/)) {
                    const context = el.parentElement?.textContent?.toLowerCase() || '';
                    if (context.includes('win')) {
                        extractedStats.win_rate = text;
                    } else if (context.includes('hs') || context.includes('headshot')) {
                        extractedStats.headshot_percentage = text;
                    } else if (context.includes('clutch') || context.includes('success')) {
                        extractedStats.clutch_success = text;
                    }
                }
            });
            
            // Extract numeric stats (looking for common patterns)
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                const text = getText(el);
                const parentText = getText(el.parentElement);
                const context = (text + ' ' + parentText).toLowerCase();
                
                // Match various numeric patterns
                if (text.match(/^\d+$/)) {
                    const num = parseInt(text);
                    if (num > 0) {
                        if (context.includes('kill') && !context.includes('death')) {
                            extractedStats.kills = text;
                        } else if (context.includes('death') && !context.includes('kill')) {
                            extractedStats.deaths = text;
                        } else if (context.includes('assist')) {
                            extractedStats.assists = text;
                        } else if (context.includes('headshot') && num < 50000) {
                            extractedStats.headshots = text;
                        } else if (context.includes('played') || context.includes('match')) {
                            extractedStats.matches_played = text;
                        } else if (context.includes('won') && num < 10000) {
                            extractedStats.matches_won = text;
                        } else if (context.includes('lost') && num < 10000) {
                            extractedStats.matches_lost = text;
                        } else if (context.includes('round') && num > 10000) {
                            extractedStats.rounds_played = text;
                        } else if (context.includes('damage') && num > 100000) {
                            extractedStats.total_damage = text;
                        }
                    }
                }
                
                // ADR (Average Damage per Round)
                if (text.match(/^\d{2,3}$/) && context.includes('adr')) {
                    extractedStats.adr = text;
                }
                
                // Entry success percentage
                if (text.match(/^\d+%$/) && context.includes('entry')) {
                    extractedStats.entry_success = text;
                }
            });
            
            // Look for specific stat labels and their adjacent values
            const statLabels = {
                'PLAYED': 'matches_played',
                'KILLS': 'kills',
                'DAMAGE': 'total_damage',
                'WON': 'matches_won',
                'DEATHS': 'deaths',
                'ROUNDS': 'rounds_played',
                'LOST': 'matches_lost',
                'ASSISTS': 'assists',
                'TIED': 'matches_tied',
                'HEADSHOTS': 'headshots'
            };
            
            Object.keys(statLabels).forEach(label => {
                const labelElement = Array.from(document.querySelectorAll('*')).find(el => 
                    getText(el).toUpperCase() === label
                );
                if (labelElement) {
                    // Look for the value in nearby elements
                    const siblings = Array.from(labelElement.parentElement?.children || []);
                    const index = siblings.indexOf(labelElement);
                    for (let i = Math.max(0, index - 2); i < Math.min(siblings.length, index + 3); i++) {
                        const siblingText = getText(siblings[i]);
                        if (siblingText.match(/^\d+$/) && siblingText !== label) {
                            extractedStats[statLabels[label]] = siblingText;
                            break;
                        }
                    }
                }
            });
            
            return {
                player_info: {
                    steam_id64: window.location.pathname.split('/').pop(),
                    player_name: playerName || 'Unknown',
                    profile_url: window.location.href,
                    scraped_at: new Date().toISOString()
                },
                stats: extractedStats
            };
        });
        
        // Validate that we got some stats
        if (!stats.stats || Object.keys(stats.stats).length === 0) {
            throw new Error('No stats data found - the page structure might have changed or the player has no recorded matches');
        }
        
        console.log(`📊 Successfully extracted ${Object.keys(stats.stats).length} stats`);
        
        // Save to JSON file
        const outputPath = path.resolve('cs2_stats.json');
        await fs.writeFile(outputPath, JSON.stringify(stats, null, 2), 'utf8');
        
        console.log('✅ Stats successfully saved to cs2_stats.json');
        console.log('📁 File location:', outputPath);
        console.log('🎮 Player:', stats.player_info.player_name);
        console.log('📈 Stats extracted:', Object.keys(stats.stats).join(', '));
        
        // Log the actual stats found for debugging
        console.log('\n📋 Extracted Stats:');
        Object.entries(stats.stats).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
        });
        
        return stats;
        
    } catch (error) {
        console.error('❌ Error occurred while scraping CS2 stats:');
        
        if (error.message.includes('HTTP')) {
            console.error('🌐 Network Error:', error.message);
            console.error('💡 This could be due to:');
            console.error('   - Invalid SteamID64');
            console.error('   - Player profile is private');
            console.error('   - Website is down or blocking requests');
        } else if (error.message.includes('timeout')) {
            console.error('⏰ Timeout Error:', error.message);
            console.error('💡 The page took too long to load - try again later');
        } else if (error.message.includes('not found')) {
            console.error('🔍 Data Error:', error.message);
            console.error('💡 Check if the SteamID64 is correct and the player has CS2 match data');
        } else {
            console.error('🐛 General Error:', error.message);
        }
        
        throw error;
        
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔒 Browser closed');
        }
    }
}

// Run the scraper
scrapeCS2Stats()
    .then(() => {
        console.log('🎉 Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error.message);
        process.exit(1);
    });