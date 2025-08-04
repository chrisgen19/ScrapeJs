// --- DIAGNOSTIC CODE ---
// This code will not scrape. It will return the raw HTML from the target URL
// so we can see if we are being blocked.

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

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

    // Get the response as raw text
    const text = await response.text();

    // Send the raw text back to the user instead of JSON
    res.setHeader('Content-Type', 'text/plain'); // Set header to plain text
    res.status(200).send(text);

  } catch (error) {
    res.status(500).json({ error: `An error occurred: ${error.message}` });
  }
}