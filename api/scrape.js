import * as cheerio from 'cheerio';

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

async function scrapeDetailedPage(url) {
  // This function correctly scrapes the individual product pages.
  // It has been updated to handle price variations and remains unchanged.
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    if (!response.ok) return null;

    const text = await response.text();
    const $ = cheerio.load(text);

    const productName = $('h1.list-title')?.text().trim() || 'N/A';
    const price = $('span.price_normal b').first().text().trim() || 'N/A';
    const sellerName = $('div.business-name').first().text().trim() || 'N/A';

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
      const labelNode = $(element);
      const labelText = labelNode.text().trim().replace(':', '');
      const valueNode = labelNode.next('.ad_det_children');

      if (details.hasOwnProperty(labelText) && valueNode.length > 0) {
        details[labelText] = valueNode.text().trim();
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

    const urls = [];
    
    // --- FINAL CORRECTED LOGIC: Replicates your original logic precisely ---

    // 1. Find the specific header panel for "Listings" or "Search Results"
    const targetPanel = $('.search-right-head-panel').filter((i, el) => {
        const panelText = $(el).text().trim();
        return panelText === 'Listings' || panelText.includes('Search Results');
    }).first();

    // 2. If the panel is found, get all sibling elements between it and the next panel.
    if (targetPanel.length > 0) {
        // nextUntil() is the correct Cheerio function to replicate the browser's logic.
        // It selects all sibling elements AFTER the targetPanel UNTIL it hits the next panel.
        const contentInSection = targetPanel.nextUntil('.search-right-head-panel');
        
        // 3. Find the product links only within that specific section of content.
        contentInSection.find('.tiled_results_container a.equip_link').each((i, el) => {
            const link = $(el).attr('href');
            if (link) {
                const fullUrl = link.startsWith('http') ? link : `https://www.machines4u.com.au${link}`;
                urls.push(fullUrl);
            }
        });
    }
    
    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) {
      return res.status(200).json({ data: [], message: "Could not find any products under a 'Listings' or 'Search Results' header." });
    }
    
    const scrapePromises = uniqueUrls.map(url => scrapeDetailedPage(url));
    const allData = (await Promise.all(scrapePromises)).filter(item => item !== null);

    res.status(200).json({ data: allData });

  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: `An error occurred: ${error.message}` });
  }
}
