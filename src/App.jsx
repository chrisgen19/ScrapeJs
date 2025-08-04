import React, { useState } from 'react';
import Papa from 'papaparse'; // Using papaparse for robust CSV conversion

// Re-using your filename generation logic from popup.js
function generateFilenameFromUrl(url) {
  try {
    const urlObject = new URL(url);
    const pathParts = urlObject.pathname.split('/').filter(part => part);
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let name = 'machines4u-scrape';
    if (pathParts.length >= 2) {
      name = `${pathParts[pathParts.length - 2]}-${pathParts[pathParts.length - 1]}`;
    } else if (pathParts.length === 1) {
      name = pathParts[0];
    }
    return `${name}-${dateString}.csv`;
  } catch {
    const today = new Date().toISOString().split('T')[0];
    return `machines4u-scrape-${today}.csv`;
  }
}

function App() {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [status, setStatus] = useState('Ready');
  const [scrapedData, setScrapedData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleUrlChange = (e) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    if (newUrl) {
      setFilename(generateFilenameFromUrl(newUrl));
    } else {
      setFilename('');
    }
  };

  const handleScrape = async () => {
    if (!url) {
      setStatus('Please enter a URL first.');
      return;
    }
    setIsLoading(true);
    setStatus('Sending request to server...');
    setScrapedData([]);

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Something went wrong');
      }

      setScrapedData(result.data);
      setStatus(`Scraping Complete! ${result.data.length} items found.`);

    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (scrapedData.length === 0) return;

    // Use PapaParse to convert JSON to CSV string
    const csv = Papa.unparse(scrapedData);

    // Create a Blob from the CSV string
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);

    link.setAttribute('href', blobUrl);
    link.setAttribute('download', filename || 'data.csv');
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container">
      <h3>Machines4U Scraper 🚀</h3>
      <p>Enter a Machines4U search or listing URL to begin.</p>
      
      <div className="input-group">
        <label htmlFor="urlInput">URL to Scan:</label>
        <input
          id="urlInput"
          type="text"
          value={url}
          onChange={handleUrlChange}
          placeholder="https://www.machines4u.com.au/..."
          disabled={isLoading}
        />
      </div>

      <button onClick={handleScrape} disabled={isLoading || !url}>
        {isLoading ? 'Scraping...' : 'Start Scraping'}
      </button>

      <div className="status">{status}</div>

      {scrapedData.length > 0 && !isLoading && (
         <div className="download-section">
            <div className="input-group">
                <label htmlFor="filenameInput">Filename:</label>
                <input
                    id="filenameInput"
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="Enter filename..."
                />
            </div>
            <button onClick={handleDownload} className="download-btn">
                Download CSV ({scrapedData.length} items)
            </button>
        </div>
      )}
    </div>
  );
}

export default App;