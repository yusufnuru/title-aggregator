import express from 'express';
import axios from 'axios';
import {load} from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;

// Store articles in memory (in production, use a database)
let articles = [];
let lastFetchTime = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Function to scrape The Verge articles with improved selectors
async function scrapeVergeArticles() {
    try {
        console.log('Fetching articles from The Verge...');
        const response = await axios.get('https://www.theverge.com/', {
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log(`Fetched ${response.data.length} characters from The Verge.`);
        console.log(`Status: ${response.status} ${response.statusText}`);

        const $ = load(response.data);
        const scrapedArticles = [];

        // Debug: Let's see what we actually got
        console.log('HTML length:', response.data.length);
        console.log('Title tag:', $('title').text());
        
        // More comprehensive selectors for The Verge's current structure
        const articleSelectors = [
            // All links containing year patterns in URL
            'a[href*="/2025/"]',
            'a[href*="/2024/"]',
            'a[href*="/2023/"]',
            'a[href*="/2022/"]',

            // Links with common article patterns
            'a[href^="/2025/"]',
            'a[href^="/2024/"]',
            'a[href^="/2023/"]',
            'a[href^="/2022/"]',
            
            // Try data attributes and common class patterns
            '[data-analytics-link*="2025"] a',
            '[data-analytics-link*="2024"] a',
            '[data-analytics-link*="2023"] a',
            '[data-analytics-link*="2022"] a',
            
            // Common article link patterns
            'article a[href*="/2025/"]',
            'article a[href*="/2024/"]',
            'article a[href*="/2023/"]',
            'article a[href*="/2022/"]',

            // Story card patterns
            '.c-story-card a[href*="/2025/"]',
            '.c-story-card a[href*="/2024/"]',
            '.c-story-card a[href*="/2023/"]',
            '.c-story-card a[href*="/2022/"]',

            // Headline patterns
            'h1 a[href*="/2025/"]',
            'h1 a[href*="/2024/"]',
            'h1 a[href*="/2023/"]',
            'h1 a[href*="/2022/"]',
            'h2 a[href*="/2025/"]',
            'h2 a[href*="/2024/"]',
            'h2 a[href*="/2023/"]',
            'h2 a[href*="/2022/"]',
            'h3 a[href*="/2024/"]',
            'h3 a[href*="/2025/"]',
            'h3 a[href*="/2023/"]',
            'h3 a[href*="/2022/"]',
            'h4 a[href*="/2024/"]',
            'h4 a[href*="/2025/"]',
            'h4 a[href*="/2023/"]',
            'h4 a[href*="/2022/"]'
        ];

        articleSelectors.forEach((selector, index) => {
            const count = $(selector).length;
            if (count > 0) {
                console.log(`Selector ${index + 1} (${selector}): found ${count} elements`);
            }
        });

        // Also debug - show what kinds of links we have
        const allLinks = $('a[href]');
        console.log(`Total links found on page: ${allLinks.length}`);
        
        // Show some sample hrefs to understand the structure
        console.log('Sample hrefs:');
        allLinks.slice(0, 20).each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('2024') || href.includes('2023') || href.includes('2022'))) {
                console.log(`  ${href}`);
            }
        });

        // Process all selectors
        articleSelectors.forEach(selector => {
            $(selector).each((index, element) => {
                const $element = $(element);
                let title = $element.text().trim();
                const href = $element.attr('href');
                
                // If the link itself doesn't have text, try to find title in parent elements
                if (!title || title.length < 5) {
                    const $parent = $element.closest('article, .c-story-card, h1, h2, h3, h4, [data-analytics-link]');
                    if ($parent.length) {
                        title = $parent.find('h1, h2, h3, h4').first().text().trim() || 
                               $parent.text().trim().split('\n')[0];
                    }
                }
                
                if (title && href && title.length > 10 && title.length < 200) { // Reasonable title length
                    let fullUrl = href;
                    if (href.startsWith('/')) {
                        fullUrl = 'https://www.theverge.com' + href;
                    }
                    
                    // Extract date from URL pattern - more flexible matching
                    const dateMatch = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
                    let publishDate = new Date();
                    
                    if (dateMatch) {
                        const [, year, month, day] = dateMatch;
                        publishDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                        
                        // Only include articles from 2022 onwards
                        if (publishDate >= new Date('2022-01-01')) {
                            scrapedArticles.push({
                                title: title.replace(/\s+/g, ' ').trim(), // Clean up whitespace
                                url: fullUrl,
                                publishDate,
                            });
                        }
                    }
                }
            });
        });

        console.log(`Found ${scrapedArticles.length} articles before deduplication`);

        // Remove duplicates based on URL
        const uniqueArticles = scrapedArticles.filter((article, index, self) => 
            index === self.findIndex(a => a.url === article.url)
        );

        // Sort by date (newest first)
        uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

        console.log(`Scraped ${uniqueArticles.length} unique articles`);
        
        // Debug: Log first few articles
        if (uniqueArticles.length > 0) {
            console.log('First few articles found:');
            uniqueArticles.slice(0, 5).forEach((article, index) => {
                console.log(`${index + 1}. ${article.title} - ${article.url}`);
            });
        } else {
            console.log('No articles found. This might be due to:');
            console.log('1. The Verge changed their HTML structure');
            console.log('2. Anti-scraping measures are in place');
            console.log('3. The page is loading content dynamically with JavaScript');
            console.log('Falling back to RSS feed...');
        }
        
        return uniqueArticles;

    } catch (error) {
        console.error('Error scraping The Verge:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
        return [];
    }
}

// Enhanced RSS scraping function
async function scrapeVergeRSS() {
    try {
        console.log('Trying RSS feed as fallback...');
        const response = await axios.get('https://www.theverge.com/rss/index.xml', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader/1.0)'
            }
        });
        
        const $ = load(response.data, { xmlMode: true });
        const scrapedArticles = [];
        
        $('item').each((index, element) => {
            const $element = $(element);
            const title = $element.find('title').text().trim();
            const link = $element.find('link').text().trim();
            const pubDate = $element.find('pubDate').text().trim();
            
            if (title && link) {
                const publishDate = new Date(pubDate);
                
                // Only include articles from 2022 onwards
                if (publishDate >= new Date('2022-01-01')) {
                    scrapedArticles.push({
                        title,
                        url: link,
                        publishDate,
                        source: 'The Verge (RSS)'
                    });
                }
            }
        });
        
        // Sort by date (newest first)
        scrapedArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
        
        console.log(`RSS scraping found ${scrapedArticles.length} articles`);
        return scrapedArticles;
        
    } catch (error) {
        console.error('RSS scraping failed:', error.message);
        return [];
    }
}

// Try multiple RSS feeds
async function scrapeMultipleRSSFeeds() {
    const rssFeeds = [
        'https://www.theverge.com/rss/index.xml',
        'https://www.theverge.com/rss/front-page',
        'https://feeds.feedburner.com/TheVerge'
    ];
    
    const allArticles = [];
    
    for (const feedUrl of rssFeeds) {
        try {
            console.log(`Trying RSS feed: ${feedUrl}`);
            const response = await axios.get(feedUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader/1.0)'
                }
            });
            
            const $ = load(response.data, { xmlMode: true });
            
            $('item').each((index, element) => {
                const $element = $(element);
                const title = $element.find('title').text().trim();
                const link = $element.find('link').text().trim();
                const pubDate = $element.find('pubDate').text().trim();
                
                if (title && link) {
                    const publishDate = new Date(pubDate);
                    
                    if (publishDate >= new Date('2022-01-01')) {
                        allArticles.push({
                            title,
                            url: link,
                            publishDate,
                            source: `The Verge (RSS: ${feedUrl.split('/').pop()})`
                        });
                    }
                }
            });
            
            console.log(`Found ${allArticles.length} articles so far from this feed`);
            
        } catch (error) {
            console.log(`RSS feed ${feedUrl} failed: ${error.message}`);
        }
    }
    
    // Remove duplicates and sort
    const uniqueArticles = allArticles.filter((article, index, self) => 
        index === self.findIndex(a => a.url === article.url)
    );
    
    uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    
    console.log(`Total unique articles from all RSS feeds: ${uniqueArticles.length}`);
    return uniqueArticles;
}

// Function to get articles with caching and multiple fallbacks
async function getArticles() {
    const now = Date.now();
    
    if (!lastFetchTime || (now - lastFetchTime) > CACHE_DURATION || articles.length === 0) {
        console.log('Cache expired or empty, fetching fresh articles...');
        
        // Try main scraping first
        articles = await scrapeVergeArticles();
        
        // If main scraping gives us very few results, try RSS feeds
        if (articles.length < 10) {
            console.log(`Main scraping only found ${articles.length} articles, trying RSS feeds...`);
            const rssArticles = await scrapeMultipleRSSFeeds();
            
            // Combine and deduplicate
            const combined = [...articles, ...rssArticles];
            articles = combined.filter((article, index, self) => 
                index === self.findIndex(a => a.url === article.url)
            );
            
            // Sort by date
            articles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
        }
        
        lastFetchTime = now;
        console.log(`Final article count: ${articles.length}`);
    } else {
        console.log(`Using cached articles (${articles.length} total)`);
    }
    
    return articles;
}

// API endpoint to get articles
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await getArticles();
        res.json({
            success: true,
            count: articles.length,
            articles: articles
        });
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch articles'
        });
    }
});

// Enhanced debug endpoint
app.get('/debug', async (req, res) => {
    try {
        const response = await axios.get('https://www.theverge.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const $ = load(response.data);
        const title = $('title').text();
        const h1Count = $('h1').length;
        const h2Count = $('h2').length;
        const h3Count = $('h3').length;
        const h4Count = $('h4').length;
        const linkCount = $('a[href]').length;
        const articleCount = $('article').length;
        
        // Find links with years
        const yearLinks = [];
        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('2024') || href.includes('2023') || href.includes('2022'))) {
                yearLinks.push({
                    href: href,
                    text: $(el).text().trim().substring(0, 100)
                });
            }
        });
        
        res.json({
            status: response.status,
            title: title,
            htmlLength: response.data.length,
            headingCounts: {
                h1: h1Count,
                h2: h2Count,
                h3: h3Count,
                h4: h4Count
            },
            linkCount: linkCount,
            articleCount: articleCount,
            yearLinksFound: yearLinks.length,
            sampleYearLinks: yearLinks.slice(0, 10),
            sampleHTML: response.data.substring(0, 2000)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Force refresh endpoint
app.get('/refresh', async (req, res) => {
    try {
        articles = [];
        lastFetchTime = null;
        
        const refreshArticles = await getArticles();
        
        res.json({
            success: true,
            message: 'Articles refreshed',
            count: refreshArticles.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/', async (req, res) => {
    try {
        const articles = await getArticles();
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Verge Title Aggregator</title>
    <style>
        body {
            font-family: 'Georgia', serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background-color: white;
            color: black;
            line-height: 1.6;
        }
        
        h1 {
            text-align: center;
            border-bottom: 2px solid black;
            padding-bottom: 10px;
            margin-bottom: 30px;
            font-size: 2.2em;
        }
        
        .article {
            margin-bottom: 20px;
            padding: 15px 0;
            border-bottom: 1px solid #ccc;
        }
        
        .article:last-child {
            border-bottom: none;
        }
        
        .article-title {
            font-size: 1.1em;
            margin-bottom: 5px;
        }
        
        .article-title a {
            color: black;
            text-decoration: none;
            font-weight: bold;
        }
        
        .article-title a:hover {
            text-decoration: underline;
        }
        
        .article-date {
            font-size: 0.9em;
            color: #666;
            font-style: italic;
        }
        
        .stats {
            text-align: center;
            margin-bottom: 30px;
            padding: 15px;
            background-color: #f5f5f5;
            border: 1px solid #ddd;
        }
        
        .button-container {
            text-align: center;
            margin: 20px 0;
        }
        
        .btn {
            display: inline-block;
            width: 150px;
            margin: 5px;
            padding: 10px;
            background-color: black;
            color: white;
            text-align: center;
            text-decoration: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
        }
        
        .btn:hover {
            background-color: #333;
        }
        
        .btn-secondary {
            background-color: #666;
        }
        
        .btn-secondary:hover {
            background-color: #888;
        }
        
        .loading {
            text-align: center;
            font-style: italic;
            color: #666;
        }
        
        .year-filter {
            text-align: center;
            margin: 20px 0;
        }
        
        .year-filter button {
            margin: 0 5px;
            padding: 5px 15px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            cursor: pointer;
        }
        
        .year-filter button.active {
            background: #333;
            color: white;
        }
    </style>
</head>
<body>
    <h1>The Verge Title Aggregator</h1>
    
    <div class="stats">
        <p><strong>${articles.length}</strong> articles found from January 1st, 2022 onwards</p>
        <p>Last updated: ${new Date().toLocaleString()}</p>
        <p>Cache expires: ${lastFetchTime ? new Date(lastFetchTime + CACHE_DURATION).toLocaleString() : 'N/A'}</p>
    </div>
    
    <div class="button-container">
        <button class="btn" onclick="location.reload()">Refresh Page</button>
        <a href="/refresh" class="btn btn-secondary">Force Refresh Articles</a>
        <a href="/debug" class="btn btn-secondary" target="_blank">Debug Info</a>
        <a href="/api/articles" class="btn btn-secondary" target="_blank">JSON API</a>
    </div>
    
    <div class="year-filter">
        <button onclick="filterByYear('all')" class="active" id="filter-all">All Years</button>
        <button onclick="filterByYear('2025')" id="filter-2025">2025</button>
        <button onclick="filterByYear('2024')" id="filter-2024">2024</button>
        <button onclick="filterByYear('2023')" id="filter-2023">2023</button>
        <button onclick="filterByYear('2022')" id="filter-2022">2022</button>
    </div>
    
    <div id="articles">
        ${articles.length === 0 ? 
            '<p class="loading">No articles found. This could be due to anti-scraping measures. Try the Debug Info or Force Refresh buttons, or check the server console for detailed logs.</p>' :
            articles.map(article => `
                <div class="article" data-year="${article.publishDate.getFullYear()}">
                    <div class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer">
                            ${article.title}
                        </a>
                    </div>
                    <div class="article-date">
                        ${article.publishDate.toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                        })}
                    </div>
                </div>
            `).join('')
        }
    </div>
    
    <script>
        function filterByYear(year) {
            const articles = document.querySelectorAll('.article');
            const buttons = document.querySelectorAll('.year-filter button');
            
            // Update button states
            buttons.forEach(btn => btn.classList.remove('active'));
            document.getElementById('filter-' + year).classList.add('active');
            
            // Filter articles
            articles.forEach(article => {
                if (year === 'all' || article.dataset.year === year) {
                    article.style.display = 'block';
                } else {
                    article.style.display = 'none';
                }
            });
        }
        
        // Auto-refresh every 30 minutes
        setTimeout(() => {
            location.reload();
        }, 30 * 60 * 1000);
    </script>
</body>
</html>`;
        
        res.send(html);
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send(`
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h1>Error</h1>
                    <p>Failed to load articles: ${error.message}</p>
                    <button onclick="location.reload()">Retry</button>
                </body>
            </html>
        `);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        articlesCount: articles.length,
        lastFetch: lastFetchTime ? new Date(lastFetchTime).toISOString() : null
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`The Verge Title Aggregator running on http://localhost:${PORT}`);
    console.log('Initial article fetch will happen on first request...');
    console.log('Available endpoints:');
    console.log('  - http://localhost:3000/ (main page)');
    console.log('  - http://localhost:3000/debug (debug info)');
    console.log('  - http://localhost:3000/api/articles (JSON API)');
    console.log('  - http://localhost:3000/refresh (force refresh)');
    console.log('  - http://localhost:3000/health (health check)');
});

export default app;