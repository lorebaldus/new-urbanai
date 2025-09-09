export default async function handler(req, res) {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // Chiama la nostra API di scrape
          const response = await fetch(`${req.headers.origin || 
  'https://urbanator.it'}/api/scrape`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato
  :decreto.legislativo:2016-04-18;50!vig=',
                  type: 'normattiva'
              })
          });

          const data = await response.json();
          res.json(data);

      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  }
