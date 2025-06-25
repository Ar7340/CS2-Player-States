import puppeteer from 'puppeteer';

class ScraperService {
    constructor() {
        this.browser = null;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing browser...');
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });
            console.log('✅ Browser initialized successfully');
        } catch (error) {
            console.error('❌ Browser initialization failed:', error.message);
            throw error;
        }
    }

    async scrapePlayerStats(steamId64) {
        if (!this.browser) {
            await this.initialize();
        }

        const startTime = Date.now();
        let page;

        try {
            console.log(`📊 Scraping stats for Steam ID: ${steamId64}`);
            
            page = await this.browser.newPage();
            
            // Configure page with default settings
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            const url = `https://csgostats.gg/player/${steamId64}`;
            console.log(`🌐 Navigating to: ${url}`);

            const response = await page.goto(url, {
                waitUntil: 'networkidle2'
            });

            if (!response.ok()) {
                throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
            }

            console.log('✅ Page loaded successfully');
            console.log('⏳ Waiting for stats to load...');

            // Wait for stats elements
            try {
                await page.waitForSelector('[data-tippy-content], .stat-card, .stats-section', {
                    visible: true,
                    timeout: 30000
                });
                console.log('📈 Stats elements found');
            } catch (error) {
                try {
                    await page.waitForSelector('text/K/D', { timeout: 10000 });
                    console.log('📈 Basic stats found');
                } catch {
                    throw new Error('Stats elements not found - player might not have CS2 data');
                }
            }

            // Extract stats
            const stats = await page.evaluate(() => {
                const extractedStats = {};

                // Get player name
                const playerName = document.querySelector('h1, .player-name, .username')?.textContent?.trim() ||
                                 document.querySelector('title')?.textContent?.split('-')[0]?.trim();

                const getText = (element) => element?.textContent?.trim() || '';

                // Extract K/D ratio and HLTV rating
                const kdElements = document.querySelectorAll('text');
                kdElements.forEach(el => {
                    const text = getText(el);
                    const parent = el.closest('svg')?.parentElement;
                    if (text.match(/^\d+\.\d+$/) && parent) {
                        const label = parent.querySelector('*')?.textContent?.toLowerCase();
                        if (label?.includes('k/d') || label?.includes('kd')) {
                            extractedStats.kd_ratio = parseFloat(text);
                        } else if (label?.includes('hltv') || label?.includes('rating')) {
                            extractedStats.hltv_rating = parseFloat(text);
                        }
                    }
                });

                // Extract percentage stats
                const percentageElements = document.querySelectorAll('*');
                percentageElements.forEach(el => {
                    const text = getText(el);
                    if (text.match(/^\d+%$/)) {
                        const context = el.parentElement?.textContent?.toLowerCase() || '';
                        if (context.includes('win')) {
                            extractedStats.win_rate = text;
                        } else if (context.includes('hs') || context.includes('headshot')) {
                            extractedStats.headshot_percentage = text;
                        } else if (context.includes('clutch')) {
                            extractedStats.clutch_success = text;
                        } else if (context.includes('entry')) {
                            extractedStats.entry_success = text;
                        }
                    }
                });

                // Extract numeric stats
                const allElements = document.querySelectorAll('*');
                allElements.forEach(el => {
                    const text = getText(el);
                    const parentText = getText(el.parentElement);
                    const context = (text + ' ' + parentText).toLowerCase();

                    if (text.match(/^\d+$/)) {
                        const num = parseInt(text);
                        if (num > 0) {
                            if (context.includes('kill') && !context.includes('death')) {
                                extractedStats.kills = num;
                            } else if (context.includes('death') && !context.includes('kill')) {
                                extractedStats.deaths = num;
                            } else if (context.includes('assist')) {
                                extractedStats.assists = num;
                            } else if (context.includes('headshot') && num < 50000) {
                                extractedStats.headshots = num;
                            } else if (context.includes('played') || context.includes('match')) {
                                extractedStats.matches_played = num;
                            } else if (context.includes('won') && num < 10000) {
                                extractedStats.matches_won = num;
                            } else if (context.includes('lost') && num < 10000) {
                                extractedStats.matches_lost = num;
                            } else if (context.includes('round') && num > 1000) {
                                extractedStats.rounds_played = num;
                            } else if (context.includes('damage') && num > 100000) {
                                extractedStats.total_damage = num;
                            }
                        }
                    }

                    // ADR
                    if (text.match(/^\d{2,3}$/) && context.includes('adr')) {
                        extractedStats.adr = parseInt(text);
                    }
                });

                // Look for specific stat labels
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
                        const siblings = Array.from(labelElement.parentElement?.children || []);
                        const index = siblings.indexOf(labelElement);
                        for (let i = Math.max(0, index - 2); i < Math.min(siblings.length, index + 3); i++) {
                            const siblingText = getText(siblings[i]);
                            if (siblingText.match(/^\d+$/) && siblingText !== label) {
                                const value = parseInt(siblingText);
                                extractedStats[statLabels[label]] = value;
                                break;
                            }
                        }
                    }
                });

                return {
                    player_info: {
                        steam_id64: window.location.pathname.split('/').pop(),
                        player_name: playerName || 'Unknown',
                        profile_url: window.location.href
                    },
                    stats: extractedStats
                };
            });

            const executionTime = Date.now() - startTime;

            if (!stats.stats || Object.keys(stats.stats).length === 0) {
                throw new Error('No stats data found - player might have no recorded matches');
            }

            console.log(`✅ Successfully extracted ${Object.keys(stats.stats).length} stats in ${executionTime}ms`);

            return {
                success: true,
                data: {
                    ...stats.player_info,
                    ...stats.stats
                },
                executionTime,
                statsCount: Object.keys(stats.stats).length
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            console.error(`❌ Scraping failed for ${steamId64}:`, error.message);
            
            return {
                success: false,
                error: error.message,
                executionTime,
                statsCount: 0
            };
        } finally {
            if (page) {
                await page.close();
            }
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('🔒 Browser closed');
        }
    }
}

export default ScraperService;