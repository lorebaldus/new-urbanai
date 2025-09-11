// Esempio di implementazione
  export default async function handler(req, res) {
      const { source, maxDocuments = 100, startPage = 1 } = req.body;

      if (source === 'normattiva_edilizia') {
          // Scrapa tutte le norme edilizie da Normattiva
          const urls = await discoverNormattiveUrls('edilizia', maxDocuments);
          const results = await processBatch(urls);
          res.json(results);
      }

      if (source === 'gazzetta_decreti') {
          // Scrapa decreti dalla Gazzetta Ufficiale
          const urls = await discoverGazzettaUrls('decreti', maxDocuments, startPage);
          const results = await processBatch(urls);
          res.json(results);
      }
  }
