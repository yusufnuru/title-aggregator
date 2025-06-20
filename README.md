# The Verge Title Aggregator

A simple Node.js web scraper that collects article titles from The Verge website.

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install express axios cheerio
   ```

2. **Run the app**:
   ```bash
   node app.js
   ```

3. **Open browser**: `http://localhost:3000`

## Features

- Scrapes articles from The Verge homepage and RSS feeds
- Web interface with year filtering (2022-2025)
- JSON API at `/api/articles`
- 30-minute caching to avoid overloading the server
- Auto-refresh every 30 minutes

## API Endpoints

- **GET** `/` - Main web interface
- **GET** `/api/articles` - JSON API with all articles
- **GET** `/refresh` - Force refresh articles
- **GET** `/debug` - Debug information
- **GET** `/health` - Server health check

## Configuration

- Set `PORT` environment variable (default: 3000)
- Cache duration: 30 minutes (configurable in code)

## How It Works

1. **Primary**: Scrapes The Verge homepage HTML
2. **Fallback**: Uses RSS feeds if main scraping fails
3. **Filters**: Only shows articles from 2022 onwards
4. **Deduplicates**: Removes duplicate articles by URL
5. **Caches**: Stores results for 30 minutes

## Troubleshooting

- **No articles?** Check `/debug` endpoint
- **Scraping blocked?** RSS feeds provide fallback
- **Performance issues?** Caching reduces server load

## Dependencies

- `express` - Web server
- `axios` - HTTP requests  
- `cheerio` - HTML parsing

## Note

For educational/personal use only. Respects The Verge's content and includes appropriate delays to avoid overwhelming their servers.