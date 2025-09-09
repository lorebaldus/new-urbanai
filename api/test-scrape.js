import axios from 'axios';
export default async function handler(req, res) {
    try {
        const response = await
axios.post('https://urbanator.it/api/scrape', {
              url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:dec
  reto.legislativo:2016-04-18;50!vig=',
              type: 'normattiva'
          });
          res.json(response.data);

      } catch (error) {
          res.status(500).json({
              error: error.message
          });
      }
  }
