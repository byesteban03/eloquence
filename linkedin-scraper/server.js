const express = require('express')
const cors = require('cors')
const { chromium } = require('playwright')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => res.json({ status: 'Eloquence LinkedIn Scraper OK' }))

app.post('/search', async (req, res) => {
  const { company, titles } = req.body
  const cookie = process.env.LINKEDIN_COOKIE

  if (!cookie) return res.status(401).json({ error: 'Cookie LinkedIn manquant' })

  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    await context.addCookies([{
      name: 'li_at',
      value: cookie,
      domain: '.linkedin.com',
      path: '/'
    }])

    const page = await context.newPage()
    const contacts = []
    const searchTitles = titles || ['directeur communication', 'responsable evenementiel', 'directeur marketing']

    for (const title of searchTitles.slice(0, 2)) {
      await page.waitForTimeout(2000 + Math.random() * 2000)
      const query = encodeURIComponent(`${title} ${company}`)
      await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${query}`)
      await page.waitForTimeout(3000)

      const results = await page.evaluate(() => {
        const cards = document.querySelectorAll('.entity-result__item')
        return Array.from(cards).slice(0, 3).map(card => ({
          nom: card.querySelector('.entity-result__title-text a')?.innerText?.trim(),
          titre: card.querySelector('.entity-result__primary-subtitle')?.innerText?.trim(),
          entreprise: card.querySelector('.entity-result__secondary-subtitle')?.innerText?.trim(),
          linkedin_url: card.querySelector('a.app-aware-link')?.href,
          photo_url: card.querySelector('img')?.src
        }))
      })

      contacts.push(...results.filter(r => r.nom && r.linkedin_url))
    }

    await browser.close()
    const unique = contacts.filter((c, i, arr) => arr.findIndex(x => x.linkedin_url === c.linkedin_url) === i)
    res.json({ success: true, contacts: unique.slice(0, 3) })

  } catch (e) {
    if (browser) await browser.close()
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Scraper LinkedIn démarré sur port ${PORT}`))
