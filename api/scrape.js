import * as cheerio from 'cheerio';

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

async function scrapeDetailedPage(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        return null;
    }

    const text = await response.text();
    const $ = cheerio.load(text);

    const productName = $('h1.list-title')?.text().trim() || 'N/A';
    
    // --- Copied robust price extraction logic ---
    let price = 'N/A';
    const priceElement = $('span.price_normal b').first();
    if (priceElement.length > 0) {
      price = priceElement.text().trim();
    } else {
      const altPriceElement = $('span.price_gstex b').first();
      if (altPriceElement.length > 0) {
        price = altPriceElement.text().trim();
      } else {
        const containerPrice = $('.price_container').first().text().trim();
        if (containerPrice) {
          const priceMatch = containerPrice.match(/\$[\d,]+/);
          price = priceMatch ? priceMatch[0] : containerPrice;
        }
      }
    }
    
    const sellerName = $('.business-name').first().text().trim() || 'N/A';

    let location = 'N/A';
    const locationElement = $('a[onclick="showAdvertMap()"]');
    if (locationElement.length > 0) {
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
    let foundListingsSection = false;
    let stopCollecting = false;

    // --- Copied robust section finding logic ---
    $('.search-right-column > *').each((index, element) => {
        // If we've started collecting and hit another header, stop.
        if (stopCollecting) return;

        const $el = $(element);

        // Check for section headers
        if ($el.hasClass('search-right-head-panel')) {
            const sectionText = $el.text().trim();
            
            if (sectionText === 'Listings' || sectionText.includes('Search Results')) {
                foundListingsSection = true; // Start collecting from elements AFTER this header
            } else if (foundListingsSection) {
                // We were in the right section, but we found a new header, so we stop.
                stopCollecting = true;
            }
        }
        
        // If we are in the correct section, find product links within the current element
        if (foundListingsSection && !stopCollecting) {
            $el.find('.tiled_results_container a.equip_link').each((i, linkEl) => {
                const link = $(linkEl).attr('href');
                if (link) {
                    const fullUrl = link.startsWith('http') ? link : `https://www.machines4u.com.au${link}`;
                    urls.push(fullUrl);
                }
            });
        }
    });

    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) {
      return res.status(200).json({ data: [], message: "No products found in the 'Listings' or 'Search Results' section." });
    }
    
    const allData = [];
    for (const url of uniqueUrls) {
        const data = await scrapeDetailedPage(url);
        if (data) {
            allData.push(data);
        }
        // Optional delay to be kinder to their server
        await new Promise(resolve => setTimeout(resolve, 100)); 
    }

    res.status(200).json({ data: allData });

  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: `An error occurred: ${error.message}` });
  }
}