import * as cheerio from 'cheerio';

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

async function scrapeDetailedPage(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    if (!response.ok) return null;

    const text = await response.text();
    const $ = cheerio.load(text);

    const productName = $('h1.list-title')?.text().trim() || 'N/A';
    const price = $('span.price_normal b').first().text().trim() || 'N/A';
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
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    const text = await response.text();
    const $ = cheerio.load(text);

    // --- REPLICATED LOGIC FROM content.js ---

    // 1. Find the relevant section header.
    const targetPanel = $('.search-right-head-panel').filter((i, el) => {
        const panelText = $(el).text().trim();
        return panelText.includes('Listings') || panelText.includes('Search Results');
    }).first();
    
    let targetTiles = [];
    if (targetPanel.length > 0) {
        // 2. Precisely find all product tiles between this header and the next one.
        // nextUntil() selects all sibling elements between our panel and the next panel.
        const contentBetweenHeaders = targetPanel.nextUntil('.search-right-head-panel');
        
        // From that selection, find all the product containers.
        targetTiles = contentBetweenHeaders.find('.tiled_results_container');
    } else {
        // Fallback or error if the main "Listings" header isn't found
        return res.status(200).json({ data: [], message: "Could not find the 'Listings' or 'Search Results' section header." });
    }

    if (targetTiles.length === 0) {
        return res.status(200).json({ data: [], message: "Found the 'Listings' section, but no products were inside." });
    }

    // 3. Extract the unique URLs from the correctly filtered tiles.
    const urls = [];
    targetTiles.each((i, tile) => {
        const link = $(tile).find('a.equip_link').attr('href');
        if (link) {
            const fullUrl = link.startsWith('http') ? link : `https://www.machines4u.com.au${link}`;
            urls.push(fullUrl);
        }
    });
    const uniqueUrls = [...new Set(urls)];
    
    // 4. Scrape each unique URL.
    const scrapePromises = uniqueUrls.map(url => scrapeDetailedPage(url));
    const allData = (await Promise.all(scrapePromises)).filter(item => item !== null);

    // 5. Send the final compiled data back.
    res.status(200).json({ data: allData });

  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: `An error occurred: ${error.message}` });
  }
}