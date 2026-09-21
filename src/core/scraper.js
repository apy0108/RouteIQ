/**
 * Web Scraper Module
 * Crawls and extracts cleaned text content from website URLs using axios + cheerio.
 * Automatically falls back to Playwright headless Chromium for JavaScript-rendered SPAs/websites.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { URL } = require('url');

/**
 * Normalizes and cleans text extracted from HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  return text
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/(Cookie Policy|Privacy Policy|Terms of Service|All rights reserved|Accept All Cookies|Manage Cookies)/gi, '')
    .trim();
}

/**
 * Filters and normalizes a list of URLs to retain only valid internal links sharing the same origin host.
 *
 * @param {string[]} rawLinks
 * @param {string} baseUrl
 * @returns {string[]} List of normalized internal URLs
 */
function filterInternalLinks(rawLinks, baseUrl) {
  const links = new Set();
  const baseParsed = new URL(baseUrl);

  for (const href of rawLinks) {
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl);
      // Ensure same hostname and HTTP/HTTPS protocol
      if (
        resolved.hostname === baseParsed.hostname &&
        ['http:', 'https:'].includes(resolved.protocol)
      ) {
        resolved.hash = '';
        const cleanUrl = resolved.toString();

        // Avoid common static asset extensions
        if (!cleanUrl.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|css|js|woff|woff2)$/i)) {
          links.add(cleanUrl);
        }
      }
    } catch {
      // Ignore invalid URL formats
    }
  }

  return Array.from(links);
}

/**
 * Extracts valid internal links from Cheerio DOM instance.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} baseUrl
 * @returns {string[]} List of normalized internal URLs
 */
function extractInternalLinks($, baseUrl) {
  const rawHrefs = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) rawHrefs.push(href);
  });
  return filterInternalLinks(rawHrefs, baseUrl);
}

/**
 * Scrapes website using axios and Cheerio (fast, for static HTML pages).
 *
 * @param {string} startUrl - Initial entrypoint URL
 * @param {number} [maxPages=10] - Maximum number of internal pages to scrape
 * @returns {Promise<Array<{ url: string, title: string, content: string, wordCount: number }>>}
 */
async function scrapeWithCheerio(startUrl, maxPages = 10) {
  const visited = new Set();
  const queue = [startUrl];
  const scrapedPages = [];

  const axiosInstance = axios.create({
    timeout: 10000,
    headers: {
      'User-Agent': 'RouteIQBot/1.0 (+https://routeiq.local/bot)'
    }
  });

  while (queue.length > 0 && scrapedPages.length < maxPages) {
    const currentUrl = queue.shift();
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const pageIndex = scrapedPages.length + 1;
    console.log(`Scraping page ${pageIndex}/${maxPages}: ${currentUrl}`);

    try {
      const response = await axiosInstance.get(currentUrl);
      const contentType = response.headers['content-type'] || '';

      if (!contentType.includes('text/html')) {
        continue;
      }

      const $ = cheerio.load(response.data);

      // Remove script, styles, header, footer, navigation, and advertisement noise
      $('script, style, noscript, nav, footer, header, aside, iframe, svg, form, .cookie-banner, #cookie-consent, .ads').remove();

      const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled Page';
      const rawBodyText = $('body').text();
      const cleanedContent = cleanText(rawBodyText);

      // Calculate word count
      const words = cleanedContent.split(/\s+/).filter(Boolean);
      const wordCount = words.length;

      // Skip pages with less than 50 words
      if (wordCount >= 50) {
        scrapedPages.push({
          url: currentUrl,
          title: pageTitle,
          content: cleanedContent,
          wordCount
        });
      }

      // Extract more internal links if we haven't reached maxPages
      if (scrapedPages.length < maxPages) {
        const internalLinks = extractInternalLinks($, currentUrl);
        for (const link of internalLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to scrape page ${currentUrl} with Cheerio: ${error.message}`);
    }
  }

  return scrapedPages;
}

/**
 * Scrapes website using Playwright headless Chromium for JavaScript-rendered applications.
 *
 * @param {string} startUrl - Initial entrypoint URL
 * @param {number} [maxPages=10] - Maximum number of internal pages to scrape
 * @returns {Promise<Array<{ url: string, title: string, content: string, wordCount: number }>>}
 */
async function scrapeWithPlaywright(startUrl, maxPages = 10) {
  const visited = new Set();
  const queue = [startUrl];
  const scrapedPages = [];

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
      userAgent: 'RouteIQBot/1.0 (+https://routeiq.local/bot)'
    });

    const page = await context.newPage();

    while (queue.length > 0 && scrapedPages.length < maxPages) {
      const currentUrl = queue.shift();
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      const pageIndex = scrapedPages.length + 1;
      console.log(`[Playwright] Scraping page ${pageIndex}/${maxPages}: ${currentUrl}`);

      try {
        // Navigate and wait for networkidle, with fallback to domcontentloaded if network stays busy
        try {
          await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
        } catch {
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }

        // Extract DOM content and links inside the browser context
        const extracted = await page.evaluate(() => {
          // Remove scripts, styles, header, footer, navigation, and advertisement elements
          const elementsToRemove = document.querySelectorAll(
            'script, style, noscript, nav, footer, header, aside, iframe, svg, form, .cookie-banner, #cookie-consent, .ads'
          );
          elementsToRemove.forEach((el) => el.remove());

          const title = document.title || document.querySelector('h1')?.innerText || 'Untitled Page';
          const bodyText = document.body ? document.body.innerText || document.body.textContent || '' : '';

          const links = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href);

          return {
            title: title.trim(),
            bodyText,
            links
          };
        });

        const cleanedContent = cleanText(extracted.bodyText);
        const words = cleanedContent.split(/\s+/).filter(Boolean);
        const wordCount = words.length;

        if (wordCount >= 50) {
          scrapedPages.push({
            url: currentUrl,
            title: extracted.title || 'Untitled Page',
            content: cleanedContent,
            wordCount
          });
        }

        if (scrapedPages.length < maxPages) {
          const internalLinks = filterInternalLinks(extracted.links, currentUrl);
          for (const link of internalLinks) {
            if (!visited.has(link) && !queue.includes(link)) {
              queue.push(link);
            }
          }
        }
      } catch (pageError) {
        console.warn(`⚠️ Failed to scrape page ${currentUrl} with Playwright: ${pageError.message}`);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return scrapedPages;
}

/**
 * Scrapes a website starting from the main URL up to maxPages.
 * Attempts Cheerio first; falls back to Playwright if extracted content is under 100 words.
 *
 * @param {string} startUrl - Initial entrypoint URL
 * @param {number} [maxPages=10] - Maximum number of internal pages to scrape
 * @returns {Promise<Array<{ url: string, title: string, content: string, wordCount: number }>>}
 */
async function scrapeWebsite(startUrl, maxPages = 10) {
  console.log('🔍 Trying Cheerio scraper...');
  let pages = await scrapeWithCheerio(startUrl, maxPages);

  const totalWords = pages.reduce((sum, p) => sum + (p.wordCount || 0), 0);

  // If content extracted is less than 100 words total, retry using Playwright headless browser
  if (totalWords < 100) {
    console.log('⚠️  Low content detected, switching to Playwright...');
    console.log('🎭 Using Playwright for JavaScript-rendered site...');

    try {
      const playwrightPages = await scrapeWithPlaywright(startUrl, maxPages);
      const playwrightWords = playwrightPages.reduce((sum, p) => sum + (p.wordCount || 0), 0);

      // Use Playwright results if they yielded more content or valid pages
      if (playwrightPages.length > 0 && playwrightWords >= totalWords) {
        pages = playwrightPages;
      }
    } catch (playwrightError) {
      console.warn(`⚠️ Playwright fallback failed: ${playwrightError.message}`);
    }
  }

  return pages;
}

module.exports = {
  scrapeWebsite
};
