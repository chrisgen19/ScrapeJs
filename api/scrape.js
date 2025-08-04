import * as cheerio from 'cheerio';

// Helper function to scrape a single product detail page
async function scrapeDetailedPage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    const text = await response.text();
    const $ = cheerio.load(text); // Use Cheerio to parse the HTML

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

// This is the main Vercel Serverless Function handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests are allowed' });
  }

  const { url: pageUrl } = req.body;

  if (!pageUrl || !pageUrl.startsWith('https://www.machines4u.com.au')) {
      return res.status(400).json({ error: 'A valid Machines4U URL is required.' });
  }

  try {
    // 1. Fetch the main search/listing page
    const response = await fetch(pageUrl);
    const text = await response.text();
    const $ = cheerio.load(text);

    // 2. Find all unique product links
    const urls = [];
    $('.tiled_results_container a.equip_link').each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
            urls.push(href);
        }
    });
    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) {
        return res.status(404).json({ error: "Could not find any product listings on the provided URL." });
    }

    // 3. Scrape each product page concurrently
    const scrapePromises = uniqueUrls.map(url => scrapeDetailedPage(url));
    const allData = (await Promise.all(scrapePromises)).filter(item => item !== null); // Filter out any failed scrapes

    // 4. Send the final data back to the frontend
    res.status(200).json({ data: allData });

  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: `An error occurred: ${error.message}` });
  }
}