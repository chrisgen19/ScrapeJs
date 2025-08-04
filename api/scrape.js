import * as cheerio from 'cheerio';

// This User-Agent makes our request look like it's from a real browser.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

async function scrapeDetailedPage(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT } // FIX 1: Add User-Agent to every request
    });
    if (!response.ok) return null;

    const text = await response.text();
    const $ = cheerio.load(text);

    // This detail page scraping logic seems robust and is kept the same.
    const productName = $('h1.list-title')?.text().trim() || 'N/A';
    const price = $('span.price_normal b')?.text().trim() || 'N/A';
    const sellerName = $('.business-name')?.text().trim() || 'N/A';

    let location = 'N/A';
    const locationElement = $('a[onclick="showAdvertMap()"]');
    if (locationElement.length) {
        const fullLocationText = locationElement.text().trim();
        const locationParts = fullLocationText.split(',');
        location = locationParts.length > 1 ? locationParts[locationParts.length - 1].trim() : fullLocationText;
    }

    const details = {
      'Condition': 'N/A', 'Category': 'N/A', 'Make': 'N/A',
      'Model': 'N/A', 'Year': 'N/A', 'Type of Sale': 'N/A'
    };

    $('.ad_det_children').each((i, element) => {
      const label = $(element).text().trim().replace(':', '');
      if (details.hasOwnProperty(label)) {
        details[label] = $(element).next().text().trim();
      }
    });

    return {
      "Brand": details.Make, "Model": details.Model, "Condition": details.Condition,
      "Location": location, "Seller": sellerName, "Year": details.Year,
      "Price": price, "URL": url, "AD Title": productName
    };
  } catch (error) {
    console.error(`Error scraping detail page ${url}:`, error);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests are allowed' });
  }

  const { url: pageUrl } = req.body;

  if (!pageUrl || !pageUrl.startsWith('https://www.machines4u.com.au')) {
    return res.status(400).json({ error: 'A valid Machines4U URL is required.' });
  }

  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT } // FIX 1: Add User-Agent to the main request
    });
    const text = await response.text();
    const $ = cheerio.load(text);

    // FIX 2: Re-implementing your original, more robust logic for finding listings.
    let targetTiles = [];
    const targetPanel = $('.search-right-head-panel').filter((i, el) => {
        const text = $(el).text().trim();
        return text === 'Listings' || text.includes('Search Results');
    }).first();

    if (targetPanel.length > 0) {
        // Find all tiled_results_container elements that are siblings after the target panel
        // and before the next panel.
        targetPanel.nextUntil('.search-right-head-panel').filter('.tiled_results_container').each((i, el) => {
            targetTiles.push($(el));
        });
    }

    if (targetTiles.length === 0) {
        // Fallback to the simpler method if the robust one fails
        $('.tiled_results_container').each((i, el) => {
            targetTiles.push($(el));
        });
    }

    const urls = [];
    targetTiles.forEach($tile => {
        const href = $tile.find('a.equip_link').attr('href');
        if (href) {
            urls.push(href);
        }
    });
    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) {
      return res.status(200).json({ data: [], message: "Could not find any product links. The site structure may have changed or the page is protected." });
    }
    
    const scrapePromises = uniqueUrls.map(url => scrapeDetailedPage(url));
    const allData = (await Promise.all(scrapePromises)).filter(item => item !== null);

    res.status(200).json({ data: allData });

  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: `An error occurred: ${error.message}` });
  }
}