/**
 * Web Scraper Module
 * Crawls and extracts cleaned text content from website URLs using axios and cheerio.
 */

const axios = require('axios');
const cheerio = require('cheerio');
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
 * Extracts valid internal links from the HTML page that share the same origin host.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} baseUrl
 * @returns {string[]} List of normalized internal URLs
 */
function extractInternalLinks($, baseUrl) {
  const links = new Set();
  const baseParsed = new URL(baseUrl);

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl);
      // Ensure same hostname and HTTP/HTTPS protocol
      if (
        resolved.hostname === baseParsed.hostname &&
        ['http:', 'https:'].includes(resolved.protocol)
      ) {
        // Remove hash fragments and query tracking params if appropriate
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
  });

  return Array.from(links);
}

/**
 * Scrapes a website starting from the main URL up to maxPages.
 *
 * @param {string} startUrl - Initial entrypoint URL
 * @param {number} [maxPages=10] - Maximum number of internal pages to scrape
 * @returns {Promise<Array<{ url: string, title: string, content: string, wordCount: number }>>}
 */
async function scrapeWebsite(startUrl, maxPages = 10) {
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
      console.warn(`⚠️ Failed to scrape page ${currentUrl}: ${error.message}`);
      // Continue gracefully with other queued pages
    }
  }

  return scrapedPages;
}

module.exports = {
  scrapeWebsite
};
